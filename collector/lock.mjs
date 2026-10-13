import {open,readFile,rm} from 'node:fs/promises';
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
   let owner;try{owner=JSON.parse(await readFile(path,'utf8'))}catch{return null}
   if(!Number.isInteger(owner.pid)||owner.pid<1)return null;
   try{process.kill(owner.pid,0);return null}catch(error){if(error.code!=='ESRCH')return null}
   await rm(path,{force:true});
  }
 }
 return null;
}
