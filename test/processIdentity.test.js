const test = require('node:test');
const assert = require('node:assert');
const { pidBelongsToOurBot, PID_START_TIME_TOLERANCE_MS } = require('../api/processIdentity');

test('Process Identity Validation', async (t) => {
  await t.test('accepts exact match', () => {
    const isOurs = pidBelongsToOurBot(1234, new Date(1000000), new Date(1000000));
    assert.strictEqual(isOurs, true, 'Exact timestamps should match');
  });

  await t.test('accepts match within tolerance (process started slightly after DB insert)', () => {
    // Stored at 1000000, OS says it started at 1000500 (within tolerance)
    const isOurs = pidBelongsToOurBot(1234, new Date(1000000), new Date(1000000 + (PID_START_TIME_TOLERANCE_MS - 500)));
    assert.strictEqual(isOurs, true, 'Within tolerance should match');
  });

  await t.test('rejects OS start time strictly outside positive tolerance', () => {
    // OS says it started later (recycled PID)
    const isOurs = pidBelongsToOurBot(1234, new Date(1000000), new Date(1000000 + PID_START_TIME_TOLERANCE_MS + 1000));
    assert.strictEqual(isOurs, false, 'Should reject completely new process');
  });

  await t.test('accepts OS start time BEFORE database time', () => {
    // Due to async DB saving, the OS process naturally starts BEFORE the DB record is written.
    const isOurs = pidBelongsToOurBot(1234, new Date(1000000), new Date(990000));
    assert.strictEqual(isOurs, true, 'Should accept process starting before DB save');
  });

  await t.test('gracefully fails on missing arguments', () => {
    assert.strictEqual(pidBelongsToOurBot(1234, null, 1000), false);
    assert.strictEqual(pidBelongsToOurBot(1234, 1000, null), false);
  });
});
