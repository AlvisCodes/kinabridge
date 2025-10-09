#!/bin/bash

# Quick script to test Raspberry Pi InfluxDB connection and update .env

if [ -z "$1" ]; then
    echo "Usage: ./connect-to-pi.sh <raspberry-pi-ip>"
    echo ""
    echo "Example: ./connect-to-pi.sh 192.168.1.100"
    echo "     or: ./connect-to-pi.sh raspberrypi.local"
    echo ""
    echo "To find your Pi's IP:"
    echo "  - On the Pi, run: hostname -I"
    echo "  - Or check: ip addr show"
    echo "  - Or try: raspberrypi.local"
    exit 1
fi

PI_HOST=$1
TARGET_URL=""

if [[ "$PI_HOST" == http://* || "$PI_HOST" == https://* ]]; then
    TARGET_URL="$PI_HOST"
else
    if [[ "$PI_HOST" == *:* ]]; then
        TARGET_URL="http://$PI_HOST"
    else
        TARGET_URL="http://$PI_HOST:8086"
    fi
fi

echo "🔍 Testing connection to Raspberry Pi at: $PI_HOST"
echo ""

# Test if host is reachable
echo "1. Testing network connectivity..."
if ping -c 1 -W 2 $PI_HOST &> /dev/null; then
    echo "✓ Host is reachable"
else
    echo "✗ Cannot reach host"
    echo "  Check if the Pi is on the same network"
    exit 1
fi

# Test InfluxDB port
echo ""
echo "2. Testing InfluxDB port 8086..."
if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$PI_HOST/8086" 2>/dev/null; then
    echo "✓ Port 8086 is open"
else
    echo "✗ Port 8086 is not accessible"
    echo "  Check if InfluxDB is running on the Pi"
    echo "  Or check firewall settings"
    exit 1
fi

# Test InfluxDB health endpoint
echo ""
echo "3. Testing InfluxDB health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://$PI_HOST:8086/health 2>/dev/null)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✓ InfluxDB is responding (HTTP 200)"
else
    echo "⚠ InfluxDB returned: HTTP $HEALTH_RESPONSE"
fi

# Test Grafana (port 3000)
echo ""
echo "4. Testing Grafana port 3000..."
if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$PI_HOST/3000" 2>/dev/null; then
    echo "✓ Grafana port 3000 is accessible"
else
    echo "⚠ Grafana port 3000 is not accessible (not critical)"
fi

# Update .env file
echo ""
echo "5. Updating .env file..."
if [ -f ".env" ]; then
    # Backup original
    cp .env .env.backup
    echo "  (Backup created: .env.backup)"

    node - "$TARGET_URL" <<'EOF'
const fs = require('fs');
const path = '.env';
const newUrl = process.argv[1];

try {
  const original = fs.readFileSync(path, 'utf-8').split(/\r?\n/);
  let replaced = false;
  const updated = original.map((line) => {
    if (line.startsWith('INFLUX_URL=')) {
      replaced = true;
      return `INFLUX_URL=${newUrl}`;
    }
    return line;
  });

  if (!replaced) {
    updated.push(`INFLUX_URL=${newUrl}`);
  }

  const output = updated.join('\n');
  fs.writeFileSync(path, output.endsWith('\n') ? output : `${output}\n`, 'utf-8');
} catch (error) {
  console.error('Failed to update .env:', error.message);
  process.exit(1);
}
EOF
    if [ $? -ne 0 ]; then
        echo "✗ Failed to update .env file"
        exit 1
    fi

    echo "✓ Updated INFLUX_URL to: $TARGET_URL"
else
    echo "✗ .env file not found"
    exit 1
fi

echo ""
echo "=================================="
echo "✅ Configuration complete!"
echo ""
echo "Your Raspberry Pi InfluxDB is at: http://$PI_HOST:8086"
echo ""
echo "Next steps:"
echo "  1. Test the connection: npm run test:influx"
echo "  2. Run the bridge once: npm run dev"
echo "  3. Start continuous polling: npm start"
echo "  4. View dashboard: http://localhost:4300"
echo ""
