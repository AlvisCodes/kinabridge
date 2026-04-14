/* ── Kinabridge Dashboard ─────────────────────── */

const $ = (id) => document.getElementById(id);

const bridgeIndicator = $('bridge-indicator');
const bridgeStatus = $('bridge-status');
const statusDetail = $('status-detail');
const toggleButton = $('toggle-button');
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

const updateVisualState = (payload) => {
  const { bridgeEnabled, kinabase, lastTimestamp: latestPoint, device, connection } = payload;
  const status = kinabase || {};
  const { connected, lastSuccess: successAt, lastError, lastReadings, errorLog: errors } = status;

  // Reset classes
  bridgeIndicator.classList.remove('status-on', 'status-off', 'status-idle');
  headerDot.classList.remove('dot--on', 'dot--off', 'dot--idle');
  headerBadge.classList.remove('badge--on', 'badge--off', 'badge--idle');

  if (!bridgeEnabled) {
    bridgeStatus.textContent = 'Paused';
    statusDetail.textContent = 'Data collection is paused. Press Resume to start again.';
    bridgeIndicator.classList.add('status-off');
    headerDot.classList.add('dot--off');
    headerBadge.classList.add('badge--off');
    headerStatusText.textContent = 'Paused';
    toggleButton.textContent = 'Resume';
    toggleButton.classList.add('btn--resume');
  } else if (connected) {
    bridgeStatus.textContent = 'Running';
    statusDetail.textContent = 'Collecting and sending sensor data.';
    bridgeIndicator.classList.add('status-on');
    headerDot.classList.add('dot--on');
    headerBadge.classList.add('badge--on');
    headerStatusText.textContent = 'Live';
    toggleButton.textContent = 'Pause';
    toggleButton.classList.remove('btn--resume');
  } else {
    bridgeStatus.textContent = 'Waiting for data';
    statusDetail.textContent = lastError?.message
      ? `Something went wrong: ${lastError.message}`
      : 'Waiting for the first sensor reading to come through.';
    bridgeIndicator.classList.add('status-idle');
    headerDot.classList.add('dot--idle');
    headerBadge.classList.add('badge--idle');
    headerStatusText.textContent = 'Waiting';
    toggleButton.textContent = 'Pause';
    toggleButton.classList.remove('btn--resume');
  }

  toggleButton.dataset.enabled = bridgeEnabled ? 'true' : 'false';
  toggleButton.disabled = false;

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
    connPoll.textContent = connection.pollInterval || '–';
    if (connPollDetail) connPollDetail.textContent = connection.pollInterval || '–';
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

const renderErrors = (errors) => {
  if (!errorPanel || !errorList || !errorCount) return;

  const items = Array.isArray(errors) ? errors : [];
  if (items.length === 0) {
    errorPanel.style.display = 'none';
    return;
  }

  errorPanel.style.display = '';
  errorCount.textContent = items.length;
  errorList.innerHTML = items.map(e => `
    <div class="error-item">
      <span class="error-time">${formatErrorTime(e.timestamp)}</span>
      <span class="error-msg">${escapeHtml(e.message)}</span>
    </div>
  `).join('');
};

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
};

// Track connection-level errors for display in the error panel
let dashboardErrors = [];

const handleError = (error) => {
  bridgeIndicator.classList.remove('status-on', 'status-idle');
  bridgeIndicator.classList.add('status-off');
  headerDot.classList.remove('dot--on', 'dot--idle');
  headerDot.classList.add('dot--off');
  headerBadge.classList.remove('badge--on', 'badge--idle');
  headerBadge.classList.add('badge--off');
  bridgeStatus.textContent = 'Cannot connect';
  statusDetail.textContent = error?.message || 'Unable to reach the bridge service.';
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
};

const fetchStatus = async () => {
  toggleButton.disabled = true;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    dashboardErrors = []; // clear local errors on successful connect
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
  } catch (error) {
    handleError(error);
  }
};

toggleButton.addEventListener('click', toggleBridge);

fetchStatus();
setInterval(fetchStatus, 60_000);
