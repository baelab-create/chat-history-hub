// Runs at document_start, but is inert except in a home tab explicitly opened by Hub.
// Reads ONLY Gemini's own list response. Never sends an RPC or reads credentials/turns.
(()=>{
 if(window.top!==window||location.origin!=='https://gemini.google.com'||!/^\/(?:u\/\d+\/)?app\/?$/.test(location.pathname))return;
 const nonce=location.hash.match(/^#chat-history-hub=([a-f0-9-]{36})$/)?.[1];
 if(!nonce)return;
 history.replaceState(history.state,'',location.pathname+location.search);
 const key='__chatHistoryHubGeminiV1',rows=new Map(),requests=new WeakMap();
 const MAX=2*1024*1024;let stopped=false,received=false,invalid=false,timer;
 const originalFetch=window.fetch,originalOpen=XMLHttpRequest.prototype.open,originalSend=XMLHttpRequest.prototype.send;
 const isList=url=>{try{const u=new URL(url,location.href);return u.origin===location.origin&&u.pathname==='/_/BardChatUi/data/batchexecute'&&(u.searchParams.get('rpcids')||'').split(',').includes('MaZiqc')}catch{return false}};
 const validId=id=>typeof id==='string'&&/^c_[a-zA-Z0-9_-]{10,80}$/.test(id);
 const timestamp=value=>Array.isArray(value)&&value.length===2&&Number.isSafeInteger(value[0])&&value[0]>=946684800&&value[0]<=Date.now()/1000+60&&Number.isInteger(value[1])&&value[1]>=0&&value[1]<1e9?value[0]+value[1]/1e9:null;
 function parse(text){
  if(stopped||typeof text!=='string'||text.length>MAX)return;
  // batchexecute uses XSSI + length-prefixed JSON lines. Parse only MaZiqc frames,
  // then the documented chat-list field [2] and each record's timestamp field [5].
  const clean=text.replace(/^\)\]\}'[^\n]*\n/, '').trim();
  const consume=frame=>{
   if(!Array.isArray(frame)||!((frame[0]==='wrb.fr'&&frame[1]==='MaZiqc')||(frame[0]==='MaZiqc'&&frame[1]===null))||typeof frame[2]!=='string')return;
   try{
    const payload=JSON.parse(frame[2]),list=payload?.[2];
    if(!Array.isArray(list)||list.length>1000){invalid=true;return;}
    if(list.some(row=>!Array.isArray(row)||!validId(row[0])||typeof row[1]!=='string'||!row[1].trim()||row[1].length>1000)){invalid=true;return;}
    received=true;
    for(const row of list){
     const id=row[0].slice(2),updatedAt=timestamp(row[5]),old=rows.get(id);
     if(!old&&rows.size>=1000)break;
     rows.set(id,{id,title:row[1].trim(),webUrl:'https://gemini.google.com/app/'+id,rank:old?.rank??rows.size,pinned:false,updatedAt:updatedAt??old?.updatedAt??null,dateEvidence:'gemini-list-v1'});
    }
   }catch{invalid=true;}
  };
  const block=value=>{if(!Array.isArray(value))return;if(value[0]==='wrb.fr'||value[0]==='MaZiqc')consume(value);else for(const frame of value)consume(frame)};
  try{block(JSON.parse(clean));return;}catch{}
  for(const line of clean.split('\n')){if(!line.startsWith('['))continue;try{block(JSON.parse(line))}catch{}}
 }
 const opened=function(method,url,...rest){requests.set(this,isList(url));return originalOpen.call(this,method,url,...rest)};
 const sent=function(...args){
  if(!stopped&&requests.get(this))this.addEventListener('loadend',()=>{try{if(this.status>=200&&this.status<300&&(!this.responseType||this.responseType==='text'))parse(this.responseText)}catch{}},{once:true});
  return originalSend.apply(this,args);
 };
 const fetched=function(...args){
  const result=originalFetch.apply(this,args);
  if(!stopped&&isList(typeof args[0]==='string'||args[0] instanceof URL?args[0]:args[0]?.url)){
   void result.then(async response=>{
    if(stopped||!response.ok)return;
    const copy=response.clone(),reader=copy.body?.getReader();if(!reader)return;
    const decoder=new TextDecoder();let total=0,text='';
    try{while(!stopped){const part=await reader.read();if(part.done){parse(text+decoder.decode());return;}total+=part.value.byteLength;if(total>MAX)return;text+=decoder.decode(part.value,{stream:true});}}
    finally{await reader.cancel().catch(()=>{});}
   }).catch(()=>{});
  }
  return result;
 };
 function stop(){
  stopped=true;clearTimeout(timer);
  if(window.fetch===fetched)window.fetch=originalFetch;
  if(XMLHttpRequest.prototype.open===opened)XMLHttpRequest.prototype.open=originalOpen;
  if(XMLHttpRequest.prototype.send===sent)XMLHttpRequest.prototype.send=originalSend;
  rows.clear();
 }
 Object.defineProperty(window,key,{configurable:true,value:{read(token){if(token!==nonce||stopped)return null;return {received,invalid,version:3,service:'gemini',coverage:'loaded-sidebar-only',observedAt:new Date().toISOString(),items:[...rows.values()].map(row=>({...row}))}},stop(token){if(token===nonce)stop()}}});
 XMLHttpRequest.prototype.open=opened;XMLHttpRequest.prototype.send=sent;window.fetch=fetched;
 timer=setTimeout(stop,60000);
})();
