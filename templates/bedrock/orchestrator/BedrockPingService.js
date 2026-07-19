'use strict';

/**
 * BedrockPingService.js
 *
 * Performs a UDP status ping against a Bedrock server using bedrock-protocol.
 * Returns structured status information without establishing a full session.
 *
 * Design:
 *  - Each ping has an AbortSignal-like cancellation path via a race() with
 *    a timeout promise — no dangling UDP sockets.
 *  - Returns a plain object ({ online, motd, players, version, latency })
 *    rather than the raw protocol object so callers are decoupled from library internals.
 *  - Retries up to internalRetries times within a single "ping attempt" to
 *    handle transient UDP packet loss (UDP is fire-and-forget; first packet can drop).
 */

const { Events } = require('./Logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class BedrockPingService {
  /**
   * @param {{
   *   logger:  import('./Logger').Logger,
   *   metrics: import('./MetricsCollector').MetricsCollector,
   *   config:  { pingTimeoutMs: number, pingInternalRetries?: number }
   * }} deps
   */
  constructor({ logger, metrics, config }) {
    this._logger          = logger;
    this._metrics         = metrics;
    this._timeoutMs       = config.pingTimeoutMs ?? 5000;
    this._internalRetries = config.pingInternalRetries ?? 2;

    // Lazy-load bedrock-protocol.ping to avoid hard dependency at module load
    this._ping = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ping the Bedrock server at host:port.
   *
   * @param {string} host
   * @param {number} port
   * @returns {Promise<{
   *   online: boolean,
   *   motd?: string,
   *   players?: { online: number, max: number },
   *   version?: string,
   *   latencyMs?: number,
   *   error?: string
   * }>}
   */
  async ping(host, port) {
    this._logger.debug(Events.PING_START, { host, port, timeoutMs: this._timeoutMs });

    const pingFn = this._loadPing();
    if (!pingFn) {
      // Library not available — treat as offline but don't crash
      return { online: false, error: 'bedrock-protocol ping not available' };
    }

    let lastErr = null;

    for (let i = 0; i <= this._internalRetries; i++) {
      if (i > 0) {
        await sleep(300); // brief gap between internal retries
      }

      const started = Date.now();
      try {
        const result = await this._runPing(pingFn, host, port);
        const latencyMs = Date.now() - started;

        this._metrics.recordPingLatency(latencyMs);

        const status = this._normalise(result, latencyMs);
        this._logger.info(Events.PING_SUCCESS, {
          host, port, latencyMs,
          players: status.players,
          version: status.version,
        });
        return status;
      } catch (err) {
        lastErr = err;
        this._logger.debug('PING_INTERNAL_RETRY', {
          host, port, attempt: i + 1, error: err.message
        });
      }
    }

    // All internal retries exhausted
    const errMsg = lastErr?.message || 'Unknown ping error';
    this._logger.info(Events.PING_FAILED, { host, port, error: errMsg });
    return { online: false, error: errMsg };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _loadPing() {
    if (this._ping) return this._ping;
    try {
      const bp = require('bedrock-protocol');
      this._ping = bp.ping ?? null;
      return this._ping;
    } catch (_) {
      return null;
    }
  }

  /**
   * Race the actual ping against a timeout promise.
   */
  _runPing(pingFn, host, port) {
    const timeout = this._timeoutMs;
    const pingPromise = pingFn({ host, port });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Ping timed out after ${timeout}ms`)), timeout)
    );

    return Promise.race([pingPromise, timeoutPromise]);
  }

  /**
   * Normalise the raw bedrock-protocol ping response into our own schema.
   */
  _normalise(raw, latencyMs) {
    if (!raw) return { online: false };

    // bedrock-protocol returns something like:
    // { edition, name, levelName, playersOnline, playersMax, version, ... }
    const online = typeof raw.playersOnline === 'number' ||
                   typeof raw.name === 'string' ||
                   raw.edition != null;

    return {
      online,
      motd:      raw.name         ?? raw.motd ?? undefined,
      motd2:     raw.levelName    ?? undefined,
      players: {
        online: parseInt(raw.playersOnline ?? 0, 10),
        max:    parseInt(raw.playersMax    ?? 0, 10),
      },
      version:   raw.version ?? raw.mcpeVersion ?? undefined,
      latencyMs,
      raw,
    };
  }
}

module.exports = { BedrockPingService };
