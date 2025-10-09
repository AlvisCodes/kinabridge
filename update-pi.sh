#!/bin/bash
set -e
cd ~/Desktop/kinabridge

# Backup original .env
cp .env .env.backup

# Remove old Kinabase settings
sed -i '/^KINABASE_/d' .env

# Add correct Kinabase settings (using "Heating Sensor" app)
cat >> .env << 'EOF'
KINABASE_BASE_URL=https://app.kinabase.com/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_API_KEY=0f37a056-9519-4947-9d79-26819353d365
KINABASE_API_SECRET=esYfxRx3WtnSiF5ihYrWeEgSAxqt7pKTDwGp4HTL3kkcOEaTR2XnD8r/WkCulki13p+D08D/uI0d1oDqcKz8Vw==
EOF

echo "✓ Updated .env with 'Heating Sensor' app credentials"
echo "✓ Backup saved to .env.backup"
echo ""
echo "New Kinabase settings:"
grep "^KINABASE_" .env
echo ""
echo "Now restart your app manually"
