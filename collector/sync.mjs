import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {encryptDevice} from '../device-crypto.mjs';
import {normalizeSnapshot,accumulateDevice} from './metadata.mjs';
import {connectApp,titlesFromApp} from './app-source.mjs';
import {publishDevice} from './publish.mjs';
import {acquireLock} from './lock.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),dir=join(root,'private','collector');
const read=async(name,fallback)=>{try{return JSON.parse(await readFile(join(dir,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
async function atomic(name,data){const path=join(dir,name),tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path)}
await mkdir(dir,{recursive:true,mode:0o700});
const release=await acquireLock(join(dir,'run.lock'));
if(!release){console.log(JSON.stringify({skipped:'already_running'}));process.exit(0)}
let client;
try{
 const config=await read('config.json',null);if(!config?.recipient||!config?.deviceName)throw Error('collector_not_configured');
 let identity=await read('identity.json',null);
 if(!identity){identity={deviceId:randomUUID()};await atomic('identity.json',identity)}
 const previous=await read('snapshot.json',null),oldConnection=await read('connection.json',{});
 let local=[],localObservedAt=previous?.localObservedAt||null,localError=null;
 try{
  local=JSON.parse((await exec(config.python||'python3',[join(root,'collector','read-local.py')],{windowsHide:true,timeout:15000,maxBuffer:4000000})).stdout);
  localObservedAt=new Date().toISOString();
 }catch{localError='local_source_unavailable'}
 let cloud=[],cloudObservedAt=previous?.cloudObservedAt||null,cloudState='unavailable',sourceError=null;
 let projects=await read('projects.json',{names:{},observedAt:null});
 try{
  const connection=await connectApp(oldConnection.pipe);client=connection.client;
  const threadId=config.appThreadId||local[0]?.id;
  if(!threadId)throw Error('app_context_unavailable');
  const data=await client.read('list_threads',{limit:50},threadId);
  const observedAt=new Date().toISOString();
  if(!projects.observedAt||Date.now()-Date.parse(projects.observedAt)>600000){
   try{
    const response=await client.read('list_projects',{},threadId);
    const rows=Array.isArray(response)?response:(response.projects||[]);
    const names={...projects.names};
    for(const p of rows)if(typeof p.id==='string'&&typeof p.name==='string')names[p.id]=p.name.slice(0,300);
    for(const p of rows)if(typeof p.projectId==='string'&&typeof (p.label||p.name)==='string')names[p.projectId]=(p.label||p.name).slice(0,300);
    projects={names,observedAt};await atomic('projects.json',projects);
   }catch{}
  }
  cloud=titlesFromApp(data,projects.names);cloudObservedAt=observedAt;cloudState='connected';
  await atomic('connection.json',{pipe:connection.pipe});
 }catch(error){sourceError=/^[a-z_]+$/.test(error.code||error.message)?(error.code||error.message):'app_source_unavailable'}
 finally{client?.close();client=null}
 if(localError&&cloudState!=='connected')throw Error('all_sources_unavailable');
 const records=new Map(local.map(t=>[t.kind+':'+t.id,t]));
 for(const t of cloud){const old=records.get(t.kind+':'+t.id);if(!old||t.updatedAt>=old.updatedAt)records.set(t.kind+':'+t.id,t)}
 const snapshot=accumulateDevice(previous,normalizeSnapshot({
  schemaVersion:1,source:'desktop-app',deviceId:identity.deviceId,deviceName:config.deviceName,
  observedAt:new Date().toISOString(),localObservedAt,cloudObservedAt,cloudMode:'app-bridge',cloudState,sourceError,
  items:[...records.values()]
 }));
 await atomic('snapshot.json',snapshot);
 const fingerprint=createHash('sha256').update(JSON.stringify({items:snapshot.items,cloudState,sourceError,localError})).digest('hex');
 const last=await read('last-success.json',null),heartbeatDue=!last||Date.now()-Date.parse(last.publishedAt||0)>=300000;
 if(process.argv.includes('--local-only')){
  await atomic('last-check.json',{success:true,checkedAt:snapshot.observedAt,cloudState,cloudObservedAt,localCount:local.length,observedCloudCount:cloud.filter(t=>t.kind==='chatgpt').length,sourceError,localError});
  console.log(JSON.stringify({success:true,cloudState,local:local.length,cloud:cloud.filter(t=>t.kind==='chatgpt').length,uploaded:false}));
 }else if(last?.fingerprint===fingerprint&&!heartbeatDue&&!process.argv.includes('--force')){
  await atomic('last-check.json',{success:true,checkedAt:snapshot.observedAt,cloudState,cloudObservedAt,published:false});
  console.log(JSON.stringify({success:true,cloudState,changed:false,uploaded:false}));
 }else{
  const envelope=await encryptDevice(snapshot,config.recipient);await atomic('pending.enc.json',envelope);
  const result=await publishDevice(config,envelope,dir);
  await atomic('last-success.json',{observedAt:snapshot.observedAt,cloudObservedAt,publishedAt:new Date().toISOString(),localCount:local.length,cloudCount:cloud.filter(t=>t.kind==='chatgpt').length,cloudState,fingerprint,...result});
  await atomic('last-check.json',{success:true,checkedAt:snapshot.observedAt,cloudState,cloudObservedAt,published:true});
  console.log(JSON.stringify({success:true,cloudState,local:local.length,cloud:cloud.filter(t=>t.kind==='chatgpt').length,uploaded:true}));
 }
}catch(error){
 const reason=/^[a-z_]+$/.test(error.message)?error.message:'sync_failed';
 await atomic('last-check.json',{success:false,checkedAt:new Date().toISOString(),reason,lastPublishedPreserved:true});
 console.error(JSON.stringify({success:false,reason,lastPublishedPreserved:true}));process.exitCode=1;
}finally{client?.close();await release()}
