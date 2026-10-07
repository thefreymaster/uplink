import { randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';
import { WebSocket } from 'ws';
import { clamp } from '../shared/measure';
import { type Direction, STREAM_START, STREAM_STOP } from '../shared/protocol';
import type { TestSession } from './session';

const MIN_CHUNK = 16 * 1024;
const MAX_CHUNK = 1024 * 1024;
const MIN_HIGH_WATER = 256 * 1024;
const MAX_HIGH_WATER = 8 * 1024 * 1024;

// Random bytes are incompressible, so nothing between us and the browser can shrink them.
const POOL_SIZE = 8 * 1024 * 1024;
const pool = randomBytes(POOL_SIZE);
let poolOffset = 0;

function nextChunk(size: number): Buffer {
  const start = poolOffset;
  poolOffset = (poolOffset + size + 4099) % (POOL_SIZE - MAX_CHUNK);
  return pool.subarray(start, start + size);
}

function pow2Floor(n: number): number {
  return 2 ** Math.floor(Math.log2(Math.max(1, n)));
}

/**
 * Keeps one download stream saturated with as little queued in user space as possible.
 * Messages are sized to roughly 8 ms of data so the browser sees smooth progress at any
 * speed, and the queue to ~30 ms so a stop takes effect quickly.
 */
class DownloadPump {
  private active = false;
  private chunk = 64 * 1024;
  private highWater = 1024 * 1024;
  private windowStart = 0;
  private windowBytes = 0;
  private deadline: NodeJS.Timeout | null = null;

  constructor(
    private readonly ws: WebSocket,
    private readonly onSent: (bytes: number) => void,
  ) {}

  start(maxMs: number): void {
    if (this.active) return;
    this.active = true;
    this.windowStart = performance.now();
    this.deadline = setTimeout(() => this.stop(), maxMs);
    this.fill();
  }

  stop(): void {
    this.active = false;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
  }

  private fill(): void {
    const ws = this.ws;
    while (this.active && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < this.highWater) {
      const size = this.chunk;
      ws.send(nextChunk(size), { binary: true }, (err) => this.written(err, size));
    }
  }

  private written(err: Error | undefined, size: number): void {
    if (err) {
      this.stop();
      return;
    }
    this.onSent(size);
    this.windowBytes += size;
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed >= 200) {
      const bytesPerSec = (this.windowBytes * 1000) / elapsed;
      this.chunk = clamp(pow2Floor(bytesPerSec * 0.008), MIN_CHUNK, MAX_CHUNK);
      this.highWater = clamp(bytesPerSec * 0.03, MIN_HIGH_WATER, MAX_HIGH_WATER);
      this.windowStart = now;
      this.windowBytes = 0;
    }
    this.fill();
  }
}

export class StreamConn {
  private pump: DownloadPump | null = null;

  constructor(
    private readonly ws: WebSocket,
    private readonly socket: Socket,
    readonly dir: Direction,
    private readonly session: TestSession,
  ) {
    if (dir === 'up') {
      // Count bytes as they come off the wire rather than per assembled message,
      // so progress is accurate even while a large message is still arriving.
      socket.on('data', (chunk: Buffer) => session.onUploadBytes(chunk.length));
    } else {
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        const command = data.toString();
        if (command === STREAM_START) this.startDownload();
        else if (command === STREAM_STOP) this.destroy();
      });
    }
    ws.on('close', () => {
      this.pump?.stop();
      session.removeStream(this);
    });
    ws.on('error', () => undefined);
  }

  private startDownload(): void {
    if (this.pump) return;
    this.pump = new DownloadPump(this.ws, (n) => this.session.onDownloadSent(n));
    this.pump.start(this.session.testConfig.durationMs + 5_000);
  }

  /**
   * Ends the stream with a TCP reset: anything still queued in socket buffers is
   * discarded instead of draining into the next phase and skewing it.
   */
  destroy(): void {
    this.pump?.stop();
    if (!this.socket.destroyed) this.socket.resetAndDestroy();
  }
}
