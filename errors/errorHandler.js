'use strict';

/**
 * errorHandler.js
 * Maps raw error strings (from bot stdout/stderr) to structured notifications.
 * This module is stateless — it only classifies; it does not save anything.
 *
 * Usage:
 *   const { classifyBotMessage } = require('../errors/errorHandler');
 *   const result = classifyBotMessage(rawString, { projectType: 'java' });
 *   // result is null  ─ not a meaningful error (e.g. normal AFK tick)
 *   // result is { errorCode, title, message, suggestion, severity }
 */

const {
  ECONNREFUSED,
  ETIMEDOUT,
  ENOTFOUND,
  EHOSTUNREACH,
  ECONNRESET,
  EPIPE,
  VERSION_MISMATCH,
  PROTOCOL_MISMATCH,
  EDITION_MISMATCH,
  SERVER_FULL,
  CONNECT_TIMEOUT,
  INVALID_SESSION,
  NOT_PREMIUM,
  ALREADY_LOGGED_IN,
  BOT_KICKED,
  BOT_BANNED,
  BOT_DISCONNECTED,
  RECONNECT_FAILED,
  PROCESS_CRASHED,
  PROCESS_EXITED,
  CREATION_ERROR,
  UNKNOWN_ERROR,
  MESSAGE_TEMPLATES
} = require('./errorCodes');

// ── Ordered classification rules ─────────────────────────────────────────────
// Each rule: { code, test: (lower) => bool, extractRaw?: (lower, original) => string }
// Rules are evaluated top-to-bottom; the first match wins.
const CLASSIFICATION_RULES = [

  // ── Network / OS errors ────────────────────────────────────────────────────
  {
    code: ECONNREFUSED,
    test: (s) => s.includes('econnrefused') || s.includes('connection refused')
  },
  {
    code: ETIMEDOUT,
    test: (s) => s.includes('etimedout') || s.includes('connection timed out') || (s.includes('timed out') && !s.includes('kutish vaqti'))
  },
  {
    code: ENOTFOUND,
    test: (s) => s.includes('enotfound') || s.includes('getaddrinfo') || s.includes('dns') && s.includes('not found')
  },
  {
    code: EHOSTUNREACH,
    test: (s) => s.includes('ehostunreach') || s.includes('no route to host')
  },
  {
    code: ECONNRESET,
    test: (s) => s.includes('econnreset') || s.includes('connection reset')
  },
  {
    code: EPIPE,
    test: (s) => s.includes('epipe') || s.includes('broken pipe')
  },

  // ── Connect timeout from bot watchdog ─────────────────────────────────────
  {
    code: CONNECT_TIMEOUT,
    test: (s) => s.includes('connecttimeout') || s.includes('connectiontimeout') ||
                 (s.includes('connection timed out') && s.includes('after'))
  },

  // ── Edition mismatch (Java bot hitting Bedrock or vice-versa) ─────────────
  {
    code: EDITION_MISMATCH,
    test: (s) =>
      s.includes('edition') ||
      (s.includes('bedrock') && s.includes('java')) ||
      s.includes('udp') && s.includes('tcp') ||
      s.includes('raknet') && s.includes('protocol')
  },

  // ── Version / protocol mismatch ───────────────────────────────────────────
  {
    code: VERSION_MISMATCH,
    test: (s) =>
      (s.includes('version') && (s.includes('mismatch') || s.includes('unsupported') || s.includes('incompatible'))) ||
      s.includes('outdated client') || s.includes('outdated server') ||
      /please use minecraft\s+[\d.]+/i.test(s),
    extractRaw: (s, original) => {
      // Try to pull out the expected version from the message
      const m = original.match(/[\d]+\.[\d]+(?:\.[\d]+)?/g);
      return m ? m.join(' / ') : '';
    }
  },
  {
    code: PROTOCOL_MISMATCH,
    test: (s) =>
      (s.includes('protocol') && (s.includes('mismatch') || s.includes('unsupported') || s.includes('not supported'))) ||
      s.includes('protocol version') ||
      s.includes('incompatible protocol')
  },

  // ── Server full ───────────────────────────────────────────────────────────
  {
    code: SERVER_FULL,
    test: (s) => s.includes('server is full') || s.includes('server full') || s.includes('the server is full')
  },

  // ── Auth errors ───────────────────────────────────────────────────────────
  {
    code: ALREADY_LOGGED_IN,
    test: (s) => s.includes('already logged in') || s.includes('already connected') || s.includes('duplicate login')
  },
  {
    code: NOT_PREMIUM,
    test: (s) =>
      s.includes('not premium') ||
      s.includes('online mode') ||
      s.includes('invalid session') && s.includes('online') ||
      s.includes('authentication') && s.includes('failed') && !s.includes('creation')
  },
  {
    code: INVALID_SESSION,
    test: (s) =>
      s.includes('invalid session') ||
      s.includes('session expired') ||
      s.includes('failed to verify username')
  },

  // ── Ban ───────────────────────────────────────────────────────────────────
  {
    code: BOT_BANNED,
    test: (s) => s.includes('banned') || s.includes('permanently banned'),
    extractRaw: (s, original) => {
      const m = original.match(/banned[:\s]+(.+)/i);
      return m ? m[1].trim() : '';
    }
  },

  // ── Kick ─────────────────────────────────────────────────────────────────
  {
    code: BOT_KICKED,
    test: (s) =>
      s.includes('kicked') ||
      s.includes('chiqarib yuborildi') ||
      s.includes('you have been kicked') ||
      (s.startsWith('kicked:') || s.includes('kickevent') || s.includes('kick reason')),
    extractRaw: (s, original) => {
      // Parse reason from patterns like: "Kicked: <reason>" or "kicked (reason)"
      const m = original.match(/[Kk]icked[:\s]+(.+)/);
      if (m) return m[1].trim().replace(/^"(.*)"$/, '$1');
      const m2 = original.match(/chiqarib yuborildi[:\s]+(.+)/i);
      if (m2) return m2[1].trim();
      return '';
    }
  },

  // ── Creation error (mineflayer.createBot threw) ───────────────────────────
  {
    code: CREATION_ERROR,
    test: (s) => s.includes('creationerror') || s.includes('bot yaratish xatosi') || s.includes('bot creation'),
    extractRaw: (s, original) => {
      const m = original.match(/CreationError:\s*(.+)/i);
      return m ? m[1].trim() : '';
    }
  },

  // ── Process crashed ───────────────────────────────────────────────────────
  {
    code: PROCESS_CRASHED,
    test: (s) =>
      s.includes('unhandled exception') ||
      s.includes('uncaughtexception') ||
      s.includes('unhandledrejection') ||
      s.includes('fatal error') ||
      (s.includes('error') && s.includes('stack'))
  },

  // ── Process exited (non-zero) ─────────────────────────────────────────────
  {
    code: PROCESS_EXITED,
    test: (s) => /process exited with code [1-9]/.test(s),
    extractRaw: (s, original) => {
      const m = original.match(/code\s+(\S+)/i);
      return m ? m[1].trim() : '';
    }
  },

  // ── Generic disconnect / end ──────────────────────────────────────────────
  {
    code: BOT_DISCONNECTED,
    test: (s) =>
      s.includes('disconnect') ||
      s.includes('connectionend') ||
      s.includes('connectionclosed') ||
      s.includes('uzildi') ||
      s.includes('ulanish yopildi')
  }
];

// ── Lines we deliberately ignore (not errors, just noise) ────────────────────
const NOISE_PATTERNS = [
  /afk harakat/i,
  /yurish harakati/i,
  /sakrash/i,
  /lookAround/i,
  /AFK Yurish/i,
  /o'yinchi/i,              // player join/leave counter lines
  /playerJoined/i,
  /playerLeft/i,
  /qayta ulanish rejalashtirildi/i,  // "reconnect scheduled" – already handled separately
  /kutish vaqti/i,
  /scheduledrotation/i,
  /reconnect rejalashtirildi/i
];

/**
 * Build the final notification payload from a rule match.
 *
 * @param {string} code
 * @param {string} rawDetail  - optional extracted detail string
 * @returns {{ errorCode, title, message, suggestion, severity }}
 */
function buildPayload(code, rawDetail = '') {
  const tpl = MESSAGE_TEMPLATES[code] || MESSAGE_TEMPLATES[UNKNOWN_ERROR];

  const message = typeof tpl.message === 'function'
    ? tpl.message(rawDetail)
    : tpl.message;

  return {
    errorCode:  code,
    title:      tpl.title,
    message,
    suggestion: tpl.suggestion,
    severity:   tpl.severity
  };
}

/**
 * classifyBotMessage
 *
 * Given a raw string from bot stdout/stderr, returns a structured notification
 * payload or null if the string is not worth notifying the user about.
 *
 * @param {string} raw           - the raw log line from the child process
 * @param {{ projectType?: string }} [opts]
 * @returns {{ errorCode, title, message, suggestion, severity } | null}
 */
function classifyBotMessage(raw, opts = {}) {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Skip known-noisy lines
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }

  const lower = trimmed.toLowerCase();

  // Must contain some indication of an error/problem to proceed
  const hasErrorSignal =
    lower.includes('error') ||
    lower.includes('xatolik') ||
    lower.includes('kicked') ||
    lower.includes('xato') ||
    lower.includes('banned') ||
    lower.includes('disconnect') ||
    lower.includes('uzildi') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('refused') ||
    lower.includes('mismatch') ||
    lower.includes('exited') ||
    lower.includes('crashed') ||
    lower.includes('unhandled') ||
    lower.includes('chiqarib') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout');

  if (!hasErrorSignal) return null;

  // Walk classification rules
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.test(lower)) {
      const rawDetail = rule.extractRaw ? rule.extractRaw(lower, trimmed) : '';
      return buildPayload(rule.code, rawDetail);
    }
  }

  // Default: something error-ish but unrecognised
  return buildPayload(UNKNOWN_ERROR, trimmed.slice(0, 200));
}

/**
 * classifyProcessExit
 *
 * Called when the child process closes.
 * Exit code 0 → null (normal stop, no notification needed).
 * Non-zero → PROCESS_EXITED notification.
 *
 * @param {number|null} code
 * @returns {{ errorCode, title, message, suggestion, severity } | null}
 */
function classifyProcessExit(code) {
  if (code === 0 || code === null) return null;
  return buildPayload(PROCESS_EXITED, String(code));
}

module.exports = { classifyBotMessage, classifyProcessExit, buildPayload };
