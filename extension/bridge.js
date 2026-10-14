(()=>{
 const allowed=()=>location.origin==='https://baelab-create.github.io'&&location.pathname.startsWith('/chat-history-hub/');
 if(!allowed()||window.top!==window)return;
 const pending=new Set();
 window.addEventListener('message',event=>{
  const m=event.data;
  if(event.source!==window||event.origin!==location.origin||!allowed()||m?.channel!=='hub-browser-v1'||!/^[-a-f0-9]{36}$/.test(m.id||''))return;
  if(m.type==='ping'){window.postMessage({channel:'hub-browser-response-v1',id:m.id,type:'ready'},location.origin);return;}
  if(m.type==='abort'&&pending.has(m.id)){pending.delete(m.id);chrome.runtime.sendMessage({type:'abort',id:m.id}).catch(()=>{});return;}
  if(m.type!=='collect'||pending.size)return;
  pending.add(m.id);
  chrome.runtime.sendMessage({type:'begin',id:m.id}).then(r=>{if(!r?.ok)throw Error();}).catch(()=>{pending.delete(m.id);window.postMessage({channel:'hub-browser-response-v1',id:m.id,type:'error',error:'확장 프로그램을 다시 연결하려면 페이지를 새로고침해 주세요.'},location.origin)});
  setTimeout(()=>pending.delete(m.id),300000);
 });
 chrome.runtime.onMessage.addListener(m=>{
  if(!allowed()||!pending.has(m.id)||!['result','error'].includes(m.type))return;
  pending.delete(m.id);
  window.postMessage({...m,channel:'hub-browser-response-v1'},location.origin);
 });
})();
