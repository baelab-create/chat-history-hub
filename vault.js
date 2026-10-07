import {unlockWithGoogle} from './google-auth.js';
import {recipientFromPassword} from './device-crypto.mjs';
export let deviceRecipient=null;
const decode64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
let titleKey;
let catalogMaterial;
let catalogCiphertext;
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
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(data.items)||!data.items.length)throw Error('빈 목록으로 기존 내역을 바꿀 수 없습니다.');
  catalogMaterial=material;catalogCiphertext=envelope.ciphertext;
  try{deviceRecipient=await recipientFromPassword(password)}catch{deviceRecipient=null}
  return data;
}
export async function refreshCatalog(){
 if(!catalogMaterial)throw Error('먼저 로그인해 주세요.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('./catalog.enc.json?refresh='+Math.floor(Date.now()/30000),{cache:'no-store',signal:controller.signal,credentials:'omit'});
  if(!response.ok)throw Error('목록 연결 실패');
  const raw=await response.text();if(raw.length>20000000)throw Error('목록 크기 오류');
  const envelope=JSON.parse(raw);
  if(envelope.version!==1||envelope.iterations!==600000)throw Error('목록 형식 오류');
  if(envelope.ciphertext===catalogCiphertext)return null;
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:decode64(envelope.salt),iterations:600000},catalogMaterial,{name:'AES-GCM',length:256},false,['decrypt']);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.iv),additionalData:new TextEncoder().encode('chat-history-hub:v1')},key,decode64(envelope.ciphertext));
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(data.items)||!data.items.length||!Number.isFinite(Date.parse(data.collectedAt))||data.items.some(t=>typeof t.id!=='string'||typeof t.title!=='string'||!Number.isFinite(t.updatedAt)||Math.abs(t.updatedAt)>=8e12))throw Error('목록 형식 오류');
  catalogCiphertext=envelope.ciphertext;
  return data;
 }finally{clearTimeout(timer)}
}
export function unlockCatalog(){return unlockWithGoogle()}
