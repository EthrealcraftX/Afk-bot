const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const net = require('net');

// Database structure
const db = {
  projects: {},
  users: {},
  processes: {}
};

// Konfiguratsiya
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  console.error('JWT_SECRET environment variable is required. Exiting.');
  process.exit(1);
}
const MAX_PROJECTS_PER_USER = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3; 

// Ma'lumotlar bazasini yuklash
function loadDatabase() {
  try {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const projectsPath = path.join(dataDir, 'projects.json');
    const usersPath = path.join(dataDir, 'users.json');

    if (fs.existsSync(projectsPath)) {
      db.projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    }

    if (fs.existsSync(usersPath)) {
      db.users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

      // Migrate plaintext passwords (if any) to bcrypt hashed passwords
      let migrated = false;
      for (const [uname, uobj] of Object.entries(db.users)) {
        if (uobj.password) {
          uobj.passwordHash = bcrypt.hashSync(uobj.password, 10);
          delete uobj.password;
          migrated = true;
          console.log(`Migrated password for user ${uname} to hashed value`);
        }
      }
      if (migrated) saveDatabase();
    }
  } catch (err) {
    console.error('Database load error:', err);
  }
}

// Ma'lumotlar bazasini saqlash
function saveDatabase() {
  // Simple validation before saving
  if (!db.projects || typeof db.projects !== 'object' || !db.users || typeof db.users !== 'object') {
    console.error('Database validation failed: Invalid structure - not saving');
    return;
  }

  try {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const files = [
      { name: 'projects.json', data: db.projects },
      { name: 'users.json', data: db.users }
    ];

    for (const file of files) {
      const filePath = path.join(dataDir, file.name);
      
      // Atomic backup and save
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, path.join(backupDir, `${file.name}.${timestamp}.bak`));
      }

      const tempPath = filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(file.data, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    }
  } catch (err) {
    console.error('Database save error:', err);
  }
}

// Foydalanuvchi yaratish
function createUser(username, password) {
  if (db.users[username]) {
    return { success: false, error: 'Username already exists' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.users[username] = {
    passwordHash,
    projects: {},
    createdAt: new Date().toISOString()
  };

  saveDatabase();
  return { success: true, message: 'User created successfully' };
}

// Foydalanuvchini tekshirish
function authenticateUser(username, password) {
  const user = db.users[username];
  if (!user || !bcrypt.compareSync(password, user.passwordHash || '')) {
    return { success: false, error: 'Invalid username or password' };
  }

  const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
  return { success: true, token, username };
}

function isAdmin(username) {
  return username === (process.env.ADMIN_USERNAME || 'admin');
}

// Token ni tekshirish
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (err) {
    return null;
  }
}

// Foydalanuvchining server limitini tekshirish
function canCreateMoreProjects(username) {
  const user = db.users[username];
  if (!user) return false;
  return Object.keys(user.projects).length < MAX_PROJECTS_PER_USER;
}

// Foydalanuvchiga server qo'shish
function addProjectToUser(username, projectId, projectData) {
  if (!db.users[username]) return false;
  
  db.users[username].projects[projectId] = projectData;
  saveDatabase();
  return true;
}

// Foydalanuvchining serverlarini olish
function getUserProjects(username) {
  return db.users[username]?.projects || {};
}

// Server yaratish
function createServer(ip, port, version, type, username) {
  // Limitni tekshirish
  if (!canCreateMoreProjects(username)) {
    return { 
      success: false, 
      error: `You can't create more than ${MAX_PROJECTS_PER_USER} servers` 
    };
  }

  // Validatsiya
  if (!ip || !port || !version || !type) {
    return { success: false, error: 'All fields are required' };
  }

  if (isNaN(port) || port < 1 || port > 65535) {
    return { success: false, error: 'Port must be between 1 and 65535' };
  }

  // Validate type and host
  if (!['java', 'bedrock'].includes(type)) {
    return { success: false, error: 'Invalid server type' };
  }

  if (typeof ip !== 'string' || ip.length > 253 || /[\/\\\s]/.test(ip)) {
    return { success: false, error: 'Invalid host' };
  }

  const projectId = `project_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const projectDir = path.join(__dirname, '../projects', projectId);

  try {
    // Papka yaratish
    fs.mkdirSync(projectDir, { recursive: true });

    // Konfiguratsiya fayli
    const config = {
  host: ip,
  port: parseInt(port),
  version,
  type,
  movementInterval: 5000,    
  reconnectHours: 2,                
  usernameFile: "usernames.txt",
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
  createdAt: new Date().toISOString()
};

    fs.writeFileSync(
      path.join(projectDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );

    // Shablonni nusxalash
    const templateDir = path.join(__dirname, '../templates', type);
    if (fs.existsSync(templateDir)) {
      fs.cpSync(templateDir, projectDir, { recursive: true });
    }

    // Ma'lumotlar bazasiga qo'shish
    db.projects[projectId] = config;
    addProjectToUser(username, projectId, config);
    saveDatabase();

    // Append creation event for UI
    try { appendEvent(projectId, `Server created by ${username}`, 'info'); } catch (e) {}

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

// Serverni ishga tushirish
function startServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];

  // Tekshirishlar
  if (!project) {
    return { success: false, error: 'Server not found' };
  }

  if (project.owner !== username && !isAdmin(username)) {
    return { success: false, error: 'Permission denied' };
  }

  if (db.processes[projectId]) {
    return { success: false, error: 'Server is already running' };
  }

  // Bedrock projects will use pure JS jsp-raknet by default, so we don't block on native raknet-native resolution.

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

  // Capture child process errors to ensure we clean up
  child.on('error', (err) => {
    console.error(`[${projectId}] Child process error:`, err);
    delete db.processes[projectId];
    if (db.projects[projectId]) {
      db.projects[projectId].status = 'stopped';
      saveDatabase();
    }
  });

  // Ensure logs directory exists
  const logsDir = path.join(__dirname, '../data', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${projectId}.log`);

  // Truncate / create a fresh log file on start so each start gets a new log
  try {
    fs.writeFileSync(logPath, '');
  } catch (e) {
    console.error('Failed to create/truncate log file:', e);
  }

  // Ensure events directory exists and create/truncate event file for this run
  const eventsDir = path.join(__dirname, '../data', 'events');
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
  const eventPath = path.join(eventsDir, `${projectId}.log`);
  try {
    fs.writeFileSync(eventPath, '');
  } catch (e) {
    console.error('Failed to create/truncate event file:', e);
  }

  // Protsess chiqadigan ma'lumotlar (logga yozish bilan birga konsolga chiqarish) and append events
  child.stdout.on('data', (data) => {
    const msg = `[${new Date().toISOString()}] [${projectId}] stdout: ${String(data)}`;
    console.log(msg);
    try { fs.appendFileSync(logPath, msg + '\n'); } catch (e) { console.error('Failed to append stdout to log:', e); }
    try { appendEvent(projectId, String(data).trim(), 'info'); } catch (e) { /* ignore */ }
  });

  child.stderr.on('data', (data) => {
    const msg = `[${new Date().toISOString()}] [${projectId}] stderr: ${String(data)}`;
    console.error(msg);
    try { fs.appendFileSync(logPath, msg + '\n'); } catch (e) { console.error('Failed to append stderr to log:', e); }
    try { appendEvent(projectId, String(data).trim(), 'error'); } catch (e) { /* ignore */ }
  });

  child.on('close', (code) => {
    console.log(`[${projectId}] Process exited with code ${code}`);
    try { appendEvent(projectId, `Process exited with code ${code}`, 'info'); } catch (e) {}
    delete db.processes[projectId];
    if (db.projects[projectId]) {
      db.projects[projectId].status = "stopped";
      saveDatabase();
    }
  });

  child.on('error', (err) => {
    console.error(`[${projectId}] Child process error:`, err);
    try { appendEvent(projectId, `Child process error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) {}
    delete db.processes[projectId];
    if (db.projects[projectId]) {
      db.projects[projectId].status = 'stopped';
      saveDatabase();
    }
  });

  // Ma'lumotlarni yangilash
  db.processes[projectId] = child;
  db.projects[projectId].status = "running";
  db.projects[projectId].startedAt = new Date().toISOString();
  saveDatabase();
  // Append a start event for the UI
  try { appendEvent(projectId, `Server started by ${username}`, 'info'); } catch (e) {}
  return { 
    success: true,
    pid: child.pid,
    message: 'Server started successfully'
  };
}

// Serverni to'xtatish
function stopServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];

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
  db.projects[projectId].status = "stopped";
  db.projects[projectId].stoppedAt = new Date().toISOString();
  saveDatabase();

  // Remove the log file for this server when it's stopped (user requested behavior)
  try {
    const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
      console.log(`Deleted log file for ${projectId} on stop`);
    }
  } catch (e) {
    console.error('Failed to delete log on stop:', e);
  }

  // Also remove the events file for this server when it's stopped so UI doesn't show stale events
  try {
    const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
    if (fs.existsSync(eventPath)) {
      fs.unlinkSync(eventPath);
      console.log(`Deleted event file for ${projectId} on stop`);
    }
  } catch (e) {
    console.error('Failed to delete events on stop:', e);
  }

  return { 
    success: true,
    message: 'Server stopped successfully'
  };
}

// Serverni o'chirish
function deleteServer(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];

  if (!project) {
    return { success: false, error: 'Server not found' };
  }

  if (project.owner !== username && !isAdmin(username)) {
    return { success: false, error: 'Permission denied' };
  }

  const projectDir = path.join(__dirname, '../projects', projectId);

  // Agar ishlayotgan bo'lsa, to'xtatish
  if (db.processes[projectId]) {
    db.processes[projectId].kill();
    delete db.processes[projectId];
  }

  try {
    // Attempt to delete the log file first (do this regardless of whether we can delete the project folder immediately)
    try {
      const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
        console.log(`Deleted log file for ${projectId} on delete`);
      }
    } catch (e) {
      console.error('Failed to delete log on project delete:', e);
    }

    // Also remove events file if present
    try {
      const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
      if (fs.existsSync(eventPath)) {
        fs.unlinkSync(eventPath);
        console.log(`Deleted event file for ${projectId} on delete`);
      }
    } catch (e) {
      console.error('Failed to delete events on project delete:', e);
    }

    // Papkani o'chirish - if this fails (e.g., file handles open on Windows), log the error but continue to remove DB entries
    try {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.error('Filesystem deletion error (non-fatal):', fsErr);
    }

    // Ma'lumotlar bazasidan o'chirish
    delete db.projects[projectId];
    if (db.users[username]?.projects[projectId]) {
      delete db.users[username].projects[projectId];
    }
    saveDatabase();

    return { 
      success: true,
      message: 'Server deleted successfully'
    };

  } catch (err) {
    console.error('Server deletion error:', err);
    return { success: false, error: 'Failed to delete server' };
  }
}

// Server holatini olish
function getServerStatus(projectId, username) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];

  if (!project) {
    return { success: false, error: 'Server not found' };
  }

  if (project.owner !== username && !isAdmin(username)) {
    return { success: false, error: 'Permission denied' };
  }

  const isRunning = !!db.processes[projectId];
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
      uptime: isRunning ? 
        Date.now() - new Date(project.startedAt).getTime() : null
    }
  };
}

// Append a short event to the per-project events file (used by UI)
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

// Events tail reader (oxirgi N qator)
function getServerEvents(projectId, username, lines = 200) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];
  if (!project) return { success: false, error: 'Server not found' };
  if (project.owner !== username && !isAdmin(username)) return { success: false, error: 'Permission denied' };

  const eventPath = path.join(__dirname, '../data', 'events', `${projectId}.log`);
  if (!fs.existsSync(eventPath)) return { success: true, events: '' };

  try {
    const content = fs.readFileSync(eventPath, 'utf8');
    const arr = content.split(/\r?\n/);
    const tail = arr.slice(-Math.max(0, parseInt(lines) || 200));
    return { success: true, events: tail.join('\n') };
  } catch (err) {
    console.error('Failed to read events file:', err);
    return { success: false, error: 'Failed to read events' };
  }
}

// Read recent events across ALL projects owned by the user
function getAllEvents(username, lines = 200) {
  try {
    if (!db.users[username]) return { success: true, events: '' };
    const projectIds = Object.keys(db.users[username].projects || {});
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

    // sort by timestamp ascending and take last N
    rows.sort((a, b) => a.ts - b.ts);
    const tail = rows.slice(-Math.max(0, parseInt(lines) || 200));

    // Return messages WITHOUT timestamps (user requested plain messages)
    const msgs = tail.map(r => `${r.projectId ? r.projectId + ': ' : ''}${r.msg}`);
    return { success: true, events: msgs.join('\n') };
  } catch (err) {
    console.error('Failed to read all events:', err);
    return { success: false, error: 'Failed to read events' };
  }
}

// Loglarni o'qish (oxirgi N qator)
function getServerLogs(projectId, username, lines = 200) {
  if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
    return { success: false, error: 'Invalid project id' };
  }
  const project = db.projects[projectId];
  if (!project) return { success: false, error: 'Server not found' };
  if (project.owner !== username && !isAdmin(username)) return { success: false, error: 'Permission denied' };

  const logPath = path.join(__dirname, '../data', 'logs', `${projectId}.log`);
  if (!fs.existsSync(logPath)) return { success: true, log: '' };

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const arr = content.split(/\r?\n/); // keep empty lines to preserve format
    const tail = arr.slice(-Math.max(0, parseInt(lines) || 200));
    return { success: true, log: tail.join('\n') };
  } catch (err) {
    console.error('Failed to read log file:', err);
    return { success: false, error: 'Failed to read logs' };
  }
}

// Foydalanuvchi serverlarini ro'yxati
async function listServers(username) {
    try {
        if (isAdmin(username)) {
            // Admin lists all projects
            const allProjects = {};
            for (const [projectId, project] of Object.entries(db.projects)) {
                allProjects[projectId] = {
                    ...project,
                    status: db.processes[projectId] ? 'running' : 'stopped',
                    id: projectId
                };
            }
            return {
                success: true,
                projects: allProjects,
                count: Object.keys(allProjects).length
            };
        }

        // Foydalanuvchi mavjudligini tekshirish
        if (!db.users || !db.users[username]) {
            return { 
                success: false, 
                error: 'User not found',
                count: 0
            };
        }

        const user = db.users[username];
        const userProjects = {};

        // Har bir serverni tekshirish
        for (const projectId of Object.keys(user.projects || {})) {
            if (db.projects[projectId]) {
                userProjects[projectId] = {
                    ...db.projects[projectId],
                    status: db.processes[projectId] ? 'running' : 'stopped',
                    id: projectId
                };
            }
        }

        return {
            success: true,
            projects: userProjects,
            count: Object.keys(userProjects).length
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

// Dasturni ishga tushirish
function initialize() {
  loadDatabase();
  
  // Ensure default "guest" user exists for public access without auth
  if (!db.users['guest']) {
    db.users['guest'] = {
      passwordHash: '',
      projects: {},
      createdAt: new Date().toISOString()
    };
    saveDatabase();
  }
  
  // Ensure "admin" user exists
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (adminUsername && adminPassword) {
    if (!db.users[adminUsername]) {
      db.users[adminUsername] = {
        passwordHash: bcrypt.hashSync(adminPassword, 10),
        projects: {},
        createdAt: new Date().toISOString()
      };
      saveDatabase();
      console.log(`Admin user '${adminUsername}' created.`);
    }
  }
  
  // Kerakli papkalarni yaratish
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
}

module.exports = {
  // Auth funktsiyalari
  createUser,
  authenticateUser,
  verifyToken,
  
  // Server funktsiyalari
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
  
  // Boshqaruv funktsiyalari
  initialize,
  db,
  SECRET_KEY
};