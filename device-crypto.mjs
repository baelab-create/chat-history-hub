// Collectors receive only a public key. Decryption stays inside the signed-in page.
const utf8 = new TextEncoder();
const context = 'chat-history-hub:device:v1';
const b64 = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join(''));
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function recipientFromPassword(password) {
  const material=await crypto.subtle.importKey('raw',utf8.encode(password.trim()),'PBKDF2',false,['deriveBits']);
  const seed = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:utf8.encode(context+':recipient'),iterations:600000},material,256));
  const prefix = Uint8Array.from([48,46,2,1,0,48,5,6,3,43,101,110,4,34,4,32]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);pkcs8.set(prefix);pkcs8.set(seed,prefix.length);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, 'X25519', true, ['deriveBits']);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const publicKey = b64(bytes(jwk.x.replace(/-/g,'+').replace(/_/g,'/')));
  return {privateKey, publicKey};
}
async function aesKey(privateKey, publicKey, salt, usages) {
  const peer = await crypto.subtle.importKey('raw', bytes(publicKey), 'X25519', false, []);
  const shared = await crypto.subtle.deriveBits({name:'X25519', public:peer}, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:bytes(salt),info:utf8.encode(context)}, material, {name:'AES-GCM',length:256}, false, usages);
}
export async function encryptDevice(data, recipient) {
  const pair = await crypto.subtle.generateKey('X25519', true, ['deriveBits']);
  const ephemeral = b64(await crypto.subtle.exportKey('raw', pair.publicKey));
  const salt = b64(crypto.getRandomValues(new Uint8Array(32)));
  const iv = b64(crypto.getRandomValues(new Uint8Array(12)));
  const key = await aesKey(pair.privateKey, recipient, salt, ['encrypt']);
  const ciphertext = b64(await crypto.subtle.encrypt({name:'AES-GCM',iv:bytes(iv),additionalData:utf8.encode(context + ':' + data.deviceId)},key,utf8.encode(JSON.stringify(data))));
  return {version:1,algorithm:'X25519-HKDF-SHA256-AES256GCM',deviceId:data.deviceId,recipient,ephemeral,salt,iv,ciphertext};
}
export async function decryptDevice(envelope, recipient) {
  if(envelope?.version!==1 || envelope.algorithm!=='X25519-HKDF-SHA256-AES256GCM' || envelope.recipient!==recipient.publicKey || !/^[a-f0-9-]{36}$/.test(envelope.deviceId) || typeof envelope.ciphertext!=='string' || envelope.ciphertext.length>20000000)throw Error('Invalid encrypted device catalog');
  const key=await aesKey(recipient.privateKey,envelope.ephemeral,envelope.salt,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:utf8.encode(context + ':' + envelope.deviceId)},key,bytes(envelope.ciphertext));
  const data=JSON.parse(new TextDecoder().decode(plain));
  if(data.deviceId!==envelope.deviceId)throw Error('Device identity mismatch');
  return data;
}
