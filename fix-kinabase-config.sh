#!/bin/bash

# Fix Kinabase Configuration Script
# This will update your .env file with the correct settings

set -e

echo "🔧 Kinabase Configuration Fixer"
echo "================================"
echo ""

ENV_FILE=".env"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

echo "📋 Current configuration:"
echo "  URL: $(grep KINABASE_BASE_URL $ENV_FILE | cut -d= -f2)"
echo "  Has JWT: $(grep -q KINABASE_JWT $ENV_FILE && echo 'Yes' || echo 'No')"
echo "  Has API Key: $(grep -q KINABASE_API_KEY $ENV_FILE && echo 'Yes' || echo 'No')"
echo ""

# Create backup
BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"
echo ""

# Fix 1: Update the base URL
echo "🔧 Fix 1: Updating KINABASE_BASE_URL..."
if grep -q "KINABASE_BASE_URL=https://api.kinabase.com" "$ENV_FILE"; then
    # Wrong URL - fix it
    sed -i.tmp 's|KINABASE_BASE_URL=https://api.kinabase.com/api/v1|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g' "$ENV_FILE"
    rm -f "$ENV_FILE.tmp"
    echo "  ✅ Updated URL to: https://app.kinabase.com/api/v1"
elif grep -q "KINABASE_BASE_URL=https://app.kinabase.com" "$ENV_FILE"; then
    echo "  ✅ URL is already correct: https://app.kinabase.com/api/v1"
else
    # URL might be missing or different
    CURRENT_URL=$(grep KINABASE_BASE_URL $ENV_FILE | cut -d= -f2)
    echo "  ⚠️  Current URL: $CURRENT_URL"
    echo "  ⚠️  This doesn't match expected values"
    echo ""
    read -p "  Update to https://app.kinabase.com/api/v1? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sed -i.tmp "s|KINABASE_BASE_URL=.*|KINABASE_BASE_URL=https://app.kinabase.com/api/v1|g" "$ENV_FILE"
        rm -f "$ENV_FILE.tmp"
        echo "  ✅ Updated URL"
    else
        echo "  ⏭️  Skipped URL update"
    fi
fi
echo ""

# Fix 2: Remove JWT if API Key/Secret exist
echo "🔧 Fix 2: Checking authentication method..."
if grep -q "KINABASE_API_KEY" "$ENV_FILE" && grep -q "KINABASE_API_SECRET" "$ENV_FILE"; then
    echo "  ✅ API Key and Secret found"
    
    if grep -q "KINABASE_JWT" "$ENV_FILE"; then
        echo "  ⚠️  JWT token also present (causes conflict)"
        echo ""
        echo "  💡 You have both JWT and API Key/Secret."
        echo "     API Key/Secret is better because:"
        echo "     - Automatically handles token refresh"
        echo "     - Tokens don't expire"
        echo "     - More secure for long-running services"
        echo ""
        read -p "  Remove KINABASE_JWT and use API Key/Secret? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Comment out the JWT line
            sed -i.tmp 's/^KINABASE_JWT=/#KINABASE_JWT=/g' "$ENV_FILE"
            rm -f "$ENV_FILE.tmp"
            echo "  ✅ Commented out KINABASE_JWT"
            echo "     (You can uncomment it later if needed)"
        else
            echo "  ⏭️  Kept KINABASE_JWT"
            echo "  ⚠️  Note: JWT takes precedence over API Key/Secret"
        fi
    else
        echo "  ✅ No JWT present - will use API Key/Secret"
    fi
else
    echo "  ⚠️  No API Key/Secret found"
    if grep -q "KINABASE_JWT" "$ENV_FILE"; then
        echo "  ℹ️  Will use JWT token"
    else
        echo "  ❌ No authentication method configured!"
    fi
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Configuration updated!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📋 New configuration:"
grep "KINABASE_BASE_URL" "$ENV_FILE"
if grep -q "^KINABASE_JWT=" "$ENV_FILE"; then
    echo "Authentication: JWT Token"
elif grep -q "^KINABASE_API_KEY=" "$ENV_FILE"; then
    echo "Authentication: API Key/Secret (automatic token management)"
fi
echo ""

# Test the connection
echo "🧪 Testing connection..."
if command -v node &> /dev/null; then
    if [[ -f "test-api-connection.js" ]]; then
        echo ""
        node test-api-connection.js
    else
        echo "  ℹ️  test-api-connection.js not found, skipping test"
    fi
else
    echo "  ℹ️  Node.js not found, skipping test"
fi

echo ""
echo "🚀 Next steps:"
echo "   1. Review the changes above"
echo "   2. Restart your application:"
echo "      pm2 restart kinabridge"
echo "   3. Check logs:"
echo "      pm2 logs kinabridge"
echo ""
echo "💾 A backup was saved to: $BACKUP_FILE"
echo "   To restore: cp $BACKUP_FILE .env"
