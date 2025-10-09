#!/bin/bash
set -e
cd ~/Desktop/kinabridge

# Backup original .env
cp .env .env.backup

# Remove old Kinabase settings
sed -i '/^KINABASE_/d' .env

# Add correct Kinabase settings with JWT token
cat >> .env << 'EOF'
KINABASE_BASE_URL=http://localhost:3000/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmOTg0ZGU2Ni05NDM1LTRiYTYtYmFjYy01NWJjYzczYjVjYjUiLCJ0bnRpZCI6IjA4MWQxY2M4LWRhNTEtNDU1Ny1hODgwLTFmZWI5ZTIxMzFiNCIsImFwcGlkIjoiMzU0YWRjOGYtYTQxYy00ZDhlLWIzYTUtNmMzN2ZlOTliYmUxIiwiZXhwIjoxNzYwMDMwMDg5LCJpc3MiOiJsb2NhbGhvc3QiLCJhdWQiOiJraW5hYmFzZS5jbGllbnQifQ.PeOSnkY0qwO4kjl3UnTOih-P2WtGObGKhLfCgsUVHCw
KINABASE_API_KEY=354adc8f-a41c-4d8e-b3a5-6c37fe99bbe1
KINABASE_API_SECRET=MKtGJ9Z8vI++DbLLmenUUp9qSai+PKl/nD2q2I7GJCz8KwFcXFTh83WBRTT5PJjLBBedu/VHfWYkODS1ebj4gg==
EOF

echo "✓ Updated .env with JWT token and API credentials"
echo "✓ Backup saved to .env.backup"
echo ""
echo "New Kinabase settings:"
grep "^KINABASE_" .env
echo ""
echo "Now restart your app manually"
