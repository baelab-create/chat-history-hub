import {decryptDevice} from './device-crypto.mjs?v=7';
import {browserSnapshot} from './browser-client.mjs?v=12';
const key='chat-history-hub:bookmark-import:v1',prefix='#hub-import=';
export function readBookmarkImport(loc=globalThis.location,history=globalThis.history,storage=globalThis.sessionStorage){
 try{
  let raw;
  if(loc.hash.startsWith(prefix)){
   const fragment=loc.hash;
   history.replaceState(null,'',loc.pathname+loc.search);
   if(fragment.length>180000)throw Error('가져올 목록이 너무 큽니다.');
   raw=decodeURIComponent(fragment.slice(prefix.length));
   JSON.parse(raw);try{storage.setItem(key,raw)}catch{}
  }else raw=storage.getItem(key);
  return raw?{envelope:JSON.parse(raw)}:null;
 }catch{return {error:'북마크 목록을 확인하지 못했습니다. ChatGPT에서 북마크 버튼을 다시 눌러 주세요.'};}
}
export function clearBookmarkImport(storage=globalThis.sessionStorage){try{storage.removeItem(key)}catch{}}
export async function decodeBookmarkImport(envelope,recipient){
 const raw=await decryptDevice(envelope,recipient);
 if(raw.importKind!=='hub-bookmark-v1'||!Array.isArray(raw.items)||raw.items.length>200)throw Error('지원하지 않는 간편 목록입니다.');
 // Reuse the same URL, title, timestamp and metadata validation as the extension.
 browserSnapshot(raw,raw.deviceId);
 return raw;
}
