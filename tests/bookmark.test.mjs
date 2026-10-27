import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {recipientFromPassword,encryptDevice} from '../device-crypto.mjs';
import {readBookmarkImport,decodeBookmarkImport,clearBookmarkImport} from '../bookmark-import.mjs';
import {runBookmarklet} from '../bookmark/run.mjs';
const id='11111111-1111-4111-8111-111111111111';
const snapshot=()=>({version:1,coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),deviceId:id,importKind:'hub-bookmark-v1',items:[{id,title:'합성 테스트 제목',webUrl:'https://chatgpt.com/c/'+id,rank:0,pinned:false,updatedAt:null}]});
const session=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
test('generated bookmark executes self-contained code and transfers encrypted metadata only',async()=>{
 const publicKey=JSON.parse(await readFile(new URL('../setup/recipient.json',import.meta.url),'utf8')).publicKey;
 const recipient=await recipientFromPassword('synthetic bookmark test');
 const page=parseHTML(await readFile(new URL('../setup/simple.html',import.meta.url),'utf8'));
 const url=page.document.querySelector('a.bookmark').getAttribute('href');assert.ok(url.startsWith('javascript:'));
 const code=decodeURIComponent(url.slice(11)).replace(JSON.stringify(publicKey),JSON.stringify(recipient.publicKey));
 const {document,window}=parseHTML(`<html><body><nav id="history"><a href="/c/${id}">합성 테스트 제목</a></nav><main>PRIVATE BODY MUST NOT BE COLLECTED</main></body></html>`);
 window.HTMLElement.prototype.getClientRects=()=>[{}];
 const root={tag:3,stateNode:{}};root.stateNode.current=root;const fiber={return:root,memoizedProps:{conversation:{id,title:'합성 테스트 제목',create_time:1700000000,update_time:1700001000,content:'PRIVATE BODY'}}};root.child=fiber;document.querySelector('a').__reactFiber$fixture=fiber;
 let finish;const output=new Promise(resolve=>finish=resolve),errors=[];
 vm.runInNewContext(code,{document,URL,Date,Map,Error,Boolean,crypto,TextEncoder,TextDecoder,Uint8Array,Array,btoa,atob,JSON,encodeURIComponent,location:{origin:'https://chatgpt.com',assign:finish},alert:m=>{errors.push(m);finish(null)},confirm:()=>true});
 const target=await output;assert.deepEqual(errors,[]);assert.ok(target.startsWith('https://baelab-create.github.io/chat-history-hub/#hub-import='));assert.equal(target.includes('합성'),false);
 const envelope=JSON.parse(decodeURIComponent(new URL(target).hash.slice('#hub-import='.length)));
 const decoded=await decodeBookmarkImport(envelope,recipient);assert.equal(decoded.items[0].title,'합성 테스트 제목');assert.equal(decoded.version,2);assert.equal(decoded.items[0].updatedAt,1700001000);assert.equal(decoded.items[0].createdAt,1700000000);assert.equal(JSON.stringify(decoded).includes('PRIVATE BODY'),false);
});
test('import fragment is cleared before sign-in and only ciphertext survives reload',()=>{
 const storage=session(),payload={ciphertext:'encrypted-only'},changes=[];
 const loc={hash:'#hub-import='+encodeURIComponent(JSON.stringify(payload)),pathname:'/chat-history-hub/',search:''};
 assert.deepEqual(readBookmarkImport(loc,{replaceState:(...args)=>changes.push(args)},storage),{envelope:payload});assert.equal(changes[0][2],'/chat-history-hub/');
 assert.deepEqual(readBookmarkImport({...loc,hash:''},{},storage),{envelope:payload});clearBookmarkImport(storage);assert.equal(readBookmarkImport({...loc,hash:''},{},storage),null);
});
test('invalid, stale, wrong-recipient and oversize imports never enter the catalog',async()=>{
 const recipient=await recipientFromPassword('synthetic validation');
 for(const patch of [{importKind:'wrong'}, {observedAt:'2020-01-01T00:00:00Z'}, {items:Array.from({length:201},()=>snapshot().items[0])}]){
  const envelope=await encryptDevice({...snapshot(),...patch},recipient.publicKey);await assert.rejects(decodeBookmarkImport(envelope,recipient));
 }
 const envelope=await encryptDevice(snapshot(),recipient.publicKey);await assert.rejects(decodeBookmarkImport({...envelope,recipient:'wrong'},recipient));
 const result=readBookmarkImport({hash:'#hub-import='+'x'.repeat(180001),pathname:'/',search:''},{replaceState(){}},session());assert.ok(result.error);
});
test('bookmark refuses other origins without reading the page or navigating',async()=>{
 let read=0;const alerts=[];
 const context={location:{origin:'https://example.com'},alert:s=>alerts.push(s)};
 await vm.runInNewContext(`(${runBookmarklet.toString()})({collect:()=>{throw Error('must not collect')}})`,context);
 assert.match(alerts[0],/ChatGPT 페이지/);assert.equal(read,0);
});
