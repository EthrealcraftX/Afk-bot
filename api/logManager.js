'use strict';

/**
 * logManager.js
 *
 * Manages async WriteStream-based log files for bot child processes.
 *
 * WHY THIS EXISTS:
 *   The old approach called fs.existsSync + fs.statSync + fs.appendFileSync
 *   inside child.stdout.on('data') handlers. Those are synchronous disk I/O
 *   calls on the main event loop — they block ALL HTTP requests and Telegram
 *   bot updates until the disk operation finishes.
 *
 *   This module replaces that pattern with a single fs.createWriteStream per
 *   project, opened in append mode. Writes are fully async and OS-buffered,
 *   which means the event loop is never blocked by log I/O.
 *
 * SIZE LIMITING:
 *   Instead of calling fs.statSync on every write (another blocking call),
 *   we track bytes written in memory. When the in-memory counter exceeds
 *   MAX_LOG_BYTES, we close the current stream and reopen it with 'w' flag,
 *   which truncates the file to zero and starts fresh.
 *
 * USAGE:
 *   const LogManager = require('./logManager');
 *
 *   // When starting a bot:
 *   LogManager.open(projectId, logPath);
 *   LogManager.write(projectId, '[timestamp] [stdout] some line\n');
 *
 *   // When stopping / on error:
 *   LogManager.close(projectId);
 */

const fs   = require('fs');
const path = require('path');

// Maximum log file size in bytes before truncation.
// 5 MB matches the previous hardcoded limit.
const MAX_LOG_BYTES = 5 * 1024 * 1024;

// Maximum event file size in bytes before truncation.
// Events are lifecycle records, not raw stdout — they grow much more slowly.
// 1 MB is generous for a project that may run for months.
const MAX_EVENT_BYTES = 1 * 1024 * 1024;

// Key prefix used to namespace event streams inside the same Map,
// avoiding collision with process log streams.
const EVENT_PREFIX = 'events:';

/**
 * @typedef {{ stream: fs.WriteStream, bytesWritten: number, logPath: string }} LogEntry
 */

/** @type {Map<string, LogEntry>} */
const _logs = new Map();

/**
 * Open (or reopen) a write stream for the given project.
 * The file is truncated to zero on open (flag: 'w').
 *
 * @param {string} projectId
 * @param {string} logPath  - absolute path to the .log file
 */
function open(projectId, logPath) {
  // If a stream already exists for this project, close it first.
  _close(projectId);

  // Ensure the directory exists (sync is acceptable here — called once at bot start,
  // not in a hot-path event handler).
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Open the stream. Flag 'w' truncates the file if it already exists,
  // giving us a clean log on each bot start.
  const stream = fs.createWriteStream(logPath, { flags: 'w', encoding: 'utf8' });

  stream.on('error', (err) => {
    console.error(`[LogManager] WriteStream error for ${projectId}:`, err.message);
    // Remove the broken entry so future writes don't attempt to use a dead stream.
    _logs.delete(projectId);
  });

  _logs.set(projectId, { stream, bytesWritten: 0, logPath });
}

/**
 * Write a log line asynchronously.
 * If the in-memory byte counter exceeds MAX_LOG_BYTES, the stream is rotated
 * (file truncated and restarted) before writing.
 *
 * This function is safe to call from inside stdout.on('data') and
 * stderr.on('data') handlers because it never blocks the event loop.
 *
 * @param {string} projectId
 * @param {string} line  - the string to write (should already include newline)
 */
function write(projectId, line) {
  const entry = _logs.get(projectId);
  if (!entry) return; // bot may have been stopped between data event and write

  // Rotate if we've exceeded the size limit.
  if (entry.bytesWritten + Buffer.byteLength(line) > MAX_LOG_BYTES) {
    // Re-open in truncate mode. 'open' closes the existing stream first.
    open(projectId, entry.logPath);
    // Write to the freshly opened stream.
    const fresh = _logs.get(projectId);
    if (!fresh) return;
    fresh.stream.write(line);
    fresh.bytesWritten += Buffer.byteLength(line);
    return;
  }

  entry.stream.write(line);
  entry.bytesWritten += Buffer.byteLength(line);
}

/**
 * Close and remove the write stream for a project.
 * Safe to call even if the project has no open stream.
 *
 * @param {string} projectId
 */
function close(projectId) {
  return _close(projectId);
}

/**
 * Internal close — does not guard against double-close.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
function _close(projectId) {
  const entry = _logs.get(projectId);
  if (!entry) return Promise.resolve();

  _logs.delete(projectId);

  return new Promise((resolve) => {
    try {
      if (entry.stream.destroyed) {
        return resolve();
      }
      entry.stream.end(() => resolve());
    } catch (e) {
      resolve();
    }
  });
}

/**
 * Close all open streams. Useful for graceful process shutdown.
 * @returns {Promise<void>}
 */
function closeAll() {
  const promises = [];
  for (const projectId of _logs.keys()) {
    promises.push(_close(projectId));
  }
  return Promise.all(promises);
}

module.exports = { open, write, close, closeAll };

// ── Event log stream API ──────────────────────────────────────────────────────
//
// Event logs record lifecycle events (started, stopped, stdout snippets,
// errors) in data/events/<projectId>.log.
//
// Unlike process logs (truncated on each bot start), event logs are
// APPENDED to across restarts so users can see historical activity.
//
// All I/O is fully async via WriteStream, identical to the process log API.

/**
 * Open an async append-mode WriteStream for the event log of a project.
 * Safe to call multiple times; an existing stream is left open (event logs
 * accumulate across restarts unlike process logs which are truncated).
 * Call this once when startServer() is called for a project.
 *
 * @param {string} projectId
 * @param {string} eventPath - absolute path to the event .log file
 */
function openEvent(projectId, eventPath) {
  const key = EVENT_PREFIX + projectId;
  if (_logs.has(key)) return; // stream already open, nothing to do

  const dir = path.dirname(eventPath);
  if (!fs.existsSync(dir)) {
    // Sync mkdir is acceptable here: called once at bot start, not in hot path.
    fs.mkdirSync(dir, { recursive: true });
  }

  // 'a' flag: append to existing file; create if it doesn't exist.
  const stream = fs.createWriteStream(eventPath, { flags: 'a', encoding: 'utf8' });

  stream.on('error', (err) => {
    console.error(`[LogManager] Event WriteStream error for ${projectId}:`, err.message);
    _logs.delete(key);
  });

  _logs.set(key, { stream, bytesWritten: 0, logPath: eventPath });
}

/**
 * Append a pre-formatted event line asynchronously.
 * If no stream is open for this project the write is silently dropped
 * (this can happen for once-only events like createServer before any bot
 * session has started).
 *
 * This function MUST be safe to call from inside stdout.on('data') and
 * stderr.on('data') — it never blocks the event loop.
 *
 * @param {string} projectId
 * @param {string} line - fully formatted string, WITHOUT trailing newline
 */
function appendEventLine(projectId, line) {
  const key = EVENT_PREFIX + projectId;
  let entry = _logs.get(key);

  if (!entry) {
    // No stream is open. This happens for lifecycle events that fire before
    // startServer() (e.g. createServer) or after closeEvent() (e.g. post-stop
    // update events). Fall back to a fire-and-forget fs.appendFile (async,
    // not appendFileSync) so the event is not silently dropped.
    // __dirname = api/ → one level up is the project root.
    const eventsDir = path.join(__dirname, '..', 'data', 'events');
    const eventPath = path.join(eventsDir, `${projectId}.log`);
    fs.appendFile(eventPath, line + '\n', (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`[LogManager] appendEventLine fallback write failed for ${projectId}:`, err.message);
      }
    });
    return;
  }

  const data = line + '\n';

  // Rotate if we've exceeded the event size limit.
  if (entry.bytesWritten + Buffer.byteLength(data) > MAX_EVENT_BYTES) {
    _logs.delete(key);
    try { entry.stream.end(); } catch (_) {}
    // Reopen in truncate mode to start fresh.
    const stream = fs.createWriteStream(entry.logPath, { flags: 'w', encoding: 'utf8' });
    stream.on('error', (err) => {
      console.error(`[LogManager] Event WriteStream error (after rotate) for ${projectId}:`, err.message);
      _logs.delete(key);
    });
    const fresh = { stream, bytesWritten: 0, logPath: entry.logPath };
    _logs.set(key, fresh);
    fresh.stream.write(data);
    fresh.bytesWritten += Buffer.byteLength(data);
    return;
  }

  entry.stream.write(data);
  entry.bytesWritten += Buffer.byteLength(data);
}

/**
 * Close the event WriteStream for a project.
 * Call this when a project is deleted (not when the bot stops, because
 * event history is preserved across restarts).
 *
 * @param {string} projectId
 */
function closeEvent(projectId) {
  const key = EVENT_PREFIX + projectId;
  const entry = _logs.get(key);
  if (!entry) return Promise.resolve();
  _logs.delete(key);
  return new Promise((resolve) => {
    try {
      if (entry.stream.destroyed) return resolve();
      entry.stream.end(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

module.exports = { open, write, close, closeAll, openEvent, appendEventLine, closeEvent };
