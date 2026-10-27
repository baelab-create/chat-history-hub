// Local-only browser QA server. Synthetic data; no account, helper or cloud calls.
// Open the printed localhost URL in an isolated browser and exercise the controls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname);
const old={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',kind:'chatgpt',title:'기존 대화 · 테스트',updatedAt:1700000000,webUrl:'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const fixtures={
 '/vault.js':`import {recipientFromPassword} from './device-crypto.mjs';export const deviceRecipient=await recipientFromPassword('SYNTHETIC QA DATA ONLY');export const loadTitles=async()=>({});export const saveTitles=async()=>{};export const refreshCatalog=async()=>null;export async function unlockCatalog(){document.getElementById('unlock').hidden=true;document.getElementById('catalog').hidden=false;return ${JSON.stringify({items:[old],collectedAt:'2026-10-01T00:00:00Z'})}}`,
 '/cloud-devices.js':`const rows=new Map();export async function loadCloudDevices(){return {valid:[...rows.values()],failed:0}}export async function saveCloudDevice(envelope){if(document.getElementById('fixture-fail').checked)throw Error('synthetic offline');rows.set(envelope.deviceId,{envelope});}`,
 '/browser-client.mjs':`export {browserSnapshot} from './browser-client-real.mjs';export const probeBrowserExtension=async()=>({version:'1.4.0'});export function requestBrowserSnapshot({signal,onReady}){onReady?.();return new Promise((resolve,reject)=>{document.getElementById('fixture-complete').disabled=false;const abort=()=>{document.getElementById('fixture-complete').disabled=true;reject(Error('최신화를 취소했습니다.'))};signal.addEventListener('abort',abort,{once:true});document.getElementById('fixture-complete').onclick=()=>{signal.removeEventListener('abort',abort);document.getElementById('fixture-complete').disabled=true;resolve({version:1,observedAt:new Date().toISOString(),coverage:'loaded-sidebar-only',items:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'새 대화 · 최신화 테스트',webUrl:'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',rank:0,pinned:false,updatedAt:null}]})}})}`
};
const server=createServer(async(req,res)=>{
 try{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name in fixtures){res.setHeader('Content-Type','text/javascript');res.end(fixtures[name]);return;}
  if(name==='/devices/index.json'){res.setHeader('Content-Type','application/json');res.end('{"version":1,"devices":[]}');return;}
  if(name==='/devices.js'){
   res.setHeader('Content-Type','text/javascript');res.end((await readFile(resolve(root,'devices.js'),'utf8')).replace("const bases=['./devices/','https://raw.githubusercontent.com/baelab-create/chat-history-hub/catalog-data/devices/'];","const bases=['./devices/'];"));return;
  }
  if(name==='/browser-client-real.mjs')name='/browser-client.mjs';
  const path=resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!path.startsWith(root+'/')||path.includes('/private/')||path.includes('/.git/')||path.includes('/node_modules/'))throw Error();
  let bytes=await readFile(path);
  if(name==='/')bytes=Buffer.from(bytes.toString().replace('<body>',`<body><aside style="padding:12px;background:#ffe6b3" aria-label="테스트 도구">합성 데이터로만 작동하는 테스트 화면 · <label style="display:inline"><input type="checkbox" id="fixture-fail">공유 실패 재현</label><button id="fixture-complete" disabled>수집 결과 전달</button></aside>`));
  res.setHeader('Content-Type',extname(path)==='.html'?'text/html; charset=utf-8':extname(path)==='.json'?'application/json':'text/javascript');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
server.listen(41792,'0.0.0.0',()=>console.log('Synthetic UI fixture: http://127.0.0.1:41792/'));
