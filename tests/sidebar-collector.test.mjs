import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSidebar} from '../extension/collector.js';
const a=(id,title,{hidden=false,href='/c/'+id}={})=>({getAttribute:k=>k==='href'?href:k==='aria-label'?title:null,getClientRects:()=>hidden?[]:[{}],closest:()=>null,innerText:title});
const group=(label,links)=>({querySelector:()=>({textContent:label}),querySelectorAll:()=>links});
const id='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
test('collector preserves recent order, merges pinned duplicate, excludes non-sidebar/body and hidden links',()=>{
 const groups=[group('프로젝트',[a(id2,'ignore project')]),group('고정된 스레드',[a(id,'pinned duplicate'),a(id2,'pinned only')]),group('최근',[a(id,'recent title'),a('33333333-3333-4333-8333-333333333333','hidden',{hidden:true}),a(id2,'foreign',{href:'https://evil.test/c/'+id2})])];
 globalThis.document={querySelector:selector=>{assert.equal(selector,'#app-shell-sidebar');return {querySelectorAll:()=>groups}}};globalThis.location={origin:'https://chatgpt.com'};
 const snapshot=collectSidebar();assert.equal(snapshot.items.length,2);assert.deepEqual(snapshot.items.map(x=>[x.title,x.rank,x.pinned,x.updatedAt]),[['recent title',0,true,null],['pinned only',null,true,null]]);
 delete globalThis.document;delete globalThis.location;
});
test('missing sidebar stops collection rather than reading conversation content',()=>{globalThis.document={querySelector:()=>null};assert.throws(()=>collectSidebar(),/사이드바/);delete globalThis.document});
