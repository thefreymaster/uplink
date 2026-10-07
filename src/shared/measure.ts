import type { LatencyResult, ThroughputResult } from './protocol';

export const DURATION_OPTIONS_MS = [5_000, 10_000, 15_000, 30_000] as const;
export const DEFAULT_DURATION_MS = 10_000;
export const STREAM_OPTIONS = [1, 2, 4, 8] as const;
export const DEFAULT_STREAMS = 4;

/** Idle latency: sequential pings after a short warm-up. */
export const LATENCY_SAMPLES = 20;
export const LATENCY_WARMUP = 2;
export const LATENCY_GAP_MS = 40;
/** Pings sent on the control socket while a transfer saturates the link. */
export const LOADED_PING_INTERVAL_MS = 250;
/** How often transfer progress is sampled. */
export const SAMPLE_INTERVAL_MS = 100;
/** Window used for the live (instantaneous) rate. */
export const RATE_WINDOW_MS = 500;
/** Window used for the reported peak rate. */
export const PEAK_WINDOW_MS = 1_000;
/** Leading share of each transfer excluded from the result while TCP ramps up. */
export const WARMUP_FRACTION = 0.2;

/** Cumulative transfer sample: [ms since the phase started, total bytes so far]. */
export type CumulativeSample = readonly [number, number];

export function mbpsFrom(bytes: number, ms: number): number {
  return ms > 0 ? (bytes * 8) / (ms * 1000) : 0;
}

/** Rate over the trailing `windowMs`, ending at sample `end` (defaults to the last sample). */
export function windowRate(samples: readonly CumulativeSample[], windowMs: number, end = samples.length - 1): number {
  if (end < 1) return 0;
  const [tEnd, bEnd] = samples[end];
  let i = end - 1;
  while (i > 0 && tEnd - samples[i][0] < windowMs) i--;
  const [tStart, bStart] = samples[i];
  return mbpsFrom(bEnd - bStart, tEnd - tStart);
}

/**
 * Final throughput for a phase: bytes moved after the warm-up cut divided by the time they took.
 * Equivalent to a time-weighted mean of the steady-state rate.
 */
export function summarizeThroughput(samples: readonly CumulativeSample[], warmupFraction = WARMUP_FRACTION): ThroughputResult {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2) {
    return { mbps: 0, bytes: last?.[1] ?? 0, durationMs: Math.round(last?.[0] ?? 0), peakMbps: 0 };
  }
  const [tEnd, bEnd] = last;
  const cut = tEnd * warmupFraction;
  let start = samples[0];
  for (const s of samples) {
    if (s[0] >= cut) {
      start = s;
      break;
    }
  }
  if (tEnd - start[0] < 250) start = samples[0];

  let peak = 0;
  for (let k = 1; k < samples.length; k++) {
    if (samples[k][0] < PEAK_WINDOW_MS) continue;
    peak = Math.max(peak, windowRate(samples, PEAK_WINDOW_MS, k));
  }
  const mbps = mbpsFrom(bEnd - start[1], tEnd - start[0]);
  return {
    mbps: round(mbps, 2),
    bytes: bEnd,
    durationMs: Math.round(tEnd),
    peakMbps: round(Math.max(peak, mbps), 2),
  };
}

/** Median, spread and jitter (mean absolute difference between consecutive RTTs, as in RFC 3550). */
export function summarizeLatency(rtts: ReadonlyArray<number | null>): LatencyResult | null {
  const valid = rtts.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  let diffSum = 0;
  for (let i = 1; i < valid.length; i++) diffSum += Math.abs(valid[i] - valid[i - 1]);
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return {
    medianMs: round(median, 3),
    minMs: round(sorted[0], 3),
    maxMs: round(sorted[sorted.length - 1], 3),
    avgMs: round(sum / valid.length, 3),
    jitterMs: round(valid.length > 1 ? diffSum / (valid.length - 1) : 0, 3),
    count: valid.length,
    lost: rtts.length - valid.length,
  };
}

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
