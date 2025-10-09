const bridgeIndicator = document.getElementById('bridge-indicator');
const bridgeStatus = document.getElementById('bridge-status');
const statusDetail = document.getElementById('status-detail');
const toggleButton = document.getElementById('toggle-button');
const lastSuccess = document.getElementById('last-success');
const lastTimestamp = document.getElementById('last-timestamp');

const formatTimestamp = (value) => {
  if (!value) {
    return '–';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '–';
    }
    return date.toLocaleString();
  } catch (error) {
    return '–';
  }
};

const updateVisualState = (payload) => {
  const { bridgeEnabled, kinabase, lastTimestamp: latestPoint } = payload;
  const status = kinabase || {};
  const { connected, lastSuccess: successAt, lastError } = status;

  bridgeIndicator.classList.remove('status-on', 'status-off', 'status-idle');

  if (!bridgeEnabled) {
    bridgeStatus.textContent = 'Bridge Paused';
    statusDetail.textContent = 'Data syncing is currently turned off.';
    bridgeIndicator.classList.add('status-off');
    toggleButton.textContent = 'Turn On Bridge';
  } else if (connected) {
    bridgeStatus.textContent = 'Kinabase Connected';
    statusDetail.textContent = 'Streaming humidity data to Kinabase.';
    bridgeIndicator.classList.add('status-on');
    toggleButton.textContent = 'Turn Off Bridge';
  } else {
    bridgeStatus.textContent = 'Connection Pending';
    const detail = lastError?.message
      ? `Waiting for successful upload. Last error: ${lastError.message}`
      : 'Waiting for the next successful upload.';
    statusDetail.textContent = detail;
    bridgeIndicator.classList.add('status-idle');
    toggleButton.textContent = 'Turn Off Bridge';
  }

  toggleButton.dataset.enabled = bridgeEnabled ? 'true' : 'false';
  toggleButton.disabled = false;

  lastSuccess.textContent = `Last sync: ${formatTimestamp(successAt)}`;
  lastTimestamp.textContent = `Last processed data: ${formatTimestamp(
    latestPoint
  )}`;
};

const handleError = (error) => {
  bridgeIndicator.classList.remove('status-on');
  bridgeIndicator.classList.add('status-off');
  bridgeStatus.textContent = 'Status Unavailable';
  statusDetail.textContent = error?.message || 'Unable to reach bridge service.';
  toggleButton.textContent = 'Retry';
  toggleButton.disabled = false;
};

const fetchStatus = async () => {
  toggleButton.disabled = true;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Bridge returned ${response.status}`);
    }
    const data = await response.json();
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bridgeEnabled: !enabled }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update bridge (${response.status})`);
    }

    const data = await response.json();
    updateVisualState(data);
  } catch (error) {
    handleError(error);
  }
};

toggleButton.addEventListener('click', toggleBridge);

fetchStatus();
setInterval(fetchStatus, 10_000);
