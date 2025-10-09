import fetch from 'node-fetch';
import pRetry from 'p-retry';
import config from './config.js';
import logger from './logger.js';

const MAX_BATCH_SIZE = 100;

const chunkRecords = (records, size) => {
  const chunks = [];
  for (let i = 0; i < records.length; i += size) {
    chunks.push(records.slice(i, i + size));
  }
  return chunks;
};

const buildRecordKey = (collection, fields = {}) => {
  const machine = fields.machine || 'unknown';
  const timestamp = fields.timestamp || 'unknown';
  return `${collection}|${machine}|${timestamp}`;
};

const parseJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const extractConflictMap = (body, chunk) => {
  const map = new Map();
  if (!body) {
    return map;
  }

  const candidates = [];
  if (Array.isArray(body.records)) {
    candidates.push(...body.records);
  }
  if (Array.isArray(body.conflicts)) {
    candidates.push(...body.conflicts);
  }
  if (Array.isArray(body.errors)) {
    for (const error of body.errors) {
      if (error?.record) {
        candidates.push(error.record);
      } else if (error?.details?.record) {
        candidates.push(error.details.record);
      } else if (error?.details?.id) {
        candidates.push({
          collection: chunk[0]?.collection,
          fields: error.details.fields,
          id: error.details.id,
        });
      }
    }
  }

  for (const candidate of candidates) {
    const { id, recordId, _id, fields, collection } = candidate || {};
    const resolvedId = id || recordId || _id;
    if (!resolvedId || !fields) {
      continue;
    }
    const candidateCollection = collection || chunk[0]?.collection;
    const key = buildRecordKey(candidateCollection, fields);
    map.set(key, resolvedId);
  }

  return map;
};

const kinabaseUrl = (path) =>
  `${config.kinabase.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

export class KinabaseClient {
  constructor({ tokenProvider }) {
    this.tokenProvider = tokenProvider;
    this.maxBatchSize = MAX_BATCH_SIZE;
    this.supportsRefresh = !config.kinabase.jwt;
  }

  async upsertRecords(records) {
    if (!records.length) {
      return { sent: 0 };
    }

    let sent = 0;
    const chunks = chunkRecords(records, this.maxBatchSize);

    for (const chunk of chunks) {
      await this.#sendChunk(chunk);
      sent += chunk.length;
    }

    return { sent };
  }

  async #sendChunk(chunk) {
    const postBody = { records: chunk };

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('POST', '/records', postBody);

        if (response.ok) {
          logger.debug(
            { count: chunk.length },
            'Successfully sent Kinabase record batch'
          );
          return;
        }

        if (response.status === 409) {
          await this.#handleConflicts(chunk, response);
          return;
        }

        if (response.status >= 500) {
          const text = await response.text();
          throw new Error(
            `Kinabase returned ${response.status} for POST /records: ${text}`
          );
        }

        const body = await parseJsonSafely(response);
        logger.error(
          { status: response.status, body },
          'Kinabase rejected records payload'
        );
        throw new pRetry.AbortError(
          `Kinabase rejected payload with status ${response.status}`
        );
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (error) => {
          logger.warn(
            { attempt: error.attemptNumber, retriesLeft: error.retriesLeft },
            `Retrying Kinabase POST batch after error: ${error.message}`
          );
        },
      }
    );
  }

  async #handleConflicts(chunk, response) {
    const body = await parseJsonSafely(response);
    const conflictMap = extractConflictMap(body, chunk);

    if (!conflictMap.size) {
      logger.warn(
        { body },
        'Received 409 from Kinabase but could not extract conflicting record IDs; skipping updates'
      );
      return;
    }

    for (const record of chunk) {
      const key = buildRecordKey(record.collection, record.fields);
      const recordId = conflictMap.get(key);

      if (!recordId) {
        logger.warn(
          { key, record },
          'Missing record ID for conflicting record; skipping PATCH'
        );
        continue;
      }

      await this.#patchRecord(recordId, record);
    }
  }

  async #patchRecord(recordId, record) {
    const path = `/records/${encodeURIComponent(recordId)}`;

    await pRetry(
      async () => {
        const response = await this.#authorizedRequest('PATCH', path, record);

        if (response.ok) {
          logger.debug({ recordId }, 'Patched Kinabase record after conflict');
          return;
        }

        if (response.status >= 500) {
          const text = await response.text();
          throw new Error(
            `Kinabase returned ${response.status} for PATCH ${path}: ${text}`
          );
        }

        const body = await parseJsonSafely(response);
        logger.error(
          { recordId, status: response.status, body },
          'Kinabase PATCH failed; skipping record update'
        );
        throw new pRetry.AbortError(
          `PATCH ${path} failed with status ${response.status}`
        );
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (error) => {
          logger.warn(
            { recordId, attempt: error.attemptNumber, retriesLeft: error.retriesLeft },
            `Retrying PATCH after error: ${error.message}`
          );
        },
      }
    );
  }

  async #authorizedRequest(method, path, body) {
    const attempt = async (options = {}) => {
      const token = await this.tokenProvider(options);

      const response = await fetch(kinabaseUrl(path), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      return response;
    };

    let response = await attempt();

    if (response.status === 401 && this.supportsRefresh) {
      logger.warn('Kinabase request unauthorized; attempting token refresh');
      response = await attempt({ forceRefresh: true });
    }

    return response;
  }
}

export default KinabaseClient;
