import {inspectSidebar} from './collector.js';
import {readReactDates,withReactDates} from './react-dates.js';
const HUB='https://baelab-create.github.io/chat-history-hub/';
const allowedHub=url=>typeof url==='string'&&url.startsWith(HUB);
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 (async()=>{
  if(['ping','begin','abort'].includes(m?.type)){
   if(sender.id!==chrome.runtime.id||!allowedHub(sender.url)||sender.frameId!==0||!sender.tab?.id||!/^[-a-f0-9]{36}$/.test(m.id||''))throw Error('잘못된 요청입니다.');
   if(m.type==='ping')return {version:chrome.runtime.getManifest().version};
   const key='request:'+m.id,existing=await chrome.storage.session.get(key);
   if(m.type==='abort'){if(existing[key]?.hubTab===sender.tab.id)await chrome.storage.session.remove(key);return {ok:true};}
   if(existing[key])return {ok:true};
   await chrome.storage.session.set({[key]:{hubTab:sender.tab.id,created:Date.now()}});
   try{const review=await chrome.tabs.create({url:chrome.runtime.getURL('review.html')+'?request='+m.id});await chrome.storage.session.set({[key]:{hubTab:sender.tab.id,reviewTab:review.id,created:Date.now()}})}catch(e){await chrome.storage.session.remove(key);throw e}return {ok:true};
  }
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('review.html')+'?'))throw Error('잘못된 요청입니다.');
  const key='request:'+m.id,request=(await chrome.storage.session.get(key))[key];
  if(!request||Date.now()-request.created>1800000)throw Error('요청이 만료됐습니다. Hub에서 최신화를 다시 눌러 주세요.');
  if(m.type==='tabs')return {tabs:(await chrome.tabs.query({url:'https://chatgpt.com/*'})).map(t=>({id:t.id,title:t.title||'ChatGPT'}))};
  if(['read','advance','reset-scan'].includes(m.type)){
   const tab=await chrome.tabs.get(m.tabId);
   if(!tab.url?.startsWith('https://chatgpt.com/'))throw Error('ChatGPT 탭을 선택해 주세요.');
   const [r]=await chrome.scripting.executeScript({target:{tabId:m.tabId},func:inspectSidebar,args:[{action:m.type==='read'?'read':m.type==='reset-scan'?'reset':'advance',retry:m.retry===true}]});
   if(!r?.result)throw Error('목록을 읽지 못했습니다.');
   if(m.type!=='read')return {step:r.result};
   const [dates]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:readReactDates,args:[r.result.items.map(row=>row.id)]});
   return {snapshot:withReactDates(r.result,dates?.result||[])};
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
// Closing review must release Hub immediately, rather than waiting 30 minutes.
chrome.tabs.onRemoved.addListener(tabId=>{
 void (async()=>{for(const [key,request] of Object.entries(await chrome.storage.session.get(null))){
  if(!key.startsWith('request:')||![request.hubTab,request.reviewTab].includes(tabId))continue;
  await chrome.storage.session.remove(key);
  if(tabId===request.reviewTab)await chrome.tabs.sendMessage(request.hubTab,{type:'error',id:key.slice(8),error:'미리보기를 닫았습니다. 최신화를 다시 누르면 새로 시작할 수 있습니다.'}).catch(()=>{});
 }})().catch(()=>{});
});
