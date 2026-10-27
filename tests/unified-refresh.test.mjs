import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
function fixture({collectionError,saveError,readError}={}){
 const nodes=new Map(),storage=new Map(),calls={read:0,collect:0,save:0};
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},hidden:false,setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}});return nodes.get(id)};
 let finish;
 const context=vm.createContext({$,Date,Intl,AbortController,Promise,Error,JSON,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},deviceRecipient:{publicKey:'test'},encryptDevice:async()=>({}),splitBrowserArchive:async s=>[s],browserSnapshot:()=>({items:[{}]}),mergePendingEnvelopes:async(a,b)=>b,encryptedStore:{get:async k=>storage.has(k)?JSON.parse(storage.get(k)):null,set:async(k,v)=>storage.set(k,JSON.stringify(v)),remove:async k=>storage.delete(k)},clearBookmarkImport(){},selectedService:'all',localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},collectionStatus:()=>({cloudObservedAt:'2026-10-13T11:07:00Z'}),deviceSnapshots:()=>[],refreshCatalog:async()=>null,refreshDevices:async()=>{},loadCloudDevices:async()=>{calls.read++;if(readError)throw Error('offline');return {valid:[]}},acceptDeviceEnvelope:async()=>({deviceId:'test'}),composeItems(){},applyCatalog(){},document:{querySelector:()=>null},saveCloudDevice:async()=>{calls.save++;if(saveError)throw Error('offline')},requestBrowserSnapshot:()=>{calls.collect++;return new Promise((resolve,reject)=>{finish=()=>collectionError?reject(Error('helper unavailable')):resolve({items:[{}]})})}});
 vm.runInContext('let catalogInfo={},pendingCatalog=null,refreshBusy=false,lastRefreshAttempt=0,refreshFailed=false,manualBusy=false,manualController,currentDeviceId,bookmarkSnapshot=null;',context);
 vm.runInContext(source.slice(source.indexOf('function updateSyncStatus(){'),source.indexOf("$('cancel-manual').onclick")),context);
 const click=()=>{const e={currentTarget:$('manual-sync'),preventDefault(){this.prevented=true}};$('manual-sync').onclick(e);return e};
 const settle=async()=>{finish();for(let n=0;n<100;n++)await Promise.resolve()};
 return {context,$,calls,storage,click,settle};
}
test('one action reloads saved data and collects once; repeat clicks are blocked',async()=>{
 const f=fixture();f.click();assert.equal(f.click().prevented,true);await f.settle();assert.deepEqual(f.calls,{read:1,collect:1,save:1});assert.equal(f.$('manual-sync').textContent,'최신화');assert.equal(f.$('manual-sync')['aria-disabled'],'false');
});
test('loading saved data on entry does not collect',async()=>{
 const f=fixture();await vm.runInContext('checkForUpdates(true)',f.context);assert.equal(f.calls.collect,0);assert.equal(f.calls.read,1);
});
test('helper failure still loads saved data and explicitly reports failure',async()=>{
 const f=fixture({collectionError:true});f.click();await f.settle();assert.equal(f.calls.read,1);assert.equal(f.calls.save,0);assert.match(f.$('manual-status').textContent,/저장된 목록은 불러왔지만 새 대화는 가져오지 못했습니다/);
});
test('failed cloud save retains retry data',async()=>{
 const f=fixture({saveError:true});f.click();await f.settle();assert.equal(f.$('retry-share').hidden,false);assert.equal(f.storage.size,2);assert.match(f.$('manual-status').textContent,/공유 저장에 실패/);
});
test('both read and collection failure do not claim saved list was refreshed',async()=>{
 const f=fixture({collectionError:true,readError:true});f.click();await f.settle();assert.match(f.$('manual-status').textContent,/모두 확인하지 못했습니다/);
});

test('collection preserves search and date filters typed while review is open',async()=>{
 const f=fixture();f.click();f.$('query').value='new search';f.$('from').value='2026-10-01';f.$('project').value='selected project';await f.settle();assert.equal(f.$('query').value,'new search');assert.equal(f.$('from').value,'2026-10-01');assert.equal(f.$('project').value,'selected project');
});
test('cancel after review starts prevents sharing and permits a later retry',async()=>{
 const f=fixture();f.click();vm.runInContext('manualController.abort()',f.context);await f.settle();assert.equal(f.calls.save,0);assert.match(f.$('manual-status').textContent,/취소/);assert.equal(f.$('manual-sync')['aria-disabled'],'false');
});
