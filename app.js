import {mergeCatalogs} from './device-catalog.mjs?v=9';
import {collectionStatus} from './sync-status.mjs?v=7';
import {refreshDevices,deviceSnapshots,acceptDeviceEnvelope} from './devices.js?v=9';
import {unlockCatalog,loadTitles,saveTitles,refreshCatalog} from './vault.js?v=7';
import {loadCloudDevices,saveCloudDevice} from './cloud-devices.js?v=9';
import {requestBrowserSnapshot,browserSnapshot} from './browser-client.mjs?v=9';
import {deviceRecipient} from './vault.js?v=7';
import {encryptDevice} from './device-crypto.mjs?v=7';
import {createRenderGate} from './render-guard.mjs?v=7';
const $=id=>document.getElementById(id);
let currentDeviceId=null,manualBusy=false,manualController;
try{currentDeviceId=localStorage.getItem('chat-history-hub:this-device')}catch{}
const renderGate=createRenderGate(document,()=>composeItemsNow(),pending=>{$('apply-update').hidden=!pending});
let items=[];
let baseItems=[],extraItems=[],catalogInfo={},pendingCatalog=null;
let refreshBusy=false,lastRefreshAttempt=0,refreshFailed=false;
let selectedService='all';
const serviceNames={chatgpt:'ChatGPT',codex:'로컬 작업'};
const serviceOf=t=>['gemini','claude','codex'].includes(t.kind)?t.kind:'chatgpt';
const extraStorage='chat-history-hub:extra-catalog:v1';
let extraReady=true;
function updateServices(){
 $('services').replaceChildren();
 for(const [id,name] of [['all','전체'],...Object.entries(serviceNames)]){
 const button=el('button','',name+' '+items.filter(t=>id==='all'||serviceOf(t)===id).length);button.type='button';button.setAttribute('aria-pressed',String(selectedService===id));button.onclick=()=>{selectedService=id;$('project').value='';updateServices();render()};$('services').append(button);
 }
 $('total').textContent=items.length;
}
function normalizeExtra(t){
 if(!t||!['gemini','claude'].includes(t.kind)||typeof t.title!=='string'||!t.title.trim())throw Error('목록의 서비스 또는 제목을 확인해 주세요.');
 const u=new URL(t.webUrl);const host=t.kind==='gemini'?'gemini.google.com':'claude.ai';
 if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||!(/^\/(app|chat|cowork)\/[a-zA-Z0-9_-]+$/.test(u.pathname)))throw Error('지원하지 않는 대화 주소입니다.');
 return {id:t.kind+':'+u.pathname,kind:t.kind,title:t.title.trim().slice(0,1000),webUrl:u.origin+u.pathname,updatedAt:Number.isFinite(t.updatedAt)&&Math.abs(t.updatedAt)<8e12?t.updatedAt:null,project:'프로젝트 미확인',sourceDate:typeof t.sourceDate==='string'?t.sourceDate.slice(0,100):''};
}
let titles={};
let titlesReady=true;
const displayTitle=t=>Object.hasOwn(titles,t.id)?titles[t.id]:t.title;
function editTitle(t,content){
 const form=el('form','title-editor');const input=el('input');input.value=displayTitle(t);input.maxLength=300;input.required=true;input.setAttribute('aria-label','대화 제목 수정');
 const buttons=el('div','title-editor-actions');const save=el('button','','저장');save.type='submit';const cancel=el('button','','취소');cancel.type='button';const restore=el('button','','원래 제목');restore.type='button';
 const hint=el('p','edit-hint','이 브라우저에만 저장됩니다. ChatGPT 원본 제목은 바뀌지 않습니다.');const status=el('p','edit-status');status.setAttribute('role','status');
 buttons.append(save,cancel,restore);form.append(input,buttons,hint,status);content.replaceWith(form);input.focus();input.select();
 const outsideListener=new AbortController();
 const close=(returnFocus=true)=>{if(input.disabled)return;outsideListener.abort();form.replaceWith(content);if(returnFocus)content.focus();if(pendingCatalog)applyPendingCatalog()};
 document.addEventListener('pointerdown',event=>{if(!form.isConnected){outsideListener.abort();return}if(!form.contains(event.target))close(false)},{signal:outsideListener.signal});
 cancel.onclick=()=>close();restore.onclick=()=>{input.value=t.title;input.focus()};
 input.oninput=()=>input.setCustomValidity('');form.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close()}};
 form.onsubmit=async e=>{e.preventDefault();const value=input.value.trim();if(!value){input.setCustomValidity('제목을 입력해 주세요.');input.reportValidity();return}save.disabled=true;cancel.disabled=true;restore.disabled=true;input.disabled=true;
  try{const next={...titles};if(value===t.title)delete next[t.id];else next[t.id]=value;await saveTitles(next);titles=next;outsideListener.abort();form.replaceWith(content);if(!applyPendingCatalog())render()}
  catch{status.textContent='저장하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.';save.disabled=false;cancel.disabled=false;restore.disabled=false;input.disabled=false}
 };
}
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function validUrl(raw,kind){try{const u=new URL(raw);return kind==='web'?u.protocol==='https:'&&['chatgpt.com','gemini.google.com','claude.ai'].includes(u.hostname)&&!u.username&&!u.password:u.protocol==='codex:'&&u.hostname==='threads'&&/^\/[a-z0-9-]+$/i.test(u.pathname)&&!u.search&&!u.hash;}catch{return false}}
function render(){
 const q=$('query').value.trim().toLocaleLowerCase('ko');
 const from=$('from').value,to=$('to').value,project=$('project').value;
 const newestBrowser=items.reduce((latest,t)=>t.browserObservedAt>latest?t.browserObservedAt:latest,'');
 const recent=$('sort').value==='recent';
 const rows=items.filter(t=>(!recent||(t.browserObservedAt===newestBrowser&&(t.sidebarRank!==null||t.pinned)))&&(!$('device').value||t.devices?.includes($('device').value))&&(selectedService==='all'||serviceOf(t)===selectedService)&&(!q||displayTitle(t).toLocaleLowerCase('ko').includes(q))&&(!project||t.project===project)&&(!(from||to)||Number.isFinite(t.updatedAt))&&(!from||dateFormat.format(new Date(t.updatedAt*1000))>=from)&&(!to||dateFormat.format(new Date(t.updatedAt*1000))<=to)).sort((a,b)=>{if(recent)return (a.sidebarRank??10000)-(b.sidebarRank??10000);if(a.updatedAt===null)return b.updatedAt===null?0:1;if(b.updatedAt===null)return -1;return ($('sort').value==='asc'?1:-1)*(a.updatedAt-b.updatedAt)});
 $('service-note').textContent='제목을 누르면 원래 대화가 열립니다. 로컬 작업은 해당 작업이 있는 PC에서 열 수 있습니다.';
 $('count').textContent=rows.length+'개 대화';$('results').replaceChildren();
 if(from&&to&&from>to){$('results').append(el('div','empty','시작일을 종료일 이전으로 선택해 주세요.'));return}
 if(recent&&!newestBrowser){$('results').append(el('div','empty','최신화를 눌러 ChatGPT 최근 목록을 가져와 주세요.'));return;}
 if(!rows.length){$('results').append(el('div','empty',items.some(t=>selectedService==='all'||serviceOf(t)===selectedService)?'검색 결과가 없습니다.':'아직 가져온 대화가 없습니다.'));return}
 let previousDay,group;
 for(const t of rows){
  const day=recent?'recent':t.updatedAt===null?'unknown':dateFormat.format(new Date(t.updatedAt*1000));
  if(day!==previousDay){const section=el('section','day-group');section.append(el('h2','day-heading',day==='recent'?'최근 가져온 ChatGPT 대화':day==='unknown'?'날짜 미확인':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(t.updatedAt*1000))));group=el('div','rows');group.setAttribute('role','list');section.append(group);$('results').append(section);previousDay=day}
  const web=t.webUrl&&validUrl(t.webUrl,'web');
  const localUrl='codex://threads/'+t.id,local=t.kind==='codex'&&currentDeviceId&&t.devices?.includes(currentDeviceId)&&validUrl(localUrl,'app');
  const row=el('div','row');row.setAttribute('role','listitem');const body=el('div');const content=el(web||local?'a':'span','title',displayTitle(t));
  if(web||local){content.href=web?t.webUrl:localUrl;if(web){content.target='_blank';content.rel='noopener noreferrer'}}
  const d=t.updatedAt===null?null:new Date(t.updatedAt*1000);const date=el('time','',d?timeFormat.format(d):'—');if(d)date.dateTime=d.toISOString();date.title=d?'마지막 수정일 · 한국 시간':'정확한 날짜 미확인';
  const meta=el('div','meta');meta.append(el('span','tag',serviceNames[t.kind]||'로컬 작업'),el('span','',t.project||'프로젝트 없음'));for(const id of t.devices||[])meta.append(el('span','tag',id==='legacy-desktop'?'데스크탑':deviceSnapshots().find(d=>d.deviceId===id)?.deviceName||'추가 기기'));if(recent&&t.pinned)meta.append(el('span','tag','고정'));if(t.sourceDate)meta.append(el('span','',' · 수집 당시 표시: '+t.sourceDate));body.append(content,meta);
  const actions=el('div','actions');const actionLink=(label,url)=>{const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a};
  if(web)actions.append(actionLink('웹에서 열기',t.webUrl));else if(local){const a=el('a','','Codex에서 열기');a.href=localUrl;actions.append(a)}else actions.append(el('span','no-web-link','해당 PC에서 최신화 후 열기'));
  const edit=el('button','','이름 수정');edit.type='button';edit.disabled=!titlesReady;edit.onclick=()=>editTitle(t,content);actions.append(edit);
  row.append(date,body,actions);group.append(row);
 }
}
function composeItems(){renderGate.request()}
function composeItemsNow(){
 items=mergeCatalogs(baseItems,deviceSnapshots()).filter(t=>t.kind==='chatgpt'||t.kind==='codex');
 const selected=$('device').value;$('device').replaceChildren(new Option('모든 기기',''),new Option('데스크탑','legacy-desktop'));$('device-list').replaceChildren();
 for(const d of collectionStatus(catalogInfo,deviceSnapshots()).devices){
  $('device').add(new Option(d.deviceName,d.deviceId));
  $('device-list').append(el('li','',d.deviceName+' · 저장된 ChatGPT '+d.webCount+'개 · 로컬 작업 '+d.localCount+'개 · 마지막 확인 '+new Date(d.cloudObservedAt||d.observedAt).toLocaleString('ko-KR')));
 }
 if([...$('device').options].some(o=>o.value===selected))$('device').value=selected;
 const project=$('project').value;$('project').replaceChildren(new Option('모든 프로젝트',''));
 for(const p of [...new Set(items.map(t=>t.project||'프로젝트 없음'))].sort())$('project').add(new Option(p,p));
 if([...$('project').options].some(o=>o.value===project))$('project').value=project;
 updateServices();render();
}
function applyCatalog(data){
 if(!Array.isArray(data.items)||!data.items.length||data.items.some(t=>typeof t.id!=='string'||typeof t.title!=='string'||!Number.isFinite(t.updatedAt)||Math.abs(t.updatedAt)>=8e12))throw Error('목록 형식이 올바르지 않습니다.');
 if(Date.parse(data.collectedAt)<Date.parse(catalogInfo.collectedAt))return;
 baseItems=[...new Map(data.items.map(t=>[t.id,{...t,project:typeof t.project==='string'?t.project:'프로젝트 없음'}])).values()];
 catalogInfo=data;$('coverage').textContent=data.coverage||'수집 범위 확인 필요';composeItems();updateSyncStatus();
}
function applyPendingCatalog(){if(!pendingCatalog){composeItems();return true;}const data=pendingCatalog;pendingCatalog=null;applyCatalog(data);return true}
function updateSyncStatus(){
 const state=collectionStatus(catalogInfo,deviceSnapshots());
 const collected=Date.parse(state.cloudObservedAt);
 const date=Number.isFinite(collected)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(collected):'확인 필요';
 $('last-collected').textContent='저장된 ChatGPT 마지막 확인 · '+date;
 $('sync-status').textContent=refreshBusy?'저장된 목록을 다시 불러오고 있습니다…':refreshFailed?'일부 저장된 목록에 연결하지 못했습니다. 마지막 정상 목록을 유지합니다.':'최신화를 누르면 Chrome에서 가져온 최근 목록을 확인하고 저장합니다.';
 $('sync-status').dataset.state='warning';
 $('manual-sync').setAttribute('aria-disabled',String(refreshBusy||manualBusy));
}
async function checkForUpdates(force=false){
 if(refreshBusy||(!force&&Date.now()-lastRefreshAttempt<10000))return;
 refreshBusy=true;lastRefreshAttempt=Date.now();updateSyncStatus();
 try{
  const data=await refreshCatalog();refreshFailed=false;
  if(data&&Date.parse(data.collectedAt)>=Math.max(Date.parse(catalogInfo.collectedAt)||0,Date.parse(pendingCatalog?.collectedAt)||0)){
   if(document.querySelector('.title-editor'))pendingCatalog=data;else applyCatalog(data);
  }
 }catch{refreshFailed=true}
 finally{try{await refreshDevices()}catch{refreshFailed=true}try{const cloud=await loadCloudDevices();for(const row of cloud.valid)await acceptDeviceEnvelope(row.envelope);if(cloud.failed)refreshFailed=true}catch{refreshFailed=true}composeItems();refreshBusy=false;updateSyncStatus()}
}
const outboxKey='chat-history-hub:pending-manual-envelope';
async function publishManual(envelope){
 try{localStorage.setItem(outboxKey,JSON.stringify(envelope))}catch{}
 $('retry-share').hidden=false;
 await saveCloudDevice(envelope);
 await acceptDeviceEnvelope(envelope);
 try{localStorage.removeItem(outboxKey)}catch{}
 $('retry-share').hidden=true;
}
async function collectBrowser(){
 try{
  const [saved,collected]=await Promise.allSettled([checkForUpdates(true),requestBrowserSnapshot({signal:manualController.signal,onReady:()=>{$('manual-status').textContent='열린 미리보기에서 ChatGPT 탭을 선택하고 목록을 확인한 뒤 반영해 주세요.'}})]);
  if(manualController.signal.aborted)throw Error('최신화를 취소했습니다.');
  if(collected.status==='rejected')throw Error((saved.status==='fulfilled'&&!refreshFailed?'저장된 목록은 불러왔지만 새 대화는 가져오지 못했습니다. ':'저장된 목록과 새 대화를 모두 확인하지 못했습니다. 기존 목록을 유지합니다. ')+(collected.reason?.message||''));
  const key='chat-history-hub:browser-device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}
  const snapshot=browserSnapshot(collected.value,id);
  const envelope=await encryptDevice(snapshot,deviceRecipient.publicKey);
  await acceptDeviceEnvelope(envelope);
  selectedService='chatgpt';$('sort').value='recent';$('device').value='';$('query').value='';$('project').value='';$('from').value='';$('to').value='';
  composeItems();updateSyncStatus();
  $('cancel-manual').hidden=true;$('manual-status').textContent='최근 목록을 가져왔습니다. 암호화 저장 중입니다…';
  try{await publishManual(envelope)}catch{throw Error('최근 목록은 가져왔지만 공유 저장에 실패했습니다. 공유 저장 다시 시도를 눌러 주세요.')}
  $('manual-status').textContent=`ChatGPT ${snapshot.items.length}개를 가져와 저장했습니다. 화면에 불러온 최근·고정 목록만 포함하며 수정일은 새로 수집하지 않습니다.`;
 }catch(e){$('manual-status').textContent=e.message||'가져오기에 실패했습니다. 기존 목록은 유지합니다.'}
 finally{manualBusy=false;$('manual-sync').textContent='최신화';$('cancel-manual').hidden=true;updateSyncStatus()}
}
$('manual-sync').onclick=e=>{
 e.preventDefault();if(manualBusy||refreshBusy)return;
 manualBusy=true;manualController=new AbortController();e.currentTarget.setAttribute('aria-disabled','true');e.currentTarget.textContent='최신화 중…';$('cancel-manual').hidden=false;
 $('manual-status').textContent='저장된 목록을 불러오고 Chrome 수집기에 연결합니다…';void collectBrowser();
};
$('cancel-manual').onclick=()=>manualController?.abort();
$('apply-update').onclick=()=>{if(pendingCatalog){const data=pendingCatalog;pendingCatalog=null;applyCatalog(data)}renderGate.apply()};
$('retry-share').onclick=async()=>{
 const button=$('retry-share');button.disabled=true;
 try{const raw=localStorage.getItem(outboxKey);if(!raw)throw Error('다시 공유할 목록이 없습니다.');await publishManual(JSON.parse(raw));$('manual-status').textContent='다른 PC에서도 볼 수 있도록 공유 저장을 완료했습니다.'}
 catch(e){$('manual-status').textContent='공유 저장 실패: '+e.message}
 finally{button.disabled=false}
};
async function load(){try{
 const data=await unlockCatalog();if(!Array.isArray(data.items))throw Error('대화 목록 형식을 확인할 수 없습니다.');
 try{titles=await loadTitles()}catch{titlesReady=false;$('error').textContent='저장된 수정 제목을 불러오지 못했습니다. 기존 저장 내용을 보호하기 위해 제목 수정을 잠시 사용할 수 없습니다.';$('error').hidden=false}
 try{const extra=await loadTitles(extraStorage);if(extra.items)extraItems=extra.items.map(normalizeExtra)}catch{extraReady=false;$('error').textContent='추가 목록을 불러오지 못했습니다. 저장된 목록을 보호하기 위해 가져오기를 중지했습니다.';$('error').hidden=false}
 applyCatalog(data);
 await checkForUpdates(true);
 if(deviceSnapshots().some(s=>s.source==='browser-sidebar')){$('sort').value='recent';selectedService='chatgpt';composeItems()}
 try{$('retry-share').hidden=!localStorage.getItem(outboxKey)}catch{}
 // Paused after reported interference with normal PC input.
 // No timer, focus, visibility, or online event starts automatic refresh.
}catch(e){$('error').textContent=e.message;$('error').hidden=false;$('count').textContent='연결 확인 필요'}}
for(const id of ['query','project','from','to','sort','device'])$(id).addEventListener('input',render);
$('reset').onclick=()=>{for(const id of ['query','project','from','to','device'])$(id).value='';$('sort').value='desc';render()};$('lock').onclick=()=>location.reload();load();
 $('import-form').onsubmit=async e=>{e.preventDefault();const button=$('import-button');try{if(!extraReady)throw Error('기존 추가 목록을 먼저 복구해야 합니다.');const raw=JSON.parse($('import-list').value);if(!Array.isArray(raw)||!raw.length||raw.length>10000)throw Error('가져올 목록을 확인해 주세요.');const next=new Map(extraItems.map(t=>[t.id,t]));for(const value of raw){const t=normalizeExtra(value);next.set(t.id,t)}button.disabled=true;await saveTitles({items:[...next.values()]},extraStorage);extraItems=[...next.values()];$('import-list').value='';$('import-status').textContent=raw.length+'개 항목을 이 브라우저에 저장했습니다.';composeItems()}catch(error){$('import-status').textContent=error instanceof SyntaxError?'목록 형식을 확인해 주세요.':error.message}finally{button.disabled=false}};

