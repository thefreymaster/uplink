// Emulates a slower link in front of a running Uplink server so you can check that results
// match a known rate: a TCP proxy with a shared token bucket per direction plus fixed delay.
//
//   node scripts/link-shaper.mjs <listenPort> <targetPort> <downMbps> <upMbps> <oneWayDelayMs>
//   node scripts/link-shaper.mjs 3010 3000 100 20 10   # 100/20 Mbps, 20 ms round trip; open http://localhost:3010
import net from 'node:net';

const [listenPort, targetPort, downMbps, upMbps, delayMs] = process.argv.slice(2).map(Number);
const TICK_MS = 2;
const BURST = 32 * 1024;
const QUEUE_HIGH = 512 * 1024;
const QUEUE_LOW = 128 * 1024;

class Direction {
  constructor(mbps) {
    this.rate = (mbps * 1e6) / 8 / 1000; // bytes per ms
    this.tokens = 0;
    this.queues = new Set();
  }
}

const down = new Direction(downMbps);
const up = new Direction(upMbps);

class Pipe {
  constructor(src, dst, dir) {
    Object.assign(this, { src, dst, dir, chunks: [], size: 0 });
    dir.queues.add(this);
    src.on('data', (chunk) => {
      this.chunks.push(chunk);
      this.size += chunk.length;
      if (this.size > QUEUE_HIGH) src.pause();
    });
    const close = () => {
      dir.queues.delete(this);
      this.chunks = [];
    };
    src.on('close', close);
    src.on('end', () => setTimeout(() => dst.end(), delayMs + 20));
  }
  take(max) {
    const out = [];
    let n = 0;
    while (this.chunks.length && n < max) {
      const c = this.chunks[0];
      const room = max - n;
      if (c.length <= room) {
        out.push(this.chunks.shift());
        n += c.length;
      } else {
        out.push(c.subarray(0, room));
        this.chunks[0] = c.subarray(room);
        n += room;
      }
    }
    this.size -= n;
    if (this.size < QUEUE_LOW && this.src.isPaused()) this.src.resume();
    return out.length ? Buffer.concat(out) : null;
  }
}

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = now - last;
  last = now;
  for (const dir of [down, up]) {
    dir.tokens = Math.min(dir.tokens + dir.rate * dt, BURST + dir.rate * dt);
    // Round-robin fair share across connections, like a router queue would roughly do.
    let active = [...dir.queues].filter((p) => p.size > 0);
    while (dir.tokens >= 1 && active.length) {
      const share = Math.max(1, Math.floor(dir.tokens / active.length));
      for (const pipe of active) {
        const piece = pipe.take(Math.min(share, Math.floor(dir.tokens)));
        if (!piece) continue;
        dir.tokens -= piece.length;
        const { dst } = pipe;
        setTimeout(() => !dst.destroyed && dst.write(piece), delayMs);
      }
      active = active.filter((p) => p.size > 0);
    }
  }
}, TICK_MS);

net
  .createServer((client) => {
    const server = net.connect(targetPort, '127.0.0.1');
    client.setNoDelay(true);
    server.setNoDelay(true);
    new Pipe(client, server, up);
    new Pipe(server, client, down);
    const kill = () => {
      client.destroy();
      server.destroy();
    };
    client.on('error', kill);
    server.on('error', kill);
    client.on('close', () => setTimeout(() => server.destroy(), delayMs + 50));
    server.on('close', () => setTimeout(() => client.destroy(), delayMs + 50));
  })
  .listen(listenPort, () => console.log(`shaping :${listenPort} -> :${targetPort}  down ${downMbps} Mbps, up ${upMbps} Mbps, +${delayMs} ms each way`));
