const LogManager = require('./api/logManager');
const fs = require('fs');
const path = require('path');

async function testShutdown() {
  const logDir = path.join(__dirname, 'data', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const projectId1 = 'test1';
  const projectId2 = 'test2';
  
  LogManager.open(projectId1, path.join(logDir, 'test1.log'));
  LogManager.open(projectId2, path.join(logDir, 'test2.log'));

  LogManager.write(projectId1, 'Line 1\n');
  LogManager.write(projectId2, 'Line 1\n');

  console.log('Streams open, closing all...');
  
  const start = Date.now();
  await LogManager.closeAll();
  const end = Date.now();

  console.log(`closeAll completed in ${end - start}ms`);

  const file1 = fs.readFileSync(path.join(logDir, 'test1.log'), 'utf8');
  const file2 = fs.readFileSync(path.join(logDir, 'test2.log'), 'utf8');

  if (file1 === 'Line 1\n' && file2 === 'Line 1\n') {
    console.log('SUCCESS: All log lines were fully flushed to disk.');
  } else {
    console.error('FAILED: Log lines missing or truncated.');
    process.exit(1);
  }
}

testShutdown().catch(err => {
  console.error(err);
  process.exit(1);
});
