/**
 * Connection Monitor — Circuit breaker for the Kinabase upstream server.
 *
 * Periodically health-checks the Kinabase endpoint and exposes a simple
 * state machine (connected / disconnected / checking) that the rest of
 * the application can query or await before attempting API calls.
 *
 * When the upstream is unreachable the monitor backs off exponentially
 * and resolves all `waitForConnection()` promises the moment the
 * server responds again, so the poll loop resumes automatically.
 */

import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import config from './config.js';
import logger from './logger.js';

const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const CONNECTED_CHECK_INTERVAL_MS = 30_000;
const MIN_DISCONNECTED_CHECK_MS = 5_000;
const MAX_DISCONNECTED_CHECK_MS = 60_000;
const BACKOFF_FACTOR = 2;

class ConnectionMonitor extends EventEmitter {
  #state = 'checking';
  #baseUrl;
  #checkTimer = null;
  #consecutiveFailures = 0;
  #lastCheckAt = null;
  #lastConnectedAt = null;
  #lastDisconnectedAt = null;
  #lastFailureReason = null;
  #waiters = [];

  constructor() {
    super();
    this.#baseUrl = config.kinabase.baseUrl;
  }

  /** Current state string: 'connected' | 'disconnected' | 'checking' */
  get state() {
    return this.#state;
  }

  /** Shorthand boolean check */
  get connected() {
    return this.#state === 'connected';
  }

  /** Structured status object for the control API / dashboard */
  getStatus() {
    return {
      state: this.#state,
      consecutiveFailures: this.#consecutiveFailures,
      lastCheckAt: this.#lastCheckAt,
      lastConnectedAt: this.#lastConnectedAt,
      lastDisconnectedAt: this.#lastDisconnectedAt,
      lastFailureReason: this.#lastFailureReason,
      nextCheckMs: this.#getCheckInterval(),
    };
  }

  /** Run the first health check and begin the recurring schedule. */
  async start() {
    logger.info({ url: this.#baseUrl }, 'Connection monitor: starting health checks');
    await this.#performCheck();
    this.#scheduleNextCheck();
    return this;
  }

  /** Stop all timers and unblock any waiters (used during shutdown). */
  stop() {
    if (this.#checkTimer) {
      clearTimeout(this.#checkTimer);
      this.#checkTimer = null;
    }
    // Unblock callers so they can detect the shutdown flag
    const waiters = this.#waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  /**
   * Returns a promise that resolves when the connection is (re)established.
   * If already connected, resolves immediately.
   */
  async waitForConnection() {
    if (this.#state === 'connected') return;
    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  /**
   * Called by external code when a network-level request failure occurs.
   * Transitions to disconnected immediately and restarts the check cadence
   * with a short interval so recovery is detected quickly.
   */
  reportFailure(reason) {
    if (this.#state === 'disconnected') return;
    this.#onCheckFailed(reason || 'Reported by application');
    // Restart check schedule with aggressive interval
    this.stop();
    this.#scheduleNextCheck();
  }

  // ── Internal ──────────────────────────────────────

  async #performCheck() {
    this.#lastCheckAt = new Date().toISOString();

    try {
      const response = await fetch(this.#baseUrl, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });

      // 502/504 = ngrok tunnel up but the server behind it is down
      if (response.status === 502 || response.status === 504) {
        this.#onCheckFailed(`Upstream returned HTTP ${response.status}`);
        return;
      }

      // ngrok returns 404 with ERR_NGROK_3200 when endpoint is offline
      if (response.status === 404) {
        try {
          const text = await response.text();
          if (text.includes('ERR_NGROK') || text.includes('ngrok') && text.includes('offline')) {
            this.#onCheckFailed('ngrok endpoint offline (ERR_NGROK_3200)');
            return;
          }
        } catch { /* ignore parse errors */ }
      }

      // Any other HTTP response means the tunnel + server are alive
      this.#onCheckSucceeded();
    } catch (error) {
      this.#onCheckFailed(error.message);
    }
  }

  #onCheckSucceeded() {
    const wasDisconnected = this.#state !== 'connected';
    this.#consecutiveFailures = 0;
    this.#state = 'connected';
    this.#lastConnectedAt = new Date().toISOString();
    this.#lastFailureReason = null;

    if (wasDisconnected) {
      logger.info(
        { url: this.#baseUrl },
        '✓ Kinabase server is reachable — resuming operations'
      );
      this.emit('connected');

      // Resolve all blocked waiters
      const waiters = this.#waiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  #onCheckFailed(reason) {
    this.#consecutiveFailures++;
    this.#lastFailureReason = reason;

    const wasConnected = this.#state === 'connected' || this.#state === 'checking';
    this.#state = 'disconnected';

    if (wasConnected) {
      this.#lastDisconnectedAt = new Date().toISOString();
      logger.warn(
        { reason, url: this.#baseUrl },
        '⚠ Kinabase server unreachable — operations paused, will auto-resume when back online'
      );
      this.emit('disconnected', reason);
    } else {
      const nextSecs = Math.round(this.#getCheckInterval() / 1000);
      logger.debug(
        { failures: this.#consecutiveFailures, nextCheckSecs: nextSecs, reason },
        `Still unreachable — retrying in ${nextSecs}s`
      );
    }
  }

  #getCheckInterval() {
    if (this.#state === 'connected') {
      return CONNECTED_CHECK_INTERVAL_MS;
    }
    return Math.min(
      MIN_DISCONNECTED_CHECK_MS *
        Math.pow(BACKOFF_FACTOR, Math.max(0, this.#consecutiveFailures - 1)),
      MAX_DISCONNECTED_CHECK_MS,
    );
  }

  #scheduleNextCheck() {
    const interval = this.#getCheckInterval();
    this.#checkTimer = setTimeout(async () => {
      try {
        await this.#performCheck();
      } catch (error) {
        logger.error({ err: error }, 'Connection monitor check threw unexpected error');
        this.#onCheckFailed(error.message || 'Unexpected error');
      }
      this.#scheduleNextCheck();
    }, interval);

    // Don't prevent process from exiting
    if (this.#checkTimer.unref) this.#checkTimer.unref();
  }
}

// Singleton — shared across the entire application
const monitor = new ConnectionMonitor();
export default monitor;
