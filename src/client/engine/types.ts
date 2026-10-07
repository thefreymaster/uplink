import type {
  ActiveTest,
  DeviceInfo,
  LatencyResult,
  Phase,
  ServerInfo,
  TestConfig,
  TestDetail,
  ThroughputResult,
} from '../../shared/protocol';

export type TransferPhase = Extract<Phase, 'download' | 'upload'>;

export type EngineErrorCode = 'busy' | 'network' | 'server' | 'timeout' | 'cancelled' | 'internal';

export interface EngineOptions {
  wsBase: string;
  durationMs: number;
  streams: number;
  device: DeviceInfo;
}

export type EngineCommand = { type: 'start'; options: EngineOptions } | { type: 'cancel'; reason?: string };

/** Events posted from the worker. `t` is ms since the run started; `elapsed` is ms since the phase started. */
export type EngineEvent =
  | { type: 'connecting' }
  | { type: 'welcome'; sessionId: string; server: ServerInfo; clientIp: string | null; config: TestConfig }
  | { type: 'phase'; phase: Phase; t: number }
  | { type: 'ping'; phase: Phase; t: number; rtt: number | null; index?: number; total?: number }
  | { type: 'latency-done'; result: LatencyResult | null }
  | { type: 'throughput'; phase: TransferPhase; t: number; elapsed: number; mbps: number; bytes: number }
  | { type: 'transfer-done'; phase: TransferPhase; result: ThroughputResult; loaded: LatencyResult | null }
  | { type: 'saving' }
  | { type: 'done'; test: TestDetail; persisted: boolean; error?: string }
  | { type: 'error'; code: EngineErrorCode; message: string; activeTest?: ActiveTest };
