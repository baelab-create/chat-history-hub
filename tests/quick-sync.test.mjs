import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {quickSync,prepareSidebar} from '../extension/quick-sync.js';
import {inspectSidebar} from '../extension/collector.js';
import {readReactDates,withReactDates} from '../extension/react-dates.js';
const id='11111111-1111-4111-8111-111111111111';
function fixture({state='ready',loading=0,visit=false,changeUrl=false}={}){
 const calls=[],listeners=new Set();let ticks=0,checks=0;
 const raw={version:1,observedAt:new Date().toISOString(),coverage:'loaded-sidebar-only',items:[{id,title:'Recent',webUrl:'https://chatgpt.com/c/'+id,rank:0,pinned:false,updatedAt:null}]};
 const chrome={tabs:{onActivated:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},create:async args=>{calls.push(['create',args]);return {id:7,active:false}},get:async tabId=>({id:tabId,active:false,status:ticks<loading?'loading':'complete',url:changeUrl?'https://chatgpt.com/c/'+id:'https://chatgpt.com/'}),remove:async tabId=>calls.push(['remove',tabId])},scripting:{executeScript:async args=>{calls.push(['execute',args]);if(visit)for(const fn of listeners)fn({tabId:7});return [{result:args.func===prepareSidebar?state:args.func===inspectSidebar?raw:[{id,createdAt:1700000000,updatedAt:1700001000,lastMessageAt:null,dateEvidence:'react-v1'}]}]}}};
 const options={chrome,hubTab:{id:1,windowId:4},check:async()=>{checks++;},pause:async()=>{ticks++;},now:()=>ticks*1000,timeout:3000};
 return {calls,chrome,options,listeners,get checks(){return checks}};
}
test('one explicit quick refresh loads a fresh inactive tab, reads dates and closes only its own untouched home',async()=>{
 const f=fixture({loading:1}),result=await quickSync(f.options);
 assert.deepEqual(f.calls[0],['create',{url:'https://chatgpt.com/',active:false,windowId:4}]);
 assert.equal(result.items[0].updatedAt,1700001000);
 assert.equal(f.calls.filter(c=>c[0]==='execute').length,3);
 assert.ok(f.calls.filter(c=>c[0]==='execute').every(c=>c[1].target.tabId===7));
 assert.equal(f.calls.find(c=>c[0]==='execute'&&c[1].world==='MAIN')[1].func,readReactDates);
 assert.deepEqual(f.calls.at(-1),['remove',7]);assert.equal(f.listeners.size,0);
});
test('login fails without reading history or closing the login tab',async()=>{
 const f=fixture({state:'login'});await assert.rejects(quickSync(f.options),e=>e.code==='LOGIN_REQUIRED');
 assert.equal(f.calls.filter(c=>c[0]==='execute').length,1);assert.equal(f.calls.some(c=>c[0]==='remove'),false);assert.equal(f.listeners.size,0);
});
test('loading and unsupported pages time out, without a false empty success',async()=>{
 const f=fixture({state:'loading'});await assert.rejects(quickSync(f.options),e=>e.code==='PAGE_UNAVAILABLE');assert.deepEqual(f.calls.at(-1),['remove',7]);
});
test('cancellation before reading dates prevents result delivery and cleans up temporary page',async()=>{
 const f=fixture();let checks=0;f.options.check=async()=>{if(++checks===3)throw Error('cancelled')};
 await assert.rejects(quickSync(f.options),/cancelled/);assert.equal(f.calls.some(c=>c[1]?.world==='MAIN'),false);assert.deepEqual(f.calls.at(-1),['remove',7]);
});
test('user-visited or navigated temporary tabs are never closed',async()=>{
 for(const opts of [{visit:true},{changeUrl:true}]){const f=fixture(opts);await quickSync(f.options);assert.equal(f.calls.some(c=>c[0]==='remove'),false);}
});
test('sidebar preparation only opens recognized controls and never clicks login or send',()=>{
 const {document,window}=parseHTML('<html><body><button aria-label="Open sidebar">Open</button><button>Log in</button><button>Send</button></body></html>');
 window.HTMLElement.prototype.getClientRects=()=>[{}];let opened=0;
 document.querySelector('[aria-label]').onclick=()=>opened++;
 for(const b of [...document.querySelectorAll('button')].slice(1))b.onclick=()=>{throw Error('unsafe click')};
 const read=()=>vm.runInNewContext(`(${prepareSidebar.toString()})()`,{document});
 assert.equal(read(),'loading');assert.equal(opened,1);document.querySelector('[aria-label]').remove();assert.equal(read(),'login');
});

const background=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function worker(){
 const storage={},sent=[],created=[];let receive,release;
 const chrome={runtime:{id:'ext',getManifest:()=>({version:'1.4.0'}),getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener:f=>receive=f}},storage:{session:{get:async key=>key===null?{...storage}:{[key]:storage[key]},set:async v=>Object.assign(storage,v),remove:async key=>{delete storage[key]}}},tabs:{get:async()=>({url:'https://baelab-create.github.io/chat-history-hub/'}),create:async options=>{created.push(options);return {id:3}},sendMessage:async(tab,message)=>sent.push({tab,message}),onRemoved:{addListener(){}}}};
 const fakeQuick=async options=>{await options.check();await options.progress('reading');await new Promise(r=>release=r);await options.check();return {items:[]};};
 vm.runInNewContext(background,{chrome,quickSync:fakeQuick,inspectSidebar,readReactDates,withReactDates,Date,Error});
 const sender={id:'ext',url:'https://baelab-create.github.io/chat-history-hub/',frameId:0,tab:{id:1}};
 const call=(type,extra={},who=sender)=>new Promise(resolve=>receive({type,id,...extra},who,resolve));
 return {call,sent,created,storage,release:()=>release(),ready:()=>Boolean(release)};
}
async function until(test){for(let n=0;n<100&&!test();n++)await Promise.resolve();assert.ok(test());}
test('worker quick mode returns progress and result to Hub without opening review; duplicates do not recollect',async()=>{
 const f=worker(),promise=f.call('begin',{mode:'quick'});await until(f.ready);
 assert.equal((await f.call('begin',{mode:'quick'})).ok,true);assert.equal(f.created.length,0);
 f.release();assert.equal((await promise).ok,true);assert.deepEqual(f.sent.map(s=>s.message.type),['progress','result']);assert.equal(Object.keys(f.storage).length,0);
});
test('worker cancellation suppresses the result; probing cannot collect; review remains explicit',async()=>{
 const f=worker();assert.equal((await f.call('ping')).version,'1.4.0');assert.equal(f.ready(),false);
 const promise=f.call('begin',{mode:'quick'});await until(f.ready);await f.call('abort');f.release();assert.equal((await promise).ok,false);assert.equal(f.sent.some(s=>s.message.type==='result'),false);
 const review=await f.call('begin',{mode:'review'});assert.equal(review.ok,true);assert.match(f.created[0].url,/review.html/);
});
