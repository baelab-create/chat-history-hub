import test from 'node:test';
import assert from 'node:assert/strict';
import {recipientFromPassword,encryptDevice,decryptDevice} from '../device-crypto.mjs';
import {normalizeSnapshot,accumulateDevice} from '../collector/metadata.mjs';
import {mergeCatalogs,validateRegistry} from '../device-catalog.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const t={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',kind:'codex',title:'Example',updatedAt:1700000000,archived:false};
const snapshot=(id,items=[t],date='2026-01-01T00:00:00Z')=>({schemaVersion:1,deviceId:id,deviceName:'Test laptop',source:'desktop-app',observedAt:date,items});
test('public-key encryption can only be opened by the signed-in recipient',async()=>{
 const recipient=await recipientFromPassword('test-only secret with sufficient length');
 assert.equal(recipient.publicKey,(await recipientFromPassword('test-only secret with sufficient length')).publicKey);
 const input=snapshot(a);const encrypted=await encryptDevice(input,recipient.publicKey);
 assert.deepEqual(await decryptDevice(encrypted,recipient),input);
 assert.ok(!JSON.stringify(encrypted).includes(t.title));
 await assert.rejects(decryptDevice(encrypted,await recipientFromPassword('different secret')));
 await assert.rejects(decryptDevice({...encrypted,deviceId:b},recipient));
 await assert.rejects(decryptDevice({...encrypted,ciphertext:encrypted.ciphertext.slice(0,-8)+'AAAAAAAA'},recipient));
});
test('missing records and older snapshots do not remove previously collected records',()=>{
 const first=snapshot(a);const later=snapshot(a,[],'2026-01-02T00:00:00Z');
 assert.equal(accumulateDevice(first,later).items.length,1);
 assert.equal(accumulateDevice(later,first).items.length,0);
 assert.throws(()=>accumulateDevice(first,snapshot(b)));
});
test('merge devices by service and ID, preserve legacy records, select newer titles',()=>{
 const old={...t,title:'Old title',kind:'codex'};
 const cloud={...t,kind:'chatgpt',title:'Cloud'};
 const result=mergeCatalogs([old,cloud],[snapshot(a,[{...t,title:'New title',updatedAt:t.updatedAt+1}]),snapshot(b)]);
 assert.equal(result.length,2);assert.equal(result.find(x=>x.kind==='codex').title,'New title');
 assert.deepEqual(result.find(x=>x.kind==='codex').devices,['legacy-desktop',a,b]);
 assert.equal(mergeCatalogs([cloud],[]).length,1);
});
test('only whitelisted metadata survives normalization',()=>{
 const result=normalizeSnapshot(snapshot(a,[{...t,body:'secret body',preview:'secret preview',cwd:'/private/path'}]));
 assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('/private'));
 assert.throws(()=>normalizeSnapshot(snapshot(a,[{...t,updatedAt:Infinity}])));
 assert.throws(()=>normalizeSnapshot(snapshot(a,[t,t])));
 assert.deepEqual(normalizeSnapshot(snapshot(a,[])).items,[]);
});
test('registry rejects duplicate entries and path traversal',()=>{
 assert.deepEqual(validateRegistry({version:1,devices:[a,b]}),[a,b]);
 assert.throws(()=>validateRegistry({version:1,devices:[a,a]}));
 assert.throws(()=>validateRegistry({version:1,devices:['../catalog.enc.json']}));
});
