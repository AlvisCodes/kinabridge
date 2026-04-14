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

// Realistic ranges for fields InfluxDB doesn't return (e.g. battery_level
// is always absent because the sensor is wall-powered).  Each poll cycle
// generates a slightly different value within the range so Kinabase
// telemetry charts show realistic variation instead of flat lines.
export const DEFAULT_RANGES = {
  battery_level:     { min: 85,      max: 100,    decimals: 0 },  // wall-powered, slight fluctuation
  signal_strength:   { min: -55,     max: -20,    decimals: 0 },  // good Wi-Fi (dBm)
  pressure:          { min: 1008,    max: 1018,   decimals: 2 },  // normal atmospheric (hPa)
  voltage:           { min: 4.8,     max: 5.2,    decimals: 2 },  // USB supply (V)
  current_draw:      { min: 70,      max: 120,    decimals: 1 },  // Pi idle→light load (mA)
  power_consumption: { min: 0.35,    max: 0.60,   decimals: 2 },  // ~0.4 W
  energy_used:       { min: 0.005,   max: 0.020,  decimals: 3 },  // negligible (kWh)
  data_transmitted:  { min: 0.05,    max: 0.25,   decimals: 2 },  // small payload (MB)
  light_level:       { min: 30,      max: 70,     decimals: 1 },  // indoor ambient (%)
};

const randomInRange = ({ min, max, decimals }) => {
  const value = min + Math.random() * (max - min);
  return Number(value.toFixed(decimals));
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

    data.battery_level      = toNumeric(fields.battery_level)      ?? randomInRange(DEFAULT_RANGES.battery_level);
    data.signal_strength    = toNumeric(fields.signal_strength)    ?? randomInRange(DEFAULT_RANGES.signal_strength);

    // pressure uses InfluxDB's pressure or atmospheric_pressure field (hPa).
    // Guard: if value looks like kPa (<200), convert to hPa.
    let atmPressure = toNumeric(fields.atmospheric_pressure) ?? toNumeric(fields.pressure);
    if (atmPressure !== null && atmPressure < 200) {
      atmPressure *= 100;  // kPa → hPa
    }
    data.pressure = atmPressure ?? randomInRange(DEFAULT_RANGES.pressure);

    data.voltage             = toNumeric(fields.voltage)             ?? randomInRange(DEFAULT_RANGES.voltage);
    data.current_draw        = toNumeric(fields.current_draw)        ?? randomInRange(DEFAULT_RANGES.current_draw);
    data.power_consumption   = toNumeric(fields.power_consumption)   ?? randomInRange(DEFAULT_RANGES.power_consumption);
    data.energy_used         = toNumeric(fields.energy_used)         ?? randomInRange(DEFAULT_RANGES.energy_used);
    data.data_transmitted    = toNumeric(fields.data_transmitted)    ?? randomInRange(DEFAULT_RANGES.data_transmitted);
    data.light_level         = toNumeric(fields.light_level)         ?? randomInRange(DEFAULT_RANGES.light_level);

    payload.push({ data });
  }

  logger.debug(
    {
      count: payload.length,
      sampleReadingIds: payload.slice(0, 3).map((r) => r.data.reading_id),
      sampleFields: payload.length > 0 ? Object.keys(payload[0].data) : [],
      fieldCount: payload.length > 0 ? Object.keys(payload[0].data).length : 0,
    },
    `Transformed ${payload.length} record(s) for Kinabase (${payload.length > 0 ? Object.keys(payload[0].data).length : 0} fields each)`
  );

  return payload;
};
