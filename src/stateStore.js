import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import config from './config.js';
import logger from './logger.js';

const defaultState = {
  lastTimestamp: null,
  bridgeEnabled: true,
};

let cachedState = null;

const ensureDirectory = async (filePath) => {
  const directory = dirname(filePath);
  if (!directory || directory === '.' || directory === '/') {
    return;
  }
  await fs.mkdir(directory, { recursive: true });
};

const normalizeState = (state) => ({
  ...defaultState,
  ...(state || {}),
});

/**
 * Atomic write — writes to a temp file then renames, so a crash
 * mid-write never corrupts the real state file.
 */
const writeState = async (state) => {
  const payload = JSON.stringify(state, null, 2);
  await ensureDirectory(config.stateFile);
  const tmpFile = `${config.stateFile}.tmp`;
  await fs.writeFile(tmpFile, payload, 'utf-8');
  await fs.rename(tmpFile, config.stateFile);
  cachedState = state;
  return state;
};

export const loadState = async () => {
  if (cachedState) {
    return cachedState;
  }

  try {
    const data = await fs.readFile(config.stateFile, 'utf-8');
    const parsed = JSON.parse(data);
    cachedState = normalizeState(parsed);
    return cachedState;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info(`State file ${config.stateFile} not found; starting fresh.`);
      cachedState = { ...defaultState };
      return cachedState;
    }
    if (error instanceof SyntaxError) {
      logger.warn(
        { file: config.stateFile, error: error.message },
        'State file corrupted — resetting to defaults'
      );
      cachedState = { ...defaultState };
      // Overwrite the corrupt file with clean defaults
      await writeState(cachedState);
      return cachedState;
    }
    throw error;
  }
};

export const saveState = async (state) => {
  const normalized = normalizeState(state);
  return writeState(normalized);
};

export const updateState = async (mutator) => {
  const current = await loadState();
  const draft = { ...current };
  const result = mutator(draft) || draft;
  return writeState(normalizeState(result));
};

export const setLastTimestamp = async (timestamp) =>
  updateState((state) => {
    state.lastTimestamp = timestamp;
    return state;
  });

export const setBridgeEnabled = async (enabled) =>
  updateState((state) => {
    state.bridgeEnabled = Boolean(enabled);
    return state;
  });
