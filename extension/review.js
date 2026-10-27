import {scanHistory} from './history-scan.js';
const id=new URL(location.href).searchParams.get('request'),$=id=>document.getElementById(id);
let snapshot,stop=false,running=false,cancelled=false,finished=false;
async function call(type,extra={}){const r=await chrome.runtime.sendMessage({type,id,...extra});if(!r?.ok)throw Error(r?.error||'연결을 확인해 주세요.');return r;}
function controls(){for(const name of ['read','quick','reload','tabs'])$(name).disabled=running||cancelled||finished;$('stop').disabled=!running||stop;$('apply').disabled=!snapshot||running||cancelled||finished;}
async function tabs(){try{const r=await call('tabs');$('tabs').replaceChildren(...r.tabs.map(t=>new Option(t.title,String(t.id))));$('status').textContent=r.tabs.length?'최근 목록 빠르게 읽기 또는 과거 대화까지 읽기를 선택하세요.':'같은 Chrome에서 chatgpt.com을 열고 로그인한 뒤 탭 목록을 새로고침해 주세요.';}catch(e){$('status').textContent=e.message}}
$('reload').onclick=tabs;
$('stop').onclick=()=>{stop=true;controls();};
async function readHistory(full){
 if(running||cancelled||finished)return;
 if(!$('tabs').value){$('status').textContent='먼저 ChatGPT 탭을 열고 탭 목록을 새로고침해 주세요.';return;}
 snapshot=null;stop=false;running=true;controls();$('preview').replaceChildren();
 const tabId=Number($('tabs').value);
 try{
  $('status').textContent='사이드바의 맨 위에서 최신 대화를 확인합니다…';
  await call('reset-scan',{tabId});
  if(cancelled)return;
  const read=async()=>(await call('read',{tabId})).snapshot;
  const result=full?await scanHistory({read,advance:async(extra={})=>(await call('advance',{tabId,...extra})).step,stopped:()=>stop||cancelled,onProgress:n=>{$('status').textContent=`${n}개 확인. 과거 대화를 읽는 중입니다. 여기까지 읽기를 누르면 현재 결과를 반영할 수 있습니다.`;}}):await read();
  if(cancelled)return;
  snapshot=result;
  // Large archives must not freeze review by building 50,000 DOM rows.
  for(const row of snapshot.items.slice(0,200)){const li=document.createElement('li');li.textContent=(row.pinned?'[고정] ':'')+row.title+(row.updatedAt||row.createdAt?' · 대화 날짜 확인':row.lastMessageAt?' · 내 메시지 날짜 확인':' · 날짜 미확인');$('preview').append(li);}
  const reasons={'no-more-visible':'더 이상 추가 항목이 표시되지 않아 멈췄습니다.','stopped':'요청에 따라 여기까지 읽었습니다.','load-error':'추가 로딩 오류가 있어 여기까지 읽었습니다.','limit':'50,000개 한도에 도달했습니다.','time-limit':'20분 한도에 도달했습니다.'};
  $('status').textContent=`${snapshot.items.length}개 확인. ${reasons[snapshot.scan?.reason]||'현재 표시된 최근 목록을 읽었습니다.'} 아래 반영 버튼을 눌러야 Hub에 저장됩니다. 미리보기는 최대 200개이며 확인한 전체 항목을 저장합니다. 날짜 ${snapshot.items.filter(t=>t.updatedAt||t.createdAt||t.lastMessageAt).length}개 확인. 내 메시지 시각은 대화 전체의 수정일과 구분합니다.`;
 }catch(e){$('status').textContent=e.message;}finally{running=false;controls();}
}
$('quick').onclick=()=>readHistory(false);
$('read').onclick=()=>readHistory(true);
$('apply').onclick=async()=>{
 if(!snapshot||running||cancelled||finished)return;
 running=true;controls();
 try{await call('apply',{snapshot});finished=true;snapshot=null;$('status').textContent='Hub로 전달했습니다. 공유 저장 결과는 Hub에서 확인하세요.';}
 catch(e){$('status').textContent=e.message}
 finally{running=false;controls()}
};
$('cancel').onclick=async()=>{stop=true;cancelled=true;controls();try{await call('cancel');$('status').textContent='취소했습니다.'}catch(e){$('status').textContent=e.message}};
tabs();
