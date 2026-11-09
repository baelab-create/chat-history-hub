// The capture hook is installed at document_start only in the nonce-marked home tab.
export function readGeminiCapture(nonce,stop=false){
 const capture=window.__chatHistoryHubGeminiV1;
 if(stop){capture?.stop(nonce);return null;}
 const data=capture?.read(nonce);if(data?.received)return data;
 const visible=e=>Boolean(e?.getClientRects().length)&&!e.closest('[hidden],[aria-hidden="true"],[inert]');
 if([...document.querySelectorAll('a,button')].some(e=>visible(e)&&/^(Sign in|Log in|로그인)$/i.test((e.textContent||'').trim())))return {login:true};
 // Opening the menu may trigger the initial list load on compact layouts.
 const menu=document.querySelector('button[data-test-id="side-nav-menu-button"]');
 if(menu&&visible(menu)&&menu.getAttribute('aria-expanded')==='false')menu.click();
 return data||null;
}
const failure=(code,message)=>Object.assign(Error(message),{code,service:'gemini'});
export async function quickGeminiSync({chrome,hubTab,check,progress=async()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeout=45000}){
 const nonce=crypto.randomUUID(),home='https://gemini.google.com/app';let tabId,touched=false,keep=false;
 const activated=info=>{if(info.tabId===tabId)touched=true};
 chrome.tabs.onActivated.addListener(activated);
 try{
  await check();await progress('Gemini에서 최근 목록과 날짜를 확인하고 있습니다…');
  const tab=await chrome.tabs.create({url:home+'#chat-history-hub='+nonce,active:false,...(Number.isInteger(hubTab.windowId)?{windowId:hubTab.windowId}:{})});
  tabId=tab.id;touched=tab.active===true;const deadline=now()+timeout;
  while(now()<deadline){
   await check();let current;
   try{current=await chrome.tabs.get(tabId)}catch{throw failure('TAB_CLOSED','Gemini 확인 탭이 닫혔습니다. 최신화를 다시 눌러 주세요.');}
   if(current.status==='complete'){
    if(current.url&&!current.url.startsWith('https://gemini.google.com/')){keep=true;throw failure('LOGIN_REQUIRED','열린 Gemini 탭에서 로그인한 뒤 최신화를 다시 눌러 주세요.');}
    let data;
    try{const [result]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:readGeminiCapture,args:[nonce]});data=result?.result;}catch{}
    if(data?.login){keep=true;throw failure('LOGIN_REQUIRED','같은 Chrome에서 Gemini에 로그인한 뒤 최신화를 다시 눌러 주세요.');}
    if(data?.received){
     await check();
     if(!data.items?.length)throw failure('EMPTY_HISTORY','Gemini가 반환한 최근 대화가 없습니다. Gemini의 계정과 활동 기록 보관 설정을 확인해 주세요.');
     return data;
    }
   }
   await pause(750);
  }
  throw failure('PAGE_UNAVAILABLE','Gemini 목록을 확인하지 못했습니다. 같은 Chrome의 Gemini 로그인과 확장 프로그램의 사이트 접근 권한을 확인한 뒤 다시 눌러 주세요.');
 }finally{
  if(tabId){
   try{await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:readGeminiCapture,args:[nonce,true]})}catch{}
   if(!keep&&!touched){try{const tab=await chrome.tabs.get(tabId);const u=new URL(tab.url);if(!tab.active&&u.origin==='https://gemini.google.com'&&/^\/(?:u\/\d+\/)?app\/?$/.test(u.pathname))await chrome.tabs.remove(tabId)}catch{}}
  }
  chrome.tabs.onActivated.removeListener(activated);
 }
}
