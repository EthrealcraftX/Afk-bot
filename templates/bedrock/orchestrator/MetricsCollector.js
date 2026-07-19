'use strict';

/**
 * MetricsCollector.js
 *
 * Tracks connection health metrics. All mutations go through named methods
 * so the data is always consistent.
 *
 * Design: in-memory only (sufficient for a bot process lifetime).
 * Metrics are exposed via snapshot() and can be forwarded to any external sink.
 */

class MetricsCollector {
  constructor() {
    this._reset();
  }

  // ── Mutation methods (called by ConnectionManager) ──────────────────────────

  recordAttempt() {
    this._metrics.totalAttempts++;
    this._metrics.consecutiveFailures++;
    this._attemptStart = Date.now();
  }

  recordJoinSuccess() {
    const now = Date.now();
    this._metrics.successfulJoins++;
    this._metrics.consecutiveFailures = 0;
    this._metrics.lastSuccessAt        = now;

    if (this._attemptStart > 0) {
      const elapsed = now - this._attemptStart;
      this._totalStartupMs += elapsed;
      this._metrics.avgStartupMs = Math.round(this._totalStartupMs / this._metrics.successfulJoins);
      this._connectionStart = now;
    }
  }

  recordDisconnect() {
    if (this._connectionStart > 0) {
      const lifetime = Date.now() - this._connectionStart;
      this._totalLifetimeMs += lifetime;
      const total = this._metrics.successfulJoins;
      if (total > 0) {
        this._metrics.avgConnectionLifetimeMs = Math.round(this._totalLifetimeMs / total);
      }
      this._connectionStart = 0;
    }
  }

  recordPingLatency(ms) {
    if (ms <= 0) return;
    this._pingSamples.push(ms);
    if (this._pingSamples.length > 50) this._pingSamples.shift();
    const sum = this._pingSamples.reduce((a, b) => a + b, 0);
    this._metrics.avgPingLatencyMs = Math.round(sum / this._pingSamples.length);
  }

  recordRetryDelay(ms) {
    this._retryDelays.push(ms);
    if (this._retryDelays.length > 20) this._retryDelays.shift();
    const sum = this._retryDelays.reduce((a, b) => a + b, 0);
    this._metrics.avgReconnectDelayMs = Math.round(sum / this._retryDelays.length);
  }

  recordFailure() {
    this._metrics.consecutiveFailures++;
    this._metrics.totalFailures = (this._metrics.totalFailures || 0) + 1;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Returns a frozen snapshot of current metrics.
   * @returns {object}
   */
  snapshot() {
    return Object.freeze({
      ...this._metrics,
      uptimeMs: this._connectionStart > 0 ? Date.now() - this._connectionStart : 0,
      snapshotAt: new Date().toISOString(),
    });
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _reset() {
    this._metrics = {
      totalAttempts:           0,
      successfulJoins:         0,
      totalFailures:           0,
      consecutiveFailures:     0,
      avgStartupMs:            0,
      avgConnectionLifetimeMs: 0,
      avgPingLatencyMs:        0,
      avgReconnectDelayMs:     0,
      lastSuccessAt:           null,
    };
    this._pingSamples    = [];
    this._retryDelays    = [];
    this._totalStartupMs  = 0;
    this._totalLifetimeMs = 0;
    this._attemptStart    = 0;
    this._connectionStart = 0;
  }
}

module.exports = { MetricsCollector };
