import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {encryptDevice} from '../device-crypto.mjs';
import {normalizeSnapshot,accumulateDevice} from './metadata.mjs';
import {validateRegistry} from '../device-catalog.mjs';
const exec=promisify(execFile),root=new URL('../',import.meta.url),dir=new URL('private/collector/',root);
await mkdir(dir,{recursive:true,mode:0o700});
const lock=new URL('sync.lock/',dir);
try{await mkdir(lock)}catch(e){if(e.code==='EEXIST'){console.error('Another sync is active. If a process crashed, remove private/collector/sync.lock after checking it.');process.exit(1)}throw e}
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
async function atomic(path,data){const temp=new URL(path.href+'.tmp');await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,path)}
try{
 const config=await read(new URL('config.json',dir),null);if(!config?.recipient||!config?.deviceName)throw Error('Configure private/collector/config.json with the public recipient key and device name first');
 let identity=await read(new URL('identity.json',dir),null);if(!identity){identity={deviceId:randomUUID()};await atomic(new URL('identity.json',dir),identity)}
 const result=await exec(config.python||'python3',[fileURLToPath(new URL('read-local.py',import.meta.url))],{timeout:30000,maxBuffer:20000000});
 const local=JSON.parse(result.stdout);const cloud=await read(new URL('cloud-observation.json',dir),{items:[]});
 const incoming=normalizeSnapshot({schemaVersion:1,source:'desktop-app',deviceId:identity.deviceId,deviceName:config.deviceName,observedAt:new Date().toISOString(),items:[...local,...cloud.items]});
 const previous=await read(new URL('snapshot.json',dir),null);
 const snapshot=accumulateDevice(previous,incoming);
 snapshot.cloudObservedAt=cloud.observedAt||null;
 const envelope=await encryptDevice(snapshot,config.recipient);
 await atomic(new URL('snapshot.json',dir),snapshot);
 await atomic(new URL('pending.enc.json',dir),envelope);
 if(process.argv.includes('--local-only')){console.log(JSON.stringify({success:true,local:local.length,cloud:cloud.items.length,uploaded:false}))}
 else{
  const gh=config.gh||'gh',repo=config.repository||'baelab-create/chat-history-hub';if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('Invalid repository');
  async function api(path,method='GET',body){const args=['api',`repos/${repo}/${path}`];if(method!=='GET')args.push('--method',method);let input;
   if(body){input=new URL('github-request.json',dir);await atomic(input,body);args.push('--input',fileURLToPath(input))}
   try{return JSON.parse((await exec(gh,args,{timeout:30000,maxBuffer:30000000})).stdout)}catch{throw Error('GitHub synchronization failed; encrypted pending snapshot retained')}finally{if(input)await rm(input,{force:true})}}
  let published=false;
  for(let attempt=0;attempt<5&&!published;attempt++){
   const head=(await api('git/ref/heads/main')).object.sha;
   const commit=await api('git/commits/'+head);
   const tree=await api('git/trees/'+commit.tree.sha+'?recursive=1');
   const registryFile=tree.tree.find(f=>f.path==='devices/index.json');
   if(!registryFile)throw Error('Deploy multi-device support before starting the collector');
   const blob=await api('git/blobs/'+registryFile.sha);
   const ids=validateRegistry(JSON.parse(Buffer.from(blob.content,'base64').toString('utf8')));
   if(!ids.includes(identity.deviceId))ids.push(identity.deviceId);
   const updates=[{path:`devices/${identity.deviceId}.enc.json`,mode:'100644',type:'blob',content:JSON.stringify(envelope)},{path:'devices/index.json',mode:'100644',type:'blob',content:JSON.stringify({version:1,devices:ids.sort()})}];
   const nextTree=await api('git/trees','POST',{base_tree:commit.tree.sha,tree:updates});
   const next=await api('git/commits','POST',{message:'Sync encrypted device catalog',tree:nextTree.sha,parents:[head]});
   try{await api('git/refs/heads/main','PATCH',{sha:next.sha,force:false});published=true}catch{if(attempt===4)throw Error('Concurrent updates prevented publishing; pending snapshot retained')}
  }
  await atomic(new URL('last-success.json',dir),{observedAt:snapshot.observedAt,localCount:local.length,cloudCount:cloud.items.length});
  console.log(JSON.stringify({success:true,local:local.length,cloud:cloud.items.length,uploaded:published}));
 }
}catch(e){console.error(JSON.stringify({success:false,reason:e.message,previousSnapshotRetained:true}));process.exitCode=1}
finally{await rm(lock,{recursive:true,force:true})}
