const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const net = require('net');
const LogManager = require('./logManager');
const { getProcessStartTime, pidBelongsToOurBot } = require('./processIdentity');
// Destructure the event stream helpers from LogManager so appendEvent can
// delegate to them without any direct fs calls.
const { openEvent, appendEventLine, closeEvent: closeEventStream } = require('./logManager');
// Async tail-reader: reads the last N lines of a file without loading the
// whole file into memory. Used by getServerLogs, getServerEvents, getAllEvents.
const { readTailLines } = require('./tailReader');

// Import Mongoose Models
const User = require('./models/User');
const Project = require('./models/Project');

// Error classification + notification service
const { classifyBotMessage, classifyProcessExit } = require('../errors/errorHandler');
const { saveNotification } = require('../notifications/notificationService');
const { atomicWriteJsonAsync } = require('../bot/atomicFs');

// Keep in-memory tracking of child processes
const db = {
  processes: {}
};

// Keep track of which projects are currently starting/stopping
// to prevent race conditions from concurrent identical requests.
const startingProjects = new Set();
const stoppingProjects = new Set();

// Configuration
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('JWT_SECRET environment variable is required. Exiting.');
  process.exit(1);
}
const JWT_EXPIRY_TIME = process.env.JWT_EXPIRY_TIME || '24h';
const MAX_PROJECTS_PER_USER = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3;
const MAX_ERROR_LOG_LENGTH = 1000;

// User Management functions
async function createUser(username, password, allowOverwrite = false) {
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      if (allowOverwrite) {
        // Trusted bot request: reset password for existing tg_ user
        console.log(`[API] Overwriting password for existing user '${username}' (authorized bot request).`);
        const passwordHash = await bcrypt.hash(password, 10);
        // Atomically update the password AND increment tokenVersion.
        // This single operation invalidates all tokens previously issued to
        // this user — no separate revocation step needed.
        await User.updateOne(
          { username },
          {
            $set: { passwordHash },
            $inc: { tokenVersion: 1 }
          }
        );
        return { success: true, message: 'User password updated successfully' };
      }
      return { success: false, error: 'Username already exists' };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      username,
      passwordHash,
      projects: [],
      createdAt: new Date()
    });

    return { success: true, message: 'User created successfully' };
  } catch (error) {
    console.error('Error creating user:', error);
    return { success: false, error: 'Failed to create user' };
  }
}

async function authenticateUser(username, password) {
  try {
    const user = await User.findOne({ username });
    const isValidPassword = user ? await bcrypt.compare(password, user.passwordHash || '') : false;
    if (!user || !isValidPassword) {
      return { success: false, error: 'Invalid username or password' };
    }

    // Embed the current tokenVersion ('tv') so that any future increment
    // immediately invalidates this and all previously issued tokens.
    const tv = user.tokenVersion ?? 0;
    const token = jwt.sign({ username, tv }, SECRET_KEY, { expiresIn: JWT_EXPIRY_TIME });
    return { success: true, token, username };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

function isAdmin(username) {
  return username === (process.env.ADMIN_USERNAME || 'admin');
}

// Verifies a JWT and confirms the embedded tokenVersion matches the database.
// Returns the decoded payload on success, or null on any failure.
// IMPORTANT: This function is async — always await it.
async function verifyToken(token) {
  try {
    // Step 1: cryptographic verification (signature + expiry)
    const decoded = jwt.verify(token, SECRET_KEY);

    // Step 2: token-version check.
    // Tokens issued before this fix will have no 'tv' field (tv === undefined).
    // We treat those as version 0. If the user's stored tokenVersion is 0
    // (the default for new and existing documents) they continue to work.
    // The moment a password overwrite (or future password change) fires, the
    // DB version becomes 1+ and all version-0 tokens are rejected.
    const user = await User.findOne({ username: decoded.username }, 'tokenVersion');
    if (!user) return null; // user was deleted

    const storedVersion = user.tokenVersion ?? 0;
    const tokenVersion  = decoded.tv     ?? 0;

    if (tokenVersion !== storedVersion) {
      // Token was issued against a superseded credential — reject it.
      return null;
    }

    return decoded;
  } catch (err) {
    // jwt.verify throws on bad signature, expiry, malformed token, etc.
    return null;
  }
}

async function canCreateMoreProjects(username) {
  const user = await User.findOne({ username });
  if (!user) return false;
  return user.projects.length < MAX_PROJECTS_PER_USER;
}

// Server (Project) Creation
async function createServer(ip, port, version, type, username) {
  if (!ip || !port || !version || !type) {
    return { success: false, error: 'All fields are required' };
  }

  const { isAternosAddLink, resolveAternosLink } = require('./aternosResolver');
  let resolvedIp = ip;
  let resolvedPort = port;

  if (isAternosAddLink(ip)) {
    try {
      const resolved = await resolveAternosLink(ip);
      if (resolved) {
        resolvedIp = resolved.hostname;
        resolvedPort = resolved.port;
      }
    } catch (err) {
      console.error('Failed to resolve Aternos link:', err);
      return { success: false, error: `Failed to resolve Aternos link: ${err.message}` };
    }
  }

  if (isNaN(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    return { success: false, error: 'Port must be between 1 and 65535' };
  }

  if (!['java', 'bedrock'].includes(type)) {
    return { success: false, error: 'Invalid server type' };
  }

  if (typeof resolvedIp !== 'string' || resolvedIp.length > 253 || /[\/\\\s]/.test(resolvedIp)) {
    return { success: false, error: 'Invalid host' };
  }

  // ── Atomic project-limit check ────────────────────────────────────────────
  // The old pattern was: read count → (gap) → push projectId
  // Two simultaneous requests both read count=0, both pass, both write → limit bypassed.
  //
  // The fix: use a single findOneAndUpdate with a conditional $expr filter.
  // MongoDB only applies the $push when projects.length < MAX_PROJECTS_PER_USER.
  // If the condition is false, the document is not modified and updatedUser is null.
  //
  // We do this BEFORE creating any files on disk so we never need to clean up
  // on a limit-exceeded failure.
  const projectId = `project_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const updatedUser = await User.findOneAndUpdate(
    {
      username,
      $expr: { $lt: [{ $size: '$projects' }, MAX_PROJECTS_PER_USER] }
    },
    { $push: { projects: projectId } },
    { new: true }
  );

  if (!updatedUser) {
    // Either the user doesn't exist or the limit has been reached.
    const user = await User.findOne({ username });
    if (!user) return { success: false, error: 'User not found' };
    return {
      success: false,
      error: `You can't create more than ${MAX_PROJECTS_PER_USER} servers`
    };
  }
  const projectDir = path.join(__dirname, '../projects', projectId);

  try {
    // Create project directory
    fs.mkdirSync(projectDir, { recursive: true });

    // Config structure
    const config = {
      projectId,
      host: resolvedIp,
      port: parseInt(resolvedPort),
      version,
      type,
      movementInterval: 5000,
      reconnectHours: 2,
      usernameFile: 'usernames.txt',
      actions: [
        "jump",
        "moveForward",
        "moveBackward",
        "strafeLeft",
        "strafeRight",
        "lookAround",
        "attackMobs"
      ],
      status: "stopped",
      owner: username,
      createdAt: new Date()
    };

    // Save configuration file inside the project directory
    await atomicWriteJsonAsync(path.join(projectDir, 'config.json'), config);

    // Copy template structure
    const templateDir = path.join(__dirname, '../templates', type);
    if (fs.existsSync(templateDir)) {
      fs.cpSync(templateDir, projectDir, { recursive: true });
    }

    // Save in Database (User.projects was already updated atomically above)
    await Project.create(config);

    // Append creation event
    try {
      appendEvent(projectId, `Server created by ${username}`, 'info');
    } catch (e) {}

    return {
      success: true,
      projectId,
      host: resolvedIp,
      port: parseInt(resolvedPort),
      message: 'Server created successfully'
    };
  } catch (err) {
    console.error('Server creation error:', err);
    return { success: false, error: 'Failed to create server' };
  }
}

// Start Server
async function startServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  if (startingProjects.has(projectId)) {
    // FIXED: Lock mechanism to prevent double-start race conditions
    return { success: false, error: 'Bot already starting' };
  }
  startingProjects.add(projectId);

  try {
    const project = await Project.findOne({ projectId });
    if (!project) {
      return { success: false, error: 'Server not found' };
    }

    if (project.owner !== username && !isAdmin(username)) {
      return { success: false, error: 'Permission denied' };
    }

    if (db.processes[projectId]) {
      return { success: false, error: 'Server is already running' };
    }

    const projectDir = path.join(__dirname, '../projects', projectId);

    // If project directory is missing (e.g. after server restart), rebuild it from template
    if (!fs.existsSync(projectDir) || !fs.existsSync(path.join(projectDir, 'index.js'))) {
      console.log(`[startServer] Project dir missing for ${projectId}, rebuilding from template...`);
      try {
        fs.mkdirSync(projectDir, { recursive: true });

        // Copy template files
        const templateDir = path.join(__dirname, '../templates', project.type || 'java');
        if (fs.existsSync(templateDir)) {
          fs.cpSync(templateDir, projectDir, { recursive: true });
        }

        // Write config.json from MongoDB data
        const config = {
          projectId: project.projectId,
          host: project.host,
          port: project.port,
          version: project.version,
          type: project.type,
          movementInterval: project.movementInterval || 5000,
          reconnectHours: project.reconnectHours || 2,
          usernameFile: project.usernameFile || 'usernames.txt',
          actions: project.actions || ['jump', 'moveForward', 'lookAround'],
          status: 'running',
          owner: project.owner,
          createdAt: project.createdAt
        };
        fs.writeFileSync(path.join(projectDir, 'config.json'), JSON.stringify(config, null, 2));
        console.log(`[startServer] Project dir rebuilt for ${projectId}`);
      } catch (rebuildErr) {
        console.error(`[startServer] Failed to rebuild project dir for ${projectId}:`, rebuildErr);
        return { success: false, error: 'Failed to rebuild project files' };
      }
    }

    let child;
    try {
      child = spawn('node', ['index.js'], {
        cwd: projectDir,
        stdio: 'pipe'
      });
    } catch (err) {
      console.error('Failed to spawn child process for', projectId, err);
      return { success: false, error: 'Failed to start server process' };
    }

    child.on('error', async (err) => {
      console.error(`[${projectId}] Child process error:`, err);
      // Ownership check: only perform cleanup if we are still the active process.
      if (db.processes[projectId] === child) {
        LogManager.close(projectId);
        delete db.processes[projectId];
        
        if (child.pid) {
          try {
            await Project.updateOne(
              { projectId, lastPid: child.pid }, 
              { $set: { status: 'stopped', stoppedAt: new Date(), lastPid: null, lastPidStartedAt: null } }
            );
          } catch (e) {
            console.error('DB update failed:', e.message);
          }
        }
      }
    });

    const logsDir = path.join(__dirname, '../data', 'logs');
    const logPath = path.join(logsDir, `${projectId}.log`);

    // Open the async WriteStream for the process log (truncated on each start).
    LogManager.open(projectId, logPath);

    // Open the async append-mode WriteStream for the event log.
    // 'a' mode: events accumulate across restarts; history is preserved.
    // openEvent is idempotent — if the stream is already open it's left as-is.
    const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
    openEvent(projectId, eventPath);

    child.stdout.on('data', (data) => {
      const msg = `[${new Date().toISOString()}] [${projectId}] stdout: ${String(data)}`;
      console.log(msg);
      // Non-blocking async write via LogManager's WriteStream.
      // This never calls fs.statSync or fs.appendFileSync, so the event loop
      // is never blocked regardless of how many lines a bot outputs per second.
      LogManager.write(projectId, msg + '\n');
      try {
        appendEvent(projectId, String(data).trim(), 'info');
      } catch (e) {}
      // Classify for user notification
      tryNotify(String(data).trim());
    });

    child.stderr.on('data', (data) => {
      const msg = `[${new Date().toISOString()}] [${projectId}] stderr: ${String(data)}`;
      console.error(msg);
      // Non-blocking async write via LogManager's WriteStream.
      LogManager.write(projectId, msg + '\n');
      try {
        appendEvent(projectId, String(data).trim(), 'error');
      } catch (e) {}
      // Classify for user notification (stderr lines are always checked)
      tryNotify(String(data).trim());
    });


    child.on('close', async (code) => {
      console.log(`[${projectId}] Process exited with code ${code}`);
      
      // Ownership check: only perform in-memory cleanup if this handle is still the active one.
      // If db.processes[projectId] is undefined, stopServer already cleaned it up.
      // If it's another child process, a new startServer request already replaced it.
      if (db.processes[projectId] === child) {
        // Close the async log stream — no more writes will come from this specific process.
        LogManager.close(projectId);
        delete db.processes[projectId];
      }

      try {
        appendEvent(projectId, `Process exited with code ${code}`, 'info');
      } catch (e) {}
      // Notify user on non-zero exit
      try {
        const exitPayload = classifyProcessExit(code);
        if (exitPayload) {
          const userToken = jwt.sign({ username: project.owner }, SECRET_KEY, { expiresIn: JWT_EXPIRY_TIME });
          await saveNotification({
            projectId,
            userId: project.owner,
            projectName: `${project.host}:${project.port}`,
            userToken,
            ...exitPayload,
            rawError: `exit code ${code}`
          });
        }
      } catch (e) {
        console.error(`[${projectId}] Failed to save exit notification:`, e.message);
      }
      
      // Wrapped DB updates in try/catch to prevent unhandled promise rejections.
      // Ownership check: only update DB if the exited process's PID matches the one in DB.
      try {
        await Project.updateOne(
          { projectId, lastPid: child.pid },
          { $set: { status: 'stopped', stoppedAt: new Date(), lastPid: null, lastPidStartedAt: null } }
        );
      } catch (e) {
        console.error('DB update failed:', e.message);
      }
    });


    db.processes[projectId] = child;

    // ── Helper: try to classify a log line and persist a notification ──
    function tryNotify(rawLine) {
      try {
        const payload = classifyBotMessage(rawLine, { projectType: project.type });
        if (payload) {
          // Build a fresh JWT so errorNotifier can include a working edit URL
          const userToken = jwt.sign({ username: project.owner }, SECRET_KEY, { expiresIn: JWT_EXPIRY_TIME });
          saveNotification({
            projectId,
            userId: project.owner,
            projectName: `${project.host}:${project.port}`,
            userToken,
            ...payload,
            rawError: rawLine.slice(0, MAX_ERROR_LOG_LENGTH)
          }).catch(() => {}); // never propagate — notification failure must not kill bot
        }
      } catch (e) {
        // Classification itself failed — log but never throw
        console.error(`[${projectId}] Notification classification error:`, e.message);
      }
    }

    // Update status in MongoDB, storing the child PID and the exact spawn
    // timestamp. syncStatusOnBoot() uses both to confirm the PID still belongs
    // to our process before sending SIGTERM — a recycled PID will have a
    // later OS-reported start time than this recorded timestamp.
    const spawnedAt = new Date();
    await Project.updateOne(
      { projectId },
      {
        $set: {
          status: 'running',
          startedAt: spawnedAt,
          lastPid: child.pid,
          lastPidStartedAt: spawnedAt
        }
      }
    );

    try {
      appendEvent(projectId, `Server started by ${username}`, 'info');
    } catch (e) {}

    return {
      success: true,
      pid: child.pid,
      message: 'Server started successfully'
    };
  } catch (error) {
    console.error('Error starting server:', error);
    return { success: false, error: 'Database or system error starting server' };
  } finally {
    // FIXED: Lock mechanism to prevent double-start race conditions
    startingProjects.delete(projectId);
  }
}

/**
 * Helper to safely kill a bot process.
 * Attempts to kill the in-memory handle if available, otherwise falls back
 * to the stored PID. Safely traps ESRCH errors.
 */
function killProjectProcess(project, projectId) {
  if (db.processes[projectId]) {
    const child = db.processes[projectId];
    child.kill();
    if (db.processes[projectId] === child) {
      delete db.processes[projectId];
    }
    return { success: true, method: 'memory_handle', pid: child.pid };
  } else if (project && project.lastPid) {
    try {
      process.kill(project.lastPid, 'SIGTERM');
      console.log(`[killProjectProcess] Sent SIGTERM to PID ${project.lastPid} (${projectId}) via lastPid fallback`);
      return { success: true, method: 'pid_fallback', pid: project.lastPid };
    } catch (killErr) {
      if (killErr.code !== 'ESRCH') {
        console.error(`[killProjectProcess] Failed to kill PID ${project.lastPid}:`, killErr.message);
        return { success: false, method: 'pid_fallback', error: killErr.message };
      }
      return { success: true, method: 'already_exited', pid: project.lastPid };
    }
  }
  return { success: true, method: 'none', message: 'No process or PID found' };
}

// Stop Server
async function stopServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  if (stoppingProjects.has(projectId)) {
    return { success: false, statusCode: 409, error: 'Server is already stopping' };
  }
  if (startingProjects.has(projectId)) {
    return { success: false, statusCode: 409, error: 'Server is currently starting, please wait' };
  }

  stoppingProjects.add(projectId);
  try {
    const project = await Project.findOne({ projectId });
    if (!project) {
      return { success: false, error: 'Server not found' };
    }

    if (project.owner !== username && !isAdmin(username)) {
      return { success: false, error: 'Permission denied' };
    }

    // ── Source of truth: MongoDB status, not db.processes ────────────────────
    // db.processes only holds a live handle when the process was started in
    // THIS server.js session. After a server restart db.processes is empty
    // even if bots are still running (handled by syncStatusOnBoot). We use
    // MongoDB as the authoritative status indicator and db.processes only
    // to obtain the ChildProcess handle for .kill().
    if (project.status !== 'running') {
      return { success: false, error: 'Server is not running' };
    }

    const killResult = killProjectProcess(project, projectId);
    console.log(`[stopServer] Termination result for ${projectId}:`, killResult);
    // If neither db.processes nor lastPid is available the bot is already gone;
    // we still proceed to reset DB state below.

    // Close the async log stream before we attempt to delete the log file.
    // Without this, the WriteStream may still hold a file descriptor open,
    // causing fs.unlinkSync to fail silently on some platforms.
    LogManager.close(projectId);

    // Ownership check: only update DB if the process we intended to kill
    // was indeed the last recorded process. This prevents stopServer from
    // overwriting the state of a new process that might have started.
    await Project.updateOne(
      { projectId, lastPid: project.lastPid, status: 'running' },
      {
        $set: {
          status: 'stopped',
          stoppedAt: new Date(),
          lastPid: null,
          lastPidStartedAt: null
        }
      }
    );

    // Remove logs and events
    try {
      const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
      }
    } catch (e) {
      console.error('Failed to delete log on stop:', e);
    }

    try {
      const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
      if (fs.existsSync(eventPath)) {
        fs.unlinkSync(eventPath);
      }
    } catch (e) {
      console.error('Failed to delete events on stop:', e);
    }

    return {
      success: true,
      message: 'Server stopped successfully'
    };
  } catch (error) {
    console.error('Error stopping server:', error);
    return { success: false, error: 'Failed to stop server' };
  } finally {
    stoppingProjects.delete(projectId);
  }
}

// Delete Server
async function deleteServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  try {
    const project = await Project.findOne({ projectId });
    if (!project) {
      return { success: false, error: 'Server not found' };
    }

    if (project.owner !== username && !isAdmin(username)) {
      return { success: false, error: 'Permission denied' };
    }

    const projectDir = path.join(__dirname, '../projects', projectId);

    // Stop process if running (or orphaned in background)
    const killResult = killProjectProcess(project, projectId);
    console.log(`[deleteServer] Termination result for ${projectId}:`, killResult);

    // Close both async log streams before we attempt to delete the log files.
    // Without this, the WriteStreams may still hold file descriptors open,
    // causing fs.unlinkSync to fail silently on Windows.
    await LogManager.close(projectId);
    await closeEventStream(projectId);

    // Attempt fs deletion
    try {
      const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
      if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    } catch (e) {}

    try {
      const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
      if (fs.existsSync(eventPath)) fs.unlinkSync(eventPath);
    } catch (e) {}

    try {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.error('Filesystem deletion error (non-fatal):', fsErr);
    }

    // Delete DB records
    await Project.deleteOne({ projectId });
    await User.updateOne({ username: project.owner }, { $pull: { projects: projectId } });

    return {
      success: true,
      message: 'Server deleted successfully'
    };
  } catch (err) {
    console.error('Server deletion error:', err);
    return { success: false, error: 'Failed to delete server' };
  }
}

// Get Server Status
async function getServerStatus(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  try {
    const project = await Project.findOne({ projectId });
    if (!project) {
      return { success: false, error: 'Server not found' };
    }

    if (project.owner !== username && !isAdmin(username)) {
      return { success: false, error: 'Permission denied' };
    }

    // ── MongoDB is the authoritative status source ───────────────────────────
    // db.processes reflects only processes started in this server.js session.
    // After any server restart it will be empty even if bots are running.
    // We read status from MongoDB, which is kept in sync by the lifecycle
    // handlers (startServer, stopServer, child.on('close'), syncStatusOnBoot).
    const isRunning = project.status === 'running';
    const status = isRunning ? 'running' : 'stopped';


    return {
      success: true,
      status,
      details: {
        id: projectId,
        host: project.host,
        port: project.port,
        version: project.version,
        type: project.type,
        status: status,
        startedAt: project.startedAt,
        stoppedAt: project.stoppedAt,
        uptime: isRunning ? Date.now() - new Date(project.startedAt).getTime() : null
      }
    };
  } catch (error) {
    console.error('Error getting server status:', error);
    return { success: false, error: 'Failed to get server status' };
  }
}

// ── appendEvent ───────────────────────────────────────────────────────────────
//
// Previously called fs.existsSync + fs.mkdirSync + fs.appendFileSync on every
// invocation, including from inside stdout.on('data') and stderr.on('data')
// handlers — three blocking syscalls on the hot path.
//
// Now delegates to LogManager.appendEventLine(), which writes to a pre-opened
// WriteStream and never touches the event loop. No fs calls of any kind.
function appendEvent(projectId, message, type = 'info') {
  const line = `[${new Date().toISOString()}] [${type}] ${String(message)}`;
  appendEventLine(projectId, line);
}

// Get Server Events
async function getServerEvents(projectId, username, lines = 200) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  try {
    const project = await Project.findOne({ projectId });
    if (!project) return { success: false, error: 'Server not found' };
    if (project.owner !== username && !isAdmin(username)) return { success: false, error: 'Permission denied' };

    const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);

    // readTailLines returns [] if the file is missing, is empty, or has
    // fewer lines than requested — all without loading the full file.
    const tail = await readTailLines(eventPath, Math.max(0, parseInt(lines) || 200));
    return { success: true, events: tail.join('\n') };
  } catch (err) {
    console.error('Failed to read events file:', err);
    return { success: false, error: 'Failed to read events' };
  }
}

// Get all events for all user's projects
async function getAllEvents(username, lines = 200) {
  try {
    const user = await User.findOne({ username });
    if (!user) return { success: true, events: '' };

    const projectIds = user.projects || [];
    const eventsDir = path.join(__dirname, '../data', 'events');
    const maxLines = Math.max(0, parseInt(lines) || 200);

    // Read all project event files concurrently (non-blocking, parallelised).
    // readTailLines returns [] for missing files so no existsSync check needed.
    const perProject = await Promise.all(
      projectIds.map(async (projectId) => {
        const eventPath = path.join(eventsDir, `${projectId}.log`);
        const fileLines = await readTailLines(eventPath, maxLines);
        const rows = [];
        for (const line of fileLines) {
          if (!line) continue;
          const m = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
          if (!m) continue;
          const ts = Date.parse(m[1]) || 0;
          const msg = m[3];
          rows.push({ ts, msg, projectId });
        }
        return rows;
      })
    );

    // Flatten, sort by timestamp, take the last maxLines entries.
    const rows = perProject.flat();
    rows.sort((a, b) => a.ts - b.ts);
    const tail = rows.slice(-maxLines);

    const msgs = tail.map(r => `${r.projectId ? r.projectId + ': ' : ''}${r.msg}`);
    return { success: true, events: msgs.join('\n') };
  } catch (err) {
    console.error('Failed to read all events:', err);
    return { success: false, error: 'Failed to read events' };
  }
}

// Get Server Logs
async function getServerLogs(projectId, username, lines = 200) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  try {
    const project = await Project.findOne({ projectId });
    if (!project) return { success: false, error: 'Server not found' };
    if (project.owner !== username && !isAdmin(username)) return { success: false, error: 'Permission denied' };

    const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);

    // readTailLines returns [] for missing/empty files — no existsSync needed.
    const tail = await readTailLines(logPath, Math.max(0, parseInt(lines) || 200));
    return { success: true, log: tail.join('\n') };
  } catch (err) {
    console.error('Failed to read log file:', err);
    return { success: false, error: 'Failed to read logs' };
  }
}

// List user's servers
async function listServers(username) {
  try {
    let projectsList;

    if (isAdmin(username)) {
      projectsList = await Project.find({});
    } else {
      projectsList = await Project.find({ owner: username });
    }

    const allProjects = {};

    for (const project of projectsList) {
      // ── MongoDB is the authoritative status source ─────────────────────────
      // db.processes reflects only this server.js session; using it as a
      // boolean would show all projects as 'stopped' after a restart.
      const isRunning = project.status === 'running';
      const status = isRunning ? 'running' : 'stopped';


      allProjects[project.projectId] = {
        host: project.host,
        port: project.port,
        version: project.version,
        type: project.type,
        status,
        id: project.projectId,
        owner: project.owner,
        movementInterval: project.movementInterval,
        reconnectHours: project.reconnectHours,
        usernameFile: project.usernameFile,
        actions: project.actions,
        createdAt: project.createdAt,
        startedAt: project.startedAt,
        stoppedAt: project.stoppedAt
      };
    }

    return {
      success: true,
      projects: allProjects,
      count: Object.keys(allProjects).length
    };
  } catch (error) {
    console.error('List servers error:', error);
    return {
      success: false,
      error: 'Database error',
      count: 0
    };
  }
}

// On startup: find projects marked 'running' in the DB that have no live in-memory process.
// For each one:
//   1. Query the OS start time of the stored PID.
//   2. Compare against our recorded lastPidStartedAt to confirm the PID belongs to our bot.
//   3. If confirmed → SIGTERM. If PID is gone or recycled → log and skip safely.
// Always resets the DB status to 'stopped' regardless of kill outcome.
async function syncStatusOnBoot() {
  try {
    const staleProjects = await Project.find({ status: 'running' });
    if (staleProjects.length === 0) return;

    const ids = staleProjects.map(p => p.projectId);
    console.log(`[boot] Found ${ids.length} stale 'running' project(s): ${ids.join(', ')}`);

    for (const proj of staleProjects) {
      if (!proj.lastPid) {
        console.log(`[boot] ${proj.projectId}: no stored PID, skipping kill attempt`);
        continue;
      }

      // ── Step 1: Query the OS for the actual start time of this PID ──────────
      const osStartTime = await getProcessStartTime(proj.lastPid);

      if (osStartTime === null) {
        // Process does not exist at the OS level — already gone.
        console.log(`[boot] PID ${proj.lastPid} (${proj.projectId}) no longer exists — no kill needed`);
        continue;
      }

      // ── Step 2: Verify the PID still belongs to our bot process ─────────────
      // A recycled PID will have a later OS start time than our stored timestamp.
      // If the difference exceeds the tolerance, this is a different process.
      if (!proj.lastPidStartedAt || !pidBelongsToOurBot(proj.lastPid, proj.lastPidStartedAt, osStartTime)) {
        console.warn(
          `[boot] PID ${proj.lastPid} (${proj.projectId}) appears to have been recycled ` +
          `(stored: ${proj.lastPidStartedAt?.toISOString() ?? 'unknown'}, ` +
          `OS: ${osStartTime.toISOString()}) — skipping kill to protect unrelated process`
        );
        continue;
      }

      // ── Step 3: Identity confirmed — kill the orphan ─────────────────────────
      try {
        process.kill(proj.lastPid, 'SIGTERM');
        console.log(`[boot] Sent SIGTERM to confirmed orphan PID ${proj.lastPid} (${proj.projectId})`);
      } catch (killErr) {
        if (killErr.code === 'ESRCH') {
          // Exited in the gap between our OS query and the kill call — harmless.
          console.log(`[boot] PID ${proj.lastPid} (${proj.projectId}) exited before SIGTERM — already gone`);
        } else if (killErr.code === 'EPERM') {
          console.warn(`[boot] No permission to kill PID ${proj.lastPid} (${proj.projectId}) — skipping`);
        } else {
          console.error(`[boot] Unexpected error killing PID ${proj.lastPid}:`, killErr.message);
        }
      }
    }

    // Reset DB status regardless of whether individual kills succeeded.
    await Project.updateMany(
      { projectId: { $in: ids } },
      { $set: { status: 'stopped', stoppedAt: new Date(), lastPid: null, lastPidStartedAt: null } }
    );
    console.log(`[boot] Reset ${ids.length} stale project(s) to 'stopped'`);
  } catch (err) {
    console.error('[boot] Failed to sync statuses:', err);
  }
}

// Initialization of templates & default users
async function initialize() {
  try {
    // Reset stale running statuses from previous session
    await syncStatusOnBoot();

    // Ensure default "guest" user exists
    const guestUser = await User.findOne({ username: 'guest' });
    if (!guestUser) {
      await User.create({
        username: 'guest',
        passwordHash: 'disabled',
        projects: [],
        createdAt: new Date()
      });
      console.log("Default guest user created.");
    }

    // Ensure default "admin" user exists
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminUsername && adminPassword) {
      const adminUser = await User.findOne({ username: adminUsername });
      if (!adminUser) {
        await User.create({
          username: adminUsername,
          passwordHash: await bcrypt.hash(adminPassword, 10),
          projects: [],
          createdAt: new Date()
        });
        console.log(`Admin user '${adminUsername}' created.`);
      }
    }

    // Make template and project directories
    const requiredDirs = [
      path.join(__dirname, '../projects'),
      path.join(__dirname, '../data'),
      path.join(__dirname, '../data/logs'),
      path.join(__dirname, '../data/events'),
      path.join(__dirname, '../data/players'),
      path.join(__dirname, '../templates/java'),
      path.join(__dirname, '../templates/bedrock')
    ];

    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

// Update Server Settings
async function updateServer(projectId, ip, port, version, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }

  if (!ip || !port || !version) {
    return { success: false, error: 'Host, port, and version are required' };
  }

  const { isAternosAddLink, resolveAternosLink } = require('./aternosResolver');
  let resolvedIp = ip;
  let resolvedPort = port;

  if (isAternosAddLink(ip)) {
    try {
      const resolved = await resolveAternosLink(ip);
      if (resolved) {
        resolvedIp = resolved.hostname;
        resolvedPort = resolved.port;
      }
    } catch (err) {
      console.error('Failed to resolve Aternos link:', err);
      return { success: false, error: `Failed to resolve Aternos link: ${err.message}` };
    }
  }

  if (isNaN(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    return { success: false, error: 'Port must be between 1 and 65535' };
  }

  if (typeof resolvedIp !== 'string' || resolvedIp.length > 253 || /[\/\\\s]/.test(resolvedIp)) {
    return { success: false, error: 'Invalid host' };
  }

  try {
    const project = await Project.findOne({ projectId });
    if (!project) {
      return { success: false, error: 'Server not found' };
    }

    if (project.owner !== username && !isAdmin(username)) {
      return { success: false, error: 'Permission denied' };
    }

    // ── Guard: use MongoDB status, not db.processes ───────────────────────────
    // After a server restart, db.processes is empty even if the bot is running.
    // MongoDB is the reliable source of truth for whether a bot is active.
    if (project.status === 'running') {
      return { success: false, error: 'Cannot edit server settings while the bot is running. Please stop it first.' };
    }

    const projectDir = path.join(__dirname, '../projects', projectId);
    const configPath = path.join(projectDir, 'config.json');

    // Update config file on disk
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(fileContent);
        
        config.host = resolvedIp;
        config.port = parseInt(resolvedPort);
        config.version = version;

        await atomicWriteJsonAsync(configPath, config);
      } catch (err) {
        console.error('Failed to update config.json file:', err);
        return { success: false, error: 'Failed to update local server configuration file' };
      }
    } else {
      return { success: false, error: 'Configuration file not found' };
    }

    // Update MongoDB
    await Project.updateOne(
      { projectId },
      {
        $set: {
          host: resolvedIp,
          port: parseInt(resolvedPort),
          version: version
        }
      }
    );

    // Append lifecycle info log event
    try {
      appendEvent(projectId, `Server configuration updated: host=${resolvedIp}, port=${resolvedPort}, version=${version}`, 'info');
    } catch (e) {}

    return {
      success: true,
      host: resolvedIp,
      port: parseInt(resolvedPort),
      message: 'Server updated successfully'
    };
  } catch (error) {
    console.error('Error updating server:', error);
    return { success: false, error: 'Failed to update server' };
  }
}

module.exports = {
  createUser,
  authenticateUser,
  verifyToken,
  createServer,
  startServer,
  stopServer,
  deleteServer,
  updateServer,
  getServerStatus,
  listServers,
  getServerLogs,
  getServerEvents,
  getAllEvents,
  appendEvent,
  isAdmin,
  initialize,
  db,
  SECRET_KEY
};