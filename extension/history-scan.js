export function mergeDisplayedOrder(previous,current){
 const fresh=[...new Set(current)],present=new Set(fresh);
 if(!previous.some(id=>present.has(id)))return [...previous,...fresh];
 const before=new Map(),tail=[];let next=null;
 for(let i=previous.length-1;i>=0;i--){const id=previous[i];if(present.has(id)){next=id;continue;}if(next===null)tail.push(id);else{if(!before.has(next))before.set(next,[]);before.get(next).push(id);}}
 return fresh.flatMap(id=>[...(before.get(id)||[]).reverse(),id]).concat(tail.reverse());
}
// Incremental scan: merge every rendered page so virtualized rows are not lost.
export async function scanHistory({read,advance,onProgress=()=>{},stopped=()=>false,maxItems=50000,maxMs=1200000,now=()=>Date.now()}){
 const rows=new Map(),started=now();let order=[];let stable=0,rank=0,retries=0,reason='stopped';
 while(!stopped()){
  let snapshot;try{snapshot=await read()}catch(error){if(!rows.size)throw error;reason='load-error';break;}let added=0;
  for(const item of snapshot.items){
   const old=rows.get(item.id);
   if(old){old.title=item.title;old.pinned ||= item.pinned;if(old.rank===null&&item.rank!==null)old.rank=rank++;
    for(const key of ['createdAt','updatedAt','lastMessageAt'])if(item[key]!=null){old[key]=key==='createdAt'?Math.min(old[key]??Infinity,item[key]):Math.max(old[key]??0,item[key]);old.dateEvidence=item.dateEvidence;}
    continue;}
   if(rows.size>=maxItems){reason='limit';break;}
   rows.set(item.id,{...item,rank:item.rank===null?null:rank++});added++;
  }
  order=mergeDisplayedOrder(order,snapshot.items.filter(t=>t.rank!==null&&rows.has(t.id)).map(t=>t.id));
  onProgress(rows.size);
  if(rows.size>=maxItems){reason='limit';break;}
  if(now()-started>=maxMs){reason='time-limit';break;}
  if(stopped())break;
  let step;try{step=await advance()}catch{reason='load-error';break;}
  if(added)retries=0;
  if(step.error&&!step.busy){if(step.retryAvailable&&retries<2){retries++;try{await advance({retry:true})}catch{};continue;}reason='load-error';break;}
  stable=step.atBottom&&!step.busy&&!step.clicked&&!added?stable+1:0;
  if(stable>=8){reason='no-more-visible';break;}
 }
 if(!rows.size)throw Error('가져온 대화가 없습니다. ChatGPT 로그인과 사이드바를 확인해 주세요.');
 const positions=new Map(order.map((id,i)=>[id,i]));
 for(const item of rows.values())item.rank=positions.get(item.id)??null;
 return {version:2,collectorVersion:'1.3.0',observedAt:new Date(now()).toISOString(),coverage:'loaded-sidebar-only',scan:{reason,count:rows.size},items:[...rows.values()]};
}
