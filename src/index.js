import process from 'process';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import config from './config.js';
import logger from './logger.js';
import { loadState, setLastTimestamp, setBridgeEnabled } from './stateStore.js';
import { fetchNewPoints } from './influxClient.js';
import { toKinabaseRecords } from './transform.js';
import { createTokenProvider } from './kinabaseAuth.js';
import KinabaseClient from './kinabaseClient.js';
import { ensureDevice, refreshDeviceHeartbeat } from './deviceManager.js';
import startControlServer from './controlServer.js';
import connectionMonitor from './connectionMonitor.js';
import {
  recordKinabaseFailure,
  recordKinabaseSuccess,
  recordPollCycle,
  getKinabaseStatus,
} from './statusTracker.js';

/**
 * Determines whether an error is caused by the upstream server being
 * unreachable (network-level) rather than an application-level issue
 * (bad credentials, validation errors, etc.).
 */
const isUpstreamError = (error) => {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '');

  // Node.js system-level socket / DNS errors
  if (/^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN)$/i.test(code)) {
    return true;
  }
  // AbortSignal.timeout() fires a TimeoutError
  if (error.name === 'TimeoutError') return true;
  // Fetch-level failures
  if (msg.includes('fetch failed') || msg.includes('socket hang up') || msg.includes('other side closed')) {
    return true;
  }
  // ngrok returns 502/504 when the upstream server is down
  if (/\b50[24]\b/.test(msg)) return true;
  // ngrok returns an HTML error page with ERR_NGROK when the endpoint is offline
  if (msg.includes('err_ngrok') || (msg.includes('ngrok') && msg.includes('offline'))) return true;

  return false;
};

const args = process.argv.slice(2);
const runOnce = args.includes('--once') || args.includes('--run-once');
const noBrowser = args.includes('--no-browser');

let isPolling = false;
let interrupted = false;

// Global crash safety — log and exit on unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception — shutting down');
  process.exit(1);
});

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

const SHUTDOWN_TIMEOUT_MS = 10_000;

const handleExit = async (signal) => {
  if (interrupted) {
    process.exit(1);
    return;
  }

  interrupted = true;
  logger.info({ signal }, 'Received shutdown signal, finishing current cycle');

  // Hard deadline — force exit if graceful shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  connectionMonitor.stop();

  // Close HTTP server to stop accepting new connections
  if (controlServer) {
    controlServer.close(() => logger.info('HTTP server closed'));
  }

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
const { port, server: controlServer, registerPollCallback } = startControlServer({
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
  // ── Connection monitor — detect upstream availability ──
  await connectionMonitor.start();

  const tokenProvider = createTokenProvider();
  const kinabaseClient = new KinabaseClient({ tokenProvider });

  // ── Resilient initialisation ───────────────────────────
  // Retry token validation + device setup whenever the server is
  // temporarily unreachable.  Non-network errors (bad credentials
  // etc.) still fail fast so the operator can fix them.
  const initialize = async () => {
    let attempt = 0;
    while (!interrupted) {
      if (!connectionMonitor.connected) {
        logger.info('⏸ Kinabase server is unreachable — waiting for connection before starting…');
        await connectionMonitor.waitForConnection();
        if (interrupted) return;
      }

      attempt++;
      try {
        // Validate token
        const token = await tokenProvider();
        if (!token || typeof token !== 'string') {
          throw new Error('tokenProvider returned invalid token');
        }
        logger.info('✓ Token provider initialized successfully');

        // Ensure device record
        const deviceId = await ensureDevice(kinabaseClient);
        logger.info({ deviceId }, '✓ Device record ready');
        return; // success
      } catch (error) {
        if (isUpstreamError(error)) {
          logger.warn(
            { err: error, attempt },
            'Initialization failed (server unreachable) — will retry when connection is restored'
          );
          connectionMonitor.reportFailure(error.message);
          continue; // loop back — will wait for connection at top
        }
        // Non-recoverable error (bad credentials, missing config, …)
        throw error;
      }
    }
  };

  await initialize();
  if (interrupted) return;

  // ── Startup self-test ──────────────────────────
  logger.info('🔍 Running startup self-test...');

  try {
    const { records } = await fetchNewPoints({ since: new Date(Date.now() - 5 * 60_000).toISOString() });
    logger.info({ records: records.length }, `✓ InfluxDB OK — ${records.length} record(s) in last 5 min`);
  } catch (error) {
    logger.warn({ err: error }, '⚠ InfluxDB self-test failed — will retry on first poll cycle');
  }

  try {
    const versionUrl = `${config.kinabase.apiOrigin}/api/v1/version`;
    const resp = await fetch(versionUrl, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      logger.info({ url: versionUrl }, '✓ Kinabase version endpoint OK');
    } else {
      const body = await resp.text();
      logger.warn(
        { url: versionUrl, status: resp.status, body: body.substring(0, 2000) },
        '⚠ Kinabase version check failed'
      );
    }
  } catch (error) {
    logger.warn({ err: error }, '⚠ Kinabase version check failed');
  }

  try {
    const resp = await kinabaseClient.authorizedRequest(
      'GET',
      `/collections/${config.kinabase.collection}?limit=1`
    );
    if (resp.ok) {
      logger.info('✓ Kinabase API OK — collection accessible');
    } else {
      logger.warn({ status: resp.status }, '⚠ Kinabase self-test: unexpected status');
    }
  } catch (error) {
    logger.warn({ err: error }, '⚠ Kinabase self-test failed — will retry on first poll');
  }

  // Start polling
  const poll = async () => {
    if (isPolling) {
      logger.warn('Skipping poll because previous cycle is still running');
      return;
    }

    // ── Wait for upstream before attempting any API work ──
    if (!connectionMonitor.connected) {
      logger.info('⏸ Kinabase server unreachable — waiting for reconnection…');
      await connectionMonitor.waitForConnection();
      if (interrupted) return;
      logger.info('▶ Connection restored — resuming poll cycle');
    }

    isPolling = true;
    const pollStart = Date.now();
    let sent = 0;

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

      // Notify the connection monitor so it switches to recovery mode
      if (isUpstreamError(error)) {
        connectionMonitor.reportFailure(error.message);
      }

      logger.error({ err: error }, 'Kinabase bridge poller encountered an error');
    } finally {
      const durationMs = Date.now() - pollStart;
      recordPollCycle({ sent, durationMs });
      logger.debug({ durationMs, sent }, `Poll cycle completed in ${durationMs}ms`);
      isPolling = false;
    }
  };

  // Register poll callback so the dashboard can trigger it manually
  registerPollCallback(poll);

  if (runOnce) {
    await poll();
    return;
  }

  // Run initial poll
  logger.info('🚀 Starting Kinabase bridge - initial sync...');
  await poll();

  // Set up recurring polling with chained setTimeout (prevents overlap/drift)
  const intervalMinutes = Math.round(config.pollIntervalMs / 60000);
  logger.info(
    { intervalMs: config.pollIntervalMs, intervalMinutes },
    `📊 Polling every ${intervalMinutes} minute(s) for sensor updates`
  );

  const scheduleNext = () => {
    setTimeout(async () => {
      await poll();
      if (!interrupted) scheduleNext();
    }, config.pollIntervalMs);
  };
  scheduleNext();
};

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start Kinabase bridge');
  process.exit(1);
});
