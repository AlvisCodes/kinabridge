import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import logger from './logger.js';
import { getDeviceId } from './deviceManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

const createStatusPayload = async ({ stateProvider, statusProvider }) => {
  const state = await stateProvider();
  const status = statusProvider();
  const intervalMin = Math.round(config.pollIntervalMs / 60000);
  return {
    bridgeEnabled: state.bridgeEnabled,
    lastTimestamp: state.lastTimestamp,
    kinabase: status,
    device: {
      id: getDeviceId(),
      name: config.machineName,
      collection: config.kinabase.devicesCollection,
    },
    connection: {
      baseUrl: config.kinabase.baseUrl,
      collection: config.kinabase.collection,
      pollInterval: `${intervalMin}m`,
    },
  };
};

export const startControlServer = ({
  stateProvider,
  setBridgeEnabled,
  statusProvider,
}) => {
  const app = express();
  const port = Number.parseInt(config.controlPort, 10) || 4300;

  app.use(express.json());
  app.use(express.static(publicDir, { extensions: ['html'] }));

  app.get('/api/status', async (req, res) => {
    try {
      const payload = await createStatusPayload({
        stateProvider,
        statusProvider,
      });
      res.json(payload);
    } catch (error) {
      logger.error({ err: error }, 'Failed to read bridge status');
      res.status(500).json({ error: 'Failed to read bridge status' });
    }
  });

  // Health check endpoint — standard for container orchestration / monitoring
  app.get('/api/health', async (req, res) => {
    try {
      const status = statusProvider();
      const state = await stateProvider();
      const healthy = state.bridgeEnabled && (status.connected || !status.lastError);
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'degraded',
        bridgeEnabled: state.bridgeEnabled,
        connected: status.connected,
        lastSuccess: status.lastSuccess,
        lastError: status.lastError?.message || null,
        stats: status.stats || {},
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message });
    }
  });

  app.post('/api/status', async (req, res) => {
    const { bridgeEnabled } = req.body || {};
    if (typeof bridgeEnabled !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'bridgeEnabled must be provided as boolean' });
    }

    try {
      await setBridgeEnabled(bridgeEnabled);
      logger.info(
        { bridgeEnabled },
        'Updated Kinabase bridge enablement via control UI'
      );
      const payload = await createStatusPayload({
        stateProvider,
        statusProvider,
      });
      res.json(payload);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update bridge status');
      res.status(500).json({ error: 'Failed to update bridge status' });
    }
  });

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(publicDir, 'index.html'));
      return;
    }
    next();
  });

  const server = app.listen(port, () => {
    logger.info(
      { port, url: `http://localhost:${port}` },
      'Kinabase bridge control UI available'
    );
  });

  return { port, server };
};

export default startControlServer;
