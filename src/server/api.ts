import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config';
import { type Database, type TestFilter, UUID_RE, decodeCursor, isConnectionError } from './db';
import { type Hub, serverInfo } from './hub';
import { log } from './log';
import type { InfoResponse, TestDetail } from '../shared/protocol';

const startedAt = Date.now();

function single(value: unknown): string | undefined {
  if (Array.isArray(value)) return single(value[0]);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseFilter(query: Request['query']): Omit<TestFilter, 'limit'> & { limit: number } {
  const limitRaw = Number(single(query.limit) ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, Math.round(limitRaw))) : 100;
  const sinceRaw = single(query.since);
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const cursor = single(query.before);
  return {
    limit,
    since: since && !Number.isNaN(since.getTime()) ? since : undefined,
    device: single(query.device)?.slice(0, 64),
    before: cursor ? (decodeCursor(cursor) ?? undefined) : undefined,
  };
}

const CSV_COLUMNS: Array<[string, (t: TestDetail) => unknown]> = [
  ['id', (t) => t.id],
  ['finished_at', (t) => t.createdAt],
  ['started_at', (t) => t.startedAt],
  ['duration_s', (t) => (t.durationMs / 1000).toFixed(1)],
  ['download_mbps', (t) => t.downloadMbps],
  ['upload_mbps', (t) => t.uploadMbps],
  ['latency_ms', (t) => t.latencyMs],
  ['jitter_ms', (t) => t.jitterMs],
  ['loaded_latency_down_ms', (t) => t.loadedDownMs],
  ['loaded_latency_up_ms', (t) => t.loadedUpMs],
  ['download_bytes', (t) => t.downloadBytes],
  ['upload_bytes', (t) => t.uploadBytes],
  ['streams', (t) => t.streams],
  ['phase_duration_s', (t) => t.phaseDurationMs / 1000],
  ['device', (t) => t.deviceLabel],
  ['device_id', (t) => t.deviceId],
  ['client_ip', (t) => t.clientIp],
  ['user_agent', (t) => t.userAgent],
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Keep spreadsheet apps from evaluating user-provided text (device names) as formulas.
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string' && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createApi(hub: Hub, db: Database): express.Router {
  const api = express.Router();

  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true, version: config.version, db: db.state(), uptimeS: Math.round((Date.now() - startedAt) / 1000) });
  });

  api.get('/info', async (req, res) => {
    const body: InfoResponse = {
      server: serverInfo(),
      clientIp: req.ip?.replace(/^::ffff:/, '') ?? null,
      status: hub.status(),
      db: { ...db.state(), tests: db.connected ? await db.countTests().catch(() => null) : null },
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
    };
    res.json(body);
  });

  const requireDb = (_req: Request, res: Response, next: NextFunction) => {
    if (db.connected) return next();
    const state = db.state();
    res.status(503).json({ error: 'database_unavailable', message: state.error ?? 'Database unavailable' });
  };

  api.get('/tests', requireDb, async (req, res) => {
    res.json(await db.listTests(parseFilter(req.query)));
  });

  api.get('/tests/:id', requireDb, async (req, res) => {
    const test = await db.getTest(String(req.params.id));
    if (!test) return void res.status(404).json({ error: 'not_found', message: 'No test with that id' });
    res.json(test);
  });

  api.delete('/tests/:id', requireDb, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id) || !(await db.deleteTest(id))) {
      return void res.status(404).json({ error: 'not_found', message: 'No test with that id' });
    }
    hub.broadcast({ t: 'test-deleted', id });
    res.status(204).end();
  });

  api.get('/devices', requireDb, async (_req, res) => {
    res.json(await db.listDevices());
  });

  api.get('/export.csv', requireDb, async (req, res) => {
    const { since, device } = parseFilter(req.query);
    const tests = await db.exportTests({ since, device });
    const lines = [CSV_COLUMNS.map(([name]) => name).join(',')];
    for (const t of tests) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(t))).join(','));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="uplink-tests-${stamp}.csv"`);
    res.send(`${lines.join('\r\n')}\r\n`);
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Unknown API route' });
  });

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (isConnectionError(err)) {
      res.status(503).json({ error: 'database_unavailable', message: db.state().error ?? 'Database unavailable' });
      return;
    }
    log.error('API error', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
  });

  return api;
}
