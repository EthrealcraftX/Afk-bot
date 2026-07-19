'use strict';

/**
 * processIdentity.js
 *
 * Cross-platform utility to query the start time of an OS process by PID.
 *
 * PURPOSE:
 *   Before sending SIGTERM to an orphaned bot process on startup, we must
 *   confirm that the stored PID still belongs to OUR process and was not
 *   recycled by the OS after the original process exited.
 *
 *   A recycled PID always has a LATER start time than the timestamp we
 *   recorded when we originally spawned the process. If the OS-reported
 *   start time is significantly later than our stored timestamp, the PID
 *   belongs to a different, unrelated process and must NOT be killed.
 *
 * PLATFORMS:
 *   - Windows  : Uses PowerShell `(Get-Process -Id X).StartTime`
 *   - Linux    : Reads /proc/<pid>/stat (no subprocess, instant)
 *   - macOS    : Uses `ps -p <pid> -o lstart=` (POSIX)
 *
 * USAGE:
 *   const { getProcessStartTime, pidBelongsToOurBot } = require('./processIdentity');
 *
 *   const osStart = await getProcessStartTime(pid);
 *   if (osStart === null) { /* process gone, safe to skip kill * / }
 *   const safe = pidBelongsToOurBot(pid, storedStartTime, osStart);
 */

const { execFile } = require('child_process');
const fs            = require('fs');
const os            = require('os');

// Maximum milliseconds between our recorded spawn time and the OS-reported
// process start time for us to consider them the same process.
// Set conservatively at 10 seconds to absorb slow machines and NTP drift.
const PID_START_TIME_TOLERANCE_MS = 10_000;

/**
 * Returns the start time of an OS process as a Date, or null if the process
 * does not exist or the start time cannot be determined.
 *
 * This function is async and must not be called from a hot-path event handler.
 * It is intended to be called once per project during server startup only.
 *
 * @param {number} pid
 * @returns {Promise<Date|null>}
 */
async function getProcessStartTime(pid) {
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      return await _getStartTimeWindows(pid);
    } else if (platform === 'linux') {
      return _getStartTimeLinux(pid);
    } else {
      // macOS and other POSIX systems
      return await _getStartTimePosix(pid);
    }
  } catch (err) {
    // Any failure (ESRCH, permission, parse error) → treat as "can't determine"
    return null;
  }
}

/**
 * Windows implementation.
 * Uses PowerShell to query (Get-Process -Id X).StartTime.
 * Returns null if the process doesn't exist.
 *
 * @param {number} pid
 * @returns {Promise<Date|null>}
 */
function _getStartTimeWindows(pid) {
  return new Promise((resolve) => {
    // -NonInteractive -NoProfile keeps startup fast
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-Command',
       `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).StartTime.ToString('o')`],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          resolve(null);
          return;
        }
        const dt = new Date(stdout.trim());
        resolve(isNaN(dt.getTime()) ? null : dt);
      }
    );
  });
}

/**
 * Linux implementation.
 * Reads /proc/<pid>/stat synchronously (it's a virtual file — no disk I/O).
 * Field index 21 (0-based) is the process start time in clock ticks since boot.
 * Converts to an absolute wall-clock Date using /proc/uptime and Date.now().
 *
 * @param {number} pid
 * @returns {Date|null}
 */
function _getStartTimeLinux(pid) {
  try {
    const stat    = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const uptime  = fs.readFileSync('/proc/uptime', 'utf8');

    // /proc/<pid>/stat fields are space-separated; field[21] = starttime (ticks)
    // The process name (field[1]) may contain spaces if wrapped in parens, so
    // we strip it before splitting.
    const stripped    = stat.replace(/\(.*?\)/, '(x)');
    const fields      = stripped.split(' ');
    const startTicks  = parseInt(fields[21], 10);

    const clkTck      = 100; // sysconf(_SC_CLK_TCK) — almost always 100 on Linux
    const uptimeSec   = parseFloat(uptime.split(' ')[0]);
    const bootMs      = Date.now() - uptimeSec * 1000;
    const startMs     = bootMs + (startTicks / clkTck) * 1000;

    const dt = new Date(startMs);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

/**
 * macOS / generic POSIX implementation.
 * Uses `ps -p <pid> -o lstart=` which prints the human-readable start time.
 *
 * @param {number} pid
 * @returns {Promise<Date|null>}
 */
function _getStartTimePosix(pid) {
  return new Promise((resolve) => {
    execFile(
      'ps',
      ['-p', String(pid), '-o', 'lstart='],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          resolve(null);
          return;
        }
        const dt = new Date(stdout.trim());
        resolve(isNaN(dt.getTime()) ? null : dt);
      }
    );
  });
}

/**
 * Determines whether a PID, confirmed to be running with a given OS start time,
 * is the same process that we spawned at `storedStartTime`.
 *
 * Returns true  → safe to kill (same process).
 * Returns false → PID was recycled; do NOT kill.
 *
 * @param {number} pid             - the PID to evaluate (used only for logging)
 * @param {Date}   storedStartTime - the timestamp we recorded when we spawned the bot
 * @param {Date}   osStartTime     - the timestamp the OS reports for this PID
 * @returns {boolean}
 */
function pidBelongsToOurBot(pid, storedStartTime, osStartTime) {
  if (!storedStartTime || !osStartTime || !osStartTime.getTime || !storedStartTime.getTime) return false;
  const diff = Math.abs(osStartTime.getTime() - new Date(storedStartTime).getTime());
  return diff <= PID_START_TIME_TOLERANCE_MS;
}

module.exports = { getProcessStartTime, pidBelongsToOurBot, PID_START_TIME_TOLERANCE_MS };
