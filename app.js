import {conversationDate} from './conversation-date.mjs?v=15';
import {readExportFile,exportSnapshot} from './export-import.mjs?v=14';
import {readBookmarkImport,decodeBookmarkImport,clearBookmarkImport} from './bookmark-import.mjs?v=15';
import {encryptedStore} from './archive-storage.mjs?v=12';
import {mergePendingEnvelopes} from './share-queue.mjs?v=15';
import {arrangeConversations,conversationGroup} from './conversation-order.mjs?v=11';
import {splitBrowserArchive} from './browser-archive.mjs?v=14';
import {mergeCatalogs} from './device-catalog.mjs?v=15';
import {collectionStatus} from './sync-status.mjs?v=7';
import {refreshDevices,deviceSnapshots,acceptDeviceEnvelope} from './devices.js?v=15';
import {unlockCatalog,loadTitles,saveTitles,refreshCatalog} from './vault.js?v=7';
import {loadCloudDevices,saveCloudDevice} from './cloud-devices.js?v=15';
import {requestBrowserSnapshot,browserSnapshot,probeBrowserExtension} from './browser-client.mjs?v=16';
import {deviceRecipient} from './vault.js?v=7';
import {encryptDevice} from './device-crypto.mjs?v=7';
import {createRenderGate} from './render-guard.mjs?v=7';
const $=id=>document.getElementById(id);
const incomingBookmark=readBookmarkImport();
let currentDeviceId=null,manualBusy=false,manualController,bookmarkSnapshot=null;
let exportPreview=null,exportReading=false;
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
 const dateBasis=$('date-basis').value;
 const dateLabel=dateBasis==='created'?'대화 시작일':dateBasis==='updated'?'마지막 수정일':'확인된 대화 날짜';
 const dateOf=t=>conversationDate(t,dateBasis).timestamp;
 $('date-hint').textContent=dateLabel+' · 한국 시간';
 const newestBrowser=items.reduce((latest,t)=>t.browserObservedAt>latest?t.browserObservedAt:latest,'');
 const recent=$('sort').value==='recent'&&!q;
 const chromeOrder=$('sort').value==='browser';
 const sourceRows=chromeOrder?arrangeConversations(items):items;
 const rows=sourceRows.filter(t=>(!recent||(t.browserObservedAt===newestBrowser&&(t.sidebarRank!==null||t.pinned)))&&(!$('device').value||t.devices?.some(id=>id===$('device').value||deviceSnapshots().find(s=>s.deviceId===id)?.archiveDeviceId===$('device').value))&&(selectedService==='all'||serviceOf(t)===selectedService)&&(!q||displayTitle(t).toLocaleLowerCase('ko').includes(q))&&(!project||t.project===project)&&(!(from||to)||dateOf(t)!==null)&&(!from||dateFormat.format(new Date(dateOf(t)*1000))>=from)&&(!to||dateFormat.format(new Date(dateOf(t)*1000))<=to)).sort((a,b)=>{if(chromeOrder)return 0;if(recent)return (a.sidebarRank??10000)-(b.sidebarRank??10000);const aDate=dateOf(a),bDate=dateOf(b);if(aDate===null)return bDate===null?0:1;if(bDate===null)return -1;return ($('sort').value==='asc'?1:-1)*(aDate-bDate)});
 $('service-note').textContent=(chromeOrder?'Chrome에서 확인한 순서입니다. ':'')+'제목을 누르면 원래 대화가 열립니다. 로컬 작업은 해당 작업이 있는 PC에서 열 수 있습니다.';
 const unknown=items.filter(t=>(selectedService==='all'||serviceOf(t)===selectedService)&&dateOf(t)===null).length;
 $('date-help').hidden=unknown===0;$('date-help-count').textContent=`날짜 미확인 ${unknown}개 · 안내 보기`;
 $('date-filter-note').textContent=(from||to)&&unknown?`날짜가 없는 ${unknown}개는 날짜 범위 검색에서 제외됩니다.`:'';
 $('count').textContent=rows.length+'개 대화';$('results').replaceChildren();
 if(from&&to&&from>to){$('results').append(el('div','empty','시작일을 종료일 이전으로 선택해 주세요.'));return}
 if(recent&&!newestBrowser){$('results').append(el('div','empty','최신화를 눌러 ChatGPT 최근 목록을 가져와 주세요.'));return;}
 if(!rows.length){$('results').append(el('div','empty',items.some(t=>selectedService==='all'||serviceOf(t)===selectedService)?'검색 결과가 없습니다.':'아직 가져온 대화가 없습니다.'));return}
 let previousDay,group;
 for(const t of rows){
  const day=chromeOrder?(dateBasis==='updated'?conversationGroup(t):dateOf(t)===null?dateLabel+' 미확인 · Chrome 순서 유지':dateFormat.format(new Date(dateOf(t)*1000))):recent?'recent':dateOf(t)===null?'unknown':dateFormat.format(new Date(dateOf(t)*1000));
  if(day!==previousDay){const section=el('section','day-group');section.append(el('h2','day-heading',chromeOrder?day:day==='recent'?'최근 가져온 ChatGPT 대화':day==='unknown'?dateLabel+' 미확인':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(dateOf(t)*1000))));group=el('div','rows');group.setAttribute('role','list');section.append(group);$('results').append(section);previousDay=day}
  const web=t.webUrl&&validUrl(t.webUrl,'web');
  const localUrl='codex://threads/'+t.id,local=t.kind==='codex'&&currentDeviceId&&t.devices?.includes(currentDeviceId)&&validUrl(localUrl,'app');
  const row=el('div','row');row.setAttribute('role','listitem');const body=el('div');const content=el(web||local?'a':'span','title',displayTitle(t));
  if(web||local){content.href=web?t.webUrl:localUrl;if(web){content.target='_blank';content.rel='noopener noreferrer'}}
  const d=dateOf(t)===null?null:new Date(dateOf(t)*1000);const date=el('time','',d?timeFormat.format(d):'시간 미확인');if(d)date.dateTime=d.toISOString();date.title=d?conversationDate(t,dateBasis).label+' · 한국 시간':'이번 수집에서 날짜를 확인하지 못했습니다.';
  const meta=el('div','meta');if(dateBasis==='activity'&&conversationDate(t,dateBasis).source==='message')meta.append(el('span','tag','내 메시지 기준'));if(dateBasis==='activity'&&conversationDate(t,dateBasis).source==='created')meta.append(el('span','tag','시작일 기준'));meta.append(el('span','tag',serviceNames[t.kind]||'로컬 작업'),el('span','',t.project||'프로젝트 없음'));for(const name of new Set((t.devices||[]).map(id=>id==='legacy-desktop'?'데스크탑':deviceSnapshots().find(d=>d.deviceId===id)?.deviceName||'추가 기기')))meta.append(el('span','tag',name));if(t.inferredDateLabel)meta.append(el('span','tag','앞뒤 대화의 기존 날짜로 추정'));if((recent||chromeOrder)&&t.pinned)meta.append(el('span','tag','고정'));if(t.sourceDate)meta.append(el('span','',' · 수집 당시 표시: '+t.sourceDate));body.append(content,meta);
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
 const grouped=new Map();
 for(const raw of deviceSnapshots()){const key=raw.archiveDeviceId||raw.deviceId;const old=grouped.get(key);grouped.set(key,old?{...old,observedAt:raw.observedAt>old.observedAt?raw.observedAt:old.observedAt,cloudObservedAt:raw.cloudObservedAt>old.cloudObservedAt?raw.cloudObservedAt:old.cloudObservedAt,items:[...old.items,...raw.items]}:{...raw,deviceId:key});}
 for(const d of collectionStatus(catalogInfo,[...grouped.values()]).devices){
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
 catalogInfo=data;$('coverage').textContent='확인된 날짜로 묶어 보여드립니다. ‘내 메시지 기준’은 열린 대화에서 불러온 내 메시지의 시각이며, 대화 전체의 수정일과 구분됩니다.';composeItems();updateSyncStatus();
}
function applyPendingCatalog(){if(!pendingCatalog){composeItems();return true;}const data=pendingCatalog;pendingCatalog=null;applyCatalog(data);return true}
function updateSyncStatus(){
 const state=collectionStatus(catalogInfo,deviceSnapshots());
 const collected=Date.parse(state.cloudObservedAt);
 const date=Number.isFinite(collected)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(collected):'확인 필요';
 $('last-collected').textContent='저장된 ChatGPT 마지막 확인 · '+date;
 $('sync-status').textContent=refreshBusy?'저장된 목록을 다시 불러오고 있습니다…':refreshFailed?'일부 저장된 목록에 연결하지 못했습니다. 마지막 정상 목록을 유지합니다.':'';
 $('sync-status').dataset.state=refreshFailed?'warning':'ok';
 $('manual-sync').setAttribute('aria-disabled',String(refreshBusy||manualBusy));
 $('manual-sync').disabled=refreshBusy||manualBusy;$('review-sync').disabled=refreshBusy||manualBusy;
 $('reload-saved').disabled=refreshBusy||manualBusy;
 $('retry-share').disabled=refreshBusy||manualBusy;
 $('apply-bookmark').disabled=refreshBusy||manualBusy||!bookmarkSnapshot;
 $('export-file').disabled=refreshBusy||manualBusy||exportReading;
 $('apply-export').disabled=refreshBusy||manualBusy||!exportPreview;
 $('dismiss-export').disabled=manualBusy;
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
let pendingArchive=null;
async function publishManual(envelope){
 pendingArchive=await mergePendingEnvelopes(pendingArchive||await encryptedStore.get(outboxKey),envelope,deviceRecipient);
 $('retry-share').hidden=false;
 // Persist the entire retry queue before any network write.
 await encryptedStore.set(outboxKey,pendingArchive);
 const parts=pendingArchive;
 for(let i=0;i<parts.length;i+=8){
  $('manual-status').textContent=`공유 저장 중 · ${Math.min(i,parts.length)}/${parts.length} 묶음`;
  const results=await Promise.allSettled(parts.slice(i,i+8).map(async part=>{await saveCloudDevice(part);await acceptDeviceEnvelope(part)}));
  if(results.some(r=>r.status==='rejected'))throw Error('일부 목록 저장 실패');
 }
 await encryptedStore.remove(outboxKey);pendingArchive=null;
 $('retry-share').hidden=true;
}
async function collectBrowser(imported=null,mode='quick'){
 try{
  const [saved,collected]=await Promise.allSettled([checkForUpdates(true),imported?Promise.resolve(imported):requestBrowserSnapshot({signal:manualController.signal,mode,onReady:()=>{$('manual-status').textContent=mode==='review'?'열린 화면에서 ChatGPT 탭과 가져올 범위를 선택해 주세요.':'ChatGPT에서 최근 목록을 확인하고 있습니다…';},onProgress:message=>{$('manual-status').textContent=message;}})]);
  if(manualController.signal.aborted)throw Error('최신화를 취소했습니다.');
  if(collected.status==='rejected')throw Object.assign(Error((saved.status==='fulfilled'&&!refreshFailed?'저장된 목록은 불러왔지만 새 대화는 가져오지 못했습니다. ':'저장된 목록과 새 대화를 모두 확인하지 못했습니다. 기존 목록을 유지합니다. ')+(collected.reason?.message||'')),{code:collected.reason?.code});
  const key='chat-history-hub:browser-device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}
  if(!deviceRecipient)throw Error('이 브라우저에서 암호화를 준비하지 못했습니다. 최신 Chrome에서 다시 로그인해 주세요.');
  const snapshot=browserSnapshot(collected.value,id);
  const archive=await splitBrowserArchive(snapshot);
  const envelope=await Promise.all(archive.map(s=>encryptDevice(s,deviceRecipient.publicKey)));
  if(manualController.signal.aborted)throw Error('최신화를 취소했습니다.');
  // Keep search/date filters; show the ChatGPT collection that was just refreshed.
  selectedService='chatgpt';
  const cached=await Promise.allSettled(envelope.map(acceptDeviceEnvelope));
  const cacheFailed=cached.some(r=>r.status==='rejected');
  composeItems();updateSyncStatus();
  $('cancel-manual').hidden=true;$('manual-status').textContent='대화 목록을 가져왔습니다. 전체 검색을 위해 암호화 저장 중입니다…';
  try{await publishManual(envelope)}catch{throw Error('대화 목록은 가져왔지만 일부 공유 저장에 실패했습니다. 저장 다시 시도를 눌러 주세요.'+(cacheFailed?' 브라우저 저장 공간도 확인해 주세요. 이 탭을 닫지 마세요.':''))}
  if(imported){clearBookmarkImport();$('bookmark-panel').hidden=true;}
  $('manual-status').dataset.state='success';
  $('manual-status').textContent=`최근 목록 ${snapshot.items.length}개 반영 · 날짜 ${snapshot.items.filter(t=>t.updatedAt||t.createdAt||t.lastMessageAt).length}개 확인 · 저장 완료`;
 }catch(e){
  $('manual-status').dataset.state='error';$('manual-status').textContent=e.message||'가져오기에 실패했습니다. 기존 목록은 유지합니다.';
  showConnectionHelp(e.code);
 }
 finally{manualBusy=false;$('manual-sync').textContent='최신화';$('cancel-manual').hidden=true;updateSyncStatus()}
}
function showConnectionHelp(code){
 if(!['EXTENSION_MISSING','EXTENSION_UPDATE','LOGIN_REQUIRED','PAGE_UNAVAILABLE'].includes(code))return;
 const setup=code==='EXTENSION_MISSING'||code==='EXTENSION_UPDATE';
 $('connection-help').hidden=false;
 $('connection-title').textContent=setup?'최신화 연결을 한 번 설정해 주세요':'ChatGPT 연결을 확인해 주세요';
 $('connection-message').textContent=setup?'Chrome에 확장 프로그램 1.4.1을 설치하거나 업데이트한 뒤 이 페이지를 새로고침하세요. 이후에는 최신화 버튼만 누르면 됩니다.':'같은 Chrome의 ChatGPT에 로그인되어 있어야 합니다. 로그인이나 화면 확인을 마친 뒤 최신화를 다시 눌러 주세요.';
 $('connection-action').textContent=setup?'설치·업데이트 안내':'ChatGPT 열기';
 $('connection-action').href=setup?'./setup/browser.html':'https://chatgpt.com/';
}
function startCollection(mode='quick'){
 if(manualBusy||refreshBusy)return;
 manualBusy=true;manualController=new AbortController();$('manual-sync').textContent='최신화 중…';$('cancel-manual').hidden=false;
 $('connection-help').hidden=true;$('manual-status').dataset.state='';
 $('manual-status').textContent='최신화 연결을 확인하고 있습니다…';updateSyncStatus();void collectBrowser(null,mode);
}
$('manual-sync').onclick=e=>{e.preventDefault();startCollection()};
$('review-sync').onclick=()=>startCollection('review');
$('dismiss-connection').onclick=()=>{$('connection-help').hidden=true;};
$('cancel-manual').onclick=()=>manualController?.abort();
$('apply-update').onclick=()=>{if(pendingCatalog){const data=pendingCatalog;pendingCatalog=null;applyCatalog(data)}renderGate.apply()};
$('reload-saved').onclick=()=>{if(!manualBusy)void checkForUpdates(true)};
$('check-extension').onclick=async()=>{
 const button=$('check-extension');button.disabled=true;$('extension-status').textContent='수집기 연결 확인 중…';
 try{const result=await probeBrowserExtension();$('connection-help').hidden=true;$('extension-status').textContent=`수집기 ${result.version} 연결됨 · 최신화를 눌러 대화를 가져오세요.`}
 catch(e){$('extension-status').textContent=e.message;showConnectionHelp(e.code)}
 finally{button.disabled=false}
};
$('retry-share').onclick=async()=>{
 if(manualBusy||refreshBusy)return;
 manualBusy=true;updateSyncStatus();
 try{const raw=pendingArchive||await encryptedStore.get(outboxKey);if(!raw)throw Error('다시 공유할 목록이 없습니다.');await publishManual(raw);composeItems();$('manual-status').textContent='다른 PC에서도 볼 수 있도록 공유 저장을 완료했습니다.'}
 catch(e){$('manual-status').textContent='공유 저장 실패: '+e.message}
 finally{manualBusy=false;updateSyncStatus()}
};
async function prepareBookmark(){
 if(!incomingBookmark)return;
 $('bookmark-panel').hidden=false;
 try{
  if(incomingBookmark.error)throw Error(incomingBookmark.error);
  bookmarkSnapshot=await decodeBookmarkImport(incomingBookmark.envelope,deviceRecipient);
  const dated=bookmarkSnapshot.items.filter(t=>t.updatedAt||t.createdAt||t.lastMessageAt).length;
  $('bookmark-status').textContent=`대화 ${bookmarkSnapshot.items.length}개 · 날짜 확인 ${dated}개. ${bookmarkSnapshot.version===1?'이전 북마크는 날짜를 읽지 못합니다. 설정 및 가져오기에서 북마크를 한 번 교체해 주세요. ':dated===0?'현재 화면 내부에서 날짜를 확인하지 못했습니다. ChatGPT 대화를 하나 열고 다시 가져오면 그 대화의 메시지 시각도 확인합니다. ':''}아래 제목을 확인한 뒤 반영해 주세요.`;
  for(const item of bookmarkSnapshot.items){const li=el('li','',item.title);$('bookmark-preview').append(li)}
 }catch(e){$('bookmark-status').textContent=e.message||'가져온 목록을 확인하지 못했습니다.';bookmarkSnapshot=null;}
 updateSyncStatus();
}
$('apply-bookmark').onclick=()=>{
 if(!bookmarkSnapshot||manualBusy||refreshBusy)return;
 manualBusy=true;manualController=new AbortController();updateSyncStatus();void collectBrowser(bookmarkSnapshot);
};
$('dismiss-bookmark').onclick=()=>{clearBookmarkImport();bookmarkSnapshot=null;$('bookmark-panel').hidden=true;};
function clearExportPreview(){exportPreview=null;$('export-preview').replaceChildren();$('apply-export').hidden=true;$('dismiss-export').hidden=true;updateSyncStatus();}
$('export-file').onchange=async()=>{
 const file=$('export-file').files?.[0];if(!file||manualBusy||refreshBusy)return;
 clearExportPreview();exportReading=true;updateSyncStatus();$('export-status').textContent='파일을 이 브라우저에서 읽고 있습니다…';
 try{
  exportPreview=await readExportFile(file);
  const dated=exportPreview.items.filter(t=>t.updatedAt).length,created=exportPreview.items.filter(t=>t.createdAt).length;
  $('export-status').textContent=`대화 ${exportPreview.items.length}개 · 마지막 수정일 ${dated}개 · 시작일 ${created}개. ${exportPreview.skipped?`형식 또는 날짜가 없는 ${exportPreview.skipped}개는 제외했습니다. `:''}아래 목록을 확인한 뒤 날짜 반영을 눌러 주세요. 최대 20개를 미리 보여드립니다.`;
  for(const t of exportPreview.items.slice(0,20))$('export-preview').append(el('li','',t.title+' · 수정일 '+(t.updatedAt?dateFormat.format(new Date(t.updatedAt*1000)):'없음')+' · 시작일 '+(t.createdAt?dateFormat.format(new Date(t.createdAt*1000)):'없음')));
  $('apply-export').hidden=false;$('dismiss-export').hidden=false;
 }catch(e){clearExportPreview();$('export-status').textContent=e.message||'파일을 읽지 못했습니다.';}
 finally{exportReading=false;$('export-file').value='';updateSyncStatus();}
};
$('dismiss-export').onclick=()=>{if(manualBusy)return;clearExportPreview();$('export-status').textContent='파일 선택을 취소했습니다. 저장된 목록은 그대로입니다.';};
$('apply-export').onclick=async()=>{
 if(!exportPreview||manualBusy||refreshBusy)return;
 const metadata=exportPreview;manualBusy=true;$('sort').value='desc';updateSyncStatus();
 $('export-status').textContent='제목과 날짜를 암호화해 저장하고 있습니다…';
 try{
  if(!deviceRecipient)throw Error('암호화를 준비하지 못했습니다. 다시 로그인해 주세요.');
  const key='chat-history-hub:export-device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}
  const snapshot=exportSnapshot(metadata,id),archive=await splitBrowserArchive(snapshot);
  const envelopes=await Promise.all(archive.map(s=>encryptDevice(s,deviceRecipient.publicKey)));
  const cached=await Promise.allSettled(envelopes.map(acceptDeviceEnvelope));
  selectedService='chatgpt';composeItems();
  try{await publishManual(envelopes)}catch{throw Error('날짜를 읽었지만 공유 저장에 실패했습니다. 저장 다시 시도를 눌러 주세요.'+(cached.some(r=>r.status==='rejected')?' 브라우저 저장 공간도 확인해 주세요. 이 탭을 닫지 마세요.':''))}
  clearExportPreview();
  $('export-status').textContent=`${snapshot.items.length}개 대화의 날짜를 반영했습니다. 날짜 기준과 시작일·종료일로 찾아보세요. 파일에 없는 대화나 이후의 변경은 새 내보내기 파일이 필요합니다.`;
  $('manual-status').textContent='날짜가 포함된 대화 목록을 저장했습니다.';
 }catch(e){$('export-status').textContent=e.message||'날짜를 저장하지 못했습니다. 기존 목록은 유지합니다.';}
 finally{manualBusy=false;updateSyncStatus();}
};
async function load(){try{
 const data=await unlockCatalog();if(!Array.isArray(data.items))throw Error('대화 목록 형식을 확인할 수 없습니다.');
 try{titles=await loadTitles()}catch{titlesReady=false;$('error').textContent='저장된 수정 제목을 불러오지 못했습니다. 기존 저장 내용을 보호하기 위해 제목 수정을 잠시 사용할 수 없습니다.';$('error').hidden=false}
 try{const extra=await loadTitles(extraStorage);if(extra.items)extraItems=extra.items.map(normalizeExtra)}catch{extraReady=false;$('error').textContent='추가 목록을 불러오지 못했습니다. 저장된 목록을 보호하기 위해 가져오기를 중지했습니다.';$('error').hidden=false}
 applyCatalog(data);
 await checkForUpdates(true);
 if(deviceSnapshots().some(s=>s.source==='browser-sidebar')){selectedService='chatgpt';composeItems()}
 try{pendingArchive=await encryptedStore.get(outboxKey)||null;$('retry-share').hidden=!pendingArchive;if(pendingArchive){for(const part of Array.isArray(pendingArchive)?pendingArchive:[pendingArchive])await acceptDeviceEnvelope(part);composeItems();updateSyncStatus();$('manual-status').textContent='이전에 공유하지 못한 목록이 남아 있습니다. 저장 다시 시도를 눌러 주세요.'}}catch{$('manual-status').textContent='이전에 저장한 목록을 읽지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'}
 await prepareBookmark();
 // Paused after reported interference with normal PC input.
 // No timer, focus, visibility, or online event starts automatic refresh.
}catch(e){$('error').textContent=e.message;$('error').hidden=false;$('count').textContent='연결 확인 필요'}}
for(const id of ['query','project','from','to','sort','device','date-basis'])$(id).addEventListener('input',render);
$('reset').onclick=()=>{for(const id of ['query','project','from','to','device'])$(id).value='';$('sort').value='desc';$('date-basis').value='activity';render()};$('lock').onclick=()=>location.reload();load();
 $('import-form').onsubmit=async e=>{e.preventDefault();const button=$('import-button');try{if(!extraReady)throw Error('기존 추가 목록을 먼저 복구해야 합니다.');const raw=JSON.parse($('import-list').value);if(!Array.isArray(raw)||!raw.length||raw.length>10000)throw Error('가져올 목록을 확인해 주세요.');const next=new Map(extraItems.map(t=>[t.id,t]));for(const value of raw){const t=normalizeExtra(value);next.set(t.id,t)}button.disabled=true;await saveTitles({items:[...next.values()]},extraStorage);extraItems=[...next.values()];$('import-list').value='';$('import-status').textContent=raw.length+'개 항목을 이 브라우저에 저장했습니다.';composeItems()}catch(error){$('import-status').textContent=error instanceof SyntaxError?'목록 형식을 확인해 주세요.':error.message}finally{button.disabled=false}};

