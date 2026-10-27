import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readExportFile,parseExportMetadata,exportSnapshot} from '../export-import.mjs';
import {normalizeSnapshot,accumulateDevice} from '../collector/metadata.mjs';
import {mergeCatalogs} from '../device-catalog.mjs';
import {splitBrowserArchive} from '../browser-archive.mjs';
const id='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222';
const row={id,title:'대화 제목',create_time:1700000000,update_time:1700001234,is_archived:false,mapping:{body:'PRIVATE BODY'},user:{email:'PRIVATE EMAIL'}};
const metadata=rows=>parseExportMetadata(JSON.stringify(rows));
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}return (crc^0xffffffff)>>>0}
// A ZIP fixture with real CRC and deflate; no package dependency or account data.
function zip(entries,{method=8,declaredSize,checksum}={}){
 const chunks=[],directory=[];let offset=0;
 for(const [name,body] of entries){
  const bytes=Buffer.from(body),filename=Buffer.from(name),compressed=method===8?deflateRawSync(bytes):bytes,crc=checksum??crc32(bytes);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(method,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(declaredSize??bytes.length,22);header.writeUInt16LE(filename.length,26);
  chunks.push(header,filename,compressed);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(declaredSize??bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);directory.push(central,filename);offset+=header.length+filename.length+compressed.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(Buffer.concat(directory).length,12);end.writeUInt32LE(offset,16);
 return new File([...chunks,...directory,end],'export.zip');
}
test('export parsing keeps actual creation/modification dates and excludes all message/account data',()=>{
 const result=metadata([row]);assert.equal(result.items[0].updatedAt,row.update_time);assert.equal(result.items[0].createdAt,row.create_time);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 const normalized=normalizeSnapshot(exportSnapshot(result,device));assert.equal(normalized.source,'chatgpt-export');assert.equal(normalized.cloudObservedAt,null);assert.equal(normalized.items[0].createdAt,row.create_time);
 const createdOnly=metadata([{...row,update_time:null}]);assert.equal(createdOnly.items[0].updatedAt,null);assert.equal(normalizeSnapshot(exportSnapshot(createdOnly,device)).items[0].updatedAt,null);
});
test('JSON, stored ZIP and deflated ZIP import the same dates without reading unrelated ZIP members',async()=>{
 const json=JSON.stringify([row]),expected=metadata([row]);
 assert.deepEqual(await readExportFile(new File([json],'conversations.json')),expected);
 for(const method of [0,8])assert.deepEqual(await readExportFile(zip([['account.json','not valid json'],['folder/conversations.json',json]],{method})),expected);
});
test('corrupt, ambiguous, oversized, truncated or wrong exports fail with safe errors',async()=>{
 await assert.rejects(readExportFile(zip([['conversations.json',JSON.stringify([row])]],{checksum:1})),/손상/);
 await assert.rejects(readExportFile(zip([['conversations.json',JSON.stringify([row])]],{declaredSize:1})),/형식|손상/);
 await assert.rejects(readExportFile(zip([['conversations.json','[]']],{declaredSize:129*1024*1024})),/128MB/);
 await assert.rejects(readExportFile(zip([['a/conversations.json','[]'],['b/conversations.json','[]']])),/여러 개/);
 await assert.rejects(readExportFile(zip([['account.json','[]']])),/찾지 못/);
 await assert.rejects(readExportFile(new File(['PK broken'],'export.zip')),/형식/);
 await assert.rejects(readExportFile(new File(['PRIVATE MESSAGE not JSON'],'conversations.json')),error=>!error.message.includes('PRIVATE'));
 assert.throws(()=>metadata([{...row,id:'bad'}]));
 const result=metadata([row,{...row,id:'33333333-3333-4333-8333-333333333333',create_time:null,update_time:Date.now()/1000+86400}]);assert.equal(result.skipped,1);assert.equal(result.items.length,1);
});
test('date merging fills unknown dates and preserves browser titles in either arrival order',()=>{
 const exported=exportSnapshot(metadata([row]),device);
 const browser={schemaVersion:1,deviceId:id,source:'browser-sidebar',observedAt:new Date().toISOString(),items:[{id,kind:'chatgpt',title:'Current browser title',updatedAt:null,archived:false,sidebarRank:0,pinned:false,browserObservedAt:new Date().toISOString()}]};
 for(const snapshots of [[exported,browser],[browser,exported]]){
  const result=mergeCatalogs([],snapshots)[0];assert.equal(result.updatedAt,row.update_time);assert.equal(result.createdAt,row.create_time);assert.equal(result.title,'Current browser title');assert.equal(result.sidebarRank,0);
 }
 const legacy=[{id,kind:'chatgpt',title:'Newer desktop record',updatedAt:row.update_time+500}];
 const result=mergeCatalogs(legacy,[exported])[0];assert.equal(result.updatedAt,row.update_time+500);assert.equal(result.createdAt,row.create_time);
});
test('older export reimport cannot erase known dates or absent conversations; shard names reflect export source',async()=>{
 const current=exportSnapshot(metadata([row]),device);current.observedAt='2026-10-01T00:00:00Z';
 const olderData=exportSnapshot(metadata([{...row,update_time:null}]),device);olderData.observedAt='2026-10-02T00:00:00Z';
 const merged=accumulateDevice(current,olderData);assert.equal(merged.items[0].updatedAt,row.update_time);assert.equal(merged.items[0].createdAt,row.create_time);
 const parts=await splitBrowserArchive(current);assert.equal(parts[0].deviceName,'ChatGPT · 날짜 포함 내보내기');assert.equal(parts[0].archiveDeviceId,device);assert.equal(normalizeSnapshot(parts[0]).items[0].updatedAt,row.update_time);
});
