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
   * Creates new records in Kinabase.
   * Each sensor reading becomes a separate record.
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
        await this.#createRecord(collection, record);
        sent++;
        
        logger.debug(
          { machine: record.data.machine, data: record.data },
          'Successfully created record in Kinabase'
        );
      } catch (error) {
        logger.error(
          { 
            error: error.message,
            machine: record.data?.machine,
            stack: error.stack
          },
          'Failed to create record in Kinabase'
        );
        // Continue with next record instead of failing entire batch
      }
    }

    return { sent };
  }

  async #createRecord(collection, record) {
    const endpoint = `/collections/${collection}`;
    
    logger.debug({ endpoint, collection, machine: record.data?.machine }, 'Creating record in Kinabase');

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('POST', endpoint, record);

        if (response.ok) {
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
