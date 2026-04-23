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
    if (temperatureC !== null) data.temperatureC = temperatureC + 273.15;

    const humidity = toNumeric(fields.humidity);
    if (humidity !== null) data.humidity = humidity;

    // pressure uses InfluxDB's pressure or atmospheric_pressure field (hPa).
    // Guard: if value looks like kPa (<200), convert to hPa.
    let atmPressure = toNumeric(fields.atmospheric_pressure) ?? toNumeric(fields.pressure);
    if (atmPressure !== null && atmPressure < 200) {
      atmPressure *= 100;  // kPa → hPa
    }
    if (atmPressure !== null) data.pressure = atmPressure;

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
