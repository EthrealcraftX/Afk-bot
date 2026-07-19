'use strict';

require('dotenv').config();

const config = Object.freeze({
  cacheTtlMs:                 parseInt(process.env.CACHE_TTL_MS              || '15000',  10),
  maxConcurrentRequests:      parseInt(process.env.MAX_CONCURRENT_REQUESTS    || '5',      10),
  javaPingTimeoutMs:          parseInt(process.env.JAVA_PING_TIMEOUT_MS       || '5000',   10),
  bedrockPingTimeoutMs:       parseInt(process.env.BEDROCK_PING_TIMEOUT_MS    || '5000',   10),
  aternosResolveTimeoutMs:    parseInt(process.env.ATERNOS_RESOLVE_TIMEOUT_MS || '15000',  10),
  circuitBreakerThreshold:    parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD  || '3',      10),
  circuitBreakerCooldownMs:   parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS|| '30000',  10),
});

module.exports = { config };
