import config from './config.js';

const DEFAULT_STALENESS_WINDOW = Math.max(config.pollIntervalMs * 3, 60_000);

let lastSuccess = null;
let lastError = null;

export const recordKinabaseSuccess = () => {
  lastSuccess = new Date().toISOString();
  lastError = null;
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
  };
};
