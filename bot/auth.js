const crypto = require('crypto');
const context = require('./context');
const api = require('./api');
const { getTgUser, saveTgUser, trackUser } = require('./store');
const { esc } = require('./formatters');
const { editOrSend } = require('./ui');
const { kbCancel, kbMain } = require('./keyboards');
const { ADMIN_USERNAME } = require('./config');

function isAdminUser(sess) {
  return sess.username === ADMIN_USERNAME;
}

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
      await context.bot.sendMessage(chatId,
        `🎉 *Tabriklaymiz, muvaffaqiyatli ro'yxatdan o'tdingiz\\!* 🚀\n\n` +
        `Web\\-panelga \\(afk\\.hypepath\\.uz\\) kirish uchun shaxsiy hisobingiz ma'lumotlari:\n\n` +
        `🔐 *Hisob ma'lumotlari:*\n` +
        `┌──────────────────────────────\n` +
        `│ 👤 Login: \`${esc(username)}\` \\(nusxalash uchun bosing\\)\n` +
        `│ 🔑 Parol: \`${esc(password)}\` \\(nusxalash uchun bosing\\)\n` +
        `└──────────────────────────────\n\n` +
        `⚠️ *Muhim:* Ushbu ma'lumotlarni hech kimga bermang\\. Ulardan istalgan brauzer orqali panelga kirishda foydalanishingiz mumkin\\.\n\n` +
        `📖 *Botdan foydalanishni o'rganish uchun pastdagi tugmani bosing\\:*`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📹 Video yordam', callback_data: 'send_help_video' }]
            ]
          }
        }
      );
    }

    return true;
  }

  // ── EXISTING USER: auto-login ────────────────────────────────────────────
  let loginResult = await api('POST', '/auth/login', {
    username: stored.username,
    password: stored.password
  });

  if (!loginResult.success) {
    console.error(`[TG-AUTH] Auto-login failed for ${stored.username}:`, loginResult.error);

    // ── RECOVERY: User may exist in tg_users.json but not in MongoDB ────────
    // (e.g. after DB reset, server migration). Re-register with the stored
    // password using the trusted bot token so the backend allows overwrite.
    console.log(`[TG-AUTH] Attempting re-registration for ${stored.username}...`);
    const signupResult = await api('POST', '/auth/signup', {
      username: stored.username,
      password: stored.password
    });

    if (!signupResult.success) {
      console.error(`[TG-AUTH] Re-registration also failed for ${stored.username}:`, signupResult.error);
      return false;
    }

    console.log(`[TG-AUTH] Re-registration success for ${stored.username}. Retrying login...`);
    loginResult = await api('POST', '/auth/login', {
      username: stored.username,
      password: stored.password
    });

    if (!loginResult.success) {
      console.error(`[TG-AUTH] Login after re-registration failed for ${stored.username}:`, loginResult.error);
      return false;
    }
  }

  sess.token    = loginResult.token;
  sess.username = loginResult.username;
  trackUser(chatId, sess.username);
  return true;
}

async function requireLogin(chatId, sess, msgId) {
  const ok = await ensureTelegramAuth(chatId, sess);
  if (!ok) {
    sess.lastMsgId = await editOrSend(chatId, msgId,
      `❌ *Serverga ulanib bo'lmadi\\.*\n\n_Iltimos /start yuboring\\._`,
      { inline_keyboard: [[ { text: '🔄  Qayta urinish', callback_data: 'menu' } ]] }
    );
  }
}

async function startLogin(chatId, sess) {
  sess.state = 'login_username';
  sess.draft = {};
  const m = await context.bot.sendMessage(chatId,
    `🔑 *Login to MC\\-AFK Panel*\n\nStep 1 of 2 — Enter your *username*:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardLoginUser(chatId, sess, text) {
  sess.draft.username = text;
  sess.state = 'login_password';
  await context.bot.sendMessage(chatId,
    `Step 2 of 2 — Enter your *password*:\n\n_\\(Your message will be deleted for security\\)_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
}

async function wizardLoginPass(chatId, sess, text) {
  sess.state = null;

  try { await context.bot.deleteMessage(chatId, sess.lastMsgId); } catch (_) {}

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
  const m = await context.bot.sendMessage(chatId,
    `📝 *Register a new account*\n\nStep 1 of 2 — Choose a *username*:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardRegUser(chatId, sess, text) {
  sess.draft.username = text;
  sess.state = 'reg_password';
  await context.bot.sendMessage(chatId,
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

module.exports = {
  isAdminUser,
  ensureTelegramAuth,
  requireLogin,
  startLogin,
  wizardLoginUser,
  wizardLoginPass,
  startRegister,
  wizardRegUser,
  wizardRegPass
};
