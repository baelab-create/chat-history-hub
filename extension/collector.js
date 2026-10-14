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
 if(rows.size>500)throw Error('목록이 너무 큽니다. 최근 목록만 펼친 뒤 다시 읽어 주세요.');
 return {version:1,observedAt:new Date().toISOString(),coverage:'loaded-sidebar-only',items:[...rows.values()]};
}
