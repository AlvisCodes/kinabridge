# 🚀 Quick Start - Deploy to Raspberry Pi

## One Command Setup

SSH into your Raspberry Pi and run:

```bash
cd ~ && \
git clone https://github.com/AlvisCodes/kinabridge.git && \
cd kinabridge && \
chmod +x setup-pi.sh && \
./setup-pi.sh
```

That's it! The script will:
- ✅ Check Node.js version
- ✅ Verify HumidityMonitoring stack is running  
- ✅ Test InfluxDB connection
- ✅ Install dependencies
- ✅ Create `.env` from template
- ✅ Run connection tests

## After Setup

Test the bridge:
```bash
npm run dev
```

Start continuous polling:
```bash
npm start
```

Set up auto-start with PM2:
```bash
sudo npm install -g pm2
pm2 start npm --name kinabase-bridge -- start
pm2 save
pm2 startup
```

View dashboard:
- From Pi: http://localhost:4300
- From your Mac: http://10.10.11.13:4300

## Troubleshooting

If setup fails, see `DEPLOY-PI.md` for detailed instructions.

## What This Bridge Does

```
Sensor → MQTT → Telegraf → InfluxDB → Kinabase Bridge → Kinabase Cloud
                                       (This App)
```

Every 5 seconds:
1. Queries InfluxDB for new sensor data
2. Transforms data to Kinabase format
3. Sends to Kinabase API
4. Updates state file to track progress

## Support Files

- `DEPLOY-PI.md` - Detailed deployment guide
- `PI-CHECKLIST.md` - Complete checklist
- `SETUP.md` - Full setup documentation
- `STATUS.md` - Current status and next steps

## Requirements

- Raspberry Pi with HumidityMonitoring already running
- Node.js 18+ (setup script will check)
- Internet connection (to send data to Kinabase)

Everything is ready to go! 🎉
