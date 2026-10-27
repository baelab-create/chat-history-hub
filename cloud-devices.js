import {getGoogleSession} from './google-auth.js?v=7';
import {decryptDevice} from './device-crypto.mjs?v=7';
import {deviceRecipient} from './vault.js?v=7';
import {normalizeSnapshot,accumulateDevice} from './collector/metadata.mjs?v=15';
const path=['private','chatHistoryHub','devices'];
const deadline=(promise)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('공유 저장소의 응답을 확인하지 못했습니다.')),20000)})]).finally(()=>clearTimeout(timer))};
async function connection(){const s=await getGoogleSession();if(!s.auth.currentUser)throw Error('로그인이 필요합니다.');return s}
export async function loadCloudDevices(){
 const {db,dbSdk}=await connection();
 const rows=await deadline(dbSdk.getDocsFromServer(dbSdk.collection(db,...path)));
 const valid=[],errors=[];
 for(const row of rows.docs){try{const e=row.data().envelope;if(e?.deviceId!==row.id)throw Error();valid.push({envelope:e,snapshot:normalizeSnapshot(await decryptDevice(e,deviceRecipient))})}catch{errors.push(row.id)}}
 return {valid,failed:errors.length};
}
export async function saveCloudDevice(envelope){
 const incoming=normalizeSnapshot(await decryptDevice(envelope,deviceRecipient));
 // A transaction keeps two tabs from overwriting a newer observation.
 const {db,dbSdk}=await connection(),ref=dbSdk.doc(db,...path,envelope.deviceId);
 await deadline(dbSdk.runTransaction(db,async tx=>{
  const before=await tx.get(ref);
  if(before.exists()){
   const old=normalizeSnapshot(await decryptDevice(before.data().envelope,deviceRecipient));
   if(Date.parse(old.observedAt)>=Date.parse(incoming.observedAt))return;
   const {encryptDevice}=await import('./device-crypto.mjs?v=7');
   envelope=await encryptDevice(accumulateDevice(old,incoming),deviceRecipient.publicKey);
  }
  if(JSON.stringify(envelope).length>900000)throw Error('목록이 저장 한도를 넘었습니다. 기존 목록은 유지됩니다.');
  tx.set(ref,{version:1,envelope,savedAt:dbSdk.serverTimestamp()});
 }));
 return incoming;
}
