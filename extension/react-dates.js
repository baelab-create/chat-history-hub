// React timestamp approach and committed-fiber resolution adapted from
// Hangzhi/chatgpt-timestamp-extension (MIT, Copyright (c) 2025 Hangzhi).
// See THIRD_PARTY_LICENSES.txt. Serialized into MAIN world; keep helpers inside.
// Inspect only rendered row/turn owners. Never read message content, tokens,
// cookies, arbitrary globals, or make requests. Missing/ambiguous dates stay null.
export function readReactDates(ids){
 const wanted=new Set(ids),found=new Map(),now=Date.now()/1000;
 const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
 const visible=e=>Boolean(e?.getClientRects().length)&&!e.closest('[hidden],[aria-hidden="true"],[inert]');
 const seconds=v=>{
  if(v===null||v===undefined||v==='')return null;
  let n=typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)?Date.parse(v)/1000:NaN;
  if(n>=1e12)n/=1000;
  return Number.isFinite(n)&&n>=946684800&&n<=now+60?n:null;
 };
 function pathFrom(element){
  const key=Object.keys(element).find(k=>k.startsWith('__reactFiber$'));
  if(!key)return [];
  let node=own(element,key),root;const path=[],seen=new Set();
  for(let i=0;node&&i<400;i++,node=own(node,'return')){
   if(seen.has(node))return [];seen.add(node);path.push(node);
   if(own(node,'tag')===3){root=node;break;}
  }
  const state=own(root,'stateNode'),current=own(state,'current');
  if(!root||!current||(current!==root&&current!==own(root,'alternate')))return [];
  const committed=[current];let work=0;
  for(let i=path.length-2;i>=0;i--){
   const matches=[],siblings=new Set();let child=own(committed.at(-1),'child');
   for(;child;child=own(child,'sibling')){
    if(++work>4096||siblings.has(child))return [];siblings.add(child);
    if(child===path[i]||child===own(path[i],'alternate'))matches.push(child);
   }
   if(matches.length!==1)return [];committed.push(matches[0]);
  }
  return own(state,'current')===current?committed.reverse():[];
 }
 function record(id){
  if(!found.has(id))found.set(id,{created:new Set(),updated:new Set(),messages:new Set()});
  return found.get(id);
 }
 function conversation(value,id,scoped=false){
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const declared=[own(value,'id'),own(value,'conversationId'),own(value,'conversation_id'),own(value,'threadId')].filter(v=>typeof v==='string');
  if(declared.length?declared.some(v=>v.toLowerCase()!==id):!scoped)return;
  // A message may also carry conversationId/create_time. Never treat it as a chat.
  if(own(value,'author')||own(value,'messageId')||own(value,'role'))return;
  if(!scoped&&typeof own(value,'title')!=='string')return;
  const target=record(id);
  for(const [set,keys] of [[target.created,['create_time','created_at','createdAt','createTime']],[target.updated,['update_time','updated_at','updatedAt','updateTime']]]){
   for(const key of keys){const date=seconds(own(value,key));if(date!==null)set.add(date);}
  }
 }
 function rowProps(props,id){
  let queue=[props];const seen=new Set();
  for(let depth=0;depth<3&&queue.length;depth++){
   const next=[];
   for(const value of queue.slice(0,64)){
    if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);conversation(value,id);
    for(const key of ['conversation','thread','chat','item','data']){const child=own(value,key);if(child&&typeof child==='object')next.push(child);}
   }
   queue=next;
  }
 }
 const roots=['#app-shell-sidebar','#history','[data-testid="history"]','nav[aria-label="Chat history"]','nav[aria-label="채팅 기록"]'].map(s=>document.querySelector(s)).filter(visible);
 for(const root of roots)for(const a of root.querySelectorAll('a[href]')){
  if(!visible(a))continue;
  let url;try{url=new URL(a.getAttribute('href'),location.origin)}catch{continue;}
  const match=url.pathname.match(/^\/(?:g\/[^/]+\/)?c\/([a-f0-9-]{36})\/?$/i),id=match?.[1].toLowerCase();
  if(url.origin!==location.origin||url.search||url.hash||!wanted.has(id))continue;
  for(const fiber of pathFrom(a).slice(0,32))rowProps(own(fiber,'memoizedProps'),id);
 }
 const active=location.pathname?.match(/^\/(?:g\/[^/]+\/)?c\/([a-f0-9-]{36})\/?$/i)?.[1].toLowerCase();
 if(wanted.has(active)){
  const scoped=path=>path.some(f=>own(own(f,'memoizedProps'),'conversationId')===active||own(own(f,'memoizedProps'),'conversation_id')===active);
  // Classic ChatGPT message surface: match the DOM message ID and owner chat ID.
  for(const element of document.querySelectorAll('main [data-message-id]')){
   if(!visible(element))continue;
   const path=pathFrom(element);if(!scoped(path))continue;
   const id=element.getAttribute('data-message-id');
   for(const fiber of path.slice(0,32)){
    const props=own(fiber,'memoizedProps');rowProps(props,active);
    const messages=own(props,'messages');if(!Array.isArray(messages)||messages.length>128)continue;
    for(const message of messages){
     if(own(message,'id')!==id||own(own(message,'author'),'role')!=='user')continue;
     const stamp=seconds(own(message,'create_time'));if(stamp!==null)record(active).messages.add(stamp);
    }
   }
  }
  // Redesigned ChatGPT: verify the live turn identity before consulting its mapping.
  for(const element of document.querySelectorAll('[data-app-shell-main-surface] [data-thread-find-target="conversation"] [data-turn-key]')){
   if(!visible(element))continue;
   const path=pathFrom(element);
   const entry=path.slice(0,32).map(f=>own(own(f,'memoizedProps'),'entry')).find(e=>own(e,'conversationId')===active&&Array.isArray(own(own(e,'turn'),'items')));
   if(!entry)continue;
   const turn=own(entry,'turn'),items=own(turn,'items'),users=items.filter(i=>own(i,'type')==='user-message');
   if(users.length!==1)continue;
   const unit=element.querySelector('[data-chatgpt-search-unit-key$=":user"][data-chatgpt-search-message-ids]');
   const visibleIds=(unit?.getAttribute('data-chatgpt-search-message-ids')||'').trim().split(/\s+/);
   const ids=[own(users[0],'messageId'),own(users[0],'serverMessageId')].filter(id=>typeof id==='string'&&visibleIds.includes(id));
   if(new Set(ids).size!==1)continue;const messageId=ids[0];
   const snapshots=[];let budget=2048;
   const inspect=value=>{
    if(--budget<0)return;
    const rendered=own(value,'renderedConversation'),turns=own(value,'renderedTurns'),mapping=own(rendered,'mapping');
    if(!rendered||!mapping||!Array.isArray(turns)||turns.length>50000)return;
    if(turns.filter(t=>own(t,'id')===own(entry,'id')&&own(t,'turn')===turn).length!==1)return;
    const node=own(mapping,messageId),message=own(node,'message');
    if(own(node,'id')!==messageId||own(message,'id')!==messageId||own(own(message,'author'),'role')!=='user')return;
    snapshots.push({mapping,rendered,message});
   };
   for(const fiber of path){
    if(own(own(fiber,'memoizedProps'),'conversationId')!==active)continue;
    let hook=own(fiber,'memoizedState');const seen=new Set();
    while(hook&&budget>0&&!seen.has(hook)){
     seen.add(hook);const value=own(hook,'memoizedState');inspect(value);if(Array.isArray(value))inspect(value[0]);hook=own(hook,'next');
    }
    const cache=own(own(own(fiber,'updateQueue'),'memoCache'),'data');
    if(Array.isArray(cache)&&cache.length<=32)for(const row of cache)if(Array.isArray(row)&&row.length<=1024)for(const value of row){if(budget<=0)break;inspect(value);}
   }
   if(budget<=0||!snapshots.length||snapshots.some(s=>s.mapping!==snapshots[0].mapping))continue;
   const snapshot=snapshots[0];conversation(snapshot.rendered,active,true);
   const stamp=seconds(own(snapshot.message,'create_time'));if(stamp!==null)record(active).messages.add(stamp);
  }
 }
 const result=[];
 for(const id of wanted){
  const r=found.get(id);if(!r)continue;
  let createdAt=r.created.size===1?[...r.created][0]:null,updatedAt=r.updated.size===1?[...r.updated][0]:null;
  if(createdAt&&updatedAt&&createdAt>updatedAt){createdAt=null;updatedAt=null;}
  const lastMessageAt=r.messages.size?Math.max(...r.messages):null;
  if(createdAt||updatedAt||lastMessageAt)result.push({id,createdAt,updatedAt,lastMessageAt,dateEvidence:'react-v1'});
 }
 return result;
}

export function withReactDates(snapshot,dates){
 const byId=new Map((dates||[]).map(d=>[d.id,d]));
 return {...snapshot,version:2,collectorVersion:'1.3.0',items:snapshot.items.map(row=>{
  const d=byId.get(row.id);return d?{...row,createdAt:d.createdAt,updatedAt:d.updatedAt,lastMessageAt:d.lastMessageAt,dateEvidence:d.dateEvidence}:row;
 })};
}
