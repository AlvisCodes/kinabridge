#!/bin/bash
set -e
cd ~/Desktop/kinabridge

# Backup original .env
cp .env .env.backup

# Remove old Kinabase settings
sed -i '/^KINABASE_/d' .env
sed -i '/^POLL_INTERVAL_MS=/d' .env

# Add correct Kinabase settings for local dev
cat >> .env << 'EOF'
KINABASE_API_BASE_URL=https://0458-46-17-166-115.ngrok-free.app
KINABASE_COLLECTION=584f2727-8b0b-4abd-8bad-e08d767e9527
KINABASE_DEVICES_COLLECTION=1abece96-c3b3-4423-ad58-346637a0ca02
KINABASE_API_KEY=76bd4b6a-3b0e-4b58-b539-45e3e5f6f860
KINABASE_API_SECRET=tueirVPEyAWQejUYdNOlFaiFbHgwb47Y1mZ1I/apTEsgTy4II1qdr8LBjdmhVNdnGONnK9QlBjErDfdVwAVyZQ==
POLL_INTERVAL_MS=60000
EOF

echo "✓ Updated .env with local Kinabase credentials"
echo "✓ Poll interval set to 1 minute (60000ms)"
echo "✓ Using API Key/Secret for automatic token refresh"
echo "✓ Backup saved to .env.backup"
echo ""
echo "New Kinabase settings:"
grep "^KINABASE_" .env
grep "^POLL_INTERVAL_MS=" .env
echo ""
echo "Kinabase version check:"
KINABASE_API_BASE_URL="$(grep '^KINABASE_API_BASE_URL=' .env | cut -d= -f2-)"
curl -fsS "${KINABASE_API_BASE_URL}/api/v1/version" || echo "⚠️  Unable to reach /api/v1/version endpoint"
echo ""
echo "Now restart your app manually"
