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

You need:

- Unraid 6.12 or newer.
- Your **PostgreSQL 14** container (for example `postgresql14` from Community Applications) with port
  5432 published on the Unraid host. Redis and MariaDB are not used.
- **Docker Compose Manager** from Community Applications (Apps → search "Docker Compose Manager"). It
  adds a *Compose* section to the Docker tab and the `docker compose` command.

### 1. Create a database user

Open a terminal on Unraid (the `>_` icon in the top bar) and run, changing the password:

```sh
docker exec -it postgresql14 psql -U postgres -c "CREATE USER uplink WITH PASSWORD 'change-me' CREATEDB;"
```

`CREATEDB` lets Uplink create its own `uplink` database and tables on first start. If you'd rather not
grant that, create the database yourself and set `DB_AUTO_CREATE=false`:

```sh
docker exec -it postgresql14 psql -U postgres -c "CREATE DATABASE uplink OWNER uplink;"
```

(Use your container's name if it isn't `postgresql14`, and the superuser you configured if it isn't
`postgres`.)

### 2. Put the project on the server

```sh
cd /mnt/user/appdata
git clone https://github.com/thefreymaster/uplink.git
cd uplink
```

The repository is private, so `git clone` will ask for your GitHub username and a
[personal access token](https://github.com/settings/tokens) as the password (read-only access to this
repository is enough). If `git` isn't available on your Unraid version, download the repository as a ZIP
from GitHub on another machine and copy the extracted folder to `/mnt/user/appdata/uplink` over SMB.

### 3. Configure

```sh
cp .env.example .env
nano .env
```

Set at least:

| Setting | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://uplink:change-me@host.docker.internal:5432/uplink` | `host.docker.internal` reaches the Unraid host from the container. Your server's LAN IP works too. |
| `SERVER_NAME` | `Tower` | Shown in the app as the other end of the link. |
| `UPLINK_PORT` | `3000` | Port you'll open in the browser. Pick another if 3000 is taken. |

### 4. Build and start

From the terminal:

```sh
cd /mnt/user/appdata/uplink
docker compose up -d --build
```

The first build downloads Node and dependencies and takes a few minutes. When it finishes, the container
shows up in the Docker tab as **uplink**, with a **WebUI** entry in its menu.

Or, using the Compose Manager UI: Docker tab → *Compose* → **Add New Stack**, name it `uplink`, point the
stack at `/mnt/user/appdata/uplink` (the folder with `docker-compose.yml` and `.env`) in the stack's
advanced settings, then **Compose Up**. The terminal route above is the simplest and does the same thing.

### 5. Open it

Browse to `http://<your-unraid-ip>:3000` from any device on your network and press **Start**.
Give each device a name under **Settings → This device** so you can tell results apart in History.

Check the logs if anything looks off:

```sh
docker logs -f uplink
```

A healthy start ends with `Database ready`. Settings → Server in the app also shows the database status.

### Updating

```sh
cd /mnt/user/appdata/uplink
git pull
docker compose up -d --build
```

Open apps pick up the new version on their own: an *Update available* prompt offers a reload (it waits
if a test is running).

### Building somewhere else instead

If you'd rather not build on Unraid, build on any machine with Docker and copy the image across:

```sh
docker build --platform linux/amd64 -t uplink:latest .
docker save uplink:latest | ssh root@tower docker load
```

Then on Unraid keep `docker-compose.yml` and `.env` in `/mnt/user/appdata/uplink` and run
`docker compose up -d` (without `--build`).

### Installing the app (HTTPS)

Browsers only allow installing a PWA from an HTTPS address (or `localhost`). Over plain
`http://<ip>:3000` everything works, but there's no install option. To install it, serve Uplink through
your reverse proxy:

- **Nginx Proxy Manager:** add a proxy host for e.g. `speed.example.com` → `http://<unraid-ip>:3000`,
  turn on **Websockets Support**, and request a certificate on the SSL tab.
- **SWAG / plain nginx:**

  ```nginx
  location / {
      proxy_pass http://<unraid-ip>:3000;
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

Then set `TRUST_PROXY=true` in `.env` (so results show each device's real IP) and run
`docker compose up -d` again. If your proxy rewrites the `Host` header and the app can't connect, add your
address to `ALLOWED_ORIGINS`, e.g. `ALLOWED_ORIGINS=https://speed.example.com`.

Uplink has no login: anyone who can reach it can run tests and delete results. Keep it on your LAN or
VPN, or put authentication in front of it at the proxy (e.g. an access list in Nginx Proxy Manager)
before exposing it to the internet.

On the phone, open the HTTPS address and choose **Install app** (Android/Chrome) or **Share → Add to
Home Screen** (iPhone/iPad). On Android and desktop, the installed app's icon menu (long-press or
right-click) also offers **Run speed test** directly.

### Getting accurate results

- A proxy in the path adds work for every byte. For multi-gigabit LAN tests, use the direct
  `http://<unraid-ip>:3000` address.
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
| `UPLINK_PORT` | `3000` | Host port, compose only. Inside the container the app listens on `PORT` (3000). |
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
`http://localhost:3000`.

| Command | |
|---|---|
| `npm run build` | Build the PWA to `dist/client` and bundle the server to `dist/server`. |
| `npm start` | Run the production build. |
| `npm run typecheck` | Type-check client and server. |
| `npm run icons` | Regenerate the app icons in `public/` from `scripts/generate-icons.mjs`. |
| `npm run check:protocol` | Protocol checks against a running, idle server (`BASE=host:port`). |
| `node scripts/link-shaper.mjs 3010 3000 100 20 10` | Emulate a 100/20 Mbps link with a 20 ms round trip on port 3010. |

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
