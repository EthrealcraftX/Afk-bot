'use strict';

/**
 * ErrorClassifier.js
 *
 * Classifies errors as RETRYABLE or PERMANENT.
 *
 * Design:
 *   Returns a structured classification object rather than a boolean, so
 *   callers can log the reason and adjust retry behaviour (e.g. version
 *   mismatch skips all future pings and goes straight to FAILED).
 *
 * Retryable errors: network transient, server starting, server full
 * Permanent errors: version mismatch, auth failure, malformed protocol, bad address
 */

const Disposition = Object.freeze({
  RETRYABLE: 'RETRYABLE',
  PERMANENT: 'PERMANENT',
});

// ── Classification rules (ordered; first match wins) ─────────────────────────

const RULES = [
  // ── PERMANENT — never retry these ─────────────────────────────────────────

  {
    code: 'VERSION_MISMATCH',
    disposition: Disposition.PERMANENT,
    reason: 'Version mismatch requires user action in panel',
    test: (s) =>
      s.includes('version') && (s.includes('mismatch') || s.includes('unsupported') || s.includes('incompatible')) ||
      s.includes('outdated client') || s.includes('outdated server') ||
      /please use minecraft\s+[\d.]+/i.test(s) ||
      s.includes('disconnectionscreen.outdated')
  },
  {
    code: 'PROTOCOL_MISMATCH',
    disposition: Disposition.PERMANENT,
    reason: 'Protocol mismatch requires version change',
    test: (s) =>
      (s.includes('protocol') && (s.includes('mismatch') || s.includes('not supported'))) ||
      s.includes('incompatible protocol')
  },
  {
    code: 'EDITION_MISMATCH',
    disposition: Disposition.PERMANENT,
    reason: 'Edition mismatch (Java vs Bedrock) requires config change',
    test: (s) =>
      s.includes('edition') ||
      (s.includes('bedrock') && s.includes('java'))
  },
  {
    code: 'INVALID_SESSION',
    disposition: Disposition.PERMANENT,
    reason: 'Auth session invalid — user must fix account settings',
    test: (s) =>
      s.includes('invalid session') || s.includes('failed to verify username') ||
      s.includes('session expired') || s.includes('not authenticated') ||
      s.includes('disconnectionscreen.notauthenticated')
  },
  {
    code: 'NOT_PREMIUM',
    disposition: Disposition.PERMANENT,
    reason: 'Account is not premium on online-mode server',
    test: (s) =>
      s.includes('not premium') || s.includes('online mode') ||
      (s.includes('authentication') && s.includes('failed'))
  },
  {
    code: 'MALFORMED_PACKET',
    disposition: Disposition.PERMANENT,
    reason: 'Malformed packet indicates fundamental protocol incompatibility',
    test: (s) =>
      s.includes('malformed') || s.includes('invalid packet') ||
      s.includes('packet read error') || s.includes('deserialization')
  },
  {
    code: 'BAD_ADDRESS',
    disposition: Disposition.PERMANENT,
    reason: 'Address cannot be resolved — DNS failure or wrong host',
    test: (s) =>
      s.includes('enotfound') || s.includes('getaddrinfo') ||
      s.includes('no such host')
  },
  {
    code: 'BOT_BANNED',
    disposition: Disposition.PERMANENT,
    reason: 'Account permanently banned from this server',
    test: (s) => s.includes('banned') && !s.includes('temp')
  },

  // ── RETRYABLE — transient errors worth retrying ────────────────────────────

  {
    code: 'SERVER_STARTING',
    disposition: Disposition.RETRYABLE,
    reason: 'Server is still starting up — keep pinging',
    test: (s) =>
      s.includes('server starting') || s.includes('starting up') ||
      s.includes('is coming online') || s.includes('still booting')
  },
  {
    code: 'SERVER_FULL',
    disposition: Disposition.RETRYABLE,
    reason: 'Server full — wait and retry',
    test: (s) => s.includes('server is full') || s.includes('server full')
  },
  {
    code: 'ECONNREFUSED',
    disposition: Disposition.RETRYABLE,
    reason: 'Connection refused — server likely starting',
    test: (s) => s.includes('econnrefused') || s.includes('connection refused')
  },
  {
    code: 'ETIMEDOUT',
    disposition: Disposition.RETRYABLE,
    reason: 'Timeout — transient network or server not yet accepting connections',
    test: (s) =>
      s.includes('etimedout') || s.includes('timed out') ||
      s.includes('connection timeout') || s.includes('connecttimeout')
  },
  {
    code: 'ECONNRESET',
    disposition: Disposition.RETRYABLE,
    reason: 'Connection reset — server restarted or network glitch',
    test: (s) => s.includes('econnreset') || s.includes('connection reset')
  },
  {
    code: 'EPIPE',
    disposition: Disposition.RETRYABLE,
    reason: 'Broken pipe — transient network failure',
    test: (s) => s.includes('epipe') || s.includes('broken pipe')
  },
  {
    code: 'EHOSTUNREACH',
    disposition: Disposition.RETRYABLE,
    reason: 'Host temporarily unreachable',
    test: (s) => s.includes('ehostunreach') || s.includes('no route to host')
  },
  {
    code: 'DISCONNECT_KICK',
    disposition: Disposition.RETRYABLE,
    reason: 'Kicked — will reconnect after delay',
    test: (s) => s.includes('kicked')
  },
  {
    code: 'CONNECTION_CLOSED',
    disposition: Disposition.RETRYABLE,
    reason: 'Connection closed — will reconnect',
    test: (s) =>
      s.includes('disconnect') || s.includes('connection closed') ||
      s.includes('connectionclosed')
  },
];

/**
 * @typedef {{ code: string, disposition: 'RETRYABLE'|'PERMANENT', reason: string }} Classification
 */

class ErrorClassifier {
  /**
   * @param {{ logger: import('./Logger').Logger }} deps
   */
  constructor({ logger }) {
    this._logger = logger;
  }

  /**
   * Classify an error message string.
   *
   * @param {string|Error} err
   * @returns {Classification}
   */
  classify(err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase().trim();

    for (const rule of RULES) {
      if (rule.test(msg)) {
        return {
          code:        rule.code,
          disposition: rule.disposition,
          reason:      rule.reason,
        };
      }
    }

    // Default: retryable unknown error
    return {
      code:        'UNKNOWN',
      disposition: Disposition.RETRYABLE,
      reason:      'Unrecognised error — defaulting to retryable',
    };
  }

  isPermanent(err) {
    return this.classify(err).disposition === Disposition.PERMANENT;
  }

  isRetryable(err) {
    return this.classify(err).disposition === Disposition.RETRYABLE;
  }
}

module.exports = { ErrorClassifier, Disposition };
