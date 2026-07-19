const { default: PQueue } = require('p-queue');
const { ServerRepository } = require('../db/serverRepository');
const { detectAndPing } = require('../status/detector');
const { getOrFetch, makeCacheKey, makeAternosCacheKey } = require('../status/smartCache');

const HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const healthQueue = new PQueue({ concurrency: 5 });

let isRunning = false;
let intervalId;

async function runCheck() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    const servers = await ServerRepository.getAllStoredServers();

    for (const server of servers) {
      healthQueue.add(async () => {
        try {
          const originalType = server.originalType ?? 'domain';
          const isAternos = originalType === 'aternos_domain' ||
                            originalType === 'url' ||
                            originalType === 'aternos_name';

          const parsed = {
            type: originalType,
            serverName: isAternos ? (server.inputAddress ?? null) : null,
            host: server.host,
            port: server.port,
            hintEdition: server.edition,
            raw: server.inputAddress ?? `${server.host}:${server.port}`,
          };

          // Derive the same cache key that handler.js and groupObserver.js use,
          // so all three paths share the same TTL cache entry.
          let cacheKey;
          if (isAternos) {
            const name = server.inputAddress ?? `${server.host}`;
            cacheKey = makeAternosCacheKey(name);
          } else {
            cacheKey = makeCacheKey(server.host, server.port);
          }

          // getOrFetch: reuses in-flight promises and cached results across all callers
          const status = await getOrFetch(cacheKey, () => detectAndPing(parsed));
          await ServerRepository.updateHealthCheck(server.id, status);
        } catch (err) {
          // Ignore individual ping errors
        }
      });
    }
  } catch (err) {
    console.error('[HealthCheck] Failed to run health check:', err);
  } finally {
    isRunning = false;
  }
}

class BackgroundJobs {
  static startHealthChecker() {
    // Run one check immediately at startup
    runCheck();
    // Run periodically
    intervalId = setInterval(runCheck, HEALTH_CHECK_INTERVAL_MS);
  }
}

process.once('SIGINT', () => { clearInterval(intervalId); });
process.once('SIGTERM', () => { clearInterval(intervalId); });

module.exports = { BackgroundJobs };
