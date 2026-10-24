import test from 'node:test';
import assert from 'node:assert/strict';
import {requestBrowserSnapshot,probeBrowserExtension} from '../browser-client.mjs';
test('handshake ignores foreign windows and origins; cancellation invalidates request',async()=>{
 const listeners=new Set(),sent=[];const win={addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f),postMessage:m=>sent.push(m)};
 globalThis.window=win;globalThis.location={origin:'https://baelab-create.github.io'};
 const emit=(m,source=win,origin=location.origin)=>{for(const fn of listeners)fn({source,origin,data:{channel:'hub-browser-response-v1',id:sent[0].id,...m}})};
 const controller=new AbortController();let ready=0;
 const result=requestBrowserSnapshot({signal:controller.signal,onReady:()=>ready++});
 emit({type:'ready'},{},location.origin);emit({type:'ready'},win,'https://evil.test');emit({type:'result',snapshot:{}});assert.equal(ready,0);
 emit({type:'ready',version:'1.2.0'});emit({type:'ready',version:'1.2.0'});assert.equal(ready,1);assert.equal(sent.filter(m=>m.type==='collect').length,1);
 controller.abort();await assert.rejects(result,/취소/);assert.equal(sent.at(-1).type,'abort');assert.equal(listeners.size,0);
 delete globalThis.window;delete globalThis.location;
});

function connectionFixture(){
 const listeners=new Set(),sent=[];const win={addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f),postMessage:m=>sent.push(m)};
 globalThis.window=win;globalThis.location={origin:'https://baelab-create.github.io'};
 return {sent,listeners,emit(message){for(const fn of [...listeners])fn({source:win,origin:location.origin,data:{channel:'hub-browser-response-v1',id:sent[0].id,...message}})},close(){delete globalThis.window;delete globalThis.location}};
}
test('old unversioned bridge fails with an update instruction before opening review',async()=>{
 const f=connectionFixture();try{const promise=requestBrowserSnapshot();f.emit({type:'ready'});await assert.rejects(promise,/이전 버전/);assert.equal(f.sent.length,1);assert.equal(f.listeners.size,0)}finally{f.close()}
});
test('connection probe checks version without starting collection',async()=>{
 const f=connectionFixture();try{const promise=probeBrowserExtension();f.emit({type:'ready',version:'1.2.0'});assert.equal((await promise).version,'1.2.0');assert.equal(f.sent.length,1);assert.equal(f.listeners.size,0)}finally{f.close()}
});
test('closing review fails the active request and removes listeners',async()=>{
 const f=connectionFixture();try{const promise=requestBrowserSnapshot();f.emit({type:'ready',version:'1.2.0'});f.emit({type:'error',error:'미리보기를 닫았습니다.'});await assert.rejects(promise,/닫았습니다/);assert.equal(f.listeners.size,0)}finally{f.close()}
});
