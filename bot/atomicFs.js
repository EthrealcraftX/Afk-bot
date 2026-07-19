const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/**
 * Synchronously serializes and writes JSON data to a temporary file,
 * then atomically renames it to the destination file.
 */
function atomicWriteJsonSync(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to temporary file
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  
  // Atomically replace original file
  fs.renameSync(tmpPath, filePath);
}

/**
 * Asynchronously serializes and writes JSON data to a temporary file,
 * then atomically renames it to the destination file.
 */
async function atomicWriteJsonAsync(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to temporary file
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  
  // Atomically replace original file
  await fsp.rename(tmpPath, filePath);
}

module.exports = {
  atomicWriteJsonSync,
  atomicWriteJsonAsync
};
