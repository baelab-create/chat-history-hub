const decode64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export async function decryptCatalog(envelope, password) {
  if (envelope.version !== 1 || envelope.iterations !== 600000) throw new Error('지원하지 않는 목록 형식입니다.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:decode64(envelope.salt),iterations:envelope.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.iv),additionalData:new TextEncoder().encode('chat-history-hub:v1')},key,decode64(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function unlockCatalog() {
  const form = document.getElementById('unlock-form');
  const status = document.getElementById('unlock-status');
  const input = document.getElementById('password');
  const button = document.getElementById('unlock-button');
  return new Promise(resolve => {
    form.addEventListener('submit',async event => {
      event.preventDefault();button.disabled=true;status.textContent='목록을 여는 중입니다…';
      let envelope;
      try {
        const response=await fetch('./catalog.enc.json',{cache:'no-store'});
        if(!response.ok)throw new Error();
        envelope=await response.json();
      } catch {status.textContent='목록을 내려받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';button.disabled=false;return;}
      try {
        const data=await decryptCatalog(envelope,input.value);
        if(!Array.isArray(data.items))throw new Error();
        input.value='';document.getElementById('unlock').hidden=true;
        document.getElementById('catalog').hidden=false;
        resolve(data);
      } catch {status.textContent='비밀번호가 맞지 않거나 목록 파일이 손상되었습니다.';input.select();}
      finally {button.disabled=false;}
    });
  });
}
