import {open,readFile,rm,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function acquireLock(path){
 const nonce=randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  try{
   const handle=await open(path,'wx',0o600);
   await handle.writeFile(JSON.stringify({pid:process.pid,nonce,startedAt:new Date().toISOString()}));await handle.close();
   return async()=>{try{const owner=JSON.parse(await readFile(path,'utf8'));if(owner.nonce===nonce)await rm(path)}catch{}};
  }catch(e){
   if(e.code!=='EEXIST')throw e;
   let owner;try{owner=JSON.parse(await readFile(path,'utf8'))}catch{
    // A crash between exclusive create and write may leave an empty lock.
    // Give any live writer ample time; only reclaim an old, still-invalid file.
    try{
     if(Date.now()-(await stat(path)).mtimeMs<300000)return null;
     let nowValid=false;try{JSON.parse(await readFile(path,'utf8'));nowValid=true}catch{}
     if(nowValid)return null;
     await rm(path,{force:true});continue;
    }catch{return null}
   }
   if(!Number.isInteger(owner.pid)||owner.pid<1)return null;
   try{process.kill(owner.pid,0);return null}catch(error){if(error.code!=='ESRCH')return null}
   await rm(path,{force:true});
  }
 }
 return null;
}
