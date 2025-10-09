#!/bin/bash

# Kinabase Token Generator for app.kinabase.com
# This version matches your current .env configuration

# API endpoint (matches your current KINABASE_BASE_URL)
API_URL="https://app.kinabase.com/api/v1"

# Your credentials - UPDATE THESE!
APP_ID="7dd3bcf4-f317-4652-9f98-07ca161b543c"
SECRET="yUpAH3dXYX7pxryfSksyNg5RQq9LyZrjua0HictGQCCQU1kRuf1/sMWIfZKsjzs0zqCRtz49sJmkhhgNmZfuWQ=="

echo "🔐 Kinabase Token Generator"
echo "================================"
echo "API URL: $API_URL"
echo "App ID: $APP_ID"
echo ""

# Make the token request
echo "📡 Requesting token..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/token" \
    -H "Content-Type: application/json" \
    -d "{\"appId\":\"$APP_ID\",\"secret\":\"$SECRET\"}")

# Extract HTTP code and body
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | sed 's/HTTP_CODE://g')
RESPONSE_BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Status: $HTTP_CODE"
echo ""

if [[ "$HTTP_CODE" == "200" ]]; then
    # Try to extract token using different JSON tools
    if command -v jq &> /dev/null; then
        TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.token // .jwt // empty')
    else
        # Fallback to grep if jq is not available
        TOKEN=$(echo "$RESPONSE_BODY" | grep -oE '"(token|jwt)":"[^"]*"' | head -1 | sed 's/"[^"]*":"//;s/"$//')
    fi
    
    if [[ -n "$TOKEN" && "$TOKEN" != "null" ]]; then
        echo "✅ Success! Token generated"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Token:"
        echo "$TOKEN"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📝 To update your .env file, run:"
        echo ""
        echo "   echo 'KINABASE_JWT=$TOKEN' >> .env"
        echo ""
        echo "Or manually add this line to .env:"
        echo "   KINABASE_JWT=$TOKEN"
        echo ""
        
        # Check token expiry if possible
        if command -v node &> /dev/null; then
            echo "🔍 Checking token expiry..."
            node -e "
            const token = '$TOKEN';
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
                if (payload.exp) {
                    const expiry = new Date(payload.exp * 1000);
                    const hours = Math.floor((payload.exp * 1000 - Date.now()) / (1000 * 60 * 60));
                    console.log('⏰ Expires:', expiry.toISOString(), '(in ~' + hours + ' hours)');
                }
            } catch (e) {}
            "
        fi
        
        echo ""
        echo "⚠️  Remember to restart the application after updating .env:"
        echo "   pm2 restart kinabridge"
    else
        echo "❌ Failed to extract token from response"
        echo "Response: $RESPONSE_BODY"
    fi
else
    echo "❌ Request failed with status: $HTTP_CODE"
    echo ""
    echo "Response:"
    echo "$RESPONSE_BODY"
    echo ""
    echo "💡 Possible issues:"
    echo "   1. Wrong API URL - currently using: $API_URL"
    echo "   2. Invalid App ID or Secret"
    echo "   3. Network/firewall issue"
    echo "   4. API endpoint doesn't exist at this URL"
    echo ""
    echo "🔧 Try checking:"
    echo "   - Is $API_URL the correct endpoint?"
    echo "   - Are your App ID and Secret correct?"
    echo "   - Can you reach the API? Try: curl $API_URL/health"
fi
