import {deviceRecipient} from './vault.js';
import {decryptDevice} from './device-crypto.mjs';
import {keepSnapshot,validateRegistry} from './device-catalog.mjs';
const snapshots=new Map();
const cachePrefix='chat-history-hub:device-envelope:v1:';
let busy=false,loadedCache=false;
export const deviceSnapshots=()=>[...snapshots.values()];
async function json(url){const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Device connection failed');const raw=await response.text();if(raw.length>20000000)throw Error('Device response too large');return JSON.parse(raw)}
async function accept(id,envelope){if(envelope.deviceId!==id)throw Error('Wrong device');const incoming=await decryptDevice(envelope,deviceRecipient);snapshots.set(id,keepSnapshot(snapshots.get(id),incoming))}
export async function refreshDevices(){
 if(busy)return;busy=true;
 const status=document.getElementById('device-status');
 try{
  if(!deviceRecipient)throw Error('이 브라우저에서 기기 목록 암호화를 지원하지 않습니다. 최신 브라우저를 사용해 주세요.');
  document.getElementById('recipient-key').value=deviceRecipient.publicKey;
  if(!loadedCache){loadedCache=true;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(cachePrefix)){try{await accept(k.slice(cachePrefix.length),JSON.parse(localStorage.getItem(k)))}catch{}}}}catch{}}
  const ids=validateRegistry(await json('./devices/index.json?t='+Math.floor(Date.now()/30000)));
  const results=await Promise.allSettled(ids.map(async id=>{
   const envelope=await json('./devices/'+id+'.enc.json?t='+Math.floor(Date.now()/30000));
   await accept(id,envelope);try{localStorage.setItem(cachePrefix+id,JSON.stringify(envelope))}catch{}
  }));
  const failed=results.filter(x=>x.status==='rejected').length;
  status.textContent=failed?failed+'개 기기에 연결하지 못했습니다. 마지막 정상 목록을 유지합니다.':ids.length?'데스크탑과 연결된 기기의 목록을 함께 표시합니다.':'데스크탑 목록을 표시 중입니다. 추가 기기를 연결하면 함께 표시됩니다.';
  status.dataset.state=failed?'warning':'ok';
 }catch(error){status.textContent='기기 목록 연결을 확인해 주세요. 마지막 정상 목록을 유지합니다.';status.dataset.state='warning'}
 finally{busy=false}
}
