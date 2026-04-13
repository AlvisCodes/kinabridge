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
 */
class KinabaseClient {
  #baseUrl;
  #tokenProvider;

  /**
   * Creates a new KinabaseClient instance.
   * 
   * @param {Object} options
   * @param {Function} options.tokenProvider - An async function that returns a JWT token string.
   *   This should be the function returned by createTokenProvider() from kinabaseAuth.js.
   *   Do NOT pass an object with a getToken method - pass the function directly.
   * 
   * @throws {TypeError} If tokenProvider is not a function.
   * 
   * @example
   * import { createTokenProvider } from './kinabaseAuth.js';
   * const tokenProvider = createTokenProvider();
   * const client = new KinabaseClient({ tokenProvider });
   */
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
   * Creates new record if reading_id doesn't exist, updates if it does.
   * On update, only sends mutable fields (temperatureC, humidity, pressure, battery_level, signal_strength, lastReadingAt).
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

    // Upsert one record per reading_id
    for (const [readingId, record] of latestByReadingId) {
      try {
        await this.#upsertRecord(collection, record);
        sent++;
      } catch (error) {
        logger.error(
          { 
            error: error.message,
            readingId,
          },
          'Failed to upsert record in Kinabase'
        );
      }
    }

    logger.info({ sent, readings: sent }, `✓ Synced ${sent} reading(s) to Kinabase`);
    return { sent };
  }

  async #upsertRecord(collection, record) {
    const readingId = record.data.reading_id;
    
    // First, try to find existing record for this reading_id
    const existingRecordId = await this.#findRecordByReadingId(collection, readingId);
    
    if (existingRecordId) {
      // Update existing record — only send mutable fields
      const updateData = {
        lastReadingAt: new Date().toISOString(),
      };
      if (record.data.temperatureC != null) updateData.temperatureC = record.data.temperatureC;
      if (record.data.humidity != null) updateData.humidity = record.data.humidity;
      if (record.data.pressure != null) updateData.pressure = record.data.pressure;
      if (record.data.battery_level != null) updateData.battery_level = record.data.battery_level;
      if (record.data.signal_strength != null) updateData.signal_strength = record.data.signal_strength;
      await this.#updateRecord(collection, existingRecordId, { data: updateData });
    } else {
      // Create new record with all fields + device link
      const createData = { ...record.data, lastReadingAt: new Date().toISOString() };
      const deviceId = getDeviceId();
      if (deviceId) {
        createData.device = { id: deviceId };
      }
      await this.#createRecord(collection, { data: createData });
    }
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

  async #updateRecord(collection, recordId, record) {
    const endpoint = `/collections/${collection}/${recordId}`;
    
    logger.debug(
      { 
        recordId, 
        fields: Object.keys(record.data)
      }, 
      'Updating record...'
    );

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('PATCH', endpoint, record);

        if (response.ok) {
          logger.info({ recordId }, '✓ Updated record');
          return;
        }

        if (response.status === 401) {
          const body = await parseJsonSafely(response);
          logger.error(
            { 
              status: 401,
              body,
              endpoint
            },
            'Authentication failed - check JWT token validity and expiry'
          );
          const error = new Error('Authentication failed (401)');
          error.name = 'AbortError';
          throw error;
        }

        if (response.status === 404) {
          // Record was deleted, abort retry and let caller create new one
          const error = new Error('Record no longer exists (404)');
          error.name = 'AbortError';
          throw error;
        }

        if (response.status >= 500) {
          const text = await response.text();
          throw new Error(
            `Kinabase returned ${response.status} for PATCH ${endpoint}: ${text}`
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
          'Kinabase rejected record update'
        );
        
        const error = new Error(
          `Failed to update record: ${response.status} - ${JSON.stringify(body)}`
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
            'Retrying Kinabase update after error'
          );
        },
      }
    );
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
