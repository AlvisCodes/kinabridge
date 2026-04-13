import config from './config.js';
import logger from './logger.js';

/**
 * Manages the bridge's device record in the Kinabase Devices collection.
 * On initialisation, looks up the device by device_name; creates one if missing.
 * Caches the device ID for the lifetime of the process.
 */

let cachedDeviceId = null;

const DEVICE_DEFAULTS = {
  device_name: config.machineName,
  status: 'online',
};

/**
 * Ensures a device record exists in Kinabase for this bridge.
 * Returns the Kinabase record ID (string) that can be used as a record link.
 *
 * @param {Object} client - Object with an authorizedRequest(method, path, body) method.
 * @returns {Promise<string>} The device record ID.
 */
export const ensureDevice = async (client) => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const collection = config.kinabase.devicesCollection;
  const deviceName = DEVICE_DEFAULTS.device_name;

  // 1. Search for existing device
  const searchPath = `/collections/${collection}?filter[device_name]=${encodeURIComponent(deviceName)}&limit=1`;

  logger.debug({ deviceName, collection }, 'Searching for existing device record');

  try {
    const response = await client.authorizedRequest('GET', searchPath);

    if (response.ok) {
      const body = await response.json();
      const records = body.records || body.data || body;

      if (Array.isArray(records) && records.length > 0) {
        cachedDeviceId = records[0].id;
        logger.info({ deviceId: cachedDeviceId, deviceName }, '✓ Found existing device');

        // Update status to online + last_seen
        await updateDeviceHeartbeat(client, cachedDeviceId);
        return cachedDeviceId;
      }
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Error searching for device, will attempt to create');
  }

  // 2. Create new device
  logger.info({ deviceName }, 'No device found — creating new device record');

  const createPayload = {
    data: {
      device_name: deviceName,
      status: 'online',
      last_seen: new Date().toISOString(),
      installed_date: new Date().toISOString(),
    },
  };

  const createPath = `/collections/${collection}`;
  const response = await client.authorizedRequest('POST', createPath, createPayload);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create device record (${response.status}): ${text}`);
  }

  const body = await response.json();
  cachedDeviceId = body.id || body.data?.id;
  logger.info({ deviceId: cachedDeviceId, deviceName }, '✓ Created new device record');
  return cachedDeviceId;
};

/**
 * Updates the device's last_seen and status fields.
 */
const updateDeviceHeartbeat = async (client, deviceId) => {
  const collection = config.kinabase.devicesCollection;
  const patchPath = `/collections/${collection}/${deviceId}`;

  try {
    const response = await client.authorizedRequest('PATCH', patchPath, {
      data: {
        status: 'online',
        last_seen: new Date().toISOString(),
      },
    });

    if (response.ok) {
      logger.debug({ deviceId }, 'Updated device heartbeat');
    } else {
      logger.warn({ deviceId, status: response.status }, 'Failed to update device heartbeat');
    }
  } catch (err) {
    logger.warn({ error: err.message, deviceId }, 'Error updating device heartbeat');
  }
};

/**
 * Updates the device heartbeat (call this each poll cycle).
 */
export const refreshDeviceHeartbeat = async (client) => {
  if (!cachedDeviceId) return;
  await updateDeviceHeartbeat(client, cachedDeviceId);
};

/**
 * Returns the cached device ID, or null if not yet initialised.
 */
export const getDeviceId = () => cachedDeviceId;

/**
 * Resets the cached device ID (for testing).
 */
export const resetDeviceCache = () => {
  cachedDeviceId = null;
};
