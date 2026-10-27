import {normalizeSnapshot, accumulateDevice} from './collector/metadata.mjs?v=14';
export function mergeCatalogs(legacy, snapshots) {
  const map=new Map();
  const key=t=>(t.kind==='chatgpt'?'chatgpt':'codex')+':'+t.id;
  for(const t of legacy)map.set(key(t),{...t,devices:['legacy-desktop']});
  for(const raw of snapshots){
    const snapshot=normalizeSnapshot(raw);
    for(const t of snapshot.items){
      const old=map.get(key(t));
      const next={...t,webUrl:t.kind==='chatgpt'?'https://chatgpt.com/c/'+t.id:undefined};
      const createdAt=Math.min(old?.createdAt||Infinity,t.createdAt||Infinity);
      if(Number.isFinite(createdAt))next.createdAt=createdAt;
      if(old?.project&&(!t.project||t.project==='프로젝트 없음'))next.project=old.project;
      if(t.browserObservedAt&&(!old?.browserObservedAt||t.browserObservedAt>=old.browserObservedAt)){map.set(key(t),{...old,...next,updatedAt:t.updatedAt??old?.updatedAt??null,observedAt:snapshot.observedAt,devices:[...new Set([...(old?.devices||[]),snapshot.deviceId])]});continue;}
      const newer=!old||t.updatedAt>old.updatedAt||(t.updatedAt===old.updatedAt&&snapshot.observedAt>(old.observedAt||''));
      const result=newer?{...old,...next,observedAt:snapshot.observedAt}:{...old};
      if(Number.isFinite(createdAt))result.createdAt=createdAt;
      if(old?.browserObservedAt&&(!t.browserObservedAt||t.browserObservedAt<old.browserObservedAt)){Object.assign(result,{title:old.title,sidebarRank:old.sidebarRank,pinned:old.pinned,browserObservedAt:old.browserObservedAt});}
      map.set(key(t),{...result,devices:[...new Set([...(old?.devices||[]),snapshot.deviceId])]});
    }
  }
  return [...map.values()];
}
export function keepSnapshot(current, incoming){return accumulateDevice(current,incoming)}
export function validateRegistry(data){
  if(data?.version!==1||!Array.isArray(data.devices)||data.devices.length>100||data.devices.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))||new Set(data.devices).size!==data.devices.length)throw Error('Invalid device registry');
  return data.devices;
}
