/* ── Kinabridge Dashboard ─────────────────────── */

const $ = (id) => document.getElementById(id);

const bridgeIndicator = $('bridge-indicator');
const bridgeStatus = $('bridge-status');
const statusDetail = $('status-detail');
const toggleButton = $('toggle-button');
const syncNowButton = $('sync-now-button');
const lastSuccess = $('last-success');
const lastTimestamp = $('last-timestamp');
const deviceName = $('device-name');
const deviceIdDisplay = $('device-id-display');
const deviceBadge = $('device-badge');
const headerDot = $('header-dot');
const headerStatusText = $('header-status-text');
const headerBadge = $('header-badge');
const connApi = $('conn-api');
const connCollection = $('conn-collection');
const connPoll = $('conn-poll');
const connPollDetail = $('conn-poll-detail');

// Upstream banner elements
const upstreamBanner = $('upstream-banner');
const upstreamBannerTitle = $('upstream-banner-title');
const upstreamBannerDetail = $('upstream-banner-detail');

// Stats elements
const statUptime = $('stat-uptime');
const statRecords = $('stat-records');
const statSuccessRate = $('stat-success-rate');
const statPollDuration = $('stat-poll-duration');

// Sensor reading elements
const readingTemp = $('reading-temp');
const readingHum = $('reading-hum');
const readingPres = $('reading-pres');
const readingSignal = $('reading-signal');
const readingVoltage = $('reading-voltage');
const readingCurrent = $('reading-current');
const readingPower = $('reading-power');
const readingEnergy = $('reading-energy');
const readingData = $('reading-data');
const readingLight = $('reading-light');

// Error panel elements
const errorPanel = $('error-panel');
const errorCount = $('error-count');
const errorList = $('error-list');
const errorToggle = $('error-toggle');

// Error panel collapsed state
let errorCollapsed = false;
errorToggle?.addEventListener('click', () => {
  errorCollapsed = !errorCollapsed;
  errorPanel.classList.toggle('collapsed', errorCollapsed);
});
// Also toggle when clicking the header area
$('error-panel')?.querySelector('.error-panel-header')?.addEventListener('click', (e) => {
  if (e.target.closest('.error-toggle-btn')) return; // already handled
  errorCollapsed = !errorCollapsed;
  errorPanel.classList.toggle('collapsed', errorCollapsed);
});

const formatTimestamp = (value) => {
  if (!value) return '–';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '–';
    const now = new Date();
    const diff = now - d;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '–'; }
};

const formatReading = (value, decimals = 1) => {
  if (value == null || value === '') return '–';
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : '–';
};

const formatUptime = (ms) => {
  if (!ms || ms < 0) return '–';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

// Poll countdown timer
let pollIntervalMs = 60_000;
let lastFetchTime = Date.now();
let countdownInterval = null;

const startCountdown = () => {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const elapsed = Date.now() - lastFetchTime;
    const remaining = Math.max(0, pollIntervalMs - elapsed);
    const secs = Math.ceil(remaining / 1000);
    if (connPoll) {
      connPoll.textContent = secs > 0 ? `${secs}s` : 'Now';
    }
  }, 1000);
};

// Status detail truncation — long error messages get "See more"
const TRUNCATION_THRESHOLD = 60;

const setStatusDetail = (text) => {
  statusDetail.textContent = text;
  statusDetail.classList.remove('status-sub--expanded', 'status-sub--has-more');
  if (text.length > TRUNCATION_THRESHOLD) {
    statusDetail.classList.add('status-sub--has-more');
  }
};

statusDetail.addEventListener('click', () => {
  if (!statusDetail.classList.contains('status-sub--has-more')) return;
  statusDetail.classList.toggle('status-sub--expanded');
});

const updateVisualState = (payload) => {
  const { bridgeEnabled, kinabase, lastTimestamp: latestPoint, device, connection, upstream } = payload;
  const status = kinabase || {};
  const { connected, lastSuccess: successAt, lastError, lastReadings, errorLog: errors } = status;

  // Handle upstream banner
  updateUpstreamBanner(upstream);

  // Reset classes
  bridgeIndicator.classList.remove('status-on', 'status-off', 'status-idle', 'status-unreachable');
  headerDot.classList.remove('dot--on', 'dot--off', 'dot--idle', 'dot--unreachable');
  headerBadge.classList.remove('badge--on', 'badge--off', 'badge--idle', 'badge--unreachable');

  const upstreamDown = upstream && upstream.state === 'disconnected';

  if (!bridgeEnabled) {
    bridgeStatus.textContent = 'Paused';
    setStatusDetail('Data collection is paused. Press Resume to start again.');
    bridgeIndicator.classList.add('status-off');
    headerDot.classList.add('dot--off');
    headerBadge.classList.add('badge--off');
    headerStatusText.textContent = 'Paused';
    toggleButton.textContent = 'Resume';
    toggleButton.classList.add('btn--resume');
  } else if (upstreamDown) {
    bridgeStatus.textContent = 'Server Unreachable';
    setStatusDetail('Waiting for the Kinabase server to come back online. Operations will resume automatically.');
    bridgeIndicator.classList.add('status-unreachable');
    headerDot.classList.add('dot--unreachable');
    headerBadge.classList.add('badge--unreachable');
    headerStatusText.textContent = 'Reconnecting';
    toggleButton.textContent = 'Pause';
    toggleButton.classList.remove('btn--resume');
  } else if (connected) {
    bridgeStatus.textContent = 'Running';
    setStatusDetail('Collecting and sending sensor data.');
    bridgeIndicator.classList.add('status-on');
    headerDot.classList.add('dot--on');
    headerBadge.classList.add('badge--on');
    headerStatusText.textContent = 'Live';
    toggleButton.textContent = 'Pause';
    toggleButton.classList.remove('btn--resume');
  } else {
    bridgeStatus.textContent = 'Waiting for data';
    setStatusDetail(lastError?.message
      ? `Something went wrong: ${lastError.message}`
      : 'Waiting for the first sensor reading to come through.');
    bridgeIndicator.classList.add('status-idle');
    headerDot.classList.add('dot--idle');
    headerBadge.classList.add('badge--idle');
    headerStatusText.textContent = 'Waiting';
    toggleButton.textContent = 'Pause';
    toggleButton.classList.remove('btn--resume');
  }

  toggleButton.dataset.enabled = bridgeEnabled ? 'true' : 'false';
  toggleButton.disabled = false;
  if (syncNowButton) syncNowButton.disabled = false;

  // Metrics
  lastSuccess.textContent = formatTimestamp(successAt);
  lastTimestamp.textContent = formatTimestamp(latestPoint);

  // Live sensor readings
  if (lastReadings) {
    // Convert Kelvin back to °C for display
    const tempC = lastReadings.temperatureC != null
      ? lastReadings.temperatureC - 273.15
      : null;
    readingTemp.textContent = formatReading(tempC);
    readingHum.textContent = formatReading(lastReadings.humidity);
    readingPres.textContent = formatReading(lastReadings.pressure, 0);
    if (readingSignal) {
      readingSignal.textContent = lastReadings.signal_strength != null
        ? `${Number(lastReadings.signal_strength).toFixed(0)} dBm`
        : '–';
    }
    if (readingVoltage) readingVoltage.textContent = formatReading(lastReadings.voltage, 2);
    if (readingCurrent) readingCurrent.textContent = formatReading(lastReadings.current_draw, 1);
    if (readingPower) readingPower.textContent = formatReading(lastReadings.power_consumption, 2);
    if (readingEnergy) readingEnergy.textContent = formatReading(lastReadings.energy_used, 3);
    if (readingData) readingData.textContent = formatReading(lastReadings.data_transmitted, 2);
    if (readingLight) readingLight.textContent = formatReading(lastReadings.light_level, 1);
  }

  // Device
  if (device?.id) {
    deviceName.textContent = device.name || 'Unknown';
    deviceIdDisplay.textContent = `Device #${device.id}`;
    deviceBadge.style.display = '';
  } else {
    deviceName.textContent = device?.name || 'Not set up yet';
    deviceIdDisplay.textContent = 'Will be registered automatically';
    deviceBadge.style.display = 'none';
  }

  // Connection info
  if (connection) {
    connApi.textContent = connection.baseUrl || '–';
    connCollection.textContent = connection.collection ? connection.collection.substring(0, 8) + '…' : '–';
    connCollection.title = connection.collection || '';
    if (connPollDetail) connPollDetail.textContent = connection.pollInterval || '–';

    // Parse poll interval for countdown (e.g. "1m" → 60000)
    const match = connection.pollInterval?.match(/^(\d+)m$/);
    if (match) pollIntervalMs = Number(match[1]) * 60_000;
  }

  // Stats
  const stats = status.stats;
  if (stats) {
    if (statUptime) statUptime.textContent = formatUptime(stats.uptimeMs);
    if (statRecords) statRecords.textContent = stats.totalRecordsSent != null ? stats.totalRecordsSent.toLocaleString() : '–';
    if (statSuccessRate) statSuccessRate.textContent = stats.successRate != null ? `${stats.successRate}%` : '–';
    if (statPollDuration) statPollDuration.textContent = stats.lastPollDurationMs != null ? `${stats.lastPollDurationMs}ms` : '–';
  }

  // Error log
  renderErrors(errors);
};

const formatErrorTime = (value) => {
  if (!value) return '–';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '–'; }
};

const VISIBLE_ERRORS_DEFAULT = 3;
let showAllErrors = false;

const renderErrors = (errors) => {
  if (!errorPanel || !errorList || !errorCount) return;

  const items = Array.isArray(errors) ? errors : [];
  if (items.length === 0) {
    errorPanel.style.display = 'none';
    return;
  }

  errorPanel.style.display = '';
  errorCount.textContent = items.length;

  const visible = showAllErrors ? items : items.slice(0, VISIBLE_ERRORS_DEFAULT);
  const hasMore = items.length > VISIBLE_ERRORS_DEFAULT;

  let html = visible.map((e, i) => `
    <div class="error-item">
      <span class="error-time">${formatErrorTime(e.timestamp)}</span>
      <div class="error-msg-wrap">
        <span class="error-msg" data-err-idx="${i}">${escapeHtml(e.message)}</span>
        ${(e.message || '').length > 120 ? `<button class="error-more-btn" data-err-idx="${i}">Show more</button>` : ''}
      </div>
    </div>
  `).join('');

  if (hasMore) {
    const remaining = items.length - VISIBLE_ERRORS_DEFAULT;
    html += `
      <div class="error-show-all">
        <button class="error-show-all-btn" id="error-show-all-btn">
          ${showAllErrors ? 'Show less' : `Show all ${items.length} errors`}
        </button>
      </div>
    `;
  }

  errorList.innerHTML = html;

  // Wire up per-message expand toggles
  errorList.querySelectorAll('.error-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.errIdx;
      const msg = errorList.querySelector(`.error-msg[data-err-idx="${idx}"]`);
      if (msg) {
        const isExpanded = msg.classList.toggle('error-msg--expanded');
        btn.textContent = isExpanded ? 'Show less' : 'Show more';
      }
    });
  });

  // Wire up "Show all" button
  const showAllBtn = errorList.querySelector('#error-show-all-btn');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      showAllErrors = !showAllErrors;
      renderErrors(items);
    });
  }
};

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
};

// Track connection-level errors for display in the error panel
let dashboardErrors = [];

// Track upstream disconnected state for reconnected flash
let wasUpstreamDisconnected = false;
let reconnectedTimer = null;

// Adaptive dashboard poll — faster when upstream is disconnected
let dashboardPollMs = null; // set after first fetch
let dashboardPollTimer = null;

const updateUpstreamBanner = (upstream) => {
  if (!upstreamBanner) return;

  if (!upstream || upstream.state === 'connected') {
    if (wasUpstreamDisconnected) {
      // Flash "reconnected" banner briefly
      wasUpstreamDisconnected = false;
      upstreamBanner.style.display = '';
      upstreamBanner.classList.remove('upstream-banner--disconnected');
      upstreamBanner.classList.add('upstream-banner--reconnected');
      upstreamBannerTitle.textContent = 'Connection Restored';
      upstreamBannerDetail.textContent = 'Operations resumed normally.';
      clearTimeout(reconnectedTimer);
      reconnectedTimer = setTimeout(() => {
        upstreamBanner.style.display = 'none';
      }, 4000);

      AlertHandler.success('Operations resumed normally.', {
        title: 'Connection Restored',
        duration: 5000,
      });
    } else if (!reconnectedTimer) {
      upstreamBanner.style.display = 'none';
    }
    // Switch back to normal poll cadence
    if (dashboardPollMs !== pollIntervalMs) {
      dashboardPollMs = pollIntervalMs;
      scheduleDashboardPoll();
    }
    return;
  }

  if (upstream.state === 'disconnected') {
    const wasAlreadyDisconnected = wasUpstreamDisconnected;
    wasUpstreamDisconnected = true;
    clearTimeout(reconnectedTimer);
    reconnectedTimer = null;
    upstreamBanner.style.display = '';
    upstreamBanner.classList.remove('upstream-banner--reconnected');
    upstreamBanner.classList.add('upstream-banner--disconnected');
    upstreamBannerTitle.textContent = 'Kinabase Server Unreachable';
    const attempt = upstream.consecutiveFailures || '?';
    upstreamBannerDetail.textContent = `Operations paused — auto-reconnecting (attempt ${attempt})`;
    // Poll dashboard faster for live feedback
    if (dashboardPollMs !== 5000) {
      dashboardPollMs = 5000;
      scheduleDashboardPoll();
    }

    // Only toast once on initial disconnect
    if (!wasAlreadyDisconnected) {
      AlertHandler.warning('Operations paused — will auto-resume when server is back.', {
        title: 'Server Unreachable',
        duration: 6000,
      });
    }
  }
};

const handleError = (error) => {
  bridgeIndicator.classList.remove('status-on', 'status-idle');
  bridgeIndicator.classList.add('status-off');
  headerDot.classList.remove('dot--on', 'dot--idle');
  headerDot.classList.add('dot--off');
  headerBadge.classList.remove('badge--on', 'badge--idle');
  headerBadge.classList.add('badge--off');
  bridgeStatus.textContent = 'Cannot connect';
  setStatusDetail(error?.message || 'Unable to reach the bridge service.');
  headerStatusText.textContent = 'Offline';
  toggleButton.textContent = 'Retry';
  toggleButton.disabled = false;

  // Show connection error in the error panel
  dashboardErrors.unshift({
    message: `Dashboard: ${error?.message || 'Connection failed'}`,
    timestamp: new Date().toISOString(),
  });
  if (dashboardErrors.length > 20) dashboardErrors.length = 20;
  renderErrors(dashboardErrors);

  AlertHandler.danger(error?.message || 'Unable to reach the bridge service.', {
    title: 'Request Failed',
    duration: 6000,
  });
};

const fetchStatus = async () => {
  toggleButton.disabled = true;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid JSON response from server');
    }
    dashboardErrors = []; // clear local errors on successful connect
    lastFetchTime = Date.now();
    updateVisualState(data);
  } catch (error) {
    handleError(error);
  }
};

const toggleBridge = async () => {
  const enabled = toggleButton.dataset.enabled === 'true';
  toggleButton.disabled = true;
  toggleButton.textContent = 'Updating…';

  try {
    const response = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bridgeEnabled: !enabled }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    updateVisualState(data);

    if (!enabled) {
      AlertHandler.success('Sensor data collection resumed.', { title: 'Bridge Resumed' });
    } else {
      AlertHandler.info('Sensor data collection paused.', { title: 'Bridge Paused' });
    }
  } catch (error) {
    handleError(error);
  }
};

toggleButton.addEventListener('click', toggleBridge);

// Manual poll trigger ("Sync Now") — calls POST /api/poll-now
const triggerSyncNow = async () => {
  if (!syncNowButton) return;
  syncNowButton.disabled = true;
  syncNowButton.textContent = 'Syncing…';

  try {
    const response = await fetch('/api/poll-now', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid JSON response');
    }
    if (data.triggered) {
      updateVisualState(data);
      lastFetchTime = Date.now();
      AlertHandler.success('Manual sync completed successfully.', { title: 'Sync Complete' });
    }
  } catch (error) {
    AlertHandler.danger(error?.message || 'Sync failed.', {
      title: 'Request Failed',
      duration: 6000,
    });
  } finally {
    if (syncNowButton) {
      syncNowButton.disabled = false;
      syncNowButton.textContent = 'Sync Now';
    }
  }
};
syncNowButton?.addEventListener('click', triggerSyncNow);

// Adaptive poll scheduler — polls more frequently when upstream is disconnected
const scheduleDashboardPoll = () => {
  clearTimeout(dashboardPollTimer);
  dashboardPollTimer = setTimeout(async () => {
    await fetchStatus();
    scheduleDashboardPoll();
  }, dashboardPollMs);
};

// Cleanup timers when user navigates away
window.addEventListener('beforeunload', () => {
  if (countdownInterval) clearInterval(countdownInterval);
  if (dashboardPollTimer) clearTimeout(dashboardPollTimer);
});

// Browser offline/online detection
window.addEventListener('offline', () => {
  bridgeStatus.textContent = 'Browser Offline';
  setStatusDetail('Your network connection is down. Dashboard will resume when reconnected.');
  bridgeIndicator.classList.remove('status-on', 'status-idle', 'status-unreachable');
  bridgeIndicator.classList.add('status-off');
  headerDot.classList.remove('dot--on', 'dot--idle', 'dot--unreachable');
  headerDot.classList.add('dot--off');
  headerStatusText.textContent = 'Offline';
});

window.addEventListener('online', () => {
  fetchStatus();
  AlertHandler.success('Network connection restored.', { title: 'Back Online' });
});

// Initial fetch, then poll with adaptive interval
fetchStatus().then(() => {
  dashboardPollMs = dashboardPollMs || pollIntervalMs;
  startCountdown();
  scheduleDashboardPoll();
});
