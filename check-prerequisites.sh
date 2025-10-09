#!/bin/bash

echo "🔍 Kinabase Bridge Startup Checker"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

OS_NAME=$(uname -s)
case "$OS_NAME" in
  Darwin)
    PLATFORM_NAME="macOS"
    DOCKER_INSTALL_HINT="Install Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
    DOCKER_START_HINT="Start Docker Desktop (e.g. run: open -a Docker)"
    DOCKER_PERMISSION_HINT=""
    ;;
  Linux)
    PLATFORM_NAME="Linux"
    DOCKER_INSTALL_HINT="Install Docker Engine: https://docs.docker.com/engine/install/ (Raspberry Pi: https://docs.docker.com/engine/install/debian/)"
    DOCKER_START_HINT="Start the Docker service: sudo systemctl start docker"
    DOCKER_PERMISSION_HINT="Add your user to the docker group: sudo usermod -aG docker \$USER && newgrp docker"
    ;;
  *)
    PLATFORM_NAME="$OS_NAME"
    DOCKER_INSTALL_HINT="See Docker install docs: https://docs.docker.com/get-started/get-docker/"
    DOCKER_START_HINT="Ensure the Docker service/daemon is running"
    DOCKER_PERMISSION_HINT=""
    ;;
esac

# Check 1: Node.js
echo "1. Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 2: Docker
echo "2. Checking Docker..."
if command -v docker &> /dev/null; then
    if docker ps > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Docker is running"
        
        # Check for HumidityMonitoring containers
        echo "   Checking for HumidityMonitoring containers..."
        INFLUX_CONTAINER=$(docker ps --filter "name=influx" --format "{{.Names}}" | head -1)
        MQTT_CONTAINER=$(docker ps --filter "name=mqtt" --format "{{.Names}}" | head -1)
        TELEGRAF_CONTAINER=$(docker ps --filter "name=telegraf" --format "{{.Names}}" | head -1)
        
        if [ -n "$INFLUX_CONTAINER" ]; then
            echo -e "   ${GREEN}✓${NC} InfluxDB container found: $INFLUX_CONTAINER"
        else
            echo -e "   ${RED}✗${NC} InfluxDB container not running"
            ERRORS=$((ERRORS + 1))
        fi
        
        if [ -n "$MQTT_CONTAINER" ]; then
            echo -e "   ${GREEN}✓${NC} MQTT container found: $MQTT_CONTAINER"
        else
            echo -e "   ${YELLOW}!${NC} MQTT container not running"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        if [ -n "$TELEGRAF_CONTAINER" ]; then
            echo -e "   ${GREEN}✓${NC} Telegraf container found: $TELEGRAF_CONTAINER"
        else
            echo -e "   ${YELLOW}!${NC} Telegraf container not running"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        DOCKER_ERROR=$(docker ps 2>&1 | head -n 1)
        echo -e "${RED}✗${NC} Docker is installed but not accessible"
        if [ -n "$DOCKER_ERROR" ]; then
            echo "   $DOCKER_ERROR"
        fi
        echo "   $DOCKER_START_HINT"
        if [ -n "$DOCKER_PERMISSION_HINT" ]; then
            echo "   $DOCKER_PERMISSION_HINT"
        fi
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} Docker not found"
    echo "   $DOCKER_INSTALL_HINT"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 3: InfluxDB connectivity
echo "3. Checking InfluxDB connectivity..."
INFLUX_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8086/health 2>/dev/null)
if [ "$INFLUX_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} InfluxDB is accessible at http://localhost:8086"
else
    echo -e "${RED}✗${NC} InfluxDB not accessible (HTTP $INFLUX_RESPONSE)"
    echo "   Start the HumidityMonitoring stack first"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 4: .env file
echo "4. Checking configuration..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    
    # Check required variables
    if grep -q "INFLUX_URL=" .env && grep -q "INFLUX_READ_TOKEN=" .env; then
        echo -e "   ${GREEN}✓${NC} InfluxDB configuration present"
    else
        echo -e "   ${RED}✗${NC} InfluxDB configuration incomplete"
        ERRORS=$((ERRORS + 1))
    fi
    
    if grep -q "KINABASE_API_KEY=" .env || grep -q "KINABASE_JWT=" .env; then
        echo -e "   ${GREEN}✓${NC} Kinabase credentials present"
    else
        echo -e "   ${RED}✗${NC} Kinabase credentials missing"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗${NC} .env file not found"
    echo "   Run: cp .env.example .env"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 5: Dependencies
echo "5. Checking dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules exists"
else
    echo -e "${YELLOW}!${NC} node_modules not found"
    echo "   Run: npm install"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Summary
echo "=================================="
echo "Summary:"
echo ""
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Ready to start the bridge:"
    echo "  npm run dev    # Test run (once)"
    echo "  npm start      # Continuous polling"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo "The bridge may work but some features might be limited."
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    fi
    echo ""
    echo "Fix the errors above before starting the bridge."
    echo ""
    echo "Quick fixes:"
    echo "  1. Start Docker (macOS: open -a Docker | Linux: sudo systemctl start docker)"
    echo "  2. Start HumidityMonitoring stack: cd /path/to/HumidityMonitoring && ./start.sh"
    echo "  3. Install dependencies: npm install"
    echo "  4. Create .env: cp .env.example .env"
    echo ""
    exit 1
fi
