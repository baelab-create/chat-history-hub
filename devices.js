import {encryptedStore} from './archive-storage.mjs?v=12';
import {deviceRecipient} from './vault.js?v=7';
import {decryptDevice,encryptDevice} from './device-crypto.mjs?v=7';
import {keepSnapshot,validateRegistry} from './device-catalog.mjs?v=14';
const snapshots=new Map();
const cachePrefix='chat-history-hub:device-envelope:v1:';
let busy=false,loadedCache=false;
export const deviceSnapshots=()=>[...snapshots.values()];
async function json(url){const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Device connection failed');const raw=await response.text();if(raw.length>20000000)throw Error('Device response too large');return JSON.parse(raw)}
async function accept(id,envelope){if(envelope.deviceId!==id)throw Error('Wrong device');const incoming=await decryptDevice(envelope,deviceRecipient);snapshots.set(id,keepSnapshot(snapshots.get(id),incoming))}
export async function acceptDeviceEnvelope(envelope){
 await accept(envelope.deviceId,envelope);
 await encryptedStore.set(cachePrefix+envelope.deviceId,await encryptDevice(snapshots.get(envelope.deviceId),deviceRecipient.publicKey));
 return snapshots.get(envelope.deviceId);
}
export async function refreshDevices(){
 if(busy)return;busy=true;
 const status=document.getElementById('device-status');
 try{
  if(!deviceRecipient)throw Error('이 브라우저에서 기기 목록 암호화를 지원하지 않습니다. 최신 브라우저를 사용해 주세요.');
  document.getElementById('recipient-key').value=deviceRecipient.publicKey;
  if(!loadedCache){for(const [key,envelope] of await encryptedStore.entries(cachePrefix)){try{await accept(key.slice(cachePrefix.length),envelope)}catch{}}loadedCache=true;}
  const bases=['./devices/','https://raw.githubusercontent.com/baelab-create/chat-history-hub/catalog-data/devices/'];
  const tick='?t='+Math.floor(Date.now()/30000);
  const registries=await Promise.allSettled(bases.map(base=>json(base+'index.json'+tick).then(validateRegistry)));
  let failed=registries.filter(r=>r.status==='rejected').length;
  // Accept both locations during migration. keepSnapshot prevents an older copy
  // from replacing a newer observation of the same device.
  for(let i=0;i<bases.length;i++){
   if(registries[i].status!=='fulfilled')continue;
   const results=await Promise.allSettled(registries[i].value.map(async id=>{
    const envelope=await json(bases[i]+id+'.enc.json'+tick);
    await accept(id,envelope);
    await encryptedStore.set(cachePrefix+id,await encryptDevice(snapshots.get(id),deviceRecipient.publicKey));
   }));
   failed+=results.filter(x=>x.status==='rejected').length;
  }
  status.textContent=failed?'일부 기기 목록에 연결하지 못했습니다. 마지막 정상 목록을 유지합니다.':snapshots.size?'연결된 PC의 제목 목록을 합쳐 표시합니다.':'아직 이 브라우저에서 가져온 목록이 없습니다.';
  status.dataset.state=failed?'warning':'ok';if(failed)throw Error('일부 저장 목록을 읽지 못했습니다.');
 }catch(error){status.textContent='기기 목록 연결을 확인해 주세요. 마지막 정상 목록을 유지합니다.';status.dataset.state='warning';throw error}
 finally{busy=false}
}
