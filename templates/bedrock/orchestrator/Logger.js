'use strict';

/**
 * Logger.js
 *
 * Structured, levelled event logger. All orchestrator events flow through here.
 * Emits structured log lines that include: timestamp, level, event, and arbitrary context.
 *
 * Design: thin console wrapper so it can be replaced with file/Telegram logger later.
 */

const LOG_LEVELS = {
  debug:   0,
  info:    1,
  warn:    2,
  error:   3,
  silent:  4
};

// ── Orchestrator event names (for structured filtering/alerting) ──────────────
const Events = Object.freeze({
  STATE_CHANGE:       'STATE_CHANGE',
  PING_START:         'PING_START',
  PING_SUCCESS:       'PING_SUCCESS',
  PING_FAILED:        'PING_FAILED',
  JOIN_ATTEMPT:       'JOIN_ATTEMPT',
  JOIN_SUCCESS:       'JOIN_SUCCESS',
  JOIN_FAILED:        'JOIN_FAILED',
  RETRY_SCHEDULED:    'RETRY_SCHEDULED',
  RETRY_CANCELLED:    'RETRY_CANCELLED',
  RETRY_FIRED:        'RETRY_FIRED',
  STABILIZING:        'STABILIZING',
  DISCONNECT:         'DISCONNECT',
  RECONNECT:          'RECONNECT',
  SHUTDOWN:           'SHUTDOWN',
  MAX_RETRIES:        'MAX_RETRIES',
  PERMANENT_FAILURE:  'PERMANENT_FAILURE',
  METRICS_SNAPSHOT:   'METRICS_SNAPSHOT',
  ERROR_CLASSIFIED:   'ERROR_CLASSIFIED',
});

class Logger {
  /**
   * @param {{ level?: string, prefix?: string }} opts
   */
  constructor(opts = {}) {
    this._level    = LOG_LEVELS[opts.level ?? process.env.LOG_LEVEL ?? 'info'] ?? 1;
    this._prefix   = opts.prefix ? `[${opts.prefix}] ` : '[Orchestrator] ';
    this._listeners = [];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  debug(event, ctx = {}) { this._emit('debug', event, ctx); }
  info (event, ctx = {}) { this._emit('info',  event, ctx); }
  warn (event, ctx = {}) { this._emit('warn',  event, ctx); }
  error(event, ctx = {}) { this._emit('error', event, ctx); }

  /**
   * Subscribe to all log events (for MetricsCollector, Telegram bridge, etc.)
   * @param {function({ ts, level, event, ctx }): void} fn
   */
  subscribe(fn) {
    this._listeners.push(fn);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _emit(level, event, ctx) {
    if (LOG_LEVELS[level] < this._level) return;

    const entry = {
      ts:     new Date().toISOString(),
      level,
      event,
      ctx
    };

    // Human-readable console output with emoji prefix per level
    const icons = { debug: '🔍', info: '📋', warn: '⚠️', error: '❌' };
    const icon  = icons[level] || '·';
    const ctxStr = Object.keys(ctx).length > 0 ? ' ' + JSON.stringify(ctx) : '';
    console.log(`${this._prefix}${icon} [${entry.ts}] ${event}${ctxStr}`);

    // Notify all subscribers
    for (const fn of this._listeners) {
      try { fn(entry); } catch (_) {}
    }
  }
}

module.exports = { Logger, Events };
