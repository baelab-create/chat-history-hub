import test from 'node:test';
import assert from 'node:assert/strict';
import {requestBrowserSnapshot} from '../browser-client.mjs';
test('handshake ignores foreign windows and origins; cancellation invalidates request',async()=>{
 const listeners=new Set(),sent=[];const win={addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f),postMessage:m=>sent.push(m)};
 globalThis.window=win;globalThis.location={origin:'https://baelab-create.github.io'};
 const emit=(m,source=win,origin=location.origin)=>{for(const fn of listeners)fn({source,origin,data:{channel:'hub-browser-response-v1',id:sent[0].id,...m}})};
 const controller=new AbortController();let ready=0;
 const result=requestBrowserSnapshot({signal:controller.signal,onReady:()=>ready++});
 emit({type:'ready'},{},location.origin);emit({type:'ready'},win,'https://evil.test');emit({type:'result',snapshot:{}});assert.equal(ready,0);
 emit({type:'ready'});emit({type:'ready'});assert.equal(ready,1);assert.equal(sent.filter(m=>m.type==='collect').length,1);
 controller.abort();await assert.rejects(result,/취소/);assert.equal(sent.at(-1).type,'abort');assert.equal(listeners.size,0);
 delete globalThis.window;delete globalThis.location;
});
