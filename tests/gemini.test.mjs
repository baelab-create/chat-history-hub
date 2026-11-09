import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {quickGeminiSync,readGeminiCapture} from '../extension/gemini-sync.js';
import {browserSnapshot} from '../browser-client.mjs';
import {normalizeSnapshot,accumulateDevice} from '../collector/metadata.mjs';
import {mergeCatalogs} from '../device-catalog.mjs';
import {arrangeConversations} from '../conversation-order.mjs';
const source=await readFile(new URL('../extension/gemini-capture.js',import.meta.url),'utf8');
const nonce='11111111-1111-4111-8111-111111111111',cid='0123456789abcdef';
const url='https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=MaZiqc';
const record=(id=cid,date=[1700000000,500000000])=>['c_'+id,'A title containing c_not_a_date',null,null,null,date,null,null,null,3];
const response=(rows=[record()],rpc='MaZiqc')=>JSON.stringify([['wrb.fr',rpc,JSON.stringify([null,null,rows]),null]]);
function hook({hash='#chat-history-hub='+nonce}={}){
 const timers=[],calls=[],fetches=[];
 class XHR{constructor(){this.listeners=[];this.status=200;this.responseType='';}open(method,url){calls.push([method,url]);}send(){calls.push('sent');}addEventListener(type,fn){this.listeners.push(fn);}done(text){this.responseText=text;this.listeners.forEach(f=>f());}}
 const original={open:XHR.prototype.open,send:XHR.prototype.send};
 const window={fetch:(...args)=>{fetches.push(args);return Promise.resolve(new Response(response()))}};window.top=window;
 const location={origin:'https://gemini.google.com',pathname:'/app',hash,search:'',href:'https://gemini.google.com/app'+hash};
 const context=vm.createContext({window,location,history:{state:null,replaceState:()=>calls.push('remove-fragment')},XMLHttpRequest:XHR,URL,Date,Map,WeakMap,JSON,TextDecoder,setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){}});
 original.fetch=window.fetch;vm.runInContext(source,context);
 const send=(body,target=url)=>{const x=new XHR();x.open('POST',target);x.send();x.done(body);return x};
 return {window,XHR,original,calls,fetches,timers,send,read:()=>window.__chatHistoryHubGeminiV1?.read(nonce),stop:()=>window.__chatHistoryHubGeminiV1?.stop(nonce)};
}
test('Gemini hook is inert in ordinary tabs; activation removes marker and expires',()=>{
 const plain=hook({hash:''});assert.equal(plain.read(),undefined);assert.equal(plain.window.fetch,plain.original.fetch);assert.equal(plain.timers.length,0);
 const h=hook();assert.equal(h.calls[0],'remove-fragment');assert.equal(h.window.__chatHistoryHubGeminiV1.read('wrong'),null);
 h.timers[0]();assert.equal(h.window.fetch,h.original.fetch);assert.equal(h.XHR.prototype.open,h.original.open);assert.equal(h.read(),null);
});
test('Gemini parses length framed list metadata, exact timestamps and never copies other fields',()=>{
 const h=hook();const body=response([record(),['c_abcdef0123456789','Other',null,null,null,[1700001000,0],{body:'PRIVATE'}]]);
 h.send(")]}'\n\n"+body.length+'\n'+body+'\n');const data=h.read();
 assert.equal(data.received,true);assert.equal(data.items.length,2);assert.equal(data.items[0].updatedAt,1700000000.5);
 assert.equal(data.items[1].rank,1);assert.equal(data.items[0].webUrl,'https://gemini.google.com/app/'+cid);
 assert.equal(JSON.stringify(data).includes('PRIVATE'),false);assert.equal('createdAt' in data.items[0],false);h.stop();
});
test('Gemini ignores non-list URLs/frames and rejects malformed lists without inventing dates',()=>{
 const h=hook();h.send(response(),url.replace('MaZiqc','hNvQHb'));assert.equal(h.read().received,false);
 h.send(response([record()],'hNvQHb'));assert.equal(h.read().received,false);
 h.send(response([['bad','Title',null,null,null,[1700000000,0]]]));assert.equal(h.read().received,false);assert.equal(h.read().invalid,true);
 h.send(response([record(cid,[Math.floor(Date.now()/1000)+10000,0])]));assert.equal(h.read().items[0].updatedAt,null);
 h.send(response([record()]));assert.equal(h.read().items[0].updatedAt,1700000000.5);h.stop();
});
test('Gemini fetch observes its own list response and cleanup restores native functions',async()=>{
 const h=hook();const result=await h.window.fetch(url);assert.equal(result.status,200);
 for(let n=0;n<20&&!h.read().received;n++)await new Promise(r=>setTimeout(r,0));
 assert.equal(h.read().items.length,1);assert.equal(h.fetches.length,1);
 h.stop();assert.equal(h.window.fetch,h.original.fetch);assert.equal(h.XHR.prototype.send,h.original.send);
});
test('Gemini oversized or unrelated response cannot become a title record',()=>{
 const h=hook();h.send('x'.repeat(2*1024*1024+1));h.send(JSON.stringify({message:['c_'+cid,'hello',[1700000000,0]]}));assert.equal(h.read().received,false);h.stop();
});
function syncFixture({login=false,visited=false,empty=false,ready=true,navigated=false}={}){
 const calls=[],listeners=new Set();let tick=0;
 const chrome={tabs:{onActivated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},create:async options=>{calls.push(['create',options]);return {id:9,active:false}},get:async()=>({status:'complete',url:navigated?'https://gemini.google.com/app/'+cid:'https://gemini.google.com/app',active:false}),remove:async id=>calls.push(['remove',id])},scripting:{executeScript:async args=>{calls.push(['execute',args]);if(visited)for(const fn of listeners)fn({tabId:9});return [{result:args.args[1]?null:login?{login:true}:ready?{version:3,service:'gemini',received:true,items:empty?[]:[{id:cid}]}:null}]}}};
 return {calls,listeners,options:{chrome,hubTab:{id:1,windowId:2},check:async()=>{},pause:async()=>{tick++},now:()=>tick*1000,timeout:2000}};
}
test('Gemini quick capture owns a marked tab, stops hooks and cleans up after success',async()=>{
 const f=syncFixture();await quickGeminiSync(f.options);assert.match(f.calls[0][1].url,/^https:\/\/gemini.google.com\/app#chat-history-hub=[a-f0-9-]{36}$/);
 assert.equal(f.calls[0][1].active,false);assert.equal(f.calls.at(-2)[1].args[1],true);assert.deepEqual(f.calls.at(-1),['remove',9]);assert.equal(f.listeners.size,0);
 assert.ok(f.calls.filter(c=>c[0]==='execute').every(c=>c[1].func===readGeminiCapture&&c[1].world==='MAIN'));
});
test('Gemini keeps login, visited or navigated tabs; empty list and timeout are explicit failures',async()=>{
 for(const options of [{login:true},{visited:true},{navigated:true}]){const f=syncFixture(options);if(options.login)await assert.rejects(quickGeminiSync(f.options),e=>e.code==='LOGIN_REQUIRED'&&e.service==='gemini');else await quickGeminiSync(f.options);assert.equal(f.calls.some(c=>c[0]==='remove'),false);assert.equal(f.listeners.size,0);}
 for(const [opts,code] of [[{empty:true},'EMPTY_HISTORY'],[{ready:false},'PAGE_UNAVAILABLE']]){const f=syncFixture(opts);await assert.rejects(quickGeminiSync(f.options),e=>e.code===code);assert.deepEqual(f.calls.at(-1),['remove',9]);}
});
test('Gemini cancellation prevents delivery and cleans up its capture',async()=>{
 const f=syncFixture();let n=0;f.options.check=async()=>{if(++n===3)throw Error('cancelled')};await assert.rejects(quickGeminiSync(f.options),/cancelled/);assert.deepEqual(f.calls.at(-1),['remove',9]);
});
test('Gemini metadata uses separate IDs and survives accumulation, catalog merge and partial refresh',()=>{
 const h=hook();h.send(response());const s=normalizeSnapshot(browserSnapshot(h.read(),nonce));h.stop();
 assert.equal(s.items[0].id,'gemini-'+cid);assert.equal(s.items[0].kind,'gemini');
 const earlier={...s,observedAt:new Date(Date.now()-10000).toISOString(),cloudObservedAt:new Date(Date.now()-10000).toISOString()};
 const chat={id:nonce,title:'ChatGPT',kind:'chatgpt',updatedAt:null,archived:false,sidebarRank:0,pinned:false,browserObservedAt:new Date().toISOString()};
 const mixed=accumulateDevice(earlier,{...s,items:[chat]});assert.equal(mixed.items.length,2);
 const catalog=mergeCatalogs([], [mixed]);assert.equal(catalog.find(t=>t.kind==='gemini').webUrl,'https://gemini.google.com/app/'+cid);
 const corrupt=structuredClone(s);corrupt.items[0].webUrl='https://evil.test';assert.throws(()=>normalizeSnapshot(corrupt));
 const raw={version:3,service:'gemini',coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[{id:cid,title:'x',webUrl:'https://gemini.google.com/app/'+cid,rank:0,pinned:false,updatedAt:1700000000,dateEvidence:'react-v1'}]};
 assert.throws(()=>browserSnapshot(raw,nonce));raw.items[0].dateEvidence='gemini-list-v1';raw.items[0].createdAt=1700000000;assert.throws(()=>browserSnapshot(raw,nonce));
});
test('browser ordering never infers a Gemini date from ChatGPT ranks in a shared batch',()=>{
 const date=new Date().toISOString(),row=(id,kind,rank,updatedAt)=>({id,kind,sidebarRank:rank,browserObservedAt:date,updatedAt});
 const out=arrangeConversations([row('a','chatgpt',0,1700000300),row('b','gemini',1,null),row('c','chatgpt',2,1700000000)]);
 assert.equal(out.find(t=>t.kind==='gemini').inferredDateLabel,undefined);
});

test('Gemini also accepts the documented direct RPC frame, without generic recursive extraction',()=>{
 const h=hook();h.send(JSON.stringify(['MaZiqc',null,JSON.stringify([null,null,[record()]])]));assert.equal(h.read().items[0].id,cid);h.stop();
});
