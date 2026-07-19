'use strict';

const { config } = require('./config');
const { getLogger } = require('./logger');

const log = getLogger('smart-cache');

const resultCache  = new Map();
const inflightMap  = new Map();

function sweep() {
  const now = Date.now();
  for (const [key, entry] of resultCache.entries()) {
    if (entry.expiresAt <= now) {
      resultCache.delete(key);
    }
  }
}

const sweepInterval = setInterval(sweep, 60_000);
sweepInterval.unref();

function getCached(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data, ttlMs = config.cacheTtlMs) {
  resultCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function getOrFetch(key, fn) {
  const cached = getCached(key);
  if (cached !== null) return cached;

  if (inflightMap.has(key)) {
    log.info(`Coalescing request for key: ${key}`);
    return inflightMap.get(key);
  }

  const promise = fn()
    .then((result) => {
      setCached(key, result);
      return result;
    })
    .finally(() => {
      inflightMap.delete(key);
    });

  inflightMap.set(key, promise);
  return promise;
}

function makeCacheKey(host, port) {
  return `${host.toLowerCase()}:${port || 'auto'}`;
}

function makeAternosCacheKey(serverName) {
  return `aternos:${serverName.toLowerCase()}`;
}

module.exports = { getOrFetch, getCached, setCached, makeCacheKey, makeAternosCacheKey };
