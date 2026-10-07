import pg from 'pg';
import { config } from './config';
import { errorMessage, log } from './log';
import type { DbState, DeviceSummary, TestDetail, TestPage, TestSamples, TestSummary } from '../shared/protocol';

// bigint columns (byte counters) fit comfortably in a double.
pg.types.setTypeParser(20, (value: string) => Number(value));

export interface TestRow {
  id: string;
  created_at: Date;
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  download_mbps: number | null;
  upload_mbps: number | null;
  latency_ms: number | null;
  latency_min_ms: number | null;
  latency_max_ms: number | null;
  jitter_ms: number | null;
  loaded_down_ms: number | null;
  loaded_up_ms: number | null;
  download_bytes: number | null;
  upload_bytes: number | null;
  download_ms: number | null;
  upload_ms: number | null;
  download_peak_mbps: number | null;
  upload_peak_mbps: number | null;
  phase_duration_ms: number;
  streams: number;
  device_id: string | null;
  device_label: string | null;
  client_ip: string | null;
  user_agent: string | null;
  server_name: string | null;
  app_version: string | null;
  samples: TestSamples | null;
}

const COLUMNS: ReadonlyArray<keyof TestRow> = [
  'id', 'created_at', 'started_at', 'finished_at', 'duration_ms',
  'download_mbps', 'upload_mbps', 'latency_ms', 'latency_min_ms', 'latency_max_ms', 'jitter_ms',
  'loaded_down_ms', 'loaded_up_ms', 'download_bytes', 'upload_bytes', 'download_ms', 'upload_ms',
  'download_peak_mbps', 'upload_peak_mbps', 'phase_duration_ms', 'streams',
  'device_id', 'device_label', 'client_ip', 'user_agent', 'server_name', 'app_version', 'samples',
];

const SUMMARY_KEYS = [
  'id', 'created_at', 'duration_ms', 'download_mbps', 'upload_mbps', 'latency_ms', 'jitter_ms',
  'loaded_down_ms', 'loaded_up_ms', 'streams', 'phase_duration_ms', 'device_id', 'device_label', 'client_ip',
] as const satisfies ReadonlyArray<keyof TestRow>;

const SUMMARY_COLUMNS = SUMMARY_KEYS.join(', ');

const MIGRATIONS: ReadonlyArray<{ version: number; name: string; sql: string }> = [
  {
    version: 1,
    name: 'create speed_tests',
    sql: `
      CREATE TABLE IF NOT EXISTS speed_tests (
        id                 uuid PRIMARY KEY,
        created_at         timestamptz NOT NULL DEFAULT now(),
        started_at         timestamptz NOT NULL,
        finished_at        timestamptz NOT NULL,
        duration_ms        integer NOT NULL,
        download_mbps      double precision,
        upload_mbps        double precision,
        latency_ms         double precision,
        latency_min_ms     double precision,
        latency_max_ms     double precision,
        jitter_ms          double precision,
        loaded_down_ms     double precision,
        loaded_up_ms       double precision,
        download_bytes     bigint,
        upload_bytes       bigint,
        download_ms        integer,
        upload_ms          integer,
        download_peak_mbps double precision,
        upload_peak_mbps   double precision,
        phase_duration_ms  integer NOT NULL,
        streams            smallint NOT NULL,
        device_id          text,
        device_label       text,
        client_ip          text,
        user_agent         text,
        server_name        text,
        app_version        text,
        samples            jsonb
      );
      CREATE INDEX IF NOT EXISTS speed_tests_created_idx ON speed_tests (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS speed_tests_device_idx ON speed_tests (device_id, created_at DESC);
    `,
  },
];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TestFilter {
  since?: Date;
  device?: string;
  before?: { createdAt: Date; id: string };
  limit: number;
}

export function encodeCursor(test: Pick<TestSummary, 'createdAt' | 'id'>): string {
  return `${test.createdAt}|${test.id}`;
}

export function decodeCursor(raw: string): TestFilter['before'] | null {
  const [ts, id] = raw.split('|');
  if (!ts || !id || !UUID_RE.test(id)) return null;
  const createdAt = new Date(ts);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

export function toSummary(r: Pick<TestRow, (typeof SUMMARY_KEYS)[number]>): TestSummary {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    durationMs: r.duration_ms,
    downloadMbps: r.download_mbps,
    uploadMbps: r.upload_mbps,
    latencyMs: r.latency_ms,
    jitterMs: r.jitter_ms,
    loadedDownMs: r.loaded_down_ms,
    loadedUpMs: r.loaded_up_ms,
    streams: r.streams,
    phaseDurationMs: r.phase_duration_ms,
    deviceId: r.device_id,
    deviceLabel: r.device_label,
    clientIp: r.client_ip,
  };
}

export function toDetail(r: TestRow): TestDetail {
  return {
    ...toSummary(r),
    startedAt: r.started_at.toISOString(),
    finishedAt: r.finished_at.toISOString(),
    latencyMinMs: r.latency_min_ms,
    latencyMaxMs: r.latency_max_ms,
    downloadBytes: r.download_bytes,
    uploadBytes: r.upload_bytes,
    downloadMs: r.download_ms,
    uploadMs: r.upload_ms,
    downloadPeakMbps: r.download_peak_mbps,
    uploadPeakMbps: r.upload_peak_mbps,
    userAgent: r.user_agent,
    serverName: r.server_name,
    appVersion: r.app_version,
    samples: r.samples,
  };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isMissingDatabase(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '3D000';
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE', '57P01', '57P02', '57P03']);

/** Plain-language reason for the UI; logs keep the driver's message. */
export function describeDbError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  switch (e?.code) {
    case 'ECONNREFUSED':
      return 'PostgreSQL refused the connection. Is it running, and is the host/port right?';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'The database host name could not be resolved.';
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
      return 'Timed out reaching PostgreSQL.';
    case '28P01':
    case '28000':
      return 'PostgreSQL rejected the username or password.';
    case '57P01':
    case '57P02':
    case '57P03':
      return 'PostgreSQL is shutting down or restarting.';
    case '3D000':
      return 'The database does not exist and could not be created.';
    case '42501':
      return 'The database user lacks permission.';
  }
  if (/timeout exceeded when trying to connect/i.test(e?.message ?? '')) return 'Timed out reaching PostgreSQL.';
  if (/Connection terminated/i.test(e?.message ?? '')) return 'The connection to PostgreSQL was closed.';
  return e?.message ?? 'Database error';
}

/** Errors that mean "the database went away" rather than "this query was wrong". */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && (CONNECTION_CODES.has(e.code) || e.code.startsWith('08'))) return true;
  return /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(e.message ?? '');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Database {
  private pool: pg.Pool | null = null;
  private stopped = false;
  private ready = false;
  private healthy = true;
  private probeTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private listeners = new Set<(state: DbState) => void>();

  get connected(): boolean {
    return this.ready && this.pool !== null && this.healthy;
  }

  state(): DbState {
    return { configured: config.databaseConfigured, connected: this.connected, error: this.connected ? null : this.lastError };
  }

  onChange(listener: (state: DbState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }

  /** Connects in the background, retrying until the database is reachable (it may boot after us). */
  start(): void {
    if (!config.databaseConfigured) {
      this.lastError = 'No database configured (set DATABASE_URL)';
      log.warn('No DATABASE_URL set: tests will run but results will not be saved');
      return;
    }
    void this.connectLoop();
  }

  private async connectLoop(): Promise<void> {
    let attempt = 0;
    while (!this.stopped && !this.ready) {
      try {
        this.pool = await this.connect(true);
        this.ready = true;
        this.lastError = null;
        log.info('Database ready');
        this.emit();
      } catch (err) {
        attempt++;
        this.lastError = describeDbError(err);
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
        log.warn(`Database unavailable (${errorMessage(err)}); retrying in ${Math.round(delay / 1000)}s`);
        this.emit();
        await sleep(delay);
      }
    }
  }

  private poolConfig(database?: string): pg.PoolConfig {
    const base: pg.PoolConfig = {
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: 'uplink',
    };
    if (config.databaseUrl) {
      let connectionString = config.databaseUrl;
      if (database) {
        const url = new URL(config.databaseUrl);
        url.pathname = `/${encodeURIComponent(database)}`;
        connectionString = url.toString();
      }
      return { ...base, connectionString };
    }
    return database ? { ...base, database } : base;
  }

  private targetDatabase(): string | null {
    if (config.databaseUrl) {
      const url = new URL(config.databaseUrl);
      return decodeURIComponent(url.pathname.replace(/^\//, '')) || decodeURIComponent(url.username) || null;
    }
    return process.env.PGDATABASE || process.env.PGUSER || null;
  }

  private async connect(allowCreate: boolean): Promise<pg.Pool> {
    const pool = new pg.Pool(this.poolConfig());
    pool.on('error', (err) => {
      log.warn('Idle database connection error', err.message);
      if (this.pool === pool) this.markUnhealthy(err);
    });
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      await pool.end().catch(() => undefined);
      if (allowCreate && config.dbAutoCreate && isMissingDatabase(err)) {
        await this.createDatabase();
        return this.connect(false);
      }
      throw err;
    }
    await this.migrate(pool);
    return pool;
  }

  private async createDatabase(): Promise<void> {
    const name = this.targetDatabase();
    if (!name) throw new Error('Cannot determine database name to create');
    const admin = new pg.Client(this.poolConfig('postgres'));
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (exists.rowCount === 0) {
        await admin.query(`CREATE DATABASE ${quoteIdent(name)}`);
        log.info(`Created database "${name}"`);
      }
    } finally {
      await admin.end().catch(() => undefined);
    }
  }

  private async migrate(pool: pg.Pool): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(727375001)');
      await client.query(`
        CREATE TABLE IF NOT EXISTS uplink_migrations (
          version    integer PRIMARY KEY,
          name       text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`);
      const { rows } = await client.query<{ version: number }>('SELECT version FROM uplink_migrations');
      const applied = new Set(rows.map((r) => r.version));
      for (const m of MIGRATIONS) {
        if (applied.has(m.version)) continue;
        await client.query(m.sql);
        await client.query('INSERT INTO uplink_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        log.info(`Applied migration ${m.version}: ${m.name}`);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Runs a query and keeps `connected` honest: connection failures flip the state (and the UI)
   * to unavailable, and a background probe flips it back once the database answers again.
   */
  private async query<R extends pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>> {
    if (!this.pool || !this.ready) throw new Error('Database not ready');
    try {
      const result = await this.pool.query<R>(text, params);
      this.markHealthy();
      return result;
    } catch (err) {
      if (isConnectionError(err)) this.markUnhealthy(err);
      throw err;
    }
  }

  private markUnhealthy(err: unknown): void {
    if (!this.healthy) return;
    this.healthy = false;
    this.lastError = describeDbError(err);
    log.warn(`Lost the database connection (${errorMessage(err)})`);
    this.emit();
    this.probeTimer = setInterval(() => {
      this.pool?.query('SELECT 1').then(
        () => this.markHealthy(),
        () => undefined,
      );
    }, 5_000);
  }

  private markHealthy(): void {
    if (this.healthy) return;
    this.healthy = true;
    this.lastError = null;
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = null;
    log.info('Database connection restored');
    this.emit();
  }

  async insertTest(row: TestRow): Promise<TestDetail> {
    const values = COLUMNS.map((c) => (c === 'samples' && row.samples ? JSON.stringify(row.samples) : row[c]));
    const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await this.query<TestRow>(
      `INSERT INTO speed_tests (${COLUMNS.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return toDetail(rows[0]);
  }

  private where(filter: Omit<TestFilter, 'limit'>, params: unknown[]): string {
    const clauses: string[] = [];
    if (filter.since) {
      params.push(filter.since);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (filter.device) {
      params.push(filter.device);
      clauses.push(`device_id = $${params.length}`);
    }
    if (filter.before) {
      params.push(filter.before.createdAt, filter.before.id);
      clauses.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
    }
    return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  }

  async listTests(filter: TestFilter): Promise<TestPage> {
    const params: unknown[] = [];
    const where = this.where(filter, params);
    params.push(filter.limit + 1);
    const { rows } = await this.query<TestRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM speed_tests ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const items = rows.slice(0, filter.limit).map(toSummary);
    const nextCursor = rows.length > filter.limit ? encodeCursor(items[items.length - 1]) : null;
    return { items, nextCursor };
  }

  async exportTests(filter: Omit<TestFilter, 'limit' | 'before'>): Promise<TestDetail[]> {
    const params: unknown[] = [];
    const where = this.where(filter, params);
    const { rows } = await this.query<TestRow>(
      `SELECT ${COLUMNS.filter((c) => c !== 'samples').join(', ')}, NULL AS samples
         FROM speed_tests ${where} ORDER BY created_at DESC, id DESC LIMIT 100000`,
      params,
    );
    return rows.map(toDetail);
  }

  async getTest(id: string): Promise<TestDetail | null> {
    if (!UUID_RE.test(id)) return null;
    const { rows } = await this.query<TestRow>('SELECT * FROM speed_tests WHERE id = $1', [id]);
    return rows[0] ? toDetail(rows[0]) : null;
  }

  async deleteTest(id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const result = await this.query('DELETE FROM speed_tests WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listDevices(): Promise<DeviceSummary[]> {
    const { rows } = await this.query<{ device_id: string; label: string | null; count: number; last_seen: Date }>(`
      SELECT device_id,
             (array_agg(device_label ORDER BY created_at DESC))[1] AS label,
             count(*)::int AS count,
             max(created_at) AS last_seen
        FROM speed_tests
       WHERE device_id IS NOT NULL
       GROUP BY device_id
       ORDER BY last_seen DESC`);
    return rows.map((r) => ({ deviceId: r.device_id, label: r.label, count: r.count, lastSeen: r.last_seen.toISOString() }));
  }

  async countTests(): Promise<number> {
    const { rows } = await this.query<{ n: number }>('SELECT count(*)::int AS n FROM speed_tests');
    return rows[0]?.n ?? 0;
  }

  async purgeOlderThan(days: number): Promise<number> {
    const result = await this.query('DELETE FROM speed_tests WHERE created_at < now() - make_interval(days => $1)', [days]);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.probeTimer) clearInterval(this.probeTimer);
    const pool = this.pool;
    this.pool = null;
    this.ready = false;
    await pool?.end().catch(() => undefined);
  }
}
