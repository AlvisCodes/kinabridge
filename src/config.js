import { config as loadEnv } from 'dotenv';

loadEnv();

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseIntegerEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
};

const logLevel = process.env.LOG_LEVEL
  ? process.env.LOG_LEVEL
  : process.env.NODE_ENV === 'development'
    ? 'debug'
    : 'info';

const influx = {
  url: requiredEnv('INFLUX_URL'),
  org: requiredEnv('INFLUX_ORG'),
  bucket: requiredEnv('INFLUX_BUCKET'),
  token: requiredEnv('INFLUX_READ_TOKEN'),
};

const kinabase = {
  baseUrl: process.env.KINABASE_BASE_URL || 'https://api.kinabase.io/v1',
  collection: requiredEnv('KINABASE_COLLECTION'),
  apiKey: process.env.KINABASE_API_KEY,
  apiSecret: process.env.KINABASE_API_SECRET,
  // Trim JWT token to remove any accidental whitespace
  jwt: process.env.KINABASE_JWT ? process.env.KINABASE_JWT.trim() : undefined,
};

if (!kinabase.jwt && !(kinabase.apiKey && kinabase.apiSecret)) {
  throw new Error(
    'Provide either KINABASE_JWT or both KINABASE_API_KEY and KINABASE_API_SECRET'
  );
}

const pollIntervalMs = parseIntegerEnv('POLL_INTERVAL_MS', 5000);
const stateFile = process.env.STATE_FILE || './last-run.json';

const config = {
  influx,
  kinabase,
  pollIntervalMs,
  stateFile,
  logLevel,
  defaultLookbackMs: parseIntegerEnv('DEFAULT_LOOKBACK_MS', 15 * 60 * 1000),
  controlPort: parseIntegerEnv('CONTROL_PORT', 4300),
};

export default config;
