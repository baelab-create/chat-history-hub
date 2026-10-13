// Reading a published file does not collect new conversations from ChatGPT.
// This deployment has no unattended collector for ordinary ChatGPT web chats.
export function collectionStatus(catalog, snapshots=[], now=Date.now()) {
 const validTime=value=>{const n=Date.parse(value);return Number.isFinite(n)&&n<=now+60000?n:null};
 const candidates=[catalog?.items?.some(i=>i.kind==='chatgpt')?validTime(catalog.collectedAt):null,
  ...snapshots.filter(d=>d.items?.some(i=>i.kind==='chatgpt')).map(d=>validTime(d.cloudObservedAt))].filter(n=>n!==null);
 return {cloudMode:'manual',cloudObservedAt:candidates.length?new Date(Math.max(...candidates)).toISOString():null,
  message:'ChatGPT 자동 수집은 연결되어 있지 않습니다. 마지막으로 확인한 대화 목록을 표시합니다.',
  devices:snapshots.map(d=>({deviceId:d.deviceId,deviceName:d.deviceName,
   localCount:d.items.filter(i=>i.kind==='codex').length,webCount:d.items.filter(i=>i.kind==='chatgpt').length,
   observedAt:d.observedAt,cloudObservedAt:d.cloudObservedAt||null,
   stale:validTime(d.observedAt)===null||now-Date.parse(d.observedAt)>15*60000}))};
}
