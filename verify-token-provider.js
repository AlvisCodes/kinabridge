#!/usr/bin/env node

/**
 * Verification script to ensure tokenProvider is correctly implemented
 * Run this to validate the fix before deploying
 */

import { createTokenProvider } from './src/kinabaseAuth.js';
import KinabaseClient from './src/kinabaseClient.js';

console.log('🔍 Verifying tokenProvider implementation...\n');

// Test 1: Check that createTokenProvider returns a function
console.log('✓ Test 1: Checking createTokenProvider returns a function');
try {
  const tokenProvider = createTokenProvider();
  if (typeof tokenProvider !== 'function') {
    throw new Error('createTokenProvider did not return a function');
  }
  console.log('  ✅ Pass: tokenProvider is a function\n');
} catch (error) {
  console.error('  ❌ Fail:', error.message);
  process.exit(1);
}

// Test 2: Check that tokenProvider can be called
console.log('✓ Test 2: Checking tokenProvider can be called');
try {
  const tokenProvider = createTokenProvider();
  const tokenPromise = tokenProvider();
  if (!(tokenPromise instanceof Promise)) {
    throw new Error('tokenProvider() did not return a Promise');
  }
  console.log('  ✅ Pass: tokenProvider() returns a Promise\n');
} catch (error) {
  console.error('  ❌ Fail:', error.message);
  process.exit(1);
}

// Test 3: Check that KinabaseClient validates input
console.log('✓ Test 3: Checking KinabaseClient validates tokenProvider');
try {
  // This should throw an error
  new KinabaseClient({ tokenProvider: { getToken: async () => 'token' } });
  console.error('  ❌ Fail: KinabaseClient accepted an object instead of a function');
  process.exit(1);
} catch (error) {
  if (error instanceof TypeError && error.message.includes('must be a function')) {
    console.log('  ✅ Pass: KinabaseClient correctly rejects non-function input\n');
  } else {
    console.error('  ❌ Fail: Unexpected error:', error.message);
    process.exit(1);
  }
}

// Test 4: Check that KinabaseClient accepts correct input
console.log('✓ Test 4: Checking KinabaseClient accepts function input');
try {
  const tokenProvider = createTokenProvider();
  const client = new KinabaseClient({ tokenProvider });
  console.log('  ✅ Pass: KinabaseClient accepts function tokenProvider\n');
} catch (error) {
  console.error('  ❌ Fail:', error.message);
  process.exit(1);
}

// Test 5: Check that tokenProvider returns a string token
console.log('✓ Test 5: Checking tokenProvider returns a valid token');
try {
  const tokenProvider = createTokenProvider();
  const token = await tokenProvider();
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('tokenProvider did not return a valid string token');
  }
  console.log('  ✅ Pass: tokenProvider returns a valid token string\n');
} catch (error) {
  console.error('  ❌ Fail:', error.message);
  console.error('  Note: This may fail if Kinabase credentials are not configured');
  process.exit(1);
}

console.log('✅ All verification tests passed!');
console.log('The tokenProvider implementation is correct and ready to use.');
