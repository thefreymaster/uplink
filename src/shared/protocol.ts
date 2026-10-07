// Wire types shared by the server, the browser app and the measurement worker.

export type Phase = 'latency' | 'download' | 'upload';
export type Direction = 'down' | 'up';

/** Phase codes used in compact ping samples: 0 = idle, 1 = while downloading, 2 = while uploading. */
export type PhaseCode = 0 | 1 | 2;

export interface Limits {
  minDurationMs: number;
  maxDurationMs: number;
  maxStreams: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  limits: Limits;
}

export interface DbState {
  configured: boolean;
  connected: boolean;
  error: string | null;
}

export interface DeviceInfo {
  id: string;
  label: string;
}

export interface TestConfig {
  /** Measured duration for each direction. */
  durationMs: number;
  /** Parallel connections per direction. */
  streams: number;
}

export interface ThroughputResult {
  mbps: number;
  bytes: number;
  durationMs: number;
  peakMbps: number;
}

export interface LatencyResult {
  medianMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  jitterMs: number;
  count: number;
  lost: number;
}

export interface TestSamples {
  /** [ms since test start, Mbps] */
  download: Array<[number, number]>;
  /** [ms since test start, Mbps] */
  upload: Array<[number, number]>;
  /** [ms since test start, RTT ms, phase code] */
  ping: Array<[number, number, PhaseCode]>;
}

/** What the browser reports when a run completes. Upload is measured by the server, not taken from here. */
export interface ClientResult {
  latency: LatencyResult | null;
  download: ThroughputResult | null;
  loadedDown: LatencyResult | null;
  loadedUp: LatencyResult | null;
  samples: TestSamples;
}

export type SessionPhase = 'starting' | Phase | 'saving';

export interface ActiveTest {
  sessionId: string;
  deviceId: string;
  deviceLabel: string;
  phase: SessionPhase;
  mbps: number | null;
  startedAt: string;
}

export type ServerStatus = { busy: false } | { busy: true; test: ActiveTest };

export interface TestSummary {
  id: string;
  createdAt: string;
  durationMs: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  jitterMs: number | null;
  loadedDownMs: number | null;
  loadedUpMs: number | null;
  streams: number;
  phaseDurationMs: number;
  deviceId: string | null;
  deviceLabel: string | null;
  clientIp: string | null;
}

export interface TestDetail extends TestSummary {
  startedAt: string;
  finishedAt: string;
  latencyMinMs: number | null;
  latencyMaxMs: number | null;
  downloadBytes: number | null;
  uploadBytes: number | null;
  downloadMs: number | null;
  uploadMs: number | null;
  downloadPeakMbps: number | null;
  uploadPeakMbps: number | null;
  userAgent: string | null;
  serverName: string | null;
  appVersion: string | null;
  samples: TestSamples | null;
}

export interface TestPage {
  items: TestSummary[];
  nextCursor: string | null;
}

export interface DeviceSummary {
  deviceId: string;
  label: string | null;
  count: number;
  lastSeen: string;
}

export interface InfoResponse {
  server: ServerInfo;
  clientIp: string | null;
  status: ServerStatus;
  db: DbState & { tests: number | null };
  uptimeS: number;
}

// ---- /ws/session -----------------------------------------------------------

export type SessionClientMessage =
  | { t: 'hello'; device: DeviceInfo; config: TestConfig }
  | { t: 'ping'; i: number }
  | { t: 'phase'; phase: Phase }
  | { t: 'progress'; mbps: number }
  | { t: 'result'; result: ClientResult };

export type SessionServerMessage =
  | { t: 'welcome'; sessionId: string; server: ServerInfo; clientIp: string | null; config: TestConfig }
  | { t: 'busy'; test: ActiveTest }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong'; i: number }
  | { t: 'up'; ms: number; bytes: number }
  | { t: 'up-done'; result: ThroughputResult }
  | { t: 'saved'; test: TestDetail; persisted: boolean; error?: string };

// ---- /ws/stream ------------------------------------------------------------
// Download streams take the text commands 'start' and 'stop'; upload streams carry raw binary.

export const STREAM_START = 'start';
export const STREAM_STOP = 'stop';

// ---- /ws/live --------------------------------------------------------------

export type LiveClientMessage = { t: 'ping'; i: number };

export type LiveServerMessage =
  | { t: 'hello'; server: ServerInfo; clientIp: string | null; status: ServerStatus; db: DbState }
  | { t: 'status'; status: ServerStatus }
  | { t: 'db'; db: DbState }
  | { t: 'test-saved'; test: TestSummary }
  | { t: 'test-deleted'; id: string }
  | { t: 'pong'; i: number };
