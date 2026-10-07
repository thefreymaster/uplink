import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import { config } from './config';
import { type Database, type TestRow, describeDbError, toDetail, toSummary } from './db';
import { type Hub, serverInfo } from './hub';
import { log } from './log';
import { clientIp } from './net';
import type { StreamConn } from './streams';
import { sanitizeConfig, sanitizeDevice, sanitizeResult } from './validate';
import {
  type CumulativeSample,
  RATE_WINDOW_MS,
  SAMPLE_INTERVAL_MS,
  summarizeThroughput,
  windowRate,
} from '../shared/measure';
import type {
  ActiveTest,
  DeviceInfo,
  Direction,
  Phase,
  SessionClientMessage,
  SessionPhase,
  SessionServerMessage,
  TestConfig,
  ThroughputResult,
} from '../shared/protocol';

const PHASES: readonly Phase[] = ['latency', 'download', 'upload'];

/**
 * Upload is measured where the data lands: bytes are counted as they arrive on the TCP
 * sockets, sampled every 100 ms, and the phase ends on the server's clock.
 */
class UploadMeter {
  private firstAt: number | null = null;
  private bytes = 0;
  private readonly samples: CumulativeSample[] = [[0, 0]];
  private timer: NodeJS.Timeout | null = null;
  private done = false;
  result: ThroughputResult | null = null;

  constructor(
    private readonly durationMs: number,
    private readonly onTick: (ms: number, bytes: number, mbps: number) => void,
    private readonly onDone: (result: ThroughputResult) => void,
  ) {}

  add(n: number): void {
    if (this.done) return;
    if (this.firstAt === null) {
      this.firstAt = performance.now();
      this.timer = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
    }
    this.bytes += n;
  }

  private tick(): void {
    if (this.firstAt === null || this.done) return;
    const ms = performance.now() - this.firstAt;
    this.samples.push([ms, this.bytes]);
    this.onTick(Math.round(ms), this.bytes, windowRate(this.samples, RATE_WINDOW_MS));
    if (ms >= this.durationMs) {
      this.stop();
      this.result = summarizeThroughput(this.samples);
      this.onDone(this.result);
    }
  }

  stop(): void {
    this.done = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export class TestSession {
  readonly id = randomUUID();
  readonly startedAt = new Date();
  private readonly t0 = performance.now();
  phase: SessionPhase = 'starting';
  private liveMbps: number | null = null;
  private downloadSentBytes = 0;
  private readonly streams = new Set<StreamConn>();
  private readonly reserved: Record<Direction, number> = { down: 0, up: 0 };
  private upload: UploadMeter | null = null;
  private finished = false;
  private disposed = false;
  private readonly watchdog: NodeJS.Timeout;

  constructor(
    private readonly ws: WebSocket,
    readonly device: DeviceInfo,
    readonly testConfig: TestConfig,
    readonly clientIp: string | null,
    readonly userAgent: string | null,
    private readonly hub: Hub,
    private readonly db: Database,
  ) {
    const lifetime = 2 * testConfig.durationMs + 60_000;
    this.watchdog = setTimeout(() => {
      log.warn(`Session ${this.id} exceeded ${lifetime} ms; closing`);
      this.ws.close(4002, 'Session timed out');
    }, lifetime);
  }

  describe(): ActiveTest {
    return {
      sessionId: this.id,
      deviceId: this.device.id,
      deviceLabel: this.device.label,
      phase: this.phase,
      mbps: this.liveMbps,
      startedAt: this.startedAt.toISOString(),
    };
  }

  send(message: SessionServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  handle(message: SessionClientMessage): void {
    switch (message.t) {
      case 'ping':
        if (typeof message.i === 'number') this.send({ t: 'pong', i: message.i });
        break;
      case 'phase':
        this.enterPhase(message.phase);
        break;
      case 'progress':
        if (this.phase === 'download' && typeof message.mbps === 'number' && Number.isFinite(message.mbps)) {
          this.liveMbps = Math.max(0, message.mbps);
          this.hub.notifyStatus();
        }
        break;
      case 'result':
        void this.complete(message.result);
        break;
    }
  }

  private enterPhase(phase: unknown): void {
    if (this.finished || !PHASES.includes(phase as Phase)) return;
    const next = phase as Phase;
    if (this.phase === 'download' && next !== 'download') this.closeStreams('down');
    this.phase = next;
    this.liveMbps = null;
    if (next === 'upload' && !this.upload) {
      this.upload = new UploadMeter(
        this.testConfig.durationMs,
        (ms, bytes, mbps) => {
          this.send({ t: 'up', ms, bytes });
          this.liveMbps = mbps;
          this.hub.notifyStatus();
        },
        (result) => {
          this.send({ t: 'up-done', result });
          this.closeStreams('up');
        },
      );
    }
    this.hub.notifyStatus();
  }

  /** Each direction gets exactly `streams` connections, and only during its own phase. */
  reserveStream(dir: Direction): boolean {
    const phase: Phase = dir === 'down' ? 'download' : 'upload';
    if (this.finished || this.phase !== phase || this.reserved[dir] >= this.testConfig.streams) return false;
    this.reserved[dir]++;
    return true;
  }

  addStream(conn: StreamConn): void {
    if (this.disposed) conn.destroy();
    else this.streams.add(conn);
  }

  removeStream(conn: StreamConn): void {
    this.streams.delete(conn);
  }

  onUploadBytes(n: number): void {
    if (this.phase === 'upload') this.upload?.add(n);
  }

  onDownloadSent(n: number): void {
    this.downloadSentBytes += n;
  }

  private closeStreams(dir?: Direction): void {
    for (const conn of [...this.streams]) {
      if (dir && conn.dir !== dir) continue;
      conn.destroy();
      this.streams.delete(conn);
    }
  }

  private async complete(raw: unknown): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'saving';
    this.liveMbps = null;
    this.hub.notifyStatus();
    this.closeStreams();

    const result = sanitizeResult(raw);
    const upload = this.upload?.result ?? null;
    let download = result.download;
    // The browser measures download itself; it cannot have received more than we sent.
    if (download && download.bytes > this.downloadSentBytes + 4 * 1024 * 1024) {
      log.warn(`Session ${this.id}: client reported ${download.bytes} B received but ${this.downloadSentBytes} B were sent; dropping download`);
      download = null;
    }

    const finishedAt = new Date();
    const row: TestRow = {
      id: randomUUID(),
      created_at: finishedAt,
      started_at: this.startedAt,
      finished_at: finishedAt,
      duration_ms: Math.round(performance.now() - this.t0),
      download_mbps: download?.mbps ?? null,
      upload_mbps: upload?.mbps ?? null,
      latency_ms: result.latency?.medianMs ?? null,
      latency_min_ms: result.latency?.minMs ?? null,
      latency_max_ms: result.latency?.maxMs ?? null,
      jitter_ms: result.latency?.jitterMs ?? null,
      loaded_down_ms: result.loadedDown?.medianMs ?? null,
      loaded_up_ms: result.loadedUp?.medianMs ?? null,
      download_bytes: download?.bytes ?? null,
      upload_bytes: upload?.bytes ?? null,
      download_ms: download?.durationMs ?? null,
      upload_ms: upload?.durationMs ?? null,
      download_peak_mbps: download?.peakMbps ?? null,
      upload_peak_mbps: upload?.peakMbps ?? null,
      phase_duration_ms: this.testConfig.durationMs,
      streams: this.testConfig.streams,
      device_id: this.device.id,
      device_label: this.device.label,
      client_ip: this.clientIp,
      user_agent: this.userAgent,
      server_name: config.serverName,
      app_version: config.version,
      samples: result.samples,
    };

    let test = toDetail(row);
    let persisted = false;
    let error: string | undefined;
    if (this.db.connected) {
      try {
        test = await this.db.insertTest(row);
        persisted = true;
      } catch (err) {
        error = `Could not save the result: ${describeDbError(err)}`;
        log.error('Saving test failed', err);
      }
    } else {
      error = this.db.state().error ?? 'Database unavailable';
    }

    this.send({ t: 'saved', test, persisted, ...(error ? { error } : {}) });
    if (persisted) this.hub.broadcast({ t: 'test-saved', test: toSummary(row) });
    log.info(
      `Test from "${this.device.label}" (${this.clientIp ?? '?'}): ` +
        `down ${row.download_mbps ?? '-'} Mbps, up ${row.upload_mbps ?? '-'} Mbps, ` +
        `latency ${row.latency_ms ?? '-'} ms, ${row.duration_ms} ms total${persisted ? '' : ' (not saved)'}`,
    );
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.watchdog);
    this.upload?.stop();
    this.closeStreams();
    this.hub.release(this);
  }
}

export function handleSessionSocket(ws: WebSocket, req: IncomingMessage, hub: Hub, db: Database): void {
  let session: TestSession | null = null;
  const helloTimer = setTimeout(() => ws.close(4000, 'Expected hello'), 10_000);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let message: SessionClientMessage;
    try {
      message = JSON.parse(data.toString()) as SessionClientMessage;
    } catch {
      return;
    }
    if (session) {
      session.handle(message);
      return;
    }
    if (message?.t !== 'hello') return;
    clearTimeout(helloTimer);

    const active = hub.activeSession;
    if (active) {
      ws.send(JSON.stringify({ t: 'busy', test: active.describe() } satisfies SessionServerMessage));
      ws.close(4001, 'Server busy');
      return;
    }
    const testConfig = sanitizeConfig(message.config, config.limits);
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
    session = new TestSession(ws, sanitizeDevice(message.device), testConfig, clientIp(req), userAgent, hub, db);
    hub.claim(session);
    session.send({ t: 'welcome', sessionId: session.id, server: serverInfo(), clientIp: session.clientIp, config: testConfig });
    log.debug(`Session ${session.id} started by "${session.device.label}"`);
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    session?.dispose();
  });
  ws.on('error', (err) => log.debug('Session socket error', err.message));
}
