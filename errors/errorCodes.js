'use strict';

/**
 * errorCodes.js
 * All error code constants and structured message templates.
 * Every entry maps a code → { title, message, suggestion, severity }
 */

// ── Connection Errors ────────────────────────────────────────────────────────
const ECONNREFUSED = 'ECONNREFUSED';
const ETIMEDOUT    = 'ETIMEDOUT';
const ENOTFOUND    = 'ENOTFOUND';
const EHOSTUNREACH = 'EHOSTUNREACH';
const ECONNRESET   = 'ECONNRESET';
const EPIPE        = 'EPIPE';

// ── Minecraft / Protocol Errors ──────────────────────────────────────────────
const VERSION_MISMATCH   = 'VERSION_MISMATCH';
const PROTOCOL_MISMATCH  = 'PROTOCOL_MISMATCH';
const EDITION_MISMATCH   = 'EDITION_MISMATCH';  // Java bot → Bedrock server or vice-versa
const SERVER_FULL        = 'SERVER_FULL';
const CONNECT_TIMEOUT    = 'CONNECT_TIMEOUT';

// ── Auth Errors ──────────────────────────────────────────────────────────────
const INVALID_SESSION    = 'INVALID_SESSION';
const NOT_PREMIUM        = 'NOT_PREMIUM';
const ALREADY_LOGGED_IN  = 'ALREADY_LOGGED_IN';

// ── Runtime / Kick Errors ────────────────────────────────────────────────────
const BOT_KICKED         = 'BOT_KICKED';
const BOT_BANNED         = 'BOT_BANNED';
const BOT_DISCONNECTED   = 'BOT_DISCONNECTED';
const RECONNECT_FAILED   = 'RECONNECT_FAILED';
const PROCESS_CRASHED    = 'PROCESS_CRASHED';
const PROCESS_EXITED     = 'PROCESS_EXITED';
const CREATION_ERROR     = 'CREATION_ERROR';

// ── Fallback ─────────────────────────────────────────────────────────────────
const UNKNOWN_ERROR      = 'UNKNOWN_ERROR';

// ── Severity Levels ──────────────────────────────────────────────────────────
const SEVERITY = {
  INFO:    'info',
  WARNING: 'warning',
  ERROR:   'error'
};

/**
 * Template map: code → { title, message, suggestion, severity }
 * `message` and `suggestion` may be functions that receive the raw error string.
 */
const MESSAGE_TEMPLATES = {
  [ECONNREFUSED]: {
    title:      'Server Offline',
    message:    'The bot could not connect because the server refused the connection.',
    suggestion: 'Make sure the Minecraft server is running, the IP address is correct, and the port is open.',
    severity:   SEVERITY.ERROR
  },
  [ETIMEDOUT]: {
    title:      'Connection Timed Out',
    message:    'The connection attempt timed out. The server did not respond in time.',
    suggestion: 'Check your server\'s IP and port. If using Aternos or a free host, the server may have gone to sleep — start it first.',
    severity:   SEVERITY.ERROR
  },
  [ENOTFOUND]: {
    title:      'Host Not Found',
    message:    'The domain name or IP address could not be resolved.',
    suggestion: 'Double-check the server address. If it is a domain (e.g. play.example.com), make sure the DNS entry is correct.',
    severity:   SEVERITY.ERROR
  },
  [EHOSTUNREACH]: {
    title:      'Host Unreachable',
    message:    'The network path to the server is unavailable.',
    suggestion: 'Check your network connection or try again later. The server may be behind a firewall.',
    severity:   SEVERITY.ERROR
  },
  [ECONNRESET]: {
    title:      'Connection Reset',
    message:    'The connection to the server was forcibly reset by the remote host.',
    suggestion: 'This often happens when the server restarts. The bot will reconnect automatically.',
    severity:   SEVERITY.WARNING
  },
  [EPIPE]: {
    title:      'Broken Pipe',
    message:    'The network connection was broken while data was being transmitted.',
    suggestion: 'The bot will reconnect automatically. If this keeps happening, check server stability.',
    severity:   SEVERITY.WARNING
  },
  [VERSION_MISMATCH]: {
    title:      'Version Mismatch',
    message:    (raw) => `The bot version does not match the server version. ${raw ? `Detail: ${raw}` : ''}`.trim(),
    suggestion: 'Go to the Edit Server screen and choose the correct Minecraft version for this server.',
    severity:   SEVERITY.ERROR
  },
  [PROTOCOL_MISMATCH]: {
    title:      'Protocol Mismatch',
    message:    'The protocol version used by the bot is not accepted by the server.',
    suggestion: 'Update the bot version in the Edit Server screen to match the server\'s protocol.',
    severity:   SEVERITY.ERROR
  },
  [EDITION_MISMATCH]: {
    title:      'Edition Mismatch',
    message:    'You are trying to connect a Java bot to a Bedrock server (or vice-versa).',
    suggestion: 'Delete this server entry and create a new one selecting the correct edition (Java or Bedrock).',
    severity:   SEVERITY.ERROR
  },
  [SERVER_FULL]: {
    title:      'Server Full',
    message:    'The server has reached its maximum player limit and cannot accept more connections.',
    suggestion: 'Wait until a player slot opens up. The bot will reconnect automatically.',
    severity:   SEVERITY.WARNING
  },
  [CONNECT_TIMEOUT]: {
    title:      'Connection Timed Out',
    message:    'The bot took too long to connect and gave up waiting.',
    suggestion: 'Check if the server is online and accepting connections. Ensure the IP and port are correct.',
    severity:   SEVERITY.ERROR
  },
  [INVALID_SESSION]: {
    title:      'Invalid Session',
    message:    'The bot\'s Minecraft session is invalid or has expired.',
    suggestion: 'This bot uses offline mode — if the server requires premium authentication, it will reject offline players.',
    severity:   SEVERITY.ERROR
  },
  [NOT_PREMIUM]: {
    title:      'Not Premium Account',
    message:    'The server requires a valid premium Minecraft account (online mode).',
    suggestion: 'Use a server that allows cracked / offline mode, or configure the server to allow offline players.',
    severity:   SEVERITY.ERROR
  },
  [ALREADY_LOGGED_IN]: {
    title:      'Already Logged In',
    message:    'An account with the same username is already connected to the server.',
    suggestion: 'The bot will rotate to a different username automatically on the next reconnect.',
    severity:   SEVERITY.WARNING
  },
  [BOT_KICKED]: {
    title:      'Bot Kicked',
    message:    (raw) => `The bot was kicked from the server.${raw ? ` Reason: "${raw}"` : ''}`,
    suggestion: 'Check the kick reason. If it is AFK-related, the server may have an AFK-kick plugin. The bot will reconnect.',
    severity:   SEVERITY.WARNING
  },
  [BOT_BANNED]: {
    title:      'Bot Banned',
    message:    (raw) => `The bot account was banned from the server.${raw ? ` Reason: "${raw}"` : ''}`,
    suggestion: 'The username may have been banned by the server admin. The bot will use a different username on the next reconnect.',
    severity:   SEVERITY.ERROR
  },
  [BOT_DISCONNECTED]: {
    title:      'Bot Disconnected',
    message:    (raw) => `The bot lost its connection to the server.${raw ? ` Reason: "${raw}"` : ''}`,
    suggestion: 'The bot will attempt to reconnect automatically using exponential backoff.',
    severity:   SEVERITY.WARNING
  },
  [RECONNECT_FAILED]: {
    title:      'Reconnect Failed',
    message:    'The bot failed to reconnect after multiple attempts.',
    suggestion: 'Check that the server is still reachable and the configuration is correct.',
    severity:   SEVERITY.ERROR
  },
  [PROCESS_CRASHED]: {
    title:      'Bot Process Crashed',
    message:    (raw) => `The bot process crashed unexpectedly.${raw ? ` Error: ${raw}` : ''}`,
    suggestion: 'Check the logs for the full error. The bot will restart automatically.',
    severity:   SEVERITY.ERROR
  },
  [PROCESS_EXITED]: {
    title:      'Bot Process Exited',
    message:    (raw) => `The bot process stopped.${raw ? ` Exit code: ${raw}` : ''}`,
    suggestion: 'If the exit was unexpected, check the bot logs for error details.',
    severity:   SEVERITY.INFO
  },
  [CREATION_ERROR]: {
    title:      'Bot Creation Failed',
    message:    (raw) => `Failed to initialise the bot.${raw ? ` Reason: ${raw}` : ''}`,
    suggestion: 'Verify the version and server type settings. Check the logs for the full error.',
    severity:   SEVERITY.ERROR
  },
  [UNKNOWN_ERROR]: {
    title:      'Unknown Error',
    message:    (raw) => `An unexpected error occurred.${raw ? ` Detail: ${raw}` : ''}`,
    suggestion: 'Check the bot logs for more information.',
    severity:   SEVERITY.ERROR
  }
};

module.exports = {
  // Code constants
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
  // Collections
  SEVERITY,
  MESSAGE_TEMPLATES
};
