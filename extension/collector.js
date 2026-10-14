// Read rendered sidebar metadata only. Never access cookies, app state or private APIs.
export function collectSidebar(){
 const root=document.querySelector('#app-shell-sidebar');
 if(!root)throw Error('ChatGPT 홈에서 사이드바를 펼친 뒤 다시 읽어 주세요.');
 const groups=[...root.querySelectorAll('section')].map(section=>({section,label:section.querySelector('button')?.textContent.trim()}));
 const recent=groups.find(x=>/^(최근|Recent|Recents)$/i.test(x.label||''));
 const pinned=groups.find(x=>/^(고정된 스레드|고정|Pinned|Pinned threads)$/i.test(x.label||''));
 if(!recent)throw Error('최근 목록 영역을 확인하지 못했습니다. ChatGPT 홈에서 최근 목록을 펼쳐 주세요.');
 const rows=new Map();
 for(const [group,kind] of [[recent,'recent'],[pinned,'pinned']]){
  if(!group)continue;
  let rank=0;
  for(const a of group.section.querySelectorAll('a[href]')){
   const url=new URL(a.getAttribute('href'),location.origin);
   const match=url.pathname.match(/\/(?:c)\/([a-f0-9-]{36})\/?$/i);
   if(url.origin!=='https://chatgpt.com'||!match||url.search||url.hash)continue;
   if(!a.getClientRects().length||a.closest('[hidden],[aria-hidden="true"]'))continue;
   const title=(a.getAttribute('aria-label')||a.innerText||'').trim();
   if(!title||title.length>1000)continue;
   const id=match[1],old=rows.get(id);
   if(old){if(kind==='pinned')old.pinned=true;continue;}
   rows.set(id,{id,title,webUrl:'https://chatgpt.com/c/'+id,updatedAt:null,rank:kind==='recent'?rank++:null,pinned:kind==='pinned'});
  }
 }
 if(![...rows.values()].some(r=>r.rank!==null))throw Error('읽을 수 있는 최근 대화가 없습니다. 로그인과 목록 표시 상태를 확인해 주세요.');
 if(rows.size>50000)throw Error('목록이 너무 큽니다. 한 번에 50,000개까지 읽을 수 있습니다.');
 return {version:1,observedAt:new Date().toISOString(),coverage:'loaded-sidebar-only',items:[...rows.values()]};
}

// Only operate the observed sidebar's scrolling and its own load-more control.
export async function advanceSidebar({reset=false,retry=false}={}){
 const root=document.querySelector('#app-shell-sidebar');
 const recent=[...(root?.querySelectorAll('section')||[])].find(s=>/^(최근|Recent|Recents)$/i.test(s.querySelector('button')?.textContent.trim()||''));
 if(!recent)throw Error('최근 목록 영역이 닫혔습니다. 다시 펼쳐 주세요.');
 let scroller=recent;
 while(scroller&&scroller!==root&&!(/auto|scroll/.test(getComputedStyle(scroller).overflowY)&&scroller.scrollHeight>scroller.clientHeight))scroller=scroller.parentElement;
 if(!scroller)throw Error('목록 스크롤 영역을 확인하지 못했습니다.');
 if(reset){scroller.scrollTop=0;await new Promise(r=>setTimeout(r,500));return {atBottom:false};}
 const retryButton=[...recent.querySelectorAll('button')].find(b=>/^(다시 시도|Retry|Try again)$/i.test(b.textContent.trim())&&b.getClientRects().length);
 const more=[...recent.querySelectorAll('button')].find(b=>/^(더 보기|Show more|Load more)$/i.test(b.textContent.trim())&&b.getClientRects().length);
 let clicked=false;
 if(retry&&retryButton&&!retryButton.disabled){retryButton.click();clicked=true;}
 else if(more&&!more.disabled){more.click();clicked=true;}
 else scroller.scrollBy({top:Math.max(200,scroller.clientHeight*.75),behavior:'instant'});
 await new Promise(r=>setTimeout(r,retry?3000:1000));
 return {atBottom:scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4,busy:Boolean(recent.querySelector('[aria-busy="true"],[role="progressbar"]'))||/채팅 불러오는 중|Loading chats/i.test(recent.innerText),clicked,error:/대화 기록을 불러올 수 없|불러오지 못|unable to load|failed to load/i.test(recent.innerText),retryAvailable:Boolean(retryButton)};
}
