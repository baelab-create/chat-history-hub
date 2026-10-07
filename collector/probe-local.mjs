// Read-only feasibility probe. Never starts/resumes a conversation or an AI turn.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {normalizeSnapshot} from './metadata.mjs';

const root = new URL('../', import.meta.url);
const privateDir = new URL('private/collector/', root);
await mkdir(privateDir, {recursive: true});
let deviceId;
try { deviceId = (await readFile(new URL('device-id.txt', privateDir), 'utf8')).trim(); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  deviceId = randomUUID();
  await writeFile(new URL('device-id.txt', privateDir), deviceId + '\n', {flag: 'wx', mode: 0o600});
}
if (!/^[a-f0-9-]{36}$/.test(deviceId)) throw Error('Invalid device identity');
let proc;
try { proc = spawn(process.env.HUB_CODEX_BIN || 'codex', ['app-server', '--listen', 'stdio://'], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
}); } catch { console.error(JSON.stringify({success:false, reason:'Could not start read-only collector', previousSnapshotRetained:true})); process.exit(1); }
const rl = createInterface({input: proc.stdout});
const pending = new Map();
let nextId = 1, stderrBytes = 0;
proc.stderr.on('data', chunk => { stderrBytes += chunk.length; }); // Never log raw app output.
proc.stdin.on('error', () => {});
function rejectPending(reason) { for (const {reject, timer} of pending.values()) { clearTimeout(timer); reject(reason); } pending.clear(); }
proc.on('error', () => rejectPending(Error('Collector process could not start')));
proc.on('exit', () => rejectPending(Error('Collector process exited before completing metadata query')));
rl.on('line', line => {
  let message; try { message = JSON.parse(line); } catch { return; }
  const p = pending.get(message.id); if (!p) return;
  pending.delete(message.id); clearTimeout(p.timer);
  if (message.error) p.reject(Error('Metadata query rejected (code ' + message.error.code + ')'));
  else p.resolve(message.result);
});
function call(method, params) {
  if (!['initialize', 'thread/list'].includes(method)) throw Error('Read-only method required');
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error('Metadata query timed out')); }, 15000);
    pending.set(id, {resolve, reject, timer});
    proc.stdin.write(JSON.stringify({method, id, params}) + '\n');
  });
}
const startedAt = Date.now();
try {
  await call('initialize', {clientInfo: {name: 'chat_history_hub_probe', title: 'Chat History Hub metadata probe', version: '0.1.0'}});
  proc.stdin.write(JSON.stringify({method: 'initialized', params: {}}) + '\n');
  const items = [], seen = new Set();
  let unnamed = 0, pages = 0;
  for (const archived of [false, true]) {
    let cursor = null;
    const cursors = new Set();
    do {
      if (++pages > 100) throw Error('Page limit reached; previous snapshot retained');
      const result = await call('thread/list', {
        cursor, limit: 100, sortKey: 'updated_at', sortDirection: 'desc', archived,
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'unknown'], useStateDbOnly: true
      });
      if (!Array.isArray(result?.data)) throw Error('Invalid metadata response');
      for (const t of result.data) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        // preview may contain conversation text. It is deliberately never used as a title.
        if (typeof t.name !== 'string' || !t.name.trim()) { unnamed++; continue; }
        if (!/^[a-z0-9-]{10,80}$/i.test(t.id) || !Number.isFinite(t.updatedAt) || t.updatedAt <= 0) throw Error('Invalid title metadata');
        items.push({id: t.id, title: t.name.trim().slice(0, 1000), updatedAt: t.updatedAt, archived});
      }
      cursor = result.nextCursor;
      if (cursor && (typeof cursor !== 'string' || cursors.has(cursor))) throw Error('Invalid pagination cursor');
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const snapshot = normalizeSnapshot({schemaVersion: 1, deviceId, source: 'codex-local', observedAt: new Date().toISOString(), items});
  let previous;
  try { previous = JSON.parse(await readFile(new URL('local-snapshot.json', privateDir), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = new Map((previous?.items || []).map(i => [i.id, i]));
  let overlap = {chatgpt: 0, codex: 0};
  try {
    const oldCatalog = JSON.parse(await readFile(new URL('private/catalog.json', root), 'utf8'));
    for (const i of oldCatalog.items) if (seen.has(i.id) && i.kind in overlap) overlap[i.kind]++;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const report = {success: true, observedAt: snapshot.observedAt, totalMetadataRecords: seen.size,
    namedRecords: items.length, activeNamed: items.filter(i => !i.archived).length,
    archivedNamed: items.filter(i => i.archived).length, unnamedSkipped: unnamed, pages,
    added: items.filter(i => !before.has(i.id)).length,
    changed: items.filter(i => before.has(i.id) && JSON.stringify(i) !== JSON.stringify(before.get(i.id))).length,
    noLongerObserved: [...before.keys()].filter(id => !seen.has(id)).length,
    existingCatalogOverlap: overlap, elapsedMs: Date.now() - startedAt, stderrSuppressed: stderrBytes > 0,
    methodsUsed: ['initialize', 'thread/list'], modelCalls: 0, uploaded: false};
  await writeFile(new URL('local-snapshot.tmp.json', privateDir), JSON.stringify(snapshot), {mode: 0o600});
  await rename(new URL('local-snapshot.tmp.json', privateDir), new URL('local-snapshot.json', privateDir));
  await writeFile(new URL('probe-result.json', privateDir), JSON.stringify(report, null, 2), {mode: 0o600});
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({success: false, reason: error.message, previousSnapshotRetained: true}));
  process.exitCode = 1;
} finally {
  rejectPending(Error('Probe finished'));
  rl.close(); proc.stdin.end(); proc.kill();
}
