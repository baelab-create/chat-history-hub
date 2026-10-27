export const minimumExtensionVersion="1.4.0";
export const requestBrowserSnapshot=options=>exchange({...options,collect:true});
export const probeBrowserExtension=options=>exchange({...options,collect:false});
function exchange({signal,onReady,onProgress,collect,mode='quick'}={}){
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),origin=location.origin;let ready=false;
  let timer;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);signal?.removeEventListener('abort',abort)};
  const fail=(message,code)=>{if(ready)window.postMessage({channel:'hub-browser-v1',type:'abort',id},origin);cleanup();reject(Object.assign(Error(message),{code}))};
  const abort=()=>fail('최신화를 취소했습니다.');
  const receive=event=>{
   const m=event.data;if(event.source!==window||event.origin!==origin||m?.channel!=='hub-browser-response-v1'||m.id!==id)return;
   if(m.type==='ready'&&!ready){
    const parts=typeof m.version==='string'?m.version.split('.').map(Number):[];
    if(parts.length!==3||parts.some(n=>!Number.isInteger(n))||parts[0]<1||(parts[0]===1&&parts[1]<4)){fail('설치된 수집기가 이전 버전입니다. 한 번 클릭으로 최신화하려면 설치·업데이트 안내에서 1.4.0 이상으로 교체한 뒤 이 페이지를 새로고침해 주세요.','EXTENSION_UPDATE');return;}
    if(!collect){cleanup();resolve({version:m.version});return;}
    ready=true;clearTimeout(timer);timer=setTimeout(()=>fail('최신화 시간이 만료됐습니다. 다시 눌러 주세요.','TIMEOUT'),mode==='review'?1800000:90000);onReady?.({version:m.version});window.postMessage({channel:'hub-browser-v1',type:'collect',id,mode},origin)}
   else if(ready&&m.type==='progress'){if(typeof m.message==='string')onProgress?.(m.message.slice(0,200))}
   else if(ready&&m.type==='result'){cleanup();resolve(m.snapshot)}
   else if(m.type==='error')fail(typeof m.error==='string'?m.error.slice(0,300):'브라우저 연결을 확인해 주세요.',m.code);
  };
  if(signal?.aborted){abort();return;}
  window.addEventListener('message',receive);signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>fail('최신화 연결을 한 번 설정해 주세요. 확장 프로그램 설치 후 이 페이지를 새로고침하면 사용할 수 있습니다.','EXTENSION_MISSING'),2500);
  window.postMessage({channel:'hub-browser-v1',type:'ping',id},origin);
 });
}
export function browserSnapshot(raw,deviceId){
 if(![1,2].includes(raw?.version)||raw.coverage!=='loaded-sidebar-only'||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>50000)throw Error('브라우저 목록 형식을 확인할 수 없습니다.');
 const time=Date.parse(raw.observedAt);if(!Number.isFinite(time)||time>Date.now()+60000||time<Date.now()-600000)throw Error('목록이 오래됐습니다. 다시 읽어 주세요.');
 if(!/^[a-f0-9-]{36}$/.test(deviceId))throw Error('브라우저 식별자를 확인해 주세요.');
 const seen=new Set();
 const items=raw.items.map(row=>{
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(row?.id)||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>1000||row.webUrl!=='https://chatgpt.com/c/'+row.id||!(row.rank===null||Number.isInteger(row.rank)&&row.rank>=0&&row.rank<50000)||typeof row.pinned!=='boolean')throw Error('목록 항목을 검증하지 못했습니다.');
  const dates={updatedAt:row.updatedAt,createdAt:row.createdAt??null,lastMessageAt:row.lastMessageAt??null};
  const hasDates=Object.values(dates).some(v=>v!==null);
  if(hasDates&&(raw.version!==2||row.dateEvidence!=='react-v1')||Object.values(dates).some(v=>v!==null&&(!Number.isFinite(v)||v<946684800||v>time/1000+60))||dates.createdAt&&dates.updatedAt&&dates.createdAt>dates.updatedAt)throw Error('대화 날짜를 검증하지 못했습니다.');
  seen.add(row.id);return {id:row.id,title:row.title.trim(),kind:'chatgpt',updatedAt:dates.updatedAt,...(dates.createdAt?{createdAt:dates.createdAt}:{}),...(dates.lastMessageAt?{lastMessageAt:dates.lastMessageAt}:{}),archived:false,project:'프로젝트 없음',sidebarRank:row.rank,pinned:row.pinned,browserObservedAt:new Date(time).toISOString()};
 });

 return {schemaVersion:1,deviceId,deviceName:'Chrome · 누적 대화',source:'browser-sidebar',collectionMode:'manual',observedAt:new Date(time).toISOString(),cloudObservedAt:new Date(time).toISOString(),localObservedAt:null,cloudMode:'browser-sidebar',cloudState:'connected',sourceError:null,items};
}
