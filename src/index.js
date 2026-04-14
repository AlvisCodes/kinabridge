import process from 'process';
import { exec } from 'child_process';
import config from './config.js';
import logger from './logger.js';
import { loadState, setLastTimestamp, setBridgeEnabled } from './stateStore.js';
import { fetchNewPoints } from './influxClient.js';
import { toKinabaseRecords } from './transform.js';
import { createTokenProvider } from './kinabaseAuth.js';
import KinabaseClient from './kinabaseClient.js';
import { ensureDevice, refreshDeviceHeartbeat } from './deviceManager.js';
import startControlServer from './controlServer.js';
import {
  recordKinabaseFailure,
  recordKinabaseSuccess,
  getKinabaseStatus,
} from './statusTracker.js';

const args = process.argv.slice(2);
const runOnce = args.includes('--once') || args.includes('--run-once');
const noBrowser = args.includes('--no-browser');

let isPolling = false;
let interrupted = false;

/**
 * Opens a URL in the default browser.
 * Works cross-platform (macOS, Linux, Windows).
 */
const openBrowser = (url) => {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = `open ${url}`;
  } else if (platform === 'win32') {
    command = `start ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }

  exec(command, (error) => {
    if (error) {
      logger.debug({ err: error }, 'Could not auto-open browser');
    } else {
      logger.info(`✓ Opened ${url} in browser`);
    }
  });
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

// Start the control server and optionally open browser
const { port } = startControlServer({
  stateProvider: loadState,
  setBridgeEnabled,
  statusProvider: getKinabaseStatus,
});

if (!runOnce && !noBrowser) {
  // Wait a moment for server to be ready, then open browser
  setTimeout(() => {
    openBrowser(`http://localhost:${port}`);
  }, 1000);
}

const start = async () => {
  // Create and validate token provider at startup
  const tokenProvider = createTokenProvider();
  const kinabaseClient = new KinabaseClient({ tokenProvider });

  try {
    const token = await tokenProvider();
    if (!token || typeof token !== 'string') {
      throw new Error('tokenProvider returned invalid token');
    }
    logger.info('✓ Token provider initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize token provider - check your Kinabase credentials');
    throw error;
  }

  // Ensure the device record exists in Kinabase (create if missing)
  try {
    const deviceId = await ensureDevice(kinabaseClient);
    logger.info({ deviceId }, '✓ Device record ready');
  } catch (error) {
    logger.error({ err: error }, 'Failed to ensure device record in Kinabase');
    throw error;
  }

  // Start polling
  const poll = async () => {
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

      // Update device heartbeat each cycle
      try {
        await refreshDeviceHeartbeat(kinabaseClient);
      } catch (heartbeatErr) {
        logger.warn({ err: heartbeatErr }, 'Device heartbeat update failed');
        recordKinabaseFailure(new Error(`Device heartbeat: ${heartbeatErr.message}`));
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

      // Log what InfluxDB gave us
      const influxFields = records.length > 0
        ? [...new Set(records.flatMap(r => Object.keys(r.fields || {})))]
        : [];
      logger.info(
        { influxRecords: records.length, influxFields, latestTimestamp },
        `Fetched ${records.length} record(s) from InfluxDB with fields: ${influxFields.join(', ')}`
      );

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

      // Log what we're about to send to Kinabase
      const outFields = kinabaseRecords.length > 0
        ? Object.keys(kinabaseRecords[0].data)
        : [];
      logger.info(
        { kinabaseRecords: kinabaseRecords.length, outFields, fieldCount: outFields.length },
        `Sending ${kinabaseRecords.length} record(s) to Kinabase with ${outFields.length} fields: ${outFields.join(', ')}`
      );

      let sent = 0;
      try {
        const result = await kinabaseClient.upsertRecords(kinabaseRecords);
        sent = result.sent;

        // Record each error from the upsert cycle
        if (result.errors?.length > 0) {
          for (const err of result.errors) {
            recordKinabaseFailure(err);
          }
        }

        // Only mark success if at least some records went through AND no errors
        if (sent > 0 && (!result.errors || result.errors.length === 0)) {
          const latestData = kinabaseRecords.length > 0 ? kinabaseRecords[kinabaseRecords.length - 1].data : null;
          recordKinabaseSuccess(latestData);
        } else if (sent > 0) {
          // Partial success — still cache readings but don't clear lastError
          const latestData = kinabaseRecords.length > 0 ? kinabaseRecords[kinabaseRecords.length - 1].data : null;
          recordKinabaseSuccess(latestData);
          logger.warn(
            { sent, errorCount: result.errors.length },
            'Partial success — some records synced but errors occurred'
          );
        } else if (result.errors?.length > 0) {
          logger.error(
            { errorCount: result.errors.length },
            'All records failed to sync — check error log'
          );
        }
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

  if (runOnce) {
    await poll();
    return;
  }

  // Run initial poll
  logger.info('🚀 Starting Kinabase bridge - initial sync...');
  await poll();

  // Set up recurring polling
  const intervalMinutes = Math.round(config.pollIntervalMs / 60000);
  logger.info(
    { intervalMs: config.pollIntervalMs, intervalMinutes },
    `📊 Polling every ${intervalMinutes} minute(s) for sensor updates`
  );

  setInterval(async () => {
    await poll();
  }, config.pollIntervalMs);
};

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start Kinabase bridge');
  process.exit(1);
});
