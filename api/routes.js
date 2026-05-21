const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Changed from 10 to 1000
  standardHeaders: true,
  legacyHeaders: false
});

const { exec } = require('child_process');
const path = require('path');

const {
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
  isAdmin
} = require('./api');

// Admin users (comma-separated usernames) who can run privileged actions like rebuilding native modules
const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

// Enhanced authentication middleware
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    
    console.log(`Auth request: token=${token}`);

    // In guest mode, if token is missing or token is literally string "null"/"undefined", authenticate as guest
    if (!token || token === 'null' || token === 'undefined') {
      req.user = { username: 'guest' };
      return next();
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      console.log('Invalid or expired token, falling back to guest');
      // If token expired or invalid, fall back to guest instead of rejecting
      req.user = { username: 'guest' };
      return next();
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authentication' 
    });
  }
}

// Auth routes
router.post('/auth/signup', authLimiter, async (req, res) => {
  console.log('Signup attempt:', req.body);
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('Signup error: missing credentials');
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    const result = await createUser(username, password);
    console.log('Signup result:', result);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

router.post('/auth/login', authLimiter, async (req, res) => {
  console.log('Login attempt for:', req.body.username);
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('Login error: missing credentials');
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }

    const result = await authenticateUser(username, password);
    console.log('Login result:', result.success ? 'success' : 'failed');
    res.status(result.success ? 200 : 401).json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Protected API routes
router.post('/projects', authenticate, async (req, res) => {
  if (req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Registration/Login required to create servers' });
  }
  try {
    const { ip, port, version, type } = req.body;
    
    if (!ip || !port || !version || !type) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    const result = await createServer(ip, port, version, type, req.user.username);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

router.post('/projects/:id/start', authenticate, async (req, res) => {
  try {
    const result = await startServer(req.params.id, req.user.username);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Start server error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

router.post('/projects/:id/stop', authenticate, async (req, res) => {
  try {
    const result = await stopServer(req.params.id, req.user.username);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Stop server error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

router.delete('/projects/:id', authenticate, async (req, res) => {
  try {
    const result = await deleteServer(req.params.id, req.user.username);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

router.get('/projects/:id/status', authenticate, async (req, res) => {
  try {
    const result = await getServerStatus(req.params.id, req.user.username);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Fetch server logs (tail)
router.get('/projects/:id/logs', authenticate, async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 200;
    const result = await getServerLogs(req.params.id, req.user.username, lines);
    if (!result.success) {
      // Map errors to appropriate status codes
      if (result.error === 'No logs found') return res.status(404).json(result);
      if (result.error === 'Permission denied') return res.status(403).json(result);
      if (result.error === 'Server not found' || result.error === 'Invalid project id') return res.status(404).json(result);
      return res.status(400).json(result);
    }
    res.json({ success: true, log: result.log });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Fetch server events (tail of recent short events/errors)
router.get('/projects/:id/events', authenticate, async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 200;
    // Debug: log request context to help diagnose failures
    console.log(`Get events request: project=${req.params.id}, user=${req.user && req.user.username}, lines=${lines}`);
    const result = await getServerEvents(req.params.id, req.user.username, lines);
    console.log('getServerEvents result:', result && typeof result === 'object' ? Object.keys(result) : result);
    if (!result.success) {
      if (result.error === 'Permission denied') return res.status(403).json(result);
      if (result.error === 'Server not found' || result.error === 'Invalid project id') return res.status(404).json(result);
      return res.status(400).json(result);
    }
    res.json({ success: true, events: result.events });
  } catch (error) {
    // Log full stack for debugging and return a clearer message to clients
    console.error('Get events error:', error && error.stack ? error.stack : error);
    // Also show context
    console.error('Request context:', { params: req.params, user: req.user && req.user.username, query: req.query });
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

router.get('/projects', authenticate, async (req, res) => {
    try {
        const result = await listServers(req.user.username);
        res.json({
            success: true,
            projects: result.projects || {},
            count: result.count || 0
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Token verification endpoint
router.get('/auth/verify', authenticate, (req, res) => {
  const isAdmin = ADMIN_USERS.includes(req.user.username);
  res.json({ 
    success: true, 
    user: req.user,
    isAdmin,
    message: 'Token is valid'
  });
});

// Admin-only endpoint to attempt rebuilding raknet-native (runs `npm run rebuild-raknet`)
router.post('/admin/rebuild-raknet', authenticate, (req, res) => {
  if (!ADMIN_USERS.includes(req.user.username)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const cwd = path.join(__dirname, '..'); // repo root

  // Limit runtime to 5 minutes, cap stdout/stderr length returned
  exec('npm run rebuild-raknet', { cwd, timeout: 5 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
    const out = String(stdout || '').slice(0, 200000);
    const errout = String(stderr || '').slice(0, 200000);
    if (err) {
      return res.status(500).json({ success: false, error: err.message, stdout: out, stderr: errout });
    }
    res.json({ success: true, stdout: out, stderr: errout });
  });
});

// Admin-only endpoint to fetch last rebuild logs
router.get('/admin/rebuild-logs', authenticate, (req, res) => {
  if (!ADMIN_USERS.includes(req.user.username)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const fs = require('fs');
  const path = require('path');
  const latestPath = path.join(__dirname, '..', 'data', 'rebuild-raknet-latest.json');

  try {
    if (!fs.existsSync(latestPath)) {
      return res.status(404).json({ success: false, error: 'No rebuild logs found' });
    }

    const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    res.json({ success: true, latest: data });
  } catch (err) {
    console.error('Failed to read rebuild logs:', err);
    res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
});

// Events across all user's projects (tail of recent short events/errors)
router.get('/events', authenticate, async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 200;
    console.log(`Get all events request: user=${req.user && req.user.username}, lines=${lines}`);
    const result = await getAllEvents(req.user.username, lines);
    console.log('getAllEvents result keys:', result && typeof result === 'object' ? Object.keys(result) : result);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, events: result.events });
  } catch (error) {
    console.error('Get all events error:', error && error.stack ? error.stack : error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

// Health check endpoint (reports native binding availability and environment)
router.get('/health', (req, res) => {
  const node = process.version;
  const platform = `${process.platform}/${process.arch}`;
  let raknetInstalled = false;
  let raknetError = null;

  try {
    require.resolve('raknet-native');
    raknetInstalled = true;
  } catch (err) {
    raknetError = err && (err.message || String(err));
  }

  res.json({
    success: true,
    node,
    platform,
    raknet: {
      installed: raknetInstalled,
      error: raknetError
    }
  });
});

module.exports = router;