import type { IncomingMessage } from 'node:http';
import proxyaddr from 'proxy-addr';
import { config } from './config';
import { log } from './log';

type TrustFn = (addr: string, hop: number) => boolean;

function compileTrust(value: boolean | number | string[]): TrustFn {
  if (value === true) return () => true;
  if (value === false) return () => false;
  if (typeof value === 'number') return (_addr, hop) => hop < value;
  return proxyaddr.compile(value);
}

const trust = compileTrust(config.trustProxy);

/** Client address for raw upgrade requests, honouring TRUST_PROXY the same way Express does for req.ip. */
export function clientIp(req: IncomingMessage): string | null {
  let ip: string | undefined;
  try {
    ip = proxyaddr(req, trust);
  } catch {
    ip = req.socket.remoteAddress;
  }
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function header(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(',')[0]?.trim() || undefined;
}

const warned = new Set<string>();

/**
 * Browsers attach an Origin to WebSocket handshakes but WebSockets are exempt from CORS,
 * so without this check any web page could drive tests against the server from a visitor's browser.
 */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = header(req.headers.origin);
  if (!origin) return true;
  if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [header(req.headers.host), config.trustProxy ? header(req.headers['x-forwarded-host']) : undefined];
  if (hosts.some((h) => h?.toLowerCase() === originHost)) return true;
  if (!warned.has(origin)) {
    warned.add(origin);
    log.warn(`Rejected WebSocket from origin ${origin} (Host: ${hosts[0] ?? '-'}). Add it to ALLOWED_ORIGINS if this is your own proxy.`);
  }
  return false;
}
