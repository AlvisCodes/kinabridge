# Kinabridge

A real-time sensor data bridge that syncs InfluxDB readings to Kinabase with automatic upsert and token refresh.

## Features

- 🔄 **Auto-Refresh Tokens**: JWT tokens automatically refresh before expiry - runs indefinitely
- 📊 **Smart Upsert**: One record per machine that updates in real-time (not spam of new records)
- 🌐 **Auto-Open Browser**: Control dashboard opens automatically at `http://localhost:4300`
- ⚡ **Configurable Polling**: Default 2-minute intervals for sensor updates
- 🛡️ **Resilient**: Automatic retry logic with exponential backoff
- 🎯 **Production Ready**: Designed for Raspberry Pi deployment with weekend-long reliability

## Quick Start

```bash
npm install
npm start
```

The control dashboard will automatically open in your browser at `http://localhost:4300`.

## Configuration

Create a `.env` file:

```env
# InfluxDB Configuration
INFLUX_URL=http://localhost:8086
INFLUX_ORG=SHOESTRING
INFLUX_BUCKET=shoestring_data_bucket
INFLUX_READ_TOKEN=your_influx_token

# Kinabase Configuration (Use API Key/Secret for auto-refresh)
KINABASE_BASE_URL=https://smooth-liger-quietly.ngrok-free.app/api/v1
KINABASE_COLLECTION=584f2727-8b0b-4abd-8bad-e08d767e9527
KINABASE_DEVICES_COLLECTION=1abece96-c3b3-4423-ad58-346637a0ca02
KINABASE_API_KEY=your_api_key
KINABASE_API_SECRET=your_api_secret

# Polling Configuration
POLL_INTERVAL_MS=120000  # 2 minutes

# Optional: Manual JWT (disables auto-refresh)
# KINABASE_JWT=your_manual_jwt_token
```

## How It Works

### Authentication
- **API Key/Secret** (Recommended): Tokens automatically refresh 1 minute before expiry
- **Manual JWT**: Use `KINABASE_JWT` if you need manual token control (no auto-refresh)

### Data Sync
1. **First Poll**: Creates one record per machine with initial sensor data
2. **Subsequent Polls**: Updates existing records with latest timestamp, temperature, humidity, pressure
3. **Result**: Each machine maintains exactly one record that updates in real-time

### Polling Cycle
```
Start → Fetch from InfluxDB → Transform → Find Existing Record
  ↓
  ├─ Found? → PATCH update with new data
  └─ Not Found? → POST create new record
  ↓
Wait 2 minutes → Repeat
```

## Command Line Options

```bash
npm start              # Normal mode with browser auto-open
npm start -- --no-browser    # Skip browser auto-open
npm start -- --once    # Run once and exit (for testing)
npm start -- --run-once --no-browser  # Combine flags
```

## Deployment on Raspberry Pi

```bash
# On your Pi
cd ~/Desktop/kinabridge
git pull
./update-pi.sh  # Updates .env with production credentials
pm2 start src/index.js --name kinabridge
pm2 save
pm2 startup  # Enable auto-start on boot
```

## API Endpoints

### Control Dashboard
- `GET /` - Web UI for monitoring bridge status
- `GET /api/status` - JSON status of bridge and sync state
- `POST /api/status` - Toggle bridge on/off

Example:
```bash
curl http://localhost:4300/api/status
curl -X POST http://localhost:4300/api/status \
  -H "Content-Type: application/json" \
  -d '{"bridgeEnabled": false}'
```

## Project Structure

```
kinabridge/
├── src/
│   ├── index.js           # Main entry point & polling orchestration
│   ├── config.js          # Environment configuration
│   ├── kinabaseAuth.js    # JWT token management with auto-refresh
│   ├── kinabaseClient.js  # Kinabase API client with upsert logic
│   ├── influxClient.js    # InfluxDB data fetching
│   ├── transform.js       # Data transformation (InfluxDB → Kinabase)
│   ├── controlServer.js   # Express server for web UI
│   ├── stateStore.js      # Persistent state management
│   ├── statusTracker.js   # Health monitoring
│   └── logger.js          # Pino logging
├── public/
│   ├── index.html         # Control dashboard UI
│   ├── app.js             # Dashboard JavaScript
│   └── styles.css         # Dashboard styling
└── .env                   # Configuration (not in git)
```

## Logging

The application uses structured JSON logging with different levels:

- `INFO`: Normal operations (token refresh, record updates)
- `DEBUG`: Detailed operation info (cached tokens, search queries)
- `WARN`: Recoverable issues (retry attempts, missing records)
- `ERROR`: Failures requiring attention

View logs in real-time:
```bash
pm2 logs kinabridge
```

## Troubleshooting

### Token Issues
- ✅ Auto-refresh working? Check logs for `🔄 Token expired or expiring soon, refreshing automatically...`
- ❌ 401 errors? Verify `KINABASE_API_KEY` and `KINABASE_API_SECRET` are correct

### No Data Syncing
- Check InfluxDB connection: `curl http://localhost:8086/health`
- Verify collection name matches: Check `KINABASE_COLLECTION` in `.env`
- Enable debug logging: `LOG_LEVEL=debug npm start`

### Browser Not Opening
- Add `--no-browser` flag if running headless
- Check port 4300 is not in use: `lsof -i :4300`

## License

MIT
