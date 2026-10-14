export function requestBrowserSnapshot({signal,onReady}={}){
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),origin=location.origin;let ready=false;
  let timer;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);signal?.removeEventListener('abort',abort)};
  const fail=message=>{if(ready)window.postMessage({channel:'hub-browser-v1',type:'abort',id},origin);cleanup();reject(Error(message))};
  const abort=()=>fail('최신화를 취소했습니다.');
  const receive=event=>{
   const m=event.data;if(event.source!==window||event.origin!==origin||m?.channel!=='hub-browser-response-v1'||m.id!==id)return;
   if(m.type==='ready'&&!ready){ready=true;clearTimeout(timer);timer=setTimeout(()=>fail('미리보기 시간이 만료됐습니다. 최신화를 다시 눌러 주세요.'),300000);onReady?.();window.postMessage({channel:'hub-browser-v1',type:'collect',id},origin)}
   else if(ready&&m.type==='result'){cleanup();resolve(m.snapshot)}
   else if(m.type==='error')fail(typeof m.error==='string'?m.error.slice(0,300):'브라우저 연결을 확인해 주세요.');
  };
  if(signal?.aborted){abort();return;}
  window.addEventListener('message',receive);signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>fail('Chrome용 최근 목록 확장 프로그램이 필요합니다. 아래 설치 안내를 확인하고, 설치 후 이 페이지를 새로고침해 주세요.'),2000);
  window.postMessage({channel:'hub-browser-v1',type:'ping',id},origin);
 });
}
export function browserSnapshot(raw,deviceId){
 if(raw?.version!==1||raw.coverage!=='loaded-sidebar-only'||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>500)throw Error('브라우저 목록 형식을 확인할 수 없습니다.');
 const time=Date.parse(raw.observedAt);if(!Number.isFinite(time)||time>Date.now()+60000||time<Date.now()-600000)throw Error('목록이 오래됐습니다. 다시 읽어 주세요.');
 if(!/^[a-f0-9-]{36}$/.test(deviceId))throw Error('브라우저 식별자를 확인해 주세요.');
 const seen=new Set();
 const items=raw.items.map(row=>{
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(row?.id)||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>1000||row.webUrl!=='https://chatgpt.com/c/'+row.id||row.updatedAt!==null||!(row.rank===null||Number.isInteger(row.rank)&&row.rank>=0&&row.rank<500)||typeof row.pinned!=='boolean')throw Error('목록 항목을 검증하지 못했습니다.');
  seen.add(row.id);return {id:row.id,title:row.title.trim(),kind:'chatgpt',updatedAt:null,archived:false,project:'프로젝트 없음',sidebarRank:row.rank,pinned:row.pinned,browserObservedAt:new Date(time).toISOString()};
 });
 if(!items.some(i=>i.sidebarRank!==null))throw Error('최근 대화가 없습니다.');
 return {schemaVersion:1,deviceId,deviceName:'Chrome · 최근 목록',source:'browser-sidebar',collectionMode:'manual',observedAt:new Date(time).toISOString(),cloudObservedAt:new Date(time).toISOString(),localObservedAt:null,cloudMode:'browser-sidebar',cloudState:'connected',sourceError:null,items};
}
