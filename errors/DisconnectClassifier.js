'use strict';

/**
 * DisconnectClassifier.js
 *
 * Pure classification function for Minecraft bot disconnect events.
 *
 * Design constraints:
 *  - No side effects (no logging, no state mutation, no process.exit)
 *  - Never throws — always returns a valid DisconnectDecision
 *  - Reusable by both Java and Bedrock templates
 *  - Rule-table driven: adding new rules requires zero logic changes
 *  - Classification priority:
 *      1. error.code   (most reliable — OS / library constant)
 *      2. error.name   (typed error classes)
 *      3. normalised message / reason text (pattern matching)
 *      4. serialised object fallback
 *      5. UNKNOWN      (always retryable — fail open)
 */

// ── Category constants ────────────────────────────────────────────────────────

const Category = Object.freeze({
  // Retryable
  NETWORK:             'NETWORK',
  SERVER_OFFLINE:      'SERVER_OFFLINE',
  SERVER_STARTING:     'SERVER_STARTING',
  ATERNOS_PLACEHOLDER: 'ATERNOS_PLACEHOLDER',
  // Non-Retryable
  OUTDATED_CLIENT:     'OUTDATED_CLIENT',
  UNSUPPORTED_PROTOCOL:'UNSUPPORTED_PROTOCOL',
  AUTHENTICATION_FAILED:'AUTHENTICATION_FAILED',
  INVALID_TOKEN:       'INVALID_TOKEN',
  INVALID_USERNAME:    'INVALID_USERNAME',
  BANNED:              'BANNED',
  WHITELISTED:         'WHITELISTED',
  // Fallback
  UNKNOWN:             'UNKNOWN',
});

// ── Rule table ────────────────────────────────────────────────────────────────
//
// Priority: rules are evaluated top-to-bottom; first match wins.
// Each rule may specify:
//   codes    — matched against error.code (exact, case-insensitive)
//   names    — matched against error.name (exact, case-insensitive)
//   patterns — matched against normalised message string (regex)
//
// Fields per rule:
//   category    — DisconnectCategory constant
//   shouldRetry — boolean
//   severity    — 'info' | 'warn' | 'error'
//   confidence  — 'high' | 'medium' | 'low'
//   reason      — human-readable summary of why this matched
//   adminAction — (optional) what an admin should do

const RULES = [
  // ── High-confidence code matches (network / OS layer) ─────────────────────
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'TCP connection reset by remote peer',
    codes:       ['ECONNRESET'],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'Connection refused — server port is closed or unreachable',
    codes:       ['ECONNREFUSED'],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'Connection attempt timed out',
    codes:       ['ETIMEDOUT', 'ESOCKETTIMEDOUT'],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'DNS resolution failed — hostname could not be found',
    codes:       ['ENOTFOUND', 'EAI_AGAIN'],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'No route to host — network path unavailable',
    codes:       ['EHOSTUNREACH', 'ENETUNREACH'],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'high',
    reason:      'Broken connection pipe',
    codes:       ['EPIPE', 'ECONNABORTED'],
  },

  // ── Pattern matches — non-retryable permanent failures ────────────────────
  {
    category:    Category.OUTDATED_CLIENT,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Server requires a newer or different Minecraft client version',
    adminAction: 'Update the bot version in the project settings to match the server version',
    patterns: [
      /outdated client/i,
      /client out of date/i,
      /disconnectionscreen\.outdated/i,
      /please use minecraft\s+[\d.]+/i,
      /outdated server/i,
    ],
  },
  {
    category:    Category.UNSUPPORTED_PROTOCOL,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Protocol version is not compatible with the server',
    adminAction: 'Verify the protocol version in project configuration matches the server',
    patterns: [
      /unsupported protocol/i,
      /incompatible protocol/i,
      /protocol mismatch/i,
      /unsupported version/i,
      /invalid version/i,
      /version mismatch/i,
    ],
  },
  {
    category:    Category.AUTHENTICATION_FAILED,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Bot account failed server authentication',
    adminAction: 'Verify account credentials; ensure the server accepts offline-mode or the correct auth method',
    patterns: [
      /failed to verify username/i,
      /not authenticated/i,
      /not premium/i,
      /requires a premium account/i,
      /premium account required/i,
      /authentication failed/i,
      /login failed/i,
      /disconnectionscreen\.notauthenticated/i,
    ],
  },
  {
    category:    Category.INVALID_TOKEN,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Session token is invalid or expired',
    adminAction: 'Re-authenticate the account or reset the session token',
    patterns: [
      /invalid session/i,
      /session expired/i,
      /bad login/i,
      /invalid token/i,
    ],
  },
  {
    category:    Category.INVALID_USERNAME,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Bot username contains invalid or illegal characters',
    adminAction: 'Update the username in the usernames file to use only valid Minecraft characters',
    patterns: [
      /invalid username/i,
      /illegal characters in username/i,
      /name contains invalid characters/i,
      /username.*invalid/i,
    ],
  },
  {
    category:    Category.BANNED,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Bot account is permanently banned from this server',
    adminAction: 'Use a different account username or contact the server administrator',
    patterns: [
      /you are banned/i,
      /banned from this server/i,
      /disconnectionscreen\.banned/i,
      /permanent ban/i,
    ],
  },
  {
    category:    Category.WHITELISTED,
    shouldRetry: false,
    severity:    'error',
    confidence:  'high',
    reason:      'Bot account is not on the server whitelist',
    adminAction: 'Add the bot username to the server whitelist or disable whitelist mode',
    patterns: [
      /not whitelisted/i,
      /not on the whitelist/i,
      /whitelist is on/i,
      /turn on the whitelist/i,
      /white-listed/i,
      /whitelist/i,
    ],
  },

  // ── Pattern matches — retryable transient failures ─────────────────────────
  {
    category:    Category.ATERNOS_PLACEHOLDER,
    shouldRetry: true,
    severity:    'info',
    confidence:  'high',
    reason:      'Aternos offline placeholder detected — real server is not yet available',
    patterns: [
      /aternos/i,
      /offline placeholder/i,
    ],
  },
  {
    category:    Category.SERVER_STARTING,
    shouldRetry: true,
    severity:    'info',
    confidence:  'medium',
    reason:      'Server is currently starting up',
    patterns: [
      /server starting/i,
      /starting up/i,
      /still starting/i,
      /server is loading/i,
      /server start/i,
    ],
  },
  {
    category:    Category.SERVER_OFFLINE,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'medium',
    reason:      'Server appears to be offline or unreachable',
    patterns: [
      /server is offline/i,
      /no further information/i,
      /server down/i,
      /connection refused/i,
    ],
  },
  {
    category:    Category.NETWORK,
    shouldRetry: true,
    severity:    'warn',
    confidence:  'medium',
    reason:      'Network-level disconnection',
    patterns: [
      /econnreset/i,
      /econnrefused/i,
      /etimedout/i,
      /enotfound/i,
      /ehostunreach/i,
      /getaddrinfo/i,
      /unknown host/i,
      /no such host/i,
      /connection reset/i,
      /connection was reset/i,
      /disconnected by peer/i,
      /read timeout/i,
      /timed out/i,
      /socket closed/i,
      /socket hang up/i,
      /epipe/i,
    ],
  },
];

// ── Fallback decision ─────────────────────────────────────────────────────────

const UNKNOWN_DECISION = Object.freeze({
  shouldRetry: true,
  category:    Category.UNKNOWN,
  severity:    'warn',
  confidence:  'low',
  reason:      'Disconnect reason could not be classified — retrying by default',
});

// ── Normalisation helpers ─────────────────────────────────────────────────────

/**
 * Safely stringify any input into a searchable lowercase string.
 * Performs exactly one normalisation pass — callers must not re-normalise.
 * Never throws.
 */
function normalise(input) {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input.toLowerCase().trim();
  if (typeof input === 'object') {
    // Prefer message first, then full JSON fallback
    const msg = input.message || input.reason || input.description || '';
    if (msg) return String(msg).toLowerCase().trim();
    try { return JSON.stringify(input).toLowerCase(); } catch (_) { return ''; }
  }
  return String(input).toLowerCase().trim();
}

// ── Main classifier ───────────────────────────────────────────────────────────

/**
 * Classify a disconnect event and return a reconnect decision.
 *
 * @param {Error|string|object|null|undefined} error
 * @returns {DisconnectDecision} - always a valid, non-null object
 *
 * Pure function: no side effects, no exceptions.
 */
function classify(error) {
  try {
    const code       = (typeof error === 'object' && error !== null) ? (error.code  || '') : '';
    const name       = (typeof error === 'object' && error !== null) ? (error.name  || '') : '';
    const normalised = normalise(error);

    for (const rule of RULES) {
      // Priority 1 — error.code (exact, case-insensitive)
      if (rule.codes && code) {
        if (rule.codes.some(c => c.toUpperCase() === code.toUpperCase())) {
          return buildDecision(rule);
        }
      }

      // Priority 2 — error.name (exact, case-insensitive)
      if (rule.names && name) {
        if (rule.names.some(n => n.toLowerCase() === name.toLowerCase())) {
          return buildDecision(rule);
        }
      }

      // Priority 3 — normalised message / text patterns
      if (rule.patterns && normalised) {
        if (rule.patterns.some(p => p.test(normalised))) {
          return buildDecision(rule);
        }
      }
    }

    return { ...UNKNOWN_DECISION };
  } catch (_) {
    // Classifier must never throw — return safe fallback
    return { ...UNKNOWN_DECISION };
  }
}

/** Build an immutable-style decision object from a matched rule. */
function buildDecision(rule) {
  const decision = {
    shouldRetry: rule.shouldRetry,
    category:    rule.category,
    severity:    rule.severity,
    confidence:  rule.confidence,
    reason:      rule.reason,
  };
  if (rule.adminAction) {
    decision.adminAction = rule.adminAction;
  }
  return decision;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  classify,
  Category,
  // Legacy alias for callers that used the old API name
  classifyDisconnect: classify,
};
