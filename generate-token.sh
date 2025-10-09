#!/bin/bash

# Flexible Kinabase token script for dev environments
# Update these variables based on your dev setup:

# For production:
DEV_URL="https://api.kinabase.io/v1"

# For local development:
# DEV_URL="http://localhost:3000/api/v1"

# For hosted dev environment:
# DEV_URL="https://dev.kinabase.com/api/v1"

# Your credentials (update as needed):
APP_ID="7dd3bcf4-f317-4652-9f98-07ca161b543c"
SECRET="yUpAH3dXYX7pxryfSksyNg5RQq9LyZrjua0HictGQCCQU1kRuf1/sMWIfZKsjzs0zqCRtz49sJmkhhgNmZfuWQ=="

echo "🔧 Kinabase Dev Token Generator"
echo "Using endpoint: $DEV_URL/token"
echo "App ID: $APP_ID"
echo ""

# Test the dev API
RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST "$DEV_URL/token" \
    -H "Content-Type: application/json" \
    -d "{\"appId\":\"$APP_ID\",\"secret\":\"$SECRET\"}")

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*$//')

echo "HTTP Code: $HTTP_CODE"
echo "Response: $RESPONSE_BODY"

if [[ "$HTTP_CODE" == "200" ]]; then
    TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [[ -n "$TOKEN" ]]; then
        echo ""
        echo "✅ Token generated successfully!"
        echo "Token: $TOKEN"
        echo ""
        echo "Add this to your .env file:"
        echo "KINABASE_JWT=$TOKEN"
    else
        echo "❌ Failed to extract token from response"
    fi
else
    echo ""
    echo "❌ Request failed"
    echo "💡 Possible issues:"
    echo "   - Wrong endpoint URL (update DEV_URL variable)"
    echo "   - Invalid credentials (check your dev dashboard)"
    echo "   - Different auth method in dev (might use API keys instead)"
    echo ""
    echo "📝 To customize:"
    echo "   1. Edit DEV_URL variable for your dev environment"
    echo "   2. Update APP_ID and SECRET from your dev dashboard"
    echo "   3. Check if dev uses different auth method"
fi
