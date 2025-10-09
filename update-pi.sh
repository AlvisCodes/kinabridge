#!/bin/bash
set -e
cd ~/Desktop/kinabridge
sed -i 's|KINABASE_BASE_URL=.*|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g' .env
sed -i 's|KINABASE_COLLECTION=.*|KINABASE_COLLECTION=https://app.kinabase.com/c/sensor-readings|g' .env
echo "✓ Updated .env"
echo "Now restart your app manually (e.g., pm2 restart or kill and restart the process)"
