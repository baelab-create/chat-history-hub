const dated=t=>Number.isFinite(t.updatedAt)&&t.updatedAt>0;
const key=t=>(t.kind||'chatgpt')+':'+t.id;
const day=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t*1000));
export function arrangeConversations(items){
 const batches=new Map();
 for(const t of items)if(t.browserObservedAt&&Number.isInteger(t.sidebarRank)){
  if(!batches.has(t.browserObservedAt))batches.set(t.browserObservedAt,[]);
  batches.get(t.browserObservedAt).push(t);
 }
 const ordered=[],seen=new Set();
 for(const [,batch] of [...batches].sort(([a],[b])=>b.localeCompare(a))){
  batch.sort((a,b)=>a.sidebarRank-b.sidebarRank||key(a).localeCompare(key(b)));
  // The newest observation owns every position. Older unmatched rows remain available.
  for(const t of batch)if(!seen.has(key(t))){ordered.push(t);seen.add(key(t));}
 }
 const remaining=items.filter(t=>!seen.has(key(t))).sort((a,b)=>(dated(b)?b.updatedAt:-Infinity)-(dated(a)?a.updatedAt:-Infinity)||key(a).localeCompare(key(b)));
 // Never infer chronology from pinned-only entries or compare ranks across observations.
 const rows=ordered.map(t=>({...t,placement:'browser'}));
 rows.push(...remaining.map(t=>({...t,placement:'saved'})));
 let next=null,nextCohort=null;const nextDates=new Array(ordered.length);
 for(let i=ordered.length-1;i>=0;i--){if(ordered[i].browserObservedAt!==nextCohort){next=null;nextCohort=ordered[i].browserObservedAt;}nextDates[i]=next;if(dated(ordered[i]))next=ordered[i].updatedAt;}
 let previous=null,cohort=null;
 for(let i=0;i<ordered.length;i++){
  const t=rows[i];if(t.browserObservedAt!==cohort){previous=null;cohort=t.browserObservedAt;}
  if(dated(t)){previous=t.updatedAt;continue;}
  // Only bracket within the same observation; saved timestamps can be stale or contradictory.
  const following=nextDates[i];
  if(previous!==null&&following!==null&&previous>=following){
   const newer=day(previous),older=day(following);
   t.inferredDateLabel=newer===older?newer+' · 추정 날짜':older+' ~ '+newer+' 사이 · 추정';
  }
 }
 return rows;
}
export function conversationGroup(t){
 if(t.placement==='saved')return '이전 저장 목록 · 현재 Chrome 순서 미확인';
 if(dated(t))return day(t.updatedAt);
 return t.inferredDateLabel||'날짜 미확인 · Chrome 순서 유지';
}
