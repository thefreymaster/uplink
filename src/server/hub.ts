import { WebSocket } from 'ws';
import { config } from './config';
import type { LiveServerMessage, ServerInfo, ServerStatus } from '../shared/protocol';
import type { TestSession } from './session';

export function serverInfo(): ServerInfo {
  return { name: config.serverName, version: config.version, limits: config.limits };
}

/**
 * Shared realtime state: the single active test (tests are serialized so they don't
 * compete for the same link) and the set of live subscribers that get status and results.
 */
export class Hub {
  readonly live = new Set<WebSocket>();
  readonly sessions = new Map<string, TestSession>();
  private active: TestSession | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private statusDirty = false;

  get activeSession(): TestSession | null {
    return this.active;
  }

  status(): ServerStatus {
    return this.active ? { busy: true, test: this.active.describe() } : { busy: false };
  }

  broadcast(message: LiveServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.live) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  /** Status updates (phase changes, live speed) are coalesced to at most four per second. */
  notifyStatus(): void {
    if (this.statusTimer) {
      this.statusDirty = true;
      return;
    }
    this.broadcast({ t: 'status', status: this.status() });
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      if (this.statusDirty) {
        this.statusDirty = false;
        this.notifyStatus();
      }
    }, 250);
  }

  claim(session: TestSession): boolean {
    if (this.active && this.active !== session) return false;
    this.active = session;
    this.sessions.set(session.id, session);
    this.notifyStatus();
    return true;
  }

  release(session: TestSession): void {
    this.sessions.delete(session.id);
    if (this.active === session) {
      this.active = null;
      this.notifyStatus();
    }
  }
}
