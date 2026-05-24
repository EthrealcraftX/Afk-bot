const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
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

    // Allow trusted Telegram bot to overwrite password for tg_ users
    // (e.g. when tg_users.json is lost after moving to a new server)
    const botToken = req.headers['x-telegram-bot-token'];
    const isTrustedBot = botToken && botToken === process.env.TELEGRAM_BOT_TOKEN;
    const allowOverwrite = isTrustedBot && username.startsWith('tg_');

    const result = await createUser(username, password, allowOverwrite);
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

    // Send Telegram notification if created successfully by a Telegram user (avoid duplicate if request originated from bot itself)
    const isFromBot = req.headers['x-telegram-bot-token'] && req.headers['x-telegram-bot-token'] === process.env.TELEGRAM_BOT_TOKEN;
    if (result.success && req.user.username.startsWith('tg_') && !isFromBot) {
      const chatId = req.user.username.replace('tg_', '');
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const esc = (t) => String(t ?? '').replace(/[-_*[\]()~`>#+=|{}.!\\]/g, '\\$&');
        const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
        const text =
          `✅ *Server muvaffaqiyatli qo'shildi\\!* 🚀\n\n` +
          `🆔 ID: \`${esc(result.projectId)}\`\n` +
          `🌐 \`${esc(ip)}:${esc(String(port))}\`\n` +
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
              { text: '🔄  Yangilash',       callback_data: `srvinfo_${result.projectId}` },
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
    const lines = parseInt(req.query.lines) || 200;
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

module.exports = router;