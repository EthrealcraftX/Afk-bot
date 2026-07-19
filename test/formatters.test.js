const test = require('node:test');
const assert = require('node:assert');
const { esc, fmtStatus, fmtType, fmtShortId, fmtUptime } = require('../bot/formatters');

test('Formatters', async (t) => {
  await t.test('esc() should escape Telegram MarkdownV2 reserved characters', () => {
    const raw = 'Hello_World*![test]';
    const escaped = esc(raw);
    assert.strictEqual(escaped, 'Hello\\_World\\*\\!\\[test\\]', 'Should correctly escape characters');
  });

  await t.test('fmtStatus() should return correct UI string', () => {
    assert.strictEqual(fmtStatus('running'), '🟢 Ishlayapti');
    assert.strictEqual(fmtStatus('stopped'), '🔴 To\'xtatilgan');
    assert.strictEqual(fmtStatus('unknown'), '🔴 To\'xtatilgan');
  });

  await t.test('fmtType() should format server types', () => {
    assert.strictEqual(fmtType('java'), '☕ Java');
    assert.strictEqual(fmtType('bedrock'), '🟩 Bedrock');
  });

  await t.test('fmtShortId() should extract suffix from project ID', () => {
    assert.strictEqual(fmtShortId('user_123_abc'), 'abc');
    assert.strictEqual(fmtShortId('singleword'), 'singleword');
  });

  await t.test('fmtUptime() should format milliseconds to readable strings', () => {
    assert.strictEqual(fmtUptime(-500), '—', 'Negative ms should return dash');
    assert.strictEqual(fmtUptime(0), '—', 'Zero should be treated as falsy/missing');
    assert.strictEqual(fmtUptime(5000), '5s', '5 seconds');
    assert.strictEqual(fmtUptime(65000), '1m 5s', '1 minute 5 seconds');
    assert.strictEqual(fmtUptime(3665000), '1h 1m', '1 hour 1 minute');
  });
});
