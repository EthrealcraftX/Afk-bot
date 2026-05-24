/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         MC-AFK Bot Panel — Telegram Bot             ║
 * ║  Dark theme, green neon accents, inline buttons     ║
 * ║  + Admin Panel, Broadcast, Support System           ║
 * ╚══════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── TELEGRAM USER STORE (chatId → {username, password}) ────────────────────
const TG_USERS_FILE = path.join(__dirname, 'data', 'tg_users.json');

function getTgUser(chatId) {
  try {
    if (!fs.existsSync(TG_USERS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8'));
    return data[String(chatId)] || null;
  } catch (e) { return null; }
}

function saveTgUser(chatId, username, password) {
  try {
    const dir = path.dirname(TG_USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data = {};
    if (fs.existsSync(TG_USERS_FILE)) {
      data = JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8'));
    }
    data[String(chatId)] = { username, password };
    fs.writeFileSync(TG_USERS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save tg user credentials:', e);
  }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

if (!TOKEN) {
  console.error('❌  TELEGRAM_BOT_TOKEN is not set in .env!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖  MC-AFK Telegram Bot started...');

// ─── PERSISTENT MINECRAFT VERSIONS STORE ─────────────────────────────────────
const JAVA_VERSIONS_FILE = path.join(__dirname, 'templates', 'java', 'version.json');
const BEDROCK_VERSIONS_FILE = path.join(__dirname, 'templates', 'bedrock', 'version.json');

function loadVersions(type) {
  const file = type === 'java' ? JAVA_VERSIONS_FILE : BEDROCK_VERSIONS_FILE;
  const defaultVersions = type === 'java'
    ? ["1.21.4", "1.21.1", "1.21", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9"]
    : ["1.21.2", "1.21.0", "1.20.80", "1.20.70", "1.20.60"];
  try {
    if (!fs.existsSync(file)) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(defaultVersions, null, 2));
      return defaultVersions;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Failed to load ${type} versions:`, e);
    return defaultVersions;
  }
}

function saveVersions(type, versions) {
  const file = type === 'java' ? JAVA_VERSIONS_FILE : BEDROCK_VERSIONS_FILE;
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(versions, null, 2));
    return true;
  } catch (e) {
    console.error(`Failed to save ${type} versions:`, e);
    return false;
  }
}

function kbVersions(type) {
  const versions = loadVersions(type);
  const rows = [];
  // Chunk versions into rows of 2 buttons
  for (let i = 0; i < versions.length; i += 2) {
    const row = [];
    row.push({ text: `🏷 ${versions[i]}`, callback_data: `setversion_${versions[i]}` });
    if (i + 1 < versions.length) {
      row.push({ text: `🏷 ${versions[i+1]}`, callback_data: `setversion_${versions[i+1]}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '❌  Bekor qilish', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

// Ensure files are initialized on startup
loadVersions('java');
loadVersions('bedrock');

// ─── SESSION STORE ──────────────────────────────────────────────────────────
// chatId → { token, username, state, draft, lastMsgId }
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      token:     null,
      username:  null,
      state:     null,
      draft:     {},
      lastMsgId: null
    });
  }
  return sessions.get(chatId);
}

// ─── USER TRACKING & SUPPORT SYSTEM ─────────────────────────────────────────
const knownChatIds     = new Map();   // chatId → username
const usernameToChatId = new Map();   // username → chatId  (reverse)
const supportTickets   = [];
let ticketCounter      = 0;

function isAdminUser(sess) {
  return sess.username === ADMIN_USERNAME;
}

function trackUser(chatId, username) {
  if (username && username !== 'guest') {
    knownChatIds.set(chatId, username);
    usernameToChatId.set(username, chatId);
  }
}

function getOpenTicketCount() {
  return supportTickets.filter(t => !t.closed).length;
}

// ─── API HELPER ─────────────────────────────────────────────────────────────
async function api(method, endpoint, body, token) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Include bot token so the backend can authorize tg_ password overwrites
    if (process.env.TELEGRAM_BOT_TOKEN) {
      headers['x-telegram-bot-token'] = process.env.TELEGRAM_BOT_TOKEN;
    }

    const res = await fetch(`${API_URL}/api${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { success: false, error: text }; }
  } catch (err) {
    return { success: false, error: `Connection error: ${err.message}` };
  }
}

// ─── TEXT FORMATTERS ─────────────────────────────────────────────────────────
const esc = (t) => String(t ?? '').replace(/[-_*[\]()~`>#+=|{}.!\\]/g, '\\$&');

function fmtStatus(status) {
  return status === 'running' ? '🟢 Ishlayapti' : '🔴 To\'xtatilgan';
}

function fmtType(type) {
  return type === 'java' ? '☕ Java' : '🟩 Bedrock';
}

function fmtShortId(id) {
  const parts = String(id).split('_');
  return parts.slice(-1)[0] ?? id;
}

function fmtUptime(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

// ─── AUTO AUTH ───────────────────────────────────────────────────────────────

/**
 * Ensures the user is authenticated. On first call registers via /auth/signup,
 * then logs in via /auth/login. On subsequent calls re-uses stored creds.
 * Returns true if authenticated, false on failure.
 * @param {number} chatId
 * @param {object} sess
 * @param {boolean} [sendCreds=false] force send creds message
 */
async function ensureTelegramAuth(chatId, sess) {
  // 1. If we already have a token, verify it's still valid
  if (sess.token) {
    const verify = await api('GET', '/auth/verify', null, sess.token);
    if (verify.success) return true; // token still valid
    // token expired — fall through to re-login
    sess.token    = null;
    sess.username = null;
  }

  // 2. Try to get stored credentials
  let stored = getTgUser(chatId);

  // 2a. If no local credentials but this is the admin chatId, try admin password from .env
  if (!stored) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const expectedAdminUsername = `tg_${chatId}`;
    if (adminUsername === expectedAdminUsername && adminPassword) {
      console.log(`[TG-AUTH] Admin chatId detected (${chatId}). Trying admin credentials from .env...`);
      const loginResult = await api('POST', '/auth/login', {
        username: adminUsername,
        password: adminPassword
      });
      if (loginResult.success) {
        console.log(`[TG-AUTH] Admin login success for chatId ${chatId}. Saving to tg_users.json.`);
        saveTgUser(chatId, adminUsername, adminPassword);
        sess.token    = loginResult.token;
        sess.username = loginResult.username;
        trackUser(chatId, sess.username);
        return true;
      }
      console.warn(`[TG-AUTH] Admin login with .env password failed for chatId ${chatId}. Falling through to signup/overwrite.`);
    }
  }

  if (!stored) {
    // ── NEW USER: auto-register (or overwrite if moving to new server) ────────
    const username = `tg_${chatId}`;
    const password = crypto.randomBytes(8).toString('hex'); // 16 hex chars

    // Backend will overwrite password if user already exists and token matches
    const signupResult = await api('POST', '/auth/signup', { username, password });
    if (!signupResult.success) {
      console.error(`[TG-AUTH] Signup failed for chatId ${chatId}:`, signupResult.error);
      return false;
    }

    saveTgUser(chatId, username, password);
    stored = { username, password };

    // Login to get token
    const loginResult = await api('POST', '/auth/login', { username, password });
    if (!loginResult.success) {
      console.error(`[TG-AUTH] Login after signup failed:`, loginResult.error);
      return false;
    }

    sess.token    = loginResult.token;
    sess.username = loginResult.username;
    trackUser(chatId, sess.username);

    // Send credentials ONCE (only for non-admin users)
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    if (username !== adminUsername) {
      await bot.sendMessage(chatId,
        `🎉 *Tabriklaymiz, muvaffaqiyatli ro'yxatdan o'tdingiz\\!* 🚀\n\n` +
        `Web\\-panelga \\(afk\\.hypepath\\.uz\\) kirish uchun shaxsiy hisobingiz ma'lumotlari:\n\n` +
        `🔐 *Hisob ma'lumotlari:*\n` +
        `┌──────────────────────────────\n` +
        `│ 👤 Login: \`${esc(username)}\` \\(nusxalash uchun bosing\\)\n` +
        `│ 🔑 Parol: \`${esc(password)}\` \\(nusxalash uchun bosing\\)\n` +
        `└──────────────────────────────\n\n` +
        `⚠️ *Muhim:* Ushbu ma'lumotlarni hech kimga bermang\\. Ulardan istalgan brauzer orqali panelga kirishda foydalanishingiz mumkin\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    return true;
  }

  // ── EXISTING USER: auto-login ────────────────────────────────────────────
  const loginResult = await api('POST', '/auth/login', {
    username: stored.username,
    password: stored.password
  });

  if (!loginResult.success) {
    console.error(`[TG-AUTH] Auto-login failed for ${stored.username}:`, loginResult.error);
    return false;
  }

  sess.token    = loginResult.token;
  sess.username = loginResult.username;
  trackUser(chatId, sess.username);
  return true;
}

// ─── KEYBOARDS ───────────────────────────────────────────────────────────────

function kbMain(loggedIn, isAdmin = false) {
  const rows = [
    [
      { text: '📋  Serverlarim',      callback_data: 'list_servers'  },
      { text: '➕  Server qo\'shish', callback_data: 'create_server' }
    ],
    [
      { text: '📊  Statistika',      callback_data: 'stats'      },
      { text: '🔔  So\'nggi hodisalar', callback_data: 'all_events' }
    ],
    [
      { text: '💬  Yordam so\'rash', callback_data: 'support_new' },
      { text: '❓  Ma\'lumot',       callback_data: 'help'        }
    ]
  ];

  if (isAdmin) {
    const openCount = getOpenTicketCount();
    const badge = openCount > 0 ? ` (${openCount})` : '';
    rows.push([
      { text: `🛡  Admin Panel${badge}`, callback_data: 'admin_panel' }
    ]);
  }

  return { inline_keyboard: rows };
}

function kbServer(projectId, status) {
  const running = status === 'running';
  return {
    inline_keyboard: [
      [
        running
          ? { text: '⏹  To\'xtatish', callback_data: `srvstop_${projectId}` }
          : { text: '▶️  Ishga tushirish', callback_data: `srvstart_${projectId}` },
        { text: '🗑  O\'chirish', callback_data: `srvdel_${projectId}` }
      ],
      [
        { text: '📄  Loglar',   callback_data: `srvlogs_${projectId}`   },
        { text: '📋  Hodisalar', callback_data: `srvevents_${projectId}` }
      ],
      [
        { text: '🔄  Yangilash',       callback_data: `srvinfo_${projectId}` },
        { text: '🔙  Barcha serverlar', callback_data: 'list_servers'         }
      ]
    ]
  };
}

function kbBack(target = 'menu') {
  const map = {
    menu:    { text: '🏠  Asosiy menyu',       callback_data: 'menu'         },
    servers: { text: '🔙  Barcha serverlar',   callback_data: 'list_servers' },
    admin:   { text: '🔙  Admin paneli',       callback_data: 'admin_panel'  }
  };
  return { inline_keyboard: [[ map[target] ?? map.menu ]] };
}

function kbCancel() {
  return { inline_keyboard: [[ { text: '❌  Bekor qilish', callback_data: 'menu' } ]] };
}

function kbCancelAdmin() {
  return { inline_keyboard: [[ { text: '❌  Bekor qilish', callback_data: 'admin_panel' } ]] };
}

function kbServerType() {
  return {
    inline_keyboard: [
      [
        { text: '☕  Java Edition',    callback_data: 'settype_java'    },
        { text: '🟩  Bedrock Edition', callback_data: 'settype_bedrock' }
      ],
      [{ text: '❌  Bekor qilish', callback_data: 'menu' }]
    ]
  };
}

function kbConfirmDelete(projectId) {
  return {
    inline_keyboard: [
      [
        { text: '✅  Ha, o\'chirish',   callback_data: `confirmdel_${projectId}` },
        { text: '❌  Yo\'q, bekor',     callback_data: `srvinfo_${projectId}`    }
      ]
    ]
  };
}

// ── Admin Keyboards ──

function kbAdminPanel() {
  const openCount = getOpenTicketCount();
  const badge = openCount > 0 ? ` (${openCount})` : '';
  return {
    inline_keyboard: [
      [
        { text: '🖥  Barcha serverlar', callback_data: 'admin_servers' },
        { text: '👥  Foydalanuvchilar', callback_data: 'admin_users'   }
      ],
      [
        { text: `💬  Ticketlar${badge}`, callback_data: 'admin_support'   },
        { text: '📢  Xabar yuborish',    callback_data: 'admin_broadcast' }
      ],
      [
        { text: '🏷  Versiyalarni boshqarish', callback_data: 'admin_versions' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };
}

function kbAdminBack() {
  return { inline_keyboard: [[ { text: '🔙  Admin paneli', callback_data: 'admin_panel' } ]] };
}

function kbBroadcastConfirm() {
  return {
    inline_keyboard: [
      [
        { text: '✅  Hammaga yuborish', callback_data: 'bcast_confirm' },
        { text: '❌  Bekor qilish',     callback_data: 'admin_panel'   }
      ]
    ]
  };
}

// ─── SEND / EDIT HELPERS ─────────────────────────────────────────────────────

async function sendMenu(chatId, sess) {
  trackUser(chatId, sess.username);
  const admin = isAdminUser(sess);

  const header =
    `🎮 *MC\\-AFK Bot Panel* — Minecraft botlarini 24\\/7 rejimida boshqarish tizimi\\!\n\n` +
    `Xush kelibsiz, *${esc(sess.username)}*\\! ⚡` + (admin ? ' 🛡' : '') + `\n` +
    `Ushbu bot yordamida Minecraft AFK botlaringizni to'liq nazorat qilishingiz, ularni ishga tushirishingiz, to'xtatishingiz va holatlarini kuzatib borishingiz mumkin\\.\n\n` +
    `🔥 *Asosiy imkoniyatlar:*\n` +
    `├ 🟢 24\\/7 Minecraft serverlarida AFK turish\n` +
    `├ 📱 Qulay Telegram Mini App \\(Web App\\) interfeysi\n` +
    `├ 📄 Haqiqiy vaqtdagi loglar va hodisalar\n` +
    `└ 🛡 Java & Bedrock versiyalari to'liq qo'llab\\-quvvatlanadi\\.\n\n` +
    `👇 Quyidagi menyudan kerakli amalni tanlang:`;

  const msg = await bot.sendMessage(chatId, header, {
    parse_mode: 'MarkdownV2',
    reply_markup: kbMain(true, admin)
  });
  sess.lastMsgId = msg.message_id;
  return msg;
}

async function editOrSend(chatId, msgId, text, keyboard) {
  try {
    if (msgId) {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });
      return msgId;
    }
  } catch (_) { /* fall through to send */ }
  const m = await bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboard
  });
  return m.message_id;
}

// ─── SERVER CARD ─────────────────────────────────────────────────────────────

function buildServerCard(id, s, uptime) {
  return (
    `┌─────────────────────────────\n` +
    `│ ${fmtType(s.type)}  •  ${fmtStatus(s.status)}\n` +
    `├─────────────────────────────\n` +
    `│ 🆔  \`${esc(id)}\`\n` +
    `│ 🌐  \`${esc(s.host)}:${esc(s.port)}\`\n` +
    `│ 🏷  Version: \`${esc(s.version)}\`\n` +
    (s.owner ? `│ 👤  Owner: \`${esc(s.owner)}\`\n` : '') +
    (uptime  ? `│ ⏱  Uptime: \`${esc(fmtUptime(uptime))}\`\n` : '') +
    `└─────────────────────────────`
  );
}

// ─── COMMAND HANDLERS ────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const sess   = getSession(chatId);
  sess.state   = null;
  sess.draft   = {};

  const ok = await ensureTelegramAuth(chatId, sess);
  if (!ok) {
    await bot.sendMessage(chatId,
      `❌ *Serverga ulanib bo'lmadi\\.*\n\n_Iltimos keyinroq /start yuboring\\._`,
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }
  await sendMenu(chatId, sess);
});

bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const sess   = getSession(chatId);
  sess.state   = null;
  sess.draft   = {};

  const ok = await ensureTelegramAuth(chatId, sess);
  if (!ok) {
    await bot.sendMessage(chatId,
      `❌ *Serverga ulanib bo'lmadi\\.*\n\n_Iltimos keyinroq /start yuboring\\._`,
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }
  await sendMenu(chatId, sess);
});

bot.onText(/\/help/, (msg) => handleHelp(msg.chat.id, getSession(msg.chat.id)));

// ─── CALLBACK QUERY ROUTER ───────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;
  const sess   = getSession(chatId);

  sess.lastMsgId = msgId;
  await bot.answerCallbackQuery(query.id).catch(() => {});

  // ── Basic ──
  if (data === 'menu')           return handleMenu(chatId, sess, msgId);
  if (data === 'help')           return handleHelp(chatId, sess, msgId);
  if (data === 'list_servers')   return handleListServers(chatId, sess, msgId);
  if (data === 'create_server')  return startCreate(chatId, sess);
  if (data === 'create_wizard')   return startCreateWizard(chatId, sess);
  if (data === 'stats')          return handleStats(chatId, sess, msgId);
  if (data === 'all_events')     return handleAllEvents(chatId, sess, msgId);

  // ── Server ──
  if (data.startsWith('srvinfo_'))    return handleServerInfo(chatId, sess, msgId, data.slice(8));
  if (data.startsWith('srvstart_'))   return handleServerAction(chatId, sess, msgId, data.slice(9),  'start');
  if (data.startsWith('srvstop_'))    return handleServerAction(chatId, sess, msgId, data.slice(8),  'stop');
  if (data.startsWith('srvdel_'))     return handleDeleteConfirm(chatId, sess, msgId, data.slice(7));
  if (data.startsWith('confirmdel_')) return handleDeleteExecute(chatId, sess, msgId, data.slice(11));
  if (data.startsWith('srvlogs_'))    return handleServerLogs(chatId, sess, msgId, data.slice(8));
  if (data.startsWith('srvevents_'))  return handleServerEvents(chatId, sess, msgId, data.slice(10));
  if (data.startsWith('settype_'))    return handleSetType(chatId, sess, data.slice(8));
  if (data.startsWith('setversion_')) return handleSetVersion(chatId, sess, msgId, data.slice(11));

  // ── Admin ──
  if (data === 'admin_panel')      return handleAdminPanel(chatId, sess, msgId);
  if (data === 'admin_servers')    return handleAdminServers(chatId, sess, msgId);
  if (data === 'admin_broadcast')  return startBroadcast(chatId, sess);
  if (data === 'admin_support')    return handleSupportList(chatId, sess, msgId);
  if (data === 'admin_users')      return handleAdminUsers(chatId, sess, msgId);
  if (data === 'bcast_confirm')    return executeBroadcast(chatId, sess, msgId);

  // ── Admin Version Management ──
  if (data === 'admin_versions')          return handleAdminVersions(chatId, sess, msgId);
  if (data.startsWith('admvers_list_'))   return handleAdminVersionList(chatId, sess, msgId, data.slice(13));
  if (data.startsWith('admvers_add_'))    return startAddVersion(chatId, sess, data.slice(12));
  if (data.startsWith('admvers_del_'))    return startDelVersion(chatId, sess, data.slice(12));
  if (data.startsWith('admvers_do_del_')) return executeDelVersion(chatId, sess, msgId, data.slice(15));

  // ── Support ──
  if (data === 'support_new')       return startSupportMessage(chatId, sess);
  if (data.startsWith('ticket_'))   return handleTicketView(chatId, sess, msgId, parseInt(data.slice(7)));
  if (data.startsWith('treply_'))   return startTicketReply(chatId, sess, parseInt(data.slice(7)));
  if (data.startsWith('tclose_'))   return handleTicketClose(chatId, sess, msgId, parseInt(data.slice(7)));
});

// ─── TEXT MESSAGE HANDLER (wizard steps) ────────────────────────────────────

bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return;

  const chatId = msg.chat.id;
  const sess   = getSession(chatId);

  // ── Web App Data (Mini App server creation callback) ──────────────────────
  if (msg.web_app_data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      if (data.action === 'server_created') {
        const { projectId, ip, port, version, type } = data;
        const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
        const text =
          `✅ *Server muvaffaqiyatli qo'shildi\\!*\n\n` +
          `🆔 ID: \`${esc(projectId)}\`\n` +
          `🌐 \`${esc(ip)}:${esc(String(port))}\`\n` +
          `🏷 Versiya: \`${esc(version)}\`  •  ${esc(typeLabel)}\n\n` +
          `_Quyidagi tugmalar orqali serverni boshqaring:_`;
        await bot.sendMessage(chatId, text, {
          parse_mode: 'MarkdownV2',
          reply_markup: kbServer(projectId, 'stopped')
        });
        return;
      }
    } catch (e) {
      console.error('[WebApp] Failed to parse web_app_data:', e);
    }
    return;
  }

  const text   = (msg.text ?? '').trim();

  if (!sess.state || !text) return;

  const state = sess.state;

  // ── Auth ──
  if (state === 'login_username')  return wizardLoginUser(chatId, sess, text);
  if (state === 'login_password')  return wizardLoginPass(chatId, sess, text);
  if (state === 'reg_username')    return wizardRegUser(chatId, sess, text);
  if (state === 'reg_password')    return wizardRegPass(chatId, sess, text);

  // ── Create server ──
  if (state === 'create_ip')       return wizardCreateIp(chatId, sess, text);
  if (state === 'create_port')     return wizardCreatePort(chatId, sess, text);
  if (state === 'create_version')  return wizardCreateVersion(chatId, sess, text);

  // ── Support ──
  if (state === 'support_msg')     return wizardSupportMsg(chatId, sess, text);

  // ── Admin ──
  if (state === 'broadcast_text')  return wizardBroadcastText(chatId, sess, text);
  if (state === 'ticket_reply')    return wizardTicketReply(chatId, sess, text);
  if (state.startsWith('admvers_add_input_')) return handleAddVersionInput(chatId, sess, text, state.slice(18));
});

// ═══════════════════════════════════════════════════════════════════════════
//  BASIC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleMenu(chatId, sess, msgId) {
  sess.state = null;
  sess.draft = {};

  // Auto-auth if session is missing/expired
  const ok = await ensureTelegramAuth(chatId, sess);
  if (!ok) {
    sess.lastMsgId = await editOrSend(chatId, msgId,
      `❌ *Serverga ulanib bo'lmadi\\.*\n\n_Iltimos /start yuboring\\._`,
      { inline_keyboard: [] }
    );
    return;
  }

  trackUser(chatId, sess.username);
  const admin = isAdminUser(sess);

  const text =
    `🎮 *MC\\-AFK Bot Panel* — Minecraft botlarini 24\\/7 rejimida boshqarish tizimi\\!\n\n` +
    `Xush kelibsiz, *${esc(sess.username)}*\\! ⚡` + (admin ? ' 🛡' : '') + `\n` +
    `Ushbu bot yordamida Minecraft AFK botlaringizni to'liq nazorat qilishingiz, ularni ishga tushirishingiz, to'xtatishingiz va holatlarini kuzatib borishingiz mumkin\\.\n\n` +
    `🔥 *Asosiy imkoniyatlar:*\n` +
    `├ 🟢 24\\/7 Minecraft serverlarida AFK turish\n` +
    `├ 📱 Qulay Telegram Mini App \\(Web App\\) interfeysi\n` +
    `├ 📄 Haqiqiy vaqtdagi loglar va hodisalar\n` +
    `└ 🛡 Java & Bedrock versiyalari to'liq qo'llab\\-quvvatlanadi\\.\n\n` +
    `👇 Quyidagi menyudan kerakli amalni tanlang:`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbMain(true, admin));
}

async function handleHelp(chatId, sess, msgId) {
  const text =
    `📖 *MC\\-AFK Bot Panel — Yordam*\n\n` +
    `*Buyruqlar:*\n` +
    `• /start — Asosiy menyuni ochish\n` +
    `• /menu  — Asosiy menyuni ochish\n` +
    `• /help  — Ushbu yordamni ko'rish\n\n` +
    `*Imkoniyatlar:*\n` +
    `🤖 Botga start bosing — avtomatik ro'yxatdan o'tiladi\n` +
    `📋 Barcha Minecraft AFK bot serverlaringizni ko'rish\n` +
    `➕ Yangi server bot yaratish \\(maksimal ${esc(process.env.MAX_PROJECTS_PER_USER || 3)} ta\\)\n` +
    `▶️ Ishga tushirish  ⏹ To'xtatish — bir bosish bilan\n` +
    `📄 Bot jarayonidan loglarni ko'rish\n` +
    `📋 Hayot sikli hodisalarini ko'rish\n` +
    `💬 Admin bilan bog'lanish\n` +
    `🔔 Barcha serverlaringizdagi so'nggi hodisalar\n\n` +
    `_MC\\-AFK Panel API tomonidan quvvatlanadi_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbBack('menu'));
}

async function handleLogout(chatId, sess, msgId) {
  sess.token    = null;
  sess.username = null;
  sess.state    = null;
  sess.draft    = {};
  const text = `✅ *Logged out successfully\\.*\n\n_See you next time\\!_`;
  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbMain(false));
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH WIZARDS
// ═══════════════════════════════════════════════════════════════════════════

async function startLogin(chatId, sess) {
  sess.state = 'login_username';
  sess.draft = {};
  const m = await bot.sendMessage(chatId,
    `🔑 *Login to MC\\-AFK Panel*\n\nStep 1 of 2 — Enter your *username*:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardLoginUser(chatId, sess, text) {
  sess.draft.username = text;
  sess.state = 'login_password';
  await bot.sendMessage(chatId,
    `Step 2 of 2 — Enter your *password*:\n\n_\\(Your message will be deleted for security\\)_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
}

async function wizardLoginPass(chatId, sess, text) {
  sess.state = null;

  // Try to delete the password message
  try { await bot.deleteMessage(chatId, sess.lastMsgId); } catch (_) {}

  const result = await api('POST', '/auth/login', {
    username: sess.draft.username,
    password: text
  });

  if (result.success) {
    sess.token    = result.token;
    sess.username = result.username;
    trackUser(chatId, sess.username);
    const admin = isAdminUser(sess);
    const msg =
      `✅ *Login successful\\!*\n\n` +
      `👤 Welcome back, *${esc(sess.username)}*` + (admin ? ' 🛡' : '') + `\\!\n\n` +
      (admin ? `_You have admin privileges\\._\n\n` : '') +
      `_Use the menu below to manage your servers\\._`;
    sess.lastMsgId = await editOrSend(chatId, null, msg, kbMain(true, admin));
  } else {
    const msg =
      `❌ *Login failed*\n\n\`${esc(result.error || 'Invalid credentials')}\`\n\n_Please try again\\._`;
    sess.lastMsgId = await editOrSend(chatId, null, msg, kbMain(false));
  }
}

async function startRegister(chatId, sess) {
  sess.state = 'reg_username';
  sess.draft = {};
  const m = await bot.sendMessage(chatId,
    `📝 *Register a new account*\n\nStep 1 of 2 — Choose a *username*:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardRegUser(chatId, sess, text) {
  sess.draft.username = text;
  sess.state = 'reg_password';
  await bot.sendMessage(chatId,
    `Step 2 of 2 — Choose a *password*:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
}

async function wizardRegPass(chatId, sess, text) {
  sess.state = null;

  const result = await api('POST', '/auth/signup', {
    username: sess.draft.username,
    password: text
  });

  if (result.success) {
    // Auto-login
    const loginResult = await api('POST', '/auth/login', {
      username: sess.draft.username,
      password: text
    });
    if (loginResult.success) {
      sess.token    = loginResult.token;
      sess.username = loginResult.username;
      trackUser(chatId, sess.username);
    }
    const msg =
      `✅ *Account created\\!*\n\n` +
      `👤 You are now logged in as *${esc(sess.draft.username)}*\\.\n\n` +
      `_Start by creating your first Minecraft AFK bot server\\!_`;
    sess.lastMsgId = await editOrSend(chatId, null, msg, kbMain(true, isAdminUser(sess)));
  } else {
    const msg =
      `❌ *Registration failed*\n\n\`${esc(result.error || 'Unknown error')}\`\n\n_Please try again\\._`;
    sess.lastMsgId = await editOrSend(chatId, null, msg, kbMain(false));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function handleListServers(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', '/projects', null, sess.token);

  if (!result.success) {
    const text = `❌ *Serverlarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kbBack('menu'));
  }

  const projects = result.projects || {};
  const ids      = Object.keys(projects);

  if (ids.length === 0) {
    const text =
      `📋 *Serverlarim*\n\n` +
      `_Hozircha serveringiz yo'q\\._\n\n` +
      `➕ *Server qo'shish* tugmasini bosib birinchi AFK botingizni yarating\\.`;
    return editOrSend(chatId, msgId, text, {
      inline_keyboard: [
        [{ text: '➕  Server qo\'shish', callback_data: 'create_server' }],
        [{ text: '🏠  Asosiy menyu',     callback_data: 'menu'          }]
      ]
    });
  }

  let running = 0, stopped = 0;
  ids.forEach(id => projects[id].status === 'running' ? running++ : stopped++);

  let text =
    `📋 *Serverlarim* — ${esc(ids.length)} ta\n` +
    `🟢 ${esc(running)} ishlayapti  •  🔴 ${esc(stopped)} to'xtatilgan\n\n` +
    `_Boshqarish uchun serverga bosing:_\n`;

  const rows = ids.map(id => {
    const s = projects[id];
    const statusIcon = s.status === 'running' ? '🟢' : '🔴';
    const typeIcon   = s.type   === 'java'    ? '☕'  : '🟩';
    const shortId    = fmtShortId(id);
    return [{
      text: `${statusIcon} ${typeIcon} ${s.host}:${s.port} [${shortId}]`,
      callback_data: `srvinfo_${id}`
    }];
  });

  rows.push([
    { text: '➕  Server qo\'shish', callback_data: 'create_server' },
    { text: '🏠  Asosiy menyu',      callback_data: 'menu'          }
  ]);

  sess.lastMsgId = await editOrSend(chatId, msgId, text, { inline_keyboard: rows });
}

async function handleServerInfo(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', `/projects/${projectId}/status`, null, sess.token);

  if (!result.success) {
    const text = `❌ *Server topilmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kbBack('servers'));
  }

  const d = result.details;
  const text =
    `🖥 *Server ma'lumotlari*\n\n` +
    buildServerCard(projectId, d, d.uptime) + `\n\n` +
    `_Quyidan amalni tanlang:_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbServer(projectId, d.status));
}

async function handleServerAction(chatId, sess, msgId, projectId, action) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const actionLabel = action === 'start' ? 'Ishga tushirilmoqda' : 'To\'xtatilmoqda';
  await editOrSend(chatId, msgId,
    `⏳ *${esc(actionLabel)}\\.\\.\\.*\n\n\`${esc(projectId)}\``,
    { inline_keyboard: [] }
  );

  const result = await api('POST', `/projects/${projectId}/${action}`, null, sess.token);

  if (result.success) {
    return handleServerInfo(chatId, sess, msgId, projectId);
  } else {
    const text =
      `❌ *Server ${esc(action === 'start' ? 'ishga tushmadi' : 'to\'xtamadi')}*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbServer(projectId, action === 'start' ? 'stopped' : 'running'));
  }
}

async function handleDeleteConfirm(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const text =
    `⚠️ *O'chirishni tasdiqlang*\n\n` +
    `Ushbu serverni *butunlay o'chirmoqchimisiz*?\n\n` +
    `\`${esc(projectId)}\`\n\n` +
    `_Bu amalni ortga qaytarib bo'lmaydi\\!_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbConfirmDelete(projectId));
}

async function handleDeleteExecute(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `🗑 *Server o'chirilmoqda\\.\\.\\.*\n\n\`${esc(projectId)}\``,
    { inline_keyboard: [] }
  );

  const result = await api('DELETE', `/projects/${projectId}`, null, sess.token);

  if (result.success) {
    const text =
      `✅ *Server muvaffaqiyatli o'chirildi\\.*\n\n` +
      `\`${esc(projectId)}\`\n\n` +
      `_U hisobingizdan olib tashlandi\\._`;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbBack('servers'));
  } else {
    const text =
      `❌ *Serverni o'chirib bo'lmadi*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbBack('servers'));
  }
}

// ─── SERVER LOGS ─────────────────────────────────────────────────────────────

async function handleServerLogs(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `📄 *Loglar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', `/projects/${projectId}/logs?lines=30`, null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Loglarni yangilash', callback_data: `srvlogs_${projectId}`   },
        { text: '📋  Hodisalar',           callback_data: `srvevents_${projectId}` }
      ],
      [{ text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Loglarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawLog = (result.log || '').trim();
  if (!rawLog) {
    const text = `📄 *Loglar*\n\nID: \`${esc(projectId)}\`\n\n_Hozircha log yo'q — server ishlamayotgan bo'lishi mumkin\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const lines = rawLog.split('\n').slice(-20).map(l => {
    const clean = l.replace(/\[.*?\]\s*/g, '').trim().slice(0, 120);
    return esc(clean);
  }).filter(Boolean);

  const text =
    `📄 *Loglar* — so'nggi ${esc(lines.length)} ta qator\n` +
    `\`${esc(projectId)}\`\n\n` +
    `\`\`\`\n${lines.join('\n')}\n\`\`\``;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

// ─── SERVER EVENTS ───────────────────────────────────────────────────────────

async function handleServerEvents(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `📋 *Hodisalar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', `/projects/${projectId}/events?lines=30`, null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Hodisalarni yangilash', callback_data: `srvevents_${projectId}` },
        { text: '📄  Loglar',                callback_data: `srvlogs_${projectId}`   }
      ],
      [{ text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Hodisalarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawEvents = (result.events || '').trim();
  if (!rawEvents) {
    const text = `📋 *Hayot sikli hodisalari*\n\nID: \`${esc(projectId)}\`\n\n_Hozircha hodisa yo'q\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const isLifecycle = (line) => {
    const l = line.toLowerCase();
    return /\b(created|started|joined|stopped|exited|restarted|reconnect)\b/.test(l);
  };

  const lines = rawEvents.split('\n')
    .filter(Boolean)
    .filter(isLifecycle)
    .slice(-15)
    .map(l => {
      const clean = l.replace(/^\[.*?\]\s*\[.*?\]\s*/, '').trim().slice(0, 120);
      const icon  = /start|join/i.test(clean) ? '🟢' :
                    /stop|exit/i.test(clean)  ? '🔴' :
                    /restart|reconnect/i.test(clean) ? '🔄' : '📌';
      return `${icon} ${esc(clean)}`;
    });

  if (!lines.length) {
    const text = `📋 *Hayot sikli hodisalari*\n\nID: \`${esc(projectId)}\`\n\n_Hozircha hayot sikli hodisalari yo'q\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const text =
    `📋 *Hayot sikli hodisalari*\n` +
    `\`${esc(projectId)}\`\n\n` +
    lines.join('\n');

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

// ─── ALL EVENTS ──────────────────────────────────────────────────────────────

async function handleAllEvents(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `🔔 *Barcha hodisalar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', '/events?lines=40', null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Yangilash',     callback_data: 'all_events'   },
        { text: '📋  Serverlarim',   callback_data: 'list_servers' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Hodisalarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawEvents = (result.events || '').trim();
  if (!rawEvents) {
    const text = `🔔 *So'nggi hodisalar*\n\n_Serverlaringizdagi hodisalar hozircha yo'q\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const lines = rawEvents.split('\n')
    .filter(Boolean)
    .slice(-20)
    .map(l => {
      const clean = l.trim().slice(0, 120);
      const icon  = /start|join/i.test(clean)       ? '🟢' :
                    /stop|exit/i.test(clean)          ? '🔴' :
                    /restart|reconnect/i.test(clean)  ? '🔄' :
                    /creat|add/i.test(clean)          ? '✨' : '📌';
      return `${icon} ${esc(clean)}`;
    });

  const text =
    `🔔 *So'nggi hodisalar — Barcha serverlar*\n\n` +
    lines.join('\n');

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

// ─── STATS ───────────────────────────────────────────────────────────────────

async function handleStats(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', '/projects', null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Yangilash',   callback_data: 'stats'        },
        { text: '📋  Serverlarim', callback_data: 'list_servers' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Statistikani yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const projects = result.projects || {};
  const ids      = Object.keys(projects);
  const total    = ids.length;
  const maxProj  = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3;
  let running = 0, stopped = 0, java = 0, bedrock = 0;

  ids.forEach(id => {
    const s = projects[id];
    if (s.status === 'running') running++; else stopped++;
    if (s.type   === 'java')    java++;    else bedrock++;
  });

  const bar = (n, max, char = '█') => {
    const filled = Math.round((n / max) * 10) || 0;
    return char.repeat(filled) + '░'.repeat(10 - filled);
  };

  const text =
    `📊 *Statistika*\n` +
    `👤 *${esc(sess.username)}*\n\n` +
    `┌─────────────────────────────\n` +
    `│ 🖥  Jami serverlar:   *${esc(total)}* \\/ ${esc(maxProj)}\n` +
    `│     \`${esc(bar(total, maxProj))}\`\n` +
    `├─────────────────────────────\n` +
    `│ 🟢  Ishlayapti:  *${esc(running)}*\n` +
    `│ 🔴  To'xtatilgan: *${esc(stopped)}*\n` +
    `├─────────────────────────────\n` +
    `│ ☕  Java:     *${esc(java)}*\n` +
    `│ 🟩  Bedrock:  *${esc(bedrock)}*\n` +
    `└─────────────────────────────\n\n` +
    `_Yangilangan: ${esc(new Date().toLocaleTimeString())}_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CREATE SERVER WIZARD
// ═══════════════════════════════════════════════════════════════════════════

async function startCreate(chatId, sess) {
  if (!sess.token) {
    await bot.sendMessage(chatId,
      `🔒 *Tizimga kirish talab etiladi*\n\nServer yaratish uchun tizimga kirishingiz kerak\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbMain(true) }
    );
    return;
  }

  const kb = {
    inline_keyboard: [
      [
        {
          text: "📱 Mini ilovada ochish",
          web_app: {
            url: `https://afk.hypepath.uz/create?token=${encodeURIComponent(sess.token)}`
          }
        }
      ],
      [
        {
          text: "🔙 Orqaga",
          callback_data: "menu"
        }
      ]
    ]
  };

  const text = `➕ *Yangi server qo'shish*\n\n` +
    `Serverni qulay interfeysli *Mini Ilova \\(Web App\\)* orqali tezda qo'shishingiz yoki botning o'zida *Wizard \\(qadamma\\-qadam chat\\)* orqali qo'shishingiz mumkin:`;

  const m = await bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: kb
  });
  sess.lastMsgId = m.message_id;
}

async function startCreateWizard(chatId, sess) {
  if (!sess.token) {
    await bot.sendMessage(chatId,
      `🔒 *Tizimga kirish talab etiladi*\n\nServer yaratish uchun tizimga kirishingiz kerak\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbMain(true) }
    );
    return;
  }

  sess.state = 'create_ip';
  sess.draft = {};

  const m = await bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 1\\-qadam / 4\n\n` +
    `🌐 Minecraft server *IP manzili yoki hostnameni* kiriting:\n\n` +
    `_Misol: \`Server\\.aternos\\.me\` yoki \`192\\.168\\.1\\.1\`_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardCreateIp(chatId, sess, text) {
  if (!/^[a-zA-Z0-9.\-_]{1,253}$/.test(text)) {
    return bot.sendMessage(chatId,
      `❌ *Noto'g'ri hostname*\n\nIltimos to'g'ri IP yoki domen kiriting \\(bo'sh joy bo'lmasin\\)\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
    );
  }
  sess.draft.ip = text;
  sess.state = 'create_port';

  await bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 2\\-qadam / 4\n\n` +
    `🔌 Server *portini* kiriting:\n\n` +
    `_Java uchun: \`25565\`  •  Bedrock uchun: \`19132\`_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
}

async function wizardCreatePort(chatId, sess, text) {
  const port = parseInt(text);
  if (isNaN(port) || port < 1 || port > 65535) {
    return bot.sendMessage(chatId,
      `❌ *Noto'g'ri port*\n\nPort 1 dan 65535 gacha bo'lgan son bo'lishi kerak\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
    );
  }
  sess.draft.port = port;
  sess.state = 'create_type';

  await bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 3\\-qadam / 4\n\n` +
    `🎮 Server *turini* tanlang:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbServerType() }
  );
}

async function wizardCreateVersion(chatId, sess, text) {
  // Warn the user that they must select a version using the buttons below, not manually
  return bot.sendMessage(chatId,
    `⚠️ *Iltimos, quyidagi ro'yxatdan birorta versiyani tanlang\\!*`,
    { parse_mode: 'MarkdownV2', reply_markup: kbVersions(sess.draft.type) }
  );
}

async function handleSetType(chatId, sess, type) {
  if (!['java', 'bedrock'].includes(type)) return;
  if (sess.state !== 'create_type') return;

  sess.draft.type = type;
  sess.state = 'create_version';

  const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
  await bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 4\\-qadam / 4\n\n` +
    `🏷 *${typeLabel}* uchun Minecraft *versiyasini* tanlang:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbVersions(type) }
  );
}

async function handleSetVersion(chatId, sess, msgId, version) {
  if (sess.state !== 'create_version') return;

  sess.draft.version = version;
  sess.state = null;

  const { ip, port, type } = sess.draft;
  const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';

  await bot.sendMessage(chatId,
    `⏳ *Server yaratilmoqda\\.\\.\\.*\n\n` +
    `🌐 Host: \`${esc(ip)}:${esc(port)}\`\n` +
    `🏷 Versiya: \`${esc(version)}\`\n` +
    `🎮 Tur: ${esc(typeLabel)}`,
    { parse_mode: 'MarkdownV2' }
  );

  const result = await api('POST', '/projects', {
    ip, port, version, type
  }, sess.token);

  if (result.success) {
    const text =
      `✅ *Server muvaffaqiyatli yaratildi\\!*\n\n` +
      `🆔 ID: \`${esc(result.projectId)}\`\n` +
      `🌐 \`${esc(ip)}:${esc(port)}\`\n` +
      `🏷 Versiya: \`${esc(version)}\`  •  ${esc(typeLabel)}\n\n` +
      `_Boshqarish uchun quyidagi tugmalardan foydalaning\\._`;

    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: kbServer(result.projectId, 'stopped')
    });
  } else {
    const text =
      `❌ *Server yaratib bo'lmadi*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: kbBack('menu')
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  💬 USER SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

async function startSupportMessage(chatId, sess) {
  if (!sess.token) return requireLogin(chatId, sess);

  sess.state = 'support_msg';
  sess.draft = {};

  const m = await bot.sendMessage(chatId,
    `💬 *Yordam so'rash*\n\n` +
    `Quyida xabaringizni yozing, admin jamoamiz imkon qadar tez javob beradi\\.\n\n` +
    `_Muammongizni batafsil tushuntiring:_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardSupportMsg(chatId, sess, text) {
  sess.state = null;

  const ticket = {
    id:        ++ticketCounter,
    chatId,
    username:  sess.username,
    message:   text,
    timestamp: new Date(),
    closed:    false,
    replied:   false,
    replyText: null,
    replyAt:   null
  };
  supportTickets.push(ticket);

  const confirmText =
    `✅ *Yordam so'rovi yaratildi\\!*\n\n` +
    `🎫 Ticket \\#${esc(ticket.id)}\n` +
    `📝 "${esc(text.slice(0, 100))}${text.length > 100 ? '\\.\\.\\.' : ''}"\n\n` +
    `_Admin jamoamiz tez orada javob beradi\\. Bu yerda bildirishnoma olasiz\\._`;

  sess.lastMsgId = await editOrSend(chatId, null, confirmText, kbMain(true, isAdminUser(sess)));

  // Notify admin if they're tracked
  const adminChatId = usernameToChatId.get(ADMIN_USERNAME);
  if (adminChatId && adminChatId !== chatId) {
    try {
      await bot.sendMessage(adminChatId,
        `🔔 *Yangi yordam so'rovi\\!*\n\n` +
        `🎫 Ticket \\#${esc(ticket.id)}\n` +
        `👤 Kim: *${esc(ticket.username)}*\n` +
        `📝 "${esc(text.slice(0, 200))}"\n\n` +
        `_Javob berish uchun quyidagi tugmani bosing:_`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💬  Javob berish', callback_data: `treply_${ticket.id}` },
                { text: '✅  Yopish',        callback_data: `tclose_${ticket.id}` }
              ],
              [{ text: '📋  Barcha ticketlar', callback_data: 'admin_support' }]
            ]
          }
        }
      );
    } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  🛡 ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdminPanel(chatId, sess, msgId) {
  if (!isAdminUser(sess)) {
    return editOrSend(chatId, msgId,
      `🚫 *Ruxsat yo'q*\n\n_Admin huquqlari talab etiladi\\._`,
      kbBack('menu')
    );
  }

  const openTickets = getOpenTicketCount();
  const totalUsers  = knownChatIds.size;

  const text =
    `🛡 *Admin paneli*\n\n` +
    `┌─────────────────────────────\n` +
    `│ 👥  Foydalanuvchilar:  *${esc(totalUsers)}*\n` +
    `│ 🎫  Ochiq ticketlar:   *${esc(openTickets)}*\n` +
    `└─────────────────────────────\n\n` +
    `_Admin amalni tanlang:_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbAdminPanel());
}

// ── Admin: All Servers ──────────────────────────────────────────────────────

async function handleAdminServers(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);

  const result = await api('GET', '/projects', null, sess.token);

  if (!result.success) {
    return editOrSend(chatId, msgId,
      `❌ *Serverlarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``,
      kbAdminBack()
    );
  }

  const projects = result.projects || {};
  const ids      = Object.keys(projects);

  if (ids.length === 0) {
    return editOrSend(chatId, msgId,
      `🖥 *Barcha serverlar \\(Admin\\)*\n\n_Hozircha server yo'q\\._`,
      kbAdminBack()
    );
  }

  let running = 0, stopped = 0;
  ids.forEach(id => projects[id].status === 'running' ? running++ : stopped++);

  // Group by owner
  const byOwner = {};
  ids.forEach(id => {
    const s     = projects[id];
    const owner = s.owner || 'noma\'lum';
    if (!byOwner[owner]) byOwner[owner] = [];
    byOwner[owner].push({ id, ...s });
  });

  let text =
    `🖥 *Barcha serverlar \\(Admin\\)* — ${esc(ids.length)} ta\n` +
    `🟢 ${esc(running)} ishlayapti  •  🔴 ${esc(stopped)} to'xtatilgan\n\n`;

  const rows = [];
  for (const [owner, servers] of Object.entries(byOwner)) {
    text += `👤 *${esc(owner)}* \\(${esc(servers.length)}\\):\n`;
    for (const s of servers) {
      const si = s.status === 'running' ? '🟢' : '🔴';
      const ti = s.type   === 'java'    ? '☕'  : '🟩';
      text += `  ${si} ${ti} \`${esc(s.host)}:${esc(s.port)}\`\n`;
      rows.push([{
        text: `${si} ${ti} ${s.host}:${s.port} [${owner}]`,
        callback_data: `srvinfo_${s.id}`
      }]);
    }
    text += `\n`;
  }

  rows.push([{ text: '🔙  Admin paneli', callback_data: 'admin_panel' }]);

  sess.lastMsgId = await editOrSend(chatId, msgId, text, { inline_keyboard: rows });
}

// ── Admin: Users ────────────────────────────────────────────────────────────

async function handleAdminUsers(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);

  const users = Array.from(knownChatIds.entries());

  if (users.length === 0) {
    return editOrSend(chatId, msgId,
      `👥 *Bot foydalanuvchilari \\(Admin\\)*\n\n_Hali hech kim bot bilan muloqot qilmagan\\._`,
      kbAdminBack()
    );
  }

  let text =
    `👥 *Bot foydalanuvchilari* — ${esc(users.length)} ta\n\n`;

  users.forEach(([cid, username]) => {
    const hasSession = sessions.has(cid) && sessions.get(cid).token;
    const dot = hasSession ? '🟢' : '⚪';
    text += `${dot} *${esc(username)}* — \`${esc(cid)}\`\n`;
  });

  text += `\n_🟢 \\= faol sessiya  ⚪ \\= sessiya yo'q_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbAdminBack());
}

// ── Admin: Broadcast ────────────────────────────────────────────────────────

async function startBroadcast(chatId, sess) {
  if (!isAdminUser(sess)) return;

  if (knownChatIds.size === 0) {
    await bot.sendMessage(chatId,
      `❌ *Xabar yuborish uchun foydalanuvchi yo'q*\n\n_Hali hech kim bot bilan muloqot qilmagan\\._`,
      { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
    );
    return;
  }

  sess.state = 'broadcast_text';
  sess.draft = {};

  const m = await bot.sendMessage(chatId,
    `📢 *Ommaviy xabar*\n\n` +
    `*Barcha ${esc(knownChatIds.size)} foydalanuvchi*ga yubormoqchi bo'lgan xabaringizni yozing:\n\n` +
    `_Bu botdan foydalangan hamma kishiga yuboriladi\\._`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardBroadcastText(chatId, sess, text) {
  sess.state = null;
  sess.draft.broadcastText = text;

  const preview =
    `📢 *Ommaviy xabar ko'rinishi*\n\n` +
    `"${esc(text.slice(0, 500))}"\n\n` +
    `📨 *${esc(knownChatIds.size)}* ta foydalanuvchiga yuboriladi\\.\n\n` +
    `_Yuborishni tasdiqlaysizmi?_`;

  sess.lastMsgId = await editOrSend(chatId, null, preview, kbBroadcastConfirm());
}

async function executeBroadcast(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return;

  const text = sess.draft.broadcastText;
  if (!text) {
    return editOrSend(chatId, msgId,
      `❌ *Ommaviy xabar topilmadi\\.*`,
      kbAdminBack()
    );
  }

  await editOrSend(chatId, msgId,
    `📢 *Xabar yuborilmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  let sent = 0, failed = 0;

  const broadcastMsg =
    `📢 *Admin e'loni*\n\n` +
    `${esc(text)}`;

  for (const [cid] of knownChatIds) {
    try {
      await bot.sendMessage(cid, broadcastMsg, { parse_mode: 'MarkdownV2' });
      sent++;
    } catch (_) {
      failed++;
    }
  }

  sess.draft = {};

  const resultText =
    `✅ *Ommaviy xabar yuborildi\\!*\n\n` +
    `📨 Yetkazildi: *${esc(sent)}*\n` +
    `❌ Xato: *${esc(failed)}*\n` +
    `📊 Jami: *${esc(sent + failed)}*`;

  sess.lastMsgId = await editOrSend(chatId, msgId, resultText, kbAdminBack());
}

// ── Admin: Support Tickets ──────────────────────────────────────────────────

async function handleSupportList(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);

  const open   = supportTickets.filter(t => !t.closed);
  const closed = supportTickets.filter(t => t.closed);

  if (supportTickets.length === 0) {
    return editOrSend(chatId, msgId,
      `💬 *Yordam ticketlari \\(Admin\\)*\n\n_Hozircha ticket yo'q\\. Foydalanuvchilar asosiy menyudan yordam so'rashi mumkin\\._`,
      kbAdminBack()
    );
  }

  let text =
    `💬 *Yordam ticketlari*\n` +
    `🟡 Ochiq: *${esc(open.length)}*  •  ✅ Yopilgan: *${esc(closed.length)}*\n\n`;

  if (open.length > 0) {
    text += `*Ochiq ticketlar:*\n`;
    open.slice(-10).forEach(t => {
      text += `🟡 \\#${esc(t.id)} — *${esc(t.username)}* — "${esc(t.message.slice(0, 40))}"\n`;
    });
    text += `\n`;
  }

  if (closed.length > 0) {
    text += `*Yaqinda yopilganlar:*\n`;
    closed.slice(-5).forEach(t => {
      text += `✅ \\#${esc(t.id)} — *${esc(t.username)}*\n`;
    });
  }

  const rows = open.slice(-10).map(t => [{
    text: `🟡 #${t.id} — ${t.username}`,
    callback_data: `ticket_${t.id}`
  }]);

  rows.push([{ text: '🔙  Admin paneli', callback_data: 'admin_panel' }]);

  sess.lastMsgId = await editOrSend(chatId, msgId, text, { inline_keyboard: rows });
}

async function handleTicketView(chatId, sess, msgId, ticketId) {
  if (!isAdminUser(sess)) return;

  const ticket = supportTickets.find(t => t.id === ticketId);
  if (!ticket) {
    return editOrSend(chatId, msgId, `❌ *Ticket topilmadi*`, kbAdminBack());
  }

  let text =
    `🎫 *Ticket \\#${esc(ticket.id)}*\n\n` +
    `👤 Foydalanuvchi: *${esc(ticket.username)}*\n` +
    `📅 ${esc(fmtTime(ticket.timestamp))}\n` +
    `📊 Holat: ${ticket.closed ? '✅ Yopilgan' : '🟡 Ochiq'}\n\n` +
    `📝 *Xabar:*\n"${esc(ticket.message)}"\n`;

  if (ticket.replied && ticket.replyText) {
    text += `\n💬 *Admin javobi:*\n"${esc(ticket.replyText)}"\n`;
    text += `📅 ${esc(fmtTime(ticket.replyAt))}\n`;
  }

  const btns = [];
  if (!ticket.closed) {
    btns.push(
      { text: '💬  Javob berish', callback_data: `treply_${ticketId}` },
      { text: '✅  Yopish',        callback_data: `tclose_${ticketId}` }
    );
  }

  const kb = {
    inline_keyboard: [
      ...(btns.length > 0 ? [btns] : []),
      [{ text: '📋  Barcha ticketlar', callback_data: 'admin_support' }]
    ]
  };

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function startTicketReply(chatId, sess, ticketId) {
  if (!isAdminUser(sess)) return;

  sess.state = 'ticket_reply';
  sess.draft.replyTicketId = ticketId;

  const ticket = supportTickets.find(t => t.id === ticketId);
  const m = await bot.sendMessage(chatId,
    `💬 *Ticket \\#${esc(ticketId)} ga javob*\n\n` +
    `👤 Foydalanuvchi: *${esc(ticket?.username || 'Noma\'lum')}*\n` +
    `📝 "${esc((ticket?.message || '').slice(0, 100))}"\n\n` +
    `_Javobingizni yozing:_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardTicketReply(chatId, sess, text) {
  sess.state = null;
  const ticketId = sess.draft.replyTicketId;
  const ticket   = supportTickets.find(t => t.id === ticketId);

  if (!ticket) {
    return editOrSend(chatId, null, `❌ *Ticket topilmadi*`, kbAdminBack());
  }

  ticket.replied   = true;
  ticket.replyText = text;
  ticket.replyAt   = new Date();

  // Send reply to the user
  try {
    await bot.sendMessage(ticket.chatId,
      `💬 *Yordam javobi*\n\n` +
      `🎫 Ticket \\#${esc(ticket.id)}\n\n` +
      `📝 Sizning xabaringiz:\n"${esc(ticket.message.slice(0, 100))}"\n\n` +
      `💬 *Admin javobi:*\n"${esc(text)}"\n\n` +
      `_Ko'proq yordam kerak bo'lsa, asosiy menyudan 💬 Yordam so'rash tugmasini bosing\\._`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💬  Yangi xabar',  callback_data: 'support_new' },
              { text: '🏠  Asosiy menyu', callback_data: 'menu'        }
            ]
          ]
        }
      }
    );
  } catch (err) {
    console.error('Failed to send ticket reply to user:', err.message);
  }

  const confirmText =
    `✅ *${esc(ticket.username)} ga javob yuborildi\\!*\n\n` +
    `🎫 Ticket \\#${esc(ticketId)}`;

  sess.draft = {};
  sess.lastMsgId = await editOrSend(chatId, null, confirmText, {
    inline_keyboard: [
      [
        { text: '✅  Ticketni yopish', callback_data: `tclose_${ticketId}` },
        { text: '📋  Barcha ticketlar', callback_data: 'admin_support'      }
      ]
    ]
  });
}

async function handleTicketClose(chatId, sess, msgId, ticketId) {
  if (!isAdminUser(sess)) return;

  const ticket = supportTickets.find(t => t.id === ticketId);
  if (!ticket) {
    return editOrSend(chatId, msgId, `❌ *Ticket topilmadi*`, kbAdminBack());
  }

  ticket.closed = true;

  // Notify user that ticket is closed
  try {
    await bot.sendMessage(ticket.chatId,
      `✅ *Yordam ticketi yopildi*\n\n` +
      `🎫 Ticket \\#${esc(ticketId)} hal qilindi\\.\n\n` +
      `_Ko'proq yordam kerak bo'lsa, 💬 Yordam so'rash tugmasini bosing\\._`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💬  Yangi xabar',  callback_data: 'support_new' },
              { text: '🏠  Asosiy menyu', callback_data: 'menu'        }
            ]
          ]
        }
      }
    );
  } catch (_) {}

  const text =
    `✅ *Ticket \\#${esc(ticketId)} yopildi*\n\n` +
    `👤 ${esc(ticket.username)}`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, {
    inline_keyboard: [
      [{ text: '📋  Barcha ticketlar', callback_data: 'admin_support' }],
      [{ text: '🔙  Admin paneli',     callback_data: 'admin_panel'   }]
    ]
  });
}

// ─── AUTH GUARD ──────────────────────────────────────────────────────────────

async function requireLogin(chatId, sess, msgId) {
  // Auto-auth: re-login silently instead of showing a prompt
  const ok = await ensureTelegramAuth(chatId, sess);
  if (!ok) {
    sess.lastMsgId = await editOrSend(chatId, msgId,
      `❌ *Serverga ulanib bo'lmadi\\.*\n\n_Iltimos /start yuboring\\._`,
      { inline_keyboard: [[ { text: '🔄  Qayta urinish', callback_data: 'menu' } ]] }
    );
  }
  // If ok, the caller will retry its action on next user tap
}

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

console.log(`✅  Bot ishga tushdi. Admin username: ${ADMIN_USERNAME}`);
console.log('📨  Telegram botingizga /start yuboring.');

// ═══════════════════════════════════════════════════════════════════════════
//  🛡 ADMIN VERSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdminVersions(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);
  sess.state = null;

  const text =
    `🛡 *Versiyalarni boshqarish*\n\n` +
    `Minecraft server turlaridan birini tanlang:`;

  const kb = {
    inline_keyboard: [
      [
        { text: '☕  Java versiyalari', callback_data: 'admvers_list_java' },
        { text: '🟩  Bedrock versiyalari', callback_data: 'admvers_list_bedrock' }
      ],
      [{ text: '🔙  Admin paneli', callback_data: 'admin_panel' }]
    ]
  };

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleAdminVersionList(chatId, sess, msgId, type) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);
  sess.state = null;

  const versions = loadVersions(type);
  const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';

  let text = `🛡 *${typeLabel} Versiyalari*:\n\n`;
  if (versions.length === 0) {
    text += `_Hozircha hech qanday versiya qo'shilmagan\\._`;
  } else {
    versions.forEach((v, idx) => {
      text += `${idx + 1}\\. \`${esc(v)}\`\n`;
    });
  }

  const kb = {
    inline_keyboard: [
      [
        { text: '➕ Versiya qo\'shish', callback_data: `admvers_add_${type}` },
        { text: '➖ Versiyani o\'chirish', callback_data: `admvers_del_${type}` }
      ],
      [{ text: '🔙 Orqaga', callback_data: 'admin_versions' }]
    ]
  };

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function startAddVersion(chatId, sess, type) {
  if (!isAdminUser(sess)) return;
  sess.state = `admvers_add_input_${type}`;

  const typeLabel = type === 'java' ? 'Java' : 'Bedrock';
  const m = await bot.sendMessage(chatId,
    `➕ *Yangi ${typeLabel} versiyasini qo'shish*\n\n` +
    `Qo'shmoqchi bo'lgan versiyani yuboring (Masalan: \`1.20.2\`):`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
  );
  sess.lastMsgId = m.message_id;
}

async function handleAddVersionInput(chatId, sess, text, type) {
  if (!isAdminUser(sess)) return;

  if (!/^\d+\.\d+(\.\d+)?$/.test(text)) {
    return bot.sendMessage(chatId,
      `❌ *Noto'g'ri format*\n\nVersiya \`1.20.1\` kabi formatda bo'lishi kerak. Qayta urinib ko'ring:`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
    );
  }

  const versions = loadVersions(type);
  if (versions.includes(text)) {
    sess.state = null;
    return bot.sendMessage(chatId,
      `⚠️ \`${esc(text)}\` versiyasi allaqachon mavjud!`,
      { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
    );
  }

  versions.unshift(text); // Add new version to the top
  saveVersions(type, versions);
  sess.state = null;

  await bot.sendMessage(chatId,
    `✅ \`${esc(text)}\` versiyasi muvaffaqiyatli qo'shildi!`,
    { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
  );
}

async function startDelVersion(chatId, sess, type) {
  if (!isAdminUser(sess)) return;
  sess.state = null;

  const versions = loadVersions(type);
  const typeLabel = type === 'java' ? 'Java' : 'Bedrock';

  if (versions.length === 0) {
    return bot.sendMessage(chatId,
      `⚠️ O'chirish uchun hech qanday versiya mavjud emas!`,
      { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
    );
  }

  const rows = [];
  for (let i = 0; i < versions.length; i += 2) {
    const row = [];
    row.push({ text: `🗑 ${versions[i]}`, callback_data: `admvers_do_del_${type}_${versions[i]}` });
    if (i + 1 < versions.length) {
      row.push({ text: `🗑 ${versions[i+1]}`, callback_data: `admvers_do_del_${type}_${versions[i+1]}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '🔙 Orqaga', callback_data: `admvers_list_${type}` }]);

  const text = `🗑 *${typeLabel} versiyasini o'chirish*\n\nO'chirish uchun versiyani tanlang:`;
  sess.lastMsgId = await editOrSend(chatId, null, text, { inline_keyboard: rows });
}

async function executeDelVersion(chatId, sess, msgId, typeAndVersion) {
  if (!isAdminUser(sess)) return;

  const underscoreIdx = typeAndVersion.indexOf('_');
  if (underscoreIdx === -1) return;
  const type = typeAndVersion.substring(0, underscoreIdx);
  const version = typeAndVersion.substring(underscoreIdx + 1);

  let versions = loadVersions(type);
  versions = versions.filter(v => v !== version);
  saveVersions(type, versions);

  const typeLabel = type === 'java' ? 'Java' : 'Bedrock';

  await bot.sendMessage(chatId,
    `✅ *${typeLabel}* uchun \`${esc(version)}\` versiyasi muvaffaqiyatli o'chirildi!`,
    { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
  );
}
