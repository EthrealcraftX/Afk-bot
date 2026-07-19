const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = 'test_secret_for_testing_only';
const router = require('../api/routes');
const { parseLinesParam } = router._test;

test('Lines Parameter Validation', async (t) => {
  await t.test('returns default when undefined', () => {
    const res = parseLinesParam(undefined, 200, 1000);
    assert.deepStrictEqual(res, { success: true, lines: 200 });
  });

  await t.test('parses valid positive integers', () => {
    assert.deepStrictEqual(parseLinesParam('100'), { success: true, lines: 100 });
    assert.deepStrictEqual(parseLinesParam('1000', 200, 1000), { success: true, lines: 1000 });
  });

  await t.test('rejects numbers exceeding max limit', () => {
    const res = parseLinesParam('1001', 200, 1000);
    assert.strictEqual(res.success, false);
    assert.match(res.error, /cannot exceed/);
  });

  await t.test('rejects zero and negatives', () => {
    assert.strictEqual(parseLinesParam('0').success, false);
    assert.strictEqual(parseLinesParam('-50').success, false);
  });

  await t.test('rejects floats and garbage', () => {
    assert.strictEqual(parseLinesParam('10.5').success, false);
    assert.strictEqual(parseLinesParam('abc').success, false);
    assert.strictEqual(parseLinesParam('Infinity').success, false);
    assert.strictEqual(parseLinesParam('').success, false);
  });

  await t.test('rejects unsafe huge integers', () => {
    assert.strictEqual(parseLinesParam('9999999999999999999999').success, false);
  });
});
