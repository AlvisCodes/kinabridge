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
 * Kinabase client for upserting sensor readings.
 * Uses external service tracking to maintain one record per machine.
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
   * Upserts records to Kinabase.
   * For each machine, maintains a single record using external service tracking.
   * @param {Array} records - Array of { data: {...} } objects
   * @returns {Promise<{sent: number}>}
   */
  async upsertRecords(records) {
    if (!records || !records.length) {
      return { sent: 0 };
    }

    let sent = 0;
    const collection = config.kinabase.collection;

    for (const record of records) {
      try {
        // Use machine name as external ID for upsert behavior
        const externalService = 'influxdb';
        const externalId = record.data.machine || 'unknown';
        
        await this.#upsertSingleRecord(collection, externalService, externalId, record);
        sent++;
        
        logger.debug(
          { machine: externalId, data: record.data },
          'Successfully upserted record to Kinabase'
        );
      } catch (error) {
        logger.error(
          { 
            error: error.message,
            machine: record.data?.machine,
            stack: error.stack
          },
          'Failed to upsert record to Kinabase'
        );
        // Continue with next record instead of failing entire batch
      }
    }

    return { sent };
  }

  async #upsertSingleRecord(collection, externalService, externalId, record) {
    const endpoint = `/collections/${collection}/ext/${externalService}/${externalId}`;
    
    logger.debug({ endpoint, collection, externalService, externalId }, 'Upserting record to Kinabase');

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('PATCH', endpoint, record);

        if (response.ok) {
          return;
        }

        // 404 means record doesn't exist, need to create it first
        if (response.status === 404) {
          await this.#createRecordWithExternal(collection, externalService, externalId, record);
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
          'Kinabase rejected record'
        );
        
        const error = new Error(
          `Kinabase rejected record with status ${response.status}`
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
            'Retrying Kinabase upsert after error'
          );
        },
      }
    );
  }

  async #createRecordWithExternal(collection, externalService, externalId, record) {
    // First create the record
    const createEndpoint = `/collections/${collection}`;
    const createResponse = await this.#authorizedRequest('POST', createEndpoint, record);

    if (!createResponse.ok) {
      const body = await parseJsonSafely(createResponse);
      throw new Error(
        `Failed to create record: ${createResponse.status} - ${JSON.stringify(body)}`
      );
    }

    const createdRecord = await createResponse.json();
    const recordId = createdRecord.id;

    if (!recordId) {
      throw new Error('Created record but no ID returned');
    }

    // Now link it to external service by updating with external metadata
    const recordWithExternal = {
      data: record.data,
      external: [
        {
          key: externalService,
          id: externalId,
          properties: {
            source: 'influxdb-humidity-monitoring'
          }
        }
      ]
    };

    const updateEndpoint = `/collections/${collection}/${recordId}`;
    const updateResponse = await this.#authorizedRequest('PATCH', updateEndpoint, recordWithExternal);

    if (!updateResponse.ok) {
      const body = await parseJsonSafely(updateResponse);
      logger.warn(
        { status: updateResponse.status, body },
        'Created record but failed to link external ID'
      );
    }

    logger.info(
      { recordId, externalId },
      'Created new record and linked to external service'
    );
  }
}

export default KinabaseClient;
