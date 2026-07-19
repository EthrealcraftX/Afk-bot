const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const fs = require('fs');

function parseLinesParam(queryValue, defaultValue = 200, maxLimit = 1000) {
  // 1. Omitted parameter: return default
  if (queryValue === undefined) {
    return { success: true, lines: defaultValue };
  }
  
  // 2. Reject floats, negative numbers, empty strings, and non-numeric garbage
  if (typeof queryValue !== 'string' || !/^\d+$/.test(queryValue)) {
    return { success: false, error: "'lines' parameter must be a positive integer" };
  }
  
  const parsed = Number(queryValue);
  
  // 3. Defense in depth & reject zero
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { success: false, error: "'lines' parameter must be greater than zero" };
  }
  
  // 4. Enforce reasonable upper limit to prevent memory exhaustion
  if (parsed > maxLimit) {
    return { success: false, error: `'lines' parameter cannot exceed ${maxLimit}` };
  }
  
  return { success: true, lines: parsed };
}
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

// Strict limiter for project creation.
// 5 attempts per 10 minutes per IP is more than enough for normal use;
// it makes it practically impossible to race-condition the project limit
// even if the DB-level check somehow failed.
const projectCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Admin users are never limited so they can manage accounts without friction.
    return req.user && req.user.username &&
      (require('./api').isAdmin(req.user.username));
  },
  message: {
    success: false,
    error: 'Too many server creation requests. Please wait before trying again.'
  }
});

// Strict limiter for notification testing to prevent spam/abuse
const notificationTestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Limit per authenticated user. 'authenticate' middleware runs first, 
    // so req.user.username is guaranteed to exist.
    return req.user?.username || 'unknown';
  },
  message: {
    success: false,
    error: 'Too many test notifications requested. Please wait a minute before trying again.'
  }
});

const { exec } = require('child_process');
const path = require('path');

// ── Group Announcement Helper ─────────────────────────────────────────────────
const GROUP_CHATS_FILE = path.join(__dirname, '..', 'data', 'group_chats.json');
const LAST_SERVER_FILE = path.join(__dirname, '..', 'data', 'last_server.json');

/**
 * Returns add.aternos.org/<name> URL if host matches *.aternos.me, else null.
 */
function getAtErnosJoinUrl(host) {
  const match = String(host || '').match(/^([a-zA-Z0-9_-]+)\.aternos\.me$/i);
  return match ? `https://add.aternos.org/${match[1]}` : null;
}

/**
 * Reads group_chats.json and returns array of { chatId, title }.
 */
function getGroupChats() {
  try {
    if (!fs.existsSync(GROUP_CHATS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(GROUP_CHATS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

/**
 * Writes last_server.json so the bot process can answer group keyword queries.
 */
function saveLastServer(data) {
  try {
    const dir = path.dirname(LAST_SERVER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LAST_SERVER_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Routes] Failed to write last_server.json:', e);
  }
}

/**
 * Broadcasts server creation announcement to all registered Telegram groups.
 */
async function broadcastToGroups(botToken, projectId, ip, port, version, type, owner) {
  const groups = getGroupChats();
  if (!groups.length || !botToken) return;

  const esc = (t) => String(t ?? '').replace(/[-_*[\]()~`>#+=|{}.!\\]/g, '\\$&');
  const typeLabel  = type === 'java' ? '☕ Java' : '🟩 Bedrock';
  const atErnosUrl = type === 'bedrock' ? getAtErnosJoinUrl(ip) : null;

  const text =
    `🆕 *Yangi server qo'shildi\\!*\n\n` +
    `🌐 \`${esc(ip)}:${esc(String(port))}\`\n` +
    `🏷 Versiya: \`${esc(version)}\`  •  ${esc(typeLabel)}\n` +
    `📡 Status: 🔴 _Hali ishga tushirilmagan_\n` +
    `👥 O'yinchilar: _Hali yo'q_` +
    (atErnosUrl ? `\n\n🔗 Aternos: ${esc(atErnosUrl)}` : '');

  const inline_keyboard = [];

  // Aternos Bedrock join button
  if (atErnosUrl) {
    inline_keyboard.push([{
      text: '🎮 Bedrock — Serverga kirish (Aternos)',
      url: atErnosUrl
    }]);
  }

  for (const group of groups) {
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: group.chatId,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined
      })
    }).catch(err => {
      console.error(`[Routes] Failed to send group announcement to ${group.chatId}:`, err.message);
    });
  }
}

const {
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
  isAdmin
} = require('./api');

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  saveTestNotification
} = require('../notifications/notificationService');

// Enhanced authentication middleware
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    // FIXED: Reject with 401 instead of falling back to guest user
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // verifyToken is async: it performs a DB lookup to validate the tokenVersion
    // in addition to the cryptographic signature check.
    const decoded = await verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
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
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Allow trusted Telegram bot to overwrite password for tg_ users
    // (e.g. when tg_users.json is lost after moving to a new server)
    const botToken = req.headers['x-telegram-bot-token'];
    const isTrustedBot = botToken && botToken === process.env.TELEGRAM_BOT_TOKEN;
    const allowOverwrite = isTrustedBot && username.startsWith('tg_');

    const result = await createUser(username, password, allowOverwrite);
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
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const result = await authenticateUser(username, password);
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
router.post('/projects', authenticate, projectCreateLimiter, async (req, res) => {
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

    // Send Telegram notification if created successfully by a Telegram user (avoid duplicate if request originated from bot itself)
    const isFromBot = req.headers['x-telegram-bot-token'] && req.headers['x-telegram-bot-token'] === process.env.TELEGRAM_BOT_TOKEN;
    if (result.success && req.user.username.startsWith('tg_') && !isFromBot) {
      const chatId = req.user.username.replace('tg_', '');
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const esc = (t) => String(t ?? '').replace(/[-_*[\]()~`>#+=|{}.!\\]/g, '\\$&');
        const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
        const displayHost = result.host || ip;
        const displayPort = result.port || port;
        const text =
          `✅ *Server muvaffaqiyatli qo'shildi\\!* 🚀\n\n` +
          `🆔 ID: \`${esc(result.projectId)}\`\n` +
          `🌐 \`${esc(displayHost)}:${esc(String(displayPort))}\`\n` +
          `🏷 Versiya: \`${esc(version)}\`  •  ${esc(typeLabel)}\n\n` +
          `_Quyidagi tugmalar orqali serverni boshqaring:_`;

        const replyMarkup = {
          inline_keyboard: [
            [
              { text: '▶️  Ishga tushirish', callback_data: `srvstart_${result.projectId}` },
              { text: '🗑  O\'chirish', callback_data: `srvdel_${result.projectId}` }
            ],
            [
              { text: '📄  Loglar',   callback_data: `srvlogs_${result.projectId}`   },
              { text: '📋  Hodisalar', callback_data: `srvevents_${result.projectId}` }
            ],
            [
              { text: '👥  O\'yinchilar', callback_data: `srvplayers_${result.projectId}` },
              { text: '🔄  Yangilash',       callback_data: `srvinfo_${result.projectId}` }
            ],
            [
              { text: '🔙  Barcha serverlar', callback_data: 'list_servers'         }
            ]
          ]
        };

        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'MarkdownV2',
            reply_markup: replyMarkup
          })
        }).catch(err => {
          console.error('Failed to send Telegram creation notification:', err);
        });
      }
    }

    // ── Group broadcast + save last_server.json ──
    if (result.success) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const displayHost = result.host || ip;
      const displayPort = result.port || port;
      saveLastServer({
        projectId: result.projectId,
        host: displayHost,
        port: parseInt(displayPort),
        version,
        type,
        owner: req.user.username,
        createdAt: new Date().toISOString()
      });
      broadcastToGroups(botToken, result.projectId, displayHost, displayPort, version, type, req.user.username)
        .catch(err => console.error('[Routes] broadcastToGroups error:', err));
    }

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
    res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
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

router.put('/projects/:id', authenticate, async (req, res) => {
  try {
    const { ip, port, version } = req.body;
    if (!ip || !port || !version) {
      return res.status(400).json({
        success: false,
        error: 'Host, port, and version are required'
      });
    }

    const result = await updateServer(req.params.id, ip, port, version, req.user.username);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Update server route error:', error);
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

router.get('/projects/:id/players', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!/^project_\d+(_[a-z0-9]+)?$/.test(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project id' });
    }
    const Project = require('./models/Project');
    const project = await Project.findOne({ projectId });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    if (project.owner !== req.user.username && req.user.username !== (process.env.ADMIN_USERNAME || 'admin')) {
      return res.status(403).json({ success: false, error: 'Permission denied' });
    }

    const fs = require('fs');
    const path = require('path');
    const playersFile = path.join(__dirname, '..', 'data', 'players', `${projectId}.json`);

    if (!fs.existsSync(playersFile)) {
      return res.json({ success: true, count: 0, players: [] });
    }

    const data = JSON.parse(fs.readFileSync(playersFile, 'utf8'));
    return res.json({
      success: true,
      count: data.count || 0,
      players: data.players || []
    });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Fetch server logs (tail)
router.get('/projects/:id/logs', authenticate, async (req, res) => {
  try {
    const linesParam = parseLinesParam(req.query.lines);
    if (!linesParam.success) {
      return res.status(400).json({ success: false, error: linesParam.error });
    }
    const lines = linesParam.lines;
    const result = await getServerLogs(req.params.id, req.user.username, lines);
    if (!result.success) {
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
    const linesParam = parseLinesParam(req.query.lines);
    if (!linesParam.success) {
      return res.status(400).json({ success: false, error: linesParam.error });
    }
    const lines = linesParam.lines;
    console.log(`Get events request: project=${req.params.id}, user=${req.user && req.user.username}, lines=${lines}`);
    const result = await getServerEvents(req.params.id, req.user.username, lines);
    if (!result.success) {
      if (result.error === 'Permission denied') return res.status(403).json(result);
      if (result.error === 'Server not found' || result.error === 'Invalid project id') return res.status(404).json(result);
      return res.status(400).json(result);
    }
    res.json({ success: true, events: result.events });
  } catch (error) {
    console.error('Get events error:', error && error.stack ? error.stack : error);
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
  // If the token was invalid/expired, authenticate() falls back to 'guest'.
  // We must explicitly reject guest here so the bot knows to re-login.
  if (!req.user || req.user.username === 'guest') {
    return res.status(401).json({ success: false, error: 'Token invalid or expired' });
  }
  const userIsAdmin = isAdmin(req.user.username);
  res.json({
    success: true,
    user: req.user,
    isAdmin: userIsAdmin,
    message: 'Token is valid'
  });
});

// Events across all user's projects (tail of recent short events/errors)
router.get('/events', authenticate, async (req, res) => {
  try {
    const linesParam = parseLinesParam(req.query.lines);
    if (!linesParam.success) {
      return res.status(400).json({ success: false, error: linesParam.error });
    }
    const lines = linesParam.lines;
    console.log(`Get all events request: user=${req.user && req.user.username}, lines=${lines}`);
    const result = await getAllEvents(req.user.username, lines);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ success: true, events: result.events });
  } catch (error) {
    console.error('Get all events error:', error && error.stack ? error.stack : error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

// Get Minecraft version options
router.get('/versions', (req, res) => {
  try {
    const fs = require('fs');
    const javaPath = path.join(__dirname, '..', 'templates', 'java', 'version.json');
    const bedrockPath = path.join(__dirname, '..', 'templates', 'bedrock', 'version.json');

    let javaVersions = [];
    let bedrockVersions = [];

    if (fs.existsSync(javaPath)) {
      javaVersions = JSON.parse(fs.readFileSync(javaPath, 'utf8'));
    }
    if (fs.existsSync(bedrockPath)) {
      bedrockVersions = JSON.parse(fs.readFileSync(bedrockPath, 'utf8'));
    }

    res.json({
      success: true,
      java: javaVersions,
      bedrock: bedrockVersions
    });
  } catch (error) {
    console.error('Failed to read versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read versions list'
    });
  }
});

// ── Notification Routes ───────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Returns recent notifications for the authenticated user.
 * Query params:
 *   ?limit=50          max results (capped at 200)
 *   ?unreadOnly=true   only return unread ones
 */
router.get('/notifications', authenticate, async (req, res) => {
  if (!req.user || req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Login required' });
  }
  try {
    const limit      = parseInt(req.query.limit) || 50;
    const unreadOnly = req.query.unreadOnly === 'true';
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(req.user.username, { limit, unreadOnly }),
      getUnreadCount(req.user.username)
    ]);
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  if (!req.user || req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Login required' });
  }
  try {
    const ok = await markAsRead(req.params.id, req.user.username);
    if (!ok) return res.status(404).json({ success: false, error: 'Notification not found or already read' });
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /notifications/:id/read error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark ALL unread notifications for the user as read.
 */
router.patch('/notifications/read-all', authenticate, async (req, res) => {
  if (!req.user || req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Login required' });
  }
  try {
    const count = await markAllAsRead(req.user.username);
    res.json({ success: true, markedCount: count });
  } catch (err) {
    console.error('PATCH /notifications/read-all error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Dismiss (delete) a single notification.
 */
router.delete('/notifications/:id', authenticate, async (req, res) => {
  if (!req.user || req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Login required' });
  }
  try {
    const ok = await deleteNotification(req.params.id, req.user.username);
    if (!ok) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /notifications/:id error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
});

/**
 * POST /api/notifications/test
 * Sends a test notification for the authenticated user.
 * Useful during development to verify the pipeline end-to-end.
 */
router.post('/notifications/test', authenticate, notificationTestLimiter, async (req, res) => {
  if (!req.user || req.user.username === 'guest') {
    return res.status(403).json({ success: false, error: 'Login required' });
  }
  try {
    const projectId = req.body.projectId || 'test_project';
    await saveTestNotification(req.user.username, projectId);
    res.json({ success: true, message: 'Test notification created' });
  } catch (err) {
    console.error('POST /notifications/test error:', err);
    res.status(500).json({ success: false, error: 'Failed to create test notification' });
  }
});

router._test = { parseLinesParam };
module.exports = router;