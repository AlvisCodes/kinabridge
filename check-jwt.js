#!/usr/bin/env node

/**
 * JWT Token Checker
 * Validates and decodes your JWT token to check expiry and claims
 */

import config from './src/config.js';

console.log('🔐 JWT Token Checker\n');

const jwt = config.kinabase.jwt;

if (!jwt) {
  console.error('❌ No JWT token found!');
  console.error('Set KINABASE_JWT environment variable\n');
  process.exit(1);
}

console.log('✅ JWT token found');
console.log('Token length:', jwt.length, 'characters\n');

// Decode JWT (without verification - just to read the payload)
try {
  const parts = jwt.split('.');
  
  if (parts.length !== 3) {
    console.error('❌ Invalid JWT format - should have 3 parts separated by dots');
    console.error('Format should be: header.payload.signature\n');
    process.exit(1);
  }
  
  console.log('✅ JWT has correct structure (3 parts)\n');
  
  // Decode payload (base64url)
  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8')
  );
  
  console.log('📋 JWT Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log();
  
  // Check expiry
  if (payload.exp) {
    const expiryDate = new Date(payload.exp * 1000);
    const now = new Date();
    const timeLeft = expiryDate - now;
    
    console.log('⏰ Token Expiry Information:');
    console.log('Expires at:', expiryDate.toISOString());
    console.log('Current time:', now.toISOString());
    
    if (timeLeft > 0) {
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`✅ Token is VALID - expires in ${hoursLeft}h ${minutesLeft}m`);
    } else {
      const hoursAgo = Math.floor(Math.abs(timeLeft) / (1000 * 60 * 60));
      const minutesAgo = Math.floor((Math.abs(timeLeft) % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`❌ Token is EXPIRED - expired ${hoursAgo}h ${minutesAgo}m ago`);
      console.log('\n⚠️  You need to generate a new JWT token!');
    }
  } else {
    console.log('⚠️  No expiry field found in token');
  }
  
  console.log();
  
  // Check issued at
  if (payload.iat) {
    const issuedDate = new Date(payload.iat * 1000);
    console.log('📅 Token issued at:', issuedDate.toISOString());
  }
  
  // Check subject/user
  if (payload.sub) {
    console.log('👤 Subject (user):', payload.sub);
  }
  
  // Check audience
  if (payload.aud) {
    console.log('🎯 Audience:', payload.aud);
  }
  
  console.log();
  
  // Recommendations
  if (payload.exp && new Date(payload.exp * 1000) < new Date()) {
    console.log('🔧 TO FIX:');
    console.log('1. Generate a new JWT token using: ./generate-token.sh');
    console.log('2. Or update .env with a new KINABASE_JWT value');
    console.log('3. Restart the application');
  } else {
    console.log('💡 Token appears valid. If still getting 401 errors, check:');
    console.log('1. Is the token for the correct Kinabase environment?');
    console.log('2. Does the token have permissions for the collection?');
    console.log('3. Is the Kinabase API URL correct?');
    console.log('   Current URL:', config.kinabase.baseUrl);
  }
  
} catch (error) {
  console.error('❌ Error decoding JWT:', error.message);
  console.error('\nThe token might be corrupted or in an invalid format');
  process.exit(1);
}
