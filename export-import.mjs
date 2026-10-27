// Read a user-selected export locally. Only allowlisted metadata leaves this module.
const MAX_JSON=128*1024*1024;
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const timestamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=Date.now()/1000+60000/1000?value:null;
const invalid=()=>Error('내보내기 파일 형식을 확인하지 못했습니다. ChatGPT에서 받은 ZIP 또는 conversations.json을 선택해 주세요.');

export function parseExportMetadata(text){
 let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw invalid()}
 const rows=Array.isArray(data)?data:data?.conversations;
 if(!Array.isArray(rows)||!rows.length||rows.length>50000)throw invalid();
 const items=new Map();let skipped=0;
 for(const row of rows){
  const id=row?.id||row?.conversation_id,createdAt=timestamp(row?.create_time),updatedAt=timestamp(row?.update_time);
  if(!uuid.test(id)||typeof row?.title!=='string'||!row.title.trim()||(!createdAt&&!updatedAt)){skipped++;continue;}
  const key=id.toLowerCase(),old=items.get(key);
  const item={id:key,kind:'chatgpt',title:row.title.trim().slice(0,1000),createdAt,updatedAt,archived:row.is_archived===true,project:'프로젝트 없음'};
  if(!old){items.set(key,item);continue;}
  items.set(key,{...(updatedAt>old.updatedAt?item:old),createdAt:Math.min(old.createdAt||Infinity,createdAt||Infinity)===Infinity?null:Math.min(old.createdAt||Infinity,createdAt||Infinity),updatedAt:Math.max(old.updatedAt||0,updatedAt||0)||null});
 }
 if(!items.size)throw Error('제목과 날짜가 포함된 대화를 찾지 못했습니다. conversations.json이 들어 있는 원본 내보내기 파일을 선택해 주세요.');
 return {items:[...items.values()],skipped};
}

export function exportSnapshot(metadata,deviceId){
 if(!uuid.test(deviceId)||!Array.isArray(metadata?.items)||!metadata.items.length||metadata.items.length>50000)throw invalid();
 return {schemaVersion:1,deviceId,deviceName:'ChatGPT · 날짜 포함 내보내기',source:'chatgpt-export',observedAt:new Date().toISOString(),cloudObservedAt:null,localObservedAt:null,collectionMode:'manual',cloudMode:'manual',cloudState:'unavailable',items:metadata.items};
}

const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
async function slice(file,start,length){
 if(start<0||length<0||start+length>file.size)throw invalid();
 return new Uint8Array(await file.slice(start,start+length).arrayBuffer());
}
function crc32(bytes){
 let crc=0xffffffff;
 const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
async function conversationJsonFromZip(file){
 const tail=await slice(file,Math.max(0,file.size-65557),Math.min(file.size,65557)),end=view(tail);
 let eocd=-1;
 for(let p=tail.length-22;p>=0;p--)if(end.getUint32(p,true)===0x06054b50&&p+22+end.getUint16(p+20,true)===tail.length){eocd=p;break}
 if(eocd<0)throw invalid();
 const count=end.getUint16(eocd+10,true),size=end.getUint32(eocd+12,true),offset=end.getUint32(eocd+16,true);
 if(count===65535||size===0xffffffff||offset===0xffffffff)throw Error('이 ZIP은 먼저 압축을 푼 뒤 conversations.json 파일을 선택해 주세요.');
 if(end.getUint16(eocd+4,true)!==0||end.getUint16(eocd+6,true)!==0||end.getUint16(eocd+8,true)!==count||size>16*1024*1024)throw invalid();
 const central=await slice(file,offset,size),dir=view(central);let target=null,p=0;
 for(let n=0;n<count;n++){
  if(p+46>central.length||dir.getUint32(p,true)!==0x02014b50)throw invalid();
  const nameLength=dir.getUint16(p+28,true),extra=dir.getUint16(p+30,true),comment=dir.getUint16(p+32,true),next=p+46+nameLength+extra+comment;
  if(next>central.length)throw invalid();
  const name=new TextDecoder().decode(central.subarray(p+46,p+46+nameLength));
  if(/(^|\/)conversations\.json$/i.test(name)){
   if(target)throw Error('conversations.json 파일이 여러 개입니다. 필요한 파일 하나를 압축 해제한 뒤 선택해 주세요.');
   target={flags:dir.getUint16(p+8,true),method:dir.getUint16(p+10,true),crc:dir.getUint32(p+16,true),compressed:dir.getUint32(p+20,true),uncompressed:dir.getUint32(p+24,true),offset:dir.getUint32(p+42,true)};
  }
  p=next;
 }
 if(!target)throw Error('ZIP에서 conversations.json을 찾지 못했습니다. ChatGPT 원본 내보내기 파일인지 확인해 주세요.');
 if(target.flags&1||![0,8].includes(target.method))throw Error('이 압축 형식은 직접 읽을 수 없습니다. 압축을 푼 뒤 conversations.json을 선택해 주세요.');
 if(target.uncompressed>MAX_JSON||target.compressed>MAX_JSON)throw Error('대화 목록 파일이 128MB를 넘습니다. 이 가져오기에서 지원하는 크기를 초과했습니다.');
 const header=view(await slice(file,target.offset,30));
 if(header.getUint32(0,true)!==0x04034b50||header.getUint16(8,true)!==target.method||header.getUint16(6,true)&1)throw invalid();
 const start=target.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
 if(start+target.compressed>offset)throw invalid();
 let bytes;
 if(target.method===0)bytes=await slice(file,start,target.compressed);
 else{
  let decompressor;try{decompressor=new DecompressionStream('deflate-raw')}catch{throw Error('이 브라우저는 ZIP 읽기를 지원하지 않습니다. 압축을 푼 뒤 conversations.json을 선택해 주세요.')}
  const reader=file.slice(start,start+target.compressed).stream().pipeThrough(decompressor).getReader();
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>target.uncompressed||length>MAX_JSON){await reader.cancel();throw invalid()}chunks.push(value)}}catch{throw invalid()}
  bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 }
 if(bytes.length!==target.uncompressed||crc32(bytes)!==target.crc)throw Error('ZIP 파일이 손상되었거나 완전히 다운로드되지 않았습니다. 파일을 다시 받아 주세요.');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

export async function readExportFile(file){
 if(!file||!file.size)throw invalid();
 let text;
 if(/\.zip$/i.test(file.name))text=await conversationJsonFromZip(file);
 else if(/\.json$/i.test(file.name)){
  if(file.size>MAX_JSON)throw Error('JSON 파일이 128MB를 넘습니다. 이 가져오기에서 지원하는 크기를 초과했습니다.');
  text=await file.text();
 }else throw invalid();
 return parseExportMetadata(text);
}
