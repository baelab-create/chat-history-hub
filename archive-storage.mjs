// Ciphertext only. IndexedDB avoids localStorage's small per-origin quota.
export function createEncryptedStore(idb=globalThis.indexedDB,legacy=globalThis.localStorage){
 let opened;
 const open=()=>opened ||= new Promise((resolve,reject)=>{
  if(!idb){reject(Error('IndexedDB unavailable'));return;}
  const request=idb.open('chat-history-hub:encrypted:v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('entries');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Encrypted storage blocked'));
 });
 async function operation(mode,run){
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('entries',mode),request=run(tx.objectStore('entries'));
   tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage aborted'));
  });
 }
 const legacyGet=key=>{const raw=legacy?.getItem(key);return raw?JSON.parse(raw):undefined};
 return {
  async get(key){let value;try{value=await operation('readonly',s=>s.get(key))}catch{}return value??legacyGet(key);},
  async set(key,value){
   try{await operation('readwrite',s=>s.put(value,key));try{legacy?.removeItem(key)}catch{}}
   catch{if(!legacy)throw Error('암호화 목록을 이 브라우저에 저장하지 못했습니다.');legacy.setItem(key,JSON.stringify(value));}
  },
  async remove(key){
   // Remove the fallback first: a failure must leave a retryable queue.
   legacy?.removeItem(key);try{await operation('readwrite',s=>s.delete(key))}catch{if(idb)throw Error('저장 대기 목록을 정리하지 못했습니다. 다시 시도해 주세요.');}
  },
  async entries(prefix){
   const result=new Map();
   if(legacy)for(let i=0;i<legacy.length;i++){const key=legacy.key(i);if(key?.startsWith(prefix)){try{result.set(key,legacyGet(key))}catch{}}}
   try{const keys=await operation('readonly',s=>s.getAllKeys());for(const key of keys)if(typeof key==='string'&&key.startsWith(prefix))result.set(key,await operation('readonly',s=>s.get(key)))}catch{}
   return [...result];
  }
 };
}
export const encryptedStore=createEncryptedStore();
