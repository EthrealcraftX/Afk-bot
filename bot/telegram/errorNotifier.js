'use strict';

/**
 * errorNotifier.js
 *
 * Sends Telegram error messages to a user when their AFK bot encounters an error.
 * Uses the Telegram Bot API directly (no bot instance required) so it works
 * from both the server process and the bot process.
 *
 * Rules:
 *  - If user has no linked Telegram account → skip silently
 *  - If Telegram send fails → catch and log, never crash the process
 *  - VERSION_MISMATCH / PROTOCOL_MISMATCH / EDITION_MISMATCH / address errors
 *    → send WITH "edit bot" + "help" inline buttons
 *  - All other errors → plain message, no buttons
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

const TELEGRAM_API_TIMEOUT_MS = 10000;

// ── Error codes that warrant "edit bot" buttons ────────────────────────────────
const CODES_WITH_EDIT_BUTTON = new Set([
  'VERSION_MISMATCH',
  'PROTOCOL_MISMATCH',
  'EDITION_MISMATCH',
  'ENOTFOUND',
  'EHOSTUNREACH'
]);

// ── Uzbek translations for each error code ────────────────────────────────────
const UZ_TEMPLATES = {
  ECONNREFUSED: {
    title:      'Server ishlamayapti',
    message:    "Bot serverga ulana olmadi. Server o'chiq bo'lishi mumkin.",
    suggestion: "Serveringiz yoqilganligini tekshiring"
  },
  ETIMEDOUT: {
    title:      'Ulanish vaqti tugadi',
    message:    "Server javob bermadi. Internet yoki server muammosi bo'lishi mumkin.",
    suggestion: "Internet aloqangizni va serveringizni tekshiring"
  },
  CONNECT_TIMEOUT: {
    title:      'Ulanish vaqti tugadi',
    message:    "Server javob bermadi. Internet yoki server muammosi bo'lishi mumkin.",
    suggestion: "Internet aloqangizni va serveringizni tekshiring"
  },
  ENOTFOUND: {
    title:      "Noto'g'ri manzil yoki port",
    message:    "Bot serverga ulana olmadi. IP manzil yoki port noto'g'ri.",
    suggestion: "Server manzili va portini tekshiring"
  },
  EHOSTUNREACH: {
    title:      "Noto'g'ri manzil yoki port",
    message:    "Bot serverga ulana olmadi. IP manzil yoki port noto'g'ri.",
    suggestion: "Server manzili va portini tekshiring"
  },
  ECONNRESET: {
    title:      'Kutilmagan uzilish',
    message:    "Bot to'satdan serverdan uzildi.",
    suggestion: "Botni qayta ishga tushiring. Muammo takrorlansa serveringizni tekshiring"
  },
  EPIPE: {
    title:      'Kutilmagan uzilish',
    message:    "Bot to'satdan serverdan uzildi.",
    suggestion: "Botni qayta ishga tushiring. Muammo takrorlansa serveringizni tekshiring"
  },
  VERSION_MISMATCH: {
    title:      'Versiya mos emas',
    message:    "Bot versiyasi server versiyasiga mos kelmadi.",
    suggestion: "Bot sozlamalarida to'g'ri Minecraft versiyasini kiriting"
  },
  PROTOCOL_MISMATCH: {
    title:      'Versiya mos emas',
    message:    "Bot versiyasi server versiyasiga mos kelmadi.",
    suggestion: "Bot sozlamalarida to'g'ri Minecraft versiyasini kiriting"
  },
  EDITION_MISMATCH: {
    title:      "Noto'g'ri manzil yoki port",
    message:    "Bot serverga ulana olmadi. IP manzil yoki port noto'g'ri.",
    suggestion: "Server manzili va portini tekshiring"
  },
  SERVER_FULL: {
    title:      "Server to'la",
    message:    "Server maksimal o'yinchilar soniga yetdi.",
    suggestion: "Bir ozdan so'ng qayta urinib ko'ring, bot avtomatik qayta ulanadi"
  },
  INVALID_SESSION: {
    title:      'Autentifikatsiya xatosi',
    message:    "Akkaunt ma'lumotlari noto'g'ri yoki akkaunt premium emas.",
    suggestion: "Akkaunt sozlamalarini tekshiring"
  },
  NOT_PREMIUM: {
    title:      'Autentifikatsiya xatosi',
    message:    "Akkaunt ma'lumotlari noto'g'ri yoki akkaunt premium emas.",
    suggestion: "Akkaunt sozlamalarini tekshiring"
  },
  ALREADY_LOGGED_IN: {
    title:      'Autentifikatsiya xatosi',
    message:    "Akkaunt ma'lumotlari noto'g'ri yoki akkaunt premium emas.",
    suggestion: "Akkaunt sozlamalarini tekshiring"
  },
  BOT_KICKED: {
    title:      'Bot kicklandi',
    message:    null,  // built dynamically from rawError
    suggestion: "Kick sababini tekshiring va botni qayta ishga tushiring"
  },
  BOT_BANNED: {
    title:      'Bot banlandi',
    message:    "Botning IP manzili yoki akkaunt serverda banlangan.",
    suggestion: "Boshqa akkaunt yoki IP bilan urinib ko'ring"
  },
  BOT_DISCONNECTED: {
    title:      'Kutilmagan uzilish',
    message:    "Bot to'satdan serverdan uzildi.",
    suggestion: "Botni qayta ishga tushiring. Muammo takrorlansa serveringizni tekshiring"
  },
  RECONNECT_FAILED: {
    title:      'Kutilmagan uzilish',
    message:    "Bot to'satdan serverdan uzildi.",
    suggestion: "Botni qayta ishga tushiring. Muammo takrorlansa serveringizni tekshiring"
  },
  PROCESS_CRASHED: {
    title:      "Bot jarayoni xato bilan to'xtadi",
    message:    "Bot jarayoni kutilmagan xato bilan to'xtadi.",
    suggestion: "Loglarni tekshiring va botni qayta ishga tushiring"
  },
  PROCESS_EXITED: {
    title:      "Bot to'xtadi",
    message:    "Bot jarayoni to'xtadi.",
    suggestion: "Loglarni tekshiring. Agar kutilmagan bo'lsa, botni qayta ishga tushiring"
  },
  CREATION_ERROR: {
    title:      'Bot yaratish xatosi',
    message:    "Bot sozlamalari noto'g'ri — bot ishga tushmadi.",
    suggestion: "Versiya va server turini tekshiring"
  }
};

const UZ_UNKNOWN = {
  title:      "Noma'lum xato",
  message:    "Botda kutilmagan xato yuz berdi.",
  suggestion: "Loglarni tekshiring"
};

// ── Escape MarkdownV2 special characters ──────────────────────────────────────
function esc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── Build the Uzbek notification text ─────────────────────────────────────────
function buildUzbekText(botName, errorCode, rawError, timestamp) {
  const tpl = UZ_TEMPLATES[errorCode] || UZ_UNKNOWN;

  let message = tpl.message;
  if (errorCode === 'BOT_KICKED') {
    const reason = rawError ? String(rawError).replace(/^"(.*)"$/, '$1').trim() : '';
    message = `Server botni chiqarib yubordi${reason ? `: ${reason}` : ''}.`;
  }

  let timeStr;
  try {
    timeStr = new Date(timestamp || Date.now())
      .toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  } catch (_) {
    timeStr = new Date().toLocaleTimeString();
  }

  return (
    `⚠️ *Bot xatosi: ${esc(botName)}*\n` +
    `❌ ${esc(tpl.title)}\n\n` +
    `📋 ${esc(message || '')}\n` +
    `💡 ${esc(tpl.suggestion)}\n` +
    `🕐 ${esc(timeStr)}`
  );
}

// ── Read tg_users.json to find chatId for a username ─────────────────────────
function getChatIdForUser(username) {
  try {
    const filePath = path.join(__dirname, '../../data/tg_users.json');
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // tg_users.json format: { "chatId": { username, password }, ... }
    for (const [chatId, entry] of Object.entries(data)) {
      if (entry && entry.username === username) {
        return chatId;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ── Raw HTTPS call to Telegram Bot API sendMessage ───────────────────────────
function telegramRequest(botToken, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // FIXED: JSON.parse safety wrapper for non-JSON Telegram API responses
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve({ ok: false, error: 'Invalid JSON response from Telegram' });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(TELEGRAM_API_TIMEOUT_MS, () => { req.destroy(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

/**
 * Main exported function — call this after saveNotification succeeds.
 *
 * @param {{
 *   projectId: string,
 *   projectName?: string,   display name like "mc.server.com:25565"
 *   userId: string,         owner username
 *   errorCode: string,
 *   rawError?: string,
 *   userToken?: string,     JWT token for the edit URL
 *   createdAt?: Date
 * }} data
 */
async function sendTelegramError(data) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return; // no bot token configured

  const { projectId, projectName, userId, errorCode, rawError, userToken, createdAt } = data;

  // Find the Telegram chat ID for this user
  const chatId = getChatIdForUser(userId);
  if (!chatId) return; // no linked Telegram account — skip silently

  const botName = projectName || projectId;

  try {
    const text = buildUzbekText(botName, errorCode, rawError, createdAt);
    const needsEditButton = CODES_WITH_EDIT_BUTTON.has(errorCode);

    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2'
    };

    if (needsEditButton && userToken) {
      // Include projectId so the edit page opens for THIS exact server
      const { WEB_APP_URL, IS_HTTPS } = require('../config');
      const editUrl = `${WEB_APP_URL}/edit?token=${encodeURIComponent(userToken)}&project=${encodeURIComponent(projectId)}`;
      const button = IS_HTTPS
        ? { text: '✏️ Bot edit qilish', web_app: { url: editUrl } }
        : { text: '✏️ Bot edit qilish (Brauzerda)', url: editUrl };

      payload.reply_markup = {
        inline_keyboard: [
          [
            button,
            { text: '🆘 Yordam so\'rash', callback_data: `help_request:${projectId}` }
          ]
        ]
      };
    }

    await telegramRequest(botToken, payload);
  } catch (err) {
    // Never crash the process — just log
    console.error('[ErrorNotifier] Failed to send Telegram error notification:', err.message || err);
  }
}

module.exports = { sendTelegramError };
