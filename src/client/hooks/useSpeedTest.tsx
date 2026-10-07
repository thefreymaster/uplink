import { type ReactNode, createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import { toaster } from '../components/ui/toaster';
import { type EngineHandle, startEngine } from '../engine/runner';
import type { EngineErrorCode, EngineEvent, TransferPhase } from '../engine/types';
import { wsBase } from '../lib/api';
import { formatSpeed } from '../lib/format';
import { deviceStore, settingsStore } from '../lib/settings';
import { LATENCY_SAMPLES } from '../../shared/measure';
import type { ActiveTest, LatencyResult, Phase, ServerInfo, TestConfig, TestDetail, ThroughputResult } from '../../shared/protocol';

export type RunStatus = 'idle' | 'connecting' | 'running' | 'saving' | 'done' | 'error';

export interface TransferState {
  /** [ms since the phase started, Mbps] */
  series: Array<[number, number]>;
  live: number | null;
  peak: number;
  elapsed: number;
  result: ThroughputResult | null;
  loaded: LatencyResult | null;
}

export interface RunState {
  status: RunStatus;
  phase: Phase | null;
  config: TestConfig | null;
  server: ServerInfo | null;
  clientIp: string | null;
  sessionId: string | null;
  latency: { rtts: number[]; done: number; total: number; result: LatencyResult | null };
  /** Most recent ping while a transfer is running. */
  loadedRtt: number | null;
  download: TransferState;
  upload: TransferState;
  test: TestDetail | null;
  persisted: boolean;
  saveError: string | null;
  error: { code: EngineErrorCode; message: string; activeTest?: ActiveTest } | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const emptyTransfer: TransferState = { series: [], live: null, peak: 0, elapsed: 0, result: null, loaded: null };

const initialState: RunState = {
  status: 'idle',
  phase: null,
  config: null,
  server: null,
  clientIp: null,
  sessionId: null,
  latency: { rtts: [], done: 0, total: LATENCY_SAMPLES, result: null },
  loadedRtt: null,
  download: emptyTransfer,
  upload: emptyTransfer,
  test: null,
  persisted: false,
  saveError: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

type Action = { type: 'start' } | { type: 'reset' } | { type: 'event'; event: EngineEvent };

function updateTransfer(state: RunState, phase: TransferPhase, patch: (t: TransferState) => TransferState): RunState {
  return { ...state, [phase]: patch(state[phase]) };
}

function reducer(state: RunState, action: Action): RunState {
  if (action.type === 'start') return { ...initialState, status: 'connecting', startedAt: Date.now() };
  if (action.type === 'reset') return initialState;
  const e = action.event;
  switch (e.type) {
    case 'connecting':
      return { ...state, status: 'connecting' };
    case 'welcome':
      return { ...state, status: 'running', config: e.config, server: e.server, clientIp: e.clientIp, sessionId: e.sessionId };
    case 'phase':
      return { ...state, phase: e.phase, loadedRtt: null };
    case 'ping':
      if (e.phase === 'latency') {
        return {
          ...state,
          latency: {
            ...state.latency,
            rtts: e.rtt === null ? state.latency.rtts : [...state.latency.rtts, e.rtt],
            done: e.index ?? state.latency.done,
            total: e.total ?? state.latency.total,
          },
        };
      }
      return e.rtt === null ? state : { ...state, loadedRtt: e.rtt };
    case 'latency-done':
      return { ...state, latency: { ...state.latency, result: e.result, done: state.latency.total } };
    case 'throughput':
      return updateTransfer(state, e.phase, (t) => ({
        ...t,
        series: [...t.series, [e.elapsed, e.mbps]],
        live: e.mbps,
        peak: Math.max(t.peak, e.mbps),
        elapsed: e.elapsed,
      }));
    case 'transfer-done':
      return updateTransfer(state, e.phase, (t) => ({ ...t, result: e.result, loaded: e.loaded, live: null }));
    case 'saving':
      return { ...state, status: 'saving', phase: null };
    case 'done':
      return {
        ...state,
        status: 'done',
        phase: null,
        test: e.test,
        persisted: e.persisted,
        saveError: e.error ?? null,
        finishedAt: Date.now(),
      };
    case 'error':
      return { ...state, status: 'error', phase: null, error: { code: e.code, message: e.message, activeTest: e.activeTest } };
  }
}

interface SpeedTestContextValue {
  run: RunState;
  active: boolean;
  start(): void;
  cancel(): void;
  reset(): void;
}

const SpeedTestContext = createContext<SpeedTestContextValue | null>(null);

let wakeLock: WakeLockSentinel | null = null;

async function holdScreenAwake(): Promise<void> {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

function releaseScreen(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

export function SpeedTestProvider({ children }: { children: ReactNode }) {
  const [run, dispatch] = useReducer(reducer, initialState);
  const handle = useRef<EngineHandle | null>(null);

  const start = useCallback(() => {
    if (handle.current) return;
    dispatch({ type: 'start' });
    const settings = settingsStore.get();
    void holdScreenAwake();
    handle.current = startEngine(
      { wsBase: wsBase(), durationMs: settings.durationMs, streams: settings.streams, device: deviceStore.get() },
      (event) => {
        dispatch({ type: 'event', event });
        if (event.type !== 'done' && event.type !== 'error') return;
        handle.current = null;
        releaseScreen();
        if (event.type === 'done') {
          if (!event.persisted) {
            toaster.create({ type: 'warning', title: 'Result not saved', description: event.error ?? 'The database is unavailable.', closable: true });
          } else if (location.pathname !== '/') {
            toaster.create({
              type: 'success',
              title: 'Speed test complete',
              description: `Down ${formatSpeed(event.test.downloadMbps)} · Up ${formatSpeed(event.test.uploadMbps)}`,
            });
          }
        }
      },
    );
  }, []);

  const cancel = useCallback(() => handle.current?.cancel('Test cancelled'), []);
  const reset = useCallback(() => {
    if (!handle.current) dispatch({ type: 'reset' });
  }, []);

  const active = run.status === 'connecting' || run.status === 'running' || run.status === 'saving';
  const value = useMemo(() => ({ run, active, start, cancel, reset }), [run, active, start, cancel, reset]);
  return <SpeedTestContext.Provider value={value}>{children}</SpeedTestContext.Provider>;
}

export function useSpeedTest(): SpeedTestContextValue {
  const ctx = useContext(SpeedTestContext);
  if (!ctx) throw new Error('useSpeedTest must be used inside SpeedTestProvider');
  return ctx;
}

/** 0..1 progress through the current phase. */
export function phaseProgress(run: RunState): number {
  switch (run.phase) {
    case 'latency':
      return run.latency.total ? run.latency.done / run.latency.total : 0;
    case 'download':
    case 'upload':
      return run.config ? Math.min(1, run[run.phase].elapsed / run.config.durationMs) : 0;
    default:
      return 0;
  }
}
