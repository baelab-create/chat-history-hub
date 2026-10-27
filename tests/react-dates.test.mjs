import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {readReactDates,withReactDates} from '../extension/react-dates.js';
import {browserSnapshot} from '../browser-client.mjs';
import {normalizeSnapshot,accumulateDevice} from '../collector/metadata.mjs';
import {mergeCatalogs} from '../device-catalog.mjs';
import {conversationDate} from '../conversation-date.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const created=1700000000,updated=1700001000,messageTime=1700002000;
function page(extra=''){
 const {document,window}=parseHTML(`<html><body><nav id="history"><a href="/c/${id}">Test title</a></nav>${extra}</body></html>`);
 window.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}]};
 const context=vm.createContext({document,location:{origin:'https://chatgpt.com',pathname:'/c/'+id},URL,Date});
 return {document,context,read:()=>JSON.parse(JSON.stringify(vm.runInContext(`(${readReactDates.toString()})(['${id}'])`,context)))};
}
function attach(element,props){
 const root={tag:3,stateNode:{},memoizedProps:{}};root.stateNode.current=root;
 let parent=root;const nodes=[];
 for(const p of [...props].reverse()){const node={return:parent,memoizedProps:p};parent.child=node;parent=node;nodes.unshift(node);}
 element.__reactFiber$fixture=parent;return {root,nodes,leaf:parent};
}
test('serialized reader obtains exact sidebar conversation dates and never evaluates unrelated getters',()=>{
 const p=page(),conversation={id,title:'Test title',create_time:created,update_time:updated};
 Object.defineProperty(conversation,'content',{get(){throw Error('body read')}});
 Object.defineProperty(conversation,'token',{get(){throw Error('token read')}});
 attach(p.document.querySelector('a'),[{}, {conversation}]);
 assert.deepEqual(p.read(),[{id,createdAt:created,updatedAt:updated,lastMessageAt:null,dateEvidence:'react-v1'}]);
});
test('milliseconds and ISO dates normalize; wrong IDs, message objects, future and conflicting dates fail closed',()=>{
 const p=page(),link=p.document.querySelector('a');
 attach(link,[{thread:{id,title:'Test',createdAt:created*1000,updatedAt:new Date(updated*1000).toISOString()}}]);assert.equal(p.read()[0].updatedAt,updated);
 for(const value of [{id:other,title:'Wrong',update_time:updated},{id,title:'Message',author:{role:'user'},create_time:created},{id,title:'Future',update_time:Date.now()/1000+86400},{id,title:'Conflict',update_time:updated,updatedAt:updated+1},{id,title:'Inverted',create_time:updated,update_time:created}]){
  attach(link,[{conversation:value}]);assert.deepEqual(p.read(),[]);
 }
});
test('committed alternate wins over stale fiber and disconnected/cyclic fibers cannot supply dates',()=>{
 const p=page(),link=p.document.querySelector('a'),old=attach(link,[{conversation:{id,title:'Old',update_time:created}}]);
 const newRoot={tag:3,stateNode:old.root.stateNode},newLeaf={return:newRoot,memoizedProps:{conversation:{id,title:'New',update_time:updated}}};
 newRoot.child=newLeaf;old.root.alternate=newRoot;old.leaf.alternate=newLeaf;old.root.stateNode.current=newRoot;
 assert.equal(p.read()[0].updatedAt,updated);
 newRoot.child=null;assert.deepEqual(p.read(),[]);
 old.leaf.return=old.leaf;assert.deepEqual(p.read(),[]);
});
test('classic message timestamps stay separate from conversation modified dates and require matching chat/message IDs',()=>{
 const p=page('<main><div data-message-id="m1">PRIVATE TEXT</div></main>'),element=p.document.querySelector('[data-message-id]');
 const message={id:'m1',author:{role:'user'},create_time:messageTime};
 Object.defineProperty(message,'content',{get(){throw Error('body read')}});
 attach(element,[{}, {messages:[message]}, {conversationId:id}]);
 assert.deepEqual(p.read(),[{id,createdAt:null,updatedAt:null,lastMessageAt:messageTime,dateEvidence:'react-v1'}]);
 attach(element,[{messages:[message]},{conversationId:other}]);assert.deepEqual(p.read(),[]);
 attach(element,[{messages:[{...message,id:'m2'}]},{conversationId:id}]);assert.deepEqual(p.read(),[]);
});
test('redesigned shell uses only a snapshot matched to the live turn and user message',()=>{
 const p=page('<main data-app-shell-main-surface><div data-thread-find-target="conversation"><div data-turn-key="t1"><div data-chatgpt-search-unit-key="t1:user" data-chatgpt-search-message-ids="m1">PRIVATE BODY</div></div></div></main>');
 const turn={items:[{type:'user-message',messageId:'m1'}]},entry={id:'t1',conversationId:id,turn};
 const message={id:'m1',author:{role:'user'},create_time:messageTime};Object.defineProperty(message,'content',{get(){throw Error('body read')}});
 const snapshot={renderedConversation:{id,title:'Test',create_time:created,update_time:updated,mapping:{m1:{id:'m1',message}}},renderedTurns:[{id:'t1',turn}]};
 const tree=attach(p.document.querySelector('[data-turn-key]'),[{entry},{conversationId:id}]);tree.nodes[1].memoizedState={memoizedState:snapshot};
 assert.deepEqual(p.read(),[{id,createdAt:created,updatedAt:updated,lastMessageAt:messageTime,dateEvidence:'react-v1'}]);
 snapshot.renderedTurns[0].turn={};assert.deepEqual(p.read(),[]);
});
test('dates survive protocol, encrypted metadata normalization, later missing dates and catalog merges',()=>{
 const raw={version:1,coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[{id,title:'Test',webUrl:'https://chatgpt.com/c/'+id,updatedAt:null,rank:0,pinned:false}]};
 const withDates=withReactDates(raw,[{id,createdAt:created,updatedAt:updated,lastMessageAt:messageTime,dateEvidence:'react-v1'}]);
 const snapshot=normalizeSnapshot(browserSnapshot(withDates,other));assert.equal(snapshot.items[0].updatedAt,updated);assert.equal(snapshot.items[0].lastMessageAt,messageTime);
 const later=browserSnapshot(raw,other);snapshot.observedAt=new Date(Date.now()-1000).toISOString();
 const accumulated=accumulateDevice(snapshot,later);assert.equal(accumulated.items[0].createdAt,created);assert.equal(accumulated.items[0].updatedAt,updated);assert.equal(accumulated.items[0].lastMessageAt,messageTime);
 const exported={schemaVersion:1,source:'chatgpt-export',deviceId:id,observedAt:raw.observedAt,items:[{id,kind:'chatgpt',title:'Exported',updatedAt:updated+500,createdAt:created,archived:false}]};
 for(const snapshots of [[snapshot,exported],[exported,snapshot]]){const item=mergeCatalogs([],snapshots)[0];assert.equal(item.updatedAt,updated+500);assert.equal(item.lastMessageAt,messageTime);}
 const noEvidence=structuredClone(withDates);delete noEvidence.items[0].dateEvidence;assert.throws(()=>browserSnapshot(noEvidence,other));
 const future=structuredClone(withDates);future.items[0].lastMessageAt=Date.now()/1000+86400;assert.throws(()=>browserSnapshot(future,other));
});
test('activity date explicitly distinguishes observed messages, creation and actual modification',()=>{
 const item={createdAt:created,updatedAt:updated,lastMessageAt:messageTime};
 assert.equal(conversationDate(item).timestamp,messageTime);assert.equal(conversationDate(item).source,'message');
 assert.equal(conversationDate(item,'updated').timestamp,updated);assert.equal(conversationDate(item,'created').timestamp,created);
 assert.equal(conversationDate({lastMessageAt:messageTime},'updated').timestamp,null);
 assert.equal(conversationDate({createdAt:created}).source,'created');assert.equal(conversationDate({}).timestamp,null);
});
test('extension reads date metadata in MAIN world and returns the same validated v2 payload',async()=>{
 const source=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const calls=[];let receive;
 const raw={version:1,coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[{id,title:'Test',webUrl:'https://chatgpt.com/c/'+id,updatedAt:null,rank:0,pinned:false}]};
 const context={Date,Map,Error,Promise,inspectSidebar:()=>{},readReactDates,withReactDates,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>receive=fn}},storage:{session:{get:async()=>({['request:'+id]:{hubTab:1,reviewTab:3,created:Date.now()}})}},tabs:{get:async()=>({url:'https://chatgpt.com/c/'+id}),onRemoved:{addListener(){}}},scripting:{executeScript:async request=>{calls.push(request);return [{result:request.world==='MAIN'?[{id,createdAt:created,updatedAt:updated,lastMessageAt:null,dateEvidence:'react-v1'}]:raw}]}}}};
 vm.runInNewContext(source,context);
 const response=await new Promise(resolve=>receive({type:'read',id,tabId:2},{id:'test',tab:{id:3},url:'chrome-extension://test/review.html?request='+id},resolve));
 assert.equal(response.ok,true);assert.equal(calls[1].world,'MAIN');assert.equal(browserSnapshot(response.snapshot,other).items[0].updatedAt,updated);
});
