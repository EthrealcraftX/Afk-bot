'use strict';

/**
 * tailReader.js
 *
 * Async utility for reading the last N lines of a (potentially large) file
 * without loading the entire file into memory.
 *
 * WHY THIS EXISTS:
 *   fs.readFileSync / fs.readFile load the whole file into a Buffer before
 *   any lines can be extracted. For log files that may be several MB, this
 *   is wasteful: typical callers request only 30–200 lines. This module reads
 *   backwards from the end of the file in fixed-size chunks, stopping as soon
 *   as enough lines have been collected.
 *
 * USAGE:
 *   const { readTailLines } = require('./tailReader');
 *
 *   // Returns an array of up to `n` lines (strings, no trailing newline).
 *   // Returns [] if the file doesn't exist or is empty.
 *   const lines = await readTailLines('/path/to/file.log', 200);
 */

const fs   = require('fs');
const fsp  = fs.promises;

// Size of each read-backwards chunk in bytes.
// 64 KB is large enough to capture 200 typical log lines in a single read
// while small enough to avoid unnecessary memory pressure.
const CHUNK_SIZE = 64 * 1024; // 64 KB

/**
 * Read the last `n` lines of a file asynchronously.
 *
 * @param {string} filePath - Absolute path to the file.
 * @param {number} n        - Maximum number of lines to return (>= 1).
 * @returns {Promise<string[]>} Array of up to n lines, oldest first.
 *                              Returns [] if the file is missing or empty.
 */
async function readTailLines(filePath, n) {
  n = Math.max(1, parseInt(n) || 200);

  let fh;
  try {
    fh = await fsp.open(filePath, 'r');
  } catch (err) {
    if (err.code === 'ENOENT') return []; // file doesn't exist yet
    throw err;
  }

  try {
    const { size } = await fh.stat();
    if (size === 0) return [];

    // We collect raw bytes by reading backwards in chunks.
    // Each chunk is prepended to the growing buffer so that when we join,
    // the data is in forward order.
    const chunks = [];
    let totalBytesRead = 0;
    let linesFound = 0;
    let position = size;

    while (position > 0 && linesFound <= n) {
      const bytesToRead = Math.min(CHUNK_SIZE, position);
      position -= bytesToRead;

      const buf = Buffer.allocUnsafe(bytesToRead);
      await fh.read(buf, 0, bytesToRead, position);
      totalBytesRead += bytesToRead;

      // Count newlines in this chunk to know if we have enough lines yet.
      // We need n+1 newlines to guarantee n complete lines at the tail
      // (the +1 accounts for the line that started before our chunk boundary).
      for (let i = bytesToRead - 1; i >= 0; i--) {
        if (buf[i] === 0x0a /* '\n' */) {
          linesFound++;
          if (linesFound > n) {
            // We've passed enough newlines — discard bytes before this point.
            // Slice off everything from position+i+1 onwards is what we want,
            // but since we're building reversed we trim this chunk.
            chunks.unshift(buf.slice(i + 1));
            position = 0; // signal outer loop to stop
            break;
          }
        }
      }

      if (position > 0 || linesFound <= n) {
        // Haven't found enough newlines yet, or read the whole file.
        // If we broke out of inner loop above we already pushed the slice.
        if (linesFound <= n) {
          chunks.unshift(buf);
        }
      }
    }

    // Concatenate all chunks into a single Buffer and decode as UTF-8.
    const combined = Buffer.concat(chunks).toString('utf8');

    // Split on \r?\n, drop the trailing empty string that split() produces
    // when the file ends with a newline.
    const lines = combined.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Return only the last n lines (handles edge cases where our byte
    // math captured slightly more than needed).
    return lines.slice(-n);
  } finally {
    await fh.close();
  }
}

module.exports = { readTailLines };
