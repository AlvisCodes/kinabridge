import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import logger from './logger.js';
import { getDeviceId } from './deviceManager.js';
import connectionMonitor from './connectionMonitor.js';
import { fetchNewPoints } from './influxClient.js';
import { toKinabaseRecords } from './transform.js';

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
    upstream: connectionMonitor.getStatus(),
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
  port: overridePort,
}) => {
  const app = express();
  const port = overridePort || Number.parseInt(config.controlPort, 10) || 4300;

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
      const upstreamOk = connectionMonitor.connected;
      const healthy = upstreamOk && state.bridgeEnabled && (status.connected || !status.lastError);
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'degraded',
        bridgeEnabled: state.bridgeEnabled,
        connected: status.connected,
        upstream: connectionMonitor.getStatus(),
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

  // Manual poll trigger — for testing and debugging
  let pollCallback = null;
  app.post('/api/poll-now', async (req, res) => {
    if (!pollCallback) {
      return res.status(503).json({ error: 'Poll callback not registered (bridge not started)' });
    }
    try {
      logger.info('Manual poll triggered via control UI');
      await pollCallback();
      const payload = await createStatusPayload({ stateProvider, statusProvider });
      res.json({ triggered: true, ...payload });
    } catch (error) {
      logger.error({ err: error }, 'Manual poll failed');
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint — last N InfluxDB records (raw)
  app.get('/api/debug/influx-sample', async (req, res) => {
    try {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { records, latestTimestamp } = await fetchNewPoints({ since });
      res.json({
        count: records.length,
        latestTimestamp,
        records: records.slice(-10),
      });
    } catch (error) {
      logger.error({ err: error }, 'Debug InfluxDB sample failed');
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint — transform preview (InfluxDB → Kinabase field mapping)
  app.get('/api/debug/transform-preview', async (req, res) => {
    try {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { records } = await fetchNewPoints({ since });
      const latest = records.slice(-3);
      const transformed = toKinabaseRecords(latest);
      res.json({
        influxRecords: latest.length,
        transformedRecords: transformed.length,
        influx: latest.map(r => ({ machine: r.machine, timestamp: r.timestamp, fields: r.fields })),
        kinabase: transformed.map(r => r.data),
      });
    } catch (error) {
      logger.error({ err: error }, 'Debug transform preview failed');
      res.status(500).json({ error: error.message });
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

  const registerPollCallback = (fn) => { pollCallback = fn; };

  return { port, server, registerPollCallback };
};

export default startControlServer;
