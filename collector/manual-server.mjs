// One-shot loopback bridge. Launching the URL alone does not collect anything.
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {collectOnce} from './collect-once.mjs';
export const HUB_ORIGIN='https://baelab-create.github.io';
export const MANUAL_PORT=41791;
export function parseInvocation(raw){
 if(typeof raw!=='string'||!/^chathistoryhub:\/\/sync\/[a-f0-9]{64}\/?$/.test(raw))throw Error('invalid_request');
 return new URL(raw).pathname.replaceAll('/','');
}
export async function startManualServer({nonce,collect,port=MANUAL_PORT,lifetime=120000}){
 if(!/^[a-f0-9]{64}$/.test(nonce))throw Error('invalid_request');
 let result,settled=false;
 const server=createServer(async(req,res)=>{
  const goodHost=req.headers.host===`127.0.0.1:${server.address().port}`;
  const origin=req.headers.origin;
  if(!goodHost||origin!==HUB_ORIGIN){res.writeHead(403);res.end();return}
  res.setHeader('Access-Control-Allow-Origin',HUB_ORIGIN);res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){
   if(req.url!=='/collect'||req.headers['access-control-request-method']!=='POST'){res.writeHead(403);res.end();return}
   res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization');
   res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);res.end();return;
  }
  if(req.method!=='POST'||req.url!=='/collect'||req.headers.authorization!==`Hub ${nonce}`){res.writeHead(403);res.end();return}
  // Identical retries share one observation; never run a second collection.
  if(!result)result=Promise.resolve().then(collect);
  try{const data=await result;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
  catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,reason:'collection_failed'}))}
  if(!settled){settled=true;setTimeout(close,1500).unref()}
 });
 const close=()=>{clearTimeout(timer);server.closeAllConnections();server.close()};
 const timer=setTimeout(close,lifetime);
 server.requestTimeout=110000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)}).catch(e=>{clearTimeout(timer);throw e});
 return {server,close,port:server.address().port};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const nonce=parseInvocation(process.argv[2]);await startManualServer({nonce,collect:()=>collectOnce(fileURLToPath(new URL('../',import.meta.url)))})}
 catch{process.exitCode=1}
}
