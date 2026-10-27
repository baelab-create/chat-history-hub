import {inspectSidebar} from './collector.js';
import {readReactDates,withReactDates} from './react-dates.js';

// Only used on a temporary page opened by an explicit Hub refresh click.
// Interact with known sidebar controls, never sign-in forms or conversation inputs.
export function prepareSidebar(){
 const visible=e=>Boolean(e?.getClientRects().length)&&!e.closest('[hidden],[aria-hidden="true"],[inert]');
 const roots=['#app-shell-sidebar','#history','[data-testid="history"]','nav[aria-label="Chat history"]','nav[aria-label="채팅 기록"]'];
 const root=roots.map(s=>document.querySelector(s)).find(visible);
 if(root){
  const recent=[...root.querySelectorAll('button[aria-expanded="false"]')].find(e=>visible(e)&&/^(최근|최근 대화|Recent|Recents|Recent chats)$/i.test((e.textContent||'').trim()));
  if(recent){recent.click();return 'loading';}
  return 'ready';
 }
 const buttons=[...document.querySelectorAll('button')].filter(visible);
 const open=buttons.find(e=>/^(Open sidebar|사이드바 열기)$/i.test(e.getAttribute('aria-label')||'')||e.getAttribute('data-testid')==='open-sidebar-button');
 if(open){open.click();return 'loading';}
 if(buttons.some(e=>/^(Log in|Login|로그인)$/i.test((e.textContent||'').trim()))||[...document.querySelectorAll('a[href]')].some(e=>visible(e)&&/^(Log in|Login|로그인)$/i.test((e.textContent||'').trim())))return 'login';
 return 'loading';
}
const error=(code,message)=>Object.assign(Error(message),{code});
export async function quickSync({chrome,hubTab,check,progress=async()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeout=45000}){
 let tabId,touched=false,keep=false;
 const activated=info=>{if(info.tabId===tabId)touched=true;};
 chrome.tabs.onActivated.addListener(activated);
 try{
  await check();await progress('ChatGPT에서 최근 목록을 확인하고 있습니다…');
  const tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:false,...(Number.isInteger(hubTab.windowId)?{windowId:hubTab.windowId}:{})});
  tabId=tab.id;touched=tab.active===true;
  const deadline=now()+timeout;let lastError='';
  while(now()<deadline){
   await check();
   let current;try{current=await chrome.tabs.get(tabId)}catch{throw error('TAB_CLOSED','ChatGPT 확인 탭이 닫혔습니다. 최신화를 다시 눌러 주세요.');}
   if(current.status==='complete'){
    if(current.url&&!current.url.startsWith('https://chatgpt.com/')){keep=true;throw error('LOGIN_REQUIRED','열린 ChatGPT 탭에서 로그인한 뒤 이 페이지의 최신화를 다시 눌러 주세요.');}
    let state;
    try{const [result]=await chrome.scripting.executeScript({target:{tabId},func:prepareSidebar});state=result?.result;}catch{lastError='ChatGPT 화면에 연결하지 못했습니다.';}
    if(state==='login'){keep=true;throw error('LOGIN_REQUIRED','열린 ChatGPT 탭에서 로그인한 뒤 이 페이지의 최신화를 다시 눌러 주세요.');}
    if(state==='ready'){
     let raw;
     try{const [r]=await chrome.scripting.executeScript({target:{tabId},func:inspectSidebar});raw=r?.result;}catch(e){lastError=e.message;}
     if(raw?.items?.length){
      await check();
      const [dates]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:readReactDates,args:[raw.items.map(row=>row.id)]});
      await check();
      return withReactDates(raw,dates?.result||[]);
     }
    }
   }
   await pause(750);
  }
  throw error('PAGE_UNAVAILABLE','ChatGPT의 최근 목록을 확인하지 못했습니다. 로그인 상태를 확인하거나 설정에서 직접 탭을 선택해 주세요.'+(lastError?' '+lastError.slice(0,120):''));
 }finally{
  // Never close an existing/user-visited tab, or one used for signing in.
  if(tabId&&!keep&&!touched){try{const tab=await chrome.tabs.get(tabId);if(!tab.active&&tab.url==='https://chatgpt.com/')await chrome.tabs.remove(tabId)}catch{}}
  chrome.tabs.onActivated.removeListener(activated);
 }
}
