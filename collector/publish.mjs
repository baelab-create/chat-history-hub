import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateRegistry} from '../device-catalog.mjs';
const exec=promisify(execFile);
export async function publishDevice(config,envelope,dir){
 const repo=config.repository||'baelab-create/chat-history-hub',branch='catalog-data';
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('invalid_repository');
 async function api(path,method='GET',body){
  const args=['api','repos/'+repo+'/'+path];let input;
  if(method!=='GET')args.push('--method',method);
  if(body){input=join(dir,'github-request-'+randomUUID()+'.json');await writeFile(input,JSON.stringify(body),{mode:0o600});args.push('--input',input)}
  try{return JSON.parse((await exec(config.gh||'gh',args,{windowsHide:true,timeout:20000,maxBuffer:10000000})).stdout)}
  catch{throw Error('github_publish_failed')}
  finally{if(input)await rm(input,{force:true})}
 }
 // Data updates never trigger a GitHub Pages deployment.
 let ref;try{ref=await api('git/ref/heads/'+branch)}catch{
  const main=await api('git/ref/heads/main');
  try{ref=await api('git/refs','POST',{ref:'refs/heads/'+branch,sha:main.object.sha})}
  catch{ref=await api('git/ref/heads/'+branch)}
 }
 for(let attempt=0;attempt<3;attempt++){
  const head=(attempt?await api('git/ref/heads/'+branch):ref).object.sha;
  const commit=await api('git/commits/'+head);
  const tree=await api('git/trees/'+commit.tree.sha+'?recursive=1');
  if(tree.truncated)throw Error('repository_tree_incomplete');
  const registry=tree.tree.find(f=>f.path==='devices/index.json');let ids=[];
  if(registry){const blob=await api('git/blobs/'+registry.sha);ids=validateRegistry(JSON.parse(Buffer.from(blob.content,'base64').toString('utf8')))}
  if(!ids.includes(envelope.deviceId))ids.push(envelope.deviceId);
  const nextTree=await api('git/trees','POST',{base_tree:commit.tree.sha,tree:[
   {path:'devices/'+envelope.deviceId+'.enc.json',mode:'100644',type:'blob',content:JSON.stringify(envelope)},
   {path:'devices/index.json',mode:'100644',type:'blob',content:JSON.stringify({version:1,devices:ids.sort()})}
  ]});
  const next=await api('git/commits','POST',{message:'Update encrypted title metadata',tree:nextTree.sha,parents:[head]});
  try{await api('git/refs/heads/'+branch,'PATCH',{sha:next.sha,force:false});return {commit:next.sha,branch}}
  catch{if(attempt===2)throw Error('concurrent_publish_failed')}
 }
}
