# 🚀 Raspberry Pi Deployment Checklist

## ✅ Pre-Deployment Checklist (Do This First)

Before cloning the repo to the Raspberry Pi, make sure:

- [ ] HumidityMonitoring Docker stack is running on the Pi
- [ ] InfluxDB is accessible at http://localhost:8086 (on the Pi)
- [ ] Node.js 18+ is installed on the Pi
- [ ] You have SSH or terminal access to the Pi
- [ ] The Pi has internet connectivity

## 📋 Deployment Steps

### On Raspberry Pi:

```bash
# 1. Clone the repository
cd ~
git clone https://github.com/AlvisCodes/kinabridge.git
cd kinabridge

# 2. Run the automated setup
chmod +x setup-pi.sh
./setup-pi.sh

# 3. Test the bridge (one-time run)
npm run dev

# 4. If test successful, start continuous polling
npm start

# 5. (Optional) Set up PM2 for auto-start
sudo npm install -g pm2
pm2 start npm --name kinabase-bridge -- start
pm2 save
pm2 startup
```

## 🔍 Verification Steps

After deployment, verify everything is working:

### 1. Check InfluxDB Connection
```bash
npm run test:influx
```
**Expected:** Should show data from the last 24 hours

### 2. Check Bridge Status
```bash
# If using npm start (in terminal)
# Look for: "Uploaded records to Kinabase and updated state"

# If using PM2
pm2 status
pm2 logs kinabase-bridge --lines 50
```

### 3. Check Control Dashboard
Open in browser:
- From Pi: http://localhost:4300
- From Mac: http://10.10.11.13:4300

**Expected:** Should show:
- Bridge status: Enabled
- Last sync time
- Last processed timestamp

### 4. Check State File
```bash
cat last-run.json
```
**Expected:** Should show a timestamp and bridgeEnabled: true

### 5. Check Kinabase Data
Log into Kinabase dashboard and verify records are being created in the `sensor-readings` collection.

## 🛠️ Troubleshooting

### Issue: "ECONNREFUSED" on port 8086

**Problem:** InfluxDB not running

**Fix:**
```bash
docker ps | grep influx
# If not running:
cd /path/to/HumidityMonitoring
./start.sh
```

### Issue: "No data found in InfluxDB"

**Problem:** Sensors not publishing data

**Fix:**
```bash
# Check MQTT broker
docker logs <mqtt-container-name>

# Check Telegraf
docker logs <telegraf-container-name>

# Check if measurement exists
npm run test:influx
```

### Issue: "Kinabase authentication failed"

**Problem:** Invalid or expired JWT

**Fix:**
The bridge will auto-refresh tokens using API_KEY and API_SECRET. If it still fails:
1. Check internet connectivity
2. Verify API credentials in .env
3. Try removing KINABASE_JWT from .env to force refresh

### Issue: Node.js version too old

**Fix:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should be 18+
```

### Issue: Can't access dashboard from Mac

**Fix:**
```bash
# On Pi, check if bridge is listening on all interfaces
# The bridge should automatically bind to 0.0.0.0:4300

# If still can't access, check Pi firewall:
sudo ufw allow 4300/tcp
```

## 📊 Expected Behavior

Once running correctly:

1. **Every 5 seconds** (configurable):
   - Bridge queries InfluxDB for new data since last timestamp
   - Transforms data to Kinabase format
   - Sends batch to Kinabase API
   - Updates state file with latest timestamp

2. **Control Dashboard** (port 4300):
   - Shows real-time status
   - Allows pause/resume without stopping the process
   - Displays last sync time and errors

3. **State File** (`last-run.json`):
   - Persists last processed timestamp
   - Survives restarts
   - Ensures no data duplication

4. **Logs**:
   - Info level: Shows major operations
   - Debug level: Shows detailed query and API info
   - Error level: Shows any failures with retry info

## 🎯 Success Criteria

The deployment is successful when:

- ✅ `npm run dev` completes without errors
- ✅ Logs show "Uploaded records to Kinabase and updated state"
- ✅ `last-run.json` file is created and updated
- ✅ Control dashboard is accessible
- ✅ Kinabase dashboard shows new records
- ✅ Bridge continues running without crashes

## 📝 Production Recommendations

1. **Use PM2** for process management (auto-restart, logs)
2. **Set LOG_LEVEL=info** in production (less verbose)
3. **Monitor disk space** (logs can grow)
4. **Back up** `last-run.json` periodically
5. **Monitor** the control dashboard regularly
6. **Check Kinabase** dashboard to ensure data is arriving

## 🔄 Updating the Bridge

To update to a new version:

```bash
cd ~/kinabridge

# Stop the bridge
pm2 stop kinabase-bridge

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Restart
pm2 restart kinabase-bridge
```

## 📦 Files Included

- ✅ `setup-pi.sh` - Automated setup script
- ✅ `DEPLOY-PI.md` - This deployment guide
- ✅ `.env.example` - Configuration template with correct values
- ✅ `test-influx.js` - InfluxDB connection tester
- ✅ `check-prerequisites.sh` - System checker
- ✅ All source code ready to run

## 🎉 You're Ready!

Everything is configured and ready for the Raspberry Pi. Just:
1. Git push your changes (if any)
2. Clone on the Pi
3. Run `./setup-pi.sh`
4. Start the bridge

The bridge will handle everything else automatically! 🚀
