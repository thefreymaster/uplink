import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { wsBase } from '../lib/api';
import type { DbState, LiveClientMessage, LiveServerMessage, ServerInfo, ServerStatus, TestSummary } from '../../shared/protocol';

export type Connection = 'connecting' | 'open' | 'offline';

export interface LiveState {
  connection: Connection;
  server: ServerInfo | null;
  clientIp: string | null;
  status: ServerStatus;
  db: DbState | null;
  /** Best recent round trip on the live socket (idle latency indicator), ms. */
  rtt: number | null;
}

export type LiveEvent = { t: 'test-saved'; test: TestSummary } | { t: 'test-deleted'; id: string };

interface LiveContextValue extends LiveState {
  subscribe(listener: (event: LiveEvent) => void): () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

const PING_EVERY_MS = 2_000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveState>({
    connection: 'connecting',
    server: null,
    clientIp: null,
    status: { busy: false },
    db: null,
    rtt: null,
  });
  const listeners = useRef(new Set<(event: LiveEvent) => void>());

  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let seq = 0;
    const sent = new Map<number, number>();
    const recent: number[] = [];

    const ping = () => {
      if (document.hidden || ws?.readyState !== WebSocket.OPEN) return;
      const i = ++seq;
      sent.set(i, performance.now());
      ws.send(JSON.stringify({ t: 'ping', i } satisfies LiveClientMessage));
    };

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(`${wsBase()}/ws/live`);
      ws = socket;
      socket.onmessage = (event) => {
        let message: LiveServerMessage;
        try {
          message = JSON.parse(event.data as string) as LiveServerMessage;
        } catch {
          return;
        }
        switch (message.t) {
          case 'hello':
            attempt = 0;
            setState((s) => ({ ...s, connection: 'open', server: message.server, clientIp: message.clientIp, status: message.status, db: message.db }));
            clearInterval(pingTimer);
            pingTimer = setInterval(ping, PING_EVERY_MS);
            ping();
            break;
          case 'status':
            setState((s) => ({ ...s, status: message.status }));
            break;
          case 'db':
            setState((s) => ({ ...s, db: message.db }));
            break;
          case 'pong': {
            const at = sent.get(message.i);
            if (at === undefined) break;
            sent.delete(message.i);
            recent.push(performance.now() - at);
            if (recent.length > 5) recent.shift();
            // The minimum of a few samples filters out main-thread scheduling noise.
            setState((s) => ({ ...s, rtt: Math.min(...recent) }));
            break;
          }
          case 'test-saved':
          case 'test-deleted':
            for (const listener of listeners.current) listener(message);
            break;
        }
      };
      socket.onclose = () => {
        clearInterval(pingTimer);
        sent.clear();
        recent.length = 0;
        if (disposed) return;
        attempt++;
        setState((s) => ({ ...s, connection: attempt > 2 ? 'offline' : 'connecting', rtt: null }));
        retryTimer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };

    const reconnectNow = () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      clearTimeout(retryTimer);
      connect();
    };
    const onVisible = () => {
      if (!document.hidden) reconnectNow();
    };

    connect();
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisible);
      ws?.close();
    };
  }, []);

  const subscribe = useCallback((listener: (event: LiveEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ ...state, subscribe }), [state, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}

export function useLiveEvents(listener: (event: LiveEvent) => void): void {
  const { subscribe } = useLive();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}
