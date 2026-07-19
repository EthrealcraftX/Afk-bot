'use strict';

/**
 * ConnectionStateMachine.js
 *
 * Explicit Finite State Machine for the connection lifecycle.
 *
 * Design goals:
 *  - Every state transition is logged and validated
 *  - Invalid transitions throw rather than silently corrupt state
 *  - State is readable (e.g. isConnected(), isTerminal()) so callsites
 *    don't need to know the full enum
 *
 * State graph (deterministic):
 *
 *   IDLE → RESOLVING → PINGING → STARTING → JOINING → CONNECTED
 *                         ↑                               |
 *                         └──── WAITING ←─────────────────┘
 *                                 |  (after retry delay)
 *                                 └──────────────────────── PINGING
 *
 *   Any state → CANCELLED  (user calls stop())
 *   Any state → FAILED     (permanent error / max retries)
 */

const { Events } = require('./Logger');

// ── State constants ──────────────────────────────────────────────────────────

const States = Object.freeze({
  IDLE:       'IDLE',
  RESOLVING:  'RESOLVING',
  PINGING:    'PINGING',
  STARTING:   'STARTING',
  WAITING:    'WAITING',
  JOINING:    'JOINING',
  CONNECTED:  'CONNECTED',
  FAILED:     'FAILED',
  CANCELLED:  'CANCELLED',
});

// ── Allowed transitions: Map<fromState, Set<toState>> ────────────────────────

const ALLOWED = new Map([
  [States.IDLE,      new Set([States.RESOLVING, States.PINGING, States.CANCELLED])],
  [States.RESOLVING, new Set([States.PINGING, States.FAILED, States.CANCELLED])],
  [States.PINGING,   new Set([States.STARTING, States.WAITING, States.FAILED, States.CANCELLED])],
  [States.STARTING,  new Set([States.JOINING, States.WAITING, States.FAILED, States.CANCELLED])],
  [States.WAITING,   new Set([States.PINGING, States.FAILED, States.CANCELLED])],
  [States.JOINING,   new Set([States.CONNECTED, States.WAITING, States.FAILED, States.CANCELLED])],
  [States.CONNECTED, new Set([States.WAITING, States.FAILED, States.CANCELLED])],
  [States.FAILED,    new Set([States.IDLE])],       // allow reset
  [States.CANCELLED, new Set([States.IDLE])],       // allow reset
]);

class ConnectionStateMachine {
  /**
   * @param {{ logger: import('./Logger').Logger }} deps
   */
  constructor({ logger }) {
    this._logger  = logger;
    this._current = States.IDLE;
    this._history = [];   // last 20 transitions for diagnostics
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  get current() { return this._current; }

  is(state) { return this._current === state; }

  isConnected() { return this._current === States.CONNECTED; }

  /** Terminal states that never produce further work. */
  isTerminal() {
    return this._current === States.FAILED || this._current === States.CANCELLED;
  }

  /** States where join is actively happening or about to happen. */
  isActive() {
    return this._current === States.PINGING  ||
           this._current === States.STARTING ||
           this._current === States.JOINING  ||
           this._current === States.WAITING;
  }

  history() { return [...this._history]; }

  // ── Transition ──────────────────────────────────────────────────────────────

  /**
   * Transitions to the next state.
   * Throws if the transition is not allowed (programming error, not user error).
   *
   * @param {string} nextState - one of States.*
   * @param {{ reason?: string, [key: string]: any }} [ctx]
   */
  transition(nextState, ctx = {}) {
    const allowed = ALLOWED.get(this._current);
    if (!allowed || !allowed.has(nextState)) {
      throw new Error(
        `[FSM] Invalid transition: ${this._current} → ${nextState}. ` +
        `Allowed: ${[...(allowed || [])].join(', ')}`
      );
    }

    const prev = this._current;
    this._current = nextState;

    const entry = { from: prev, to: nextState, ts: Date.now(), ...ctx };
    this._history.push(entry);
    if (this._history.length > 20) this._history.shift();

    this._logger.info(Events.STATE_CHANGE, { from: prev, to: nextState, ...ctx });
  }

  /**
   * Resets the machine back to IDLE (allowed from FAILED or CANCELLED).
   */
  reset() {
    if (!this.isTerminal()) {
      throw new Error(`[FSM] reset() called from non-terminal state: ${this._current}`);
    }
    this.transition(States.IDLE, { reason: 'reset' });
  }
}

module.exports = { ConnectionStateMachine, States };
