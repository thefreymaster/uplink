// Protocol-level checks against a running, idle server (no browser needed).
//   node scripts/protocol-check.mjs                 # against localhost:5090
//   BASE=192.168.1.10:5090 node scripts/protocol-check.mjs
// ALLOW_WRITE=1 also saves a run, checks it is broadcast and exported, then deletes that same run
// (it cleans up after itself, but other open apps will briefly see it).
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'localhost:5090';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(path, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${BASE}${path}`, { headers });
    const messages = [];
    ws.on('message', (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(data.toString()));
    });
    ws.on('open', () => resolve({ ws, messages, status: 101 }));
    ws.on('unexpected-response', (_req, res) => resolve({ ws: null, messages, status: res.statusCode }));
    ws.on('error', () => resolve({ ws: null, messages, status: 0 }));
  });
}

async function waitFor(messages, predicate, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const found = messages.find(predicate);
    if (found) return found;
    await sleep(20);
  }
  return null;
}

const hello = (label) => ({ t: 'hello', device: { id: `proto${label}0000`, label }, config: { durationMs: 3000, streams: 2 } });

// Live channel
const live = await open('/ws/live');
const liveHello = await waitFor(live.messages, (m) => m.t === 'hello');
check('live hello carries server info and status', Boolean(liveHello?.server?.name) && liveHello.status.busy === false);

// Origin check
const foreign = await open('/ws/live', { Origin: 'http://evil.example' });
check('foreign Origin is rejected', foreign.status === 403, `status ${foreign.status}`);
const sameOrigin = await open('/ws/live', { Origin: `http://${BASE}` });
check('same-origin WebSocket is accepted', sameOrigin.status === 101);
sameOrigin.ws?.close();

// Session A claims the server
const a = await open('/ws/session');
a.ws.send(JSON.stringify(hello('Device A')));
const welcomeA = await waitFor(a.messages, (m) => m.t === 'welcome');
check('session A welcomed', Boolean(welcomeA?.sessionId), `config ${JSON.stringify(welcomeA?.config)}`);
const busyStatus = await waitFor(live.messages, (m) => m.t === 'status' && m.status.busy && m.status.test.deviceLabel === 'Device A');
check('live subscribers see the server go busy', Boolean(busyStatus));

// Session B is turned away while A runs
const b = await open('/ws/session');
b.ws.send(JSON.stringify(hello('Device B')));
const busyB = await waitFor(b.messages, (m) => m.t === 'busy' || m.t === 'welcome');
check('second session gets busy with the active device', busyB?.t === 'busy' && busyB.test.deviceLabel === 'Device A');

// Ping/pong on the control channel
a.ws.send(JSON.stringify({ t: 'ping', i: 42 }));
check('control channel answers pings', Boolean(await waitFor(a.messages, (m) => m.t === 'pong' && m.i === 42)));

// Stream admission
const badSid = await open('/ws/stream?sid=nope&dir=down');
check('stream with unknown session is refused', badSid.status === 404, `status ${badSid.status}`);
const wrongPhase = await open(`/ws/stream?sid=${welcomeA.sessionId}&dir=down`);
check('stream before its phase is refused', wrongPhase.status === 409, `status ${wrongPhase.status}`);

a.ws.send(JSON.stringify({ t: 'phase', phase: 'download' }));
await sleep(50);
const s1 = await open(`/ws/stream?sid=${welcomeA.sessionId}&dir=down`);
const s2 = await open(`/ws/stream?sid=${welcomeA.sessionId}&dir=down`);
const s3 = await open(`/ws/stream?sid=${welcomeA.sessionId}&dir=down`);
check('exactly `streams` download connections are admitted', s1.status === 101 && s2.status === 101 && s3.status === 409, `${s1.status}/${s2.status}/${s3.status}`);

// Download data flows after 'start'
let received = 0;
s1.ws.on('message', (data, isBinary) => {
  if (isBinary) received += data.length;
});
s1.ws.send('start');
await sleep(600);
check('download stream delivers data after start', received > 1_000_000, `${(received / 1e6).toFixed(1)} MB in 0.6 s`);

// Cancel mid-test: closing the control socket releases the server and drops the streams
const before = await (await fetch(`http://${BASE}/api/info`)).json();
const s1Closed = new Promise((r) => s1.ws.on('close', r));
a.ws.close();
const idle = await waitFor(live.messages, (m) => m.t === 'status' && m.status.busy === false, 3000);
check('closing the session releases the lock', Boolean(idle));
check('its data streams are torn down', await Promise.race([s1Closed.then(() => true), sleep(2000).then(() => false)]));
const after = await (await fetch(`http://${BASE}/api/info`)).json();
check('a cancelled run saves nothing', after.db.tests === before.db.tests, `${before.db.tests} -> ${after.db.tests}`);

// B can run now
b.ws.close();
const c = await open('/ws/session');
c.ws.send(JSON.stringify(hello('Device C')));
check('a new session is welcomed once idle', (await waitFor(c.messages, (m) => m.t === 'welcome' || m.t === 'busy'))?.t === 'welcome');
c.ws.close();
await sleep(100);

// CSV export is well-formed even when empty.
const csv = await fetch(`http://${BASE}/api/export.csv`);
const text = await csv.text();
check('CSV export has the expected header', csv.headers.get('content-type')?.startsWith('text/csv') && text.startsWith('id,finished_at'));

if (process.env.ALLOW_WRITE === '1') {
  // A completed run is saved, broadcast, exported, and can be deleted again.
  const d = await open('/ws/session');
  d.ws.send(JSON.stringify(hello('Protocol check')));
  await waitFor(d.messages, (m) => m.t === 'welcome');
  const latency = { medianMs: 1, minMs: 0.8, maxMs: 1.4, avgMs: 1.05, jitterMs: 0.1, count: 20, lost: 0 };
  d.ws.send(JSON.stringify({ t: 'result', result: { latency, download: null, loadedDown: null, loadedUp: null, samples: { download: [], upload: [], ping: [] } } }));
  const saved = await waitFor(d.messages, (m) => m.t === 'saved');
  check('a finished run is saved', saved?.persisted === true && saved.test.latencyMs === 1, saved?.error ?? '');
  const id = saved?.test.id;
  check('the saved run is broadcast to live clients', Boolean(await waitFor(live.messages, (m) => m.t === 'test-saved' && m.test.id === id)));
  const csvAfter = await (await fetch(`http://${BASE}/api/export.csv`)).text();
  check('the saved run appears in the CSV export', Boolean(id) && csvAfter.includes(id));
  d.ws.close();
  if (id) {
    const del = await fetch(`http://${BASE}/api/tests/${id}`, { method: 'DELETE' });
    const deletedEvent = await waitFor(live.messages, (m) => m.t === 'test-deleted' && m.id === id);
    check('DELETE removes the run and is broadcast live', del.status === 204 && Boolean(deletedEvent));
    check('the deleted run is gone', (await fetch(`http://${BASE}/api/tests/${id}`)).status === 404);
  }
}
const badId = await fetch(`http://${BASE}/api/tests/not-a-uuid`);
check('malformed id is a clean 404', badId.status === 404);

live.ws.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
