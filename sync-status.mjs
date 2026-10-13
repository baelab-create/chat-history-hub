export function collectionStatus(catalog,snapshots=[],now=Date.now()){
 const validTime=value=>{const n=Date.parse(value);return Number.isFinite(n)&&n<=now+60000?n:null};
 const candidates=[catalog?.items?.some(i=>i.kind==='chatgpt')?validTime(catalog.collectedAt):null,...snapshots.filter(d=>d.items?.some(i=>i.kind==='chatgpt')).map(d=>validTime(d.cloudObservedAt))].filter(n=>n!==null);
 const devices=snapshots.map(d=>({
  deviceId:d.deviceId,deviceName:d.deviceName,localCount:d.items.filter(i=>i.kind==='codex').length,webCount:d.items.filter(i=>i.kind==='chatgpt').length,
  observedAt:d.observedAt,cloudObservedAt:d.cloudObservedAt||null,automatic:d.cloudMode==='app-bridge',
  connected:d.cloudMode==='app-bridge'&&d.cloudState==='connected'&&validTime(d.cloudObservedAt)!==null&&now-Date.parse(d.cloudObservedAt)<15*60000,
  stale:validTime(d.observedAt)===null||now-Date.parse(d.observedAt)>15*60000
 }));
 const active=devices.some(d=>d.connected),installed=devices.some(d=>d.automatic);
 return {cloudMode:active?'automatic':installed?'disconnected':'manual',
  cloudObservedAt:candidates.length?new Date(Math.max(...candidates)).toISOString():null,
  message:active?'자동 연결 중 · 앱에서 제목을 1분마다 확인하고 변경된 목록을 반영합니다.':
   installed?'자동 연결이 지연되고 있습니다. 연결된 PC의 ChatGPT 앱과 인터넷을 확인해 주세요. 마지막 정상 목록은 유지됩니다.':
   'ChatGPT 자동 수집은 연결되어 있지 않습니다. 마지막으로 확인한 대화 목록을 표시합니다.',devices};
}
