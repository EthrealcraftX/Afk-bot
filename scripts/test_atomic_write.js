const fs = require('fs');
const path = require('path');
const { atomicWriteJsonSync, atomicWriteJsonAsync } = require('../bot/atomicFs');

async function runTest() {
  const testFileSync = path.join(__dirname, '../data', 'test_atomic_sync.json');
  const testFileAsync = path.join(__dirname, '../data', 'test_atomic_async.json');

  console.log('--- Test 1: Normal Sync Save ---');
  atomicWriteJsonSync(testFileSync, { hello: 'world', emoji: '🌟' });
  const data1 = JSON.parse(fs.readFileSync(testFileSync, 'utf8'));
  console.log('Sync Read:', data1);
  if (data1.emoji === '🌟') console.log('PASSED: Sync Save & Unicode');

  console.log('\\n--- Test 2: Normal Async Save ---');
  await atomicWriteJsonAsync(testFileAsync, { async: true, emoji: '🚀' });
  const data2 = JSON.parse(fs.readFileSync(testFileAsync, 'utf8'));
  console.log('Async Read:', data2);
  if (data2.emoji === '🚀') console.log('PASSED: Async Save & Unicode');

  console.log('\\n--- Test 3: Overwrite Existing ---');
  atomicWriteJsonSync(testFileSync, { overwritten: true });
  const data3 = JSON.parse(fs.readFileSync(testFileSync, 'utf8'));
  if (data3.overwritten) console.log('PASSED: Overwrite successful');

  console.log('\\n--- Test 4: Verify .tmp files are cleaned up ---');
  if (!fs.existsSync(`${testFileSync}.tmp`) && !fs.existsSync(`${testFileAsync}.tmp`)) {
    console.log('PASSED: No dangling .tmp files found.');
  } else {
    console.error('FAILED: Dangling .tmp files exist!');
  }

  // Cleanup
  fs.unlinkSync(testFileSync);
  fs.unlinkSync(testFileAsync);
}

runTest();
