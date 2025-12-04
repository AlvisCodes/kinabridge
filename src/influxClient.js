import { InfluxDB } from '@influxdata/influxdb-client';
import config from './config.js';
import logger from './logger.js';

const MEASUREMENT = 'humidity_sensors';
const FIELD_WHITELIST = new Set(['temperature', 'humidity', 'pressure']);
const SOURCE_NAME = 'shoestring-humidity-monitoring';

const influxDB = new InfluxDB({
  url: config.influx.url,
  token: config.influx.token,
});

const queryApi = influxDB.getQueryApi(config.influx.org);

const toDate = (value) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp provided: ${value}`);
  }
  return date;
};

export const fetchNewPoints = async ({ since } = {}) => {
  const sinceDate = toDate(since);
  const defaultStart = new Date(Date.now() - config.defaultLookbackMs);
  const rangeStart = (sinceDate || defaultStart).toISOString();

  const fluxQuery = `
from(bucket: "${config.influx.bucket}")
  |> range(start: ${rangeStart})
  |> filter(fn: (r) => r._measurement == ${JSON.stringify(MEASUREMENT)})
  |> filter(fn: (r) => ${Array.from(FIELD_WHITELIST)
    .map((field) => `r._field == ${JSON.stringify(field)}`)
    .join(' or ')})
  |> sort(columns: ["_time"])
`;

  logger.debug(
    { rangeStart, sinceProvided: Boolean(sinceDate) },
    'Querying InfluxDB for new humidity sensor points'
  );

  const rows = await queryApi.collectRows(fluxQuery);

  const grouped = new Map();
  let latestProcessedDate = sinceDate ?? null;

  for (const row of rows) {
    const timeIso = new Date(row._time).toISOString();
    const rowDate = new Date(timeIso);

    if (sinceDate && rowDate.getTime() <= sinceDate.getTime()) {
      continue;
    }

    // Use hardcoded machine name, ignore InfluxDB machine fields
    const machine = config.machineName;
    const key = `${machine}|${timeIso}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        machine,
        timestamp: timeIso,
        source: SOURCE_NAME,
        fields: {},
      });
    }

    const record = grouped.get(key);
    if (FIELD_WHITELIST.has(row._field)) {
      record.fields[row._field] = typeof row._value === 'number'
        ? row._value
        : Number.parseFloat(row._value);
    }

    if (!latestProcessedDate || rowDate > latestProcessedDate) {
      latestProcessedDate = rowDate;
    }
  }

  const sortedRecords = Array.from(grouped.values()).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const latestTimestamp = latestProcessedDate
    ? latestProcessedDate.toISOString()
    : sinceDate
      ? sinceDate.toISOString()
      : null;

  logger.debug(
    {
      count: sortedRecords.length,
      latestTimestamp,
      sampleFields: sortedRecords[0] ? Object.keys(sortedRecords[0].fields) : []
    },
    'Fetched records from InfluxDB'
  );

  return {
    records: sortedRecords,
    latestTimestamp,
  };
};
