const fs = require('fs');
const path = require('path');
const LogManager = require('../api/logManager');

async function runTest() {
  const projectId = 'test_leak_project';
  const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
  const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);

  // Ensure dir exists
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  // Open the stream
  console.log('Opening LogManager stream...');
  LogManager.open(projectId, logPath);
  LogManager.write(projectId, 'Simulated log line\\n');

  // Wait a tiny bit for the stream to establish and write
  await new Promise(r => setTimeout(r, 100));

  console.log('\\n--- Test 1: Attempt to unlink WITHOUT closing stream ---');
  try {
    fs.unlinkSync(logPath);
    console.log('UNEXPECTED SUCCESS: Was able to delete open file! (Are you on Linux/Mac?)');
  } catch (err) {
    console.log(`EXPECTED FAILURE: Could not delete open file. Error: ${err.code}`);
  }

  console.log('\\n--- Test 2: Attempt to unlink AFTER closing stream (The Fix) ---');
  // Apply the fix
  LogManager.close(projectId);
  
  try {
    fs.unlinkSync(logPath);
    console.log('PASSED: Successfully deleted the log file after closing the LogManager stream!');
  } catch (err) {
    console.error(`FAILED: Could not delete file even after closing: ${err.message}`);
  }
}

runTest();
