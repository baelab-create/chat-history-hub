import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,rmdir,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {titlesFromApp} from '../collector/app-source.mjs';
import {acquireLock} from '../collector/lock.mjs';
const row={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',kind:'chatgpt',title:'Example',updatedAt:1700000000,projectId:'p'};
test('only title metadata survives app list; pinned and recent duplicate IDs merge',()=>{
 const data={threads:[{...row,summary:'PRIVATE BODY',token:'SECRET'}],pinnedThreads:[row],unavailableSources:[]};
 const result=titlesFromApp(data,{p:'Project'});
 assert.equal(result.length,1);assert.equal(result[0].project,'Project');
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('bad or unavailable cloud responses cannot advance freshness',()=>{
 for(const data of [{},{threads:[],pinnedThreads:[]},{threads:[row],pinnedThreads:[],unavailableSources:['chatgpt']},{threads:[{...row,updatedAt:'bad'}],pinnedThreads:[]}]){
  assert.throws(()=>titlesFromApp(data));
 }
 assert.equal(titlesFromApp({threads:[{...row,updatedAt:'2026-01-01T00:00:00Z'}],pinnedThreads:[]})[0].updatedAt,1767225600);
});
test('lock rejects overlap, releases only its own file, recovers after a dead process',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-lock-test-')),path=join(dir,'run.lock');
 try{
  const release=await acquireLock(path);assert.equal(typeof release,'function');assert.equal(await acquireLock(path),null);
  await release();
  await writeFile(path,JSON.stringify({pid:2147483647,nonce:'dead'}));
  const recovered=await acquireLock(path);assert.equal(typeof recovered,'function');
  await writeFile(path,JSON.stringify({pid:process.pid,nonce:'new-owner'}));
  await recovered();assert.equal(JSON.parse(await readFile(path,'utf8')).nonce,'new-owner');
 }finally{await rm(path,{force:true});await rmdir(dir)}
});
test('fresh incomplete locks are left alone; old interrupted writes recover',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-lock-test-')),path=join(dir,'run.lock');
 try{
  await writeFile(path,'');assert.equal(await acquireLock(path),null);
  const old=new Date(Date.now()-360000);await utimes(path,old,old);
  const release=await acquireLock(path);assert.equal(typeof release,'function');await release();
 }finally{await rm(path,{force:true});await rmdir(dir)}
});
