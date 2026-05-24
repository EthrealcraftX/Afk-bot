const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const net = require('net');

// Import Mongoose Models
const User = require('./models/User');
const Project = require('./models/Project');

// Keep in-memory tracking of child processes
const db = {
  processes: {}
};

// Configuration
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('JWT_SECRET environment variable is required. Exiting.');
  process.exit(1);
}
const MAX_PROJECTS_PER_USER = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3;

// User Management functions
async function createUser(username, password, allowOverwrite = false) {
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      if (allowOverwrite) {
        // Trusted bot request: reset password for existing tg_ user
        console.log(`[API] Overwriting password for existing user '${username}' (authorized bot request).`);
        const passwordHash = bcrypt.hashSync(password, 10);
        await User.updateOne({ username }, { $set: { passwordHash } });
        return { success: true, message: 'User password updated successfully' };
      }
      return { success: false, error: 'Username already exists' };
    }

    const passwordHash = bcrypt.hashSync(password, 10);
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
    if (!user || !bcrypt.compareSync(password, user.passwordHash || '')) {
      return { success: false, error: 'Invalid username or password' };
    }

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
    return { success: true, token, username };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

function isAdmin(username) {
  return username === (process.env.ADMIN_USERNAME || 'admin');
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (err) {
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

  if (isNaN(port) || port < 1 || port > 65535) {
    return { success: false, error: 'Port must be between 1 and 65535' };
  }

  if (!['java', 'bedrock'].includes(type)) {
    return { success: false, error: 'Invalid server type' };
  }

  if (typeof ip !== 'string' || ip.length > 253 || /[\/\\\s]/.test(ip)) {
    return { success: false, error: 'Invalid host' };
  }

  // Check user limit
  const canCreate = await canCreateMoreProjects(username);
  if (!canCreate) {
    return {
      success: false,
      error: `You can't create more than ${MAX_PROJECTS_PER_USER} servers`
    };
  }

  const projectId = `project_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const projectDir = path.join(__dirname, '../projects', projectId);

  try {
    // Create project directory
    fs.mkdirSync(projectDir, { recursive: true });

    // Config structure
    const config = {
      projectId,
      host: ip,
      port: parseInt(port),
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

    // Save configuration file inside the project directory (since original project expects a local config.json)
    fs.writeFileSync(
      path.join(projectDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    // Copy template structure
    const templateDir = path.join(__dirname, '../templates', type);
    if (fs.existsSync(templateDir)) {
      fs.cpSync(templateDir, projectDir, { recursive: true });
    }

    // Save in Database
    await Project.create(config);
    await User.updateOne({ username }, { $push: { projects: projectId } });

    // Append creation event
    try {
      appendEvent(projectId, `Server created by ${username}`, 'info');
    } catch (e) {}

    return {
      success: true,
      projectId,
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
      delete db.processes[projectId];
      await Project.updateOne({ projectId }, { $set: { status: 'stopped', stoppedAt: new Date() } });
    });

    const logsDir = path.join(__dirname, '../data', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, `${projectId}.log`);

    try {
      fs.writeFileSync(logPath, '');
    } catch (e) {
      console.error('Failed to create/truncate log file:', e);
    }

    const eventsDir = path.join(__dirname, '../data', 'events');
    if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
    const eventPath = path.join(eventsDir, `${projectId}.log`);
    try {
      fs.writeFileSync(eventPath, '');
    } catch (e) {
      console.error('Failed to create/truncate event file:', e);
    }

    child.stdout.on('data', (data) => {
      const msg = `[${new Date().toISOString()}] [${projectId}] stdout: ${String(data)}`;
      console.log(msg);
      try {
        fs.appendFileSync(logPath, msg + '\n');
      } catch (e) {
        console.error('Failed to append stdout to log:', e);
      }
      try {
        appendEvent(projectId, String(data).trim(), 'info');
      } catch (e) {}
    });

    child.stderr.on('data', (data) => {
      const msg = `[${new Date().toISOString()}] [${projectId}] stderr: ${String(data)}`;
      console.error(msg);
      try {
        fs.appendFileSync(logPath, msg + '\n');
      } catch (e) {
        console.error('Failed to append stderr to log:', e);
      }
      try {
        appendEvent(projectId, String(data).trim(), 'error');
      } catch (e) {}
    });

    child.on('close', async (code) => {
      console.log(`[${projectId}] Process exited with code ${code}`);
      try {
        appendEvent(projectId, `Process exited with code ${code}`, 'info');
      } catch (e) {}
      delete db.processes[projectId];
      await Project.updateOne({ projectId }, { $set: { status: 'stopped', stoppedAt: new Date() } });
    });

    db.processes[projectId] = child;

    // Update status in MongoDB
    await Project.updateOne(
      { projectId },
      {
        $set: {
          status: 'running',
          startedAt: new Date()
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
  }
}

// Stop Server
async function stopServer(projectId, username) {
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

    if (!db.processes[projectId]) {
      return { success: false, error: 'Server is not running' };
    }

    db.processes[projectId].kill();
    delete db.processes[projectId];

    await Project.updateOne(
      { projectId },
      {
        $set: {
          status: 'stopped',
          stoppedAt: new Date()
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

    // Stop process if running
    if (db.processes[projectId]) {
      db.processes[projectId].kill();
      delete db.processes[projectId];
    }

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

    // db.processes is the real-time source of truth.
    // If the process is not tracked (e.g. after a server restart),
    // the bot is definitively stopped, even if MongoDB says 'running'.
    const isRunning = !!db.processes[projectId];
    const status = isRunning ? 'running' : 'stopped';

    // Sync MongoDB if it's out of date
    if (!isRunning && project.status === 'running') {
      await Project.updateOne({ projectId }, { $set: { status: 'stopped', stoppedAt: new Date() } });
    }

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

// Append event (helper)
function appendEvent(projectId, message, type = 'info') {
  try {
    const eventsDir = path.join(__dirname, '../data', 'events');
    if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
    const line = `[${new Date().toISOString()}] [${type}] ${String(message)}`;
    fs.appendFileSync(path.join(eventsDir, `${projectId}.log`), line + '\n');
  } catch (err) {
    console.error('Failed to append event:', err);
  }
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
    if (!fs.existsSync(eventPath)) return { success: true, events: '' };

    const content = fs.readFileSync(eventPath, 'utf8');
    const arr = content.split(/\r?\n/);
    const tail = arr.slice(-Math.max(0, parseInt(lines) || 200));
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
    const rows = [];

    for (const projectId of projectIds) {
      const eventPath = path.join(eventsDir, `${projectId}.log`);
      if (!fs.existsSync(eventPath)) continue;
      const content = fs.readFileSync(eventPath, 'utf8');
      const arr = content.split(/\r?\n/).filter(Boolean);
      for (const line of arr) {
        const m = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
        if (!m) continue;
        const ts = Date.parse(m[1]) || 0;
        const type = m[2];
        const msg = m[3];
        rows.push({ ts, type, msg, projectId });
      }
    }

    rows.sort((a, b) => a.ts - b.ts);
    const tail = rows.slice(-Math.max(0, parseInt(lines) || 200));

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
    if (!fs.existsSync(logPath)) return { success: true, log: '' };

    const content = fs.readFileSync(logPath, 'utf8');
    const arr = content.split(/\r?\n/);
    const tail = arr.slice(-Math.max(0, parseInt(lines) || 200));
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
    const staleRunning = [];

    for (const project of projectsList) {
      // db.processes is the authoritative real-time source.
      // If a process isn't tracked here, the bot is stopped regardless of DB value.
      const isRunning = !!db.processes[project.projectId];
      const status = isRunning ? 'running' : 'stopped';

      // Collect stale records to fix in DB
      if (!isRunning && project.status === 'running') {
        staleRunning.push(project.projectId);
      }

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

    // Fix any stale 'running' statuses in MongoDB (happens after server restart)
    if (staleRunning.length > 0) {
      console.log(`[listServers] Fixing stale 'running' status for: ${staleRunning.join(', ')}`);
      await Project.updateMany(
        { projectId: { $in: staleRunning } },
        { $set: { status: 'stopped', stoppedAt: new Date() } }
      );
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

// On startup: reset any projects that are marked 'running' in DB but have no live process.
// This handles the case where the server was restarted while bots were running.
async function syncStatusOnBoot() {
  try {
    const staleProjects = await Project.find({ status: 'running' });
    if (staleProjects.length > 0) {
      const ids = staleProjects.map(p => p.projectId);
      console.log(`[boot] Resetting stale 'running' status for ${ids.length} project(s): ${ids.join(', ')}`);
      await Project.updateMany(
        { projectId: { $in: ids } },
        { $set: { status: 'stopped', stoppedAt: new Date() } }
      );
    }
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
          passwordHash: bcrypt.hashSync(adminPassword, 10),
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

module.exports = {
  createUser,
  authenticateUser,
  verifyToken,
  createServer,
  startServer,
  stopServer,
  deleteServer,
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