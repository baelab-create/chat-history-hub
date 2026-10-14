const id=new URL(location.href).searchParams.get('request'),$=id=>document.getElementById(id);
let snapshot;
async function call(type,extra={}){const r=await chrome.runtime.sendMessage({type,id,...extra});if(!r?.ok)throw Error(r?.error||'연결을 확인해 주세요.');return r;}
async function tabs(){try{const r=await call('tabs');$('tabs').replaceChildren(...r.tabs.map(t=>new Option(t.title,String(t.id))));$('status').textContent=r.tabs.length?'탭을 선택하고 목록 읽기를 누르세요.':'Chrome에서 chatgpt.com을 열고 로그인한 뒤 탭 목록을 새로고침해 주세요.';}catch(e){$('status').textContent=e.message}}
$('reload').onclick=tabs;
$('read').onclick=async()=>{snapshot=null;$('apply').disabled=true;$('read').disabled=true;$('preview').replaceChildren();try{const r=await call('read',{tabId:Number($('tabs').value)});snapshot=r.snapshot;for(const row of snapshot.items){const li=document.createElement('li');li.textContent=(row.pinned?'[고정] ':'')+row.title;$('preview').append(li)}$('status').textContent=`${snapshot.items.length}개 확인. 화면에 불러온 목록만 포함하며, 정확한 수정일은 제공되지 않습니다. 아래 버튼을 누르면 이 제목과 링크가 Hub로 전달되어 암호화 저장됩니다.`;$('apply').disabled=false}catch(e){$('status').textContent=e.message}finally{$('read').disabled=false}};
$('apply').onclick=async()=>{$('apply').disabled=true;try{await call('apply',{snapshot});$('status').textContent='Hub로 전달했습니다. 저장 결과는 Hub에서 확인하세요.';snapshot=null}catch(e){$('status').textContent=e.message;$('apply').disabled=false}};
$('cancel').onclick=async()=>{try{await call('cancel');$('status').textContent='취소했습니다.';$('apply').disabled=true;$('read').disabled=true}catch(e){$('status').textContent=e.message}};
tabs();
