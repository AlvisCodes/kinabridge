import config from './config.js';
import logger from './logger.js';

// Maps InfluxDB grouped records into flat Kinabase "Sensor Readings" records.
// One Kinabase record per machine — all sensor values as direct fields.

const toNumeric = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value != null) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const toKinabaseRecords = (records) => {
  const payload = [];

  for (const record of records) {
    if (!record.machine || !record.timestamp) {
      logger.warn(
        { record },
        'Skipping record without machine or timestamp when building Kinabase payload'
      );
      continue;
    }

    const fields = record.fields || {};

    const data = {
      reading_id: record.machine,
    };

    const temperatureC = toNumeric(fields.temperature);
    if (temperatureC !== null) data.temperatureC = temperatureC;

    const humidity = toNumeric(fields.humidity);
    if (humidity !== null) data.humidity = humidity;

    const pressure = toNumeric(fields.pressure);
    if (pressure !== null) data.pressure = pressure;

    const batteryLevel = toNumeric(fields.battery_level);
    if (batteryLevel !== null) data.battery_level = batteryLevel;

    const signalStrength = toNumeric(fields.signal_strength);
    if (signalStrength !== null) data.signal_strength = signalStrength;

    payload.push({ data });
  }

  logger.debug(
    {
      count: payload.length,
      sampleReadingIds: payload.slice(0, 3).map((r) => r.data.reading_id),
    },
    'Transformed records for Kinabase'
  );

  return payload;
};
