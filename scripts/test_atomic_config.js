const fs = require('fs');
const path = require('path');
const { atomicWriteJsonAsync } = require('../bot/atomicFs');

async function testAtomicWrite() {
  const testDir = path.join(__dirname, '../scratch');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  
  const testFile = path.join(testDir, 'test_config.json');
  const testData = { host: "127.0.0.1", port: 25565, version: "1.20" };

  try {
    await atomicWriteJsonAsync(testFile, testData);
    const content = fs.readFileSync(testFile, 'utf8');
    console.log("File written successfully:", content);
    if (content === JSON.stringify(testData, null, 2)) {
      console.log("SUCCESS: Formatting is preserved (2-space indent).");
    } else {
      console.error("FAILED: Formatting is incorrect.");
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testAtomicWrite();
