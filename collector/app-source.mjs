// Read-only adapter to the app's installed MCP bridge. No model turn is started.
import {spawn} from 'node:child_process';
import {readdir,stat} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';

const allowed=new Set(['list_threads','list_projects']);
export class SourceError extends Error { constructor(code){super(code);this.code=code} }
export class AppClient {
 constructor(server,pipe,timeout=20000){
  this.next=0;this.pending=new Map();this.buffer='';this.timeout=timeout;
  this.child=spawn(process.execPath,[server],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,CODEX_APP_TOOLS_PIPE_PATH:pipe}});
  this.child.stderr.on('data',()=>{}); // May include environment details; never log it.
  this.child.stdin.on('error',()=>this.close());
  this.child.on('error',()=>this.close());this.child.on('exit',()=>this.close());
  this.child.stdout.on('data',data=>{
   this.buffer+=data;
   if(this.buffer.length>16000000){this.close();return}
   let n;while((n=this.buffer.indexOf('\n'))>=0){
    const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);
    let message;try{message=JSON.parse(line)}catch{this.close();return}
    const request=this.pending.get(message.id);if(!request)continue;
    this.pending.delete(message.id);clearTimeout(request.timer);
    if(message.error)request.reject(new SourceError('app_request_failed'));else request.resolve(message.result);
   }
  });
 }
 request(method,params,timeout=this.timeout){
  return new Promise((resolve,reject)=>{
   if(!this.child||this.child.killed)return reject(new SourceError('app_disconnected'));
   const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(new SourceError('app_timeout'))},timeout);
   this.pending.set(id,{resolve,reject,timer});
   this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new SourceError('app_disconnected'))}});
  });
 }
 async initialize(){
  await this.request('initialize',{protocolVersion:'2024-11-05',clientInfo:{name:'chat-history-hub-read-only',version:'2.0'},capabilities:{}},3000);
  this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const {tools}=await this.request('tools/list',{},2500);
  if(!tools?.some(t=>t.name==='list_threads'))throw new SourceError('title_tool_unavailable');
 }
 async read(name,args,threadId){
  if(!allowed.has(name))throw new SourceError('tool_not_allowed');
  const result=await this.request('tools/call',{name,arguments:args,_meta:{threadId}});
  if(result?.isError)throw new SourceError('app_source_unavailable');
  try{return JSON.parse(result.content.filter(c=>c.type==='text').map(c=>c.text).join(''))}
  catch{throw new SourceError('app_response_changed')}
 }
 close(){
  const child=this.child;this.child=null;child?.kill();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new SourceError('app_disconnected'))}this.pending.clear();
 }
}
export async function installedBridge(){
 const root=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'plugins','cache','openai-bundled','codex-app-tools');
 let versions;try{versions=await readdir(root)}catch{throw new SourceError('app_bridge_not_installed')}
 for(const version of versions.sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
  const path=join(root,version,'server.mjs');try{if((await stat(path)).isFile())return path}catch{}
 }
 throw new SourceError('app_bridge_not_installed');
}
export async function pipeCandidates(preferred){
 const found=[process.env.CODEX_APP_TOOLS_PIPE_PATH,preferred].filter(Boolean);
 if(process.platform==='win32'){
  try{for(const name of await readdir('\\\\.\\pipe\\'))if(/^codex-browser-use-[a-f0-9-]+$/i.test(name))found.push('\\\\.\\pipe\\'+name)}catch{}
 }else{
  for(const dir of new Set([tmpdir(),'/tmp'])){
   try{for(const name of await readdir(dir))if(/^codex-(browser-use|app-tools)-/.test(name))found.push(join(dir,name))}catch{}
  }
 }
 return [...new Set(found)].slice(0,40);
}
export async function connectApp(preferred){
 const server=await installedBridge();
 for(const pipe of await pipeCandidates(preferred)){
  const client=new AppClient(server,pipe);
  try{await client.initialize();return {client,pipe}}catch{client.close()}
 }
 throw new SourceError('app_not_running');
}
const seconds=value=>{
 if(typeof value==='number')return value>1e12?value/1000:value;
 return Date.parse(value)/1000;
};
export function titlesFromApp(data,projects={}){
 if(!Array.isArray(data?.threads)||!Array.isArray(data?.pinnedThreads))throw new SourceError('app_response_changed');
 if(data.unavailableSources?.length)throw new SourceError('cloud_source_unavailable');
 const found=new Map();
 for(const t of [...data.pinnedThreads,...data.threads]){
  if(!['chatgpt','codex'].includes(t.kind))continue;
  const updatedAt=seconds(t.updatedAt);
  if(typeof t.title!=='string'||!t.title.trim()||!Number.isFinite(updatedAt)||updatedAt<=0)throw new SourceError('title_metadata_invalid');
  found.set(t.kind+':'+t.id,{id:t.id,kind:t.kind,title:t.title,updatedAt,archived:false,project:projects[t.projectId]||'프로젝트 없음'});
 }
 if(!found.size)throw new SourceError('empty_app_observation');
 return [...found.values()];
}
