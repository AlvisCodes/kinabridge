#!/bin/bash
set -e
cd ~/Desktop/kinabridge

# Backup original .env
cp .env .env.backup

# Remove old Kinabase settings
sed -i '/^KINABASE_/d' .env

# Add correct Kinabase settings for local dev environment
cat >> .env << 'EOF'
KINABASE_BASE_URL=http://localhost:3000/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_API_KEY=9b8ac37a-40e5-4bf2-be6d-a9270c77231f
KINABASE_API_SECRET=dHwT0Tg8fAKRuJGUS1vZfRz/RX0rQVhjGQbIVuxY+bzNGRKZ9NYmLlJ7blE8gTpbKyJVn3nheaHFXowAUKNx/w==
EOF

echo "✓ Updated .env with localhost Kinabase credentials"
echo "✓ Backup saved to .env.backup"
echo ""
echo "New Kinabase settings:"
grep "^KINABASE_" .env
echo ""
echo "Now restart your app manually"
