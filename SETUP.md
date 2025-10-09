# Kinabase Bridge Setup Guide

## Prerequisites

The Kinabase Bridge requires the Shoestring HumidityMonitoring stack to be running first.

## Raspberry Pi Quick Start

If you are deploying the bridge directly on a Raspberry Pi (64-bit OS recommended):

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install prerequisites used during installation
sudo apt install -y curl ca-certificates gnupg

# Install Node.js 18 LTS (required by the bridge)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Optional but handy: git and pm2
sudo apt install -y git
sudo npm install -g pm2
```

Clone the repository and install dependencies:

```bash
git clone https://github.com/kinabase/kinabridge.git
cd kinabridge
npm install --omit=dev
```

Create and edit your environment file:

```bash
cp .env.example .env
```

Update the values in `.env` so they point to the HumidityMonitoring stack you want to read (local or remote). Then verify connectivity:

```bash
npm run test:influx   # Verifies InfluxDB credentials
npm run dev           # Executes one bridge cycle
```

For unattended operation on Raspberry Pi you can keep the process under PM2 or run it with systemd. Example unit file:

```ini
# /etc/systemd/system/kinabase-bridge.service
[Unit]
Description=Kinabase Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/pi/kinabridge
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/pi/kinabridge/src/index.js
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kinabase-bridge.service
```

The control dashboard is available at `http://<pi-hostname>:4300` by default. Continue with the remainder of this guide for HumidityMonitoring prerequisites and general troubleshooting.

### Required Services
1. **InfluxDB** - Time series database (port 8086)
2. **Mosquitto MQTT Broker** - Message broker (port 1883)
3. **Telegraf** - Data ingestion from MQTT to InfluxDB
4. **Grafana** - Visualization (port 3000) [optional for bridge]

## Step 1: Start the HumidityMonitoring Stack

### If Docker is NOT installed:
```bash
# Install Docker Desktop for Mac
# Visit: https://docs.docker.com/desktop/install/mac-install/
# Or use Homebrew:
brew install --cask docker
```

### Start the HumidityMonitoring Docker Stack:

Navigate to your HumidityMonitoring directory and start it:
```bash
cd /path/to/HumidityMonitoring
./start.sh
```

Or if you have docker-compose.yml directly:
```bash
cd /path/to/HumidityMonitoring
docker-compose up -d
```

### Verify the stack is running:
```bash
docker ps
```

You should see containers for:
- InfluxDB
- Mosquitto (MQTT Broker)
- Telegraf
- Grafana

## Step 2: Verify InfluxDB is accessible

```bash
curl http://localhost:8086/health
```

Should return: `{"name":"influxdb","message":"ready for queries and writes","status":"pass"...}`

## Step 3: Configure the Bridge

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Verify the credentials in `.env`:
   - ✅ **INFLUX_URL** - Should be `http://localhost:8086`
   - ✅ **INFLUX_ORG** - Should match your InfluxDB org (default: `SHOESTRING`)
   - ✅ **INFLUX_BUCKET** - Should match your bucket (default: `shoestring_data_bucket`)
   - ✅ **INFLUX_READ_TOKEN** - Get this from InfluxDB admin panel or .env file in HumidityMonitoring
   - ✅ **KINABASE credentials** - Already configured

## Step 4: Test InfluxDB Connection

```bash
npm run test:influx
```

or

```bash
node test-influx.js
```

## Step 5: Run the Bridge

### One-time test run:
```bash
npm run dev
```

### Continuous polling:
```bash
npm start
```

### With PM2 (recommended for production):
```bash
sudo npm install -g pm2  # omit sudo if you manage Node with nvm
pm2 start npm --name kinabase-bridge -- start
pm2 save
pm2 startup
```

## Step 6: Monitor the Bridge

Open the control dashboard:
```
http://localhost:4300
```

## Troubleshooting

### Error: ECONNREFUSED on port 8086
**Problem:** InfluxDB is not running

**Solution:**
1. Check if Docker is running: `docker ps`
2. Start the HumidityMonitoring stack
3. Verify InfluxDB health: `curl http://localhost:8086/health`

### Error: No data found in InfluxDB
**Problem:** Sensors are not publishing data or Telegraf is not configured

**Solution:**
1. Check MQTT broker: `docker logs <mosquitto-container-id>`
2. Check Telegraf logs: `docker logs <telegraf-container-id>`
3. Verify sensor is publishing to topic `shoestring-sensor`

### Error: Kinabase authentication failed
**Problem:** Invalid JWT or expired token

**Solution:**
1. The bridge will auto-refresh tokens using API_KEY and API_SECRET
2. If JWT is provided directly, it may have expired
3. Remove `KINABASE_JWT` from .env to let the bridge auto-generate tokens

## Port Summary

- **8086** - InfluxDB
- **1883** - Mosquitto MQTT
- **3000** - Grafana (optional)
- **4300** - Kinabase Bridge Control Dashboard

## Data Flow

```
Sensor → MQTT (shoestring-sensor) → Telegraf → InfluxDB (humidity_sensors) → Kinabase Bridge → Kinabase API
```
