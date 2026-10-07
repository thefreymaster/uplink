import http from 'node:http';
import express from 'express';
import { createApi } from './api';
import { config } from './config';
import { Database } from './db';
import { Hub } from './hub';
import { errorMessage, log } from './log';
import { attachRealtime } from './realtime';
import { mountWeb } from './web';

async function main(): Promise<void> {
  const db = new Database();
  const hub = new Hub();
  db.start();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
  app.use('/api', createApi(hub, db));

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  await mountWeb(app, server);
  const realtime = attachRealtime(server, hub, db, { passthrough: !config.production });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  log.info(`Uplink ${config.version} "${config.serverName}" listening on port ${config.port}${config.production ? '' : ' (development)'}`);

  if (config.retentionDays > 0) {
    const purge = async () => {
      if (!db.connected) return;
      try {
        const removed = await db.purgeOlderThan(config.retentionDays);
        if (removed) log.info(`Removed ${removed} tests older than ${config.retentionDays} days`);
      } catch (err) {
        log.warn('Retention cleanup failed', errorMessage(err));
      }
    };
    setTimeout(purge, 60_000).unref();
    setInterval(purge, 6 * 60 * 60 * 1000).unref();
  }

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received, shutting down`);
    setTimeout(() => process.exit(0), 5_000).unref();
    realtime.close();
    server.close();
    server.closeAllConnections();
    void db.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('Failed to start', err);
  process.exit(1);
});
