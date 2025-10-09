# Token Provider Pattern

## Overview

The Kinabase bridge uses a **token provider function** pattern for authentication. This pattern allows for flexible token management, including caching and automatic refresh.

## Important: Function, Not Object

⚠️ **The token provider is a FUNCTION that returns a token, NOT an object with methods.**

### ❌ WRONG
```javascript
// DO NOT do this:
const tokenProvider = {
  getToken: async () => { ... }
};
```

### ✅ CORRECT
```javascript
// Do this instead:
const tokenProvider = async () => {
  return 'your-jwt-token';
};
```

## How It Works

### 1. Create the Token Provider

The `createTokenProvider()` function from `kinabaseAuth.js` returns a function:

```javascript
import { createTokenProvider } from './kinabaseAuth.js';

// This returns a FUNCTION, not an object
const tokenProvider = createTokenProvider();

// You can call it directly to get a token
const token = await tokenProvider();
```

### 2. Pass to KinabaseClient

```javascript
import KinabaseClient from './kinabaseClient.js';

// Pass the function directly
const client = new KinabaseClient({ tokenProvider });
```

### 3. KinabaseClient Uses It

Internally, `KinabaseClient` calls the function directly:

```javascript
async #authorizedRequest(method, path, body = null) {
  // Call the function to get the token
  const token = await this.#tokenProvider();
  // ... use token for authorization
}
```

## Token Provider Behavior

### With JWT Environment Variable

If `KINABASE_JWT` is set, the provider returns a simple function that always returns that token:

```javascript
return async () => token;
```

### With API Key/Secret

If using `KINABASE_API_KEY` and `KINABASE_API_SECRET`, the provider includes caching logic:

```javascript
return async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && cachedToken && Date.now() < cachedExpiry) {
    return cachedToken;
  }
  // Fetch new token...
};
```

## Validation

The `KinabaseClient` constructor validates that you're passing a function:

```javascript
if (typeof tokenProvider !== 'function') {
  throw new TypeError(
    'tokenProvider must be a function that returns a Promise<string> (the JWT token)'
  );
}
```

## Common Mistakes

### Mistake 1: Passing an Object

```javascript
// ❌ WRONG - This will fail
const client = new KinabaseClient({ 
  tokenProvider: {
    getToken: async () => 'token'
  }
});
```

### Mistake 2: Calling getToken() on the Function

```javascript
// ❌ WRONG - tokenProvider is already a function, not an object
const token = await tokenProvider.getToken();

// ✅ CORRECT - Call it directly
const token = await tokenProvider();
```

## Summary

- `createTokenProvider()` returns a **function**
- Pass that **function** to `KinabaseClient`
- KinabaseClient calls the **function** directly (not a method on an object)
- The function returns a Promise that resolves to a JWT token string
