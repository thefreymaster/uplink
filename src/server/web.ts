import path from 'node:path';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config';
import { log } from './log';

/** Serves the built PWA in production, or the Vite dev server (with HMR on the same port) in development. */
export async function mountWeb(app: express.Express, server: Server): Promise<void> {
  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    log.info('Vite dev middleware enabled');
    return;
  }

  const clientDir = fileURLToPath(new URL('../client/', import.meta.url));
  const indexHtml = path.join(clientDir, 'index.html');

  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders(res, filePath) {
        // Hashed build output never changes; everything else (index, sw.js, manifest) must revalidate.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/') || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
