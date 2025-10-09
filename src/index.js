import process from 'process';
import config from './config.js';
import logger from './logger.js';
import { loadState, setLastTimestamp, setBridgeEnabled } from './stateStore.js';
import { fetchNewPoints } from './influxClient.js';
import { toKinabaseRecords } from './transform.js';
import { createTokenProvider } from './kinabaseAuth.js';
import KinabaseClient from './kinabaseClient.js';
import startControlServer from './controlServer.js';
import {
  recordKinabaseFailure,
  recordKinabaseSuccess,
  getKinabaseStatus,
} from './statusTracker.js';

const args = process.argv.slice(2);
const runOnce = args.includes('--once') || args.includes('--run-once');

// Create and validate token provider
const tokenProvider = createTokenProvider();
const kinabaseClient = new KinabaseClient({ tokenProvider });

// Validate tokenProvider works correctly at startup
(async () => {
  try {
    const token = await tokenProvider();
    if (!token || typeof token !== 'string') {
      throw new Error('tokenProvider returned invalid token');
    }
    logger.info('Token provider initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize token provider - check your Kinabase credentials');
    process.exit(1);
  }
})();

let isPolling = false;
let interrupted = false;

const pollOnce = async () => {
  if (isPolling) {
    logger.warn('Skipping poll because previous cycle is still running');
    return;
  }

  isPolling = true;

  try {
    const state = await loadState();

    if (!state.bridgeEnabled) {
      logger.info('Bridge toggled off; skipping Kinabase sync this cycle');
      return;
    }

    const lastTimestamp = state.lastTimestamp;

    logger.debug(
      { lastTimestamp },
      'Starting Kinabase bridge poll cycle'
    );

    const { records, latestTimestamp } = await fetchNewPoints({
      since: lastTimestamp,
    });

    if (!records.length) {
      logger.info('No new humidity sensor records to process');
      return;
    }

    const kinabaseRecords = toKinabaseRecords(records);

    if (!kinabaseRecords.length) {
      logger.warn(
        'Fetched records but nothing was transformed for Kinabase; check transform rules'
      );
      if (latestTimestamp) {
        await setLastTimestamp(latestTimestamp);
      }
      return;
    }

    let sent = 0;
    try {
      const result = await kinabaseClient.upsertRecords(kinabaseRecords);
      sent = result.sent;
      recordKinabaseSuccess();
    } catch (error) {
      recordKinabaseFailure(error);
      throw error;
    }

    if (sent > 0 && latestTimestamp) {
      await setLastTimestamp(latestTimestamp);
      logger.info(
        { sent, latestTimestamp },
        'Uploaded records to Kinabase and updated state'
      );
    } else {
      logger.info('No records sent to Kinabase during this cycle');
    }
  } catch (error) {
    recordKinabaseFailure(error);
    logger.error({ err: error }, 'Kinabase bridge poller encountered an error');
  } finally {
    isPolling = false;
  }
};

const handleExit = async (signal) => {
  if (interrupted) {
    process.exit(1);
    return;
  }

  interrupted = true;
  logger.info({ signal }, 'Received shutdown signal, finishing current cycle');
  if (isPolling) {
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!isPolling) {
          clearInterval(interval);
          resolve();
        }
      }, 250);
    });
  }
  process.exit(0);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

startControlServer({
  stateProvider: loadState,
  setBridgeEnabled,
  statusProvider: getKinabaseStatus,
});

const start = async () => {
  if (runOnce) {
    await pollOnce();
    return;
  }

  await pollOnce();

  setInterval(async () => {
    await pollOnce();
  }, config.pollIntervalMs);
};

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start Kinabase bridge');
  process.exit(1);
});
