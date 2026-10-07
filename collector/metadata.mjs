// Shared by the local probe and the browser. Never accepts conversation bodies.
const idPattern = /^[a-z0-9-]{10,80}$/i;
export function normalizeSnapshot(input) {
  if (input?.schemaVersion !== 1 || !['codex-local','desktop-app'].includes(input.source) ||
      !/^[a-f0-9-]{36}$/.test(input.deviceId) || !Number.isFinite(Date.parse(input.observedAt)) ||
      Date.parse(input.observedAt) > Date.now() + 60000 || !Array.isArray(input.items) || input.items.length > 5000) {
    throw Error('Invalid device snapshot');
  }
  const unique = new Map();
  for (const value of input.items) {
    if (!idPattern.test(value?.id) || typeof value.title !== 'string' || !value.title.trim() ||
        value.title.length > 1000 || !Number.isFinite(value.updatedAt) || value.updatedAt <= 0 ||
        value.updatedAt > Date.now() / 1000 + 86400 || typeof value.archived !== 'boolean') throw Error('Invalid title record');
    const kind=value.kind||'codex';if(!['codex','chatgpt'].includes(kind))throw Error('Invalid source kind');
    const item = {id: value.id, kind, title: value.title.trim(), updatedAt: value.updatedAt, archived: value.archived, project:typeof value.project==='string'?value.project.slice(0,300):'프로젝트 없음'};
    if (unique.has(item.kind+':'+item.id)) throw Error('Duplicate record in device snapshot');
    unique.set(item.kind+':'+item.id, item);
  }
  return {schemaVersion: 1, deviceId: input.deviceId, deviceName:typeof input.deviceName==='string'?input.deviceName.slice(0,100):'추가 기기', source: input.source, observedAt: new Date(input.observedAt).toISOString(),
    cloudObservedAt: typeof input.cloudObservedAt==='string'&&Number.isFinite(Date.parse(input.cloudObservedAt))?input.cloudObservedAt:null,
    coverage: 'named-local-threads-and-observed-cloud-titles', completeForDeletion: false,
    items: [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))};
}

export function accumulateDevice(previous, incoming) {
  const next = normalizeSnapshot(incoming);
  if (!previous) return next;
  const old = normalizeSnapshot(previous);
  if (old.deviceId !== next.deviceId) throw Error('Different device');
  if (Date.parse(next.observedAt) <= Date.parse(old.observedAt)) return old;
  const items = new Map(old.items.map(item => [item.kind+':'+item.id, item]));
  for (const item of next.items) {const key=item.kind+':'+item.id;const before=items.get(key);if(!before||item.updatedAt>=before.updatedAt)items.set(key,item);}
  // A missing record is not proof of deletion, even when this PC lists all its known IDs.
  return normalizeSnapshot({...next, items: [...items.values()]});
}

export function sameMetadata(a, b) {
  return JSON.stringify(normalizeSnapshot(a).items) === JSON.stringify(normalizeSnapshot(b).items);
}

export function combineDevices(snapshots) {
  const merged = new Map();
  for (const input of snapshots) {
    const snapshot = normalizeSnapshot(input);
    for (const item of snapshot.items) {
      const existing = merged.get(item.kind+':'+item.id);
      if (!existing) {
        merged.set(item.kind+':'+item.id, {...item, devices: [snapshot.deviceId], observedAt: snapshot.observedAt});
        continue;
      }
      const devices = [...new Set([...existing.devices, snapshot.deviceId])].sort();
      const newer = item.updatedAt > existing.updatedAt ||
        (item.updatedAt === existing.updatedAt && snapshot.observedAt > existing.observedAt);
      merged.set(item.kind+':'+item.id, {...(newer ? {...item, observedAt: snapshot.observedAt} : existing), devices});
    }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
