const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const configured = (process.env.LOG_LEVEL?.toLowerCase() ?? 'info') as Level;
const threshold = LEVELS[configured] ?? LEVELS.info;

function describe(extra: unknown): string {
  if (extra instanceof Error) return extra.stack ?? extra.message;
  if (typeof extra === 'string') return extra;
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

function write(level: Level, message: string, extra?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = extra === undefined ? line : `${line} ${describe(extra)}`;
  if (level === 'error' || level === 'warn') console.error(out);
  else console.log(out);
}

export const log = {
  debug: (message: string, extra?: unknown) => write('debug', message, extra),
  info: (message: string, extra?: unknown) => write('info', message, extra),
  warn: (message: string, extra?: unknown) => write('warn', message, extra),
  error: (message: string, extra?: unknown) => write('error', message, extra),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
