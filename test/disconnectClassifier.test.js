'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { classify, Category } = require('../errors/DisconnectClassifier');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeError(message, extras = {}) {
  const err = new Error(message);
  Object.assign(err, extras);
  return err;
}

function assertRetryable(input, expectedCategory) {
  const d = classify(input);
  assert.equal(d.shouldRetry, true, `Expected shouldRetry=true for: ${JSON.stringify(input)}`);
  if (expectedCategory) {
    assert.equal(d.category, expectedCategory, `Expected category=${expectedCategory}`);
  }
  assert.ok(d.severity,   'decision must have severity');
  assert.ok(d.confidence, 'decision must have confidence');
  assert.ok(d.reason,     'decision must have reason');
}

function assertPermanent(input, expectedCategory) {
  const d = classify(input);
  assert.equal(d.shouldRetry, false, `Expected shouldRetry=false for: ${JSON.stringify(input)}`);
  if (expectedCategory) {
    assert.equal(d.category, expectedCategory, `Expected category=${expectedCategory}`);
  }
  assert.ok(d.severity,     'decision must have severity');
  assert.ok(d.confidence,   'decision must have confidence');
  assert.ok(d.reason,       'decision must have reason');
  assert.ok(d.adminAction,  'permanent decisions must include adminAction');
}

// ── Tests: Network / OS error codes (code-first priority) ─────────────────────

describe('Network OS codes — retryable', () => {

  test('ECONNRESET via error.code', () => {
    assertRetryable(makeError('read ECONNRESET', { code: 'ECONNRESET' }), Category.NETWORK);
  });

  test('ECONNREFUSED via error.code', () => {
    assertRetryable(makeError('connect ECONNREFUSED 127.0.0.1:25565', { code: 'ECONNREFUSED' }), Category.NETWORK);
  });

  test('ETIMEDOUT via error.code', () => {
    assertRetryable(makeError('connect ETIMEDOUT', { code: 'ETIMEDOUT' }), Category.NETWORK);
  });

  test('ESOCKETTIMEDOUT via error.code', () => {
    assertRetryable(makeError('socket timeout', { code: 'ESOCKETTIMEDOUT' }), Category.NETWORK);
  });

  test('ENOTFOUND via error.code', () => {
    assertRetryable(makeError('getaddrinfo ENOTFOUND mc.example.com', { code: 'ENOTFOUND' }), Category.NETWORK);
  });

  test('EAI_AGAIN via error.code', () => {
    assertRetryable(makeError('DNS temporary failure', { code: 'EAI_AGAIN' }), Category.NETWORK);
  });

  test('EHOSTUNREACH via error.code', () => {
    assertRetryable(makeError('connect EHOSTUNREACH', { code: 'EHOSTUNREACH' }), Category.NETWORK);
  });

  test('ENETUNREACH via error.code', () => {
    assertRetryable(makeError('network unreachable', { code: 'ENETUNREACH' }), Category.NETWORK);
  });

  test('EPIPE via error.code', () => {
    assertRetryable(makeError('write EPIPE', { code: 'EPIPE' }), Category.NETWORK);
  });

  test('ECONNABORTED via error.code', () => {
    assertRetryable(makeError('connection aborted', { code: 'ECONNABORTED' }), Category.NETWORK);
  });

});

// ── Tests: code-first priority overrides text ──────────────────────────────────

describe('Code-first priority', () => {

  test('ECONNRESET code overrides unrelated message text', () => {
    // The message says "banned" but the OS code says ECONNRESET → should retry
    const err = makeError('you are banned', { code: 'ECONNRESET' });
    assertRetryable(err, Category.NETWORK);
  });

});

// ── Tests: Non-retryable — permanent failures ─────────────────────────────────

describe('Permanent failures — non-retryable', () => {

  test('Outdated client message', () => {
    assertPermanent('Outdated client! Please use 1.20.4', Category.OUTDATED_CLIENT);
  });

  test('Client out of date message', () => {
    assertPermanent('Client out of date.', Category.OUTDATED_CLIENT);
  });

  test('disconnectionscreen.outdated key', () => {
    assertPermanent('disconnectionscreen.outdated', Category.OUTDATED_CLIENT);
  });

  test('Outdated server message', () => {
    assertPermanent('Outdated server! I am still on 1.19', Category.OUTDATED_CLIENT);
  });

  test('Please use minecraft 1.20', () => {
    assertPermanent('Please use Minecraft 1.20 to connect', Category.OUTDATED_CLIENT);
  });

  test('Unsupported protocol', () => {
    assertPermanent('Unsupported protocol version', Category.UNSUPPORTED_PROTOCOL);
  });

  test('Incompatible protocol', () => {
    assertPermanent('Incompatible protocol!', Category.UNSUPPORTED_PROTOCOL);
  });

  test('Protocol mismatch', () => {
    assertPermanent('Protocol mismatch detected', Category.UNSUPPORTED_PROTOCOL);
  });

  test('Unsupported version', () => {
    assertPermanent('Unsupported version 770', Category.UNSUPPORTED_PROTOCOL);
  });

  test('Version mismatch', () => {
    assertPermanent('Version mismatch: expected 764', Category.UNSUPPORTED_PROTOCOL);
  });

  test('Authentication failed', () => {
    assertPermanent('Authentication failed', Category.AUTHENTICATION_FAILED);
  });

  test('Failed to verify username', () => {
    assertPermanent('Failed to verify username!', Category.AUTHENTICATION_FAILED);
  });

  test('Not authenticated', () => {
    assertPermanent('not authenticated', Category.AUTHENTICATION_FAILED);
  });

  test('Not premium message', () => {
    assertPermanent('This server requires a premium account', Category.AUTHENTICATION_FAILED);
  });

  test('disconnectionscreen.notauthenticated', () => {
    assertPermanent('disconnectionscreen.notauthenticated', Category.AUTHENTICATION_FAILED);
  });

  test('Invalid session', () => {
    assertPermanent('Invalid session (try restarting your game)', Category.INVALID_TOKEN);
  });

  test('Session expired', () => {
    assertPermanent('Session expired, please re-login', Category.INVALID_TOKEN);
  });

  test('Bad login', () => {
    assertPermanent('Bad login.', Category.INVALID_TOKEN);
  });

  test('Invalid token', () => {
    assertPermanent('Invalid token provided', Category.INVALID_TOKEN);
  });

  test('Invalid username', () => {
    assertPermanent('Invalid username: contains illegal character', Category.INVALID_USERNAME);
  });

  test('Illegal characters in username', () => {
    assertPermanent('Illegal characters in username!', Category.INVALID_USERNAME);
  });

  test('Name contains invalid characters', () => {
    assertPermanent('Your name contains invalid characters', Category.INVALID_USERNAME);
  });

  test('Banned from this server', () => {
    assertPermanent('You are banned from this server', Category.BANNED);
  });

  test('Banned message variant', () => {
    assertPermanent('Banned from this server. Reason: griefing', Category.BANNED);
  });

  test('disconnectionscreen.banned', () => {
    assertPermanent('disconnectionscreen.banned', Category.BANNED);
  });

  test('Not whitelisted', () => {
    assertPermanent('You are not whitelisted on this server!', Category.WHITELISTED);
  });

  test('Whitelist is on', () => {
    assertPermanent('Whitelist is on', Category.WHITELISTED);
  });

  test('Turn on the whitelist', () => {
    assertPermanent('The server has turned on the whitelist', Category.WHITELISTED);
  });

  test('Not on the whitelist', () => {
    assertPermanent('You are not on the whitelist', Category.WHITELISTED);
  });

});

// ── Tests: Retryable — transient failures ─────────────────────────────────────

describe('Transient failures — retryable', () => {

  test('Aternos in message', () => {
    assertRetryable('Offline\nMotd: Aternos', Category.ATERNOS_PLACEHOLDER);
  });

  test('Offline placeholder string', () => {
    assertRetryable('offline placeholder server', Category.ATERNOS_PLACEHOLDER);
  });

  test('Server starting', () => {
    assertRetryable('Server starting...', Category.SERVER_STARTING);
  });

  test('Still starting', () => {
    assertRetryable('Server is still starting, please wait', Category.SERVER_STARTING);
  });

  test('Server start', () => {
    assertRetryable('Server start in progress', Category.SERVER_STARTING);
  });

  test('Server is offline', () => {
    assertRetryable('Server is offline', Category.SERVER_OFFLINE);
  });

  test('No further information', () => {
    assertRetryable('Disconnected with no further information', Category.SERVER_OFFLINE);
  });

  test('Server down', () => {
    assertRetryable('server down for maintenance', Category.SERVER_OFFLINE);
  });

  test('Connection refused message string', () => {
    assertRetryable('connection refused by server', Category.SERVER_OFFLINE);
  });

  test('ECONNRESET in message only (no code)', () => {
    assertRetryable('socket error: ECONNRESET', Category.NETWORK);
  });

  test('Socket closed message', () => {
    assertRetryable('socket closed', Category.NETWORK);
  });

  test('Socket hang up message', () => {
    assertRetryable('socket hang up', Category.NETWORK);
  });

  test('Connection reset message', () => {
    assertRetryable('connection reset by peer', Category.NETWORK);
  });

  test('Read timeout message', () => {
    assertRetryable('read timeout', Category.NETWORK);
  });

  test('Timed out message', () => {
    assertRetryable('Connection timed out.', Category.NETWORK);
  });

  test('getaddrinfo in message', () => {
    assertRetryable('getaddrinfo ENOTFOUND mc.example.com', Category.NETWORK);
  });

  test('Unknown host', () => {
    assertRetryable('Unknown host: mc.example.com', Category.NETWORK);
  });

  test('Disconnected by peer', () => {
    assertRetryable('disconnected by peer', Category.NETWORK);
  });

});

// ── Tests: Edge cases and safety ──────────────────────────────────────────────

describe('Edge cases — classifier must never throw', () => {

  test('null input → retryable UNKNOWN', () => {
    const d = classify(null);
    assert.equal(d.shouldRetry, true);
    assert.equal(d.category, Category.UNKNOWN);
  });

  test('undefined input → retryable UNKNOWN', () => {
    const d = classify(undefined);
    assert.equal(d.shouldRetry, true);
    assert.equal(d.category, Category.UNKNOWN);
  });

  test('empty string → retryable UNKNOWN', () => {
    const d = classify('');
    assert.equal(d.shouldRetry, true);
    assert.equal(d.category, Category.UNKNOWN);
  });

  test('empty object → retryable UNKNOWN', () => {
    const d = classify({});
    assert.equal(d.shouldRetry, true);
    assert.equal(d.category, Category.UNKNOWN);
  });

  test('completely random string → retryable UNKNOWN', () => {
    const d = classify('xkcd randomness !@#$%^&*()');
    assert.equal(d.shouldRetry, true);
    assert.equal(d.category, Category.UNKNOWN);
  });

  test('number input → retryable UNKNOWN', () => {
    const d = classify(42);
    assert.equal(d.shouldRetry, true);
  });

  test('boolean input → retryable UNKNOWN', () => {
    const d = classify(false);
    assert.equal(d.shouldRetry, true);
  });

  test('plain Error object with no message → retryable UNKNOWN', () => {
    const d = classify(new Error(''));
    assert.equal(d.shouldRetry, true);
  });

  test('object with circular reference → retryable (does not throw)', () => {
    const obj = {};
    obj.self = obj;  // circular
    const d = classify(obj);
    assert.equal(typeof d.shouldRetry, 'boolean');
    assert.ok(d.category);
  });

  test('Error object — no code, no name overrides, message wins', () => {
    const d = classify(makeError('You are banned from this server'));
    assert.equal(d.shouldRetry, false);
    assert.equal(d.category, Category.BANNED);
  });

  test('Serialised disconnect packet with reason field', () => {
    const packet = { reason: 'You are not whitelisted on this server!' };
    const d = classify(packet);
    assert.equal(d.shouldRetry, false);
    assert.equal(d.category, Category.WHITELISTED);
  });

  test('Malformed packet — unexpected shape → retryable', () => {
    const d = classify({ unexpected: true, payload: [1, 2, 3] });
    assert.equal(d.shouldRetry, true);
  });

  test('Array input → retryable', () => {
    const d = classify(['error', 'array']);
    assert.equal(d.shouldRetry, true);
  });

  test('Legacy classifyDisconnect alias still works', () => {
    const { classifyDisconnect } = require('../errors/DisconnectClassifier');
    const d = classifyDisconnect('Outdated client');
    assert.equal(d.shouldRetry, false);
    assert.equal(d.category, Category.OUTDATED_CLIENT);
  });

});

// ── Tests: Decision shape completeness ────────────────────────────────────────

describe('Decision object shape', () => {

  const VALID_SEVERITIES   = new Set(['info', 'warn', 'error']);
  const VALID_CONFIDENCES  = new Set(['high', 'medium', 'low']);

  function assertShape(input, label) {
    const d = classify(input);
    assert.ok(typeof d.shouldRetry === 'boolean', `${label}: shouldRetry must be boolean`);
    assert.ok(typeof d.category    === 'string',  `${label}: category must be string`);
    assert.ok(VALID_SEVERITIES.has(d.severity),   `${label}: invalid severity: ${d.severity}`);
    assert.ok(VALID_CONFIDENCES.has(d.confidence),`${label}: invalid confidence: ${d.confidence}`);
    assert.ok(typeof d.reason      === 'string' && d.reason.length > 0, `${label}: reason must be non-empty string`);
  }

  test('ECONNRESET error object', () => assertShape(makeError('r', { code: 'ECONNRESET' }), 'ECONNRESET'));
  test('Banned message', ()        => assertShape('You are banned', 'BANNED'));
  test('Aternos placeholder', ()   => assertShape('Aternos offline', 'ATERNOS'));
  test('null input', ()            => assertShape(null, 'null'));
  test('undefined input', ()       => assertShape(undefined, 'undefined'));
  test('random string', ()         => assertShape('zxcvbnm', 'random'));
  test('empty object', ()          => assertShape({}, 'empty object'));

  test('permanent decisions include adminAction', () => {
    const d = classify('You are banned from this server');
    assert.ok(typeof d.adminAction === 'string' && d.adminAction.length > 0,
      'BANNED should have adminAction');
  });

  test('retryable decisions do not include adminAction', () => {
    const d = classify(makeError('read ECONNRESET', { code: 'ECONNRESET' }));
    assert.ok(!d.adminAction, 'ECONNRESET should not have adminAction');
  });

});
