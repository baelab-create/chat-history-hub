import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createEncryptedStore} from '../archive-storage.mjs';
import {mergePendingEnvelopes} from '../share-queue.mjs';
import {recipientFromPassword,encryptDevice,decryptDevice} from '../device-crypto.mjs';
const local=()=>{const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
test('large ciphertext survives reopening without using localStorage quota',async()=>{
 const idb=new IDBFactory(),legacy=local(),a=createEncryptedStore(idb,legacy),envelope={ciphertext:'x'.repeat(6*1024*1024)};
 legacy.setItem=()=>{throw Error('QuotaExceeded')};await a.set('pending',envelope);
 const reopened=createEncryptedStore(idb,legacy);assert.deepEqual(await reopened.get('pending'),envelope);await reopened.remove('pending');assert.equal(await reopened.get('pending'),undefined);
});
test('legacy encrypted cache and outbox migrate only after successful writes',async()=>{
 const idb=new IDBFactory(),legacy=local(),store=createEncryptedStore(idb,legacy),cipher={ciphertext:'old'};legacy.setItem('cache:one',JSON.stringify(cipher));
 assert.deepEqual(await store.get('cache:one'),cipher);await store.set('cache:one',cipher);assert.equal(legacy.getItem('cache:one'),null);assert.deepEqual(await store.entries('cache:'),[['cache:one',cipher]]);
});
test('blocked IndexedDB falls back and exposes full storage errors instead of silent success',async()=>{
 const legacy=local(),store=createEncryptedStore(null,legacy);await store.set('queue',{ciphertext:'retry'});assert.equal((await store.get('queue')).ciphertext,'retry');
 legacy.setItem=()=>{throw Error('QuotaExceeded')};await assert.rejects(store.set('queue',{ciphertext:'next'}),/Quota/);assert.equal((await store.get('queue')).ciphertext,'retry');await store.remove('queue');assert.equal(await store.get('queue'),undefined);
});
test('failed uploads merge with later collections instead of losing old titles or other shards',async()=>{
 const recipient=await recipientFromPassword('synthetic queue test'),deviceId='11111111-1111-4111-8111-111111111111';
 const make=(n,time,dev=deviceId)=>({schemaVersion:1,source:'browser-sidebar',deviceId:dev,observedAt:new Date(Date.now()-time).toISOString(),items:[{id:'22222222-2222-4222-8222-'+String(n).padStart(12,'0'),title:'title '+n,kind:'chatgpt',updatedAt:null,archived:false,sidebarRank:0,pinned:false,browserObservedAt:new Date(Date.now()-time).toISOString()}]});
 const old=await encryptDevice(make(1,20000),recipient.publicKey),other=await encryptDevice(make(3,20000,'33333333-3333-4333-8333-333333333333'),recipient.publicKey),fresh=await encryptDevice(make(2,10000),recipient.publicKey);
 const queue=await mergePendingEnvelopes([old,other],[fresh],recipient);assert.equal(queue.length,2);const saved=await decryptDevice(queue.find(e=>e.deviceId===deviceId),recipient);assert.deepEqual(saved.items.map(i=>i.title).sort(),['title 1','title 2']);assert.equal(JSON.stringify(queue).includes('title '),false);
});
