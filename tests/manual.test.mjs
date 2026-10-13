import test from 'node:test';
import assert from 'node:assert/strict';
import {startManualServer,parseInvocation,HUB_ORIGIN} from '../collector/manual-server.mjs';
import {createRenderGate} from '../render-guard.mjs';
const nonce='a'.repeat(64);
test('URL handler accepts only the exact fixed operation and 256-bit nonce',()=>{
 assert.equal(parseInvocation('chathistoryhub://sync/'+nonce),nonce);
 for(const bad of ['https://example.com','chathistoryhub://sync/short','chathistoryhub://sync/'+nonce+'?exec=x','chathistoryhub://sync/'+nonce+'#x','chathistoryhub://user@sync/'+nonce])assert.throws(()=>parseInvocation(bad));
});
test('no collection on launch, CORS, wrong nonce or hostile origin; retries collect once',async()=>{
 let count=0;const fixture={success:true,envelope:{ciphertext:'fixture'}};
 const bridge=await startManualServer({nonce,port:0,lifetime:10000,collect:async()=>{count++;await new Promise(r=>setTimeout(r,25));return fixture}});
 const url=`http://127.0.0.1:${bridge.port}/collect`;
 try{
  assert.equal(count,0);
  for(const headers of [{Origin:'https://evil.example',Authorization:'Hub '+nonce},{Origin:HUB_ORIGIN,Authorization:'Hub '+'b'.repeat(64)},{Authorization:'Hub '+nonce},{Origin:'null',Authorization:'Hub '+nonce}])assert.equal((await fetch(url,{method:'POST',headers})).status,403);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{Origin:HUB_ORIGIN,'Access-Control-Request-Method':'POST'}})).status,204);
  assert.equal(count,0);
  const results=await Promise.all([1,2].map(()=>fetch(url,{method:'POST',headers:{Origin:HUB_ORIGIN,Authorization:'Hub '+nonce}}).then(r=>r.json())));
  assert.deepEqual(results,[fixture,fixture]);assert.equal(count,1);
 }finally{bridge.close()}
});
test('idle bridge terminates without collecting',async()=>{
 let count=0;const bridge=await startManualServer({nonce,port:0,lifetime:30,collect:()=>count++});
 await new Promise(r=>bridge.server.once('close',r));assert.equal(count,0);assert.equal(bridge.server.listening,false);
});
test('collector failures return fixed safe errors',async()=>{
 const bridge=await startManualServer({nonce,port:0,collect:()=>{throw Error('SECRET RAW RESPONSE')}});
 try{const r=await fetch(`http://127.0.0.1:${bridge.port}/collect`,{method:'POST',headers:{Origin:HUB_ORIGIN,Authorization:'Hub '+nonce}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{success:false,reason:'collection_failed'})}finally{bridge.close()}
});
test('incoming updates defer focused editing until deliberate apply',()=>{
 let renders=0,shown=false;const doc={activeElement:{matches:()=>true},querySelector:()=>null};
 const gate=createRenderGate(doc,()=>renders++,value=>shown=value);
 assert.equal(gate.request(),false);assert.equal(renders,0);assert.equal(shown,true);
 gate.apply();assert.equal(renders,1);assert.equal(shown,false);
 doc.activeElement={matches:()=>false};assert.equal(gate.request(),true);assert.equal(renders,2);
 doc.querySelector=()=>({});gate.request();assert.equal(renders,2);
});
