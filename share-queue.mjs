import {decryptDevice,encryptDevice} from './device-crypto.mjs?v=7';
import {accumulateDevice} from './collector/metadata.mjs?v=14';
// A second collection must not overwrite an earlier failed upload.
export async function mergePendingEnvelopes(previous,incoming,recipient){
 const list=value=>value?(Array.isArray(value)?value:[value]):[];
 const merged=new Map();
 for(const envelope of [...list(previous),...list(incoming)]){
  const old=merged.get(envelope.deviceId);
  if(!old){merged.set(envelope.deviceId,envelope);continue;}
  const before=await decryptDevice(old,recipient),next=await decryptDevice(envelope,recipient);
  merged.set(envelope.deviceId,await encryptDevice(accumulateDevice(before,next),recipient.publicKey));
 }
 return [...merged.values()];
}
