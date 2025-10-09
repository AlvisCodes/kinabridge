#!/bin/bash
# Update Kinabase JWT Token
# Run this script on the Raspberry Pi after pulling the latest code

set -e

echo "🔄 Updating Kinabase JWT token..."

# New JWT token (expires 2025-12-09)
NEW_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2OTYxNDBhOS03YmViLTQ1OTUtYWU3My03NzMyOWE1MjYwZGUiLCJ0bnRpZCI6IjA4MWQxY2M4LWRhNTEtNDU1Ny1hODgwLTFmZWI5ZTIxMzFiNCIsImFwcGlkIjoiOWI4YWMzN2EtNDBlNS00YmYyLWJlNmQtYTkyNzBjNzcyMzFmIiwiZXhwIjoxNzYwMDI2MTg0LCJpc3MiOiJsb2NhbGhvc3QiLCJhdWQiOiJraW5hYmFzZS5jbGllbnQifQ.Hr2WMJkGwRxxqZYn6nUhfI8csaWDMBLKdB-OcfHbJK4"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in current directory"
    echo "   Make sure you're running this from the kinabridge directory"
    exit 1
fi

# Backup existing .env
cp .env .env.backup
echo "✅ Backed up .env to .env.backup"

# Update the JWT token in .env
if grep -q "^KINABASE_JWT=" .env; then
    # Replace existing JWT line
    sed -i.tmp "s|^KINABASE_JWT=.*|KINABASE_JWT=${NEW_JWT}|" .env
    rm -f .env.tmp
    echo "✅ Updated KINABASE_JWT in .env"
else
    # Add JWT if it doesn't exist
    echo "KINABASE_JWT=${NEW_JWT}" >> .env
    echo "✅ Added KINABASE_JWT to .env"
fi

echo ""
echo "✨ JWT token updated successfully!"
echo "📅 New token expires: December 9, 2025"
echo ""
echo "Next steps:"
echo "  1. Restart the bridge: pm2 restart kinabase-bridge"
echo "     (or Ctrl+C and 'npm start' if running manually)"
echo ""
