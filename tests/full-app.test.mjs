import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {IDBFactory} from 'fake-indexeddb';
import * as order from '../conversation-order.mjs';
import {splitBrowserArchive} from '../browser-archive.mjs';
import {mergeCatalogs,keepSnapshot} from '../device-catalog.mjs';
import {collectionStatus} from '../sync-status.mjs';
import {createRenderGate} from '../render-guard.mjs';
import {recipientFromPassword,encryptDevice,decryptDevice} from '../device-crypto.mjs';
import {browserSnapshot} from '../browser-client.mjs';
import {createEncryptedStore} from '../archive-storage.mjs';
import {mergePendingEnvelopes} from '../share-queue.mjs';
import {decodeBookmarkImport} from '../bookmark-import.mjs';
const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const wait=async predicate=>{for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI did not settle')};
for(const viaBookmark of [false,true])test(`full app ${viaBookmark?'bookmark':'extension'} capture renders, encrypts, preserves filters and retries a durable queue`,async()=>{
 const {document,window}=parseHTML(html),nodes=id=>document.getElementById(id),cache=new Map(),storage=new Map(),cloud=new Map();
 // linkedom has no layout/focus and select value is read-only; model browser controls.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||''},set(value){for(const o of this.querySelectorAll('option'))o.selected=o.value===value},configurable:true});
 const Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o};
 window.HTMLSelectElement.prototype.add=function(o){this.append(o)};
 const localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const encryptedStore=createEncryptedStore(new IDBFactory(),localStorage),deviceRecipient=await recipientFromPassword('synthetic full app test');
 let complete,fail=true,collections=0;
 const rawBookmark={version:1,coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),importKind:'hub-bookmark-v1',deviceId:id,items:[{id,title:'new title',webUrl:'https://chatgpt.com/c/'+id,rank:0,pinned:false,updatedAt:null}]};
 const imported=viaBookmark?{envelope:await encryptDevice(rawBookmark,deviceRecipient.publicKey)}:null;
 const context=vm.createContext({document,Option,Date,Intl,Map,Set,Promise,JSON,Error,SyntaxError,URL,Object,Number,String,Array,AbortController,crypto,localStorage,encryptedStore,deviceRecipient,encryptDevice,mergePendingEnvelopes,readBookmarkImport:()=>imported,decodeBookmarkImport,clearBookmarkImport(){},...order,splitBrowserArchive,mergeCatalogs,collectionStatus,createRenderGate,browserSnapshot,
  unlockCatalog:async()=>({collectedAt:'2026-10-01T00:00:00Z',items:[{id,title:'old title',kind:'chatgpt',updatedAt:1700000000,webUrl:'https://chatgpt.com/c/'+id}]}),loadTitles:async()=>({}),saveTitles:async()=>{},refreshCatalog:async()=>null,
  deviceSnapshots:()=>[...cache.values()],refreshDevices:async()=>{},loadCloudDevices:async()=>({valid:[...cloud.values()].map(envelope=>({envelope})),failed:0}),
  acceptDeviceEnvelope:async envelope=>{cache.set(envelope.deviceId,keepSnapshot(cache.get(envelope.deviceId),await decryptDevice(envelope,deviceRecipient)))},
  saveCloudDevice:async envelope=>{if(fail)throw Error('offline');cloud.set(envelope.deviceId,envelope)},probeBrowserExtension:async()=>({version:'1.2.0'}),
  requestBrowserSnapshot:({onReady})=>{collections++;onReady?.();return new Promise(resolve=>{complete=()=>resolve({version:1,coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[{id,title:'new title',webUrl:'https://chatgpt.com/c/'+id,rank:0,pinned:false,updatedAt:null}]})})},location:{reload(){}}
 });
 vm.runInContext(source,context);await wait(()=>nodes('manual-sync').getAttribute('aria-disabled')==='false');
 assert.equal(collections,0);assert.equal(nodes('count').textContent,'1개 대화');assert.equal(nodes('results').querySelector('a.title').textContent,'old title');
 await nodes('check-extension').onclick();assert.match(nodes('extension-status').textContent,/1.2.0/);assert.equal(collections,0);
 if(viaBookmark){await wait(()=>nodes('apply-bookmark').disabled===false);assert.equal(nodes('bookmark-preview').children.length,1);nodes('query').value='new';nodes('apply-bookmark').onclick();}
 else{nodes('manual-sync').onclick({preventDefault(){},currentTarget:nodes('manual-sync')});nodes('query').value='new';complete();}
 await wait(()=>nodes('manual-sync').getAttribute('aria-disabled')==='false');
 assert.match(nodes('manual-status').textContent,/공유 저장에 실패/);assert.equal(nodes('query').value,'new');assert.equal(nodes('results').querySelector('a.title').textContent,'new title');
 const queued=await encryptedStore.get('chat-history-hub:pending-manual-envelope');assert.equal(queued.length,1);assert.equal(JSON.stringify(queued).includes('new title'),false);assert.equal(nodes('retry-share').hidden,false);
 fail=false;await nodes('retry-share').onclick();assert.equal(nodes('retry-share').hidden,true);assert.equal(cloud.size,1);assert.equal(collections,viaBookmark?0:1);assert.equal(await encryptedStore.get('chat-history-hub:pending-manual-envelope'),undefined);
 assert.equal(nodes('results').querySelector('a.title').getAttribute('href'),'https://chatgpt.com/c/'+id);assert.match(nodes('manual-status').textContent,/공유 저장을 완료/);
});
