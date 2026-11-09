import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as order from '../conversation-order.mjs';
import {splitBrowserArchive} from '../browser-archive.mjs';
import {mergeCatalogs,keepSnapshot} from '../device-catalog.mjs';
import {collectionStatus} from '../sync-status.mjs';
import {createRenderGate} from '../render-guard.mjs';
import {recipientFromPassword,encryptDevice,decryptDevice} from '../device-crypto.mjs';
import {browserSnapshot} from '../browser-client.mjs';
import {mergePendingEnvelopes} from '../share-queue.mjs';
import {conversationDate} from '../conversation-date.mjs';
const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const chatId='11111111-1111-4111-8111-111111111111',gemId='0123456789abcdef';
const wait=async predicate=>{for(let n=0;n<300;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI did not settle')};
test('Gemini selection collects, dates, encrypts, shares and survives a partial all-services refresh',async()=>{
 const {document,window}=parseHTML(html),nodes=id=>document.getElementById(id),cache=new Map(),storage=new Map(),cloud=new Map(),queue=new Map(),requests=[];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||''},set(value){for(const o of this.querySelectorAll('option'))o.removeAttribute('selected');[...this.querySelectorAll('option')].find(o=>o.value===value)?.setAttribute('selected','')},configurable:true});
 const Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o};window.HTMLSelectElement.prototype.add=function(o){this.append(o)};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const deviceRecipient=await recipientFromPassword('Gemini integration synthetic fixture');
 const updatedAt=Date.parse('2026-10-25T15:30:00Z')/1000;
 let result={version:3,service:'gemini',coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[{id:gemId,kind:'gemini',title:'Gemini 미팅',webUrl:'https://gemini.google.com/app/'+gemId,rank:0,pinned:false,updatedAt,dateEvidence:'gemini-list-v1',body:'DO NOT STORE'}],errors:[]};
 const context=vm.createContext({document,Option,Date,Intl,Map,Set,Promise,JSON,Error,SyntaxError,URL,Object,Number,String,Array,AbortController,crypto,localStorage,encryptedStore:{get:async k=>queue.get(k),set:async(k,v)=>queue.set(k,v),remove:async k=>queue.delete(k)},conversationDate,deviceRecipient,encryptDevice,mergePendingEnvelopes,readBookmarkImport:()=>null,...order,splitBrowserArchive,mergeCatalogs,collectionStatus,createRenderGate,browserSnapshot,
 unlockCatalog:async()=>({collectedAt:'2026-10-01T00:00:00Z',items:[{id:chatId,title:'ChatGPT 기존 대화',kind:'chatgpt',updatedAt:1700000000,webUrl:'https://chatgpt.com/c/'+chatId}]}),loadTitles:async()=>({}),saveTitles:async()=>{},refreshCatalog:async()=>null,deviceSnapshots:()=>[...cache.values()],refreshDevices:async()=>{},loadCloudDevices:async()=>({valid:[...cloud.values()].map(envelope=>({envelope})),failed:0}),
 acceptDeviceEnvelope:async e=>cache.set(e.deviceId,keepSnapshot(cache.get(e.deviceId),await decryptDevice(e,deviceRecipient))),saveCloudDevice:async e=>cloud.set(e.deviceId,e),probeBrowserExtension:async()=>({version:'1.5.0'}),
 requestBrowserSnapshot:async options=>{requests.push(options.service);return result},location:{reload(){}}
 });
 vm.runInContext(source,context);await wait(()=>nodes('manual-sync').disabled===false);
 const service=name=>[...nodes('services').querySelectorAll('button')].find(b=>b.textContent.startsWith(name));
 service('Gemini').onclick();assert.match(nodes('sync-caption').textContent,/Gemini/);nodes('manual-sync').onclick({preventDefault(){}});
 await wait(()=>nodes('manual-sync').disabled===false);assert.deepEqual(requests,['gemini']);assert.equal(service('Gemini').disabled,false);
 assert.equal(nodes('count').textContent,'1개 대화');assert.match(nodes('manual-status').textContent,/저장 완료/);assert.equal(nodes('manual-status').dataset.state,'success');
 assert.match(nodes('results').querySelector('h2').textContent,/2026년 10월 26일/);assert.equal(nodes('results').querySelector('time').textContent,'00:30');assert.equal(nodes('results').querySelector('a.title').getAttribute('href'),'https://gemini.google.com/app/'+gemId);
 const recovered=await decryptDevice([...cloud.values()][0],deviceRecipient);assert.equal(recovered.items[0].kind,'gemini');assert.equal(JSON.stringify(recovered).includes('DO NOT STORE'),false);assert.equal(JSON.stringify([...cloud.values()]).includes('미팅'),false);
 nodes('from').value='2026-10-26';nodes('to').value='2026-10-26';nodes('from').dispatchEvent(new window.Event('input'));assert.equal(nodes('count').textContent,'1개 대화');
 nodes('date-basis').value='created';nodes('date-basis').dispatchEvent(new window.Event('input'));assert.equal(nodes('count').textContent,'0개 대화');nodes('reset').onclick();
 cache.clear();await vm.runInContext('checkForUpdates(true)',context);assert.equal(nodes('count').textContent,'1개 대화');assert.equal(cache.size,1);
 service('전체').onclick();assert.equal(nodes('count').textContent,'2개 대화');
 result={...result,service:'all',observedAt:new Date().toISOString(),items:[{id:chatId,kind:'chatgpt',title:'ChatGPT 새 제목',webUrl:'https://chatgpt.com/c/'+chatId,rank:0,pinned:false,updatedAt:null}],errors:[{service:'gemini',code:'LOGIN_REQUIRED',error:'Gemini 로그인이 필요합니다.'}]};
 nodes('manual-sync').onclick({preventDefault(){}});await wait(()=>nodes('manual-sync').disabled===false);
 assert.deepEqual(requests,['gemini','all']);assert.equal(nodes('count').textContent,'2개 대화');assert.equal(nodes('manual-status').dataset.state,'warning');assert.match(nodes('manual-status').textContent,/일부 가져오기 실패.*Gemini/);assert.equal(nodes('connection-action').href,'https://gemini.google.com/app');assert.match(nodes('results').textContent,/Gemini 미팅/);assert.match(nodes('results').textContent,/ChatGPT 새 제목/);
 nodes('sort').value='recent';nodes('sort').dispatchEvent(new window.Event('input'));assert.equal(nodes('count').textContent,'2개 대화');
 service('ChatGPT').onclick();assert.equal(nodes('count').textContent,'1개 대화');assert.equal(service('ChatGPT').disabled,false);
});
