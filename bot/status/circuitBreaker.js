'use strict';

const { config } = require('./config');
const { getLogger } = require('./logger');

const log = getLogger('circuit-breaker');

const breakers = new Map();

function getBreaker(key) {
  if (!breakers.has(key)) {
    breakers.set(key, { state: 'CLOSED', failures: 0, openedAt: 0 });
  }
  return breakers.get(key);
}

function isAllowed(key) {
  const b = getBreaker(key);

  if (b.state === 'CLOSED') return true;

  if (b.state === 'OPEN') {
    const elapsed = Date.now() - b.openedAt;
    if (elapsed >= config.circuitBreakerCooldownMs) {
      b.state = 'HALF';
      return true;
    }
    return false;
  }

  return true;
}

function recordSuccess(key) {
  const b = getBreaker(key);
  b.state    = 'CLOSED';
  b.failures = 0;
  b.openedAt = 0;
}

function recordFailure(key) {
  const b = getBreaker(key);
  b.failures++;

  if (b.state === 'HALF') {
    b.state    = 'OPEN';
    b.openedAt = Date.now();
    return;
  }

  if (b.failures >= config.circuitBreakerThreshold) {
    b.state    = 'OPEN';
    b.openedAt = Date.now();
    log.warn(`Circuit OPENED for host: ${key}`);
  }
}

function getRemainingCooldownSeconds(key) {
  const b = breakers.get(key);
  if (!b || b.state !== 'OPEN') return 0;
  const remaining = config.circuitBreakerCooldownMs - (Date.now() - b.openedAt);
  return Math.max(0, Math.ceil(remaining / 1000));
}

module.exports = { isAllowed, recordSuccess, recordFailure, getRemainingCooldownSeconds };
