// Explicit user request only. No timers, UI automation, model calls or publishing.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {encryptDevice} from '../device-crypto.mjs';
import {normalizeSnapshot,accumulateDevice} from './metadata.mjs';
import {connectApp,titlesFromApp} from './app-source.mjs';
import {acquireLock} from './lock.mjs';
const exec=promisify(execFile);
export async function collectOnce(root,{signal=AbortSignal.timeout(85000)}={}){
 const dir=join(root,'private','collector');
 await mkdir(dir,{recursive:true,mode:0o700});
 const read=async(name,fallback)=>{try{return JSON.parse(await readFile(join(dir,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
 const save=async(name,data)=>{const path=join(dir,name),tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path)};
 const release=await acquireLock(join(dir,'manual.lock'));if(!release)throw Error('already_running');
 let client;const abort=()=>client?.close();signal.addEventListener('abort',abort,{once:true});
 try{
  const config=await read('config.json',null);if(!config?.recipient||!config?.deviceName)throw Error('not_configured');
  let identity=await read('identity.json',null);if(!identity){identity={deviceId:randomUUID()};await save('identity.json',identity)}
  const previous=await read('snapshot.json',null);
  let local=[],cloud=[],localError=null,sourceError=null;
  let localObservedAt=previous?.localObservedAt||null,cloudObservedAt=previous?.cloudObservedAt||null;
  try{
   local=JSON.parse((await exec(config.python||'python3',[join(root,'collector','read-local.py')],{windowsHide:true,timeout:15000,maxBuffer:5000000,signal,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}})).stdout);
   localObservedAt=new Date().toISOString();
  }catch{localError='local_source_unavailable'}
  try{
   signal.throwIfAborted();const old=await read('connection.json',{}),connection=await connectApp(old.pipe,signal);client=connection.client;
   const threadId=config.appThreadId||local[0]?.id;if(!threadId)throw Error('app_context_unavailable');
   const data=await client.read('list_threads',{limit:50},threadId);
   const names={};
   try{const p=await client.read('list_projects',{},threadId);for(const row of Array.isArray(p)?p:(p.projects||[])){const id=row.projectId||row.id,name=row.label||row.name;if(typeof id==='string'&&typeof name==='string')names[id]=name.slice(0,300)}}catch{}
   cloud=titlesFromApp(data,names);cloudObservedAt=new Date().toISOString();
   await save('connection.json',{pipe:connection.pipe});
  }catch(e){sourceError=/^[a-z_]+$/.test(e.code||e.message)?e.code||e.message:'app_source_unavailable'}
  finally{client?.close();client=null}
  signal.throwIfAborted();if(localError&&sourceError)throw Error('all_sources_unavailable');
  const records=new Map(local.map(t=>[t.kind+':'+t.id,t]));
  for(const t of cloud){const old=records.get(t.kind+':'+t.id);if(!old||t.updatedAt>=old.updatedAt)records.set(t.kind+':'+t.id,t)}
  const snapshot=accumulateDevice(previous,normalizeSnapshot({schemaVersion:1,source:'desktop-app',deviceId:identity.deviceId,deviceName:config.deviceName,
   observedAt:new Date().toISOString(),localObservedAt,cloudObservedAt,cloudMode:'app-bridge',collectionMode:'manual',cloudState:sourceError?'unavailable':'connected',sourceError,items:[...records.values()]}));
  const envelope=await encryptDevice(snapshot,config.recipient);
  await save('snapshot.json',snapshot);await save('pending.enc.json',envelope);
  const report={version:1,success:true,envelope,localCount:local.length,cloudCount:cloud.filter(t=>t.kind==='chatgpt').length,localError,sourceError};
  await save('last-manual.json',{checkedAt:snapshot.observedAt,localCount:report.localCount,cloudCount:report.cloudCount,localError,sourceError});
  return report;
 }finally{client?.close();signal.removeEventListener('abort',abort);await release()}
}
