import config from './config.js';
import logger from './logger.js';

// Maps the combined InfluxDB field set into the Kinabase collection fields.
// Follows the APIRecord schema: { data: { field1: value1, field2: value2, ... } }

// Map InfluxDB field names to Kinabase field names
// (Kinabase field names must match the collection schema exactly)
const FIELD_NAME_MAPPING = {
  'temperature': 'Temperature',  // Capitalized to match Kinabase schema
  'humidity': 'Humidity',
  'pressure': 'Pressure',
};

const isNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

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

    // Build the data object with all fields
    const data = {
      machine: record.machine,
      timestamp: record.timestamp,
      source: record.source || 'shoestring-humidity-monitoring',
    };

    // Add sensor readings (temperature, humidity, pressure)
    // Map InfluxDB field names to Kinabase field names
    for (const [fieldName, value] of Object.entries(record.fields || {})) {
      if (isNumber(value)) {
        // Map to Kinabase field name (e.g., temperature -> Tempreture)
        const kinabaseFieldName = FIELD_NAME_MAPPING[fieldName] || fieldName;
        data[kinabaseFieldName] = value;
      } else if (value != null) {
        const numeric = Number.parseFloat(value);
        if (Number.isFinite(numeric)) {
          const kinabaseFieldName = FIELD_NAME_MAPPING[fieldName] || fieldName;
          data[kinabaseFieldName] = numeric;
        } else {
          logger.debug(
            { fieldName, value },
            'Dropping non-numeric field value from Kinabase payload'
          );
        }
      }
    }

    // Wrap in APIRecord format: { data: { ... } }
    payload.push({
      data
    });
  }

  logger.debug(
    { 
      count: payload.length,
      sampleFields: payload[0] ? Object.keys(payload[0].data) : []
    },
    'Transformed records for Kinabase'
  );

  return payload;
};
