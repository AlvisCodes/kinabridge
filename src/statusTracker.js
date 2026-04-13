import config from './config.js';

const DEFAULT_STALENESS_WINDOW = Math.max(config.pollIntervalMs * 3, 60_000);

let lastSuccess = null;
let lastError = null;
let lastReadings = null;

export const recordKinabaseSuccess = (readings = null) => {
  lastSuccess = new Date().toISOString();
  lastError = null;
  if (readings) lastReadings = readings;
};

export const recordKinabaseFailure = (error) => {
  lastError = {
    message: error?.message || 'Unknown error',
    timestamp: new Date().toISOString(),
  };
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
  };
};
