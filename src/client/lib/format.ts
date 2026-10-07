export interface Parts {
  value: string;
  unit: string;
}

const DASH = '—';

export function speedParts(mbps: number | null | undefined): Parts {
  if (mbps === null || mbps === undefined || !Number.isFinite(mbps)) return { value: DASH, unit: 'Mbps' };
  if (mbps >= 1000) return { value: (mbps / 1000).toFixed(mbps >= 10_000 ? 1 : 2), unit: 'Gbps' };
  if (mbps >= 100) return { value: mbps.toFixed(0), unit: 'Mbps' };
  if (mbps >= 10) return { value: mbps.toFixed(1), unit: 'Mbps' };
  return { value: mbps.toFixed(2), unit: 'Mbps' };
}

export function formatSpeed(mbps: number | null | undefined): string {
  const p = speedParts(mbps);
  return p.value === DASH ? DASH : `${p.value} ${p.unit}`;
}

export function msParts(ms: number | null | undefined): Parts {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return { value: DASH, unit: 'ms' };
  if (ms < 1) return { value: ms.toFixed(2), unit: 'ms' };
  if (ms < 100) return { value: ms.toFixed(1), unit: 'ms' };
  return { value: ms.toFixed(0), unit: 'ms' };
}

export function formatMs(ms: number | null | undefined): string {
  const p = msParts(ms);
  return p.value === DASH ? DASH : `${p.value} ms`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return DASH;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

/** Compact axis label: 0, 250, 1G, 2.5G. */
export function axisSpeed(mbps: number): string {
  if (mbps >= 1000) return `${Number((mbps / 1000).toFixed(1))}G`;
  return `${Number(mbps.toFixed(mbps < 10 ? 1 : 0))}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const timeWithSeconds = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const shortDateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function formatDateTime(iso: string | number): string {
  return dateTime.format(new Date(iso));
}

export function formatShortDateTime(iso: string | number): string {
  return shortDateTime.format(new Date(iso));
}

export function formatDayMonth(iso: string | number): string {
  return dayMonth.format(new Date(iso));
}

export function formatTimeOfDay(iso: string | number): string {
  return timeOnly.format(new Date(iso));
}

export function formatTimeWithSeconds(iso: string | number): string {
  return timeWithSeconds.format(new Date(iso));
}
