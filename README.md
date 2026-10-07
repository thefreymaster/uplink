# Uplink

A self-hosted speed test for your home network. Open it on any device to measure **latency, jitter,
download and upload** between that device and your server, with every result saved to PostgreSQL and
streamed live to every other open copy of the app. It installs as a PWA on phones, tablets and desktops.

![Speed test in progress](docs/screenshots/test-dark.png)

| History | Result detail | Phone |
|---|---|---|
| ![History](docs/screenshots/history-dark.png) | ![Result detail](docs/screenshots/detail-dark.png) | ![Phone, light mode](docs/screenshots/mobile-light.png) |

## Features

- **Real-time measurement.** Latency, jitter, download and upload, plus *latency under load*
  (bufferbloat) for each direction. The dial, charts and link view update ten times a second.
- **Accurate by design.** Download is measured where the bytes arrive (the browser, in a Web Worker);
  upload is measured where they arrive (the server, which streams its counts back live). Ramp-up is
  excluded, payloads are incompressible, and leftover queued data is discarded between phases.
- **Configurable runs.** 5, 10, 15 or 30 seconds per direction, 1 to 8 parallel connections. The total
  test duration is recorded with every result.
- **History for every device.** Results are tagged with a device name you choose. Filter by time range
  or device, see trends, open any run to see its throughput and latency timeline, export CSV.
- **Live across devices.** Tests run one at a time server-wide so they never skew each other; other
  devices see who is testing and the live speed, and new results appear everywhere instantly.
- **PWA.** Installable, browses past results offline, and offers a *Run speed test* shortcut on Android and desktop.
- **Light and dark** themes, following the system by default.

## Install on Unraid

Uplink runs from one compose file that pulls a ready-made image
(`ghcr.io/thefreymaster/uplink`), so there is nothing to clone or build on the server.

You need:

- Unraid 6.12 or newer with **Docker Compose Manager** from Community Applications. It adds the
  **Compose** section at the bottom of the Docker tab.
- Your **PostgreSQL 14** container (for example `postgresql14` from Community Applications) with port
  5432 published on the Unraid host. Redis and MariaDB aren't needed.

### 1. Create a database user

On the Docker tab, click the **postgresql14** icon and choose **Console**, then run this with a password
of your own:

```sh
psql -U postgres -c "CREATE USER uplink WITH PASSWORD 'change-me' CREATEDB;"
```

`CREATEDB` lets Uplink create its own `uplink` database and tables on first start. If you'd rather not
grant that, also run `psql -U postgres -c "CREATE DATABASE uplink OWNER uplink;"` and add
`DB_AUTO_CREATE=false` in step 4. (If your container's superuser isn't `postgres`, use yours.)

### 2. Add the stack

At the bottom of the Docker tab, under **Compose**, click **Add New Stack**, enter `uplink` and confirm.
Leave **Advanced** as it is.

### 3. Paste the compose file

Click the gear icon next to **uplink** → **Edit Stack** → **Compose File**, replace everything with this,
and save:

```yaml
services:
  uplink:
    image: ghcr.io/thefreymaster/uplink:latest
    container_name: uplink
    init: true
    ports:
      - "${UPLINK_PORT:-5090}:5090"
    environment:
      - SERVER_NAME=${SERVER_NAME:-Unraid}
      - DATABASE_URL=${DATABASE_URL:?Set DATABASE_URL in the .env file (see .env.example)}
      - DB_AUTO_CREATE=${DB_AUTO_CREATE:-true}
      - TRUST_PROXY=${TRUST_PROXY:-false}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-}
      - MAX_TEST_SECONDS=${MAX_TEST_SECONDS:-30}
      - MAX_STREAMS=${MAX_STREAMS:-8}
      - RETENTION_DAYS=${RETENTION_DAYS:-0}
      - LOG_LEVEL=${LOG_LEVEL:-info}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    labels:
      # WebUI link and icon in Unraid's Docker tab.
      net.unraid.docker.webui: "http://[IP]:[PORT:5090]/"
      net.unraid.docker.icon: "https://raw.githubusercontent.com/thefreymaster/uplink/main/public/icons/icon-512.png"
    restart: unless-stopped
```

### 4. Paste the settings

Gear icon → **Edit Stack** → **ENV File**, paste this, put in the password from step 1 (and your server's
name), and save:

```ini
SERVER_NAME=Tower
DATABASE_URL=postgres://uplink:change-me@host.docker.internal:5432/uplink
```

Everything else has a default (see [Configuration](#configuration)). `host.docker.internal` is how the
container reaches the Unraid host; the server's LAN IP works too. To use a port other than 5090, add
`UPLINK_PORT=<port>`.

### 5. Start it

Gear icon → **Compose Up**. Compose Manager downloads the image and starts it, and **uplink** appears in
the Docker list with a **WebUI** link. Open `http://<your-unraid-ip>:5090` on any device and press
**Start**.

Give each device a name under **Settings → This device** so results are easy to tell apart in History.
If something looks off, open the container's **Logs** from the Docker tab: a healthy start ends with
`Database ready`, and **Settings → Server** in the app shows the database status.

### Updating

Gear icon → **Update Stack**. It pulls the newest image and recreates the container; results stay in
PostgreSQL. Open copies of the app then show an *Update available* prompt (it waits if a test is running).

A new image is published automatically on every push to `main` (tag `latest`). Each build is also tagged
`sha-<commit>` if you ever want to pin one.

### From a terminal instead

The same files work on any Docker host:

```sh
mkdir -p /mnt/user/appdata/uplink && cd /mnt/user/appdata/uplink
curl -fsSLO https://raw.githubusercontent.com/thefreymaster/uplink/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/thefreymaster/uplink/main/.env.example -o .env
nano .env    # set DATABASE_URL and SERVER_NAME
docker compose up -d
```

Update with `docker compose pull && docker compose up -d`.

### Installing the app (HTTPS)

Browsers only allow installing a PWA from an HTTPS address (or `localhost`). Over plain
`http://<ip>:5090` everything works, but there's no install option. To install it, serve Uplink through
your reverse proxy:

- **Nginx Proxy Manager:** add a proxy host for e.g. `speed.example.com` → `http://<unraid-ip>:5090`,
  turn on **Websockets Support**, and request a certificate on the SSL tab.
- **SWAG / plain nginx:**

  ```nginx
  location / {
      proxy_pass http://<unraid-ip>:5090;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
      proxy_read_timeout 120s;
  }
  ```

- **Tailscale:** if the server is on your tailnet with HTTPS certificates enabled,
  `tailscale serve --bg 5090` on the server publishes Uplink at `https://<machine>.<tailnet>.ts.net`,
  reachable only from your tailnet.

Then add `TRUST_PROXY=true` to the stack's **ENV File** (so results show each device's real IP) and run
**Compose Up** again. If the app can't connect through the proxy, the container log names the origin it
refused; add it as `ALLOWED_ORIGINS=https://speed.example.com` the same way.

Uplink has no login: anyone who can reach it can run tests and delete results. Keep it on your LAN or
VPN, or put authentication in front of it at the proxy (e.g. an access list in Nginx Proxy Manager)
before exposing it to the internet.

On the phone, open the HTTPS address and choose **Install app** (Android/Chrome) or **Share → Add to
Home Screen** (iPhone/iPad). On Android and desktop, the installed app's icon menu (long-press or
right-click) also offers **Run speed test** directly.

### Getting accurate results

- A proxy in the path adds work for every byte. For multi-gigabit LAN tests, use the direct
  `http://<unraid-ip>:5090` address.
- The container uses bridge networking with a published port, which is fine for gigabit. For 10GbE, put
  it on the host network instead (`network_mode: host` and remove `ports`) to skip Docker's NAT.
- Browsers top out around 2 to 4 Gbps on typical hardware; above that the device, not the network, is
  the limit.
- Wi-Fi varies from second to second. Longer runs (15 or 30 s) give steadier numbers; more connections
  help fill fast links, and **1** shows single-connection speed.
- If the database lives on a custom `br0`/macvlan network, the container may not be able to reach it
  through the host. Use the database's own IP in `DATABASE_URL`, or enable *Host access to custom
  networks* in Unraid's Docker settings.

## Configuration

All settings are environment variables (in `.env` when using compose).

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string. Without it (and without `PG*` variables) tests still run but nothing is saved. |
| `DB_AUTO_CREATE` | `true` | Create the database on start if it doesn't exist (needs `CREATEDB`). Tables are always created/migrated automatically. |
| `SERVER_NAME` | host name | Name shown for the server in the app. |
| `UPLINK_PORT` | `5090` | Host port, compose only. Inside the container the app listens on `PORT` (5090). |
| `TRUST_PROXY` | `false` | `true`, a hop count, or proxy addresses/subnets (e.g. `172.18.0.0/16`). Makes client IPs come from `X-Forwarded-For`. |
| `ALLOWED_ORIGINS` | — | Extra origins allowed to open WebSockets, comma separated. `*` turns the check off. |
| `MAX_TEST_SECONDS` | `30` | Longest run a client may request per direction (5 to 120). |
| `MAX_STREAMS` | `8` | Most parallel connections a client may request (1 to 32). |
| `RETENTION_DAYS` | `0` | Delete results older than this many days. `0` keeps everything. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

The standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` variables also work in place of
`DATABASE_URL`.

## How a test works

Everything runs over WebSockets: one control connection per test plus parallel data connections.

1. **Latency.** 2 warm-up and 20 measured round trips on the control connection. The result is the median;
   jitter is the mean difference between consecutive round trips.
2. **Download.** The server streams random data over each connection. The browser counts bytes as they
   arrive (in a Web Worker, so rendering never delays it) and samples every 100 ms.
3. **Upload.** The browser streams random data; the server counts bytes as they come off each TCP socket,
   sends its counts back every 100 ms, and ends the phase on its own clock.
4. **Latency under load.** Pings continue every 250 ms during each transfer. A big jump over idle latency
   means the link's buffers are filling (bufferbloat).

For both directions, the first 20% of the run is ignored while TCP ramps up; the result is the data moved
after that divided by the time it took. When a direction ends, its connections are reset so data still
queued in buffers is dropped rather than spilling into the next phase. Only one test runs at a time;
others see it live and can start once it finishes.

During development, runs through `scripts/link-shaper.mjs` (an emulated link with fixed rates and delay)
measured within 0.3% of the configured rate from 100 Mbps to 1 Gbps.

## Development

Requires Node 22 or newer and a PostgreSQL database.

```sh
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/uplink npm run dev
```

`npm run dev` serves the API, the WebSockets and the Vite dev server (with hot reload) on one port,
`http://localhost:5090`.

| Command | |
|---|---|
| `npm run build` | Build the PWA to `dist/client` and bundle the server to `dist/server`. |
| `npm start` | Run the production build. |
| `npm run typecheck` | Type-check client and server. |
| `npm run icons` | Regenerate the app icons in `public/` from `scripts/generate-icons.mjs`. |
| `npm run check:protocol` | Protocol checks against a running, idle server (`BASE=host:port`). |
| `node scripts/link-shaper.mjs 5091 5090 100 20 10` | Emulate a 100/20 Mbps link with a 20 ms round trip on port 5091. |
| `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build` | Build and run the image from your checkout instead of pulling it. |

Every push runs `.github/workflows/docker.yml`: it type-checks, builds the image, starts it against a
PostgreSQL 14 service, runs the protocol checks, and (on `main` and `v*` tags) publishes to
`ghcr.io/thefreymaster/uplink`.

### Layout

```
src/
  shared/      wire protocol types and the measurement math (used by server and browser)
  server/      Express API, WebSocket endpoints, test sessions, PostgreSQL
  client/
    engine/    the measurement worker and its main-thread wrapper
    live/      the realtime connection (server status, live results)
    pages/     Speed test, History, Settings
    components/ dial, cards, charts (Chakra UI v3 + Chakra Charts/Recharts)
```

### API

| Endpoint | |
|---|---|
| `GET /api/health` | Liveness and database state (used by the container health check). |
| `GET /api/info` | Server name, version, limits, database status, your IP. |
| `GET /api/tests?since=&device=&limit=&before=` | Results, newest first, with cursor paging. |
| `GET /api/tests/:id` | One result including its timeline samples. |
| `DELETE /api/tests/:id` | Delete a result. |
| `GET /api/devices` | Devices that have run tests. |
| `GET /api/export.csv?since=&device=` | CSV export. |
| `WS /ws/live` | Server status, live progress of the running test, new and deleted results. |
| `WS /ws/session`, `WS /ws/stream` | Test control and data connections. |
