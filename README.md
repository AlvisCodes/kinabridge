# Kinabase Bridge

Node.js bridge that reads humidity sensor data from the Shoestring HumidityMonitoring InfluxDB bucket and forwards the points to Kinabase.

## Setup

- Install Node.js 18.x on the host (Raspberry Pi: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs`).
- Copy/clone the project to the target path (e.g. `/home/pi/kinabridge`).
- Run `npm install --omit=dev`.
- Create `.env` by copying `.env.example` and filling in the credentials:
  - `INFLUX_URL`, `INFLUX_ORG`, `INFLUX_BUCKET`, `INFLUX_READ_TOKEN`: existing InfluxDB details from Shoestring deployment.
  - Either provide `KINABASE_JWT` directly or set `KINABASE_API_KEY` and `KINABASE_API_SECRET` so the bridge can request a JWT.
  - `KINABASE_COLLECTION` is the Kinabase collection to receive humidity readings (default `humidity_readings`).
  - `POLL_INTERVAL_MS` controls how frequently the bridge polls InfluxDB.
  - `STATE_FILE` is the path where the bridge stores the last processed timestamp.
  - `DEFAULT_LOOKBACK_MS` (optional) controls how far back the first query looks when no state file exists (default 15 minutes).
  - `CONTROL_PORT` (optional) exposes the web dashboard that toggles the bridge (default `4300`).
  - Optional `KINABASE_BASE_URL` lets you override the Kinabase API base if you are targeting a non-default environment.
- Run `npm start` to launch the continuous poller. Use `npm run dev` to execute a single polling cycle for testing.

See `SETUP.md` for a full walkthrough and Raspberry Pi service recommendations.

## Control Dashboard

- The project serves a lightweight dashboard at `http://<host>:<CONTROL_PORT>` (default `http://localhost:4300`).
- Use the toggle button to pause or resume forwarding data to Kinabase; when paused, the bridge retains the last processed timestamp so data collected while paused will be delivered once re-enabled.
- The status banner reports whether the latest uploads reached Kinabase and shows the last successful sync and last processed Influx timestamp.

## Deployment Notes

- To keep the bridge running, use a process manager such as PM2:
  - `pm2 start npm --name kinabase-bridge -- run start`
  - `pm2 save`
  - `pm2 startup`
- Logs are written to stdout; adjust `LOG_LEVEL` or set `NODE_ENV=development` for verbose output.
- The bridge reads the `humidity_sensors` measurement populated by Telegraf (see Shoestring HumidityMonitoring) and maps the `temperature`, `humidity`, and `pressure` fields plus the `machine` tag to Kinabase payloads so the same data driving Grafana dashboards is synchronised with Kinabase.
