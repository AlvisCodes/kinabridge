import fetch from 'node-fetch';
import pRetry from 'p-retry';
import config from './config.js';
import logger from './logger.js';

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
   * Upserts records to Kinabase - maintains one record per machine.
   * Creates new record if machine doesn't exist, updates if it does.
   * @param {Array} records - Array of { data: {...} } objects
   * @returns {Promise<{sent: number}>}
   */
  async upsertRecords(records) {
    if (!records || !records.length) {
      return { sent: 0 };
    }

    let sent = 0;
    const collection = config.kinabase.collection;

    // Group records by machine - only keep the latest reading per machine
    const latestByMachine = new Map();
    for (const record of records) {
      const machine = record.data.machine;
      if (!latestByMachine.has(machine)) {
        latestByMachine.set(machine, record);
      } else {
        // Keep the record with the latest timestamp
        const existing = latestByMachine.get(machine);
        if (new Date(record.data.timestamp) > new Date(existing.data.timestamp)) {
          latestByMachine.set(machine, record);
        }
      }
    }

    // Upsert one record per machine
    for (const [machine, record] of latestByMachine) {
      try {
        await this.#upsertRecord(collection, record);
        sent++;
        
        logger.debug(
          { machine, data: record.data },
          'Successfully upserted record in Kinabase'
        );
      } catch (error) {
        logger.error(
          { 
            error: error.message,
            machine,
            stack: error.stack
          },
          'Failed to upsert record in Kinabase'
        );
        // Continue with next machine instead of failing entire batch
      }
    }

    return { sent };
  }

  async #upsertRecord(collection, record) {
    const machine = record.data.machine;
    
    // First, try to find existing record for this machine
    const existingRecordId = await this.#findRecordByMachine(collection, machine);
    
    if (existingRecordId) {
      // Update existing record
      await this.#updateRecord(collection, existingRecordId, record);
    } else {
      // Create new record
      await this.#createRecord(collection, record);
    }
  }

  async #findRecordByMachine(collection, machine) {
    const endpoint = `/collections/${collection}?filter[machine]=${encodeURIComponent(machine)}&limit=1`;
    
    logger.debug({ endpoint, machine }, 'Searching for existing record');

    try {
      const response = await this.#authorizedRequest('GET', endpoint);
      
      if (!response.ok) {
        logger.warn({ status: response.status, machine }, 'Failed to search for existing record');
        return null;
      }

      const body = await response.json();
      const records = body.records || body.data || body;
      
      if (Array.isArray(records) && records.length > 0) {
        const recordId = records[0].id;
        logger.debug({ recordId, machine }, 'Found existing record');
        return recordId;
      }
      
      logger.debug({ machine }, 'No existing record found');
      return null;
    } catch (error) {
      logger.warn({ error: error.message, machine }, 'Error searching for record, will create new one');
      return null;
    }
  }

  async #updateRecord(collection, recordId, record) {
    const endpoint = `/collections/${collection}/${recordId}`;
    
    logger.debug({ endpoint, collection, recordId, machine: record.data.machine }, 'Updating existing record in Kinabase');

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('PATCH', endpoint, record);

        if (response.ok) {
          logger.info({ recordId, machine: record.data.machine }, 'Updated existing record');
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
    
    logger.debug({ endpoint, collection, machine: record.data?.machine }, 'Creating new record in Kinabase');

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('POST', endpoint, record);

        if (response.ok) {
          const body = await parseJsonSafely(response);
          logger.info({ recordId: body?.id, machine: record.data.machine }, 'Created new record');
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
