// Measurement engine. Runs in a dedicated worker so rendering on the main thread
// never delays socket reads, upload pumping or ping timestamps.
import {
  type CumulativeSample,
  LATENCY_GAP_MS,
  LATENCY_SAMPLES,
  LATENCY_WARMUP,
  LOADED_PING_INTERVAL_MS,
  RATE_WINDOW_MS,
  SAMPLE_INTERVAL_MS,
  clamp,
  round,
  summarizeLatency,
  summarizeThroughput,
  windowRate,
} from '../../shared/measure';
import {
  type ActiveTest,
  type ClientResult,
  type Direction,
  type LatencyResult,
  STREAM_START,
  STREAM_STOP,
  type SessionClientMessage,
  type SessionServerMessage,
  type TestConfig,
  type TestSamples,
  type ThroughputResult,
} from '../../shared/protocol';
import type { EngineCommand, EngineErrorCode, EngineEvent, EngineOptions } from './types';

const scope = self as unknown as {
  postMessage(event: EngineEvent): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EngineCommand>) => void): void;
};
const post = (event: EngineEvent) => scope.postMessage(event);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly activeTest?: ActiveTest,
  ) {
    super(message);
  }
}

type ServerType = SessionServerMessage['t'];
type ServerMessage<T extends ServerType> = Extract<SessionServerMessage, { t: T }>;

interface Waiter {
  types: readonly ServerType[];
  resolve(message: SessionServerMessage): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** JSON control channel (/ws/session) with typed waits. */
class SessionChannel {
  private readonly waiters = new Set<Waiter>();
  private readonly handlers = new Map<ServerType, (message: SessionServerMessage) => void>();
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (event) => {
      let message: SessionServerMessage;
      try {
        message = JSON.parse(event.data as string) as SessionServerMessage;
      } catch {
        return;
      }
      this.handlers.get(message.t)?.(message);
      for (const waiter of [...this.waiters]) {
        if (!waiter.types.includes(message.t)) continue;
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    };
    ws.onclose = () => {
      this.closed = true;
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new EngineError('network', 'Lost the connection to the server'));
      }
      this.waiters.clear();
    };
  }

  static open(url: string, timeoutMs: number): Promise<SessionChannel> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new EngineError('timeout', 'Timed out connecting to the server'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new SessionChannel(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new EngineError('network', 'Could not connect to the server'));
      };
    });
  }

  send(message: SessionClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  on<T extends ServerType>(type: T, handler: (message: ServerMessage<T>) => void): void {
    this.handlers.set(type, handler as (message: SessionServerMessage) => void);
  }

  off(type: ServerType): void {
    this.handlers.delete(type);
  }

  next<T extends ServerType>(types: readonly T[], timeoutMs: number): Promise<ServerMessage<T>> {
    if (this.closed) return Promise.reject(new EngineError('network', 'Lost the connection to the server'));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        types,
        resolve: resolve as (message: SessionServerMessage) => void,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new EngineError('timeout', 'The server stopped responding'));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  close(): void {
    if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

function randomPayload(size: number): Uint8Array<ArrayBuffer> {
  const buffer = new Uint8Array(size);
  // getRandomValues fills at most 64 KiB per call.
  for (let offset = 0; offset < size; offset += 65_536) {
    crypto.getRandomValues(buffer.subarray(offset, Math.min(size, offset + 65_536)));
  }
  return buffer;
}

const pow2Floor = (n: number) => 2 ** Math.floor(Math.log2(Math.max(1, n)));
const MAX_UPLOAD_CHUNK = 1024 * 1024;

class Run {
  private readonly t0 = performance.now();
  private session: SessionChannel | null = null;
  private readonly sockets = new Set<WebSocket>();
  /** Outstanding pings: id -> callback taking the receive timestamp (null when abandoned). */
  private readonly pending = new Map<number, (receivedAt: number | null) => void>();
  private readonly samples: TestSamples = { download: [], upload: [], ping: [] };
  private pingSeq = 0;
  private cancelled: string | null = null;

  constructor(private readonly options: EngineOptions) {}

  private now(): number {
    return performance.now() - this.t0;
  }

  private check(): void {
    if (this.cancelled !== null) throw new EngineError('cancelled', this.cancelled);
  }

  private async pause(ms: number): Promise<void> {
    await sleep(ms);
    this.check();
  }

  private get channel(): SessionChannel {
    if (!this.session) throw new EngineError('internal', 'No session');
    return this.session;
  }

  cancel(reason = 'Test cancelled'): void {
    if (this.cancelled !== null) return;
    this.cancelled = reason;
    this.cleanup();
  }

  async execute(): Promise<void> {
    try {
      post({ type: 'connecting' });
      this.session = await SessionChannel.open(`${this.options.wsBase}/ws/session`, 8_000);
      this.check();
      this.session.on('pong', (message) => {
        const resolve = this.pending.get(message.i);
        if (resolve) {
          this.pending.delete(message.i);
          resolve(performance.now());
        }
      });
      this.session.send({
        t: 'hello',
        device: this.options.device,
        config: { durationMs: this.options.durationMs, streams: this.options.streams },
      });
      const reply = await this.session.next(['welcome', 'busy', 'error'], 8_000);
      if (reply.t === 'busy') throw new EngineError('busy', `${reply.test.deviceLabel} is running a test`, reply.test);
      if (reply.t === 'error') throw new EngineError('server', reply.message);
      post({ type: 'welcome', sessionId: reply.sessionId, server: reply.server, clientIp: reply.clientIp, config: reply.config });

      const latency = await this.measureLatency();
      const download = await this.measureDownload(reply.sessionId, reply.config);
      // Let the download connections clear before loading the uplink.
      await this.pause(400);
      const upload = await this.measureUpload(reply.sessionId, reply.config);

      post({ type: 'saving' });
      const result: ClientResult = {
        latency,
        download: download.result,
        loadedDown: download.loaded,
        loadedUp: upload.loaded,
        samples: this.samples,
      };
      this.channel.send({ t: 'result', result });
      const saved = await this.channel.next(['saved', 'error'], 15_000);
      if (saved.t === 'error') throw new EngineError('server', saved.message);
      post({ type: 'done', test: saved.test, persisted: saved.persisted, error: saved.error });
    } catch (err) {
      if (this.cancelled !== null) post({ type: 'error', code: 'cancelled', message: this.cancelled });
      else if (err instanceof EngineError) post({ type: 'error', code: err.code, message: err.message, activeTest: err.activeTest });
      else post({ type: 'error', code: 'internal', message: err instanceof Error ? err.message : String(err) });
    } finally {
      this.cleanup();
    }
  }

  private cleanup(): void {
    for (const ws of this.sockets) {
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close();
    }
    this.sockets.clear();
    this.session?.close();
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  /** Round trip on the control socket. Resolves to null when no reply arrives in time. */
  private ping(timeoutMs: number): Promise<number | null> {
    const id = ++this.pingSeq;
    return new Promise((resolve) => {
      const sent = performance.now();
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) resolve(null);
      }, timeoutMs);
      this.pending.set(id, (receivedAt) => {
        clearTimeout(timer);
        resolve(receivedAt === null ? null : receivedAt - sent);
      });
      this.channel.send({ t: 'ping', i: id });
    });
  }

  private async measureLatency(): Promise<LatencyResult | null> {
    this.channel.send({ t: 'phase', phase: 'latency' });
    post({ type: 'phase', phase: 'latency', t: this.now() });
    for (let i = 0; i < LATENCY_WARMUP; i++) {
      await this.ping(1_000);
      this.check();
    }
    const rtts: Array<number | null> = [];
    for (let i = 0; i < LATENCY_SAMPLES; i++) {
      const rtt = await this.ping(1_000);
      this.check();
      rtts.push(rtt);
      const t = this.now();
      if (rtt !== null) this.samples.ping.push([Math.round(t), round(rtt, 3), 0]);
      post({ type: 'ping', phase: 'latency', t, rtt, index: i + 1, total: LATENCY_SAMPLES });
      await this.pause(LATENCY_GAP_MS);
    }
    const result = summarizeLatency(rtts);
    post({ type: 'latency-done', result });
    return result;
  }

  /** Pings on the control connection while a transfer fills the link: latency under load. */
  private startLoadedPings(code: 1 | 2): () => LatencyResult | null {
    let active = true;
    const rtts: Array<number | null> = [];
    const loop = async () => {
      while (active && this.cancelled === null) {
        const rtt = await this.ping(2_000);
        if (!active) break;
        rtts.push(rtt);
        const t = this.now();
        if (rtt !== null) this.samples.ping.push([Math.round(t), round(rtt, 3), code]);
        post({ type: 'ping', phase: code === 1 ? 'download' : 'upload', t, rtt });
        await sleep(LOADED_PING_INTERVAL_MS);
      }
    };
    void loop();
    return () => {
      active = false;
      return summarizeLatency(rtts);
    };
  }

  private openSocket(url: string, timeoutMs: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.sockets.add(ws);
      const timer = setTimeout(() => {
        ws.close();
        reject(new EngineError('timeout', 'Timed out opening a data connection'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new EngineError('network', 'Could not open a data connection'));
      };
    });
  }

  private async openStreams(sessionId: string, dir: Direction, count: number): Promise<WebSocket[]> {
    const base = `${this.options.wsBase}/ws/stream?sid=${encodeURIComponent(sessionId)}&dir=${dir}`;
    const sockets = await Promise.all(Array.from({ length: count }, (_, i) => this.openSocket(`${base}&i=${i}`, 8_000)));
    this.check();
    return sockets;
  }

  /** Download is measured here, where the bytes arrive. */
  private async measureDownload(sessionId: string, config: TestConfig) {
    this.channel.send({ t: 'phase', phase: 'download' });
    post({ type: 'phase', phase: 'download', t: this.now() });
    const sockets = await this.openStreams(sessionId, 'down', config.streams);

    let bytes = 0;
    let counting = true;
    for (const ws of sockets) {
      ws.onmessage = (event) => {
        if (counting) bytes += (event.data as ArrayBuffer).byteLength;
      };
    }
    const start = performance.now();
    for (const ws of sockets) ws.send(STREAM_START);
    const stopPings = this.startLoadedPings(1);

    const series: CumulativeSample[] = [[0, 0]];
    let lastProgress = 0;
    try {
      for (;;) {
        await this.pause(SAMPLE_INTERVAL_MS);
        const elapsed = performance.now() - start;
        series.push([elapsed, bytes]);
        const mbps = windowRate(series, RATE_WINDOW_MS);
        const t = this.now();
        this.samples.download.push([Math.round(t), round(mbps, 2)]);
        post({ type: 'throughput', phase: 'download', t, elapsed, mbps, bytes });
        if (elapsed - lastProgress >= 250) {
          lastProgress = elapsed;
          this.channel.send({ t: 'progress', mbps: round(mbps, 2) });
        }
        if (elapsed >= config.durationMs) break;
        if (sockets.every((ws) => ws.readyState !== WebSocket.OPEN)) {
          throw new EngineError('network', 'The download connections closed unexpectedly');
        }
      }
    } finally {
      counting = false;
      for (const ws of sockets) {
        ws.onmessage = null;
        if (ws.readyState === WebSocket.OPEN) ws.send(STREAM_STOP);
      }
    }

    const loaded = stopPings();
    const result = summarizeThroughput(series);
    post({ type: 'transfer-done', phase: 'download', result, loaded });
    return { result, loaded };
  }

  /** Upload is measured by the server, which streams its byte counts back over the control socket. */
  private async measureUpload(sessionId: string, config: TestConfig) {
    this.channel.send({ t: 'phase', phase: 'upload' });
    post({ type: 'phase', phase: 'upload', t: this.now() });
    const sockets = await this.openStreams(sessionId, 'up', config.streams);

    const payload = randomPayload(MAX_UPLOAD_CHUNK);
    let chunk = 64 * 1024;
    let target = 1024 * 1024;
    let sending = true;
    const series: CumulativeSample[] = [[0, 0]];

    this.channel.on('up', (message) => {
      series.push([message.ms, message.bytes]);
      const mbps = windowRate(series, RATE_WINDOW_MS);
      const t = this.now();
      this.samples.upload.push([Math.round(t), round(mbps, 2)]);
      post({ type: 'throughput', phase: 'upload', t, elapsed: message.ms, mbps, bytes: message.bytes });
      // Keep ~100 ms of data queued per connection so the socket never runs dry between pumps.
      const perStream = (mbps * 125_000) / sockets.length;
      chunk = clamp(pow2Floor(perStream * 0.01), 16 * 1024, MAX_UPLOAD_CHUNK);
      target = clamp(perStream * 0.1, 512 * 1024, 16 * 1024 * 1024);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const pump = () => {
      if (!sending) return;
      for (const ws of sockets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        let guard = 0;
        while (ws.bufferedAmount < target && guard++ < 64) ws.send(payload.subarray(0, chunk));
      }
      timer = setTimeout(pump, 2);
    };
    pump();
    const stopPings = this.startLoadedPings(2);

    let result: ThroughputResult;
    try {
      // The server ends the phase on its own clock once `durationMs` of data has arrived.
      ({ result } = await this.channel.next(['up-done'], config.durationMs + 15_000));
    } finally {
      sending = false;
      clearTimeout(timer);
      this.channel.off('up');
      for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.close();
    }

    const loaded = stopPings();
    post({ type: 'transfer-done', phase: 'upload', result, loaded });
    return { result, loaded };
  }
}

let current: Run | null = null;

scope.addEventListener('message', (event) => {
  const command = event.data;
  if (command.type === 'start') {
    if (current) return;
    const run = new Run(command.options);
    current = run;
    void run.execute().finally(() => {
      if (current === run) current = null;
    });
  } else if (command.type === 'cancel') {
    current?.cancel(command.reason);
  }
});
