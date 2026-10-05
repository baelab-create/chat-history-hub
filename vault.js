const decode64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
let titleKey;
const titleStorage='chat-history-hub:titles:v1';
export async function loadTitles(storage=titleStorage){
  const raw=localStorage.getItem(storage);if(!raw)return {};
  const saved=JSON.parse(raw);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(saved.iv)},titleKey,decode64(saved.data));
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function saveTitles(titles,storage=titleStorage){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},titleKey,new TextEncoder().encode(JSON.stringify(titles)));
  const encode=bytes=>btoa(Array.from(new Uint8Array(bytes),b=>String.fromCharCode(b)).join(''));
  localStorage.setItem(storage,JSON.stringify({iv:encode(iv),data:encode(bytes)}));
}
export async function decryptCatalog(envelope, password) {
  if (envelope.version !== 1 || envelope.iterations !== 600000) throw new Error('지원하지 않는 목록 형식입니다.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.trim()), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:decode64(envelope.salt),iterations:envelope.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.iv),additionalData:new TextEncoder().encode('chat-history-hub:v1')},key,decode64(envelope.ciphertext));
  titleKey=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode('chat-history-hub:local-titles:v1'),iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function unlockCatalog() {
  if(typeof googleLoginConfiguration!=='undefined'&&googleLoginConfiguration.enabled)return unlockWithGoogle();
  const form = document.getElementById('unlock-form');
  const status = document.getElementById('unlock-status');
  const input = document.getElementById('password');
  const button = document.getElementById('unlock-button');
  const reveal=document.getElementById('show-password');
  reveal.addEventListener('change',event=>{input.type=event.target.checked?'text':'password'});
  button.disabled=false;reveal.disabled=false;status.textContent='';
  return new Promise(resolve => {
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if(!input.value.trim()){status.textContent='이 대화에서 전달받은 목록 비밀번호를 입력해 주세요.';input.focus();return;}
      if(!globalThis.crypto?.subtle){status.textContent='현재 브라우저에서는 잠금을 풀 수 없습니다. Chrome 또는 Edge에서 https 주소로 다시 열어 주세요.';return;}
      button.disabled=true;status.textContent='목록을 여는 중입니다…';
      let envelope;
      try {
        const embedded=document.getElementById('encrypted-catalog');
        if(embedded){envelope=JSON.parse(embedded.textContent)}else{
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
        let response;try{response=await fetch('./catalog.enc.json',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer)}
        if(!response.ok)throw new Error();
        envelope=await response.json();
        }
      } catch {status.textContent='목록을 내려받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';button.disabled=false;return;}
      try {
        const data=await decryptCatalog(envelope,input.value);
        if(!Array.isArray(data.items))throw new Error();
        input.value='';input.type='password';document.getElementById('show-password').checked=false;document.getElementById('unlock').hidden=true;
        document.getElementById('catalog').hidden=false;
        resolve(data);
      } catch {status.textContent='목록 비밀번호가 일치하지 않습니다. ChatGPT 계정 비밀번호가 아니라, 이 대화에서 전달받은 비밀번호를 복사해 주세요.';input.select();}
      finally {button.disabled=false;}
    });
  });
}
