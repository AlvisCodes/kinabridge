import config from './config.js';

const DEFAULT_STALENESS_WINDOW = Math.max(config.pollIntervalMs * 3, 60_000);
const MAX_ERROR_LOG = 50;

let lastSuccess = null;
let lastError = null;
let lastReadings = null;
const errorLog = [];

export const recordKinabaseSuccess = (readings = null) => {
  lastSuccess = new Date().toISOString();
  lastError = null;
  if (readings) lastReadings = readings;
};

export const recordKinabaseFailure = (error) => {
  const entry = {
    message: error?.message || 'Unknown error',
    timestamp: new Date().toISOString(),
  };
  lastError = entry;
  errorLog.unshift(entry);
  if (errorLog.length > MAX_ERROR_LOG) errorLog.length = MAX_ERROR_LOG;
};

export const getKinabaseStatus = () => {
  const now = Date.now();
  const successTime = lastSuccess ? Date.parse(lastSuccess) : null;
  const connected =
    Boolean(successTime) && now - successTime <= DEFAULT_STALENESS_WINDOW;

  return {
    connected,
    lastSuccess,
    lastError,
    lastReadings,
    errorLog: errorLog.slice(0, 20),
  };
};
