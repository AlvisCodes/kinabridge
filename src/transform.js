import config from './config.js';
import logger from './logger.js';

// Maps the combined InfluxDB field set into the Kinabase collection fields.
// Adjust this mapping if Kinabase expects different field names.

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

    const fields = {
      machine: record.machine,
      timestamp: record.timestamp,
      source: record.source || 'shoestring-humidity-monitoring',
    };

    for (const [fieldName, value] of Object.entries(record.fields || {})) {
      if (isNumber(value)) {
        fields[fieldName] = value;
      } else if (value != null) {
        const numeric = Number.parseFloat(value);
        if (Number.isFinite(numeric)) {
          fields[fieldName] = numeric;
        } else {
          logger.debug(
            { fieldName, value },
            'Dropping non-numeric field value from Kinabase payload'
          );
        }
      }
    }

    payload.push({
      collection: config.kinabase.collection,
      fields,
    });
  }

  return payload;
};
