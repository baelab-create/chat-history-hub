// Incremental scan: merge every rendered page so virtualized rows are not lost.
export async function scanHistory({read,advance,onProgress=()=>{},stopped=()=>false,maxItems=50000,maxMs=1200000,now=()=>Date.now()}){
 const rows=new Map(),started=now();let stable=0,rank=0,reason='stopped';
 while(!stopped()){
  let snapshot;try{snapshot=await read()}catch(error){if(!rows.size)throw error;reason='load-error';break;}let added=0;
  for(const item of snapshot.items){
   const old=rows.get(item.id);
   if(old){old.title=item.title;old.pinned ||= item.pinned;if(old.rank===null&&item.rank!==null)old.rank=rank++;continue;}
   if(rows.size>=maxItems){reason='limit';break;}
   rows.set(item.id,{...item,rank:item.rank===null?null:rank++});added++;
  }
  onProgress(rows.size);
  if(rows.size>=maxItems){reason='limit';break;}
  if(now()-started>=maxMs){reason='time-limit';break;}
  if(stopped())break;
  let step;try{step=await advance()}catch{reason='load-error';break;}
  if(step.error){reason='load-error';break;}
  stable=step.atBottom&&!step.busy&&!step.clicked&&!added?stable+1:0;
  if(stable>=8){reason='no-more-visible';break;}
 }
 if(!rows.size)throw Error('가져온 대화가 없습니다. ChatGPT 로그인과 사이드바를 확인해 주세요.');
 return {version:1,observedAt:new Date(now()).toISOString(),coverage:'loaded-sidebar-only',scan:{reason,count:rows.size},items:[...rows.values()]};
}
