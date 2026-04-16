#!/usr/bin/env node

/**
 * Kinabase API Connection Tester
 * Tests the actual API connection and authentication
 */

import fetch from 'node-fetch';
import config from './src/config.js';

console.log('🌐 Kinabase API Connection Tester\n');

const baseUrl = config.kinabase.baseUrl;
const token = config.kinabase.jwt;
const collection = config.kinabase.collection;

console.log('Configuration:');
console.log('Base URL:', baseUrl);
console.log('Collection:', collection);
console.log('Token:', token ? `${token.substring(0, 20)}...` : 'NOT SET');
console.log();

// Test 1: Check if base URL is reachable
console.log('Test 1: Checking if base URL is reachable...');
try {
  const healthUrl = baseUrl.replace(/\/v\d+$/, '/health');
  console.log('Trying:', healthUrl);
  
  const response = await fetch(healthUrl, {
    method: 'GET',
    timeout: 5000,
  });
  
  console.log('Status:', response.status);
  
  if (response.ok) {
    console.log('✅ Base URL is reachable\n');
  } else {
    console.log('⚠️  Base URL returned non-OK status\n');
  }
} catch (error) {
  console.error('❌ Cannot reach base URL:', error.message);
  console.log('   This might be a network issue or wrong URL\n');
}

// Test 2: Test authentication with a simple GET request
console.log('Test 2: Testing authentication...');
const testUrl = `${baseUrl}/collections/${collection}`;
console.log('GET', testUrl);

try {
  const response = await fetch(testUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  
  console.log('Status:', response.status, response.statusText);
  
  if (response.ok) {
    console.log('✅ Authentication successful!');
    const data = await response.json();
    console.log('Collection info:', JSON.stringify(data, null, 2));
  } else if (response.status === 401) {
    console.log('❌ Authentication FAILED (401 Unauthorized)');
    
    const body = await response.text();
    console.log('Response body:', body || '(empty)');
    
    console.log('\n🔍 Possible causes:');
    console.log('1. Token is for a different Kinabase instance/environment');
    console.log('   - Your token is for: kinabase.client (from JWT payload)');
    console.log('   - Your API URL is:', baseUrl);
    console.log('   - Make sure these match!');
    console.log();
    console.log('2. Token was generated for a different API version');
    console.log('   - Try changing KINABASE_API_BASE_URL in .env (preferred), or KINABASE_BASE_URL (legacy)');
    console.log();
    console.log('3. Token has been revoked or invalidated');
    console.log('   - Generate a new token with: ./generate-token.sh');
    console.log();
    console.log('4. Wrong authorization header format');
    console.log('   - Current format: Bearer <token>');
  } else if (response.status === 404) {
    console.log('❌ Collection not found (404)');
    console.log(`   The collection "${collection}" doesn't exist or you don't have access to it`);
    
    const body = await response.text();
    console.log('Response body:', body || '(empty)');
  } else {
    console.log('❌ Unexpected status code');
    const body = await response.text();
    console.log('Response body:', body || '(empty)');
  }
} catch (error) {
  console.error('❌ Request failed:', error.message);
  console.log('   This is likely a network or connection issue');
}

console.log();

// Test 3: Try the specific endpoint that's failing
console.log('Test 3: Testing the exact endpoint that\'s failing...');
const externalEndpoint = `${baseUrl}/collections/${collection}/ext/influxdb/MachineNameHere`;
console.log('PATCH', externalEndpoint);

try {
  const testData = {
    data: {
      machine: "MachineNameHere",
      humidity: 50,
      temperature: 20,
      timestamp: new Date().toISOString()
    }
  };
  
  const response = await fetch(externalEndpoint, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testData),
    timeout: 10000,
  });
  
  console.log('Status:', response.status, response.statusText);
  
  if (response.ok) {
    console.log('✅ PATCH request successful!');
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } else if (response.status === 401) {
    console.log('❌ Authentication failed on PATCH request');
    const body = await response.text();
    console.log('Response body:', body || '(empty)');
  } else if (response.status === 404) {
    console.log('ℹ️  Record doesn\'t exist yet (404) - this is expected');
    console.log('   The app would normally create it with POST');
  } else {
    const body = await response.text();
    console.log('Response body:', body || '(empty)');
  }
} catch (error) {
  console.error('❌ Request failed:', error.message);
}

console.log('\n✨ Test complete!');
