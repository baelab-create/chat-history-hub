import {collectSidebar,advanceSidebar} from './collector.js';
const HUB='https://baelab-create.github.io/chat-history-hub/';
const allowedHub=url=>typeof url==='string'&&url.startsWith(HUB);
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 (async()=>{
  if(m?.type==='begin'||m?.type==='abort'){
   if(sender.id!==chrome.runtime.id||!allowedHub(sender.url)||sender.frameId!==0||!sender.tab?.id||!/^[-a-f0-9]{36}$/.test(m.id||''))throw Error('잘못된 요청입니다.');
   const key='request:'+m.id,existing=await chrome.storage.session.get(key);
   if(m.type==='abort'){if(existing[key]?.hubTab===sender.tab.id)await chrome.storage.session.remove(key);return {ok:true};}
   if(existing[key])return {ok:true};
   await chrome.storage.session.set({[key]:{hubTab:sender.tab.id,created:Date.now()}});
   await chrome.tabs.create({url:chrome.runtime.getURL('review.html')+'?request='+m.id});return {ok:true};
  }
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('review.html')+'?'))throw Error('잘못된 요청입니다.');
  const key='request:'+m.id,request=(await chrome.storage.session.get(key))[key];
  if(!request||Date.now()-request.created>1800000)throw Error('요청이 만료됐습니다. Hub에서 최신화를 다시 눌러 주세요.');
  if(m.type==='tabs')return {tabs:(await chrome.tabs.query({url:'https://chatgpt.com/*'})).map(t=>({id:t.id,title:t.title||'ChatGPT'}))};
  if(['read','advance','reset-scan'].includes(m.type)){
   const tab=await chrome.tabs.get(m.tabId);
   if(!tab.url?.startsWith('https://chatgpt.com/'))throw Error('ChatGPT 탭을 선택해 주세요.');
   const [r]=await chrome.scripting.executeScript({target:{tabId:m.tabId},func:m.type==='read'?collectSidebar:advanceSidebar,args:m.type==='read'?[]:[{reset:m.type==='reset-scan'}]});
   if(!r?.result)throw Error('목록을 읽지 못했습니다.');
   return m.type==='read'?{snapshot:r.result}:{step:r.result};
  }
  if(m.type==='apply'||m.type==='cancel'){
   const tab=await chrome.tabs.get(request.hubTab);
   if(!allowedHub(tab.url))throw Error('Hub 페이지가 닫혔거나 다른 페이지로 이동했습니다.');
   await chrome.tabs.sendMessage(request.hubTab,m.type==='apply'?{type:'result',id:m.id,snapshot:m.snapshot}:{type:'error',id:m.id,error:'가져오기를 취소했습니다.'});
   await chrome.storage.session.remove(key);
   await chrome.tabs.update(request.hubTab,{active:true});return {ok:true};
  }
  throw Error('지원하지 않는 요청입니다.');
 })().then(data=>reply({ok:true,...data})).catch(e=>reply({ok:false,error:e.message}));return true;
});
