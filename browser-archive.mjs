// Stable shards keep old records searchable without one oversized cloud document.
export async function splitBrowserArchive(snapshot){
 const buckets=new Map();
 for(const item of snapshot.items){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.id)));
  const bucket=digest[0]%128;
  if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(item);
 }
 return Promise.all([...buckets].map(async([bucket,items])=>{
  const d=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot.deviceId+':archive:'+bucket)));
  d[6]=(d[6]&15)|64;d[8]=(d[8]&63)|128;
  const h=Array.from(d.slice(0,16),n=>n.toString(16).padStart(2,'0')).join('');
  return {...snapshot,deviceId:`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`,archiveDeviceId:snapshot.deviceId,deviceName:snapshot.deviceName||'Chrome · 누적 대화',items};
 }));
}
