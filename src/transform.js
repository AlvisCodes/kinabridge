import config from './config.js';
import logger from './logger.js';

// Maps the combined InfluxDB field set into the Kinabase collection fields.
// Follows the APIRecord schema: { data: { field1: value1, field2: value2, ... } }

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
    for (const [fieldName, value] of Object.entries(record.fields || {})) {
      if (isNumber(value)) {
        // Use lowercase field names to match Kinabase schema
        data[fieldName] = value;
      } else if (value != null) {
        const numeric = Number.parseFloat(value);
        if (Number.isFinite(numeric)) {
          data[fieldName] = numeric;
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

  return payload;
};
