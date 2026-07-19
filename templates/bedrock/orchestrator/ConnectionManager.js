'use strict';

/**
 * ConnectionManager.js
 *
 * Top-level orchestrator — drives the ConnectionStateMachine through the
 * full connection lifecycle using all supporting modules.
 *
 * ── Pipeline per connection cycle ──────────────────────────────────────────
 *
 *   IDLE
 *   ↓ start()
 *   PINGING  ← BedrockPingService.ping()
 *     ↓ success
 *   STARTING ← stabilization delay (server is up but not necessarily stable)
 *     ↓ delay elapsed
 *   JOINING  ← JoinExecutor.join()
 *     ↓ join event fired
 *   CONNECTED
 *     ↓ disconnect / error
 *   WAITING  ← RetryScheduler.schedule() → adaptive delay
 *     ↓ delay elapsed
 *   PINGING  ← smart ping (don't join if server went back offline)
 *   … repeat …
 *
 * On permanent error: → FAILED (no further retry)
 * On max retries:     → FAILED
 * On stop():          → CANCELLED
 *
 * ── Duplicate-prevention ───────────────────────────────────────────────────
 * The FSM throws on illegal transitions, which prevents:
 *  - joining while already in JOINING state
 *  - scheduling a retry while in CONNECTED state
 *  - any other race condition
 *
 * ── Graceful shutdown ──────────────────────────────────────────────────────
 * stop() cancels any pending timer, disconnects the bot session, and
 * transitions to CANCELLED. The run loop exits cleanly because it checks
 * `fsm.isTerminal()` after every await.
 */

const { ConnectionStateMachine, States } = require('./ConnectionStateMachine');
const { BedrockPingService }             = require('./BedrockPingService');
const { JoinExecutor }                   = require('./JoinExecutor');
const { RetryScheduler, CancellationError } = require('./RetryScheduler');
const { ErrorClassifier }               = require('./ErrorClassifier');
const { PlaceholderClassifier, Classification } = require('./PlaceholderClassifier');
const { Logger, Events }                = require('./Logger');
const { MetricsCollector }              = require('./MetricsCollector');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ConnectionManager {
  /**
   * @param {{
   *   host:                string,
   *   port:                number,
   *   version:             string,
   *   projectId?:          string,
   *   usernameFile?:       string,
   *   maxRetries?:         number,
   *   maxRetryDelayMs?:    number,
   *   pingTimeoutMs?:      number,
   *   joinTimeoutMs?:      number,
   *   movementIntervalMs?: number,
   *   stabilizationMs?:    number,
   *   reconnectHours?:     number,
   *   logLevel?:           string,
   * }} config
   */
  constructor(config) {
    // ── Resolve config with env-var overrides ──────────────────────────────
    this._cfg = {
      host:               config.host,
      port:               config.port,
      version:            config.version,
      projectId:          config.projectId          ?? 'unknown',
      usernameFile:       config.usernameFile,
      maxRetries:         parseInt(process.env.MAX_RETRIES          ?? config.maxRetries         ?? 20),
      maxRetryDelayMs:    parseInt(process.env.MAX_RETRY_DELAY_MS   ?? config.maxRetryDelayMs   ?? 60_000),
      pingTimeoutMs:      parseInt(process.env.PING_TIMEOUT_MS      ?? config.pingTimeoutMs     ?? 5_000),
      joinTimeoutMs:      parseInt(process.env.JOIN_TIMEOUT_MS      ?? config.joinTimeoutMs     ?? 25_000),
      movementIntervalMs: parseInt(process.env.MOVEMENT_INTERVAL_MS ?? config.movementIntervalMs ?? 5_000),
      stabilizationMs:    parseInt(process.env.STABILIZATION_MS     ?? config.stabilizationMs   ?? 3_000),
      reconnectHours:     parseFloat(process.env.RECONNECT_HOURS    ?? config.reconnectHours    ?? 2),
      logLevel:           process.env.LOG_LEVEL                     ?? config.logLevel          ?? 'info',
    };

    // ── Build dependency graph ─────────────────────────────────────────────
    this._logger  = new Logger({ level: this._cfg.logLevel, prefix: `CM:${this._cfg.host}:${this._cfg.port}` });
    this._metrics = new MetricsCollector();
    this._fsm     = new ConnectionStateMachine({ logger: this._logger });
    this._pinger  = new BedrockPingService({ logger: this._logger, metrics: this._metrics, config: this._cfg });
    this._executor = new JoinExecutor({ logger: this._logger, metrics: this._metrics, config: this._cfg });
    this._retrier = new RetryScheduler({ logger: this._logger, metrics: this._metrics, config: this._cfg });
    this._classifier = new ErrorClassifier({ logger: this._logger });
    this._placeholderClassifier = new PlaceholderClassifier();

    this._scheduledRotation = null; // scheduled reconnect after N hours
    this._running = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start the connection lifecycle. Returns a Promise that never resolves
   * unless the machine enters a terminal state (FAILED / CANCELLED).
   */
  async start() {
    if (this._running) {
      throw new Error('[CM] start() called while already running');
    }
    this._running = true;

    this._logger.info(Events.RECONNECT, {
      host:    this._cfg.host,
      port:    this._cfg.port,
      version: this._cfg.version,
    });

    await this._runLoop();
    this._running = false;
  }

  /**
   * Stop the orchestrator gracefully.
   * Cancels any pending retry timer and disconnects the active session.
   */
  stop(reason = 'UserStop') {
    this._logger.info(Events.SHUTDOWN, { reason });
    this._retrier.shutdown();
    this._executor.disconnect();
    this._clearRotationTimer();

    if (!this._fsm.isTerminal()) {
      try {
        this._fsm.transition(States.CANCELLED, { reason });
      } catch (_) {}
    }
  }

  /**
   * Get a snapshot of current metrics.
   */
  metrics() {
    return this._metrics.snapshot();
  }

  // ── Core loop ───────────────────────────────────────────────────────────────

  async _runLoop() {
    // Entry: transition from IDLE → PINGING
    try {
      this._fsm.transition(States.PINGING, { reason: 'initial' });
    } catch (err) {
      this._logger.error('LOOP_START_FAILED', { error: err.message });
      return;
    }

    while (!this._fsm.isTerminal()) {
      // ── PINGING ────────────────────────────────────────────────────────
      if (this._fsm.is(States.PINGING)) {
        const pingResult = await this._pinger.ping(this._cfg.host, this._cfg.port);

        if (this._fsm.isTerminal()) break;

        if (!pingResult.online) {
          // Server not reachable → go WAITING, schedule retry ping
          this._fsm.transition(States.WAITING, { reason: 'ping_failed', error: pingResult.error });

          const shouldContinue = await this._waitRetry();
          if (!shouldContinue) break;

          if (!this._fsm.isTerminal()) {
            this._fsm.transition(States.PINGING, { reason: 'retry_after_ping_fail' });
          }
          continue;
        }

        const classification = this._placeholderClassifier.classify(pingResult);
        
        if (classification === Classification.OFFLINE_PLACEHOLDER) {
          this._logger.info('PLACEHOLDER_DETECTED', { reason: 'Offline Aternos placeholder detected' });
          this._fsm.transition(States.WAITING, { reason: 'placeholder_detected', error: 'Aternos offline placeholder' });
          
          const shouldContinue = await this._waitRetry();
          if (!shouldContinue) break;

          if (!this._fsm.isTerminal()) {
            this._fsm.transition(States.PINGING, { reason: 'retry_after_placeholder' });
          }
          continue;
        } else if (classification === Classification.STARTING) {
          this._logger.info('SERVER_STARTING', { reason: 'Server is in starting state' });
          this._fsm.transition(States.WAITING, { reason: 'server_starting', error: 'Server is starting up' });
          
          const shouldContinue = await this._waitRetry();
          if (!shouldContinue) break;

          if (!this._fsm.isTerminal()) {
            this._fsm.transition(States.PINGING, { reason: 'retry_after_starting' });
          }
          continue;
        }

        // Ping succeeded and real server detected → brief stabilization before joining
        this._fsm.transition(States.STARTING, {
          reason:  'ping_succeeded',
          players: pingResult.players,
          version: pingResult.version,
        });
      }

      // ── STARTING (stabilization) ────────────────────────────────────────
      if (this._fsm.is(States.STARTING)) {
        this._logger.info(Events.STABILIZING, { delayMs: this._cfg.stabilizationMs });
        await sleep(this._cfg.stabilizationMs);

        if (this._fsm.isTerminal()) break;
        this._fsm.transition(States.JOINING, { reason: 'stabilization_complete' });
      }

      // ── JOINING ─────────────────────────────────────────────────────────
      if (this._fsm.is(States.JOINING)) {
        let session;
        try {
          session = await this._executor.join();
        } catch (err) {
          if (this._fsm.isTerminal()) break;

          const classification = this._classifier.classify(err);
          this._logger.warn(Events.JOIN_FAILED, {
            error: err.message,
            code:  classification.code,
            disposition: classification.disposition,
          });
          this._metrics.recordFailure();

          if (classification.disposition === 'PERMANENT') {
            this._logger.error(Events.PERMANENT_FAILURE, {
              code:   classification.code,
              reason: classification.reason,
            });
            this._fsm.transition(States.FAILED, { reason: classification.reason });
            break;
          }

          // Retryable — enter WAITING
          if (!this._retrier.exhausted) {
            this._fsm.transition(States.WAITING, { reason: 'join_failed_retryable', error: err.message });
            const shouldContinue = await this._waitRetry();
            if (!shouldContinue) break;

            if (!this._fsm.isTerminal()) {
              this._fsm.transition(States.PINGING, { reason: 'retry_after_join_fail' });
            }
            continue;
          } else {
            this._logger.error(Events.MAX_RETRIES, { attempt: this._retrier.attempt });
            this._fsm.transition(States.FAILED, { reason: 'max_retries_exceeded' });
            break;
          }
        }

        if (this._fsm.isTerminal()) break;

        // Joined successfully
        this._fsm.transition(States.CONNECTED, { username: session.username });
        this._retrier.reset();

        // Schedule automatic rotation after N hours
        this._scheduleRotation();

        // Wait for disconnect (JoinExecutor will tear down the session on error/disconnect)
        await this._waitForDisconnect(session);
        this._clearRotationTimer();

        if (this._fsm.isTerminal()) break;

        // Disconnected — re-enter wait/retry cycle
        this._metrics.recordDisconnect();
        this._fsm.transition(States.WAITING, { reason: 'session_ended' });

        const shouldContinue = await this._waitRetry();
        if (!shouldContinue) break;

        if (!this._fsm.isTerminal()) {
          this._fsm.transition(States.PINGING, { reason: 'retry_after_disconnect' });
        }
      }
    }

    // Emit final metrics snapshot when loop ends
    this._logger.info(Events.METRICS_SNAPSHOT, this._metrics.snapshot());
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Wait for the retry delay. Returns true to continue, false to abort.
   */
  async _waitRetry() {
    if (this._retrier.exhausted) {
      this._logger.error(Events.MAX_RETRIES, { attempt: this._retrier.attempt });
      this._fsm.transition(States.FAILED, { reason: 'max_retries_exceeded' });
      return false;
    }

    try {
      await this._retrier.schedule();
      return !this._fsm.isTerminal();
    } catch (err) {
      if (err instanceof CancellationError) {
        return false;
      }
      if (err.message && err.message.includes('Max retries')) {
        this._logger.error(Events.MAX_RETRIES, { attempt: this._retrier.attempt });
        if (!this._fsm.isTerminal()) {
          this._fsm.transition(States.FAILED, { reason: 'max_retries_exceeded' });
        }
        return false;
      }
      throw err;
    }
  }

  /**
   * Wait for the bot session to end (disconnect, error, or rotation timer).
   * This is a Promise that resolves when the session's bot fires disconnect/error/close.
   */
  _waitForDisconnect(session) {
    return new Promise((resolve) => {
      const { bot } = session;

      const onEnd = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        bot.removeListener('disconnect', onEnd);
        bot.removeListener('error',      onEnd);
        bot.removeListener('close',      onEnd);
      };

      bot.once('disconnect', onEnd);
      bot.once('error',      onEnd);
      bot.once('close',      onEnd);

      // Also resolve if stop() is called (FSM goes terminal)
      const poll = setInterval(() => {
        if (this._fsm.isTerminal()) {
          cleanup();
          clearInterval(poll);
          resolve();
        }
      }, 500);

      // Store the poll handle so it can be cleared on stop()
      this._disconnectPoll = poll;
    }).finally(() => {
      if (this._disconnectPoll) {
        clearInterval(this._disconnectPoll);
        this._disconnectPoll = null;
      }
    });
  }

  /**
   * Schedule automatic reconnect after reconnectHours.
   * This mimics the original bot behaviour of resetting every N hours to
   * prevent Aternos from kicking idle players.
   */
  _scheduleRotation() {
    this._clearRotationTimer();
    const ms = this._cfg.reconnectHours * 60 * 60 * 1000;
    this._scheduledRotation = setTimeout(() => {
      this._logger.info('SCHEDULED_ROTATION', { reconnectHours: this._cfg.reconnectHours });
      this._executor.disconnect();
    }, ms);
  }

  _clearRotationTimer() {
    if (this._scheduledRotation) {
      clearTimeout(this._scheduledRotation);
      this._scheduledRotation = null;
    }
  }
}

module.exports = { ConnectionManager };
