import { type IncomingMessage, type Server, STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { Database } from './db';
import { type Hub, serverInfo } from './hub';
import { clientIp, originAllowed } from './net';
import { handleSessionSocket } from './session';
import { StreamConn } from './streams';
import type { LiveClientMessage, LiveServerMessage } from '../shared/protocol';

const noop = () => undefined;

function reject(socket: Socket, status: number): void {
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function handleLive(ws: WebSocket, req: IncomingMessage, hub: Hub, db: Database): void {
  hub.live.add(ws);
  const hello: LiveServerMessage = { t: 'hello', server: serverInfo(), clientIp: clientIp(req), status: hub.status(), db: db.state() };
  ws.send(JSON.stringify(hello));
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try {
      const message = JSON.parse(data.toString()) as LiveClientMessage;
      if (message?.t === 'ping' && typeof message.i === 'number') {
        ws.send(JSON.stringify({ t: 'pong', i: message.i } satisfies LiveServerMessage));
      }
    } catch {
      // ignore malformed input
    }
  });
  ws.on('close', () => hub.live.delete(ws));
  ws.on('error', noop);
}

/**
 * WebSocket endpoints:
 *   /ws/live     status, live progress of the running test, new results
 *   /ws/session  one per test run: control messages, pings, server-side upload measurement
 *   /ws/stream   parallel data connections for a session (?sid=&dir=down|up)
 */
export function attachRealtime(server: Server, hub: Hub, db: Database, options: { passthrough: boolean }) {
  const base = { noServer: true, perMessageDeflate: false } as const;
  const liveWss = new WebSocketServer({ ...base, maxPayload: 4 * 1024 });
  const sessionWss = new WebSocketServer({ ...base, maxPayload: 2 * 1024 * 1024 });
  const streamWss = new WebSocketServer({ ...base, maxPayload: 4 * 1024 * 1024, clientTracking: false });

  const alive = new WeakMap<WebSocket, boolean>();
  const track = (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
  };

  server.on('upgrade', (req: IncomingMessage, rawSocket, head: Buffer) => {
    const socket = rawSocket as Socket;
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (!url.pathname.startsWith('/ws/')) {
      // In development Vite's HMR socket shares this server; leave other upgrades alone.
      if (!options.passthrough) socket.destroy();
      return;
    }
    socket.on('error', noop);
    if (!originAllowed(req)) return reject(socket, 403);

    switch (url.pathname) {
      case '/ws/live':
        liveWss.handleUpgrade(req, socket, head, (ws) => {
          track(ws);
          handleLive(ws, req, hub, db);
        });
        return;
      case '/ws/session':
        sessionWss.handleUpgrade(req, socket, head, (ws) => {
          track(ws);
          handleSessionSocket(ws, req, hub, db);
        });
        return;
      case '/ws/stream': {
        const session = hub.sessions.get(url.searchParams.get('sid') ?? '');
        const dir = url.searchParams.get('dir');
        if (!session || session !== hub.activeSession) return reject(socket, 404);
        if (dir !== 'down' && dir !== 'up') return reject(socket, 400);
        if (!session.reserveStream(dir)) return reject(socket, 409);
        streamWss.handleUpgrade(req, socket, head, (ws) => {
          session.addStream(new StreamConn(ws, socket, dir, session));
        });
        return;
      }
      default:
        reject(socket, 404);
    }
  });

  const heartbeat = setInterval(() => {
    for (const wss of [liveWss, sessionWss]) {
      for (const ws of wss.clients) {
        if (alive.get(ws) === false) {
          ws.terminate();
          continue;
        }
        alive.set(ws, false);
        ws.ping();
      }
    }
  }, 25_000);

  const unsubscribe = db.onChange((state) => hub.broadcast({ t: 'db', db: state }));

  return {
    close(): void {
      clearInterval(heartbeat);
      unsubscribe();
      for (const wss of [liveWss, sessionWss]) {
        for (const ws of wss.clients) ws.terminate();
      }
    },
  };
}
