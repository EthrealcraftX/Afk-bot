'use strict';

/**
 * RetryScheduler.js
 *
 * Adaptive exponential backoff with jitter and cancellation.
 *
 * Backoff table (configurable via env vars):
 *   Attempt 1: 2s
 *   Attempt 2: 4s
 *   Attempt 3: 8s
 *   Attempt 4: 15s
 *   Attempt 5: 30s
 *   Attempt 6: 45s
 *   Attempt 7+: 60s (capped at MAX_RETRY_DELAY_MS)
 *
 * Design:
 *  - Only one timer can be active at a time (enforced by _handle)
 *  - cancel() is synchronous and always safe to call (idempotent)
 *  - schedule() returns a Promise that resolves when the delay fires
 *    or rejects with a CancellationError if cancelled
 *  - Cancellation propagates as a rejection so ConnectionManager
 *    can cleanly abort its async pipeline
 */

const { Events } = require('./Logger');

// ── Backoff curve (seconds per attempt, 0-indexed) ───────────────────────────

const BACKOFF_TABLE_S = [2, 4, 8, 15, 30, 45, 60];

function getDelay(attempt, maxMs) {
  const fromTable = BACKOFF_TABLE_S[Math.min(attempt, BACKOFF_TABLE_S.length - 1)] * 1000;
  // Add ±10% jitter to avoid thundering herd if multiple bots restart together
  const jitter = fromTable * 0.1 * (Math.random() * 2 - 1);
  return Math.min(Math.round(fromTable + jitter), maxMs);
}

class CancellationError extends Error {
  constructor() {
    super('Retry cancelled');
    this.name = 'CancellationError';
    this.cancelled = true;
  }
}

class RetryScheduler {
  /**
   * @param {{
   *   logger: import('./Logger').Logger,
   *   metrics: import('./MetricsCollector').MetricsCollector,
   *   config: { maxRetries: number, maxRetryDelayMs: number }
   * }} deps
   */
  constructor({ logger, metrics, config }) {
    this._logger   = logger;
    this._metrics  = metrics;
    this._maxMs    = config.maxRetryDelayMs ?? 60_000;
    this._maxRetries = config.maxRetries ?? 20;

    this._attempt  = 0;   // how many retries have been scheduled
    this._handle   = null; // active setTimeout handle
    this._reject   = null; // reject callback for the active Promise
    this._cancelled = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get attempt() { return this._attempt; }

  get exhausted() { return this._attempt >= this._maxRetries; }

  /**
   * Schedule the next retry and return a Promise that resolves after the delay.
   * If cancelled before the delay elapses, the promise rejects with CancellationError.
   *
   * @returns {Promise<void>}
   */
  schedule() {
    if (this._cancelled) {
      return Promise.reject(new CancellationError());
    }

    if (this.exhausted) {
      return Promise.reject(new Error(`Max retries (${this._maxRetries}) exceeded`));
    }

    // Cancel any still-pending timer
    this._clearTimer();

    this._attempt++;
    const delay = getDelay(this._attempt - 1, this._maxMs);

    this._logger.info(Events.RETRY_SCHEDULED, {
      attempt: this._attempt,
      maxRetries: this._maxRetries,
      delayMs: delay,
    });

    this._metrics.recordRetryDelay(delay);

    return new Promise((resolve, reject) => {
      this._reject = reject;
      this._handle = setTimeout(() => {
        this._handle = null;
        this._reject = null;
        this._logger.debug(Events.RETRY_FIRED, { attempt: this._attempt });
        resolve();
      }, delay);
    });
  }

  /**
   * Cancel any pending retry timer. Idempotent — safe to call multiple times.
   */
  cancel() {
    if (this._clearTimer()) {
      this._logger.info(Events.RETRY_CANCELLED, { attempt: this._attempt });
    }
  }

  /**
   * Signal permanent shutdown — all future schedule() calls reject immediately.
   */
  shutdown() {
    this._cancelled = true;
    this.cancel();
  }

  /**
   * Reset the attempt counter (called after a successful join).
   */
  reset() {
    this._attempt = 0;
    this._cancelled = false;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _clearTimer() {
    if (this._handle !== null) {
      clearTimeout(this._handle);
      this._handle = null;
      if (this._reject) {
        this._reject(new CancellationError());
        this._reject = null;
      }
      return true;
    }
    return false;
  }
}

module.exports = { RetryScheduler, CancellationError };
