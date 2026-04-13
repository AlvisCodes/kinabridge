import fetch from 'node-fetch';
import pRetry from 'p-retry';
import config from './config.js';
import logger from './logger.js';
import { getDeviceId } from './deviceManager.js';

const parseJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Kinabase client for creating sensor reading records.
 * Uses the telemetry ingest endpoint for updates, standard REST for creation.
 */
class KinabaseClient {
  #baseUrl;
  #tokenProvider;

  constructor({ tokenProvider }) {
    this.#baseUrl = config.kinabase.baseUrl;
    
    // Validate tokenProvider is a function
    if (typeof tokenProvider !== 'function') {
      throw new TypeError(
        'tokenProvider must be a function that returns a Promise<string> (the JWT token)'
      );
    }
    
    this.#tokenProvider = tokenProvider;
  }

  async #authorizedRequest(method, path, body = null) {
    const token = await this.#tokenProvider();
    const url = `${this.#baseUrl}${path}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    };

    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  /**
   * Public accessor for authorizedRequest — used by deviceManager.
   */
  async authorizedRequest(method, path, body = null) {
    return this.#authorizedRequest(method, path, body);
  }

  /**
   * Upserts records to Kinabase - maintains one record per reading_id.
   * Creates new record if reading_id doesn't exist, ingests telemetry if it does.
   * @param {Array} records - Array of { data: {...} } objects
   * @returns {Promise<{sent: number}>}
   */
  async upsertRecords(records) {
    if (!records || !records.length) {
      return { sent: 0 };
    }

    let sent = 0;
    const collection = config.kinabase.collection;

    // Group records by reading_id - only keep the latest per reading_id
    const latestByReadingId = new Map();
    for (const record of records) {
      const readingId = record.data.reading_id;
      if (!latestByReadingId.has(readingId)) {
        latestByReadingId.set(readingId, record);
      }
    }

    // Collect records that have existing Kinabase IDs for batch ingest
    const ingestBatch = [];

    for (const [readingId, record] of latestByReadingId) {
      try {
        const existingRecordId = await this.#findRecordByReadingId(collection, readingId);

        if (existingRecordId) {
          ingestBatch.push({ kinabaseId: existingRecordId, record });
        } else {
          // Create new record with all fields + device link
          const createData = { ...record.data, lastReadingAt: new Date().toISOString() };
          const deviceId = getDeviceId();
          if (deviceId) {
            createData.device = { id: deviceId };
          }
          await this.#createRecord(collection, { data: createData });
          sent++;
        }
      } catch (error) {
        logger.error(
          { error: error.message, readingId },
          'Failed to upsert record in Kinabase'
        );
      }
    }

    // Batch ingest all existing records via the telemetry endpoint
    if (ingestBatch.length > 0) {
      try {
        await this.#ingestRecords(collection, ingestBatch);
        sent += ingestBatch.length;
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to ingest telemetry batch');
      }
    }

    logger.info({ sent, readings: sent }, `✓ Synced ${sent} reading(s) to Kinabase`);
    return { sent };
  }

  /**
   * Sends telemetry data via the ingest endpoint.
   * POST /api/v1/collections/{collection}/ingest
   */
  async #ingestRecords(collection, batch) {
    const now = new Date().toISOString();

    const ingestRecords = batch.map(({ kinabaseId, record }) => {
      const d = record.data;
      const data = { lastReadingAt: now };

      if (d.temperatureC != null) data.temperatureC = d.temperatureC;
      if (d.humidity != null) data.humidity = d.humidity;
      if (d.atmospheric_pressure != null) data.atmospheric_pressure = d.atmospheric_pressure;
      if (d.battery_level != null) data.battery_level = d.battery_level;
      if (d.signal_strength != null) data.signal_strength = d.signal_strength;
      if (d.voltage != null) data.voltage = d.voltage;
      if (d.current_draw != null) data.current_draw = d.current_draw;
      if (d.power_consumption != null) data.power_consumption = d.power_consumption;
      if (d.energy_used != null) data.energy_used = d.energy_used;
      if (d.data_transmitted != null) data.data_transmitted = d.data_transmitted;
      if (d.light_level != null) data.light_level = d.light_level;

      return {
        id: String(kinabaseId),
        changes: [{ timestamp: now, data }],
      };
    });

    const payload = {
      mode: 'FUTURE_FACING',
      records: ingestRecords,
    };

    const url = `${this.#baseUrl}/collections/${collection}/ingest`;

    logger.debug(
      { url, recordCount: ingestRecords.length },
      'Sending telemetry ingest...'
    );

    await pRetry(
      async () => {
        const token = await this.#tokenProvider();
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          logger.info(
            { count: ingestRecords.length },
            '✓ Ingested telemetry batch'
          );
          return;
        }

        if (response.status === 401) {
          const body = await parseJsonSafely(response);
          logger.error({ status: 401, body, url }, 'Ingest auth failed');
          const error = new Error('Ingest authentication failed (401)');
          error.name = 'AbortError';
          throw error;
        }

        if (response.status >= 500) {
          const text = await response.text();
          throw new Error(`Kinabase ingest ${response.status}: ${text}`);
        }

        const body = await parseJsonSafely(response);
        logger.error({ status: response.status, body, url }, 'Ingest rejected');
        const error = new Error(`Ingest failed: ${response.status} - ${JSON.stringify(body)}`);
        error.name = 'AbortError';
        throw error;
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (error) => {
          logger.warn(
            { attemptNumber: error.attemptNumber, retriesLeft: error.retriesLeft, message: error.message },
            'Retrying ingest after error'
          );
        },
      }
    );
  }

  async #findRecordByReadingId(collection, readingId) {
    const endpoint = `/collections/${collection}?filter[reading_id]=${encodeURIComponent(readingId)}&limit=1`;
    
    logger.debug({ endpoint, readingId }, 'Searching for existing record');

    try {
      const response = await this.#authorizedRequest('GET', endpoint);
      
      if (!response.ok) {
        logger.warn({ status: response.status, readingId }, 'Failed to search for existing record');
        return null;
      }

      const body = await response.json();
      const records = body.records || body.data || body;
      
      if (Array.isArray(records) && records.length > 0) {
        const recordId = records[0].id;
        logger.debug({ recordId, readingId }, 'Found existing record');
        return recordId;
      }
      
      logger.debug({ readingId }, 'No existing record found');
      return null;
    } catch (error) {
      logger.warn({ error: error.message, readingId }, 'Error searching for record, will create new one');
      return null;
    }
  }

  async #createRecord(collection, record) {
    const endpoint = `/collections/${collection}`;
    const readingId = record.data?.reading_id;
    
    logger.debug(
      { 
        readingId, 
        fields: Object.keys(record.data)
      }, 
      'Creating new record...'
    );

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('POST', endpoint, record);

        if (response.ok) {
          const body = await parseJsonSafely(response);
          logger.info({ recordId: body?.id, readingId }, '✓ Created new record');
          return;
        }

        if (response.status === 401) {
          const body = await parseJsonSafely(response);
          logger.error(
            { 
              status: 401,
              body,
              endpoint,
              tokenPresent: !!(await this.#tokenProvider())
            },
            'Authentication failed - check JWT token validity and expiry'
          );
          const error = new Error('Authentication failed (401)');
          error.name = 'AbortError';
          throw error;
        }

        if (response.status >= 500) {
          const text = await response.text();
          throw new Error(
            `Kinabase returned ${response.status} for POST ${endpoint}: ${text}`
          );
        }

        const body = await parseJsonSafely(response);
        logger.error(
          { 
            status: response.status, 
            body,
            endpoint,
            record
          },
          'Kinabase rejected record'
        );
        
        const error = new Error(
          `Failed to create record: ${response.status} - ${JSON.stringify(body)}`
        );
        error.name = 'AbortError';
        throw error;
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (error) => {
          logger.warn(
            {
              attemptNumber: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              message: error.message,
            },
            'Retrying Kinabase create after error'
          );
        },
      }
    );
  }
}

export default KinabaseClient;
