import {scanHistory} from './history-scan.js';
const id=new URL(location.href).searchParams.get('request'),$=id=>document.getElementById(id);
let snapshot,stop=false,running=false,cancelled=false;
async function call(type,extra={}){const r=await chrome.runtime.sendMessage({type,id,...extra});if(!r?.ok)throw Error(r?.error||'연결을 확인해 주세요.');return r;}
async function tabs(){try{const r=await call('tabs');$('tabs').replaceChildren(...r.tabs.map(t=>new Option(t.title,String(t.id))));$('status').textContent=r.tabs.length?'탭을 선택하고 과거 대화까지 읽기를 누르세요.':'Chrome에서 chatgpt.com을 열고 로그인한 뒤 탭 목록을 새로고침해 주세요.';}catch(e){$('status').textContent=e.message}}
$('reload').onclick=tabs;
$('stop').onclick=()=>{stop=true;$('stop').disabled=true;};
$('read').onclick=async()=>{
 snapshot=null;stop=false;cancelled=false;running=true;$('apply').disabled=true;$('read').disabled=true;$('reload').disabled=true;$('tabs').disabled=true;$('stop').disabled=false;$('preview').replaceChildren();
 const tabId=Number($('tabs').value);
 try{
  await call('reset-scan',{tabId});
  snapshot=await scanHistory({read:async()=>(await call('read',{tabId})).snapshot,advance:async()=>(await call('advance',{tabId})).step,stopped:()=>stop,onProgress:n=>{$('status').textContent=`${n}개 모았습니다. 이전 대화를 계속 불러오는 중입니다…`;}});
  for(const row of snapshot.items){const li=document.createElement('li');li.textContent=(row.pinned?'[고정] ':'')+row.title;$('preview').append(li);}
  const reasons={'no-more-visible':'더 이상 추가 항목이 표시되지 않아 멈췄습니다.','stopped':'요청에 따라 여기까지 읽었습니다.','load-error':'ChatGPT의 추가 로딩 오류로 멈췄습니다.','limit':'50,000개 처리 한도에 도달했습니다.','time-limit':'20분 처리 시간에 도달했습니다.'};
  $('status').textContent=`${snapshot.items.length}개 확인. ${reasons[snapshot.scan.reason]} 보관함·다른 프로젝트 등 계정 전체 내역의 완전한 수집을 보장하지는 않습니다. 정확한 수정일은 제공되지 않습니다. 반영하면 기존 목록에 누적 저장하고 전체 목록에서 검색할 수 있습니다.`;
  $('apply').disabled=cancelled;
 }catch(e){$('status').textContent=e.message;}finally{running=false;$('read').disabled=false;$('reload').disabled=false;$('tabs').disabled=false;$('stop').disabled=true;}
};
$('apply').onclick=async()=>{$('apply').disabled=true;try{await call('apply',{snapshot});$('status').textContent='Hub로 전달했습니다. 저장 결과는 Hub에서 확인하세요.';snapshot=null}catch(e){$('status').textContent=e.message;$('apply').disabled=false}};
$('cancel').onclick=async()=>{stop=true;cancelled=true;try{await call('cancel');$('status').textContent='취소했습니다.';$('apply').disabled=true;$('read').disabled=true}catch(e){$('status').textContent=e.message}};
tabs();
