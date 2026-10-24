import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {inspectSidebar,collectSidebar} from '../extension/collector.js';
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const link=(n,title,attrs='')=>`<a href="/c/${id(n)}" ${attrs}>${title}</a>`;
function dom(html){
 const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
 window.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden],[aria-hidden="true"]')?[]:[{}]};
 return {document,location:{origin:'https://chatgpt.com'},URL,Date,Error,Boolean,Map,getComputedStyle:()=>({overflowY:'auto'}),setTimeout:fn=>fn()};
}
function read(html){const context=vm.createContext(dom(html));return JSON.parse(JSON.stringify(vm.runInContext(`(${inspectSidebar.toString()})()`,context)));}
test('serialized Work collector preserves order, ignores project/body/hidden links and merges pinned duplicates',()=>{
 const s=read(`<aside id="app-shell-sidebar"><section><button>프로젝트</button>${link('3','ignore')}</section><section><button>고정된 스레드</button>${link('1','duplicate')}${link('2','pinned')}</section><section><button>최근</button>${link('1','recent')}${link('4','hidden','hidden')}<a href="https://evil.test/c/${id('5')}">foreign</a></section></aside><main>${link('6','body')}</main>`);
 assert.deepEqual(s.items.map(r=>[r.title,r.rank,r.pinned]),[['recent',0,true],['pinned',null,true]]);
});
test('standard browser history works without Work sections or Korean Recent button',()=>{
 const s=read(`<nav><div id="history"><h2>Today</h2>${link('1','new title','aria-label="Open chat"')}<h2>Yesterday</h2><a href="/g/g-example/c/${id('2')}">project conversation</a></div></nav><main>${link('3','body')}</main>`);
 assert.deepEqual(s.items.map(r=>[r.title,r.rank]),[['new title',0],['project conversation',1]]);
 assert.equal(s.items[1].webUrl,'https://chatgpt.com/c/'+id('2'));
});
test('aria-labelled history and heading-based Recent groups are supported',()=>{
 assert.equal(read(`<nav aria-label="Chat history">${link('1','standard')}</nav>`).items[0].title,'standard');
 assert.equal(read(`<aside id="app-shell-sidebar"><section><h2>Recent chats</h2>${link('1','work')}</section></aside>`).items[0].title,'work');
});
test('missing, hidden or collapsed known sidebar fails without reading main conversation',()=>{
 for(const html of [`<main>${link('1','body')}</main>`,`<div id="history" hidden>${link('1','hidden')}</div>`,`<aside id="app-shell-sidebar"><section><button>프로젝트</button>${link('1','project')}</section></aside>`])assert.throws(()=>read(html),/사이드바|최근/);
});
test('reset finds a scrollable ancestor outside standard history, not document body',async()=>{
 const context=dom(`<nav id="scroll"><div id="history">${link('1','title')}</div></nav>`),scroller=context.document.getElementById('scroll');
 scroller.scrollHeight=1000;scroller.clientHeight=200;scroller.scrollTop=600;
 await vm.runInContext(`(${inspectSidebar.toString()})({action:'reset'})`,vm.createContext(context));assert.equal(scroller.scrollTop,0);
});
