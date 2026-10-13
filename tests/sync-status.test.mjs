import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionStatus} from '../sync-status.mjs';
const now=Date.parse('2026-10-13T10:00:00Z');
const catalog={collectedAt:'2026-10-07T09:29:57Z',items:[{kind:'chatgpt'}]};
test('a healthy local collector never makes old web titles look current',()=>{
 const d={deviceId:'a',deviceName:'PC',observedAt:'2026-10-13T09:59:00Z',cloudObservedAt:'2026-10-07T14:00:00Z',items:[{kind:'codex'},{kind:'chatgpt'}]};
 const result=collectionStatus(catalog,[d],now);
 assert.equal(result.cloudMode,'manual');assert.equal(result.cloudObservedAt,'2026-10-07T14:00:00.000Z');
 assert.equal(result.devices[0].stale,false);assert.equal(result.devices[0].localCount,1);assert.equal(result.devices[0].webCount,1);
 assert.equal(result.message.includes('자동 수집은 연결되어 있지'),true);
});
test('stopped collectors are visibly stale even when their files download successfully',()=>{
 const result=collectionStatus(catalog,[{deviceId:'a',observedAt:'2026-10-07T14:00:00Z',items:[{kind:'codex'}]}],now);
 assert.equal(result.devices[0].stale,true);
});
test('one-time fresh collection updates the observed date but never promises automatic sync',()=>{
 const result=collectionStatus({...catalog,collectedAt:'2026-10-13T09:58:00Z'},[],now);
 assert.equal(result.cloudObservedAt,'2026-10-13T09:58:00.000Z');assert.equal(result.cloudMode,'manual');
});
test('unknown and future observation times are not treated as current evidence',()=>{
 assert.equal(collectionStatus({...catalog,collectedAt:'invalid'},[],now).cloudObservedAt,null);
 assert.equal(collectionStatus({...catalog,collectedAt:'2026-10-14T00:00:00Z'},[],now).cloudObservedAt,null);
});
test('automatic status requires a fresh successful cloud observation',()=>{
 const device={deviceId:'b',deviceName:'PC',cloudMode:'app-bridge',cloudState:'connected',observedAt:'2026-10-13T09:59:00Z',cloudObservedAt:'2026-10-13T09:59:00Z',items:[{kind:'chatgpt'}]};
 assert.equal(collectionStatus(catalog,[device],now).cloudMode,'automatic');
 assert.equal(collectionStatus(catalog,[{...device,cloudState:'unavailable'}],now).cloudMode,'disconnected');
 assert.equal(collectionStatus(catalog,[{...device,cloudObservedAt:'2026-10-13T09:40:00Z'}],now).cloudMode,'disconnected');
 assert.equal(collectionStatus(catalog,[{...device,cloudObservedAt:'2026-10-14T00:00:00Z'}],now).cloudMode,'disconnected');
});
