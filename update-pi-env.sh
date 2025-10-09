#!/bin/bash

# Update Raspberry Pi .env with correct Kinabase configuration
# Run this on your Raspberry Pi after pulling the latest code

set -e

cd ~/Desktop/kinabridge

echo "Updating .env configuration..."

# Update base URL to correct endpoint (api.kinabase.io)
if grep -q "KINABASE_BASE_URL=https://app.kinabase.com" .env; then
    sed -i 's|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|KINABASE_BASE_URL=https://api.kinabase.io/v1|g' .env
    echo "✓ Updated base URL to https://api.kinabase.io/v1"
elif grep -q "KINABASE_BASE_URL=https://api.kinabase.io" .env; then
    echo "✓ Base URL already correct"
else
    echo "⚠ Unexpected base URL, please check manually"
fi

echo "✓ Configuration updated"
echo ""
echo "Restarting service..."
pm2 restart kinabridge

echo ""
echo "Done! Check logs with: pm2 logs kinabridge"
