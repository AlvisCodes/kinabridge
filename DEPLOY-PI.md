# Raspberry Pi Deployment Guide

## Quick Start (Copy & Paste on Raspberry Pi)

### Step 1: Clone the Repository

```bash
cd ~
git clone https://github.com/AlvisCodes/kinabridge.git
cd kinabridge
```

### Step 2: Run Setup Script

```bash
chmod +x setup-pi.sh
./setup-pi.sh
```

The setup script will:
- ✅ Check Node.js version (requires 18+)
- ✅ Verify Docker and HumidityMonitoring stack is running
- ✅ Test InfluxDB connectivity
- ✅ Install npm dependencies
- ✅ Create .env file from template
- ✅ Run connection tests

### Step 3: Test the Bridge

```bash
npm run dev
```

Expected output:
```
{"level":"info","msg":"Using Kinabase JWT provided via environment variables"}
{"level":"info","msg":"Kinabase bridge control UI available","port":4300}
{"level":"debug","msg":"Querying InfluxDB for new humidity sensor points"}
{"level":"info","msg":"Uploaded records to Kinabase and updated state"}
```

### Step 4: Start Continuous Polling

```bash
npm start
```

### Step 5: Set Up Auto-Start (Production)

```bash
# Install PM2
sudo npm install -g pm2

# Start the bridge
pm2 start npm --name kinabase-bridge -- start

# Save the configuration
pm2 save

# Enable auto-start on boot
pm2 startup
# Then run the command that PM2 outputs

# Check status
pm2 status

# View logs
pm2 logs kinabase-bridge
```

## Access Control Dashboard

From Raspberry Pi:
```
http://localhost:4300
```

From your Mac or other device on the same network:
```
http://10.10.11.13:4300
```

## Troubleshooting

### InfluxDB Not Accessible

```bash
# Check if HumidityMonitoring stack is running
docker ps

# Should see: influxdb, mqtt, telegraf containers

# If not running, start it:
cd /path/to/HumidityMonitoring
./start.sh
```

### Wrong InfluxDB Token

Get the correct token from the HumidityMonitoring .env file:

```bash
# Find the HumidityMonitoring directory
find ~ -name ".env" -path "*/HumidityMonitoring/*" 2>/dev/null

# View the token
cat /path/to/HumidityMonitoring/.env | grep TOKEN
```

Then update `~/kinabridge/.env` with the correct `INFLUX_READ_TOKEN`.

### Node.js Too Old

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
```

### Check Bridge Logs

```bash
# If running with npm start
# Logs appear in terminal

# If running with PM2
pm2 logs kinabase-bridge

# Check last 100 lines
pm2 logs kinabase-bridge --lines 100
```

### Stop the Bridge

```bash
# If running in terminal: Ctrl+C

# If running with PM2
pm2 stop kinabase-bridge

# To completely remove from PM2
pm2 delete kinabase-bridge
```

### Test InfluxDB Connection

```bash
cd ~/kinabridge
npm run test:influx
```

## Manual Configuration (if needed)

If the setup script doesn't work perfectly, you can configure manually:

```bash
# 1. Copy example env
cp .env.example .env

# 2. Edit the .env file
nano .env

# Update these values if needed:
# - INFLUX_READ_TOKEN (from HumidityMonitoring setup)
# - All other values should be correct

# 3. Install dependencies
npm install

# 4. Test
npm run dev
```

## Configuration Values

The `.env` file already contains the correct values:

```bash
# InfluxDB (local on Raspberry Pi)
INFLUX_URL=http://localhost:8086
INFLUX_ORG=SHOESTRING
INFLUX_BUCKET=shoestring_data_bucket
INFLUX_READ_TOKEN=<your-token>

# Kinabase (cloud service)
KINABASE_BASE_URL=https://app.kinabase.com/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_API_KEY=9b8ac37a-40e5-4bf2-be6d-a9270c77231f
KINABASE_API_SECRET=dHwT0Tg8fAKRuJGUS1vZfRz/RX0rQVhjGQbIVuxY+bzNGRKZ9NYmLlJ7blE8gTpbKyJVn3nheaHFXowAUKNx/w==
KINABASE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5YzAxMzUzNi00ZDQxLTQwY2EtODI2Zi0xNTQ1MjNmYjFkNjIiLCJ0bnRpZCI6IjA4MWQxY2M4LWRhNTEtNDU1Ny1hODgwLTFmZWI5ZTIxMzFiNCIsImFwcGlkIjoiOWI4YWMzN2EtNDBlNS00YmYyLWJlNmQtYTkyNzBjNzcyMzFmIiwiZXhwIjoxNzYwMDIwNjg0LCJpc3MiOiJsb2NhbGhvc3QiLCJhdWQiOiJraW5hYmFzZS5jbGllbnQifQ._IBsYXbXjFYXWyf2N6e50TiTSlhmw0-HGsH320QjHKE

# Bridge Configuration
POLL_INTERVAL_MS=5000
STATE_FILE=./last-run.json
LOG_LEVEL=debug
DEFAULT_LOOKBACK_MS=900000
CONTROL_PORT=4300
```

## Data Flow

```
Sensor → MQTT → Telegraf → InfluxDB → Kinabase Bridge → Kinabase Cloud
                                      (This App)
```

## Important Notes

1. **The bridge runs ON the Raspberry Pi** - not on your Mac
2. **InfluxDB must be running** before starting the bridge
3. **Internet connection required** to send data to Kinabase cloud
4. **State file** (`last-run.json`) tracks progress - don't delete it unless you want to reprocess old data
5. **Control dashboard** allows you to pause/resume the bridge without stopping it

## Support

If you encounter issues:

1. Run the prerequisite checker:
   ```bash
   ./check-prerequisites.sh
   ```

2. Check the logs for errors

3. Verify InfluxDB has data:
   ```bash
   npm run test:influx
   ```

4. Check Kinabase API credentials are correct

5. Ensure internet connection is working:
   ```bash
   curl -I https://app.kinabase.com
   ```
