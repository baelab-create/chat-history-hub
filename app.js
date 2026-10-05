import {unlockCatalog} from './vault.js?v=2';
const $=id=>document.getElementById(id);
let items=[];
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function validUrl(raw,kind){try{const u=new URL(raw);return kind==='web'?u.protocol==='https:'&&u.hostname==='chatgpt.com'&&!u.username&&!u.password:u.protocol==='codex:'&&u.hostname==='threads'&&/^\/[a-z0-9-]+$/i.test(u.pathname)&&!u.search&&!u.hash;}catch{return false}}
function render(){
 const q=$('query').value.trim().toLocaleLowerCase('ko');
 const from=$('from').value,to=$('to').value,project=$('project').value;
 const rows=items.filter(t=>(!q||t.title.toLocaleLowerCase('ko').includes(q))&&(!project||t.project===project)&&(!from||dateFormat.format(new Date(t.updatedAt*1000))>=from)&&(!to||dateFormat.format(new Date(t.updatedAt*1000))<=to)).sort((a,b)=>($('sort').value==='asc'?1:-1)*(a.updatedAt-b.updatedAt));
 $('count').textContent=rows.length+'개 대화';$('results').replaceChildren();
 if(from&&to&&from>to){$('results').append(el('div','empty','시작일을 종료일 이전으로 선택해 주세요.'));return}
 if(!rows.length){$('results').append(el('div','empty','검색 결과가 없습니다.'));return}
 let previousDay,group;
 for(const t of rows){
  const day=dateFormat.format(new Date(t.updatedAt*1000));
  if(day!==previousDay){const section=el('section','day-group');section.append(el('h2','day-heading',new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(t.updatedAt*1000))));group=el('div','rows');group.setAttribute('role','list');section.append(group);$('results').append(section);previousDay=day}
  const app=t.appUrl&&validUrl(t.appUrl,'app');const web=t.webUrl&&validUrl(t.webUrl,'web');
  const row=el('div','row');row.setAttribute('role','listitem');const body=el('div');const content=el(app||web?'a':'span','title',t.title);
  if(app||web){content.href=app?t.appUrl:t.webUrl;content.target='_blank';content.rel='noopener noreferrer';content.title=app?'이 PC의 앱에서 열기':'ChatGPT 웹에서 열기'}
  const d=new Date(t.updatedAt*1000);const date=el('time','',timeFormat.format(d));date.dateTime=d.toISOString();date.title='마지막 수정일 · 한국 시간';
  const meta=el('div','meta');meta.append(el('span','tag',t.kind==='chatgpt'?'ChatGPT':'로컬 작업'),el('span','',t.project||'프로젝트 없음'));body.append(content,meta);
  const actions=el('div','actions');const actionLink=(label,url)=>{const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a};
  if(app)actions.append(actionLink('앱에서 열기',t.appUrl));else{const b=el('button','','앱 연결 확인 중');b.disabled=true;actions.append(b)}
  if(web)actions.append(actionLink('웹에서 열기',t.webUrl));row.append(date,body,actions);group.append(row);
 }
}
async function load(){try{
 const data=await unlockCatalog();if(!Array.isArray(data.items))throw Error('대화 목록 형식을 확인할 수 없습니다.');
 const map=new Map();for(const t of data.items){if(typeof t.id==='string'&&typeof t.title==='string'&&Number.isFinite(t.updatedAt)&&Math.abs(t.updatedAt)<8e12)map.set(t.id,{...t,project:typeof t.project==='string'?t.project:'프로젝트 없음'})}items=[...map.values()];
 $('total').textContent=items.length;$('coverage').textContent=data.coverage||'수집 범위 확인 필요';for(const p of [...new Set(items.map(t=>t.project))].sort())$('project').add(new Option(p,p));render();
}catch(e){$('error').textContent=e.message;$('error').hidden=false;$('count').textContent='연결 확인 필요'}}
for(const id of ['query','project','from','to','sort'])$(id).addEventListener('input',render);
$('reset').onclick=()=>{for(const id of ['query','project','from','to'])$(id).value='';$('sort').value='desc';render()};$('lock').onclick=()=>location.reload();load();
