import test from 'node:test';
import assert from 'node:assert/strict';
import {scanHistory} from '../extension/history-scan.js';
import {splitBrowserArchive} from '../browser-archive.mjs';
const row=(n,rank=n)=>({id:`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,title:'대화 '+n,rank,pinned:rank===null,updatedAt:null});
test('collects beyond initial 25 rows even when old rows disappear from virtualized DOM',async()=>{
 let page=0;const result=await scanHistory({read:async()=>({items:[row(100,null),...Array.from({length:25},(_,i)=>row(page*25+i))]}),advance:async()=>{page=Math.min(9,page+1);return {atBottom:page===9,busy:false}},now:()=>1000});
 assert.equal(result.items.length,250);assert.equal(result.items.find(r=>r.id===row(100).id).rank,100);assert.equal(result.scan.reason,'no-more-visible');
});
test('loading errors preserve already collected older records and report partial result',async()=>{
 let page=0;const out=await scanHistory({read:async()=>{if(page===2)throw Error('offline');return {items:[row(page)]}},advance:async()=>{page++;return {atBottom:false}}});assert.equal(out.items.length,2);assert.equal(out.scan.reason,'load-error');
});
test('manual stop preserves records and does not claim the full history',async()=>{
 let stop=false;const out=await scanHistory({read:async()=>({items:[row(1)]}),advance:async()=>({atBottom:false}),stopped:()=>stop,onProgress:()=>{stop=true}});assert.equal(out.scan.reason,'stopped');assert.equal(out.items.length,1);
});
test('archive partitions are stable across repeated scans and retain all records',async()=>{
 const snapshot={deviceId:'22222222-2222-4222-8222-222222222222',items:Array.from({length:1500},(_,i)=>row(i))};
 const all=await splitBrowserArchive(snapshot),subset=await splitBrowserArchive({...snapshot,items:snapshot.items.slice(0,50)});
 assert.equal(all.flatMap(p=>p.items).length,1500);assert.equal(new Set(all.flatMap(p=>p.items.map(r=>r.id))).size,1500);
 for(const part of subset)for(const item of part.items)assert.ok(all.find(p=>p.deviceId===part.deviceId).items.some(r=>r.id===item.id));
 assert.ok(all.every(p=>p.archiveDeviceId===snapshot.deviceId));
});
test('repeated source loading failures retry twice then return partial history',async()=>{let retries=0;const out=await scanHistory({read:async()=>({items:[row(1)]}),advance:async args=>{if(args?.retry)retries++;return {error:true,retryAvailable:true,atBottom:true,busy:false}}});assert.equal(retries,2);assert.equal(out.scan.reason,'load-error');assert.equal(out.items.length,1)});
