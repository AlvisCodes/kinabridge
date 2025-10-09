#!/bin/bash

echo "🔍 Finding Raspberry Pi on your network..."
echo ""

# Try to find Raspberry Pi using common methods
echo "Method 1: Checking for raspberrypi.local (mDNS)..."
if ping -c 1 -W 1 raspberrypi.local &> /dev/null; then
    PI_IP=$(ping -c 1 raspberrypi.local | grep "PING" | awk '{print $3}' | tr -d '()')
    echo "✓ Found Raspberry Pi at: $PI_IP (raspberrypi.local)"
    echo ""
    echo "Testing InfluxDB connection..."
    INFLUX_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://$PI_IP:8086/health 2>/dev/null)
    if [ "$INFLUX_TEST" = "200" ]; then
        echo "✓ InfluxDB is accessible at http://$PI_IP:8086"
        echo ""
        echo "Update your .env file with:"
        echo "INFLUX_URL=http://$PI_IP:8086"
        echo ""
        echo "Or use the hostname:"
        echo "INFLUX_URL=http://raspberrypi.local:8086"
    else
        echo "✗ InfluxDB not accessible on port 8086"
    fi
    exit 0
fi

echo "✗ raspberrypi.local not found"
echo ""

# Method 2: Scan local network for Raspberry Pi
echo "Method 2: Scanning local network for devices..."
echo "(This may take a moment...)"
echo ""

# Get your Mac's IP and subnet
MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$MAC_IP" ]; then
    echo "✗ Could not determine your Mac's IP address"
    echo ""
    echo "Please manually find your Raspberry Pi's IP address:"
    echo "1. On the Raspberry Pi, run: hostname -I"
    echo "2. Or check your router's connected devices"
    echo ""
    exit 1
fi

echo "Your Mac's IP: $MAC_IP"
SUBNET=$(echo $MAC_IP | cut -d. -f1-3)
echo "Scanning subnet: $SUBNET.0/24"
echo ""

# Try common Raspberry Pi ports
for i in {1..254}; do
    IP="$SUBNET.$i"
    # Skip your own IP
    if [ "$IP" = "$MAC_IP" ]; then
        continue
    fi
    
    # Quick check for InfluxDB on port 8086
    if timeout 0.5 bash -c "cat < /dev/null > /dev/tcp/$IP/8086" 2>/dev/null; then
        echo "✓ Found device with InfluxDB at: $IP"
        
        # Test InfluxDB health
        INFLUX_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://$IP:8086/health 2>/dev/null)
        if [ "$INFLUX_TEST" = "200" ]; then
            echo "✓ InfluxDB health check passed!"
            echo ""
            echo "Update your .env file with:"
            echo "INFLUX_URL=http://$IP:8086"
            echo ""
            exit 0
        fi
    fi
done

echo "✗ Could not find Raspberry Pi automatically"
echo ""
echo "Manual steps to find your Raspberry Pi IP:"
echo "1. On the Raspberry Pi, open terminal and run:"
echo "   hostname -I"
echo ""
echo "2. Or check your router's admin panel for connected devices"
echo ""
echo "3. Once you have the IP, test InfluxDB access:"
echo "   curl http://RASPBERRY_PI_IP:8086/health"
echo ""
echo "4. Update .env file:"
echo "   INFLUX_URL=http://RASPBERRY_PI_IP:8086"
echo ""
