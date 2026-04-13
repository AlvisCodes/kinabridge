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

// Default fake values for fields InfluxDB doesn't return (e.g. battery_level
// is always absent because the sensor is wall-powered).  These ensure every
// Kinabase record has a complete set of metrics.
const DEFAULTS = {
  battery_level: 100,        // wall-powered → always full
  signal_strength: -30,      // strong Wi-Fi signal (dBm)
  voltage: 5.0,              // USB wall supply (V)
  current_draw: 85.0,        // typical Pi draw (mA)
  power_consumption: 0.43,   // ~0.43 W
  energy_used: 0.01,         // negligible (kWh)
  data_transmitted: 0.12,    // small payload (MB)
  light_level: 45.0,         // indoor ambient (%)
  wind_speed: 0.0,           // indoor, no wind (m/s)
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
    if (temperatureC !== null) data.temperatureC = temperatureC + 273.15;

    const humidity = toNumeric(fields.humidity);
    if (humidity !== null) data.humidity = humidity;

    const pressure = toNumeric(fields.pressure);
    if (pressure !== null) data.pressure = pressure;

    data.battery_level      = toNumeric(fields.battery_level)      ?? DEFAULTS.battery_level;
    data.signal_strength    = toNumeric(fields.signal_strength)    ?? DEFAULTS.signal_strength;

    // atmospheric_pressure mirrors pressure (same hPa value)
    if (pressure !== null) data.atmospheric_pressure = pressure;

    data.voltage             = toNumeric(fields.voltage)             ?? DEFAULTS.voltage;
    data.current_draw        = toNumeric(fields.current_draw)        ?? DEFAULTS.current_draw;
    data.power_consumption   = toNumeric(fields.power_consumption)   ?? DEFAULTS.power_consumption;
    data.energy_used         = toNumeric(fields.energy_used)         ?? DEFAULTS.energy_used;
    data.data_transmitted    = toNumeric(fields.data_transmitted)    ?? DEFAULTS.data_transmitted;
    data.light_level         = toNumeric(fields.light_level)         ?? DEFAULTS.light_level;
    data.wind_speed          = toNumeric(fields.wind_speed)          ?? DEFAULTS.wind_speed;

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
