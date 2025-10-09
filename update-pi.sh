#!/bin/bash
set -e
cd ~/Desktop/kinabridge
sed -i 's|KINABASE_BASE_URL=.*|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g' .env
sed -i 's|KINABASE_COLLECTION=.*|KINABASE_COLLECTION=https://app.kinabase.com/c/sensor-readings|g' .env
if command -v pm2 &> /dev/null; then
    pm2 restart kinabridge
else
    sudo systemctl restart kinabridge
fi
echo "✓ Updated and restarted"
