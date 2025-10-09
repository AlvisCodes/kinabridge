#!/bin/bash
set -e
cd ~/Desktop/kinabridge
sed -i 's|KINABASE_BASE_URL=.*|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g' .env
sed -i 's|KINABASE_COLLECTION=.*|KINABASE_COLLECTION=sensor-readings|g' .env
sed -i '/^KINABASE_JWT=/d' .env
echo "✓ Updated .env (removed expired JWT, will use API Key/Secret)"
echo "Now restart your app manually"
