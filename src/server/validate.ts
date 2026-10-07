import { DEFAULT_DURATION_MS, DEFAULT_STREAMS, clamp } from '../shared/measure';
import type {
  ClientResult,
  DeviceInfo,
  LatencyResult,
  Limits,
  PhaseCode,
  TestConfig,
  TestSamples,
  ThroughputResult,
} from '../shared/protocol';

type Obj = Record<string, unknown>;

const MAX_SAMPLES = 4_000;

function obj(value: unknown): Obj | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Obj) : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function sanitizeDevice(raw: unknown): DeviceInfo {
  const o = obj(raw) ?? {};
  const id = typeof o.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(o.id) ? o.id : 'unknown';
  return { id, label: cleanText(o.label, 64) || 'Unnamed device' };
}

export function sanitizeConfig(raw: unknown, limits: Limits): TestConfig {
  const o = obj(raw) ?? {};
  return {
    durationMs: Math.round(clamp(num(o.durationMs, DEFAULT_DURATION_MS), limits.minDurationMs, limits.maxDurationMs)),
    streams: Math.round(clamp(num(o.streams, DEFAULT_STREAMS), 1, limits.maxStreams)),
  };
}

function latency(raw: unknown): LatencyResult | null {
  const o = obj(raw);
  if (!o) return null;
  const fields = ['medianMs', 'minMs', 'maxMs', 'avgMs', 'jitterMs', 'count', 'lost'] as const;
  const values = fields.map((f) => nonNegative(o[f]));
  if (values.some((v) => v === null)) return null;
  const [medianMs, minMs, maxMs, avgMs, jitterMs, count, lost] = values as number[];
  if (medianMs > 60_000 || count < 1) return null;
  return { medianMs, minMs, maxMs, avgMs, jitterMs, count: Math.round(count), lost: Math.round(lost) };
}

function throughput(raw: unknown): ThroughputResult | null {
  const o = obj(raw);
  if (!o) return null;
  const mbps = nonNegative(o.mbps);
  const bytes = nonNegative(o.bytes);
  const durationMs = nonNegative(o.durationMs);
  const peakMbps = nonNegative(o.peakMbps);
  if (mbps === null || bytes === null || durationMs === null || peakMbps === null) return null;
  if (mbps > 1_000_000) return null;
  return { mbps, bytes: Math.round(bytes), durationMs: Math.round(durationMs), peakMbps };
}

function pairs(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  for (const item of raw.slice(0, MAX_SAMPLES)) {
    if (!Array.isArray(item)) continue;
    const t = nonNegative(item[0]);
    const v = nonNegative(item[1]);
    if (t !== null && v !== null) out.push([Math.round(t), Math.round(v * 100) / 100]);
  }
  return out;
}

function pings(raw: unknown): TestSamples['ping'] {
  if (!Array.isArray(raw)) return [];
  const out: TestSamples['ping'] = [];
  for (const item of raw.slice(0, MAX_SAMPLES)) {
    if (!Array.isArray(item)) continue;
    const t = nonNegative(item[0]);
    const rtt = nonNegative(item[1]);
    const phase = item[2];
    if (t === null || rtt === null || (phase !== 0 && phase !== 1 && phase !== 2)) continue;
    out.push([Math.round(t), Math.round(rtt * 1000) / 1000, phase as PhaseCode]);
  }
  return out;
}

export function sanitizeResult(raw: unknown): ClientResult {
  const o = obj(raw) ?? {};
  const samples = obj(o.samples) ?? {};
  return {
    latency: latency(o.latency),
    download: throughput(o.download),
    loadedDown: latency(o.loadedDown),
    loadedUp: latency(o.loadedUp),
    samples: { download: pairs(samples.download), upload: pairs(samples.upload), ping: pings(samples.ping) },
  };
}
