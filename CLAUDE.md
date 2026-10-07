# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Uplink: a self-hosted LAN speed test (React PWA + Express/WebSocket backend + PostgreSQL), deployed as a
Docker Compose stack on the Unraid server next to the existing `postgresql14` container. GitHub remote:
`thefreymaster/uplink` (public). Unraid installs through Compose Manager's UI from the compose file
embedded in README.md, pulling `ghcr.io/thefreymaster/uplink:latest`; nothing is built on the server.
Keep the README's Unraid steps and its embedded copy of `docker-compose.yml` in sync with the real file.

## Commands

- `npm run dev` runs everything on one port (default 5090; 3000 is avoided because it's usually taken): Express API, the WebSocket endpoints and Vite
  in middleware mode with HMR. Needs `DATABASE_URL`; without it tests run but nothing is saved.
- `npm run typecheck` (TypeScript 7, two projects: `tsconfig.client.json` DOM, `tsconfig.server.json`
  Node). Both must stay clean.
- `npm run build` → `dist/client` (Vite + vite-plugin-pwa) and `dist/server/index.js` (esbuild, deps
  external). `npm start` runs it with `NODE_ENV=production`.
- `npm run check:protocol` (`BASE=host:port`) exercises the realtime protocol against a running, idle
  server: busy lock, live status, stream admission, origin check, cancel cleanup, CSV. `ALLOW_DELETE=1`
  adds a deletion check that removes the newest stored result, so never set it against real data.
- `node scripts/link-shaper.mjs <listen> <target> <downMbps> <upMbps> <oneWayMs>` puts an emulated link
  in front of the server. Point a browser at the listen port and the result should match the configured
  rate within ~0.5%; that is the accuracy regression test for any change to the measurement path.

## Architecture

- `src/shared/` is imported by both sides: `protocol.ts` (every REST/WS message type) and `measure.ts`
  (rate windows, warm-up cut, latency/jitter). Change wire formats here first.
- `src/server/`: `realtime.ts` routes upgrades (`/ws/live`, `/ws/session`, `/ws/stream`) and enforces the
  Origin check; `session.ts` is one test run (control messages, server-side upload meter, saving the
  result); `streams.ts` holds the adaptive download pump; `hub.ts` is the single-test lock and live
  broadcast; `db.ts` does pg pooling, auto-create, migrations (`MIGRATIONS` array, append-only) and
  live health tracking.
- `src/client/engine/worker.ts` is the measurement engine. It runs in a dedicated worker on purpose:
  main-thread rendering must never delay socket reads or ping timestamps.
- UI is Chakra UI v3 themed in `src/client/theme.ts`. Data colors are the `series.*` tokens; they were
  validated as a set (all pairs, protan/deutan, contrast against panels in both modes). Don't add or
  swap series colors without re-validating. The dial (`Gauge.tsx`) is hand-built SVG.
- Color mode is a small in-house provider (`components/ui/color-mode.tsx`) plus a pre-paint script in
  `index.html`, both using the `uplink-theme` localStorage key. next-themes was removed because it
  injects a `<script>` React 19 warns about.

## Measurement invariants

These are what make the numbers trustworthy; keep them when refactoring.

- The receiver measures and ends each direction: the browser for download, the server for upload (bytes
  counted at the raw TCP socket, phase ended on the server clock).
- Phases end with `socket.resetAndDestroy()` (TCP RST) so queued bytes are discarded instead of draining
  into the next phase.
- Payloads are random and `perMessageDeflate` is off.
- The first `WARMUP_FRACTION` (20%) of a transfer is excluded from the result.
- One test at a time server-wide (`Hub.claim`); stream connections are admitted only during their own
  phase and only up to the configured count.

## Deployment notes

- `.github/workflows/docker.yml` publishes the image on every push to `main` (`latest`, `sha-<short>`)
  and on `v*` tags (`X.Y.Z`), after type-checking and running `check:protocol` against the built
  container with a PostgreSQL 14 service. A red run means nothing was published.
- `docker-compose.yml` pulls the published image; `docker-compose.build.yml` is the override for building
  from a checkout.
- Runtime image is `node:24-slim` (glibc) so `bufferutil`'s prebuilt native module loads; it matters for
  upload unmasking at multi-gigabit rates. Client libraries are devDependencies on purpose so
  `npm ci --omit=dev` keeps the runtime layer to server packages only.
- PWA install and service workers need HTTPS (or localhost); plain `http://<ip>:5090` works without them.
- Behind a reverse proxy set `TRUST_PROXY`; if the proxy rewrites `Host`, WebSockets are refused until
  the origin is listed in `ALLOWED_ORIGINS` (a warning is logged with the exact origin).
