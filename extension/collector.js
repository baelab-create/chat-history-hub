// Serialized by chrome.scripting: keep all DOM helpers inside this function.
// Read rendered sidebar metadata only, never cookies, app state, APIs or bodies.
export function inspectSidebar({action='read',retry=false}={}){
 const visible=node=>Boolean(node?.getClientRects().length)&&!node.closest('[hidden],[aria-hidden="true"],[inert]');
 const selectors=['#app-shell-sidebar','#history','[data-testid="history"]','nav[aria-label="Chat history"]','nav[aria-label="채팅 기록"]'];
 const root=selectors.map(s=>document.querySelector(s)).filter(Boolean).find(visible);
 if(!root)throw Error('ChatGPT 탭에서 대화 사이드바를 펼친 뒤 다시 읽어 주세요.');
 const label=section=>(section.querySelector('h2,h3,[role="heading"],button')?.textContent||'').trim();
 const groups=[...root.querySelectorAll('section')].map(section=>({section,label:label(section)}));
 const recent=groups.find(x=>/^(최근|최근 대화|Recent|Recents|Recent chats)$/i.test(x.label));
 const pinned=groups.find(x=>/^(고정된 스레드|고정|Pinned|Pinned threads|Pinned chats)$/i.test(x.label));
 if(root.id==='app-shell-sidebar'&&!recent)throw Error('최근 목록 영역을 확인하지 못했습니다. ChatGPT 홈에서 최근 목록을 펼쳐 주세요.');
 const surface=recent?.section||root;
 if(action==='read'){
  const rows=new Map();let rank=0;
  for(const [area,kind] of [[surface,'recent'],[pinned?.section,'pinned']]){
   if(!area)continue;
   for(const a of area.querySelectorAll('a[href]')){
    if(!visible(a))continue;
    let url;try{url=new URL(a.getAttribute('href'),location.origin)}catch{continue;}
    const match=url.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i);
    if(url.origin!=='https://chatgpt.com'||!match||url.search||url.hash)continue;
    const title=(a.innerText||a.textContent||a.getAttribute('aria-label')||'').trim();
    if(!title||title.length>1000)continue;
    const id=match[1].toLowerCase(),isPinned=kind==='pinned'||Boolean(pinned?.section.contains(a));
    const old=rows.get(id);if(old){old.pinned ||= isPinned;continue;}
    rows.set(id,{id,title,webUrl:'https://chatgpt.com/c/'+id,updatedAt:null,rank:isPinned?null:rank++,pinned:isPinned});
   }
  }
  if(!rows.size)throw Error('표시된 대화가 없습니다. 로그인과 사이드바 목록을 확인해 주세요.');
  if(rows.size>50000)throw Error('한 번에 50,000개까지 읽을 수 있습니다.');
  return {version:1,observedAt:new Date().toISOString(),coverage:'loaded-sidebar-only',items:[...rows.values()]};
 }
 return (async()=>{
  let scroller=surface;
  while(scroller&&scroller!==document.body){
   if(/auto|scroll/.test(getComputedStyle(scroller).overflowY)&&scroller.scrollHeight>scroller.clientHeight)break;
   scroller=scroller.parentElement;
  }
  // A short history may have no overflow. Never scroll the conversation body.
  if(!scroller||scroller===document.body)scroller=surface;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  if(action==='reset'){scroller.scrollTop=0;await pause(500);return {atBottom:false};}
  if(action!=='advance')throw Error('지원하지 않는 읽기 동작입니다.');
  const button=pattern=>[...surface.querySelectorAll('button')].find(b=>visible(b)&&pattern.test(b.textContent.trim()));
  const retryPattern=/^(다시 시도|Retry|Try again)$/i;
  const more=button(/^(더 보기|더보기|Show more|Load more)$/i),retryButton=button(retryPattern);
  let clicked=false;
  if(retry&&retryButton&&!retryButton.disabled){retryButton.click();clicked=true;}
  else if(more&&!more.disabled){more.click();clicked=true;}
  else scroller.scrollBy({top:Math.max(200,scroller.clientHeight*.75),behavior:'instant'});
  await pause(retry?3000:1000);
  const text=surface.innerText||surface.textContent||'';
  return {atBottom:scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4,
   busy:[...surface.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible)||/채팅 불러오는 중|Loading chats/i.test(text),
   clicked,error:/대화 기록을 불러올 수 없|불러오지 못|unable to load|failed to load/i.test(text),retryAvailable:Boolean(button(retryPattern))};
 })();
}
export const collectSidebar=()=>inspectSidebar();
export const advanceSidebar=({reset=false,retry=false}={})=>inspectSidebar({action:reset?'reset':'advance',retry});
