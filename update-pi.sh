#!/bin/bash
set -e
cd ~/Desktop/kinabridge
sed -i 's|KINABASE_BASE_URL=.*|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g' .env
sed -i 's|KINABASE_COLLECTION=.*|KINABASE_COLLECTION=sensor-readings|g' .env
sed -i 's|KINABASE_API_KEY=.*|KINABASE_API_KEY=9b8ac37a-40e5-4bf2-be6d-a9270c77231f|g' .env
sed -i 's|KINABASE_API_SECRET=.*|KINABASE_API_SECRET=dHwT0Tg8fAKRuJGUS1vZfRz/RX0rQVhjGQbIVuxY+bzNGRKZ9NYmLlJ7blE8gTpbKyJVn3nheaHFXowAUKNx/w==|g' .env
sed -i '/^KINABASE_JWT=/d' .env
echo "✓ Updated .env with correct API credentials"
echo "Now restart your app manually"
