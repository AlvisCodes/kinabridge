#!/bin/bash
set -e
cd ~/Desktop/kinabridge

# Backup original .env
cp .env .env.backup

# Remove old Kinabase settings
sed -i '/^KINABASE_/d' .env
sed -i '/^POLL_INTERVAL_MS=/d' .env

# Add correct Kinabase settings for beta.kinabase.com
cat >> .env << 'EOF'
KINABASE_BASE_URL=https://beta.kinabase.com/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhNWZkNTY3ZS00ZjAzLTQxNTctYTNhYi00Y2IzMzA3N2U1ZDkiLCJ0bnRpZCI6Ijk1NDJhMzE3LTQwZTUtNDk4Zi04ZDExLWRjZDFhM2UwNTI5ZCIsImFwcGlkIjoiZmYwM2Q5OWQtZGYyNC00ZjY0LWE5MjItZjE0ODZiMGVjZGZiIiwiZXhwIjoxNzYwMDk1MDQ2LCJpc3MiOiJsb2NhbGhvc3QiLCJhdWQiOiJraW5hYmFzZS5jbGllbnQifQ.7wacPCzi3Lwh3kD1jYbnFiO8Q1qjNGFt4_NoT-aZchI
KINABASE_API_KEY=ff03d99d-df24-4f64-a922-f1486b0ecdfb
KINABASE_API_SECRET=RzNygfnluStVLJ0QbrAT6btPRDbm0Xs8YCFTLd3r8Kw2Ndx/hoKUQqrDtIg/hpRrSq7jLUcWdVV/cNdfLClYOA==
POLL_INTERVAL_MS=120000
EOF

echo "✓ Updated .env with beta.kinabase.com credentials"
echo "✓ Poll interval set to 2 minutes (120000ms)"
echo "✓ Backup saved to .env.backup"
echo ""
echo "New Kinabase settings:"
grep "^KINABASE_" .env
grep "^POLL_INTERVAL_MS=" .env
echo ""
echo "Now restart your app manually"
