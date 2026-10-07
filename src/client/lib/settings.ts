import { DEFAULT_DURATION_MS, DEFAULT_STREAMS, DURATION_OPTIONS_MS, STREAM_OPTIONS } from '../../shared/measure';
import type { DeviceInfo } from '../../shared/protocol';
import { persistentStore, useStore } from './store';
import { defaultDeviceLabel } from './ua';

export interface TestSettings {
  durationMs: number;
  streams: number;
}

export const settingsStore = persistentStore<TestSettings>(
  'uplink.settings',
  () => ({ durationMs: DEFAULT_DURATION_MS, streams: DEFAULT_STREAMS }),
  (raw) => {
    const o = (raw ?? {}) as Partial<TestSettings>;
    return {
      durationMs: (DURATION_OPTIONS_MS as readonly number[]).includes(o.durationMs as number) ? (o.durationMs as number) : DEFAULT_DURATION_MS,
      streams: (STREAM_OPTIONS as readonly number[]).includes(o.streams as number) ? (o.streams as number) : DEFAULT_STREAMS,
    };
  },
);

export function useSettings(): [TestSettings, (patch: Partial<TestSettings>) => void] {
  const settings = useStore(settingsStore);
  return [settings, (patch) => settingsStore.set({ ...settingsStore.get(), ...patch })];
}

// crypto.randomUUID only exists in secure contexts; plain-HTTP LAN access is common here.
function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const deviceStore = persistentStore<DeviceInfo>(
  'uplink.device',
  () => ({ id: randomId(), label: defaultDeviceLabel() }),
  (raw) => {
    const o = (raw ?? {}) as Partial<DeviceInfo>;
    return {
      id: typeof o.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(o.id) ? o.id : randomId(),
      label: typeof o.label === 'string' && o.label.trim() ? o.label.slice(0, 64) : defaultDeviceLabel(),
    };
  },
);
// Persist a freshly generated identity right away so it stays stable across reloads.
deviceStore.set(deviceStore.get());

export function useDevice(): [DeviceInfo, (label: string) => void] {
  const device = useStore(deviceStore);
  return [device, (label) => deviceStore.set({ ...deviceStore.get(), label: label.slice(0, 64) })];
}
