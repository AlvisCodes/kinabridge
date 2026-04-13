/**
 * Kinabase Authentication Module
 * 
 * This module handles JWT token generation and automatic refresh for Kinabase API authentication.
 * 
 * Features:
 * - Automatically generates JWT tokens from API Key/Secret
 * - Caches tokens and refreshes them 1 minute before expiry
 * - Runs indefinitely without manual token management
 * 
 * Configuration:
 * - Set KINABASE_API_KEY and KINABASE_API_SECRET in .env for auto-refresh
 * - OR set KINABASE_JWT for manual token (no auto-refresh)
 */

import fetch from 'node-fetch';
import config from './config.js';
import logger from './logger.js';

const TOKEN_PATH = '/token';

const buildTokenUrl = () => {
  const base = config.kinabase.baseUrl.replace(/\/+$/, '');
  return `${base}${TOKEN_PATH}`;
};

const requestNewToken = async () => {
  const { apiKey, apiSecret } = config.kinabase;

  if (!(apiKey && apiSecret)) {
    throw new Error(
      'Cannot request Kinabase token without KINABASE_API_KEY and KINABASE_API_SECRET'
    );
  }

  const url = buildTokenUrl();

  logger.debug({ url, appId: apiKey }, 'Requesting new Kinabase JWT using API key and secret');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({
      appId: apiKey,
      secret: apiSecret,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    logger.error({ status: response.status, message }, 'Failed to generate JWT token');
    throw new Error(
      `Failed to obtain Kinabase token (${response.status}): ${message}\n` +
      `Check your KINABASE_API_KEY and KINABASE_API_SECRET are correct.`
    );
  }

  const payload = await response.json();
  if (!payload.token && !payload.jwt) {
    throw new Error('Kinabase token response did not include token property');
  }

  const token = payload.token || payload.jwt;
  const expiresIn = payload.expiresIn || payload.expires_in;
  const expiryMs = expiresIn
    ? Date.now() + Number(expiresIn) * 1000 - 60_000 // Refresh 1 minute before expiry
    : Date.now() + 50 * 60 * 1000; // Default: 50 minutes

  const expiryDate = new Date(expiryMs + 60_000); // Add back the 1 minute buffer for display
  logger.info(
    { expiresAt: expiryDate.toISOString(), expiresInSeconds: expiresIn },
    '✓ JWT token received, will auto-refresh before expiry'
  );

  return {
    token,
    expiryMs,
  };
};

/**
 * Creates a token provider function for Kinabase authentication.
 * 
 * @returns {Function} An async function that returns a JWT token string.
 *   - If KINABASE_JWT is set, returns that token directly.
 *   - Otherwise, fetches and caches tokens using API key/secret.
 *   - The function accepts an optional { forceRefresh: boolean } parameter.
 * 
 * @throws {Error} If neither JWT nor API key/secret are configured.
 * 
 * @example
 * const tokenProvider = createTokenProvider();
 * const token = await tokenProvider(); // Returns JWT string
 * const freshToken = await tokenProvider({ forceRefresh: true });
 */
export const createTokenProvider = () => {
  if (config.kinabase.jwt) {
    logger.info('✓ Using manually provided JWT token from KINABASE_JWT');
    const token = config.kinabase.jwt;
    return async () => token;
  }

  if (!(config.kinabase.apiKey && config.kinabase.apiSecret)) {
    throw new Error(
      'Configure either KINABASE_JWT or both KINABASE_API_KEY and KINABASE_API_SECRET'
    );
  }

  logger.info('✓ Using API Key/Secret authentication - tokens will be generated automatically');

  let cachedToken = null;
  let cachedExpiry = 0;

  return async ({ forceRefresh = false } = {}) => {
    const now = Date.now();
    
    if (!forceRefresh && cachedToken && now < cachedExpiry) {
      const timeUntilExpiry = Math.round((cachedExpiry - now) / 60000);
      logger.debug(`Using cached token (expires in ~${timeUntilExpiry} minutes)`);
      return cachedToken;
    }

    if (cachedToken) {
      logger.info('🔄 Token expired or expiring soon, refreshing automatically...');
    } else {
      logger.info('🔑 Generating initial JWT token from API Key/Secret...');
    }
    
    const { token, expiryMs } = await requestNewToken();
    cachedToken = token;
    cachedExpiry = expiryMs;
    return cachedToken;
  };
};
