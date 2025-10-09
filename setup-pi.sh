#!/bin/bash

# Kinabase Bridge - Raspberry Pi Setup Script
# Run this script on the Raspberry Pi after cloning the repo

echo "🚀 Kinabase Bridge - Raspberry Pi Setup"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗${NC} Error: package.json not found"
    echo "Please run this script from the kinabridge directory"
    exit 1
fi

echo -e "${BLUE}Step 1: Checking Node.js${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
    
    # Check if version is >= 18
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}⚠${NC} Node.js version should be >= 18"
        echo "  Current: $NODE_VERSION"
        echo "  To upgrade: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        echo "              sudo apt-get install -y nodejs"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} Node.js not found"
    echo "Install Node.js 18+:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    ERRORS=$((ERRORS + 1))
fi
echo ""

echo -e "${BLUE}Step 2: Checking Docker and HumidityMonitoring stack${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker installed"
    
    # Check if InfluxDB is running
    if docker ps | grep -q influx; then
        INFLUX_CONTAINER=$(docker ps | grep influx | awk '{print $NF}')
        echo -e "${GREEN}✓${NC} InfluxDB container running: $INFLUX_CONTAINER"
    else
        echo -e "${RED}✗${NC} InfluxDB container not running"
        echo "  Start the HumidityMonitoring stack first"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Check MQTT
    if docker ps | grep -q mqtt; then
        MQTT_CONTAINER=$(docker ps | grep mqtt | awk '{print $NF}')
        echo -e "${GREEN}✓${NC} MQTT container running: $MQTT_CONTAINER"
    else
        echo -e "${YELLOW}⚠${NC} MQTT container not running"
    fi
    
    # Check Telegraf
    if docker ps | grep -q telegraf; then
        TELEGRAF_CONTAINER=$(docker ps | grep telegraf | awk '{print $NF}')
        echo -e "${GREEN}✓${NC} Telegraf container running: $TELEGRAF_CONTAINER"
    else
        echo -e "${YELLOW}⚠${NC} Telegraf container not running"
    fi
else
    echo -e "${RED}✗${NC} Docker not found"
    ERRORS=$((ERRORS + 1))
fi
echo ""

echo -e "${BLUE}Step 3: Testing InfluxDB connectivity${NC}"
INFLUX_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8086/health 2>/dev/null)
if [ "$INFLUX_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} InfluxDB is accessible at http://localhost:8086"
else
    echo -e "${RED}✗${NC} InfluxDB not accessible (HTTP $INFLUX_RESPONSE)"
    echo "  Make sure the HumidityMonitoring stack is running"
    ERRORS=$((ERRORS + 1))
fi
echo ""

echo -e "${BLUE}Step 4: Installing dependencies${NC}"
if npm install; then
    echo -e "${GREEN}✓${NC} Dependencies installed successfully"
else
    echo -e "${RED}✗${NC} Failed to install dependencies"
    ERRORS=$((ERRORS + 1))
fi
echo ""

echo -e "${BLUE}Step 5: Configuring .env file${NC}"
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✓${NC} .env file created"
    echo ""
    echo -e "${YELLOW}⚠ IMPORTANT: The .env file has been created with default values.${NC}"
    echo "  You may need to update these values:"
    echo "  - INFLUX_READ_TOKEN (get from your InfluxDB setup)"
    echo "  - KINABASE_API_KEY (already set)"
    echo "  - KINABASE_API_SECRET (already set)"
    echo "  - KINABASE_JWT (already set)"
    echo ""
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi
echo ""

echo -e "${BLUE}Step 6: Testing InfluxDB data query${NC}"
if [ $ERRORS -eq 0 ]; then
    echo "Running InfluxDB connection test..."
    if node test-influx.js; then
        echo -e "${GREEN}✓${NC} InfluxDB test passed"
    else
        echo -e "${YELLOW}⚠${NC} InfluxDB test had issues (check output above)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Skipping test due to previous errors"
fi
echo ""

# Summary
echo "========================================"
echo -e "${BLUE}Setup Summary${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to start the bridge.${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Test the bridge (single run):"
    echo -e "   ${BLUE}npm run dev${NC}"
    echo ""
    echo "2. Start the bridge (continuous):"
    echo -e "   ${BLUE}npm start${NC}"
    echo ""
    echo "3. View the control dashboard:"
    echo -e "   ${BLUE}http://localhost:4300${NC}"
    echo "   (or from another device: http://10.10.11.13:4300)"
    echo ""
    echo "4. Install PM2 for auto-start (recommended):"
    echo -e "   ${BLUE}sudo npm install -g pm2${NC}"
    echo -e "   ${BLUE}pm2 start npm --name kinabase-bridge -- start${NC}"
    echo -e "   ${BLUE}pm2 save${NC}"
    echo -e "   ${BLUE}pm2 startup${NC}"
    echo ""
    echo "5. Check logs:"
    echo -e "   ${BLUE}pm2 logs kinabase-bridge${NC}"
    echo ""
else
    echo -e "${RED}✗ Setup incomplete - $ERRORS error(s) found${NC}"
    echo ""
    echo "Please fix the errors above and run this script again:"
    echo -e "   ${BLUE}./setup-pi.sh${NC}"
    echo ""
    exit 1
fi
