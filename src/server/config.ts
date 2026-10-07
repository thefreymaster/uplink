import fs from 'node:fs';
import os from 'node:os';

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.warn(`Ignoring ${name}=${raw}: not a number`);
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(n)));
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

/** Same forms Express accepts for 'trust proxy': true/false, a hop count, or a list of addresses/subnets. */
function trustProxyEnv(): boolean | number | string[] {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function defaultServerName(): string {
  const host = os.hostname();
  // Inside Docker the hostname is the container id, which makes a poor display name.
  return /^[0-9a-f]{12,64}$/.test(host) ? 'Uplink server' : host;
}

const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;

export const config = {
  version: readVersion(),
  production: process.env.NODE_ENV === 'production',
  port: intEnv('PORT', 5090, 1, 65535),
  host: process.env.HOST?.trim() || undefined,
  serverName: process.env.SERVER_NAME?.trim() || defaultServerName(),
  databaseUrl,
  /** Without DATABASE_URL, node-postgres falls back to the standard PG* variables. */
  databaseConfigured: Boolean(databaseUrl || process.env.PGHOST || process.env.PGDATABASE),
  dbAutoCreate: boolEnv('DB_AUTO_CREATE', true),
  trustProxy: trustProxyEnv(),
  /** Extra origins allowed to open WebSockets, e.g. "https://speed.example.com". "*" disables the check. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  limits: {
    minDurationMs: 3_000,
    maxDurationMs: intEnv('MAX_TEST_SECONDS', 30, 5, 120) * 1000,
    maxStreams: intEnv('MAX_STREAMS', 8, 1, 32),
  },
  retentionDays: intEnv('RETENTION_DAYS', 0, 0, 36_500),
};

export type Config = typeof config;
