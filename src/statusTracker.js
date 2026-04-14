import config from './config.js';

const DEFAULT_STALENESS_WINDOW = Math.max(config.pollIntervalMs * 3, 60_000);
const MAX_ERROR_LOG = 50;

const startedAt = new Date().toISOString();
let lastSuccess = null;
let lastError = null;
let lastReadings = null;
let lastPollDurationMs = null;
let totalRecordsSent = 0;
let totalPollCycles = 0;
let totalErrors = 0;
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
  totalErrors++;
  errorLog.unshift(entry);
  if (errorLog.length > MAX_ERROR_LOG) errorLog.length = MAX_ERROR_LOG;
};

export const recordPollCycle = ({ sent = 0, durationMs = 0 } = {}) => {
  totalPollCycles++;
  totalRecordsSent += sent;
  lastPollDurationMs = durationMs;
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
    stats: {
      startedAt,
      uptimeMs: now - Date.parse(startedAt),
      totalRecordsSent,
      totalPollCycles,
      totalErrors,
      lastPollDurationMs,
      successRate: totalPollCycles > 0
        ? Math.round(((totalPollCycles - totalErrors) / totalPollCycles) * 100)
        : null,
    },
  };
};
