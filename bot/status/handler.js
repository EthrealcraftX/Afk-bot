'use strict';

/**
 * handler.js
 *
 * Implements the core status checking process and message dispatch for
 * the integrated main bot status submodule.
 */

const { parseInput }    = require('./parser');
const { detectAndPing } = require('./detector');
const { getOrFetch, makeCacheKey, makeAternosCacheKey } = require('./smartCache');
const { enqueue }       = require('./requestQueue');
const { isAllowed, recordSuccess, recordFailure, getRemainingCooldownSeconds }
  = require('./circuitBreaker');
const { getLogger }     = require('./logger');

const log = getLogger('handler');

const MIN_LEN = 3;
const MAX_LEN = 255;
const VALID_INPUT_RE = /^[a-zA-Z0-9.\-:/_@?=&%#+]+$/;

function validateInput(raw) {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_LEN) return `❌ Manzil juda qisqa (kamida ${MIN_LEN} ta belgi).`;
  if (trimmed.length > MAX_LEN) return `❌ Manzil juda uzun (ko'pi bilan ${MAX_LEN} ta belgi).`;
  if (!VALID_INPUT_RE.test(trimmed)) return '❌ Manzilda noto\'g\'ri belgilar mavjud.';
  return null;
}

function truncateMotd(motd) {
  if (!motd) return '—';
  const clean = motd.replace(/\n/g, ' ').trim();
  return clean.length > 80 ? clean.slice(0, 77) + '…' : clean;
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function formatStatus(status, fromCache = false, cachedAgoMs = 0) {
  if (status.isPlaceholder) {
    const lines = [
      `🟡 *Aternos Placeholder*`,
      `━━━━━━━━━━━━━━━━━━`,
      `Server is responding,`,
      `but the Minecraft world is not yet available\\.`,
      ``,
      `*Status:* Starting / Offline`,
    ];
    if (fromCache) lines.push(`\n📦 _Keshlangan \\(${Math.round(cachedAgoMs / 1000)}s oldin\\)_`);
    return lines.join('\n');
  }

  if (!status.online) {
    const lines = [
      `🔴 *Server — Offline*`,
      `━━━━━━━━━━━━━━━━━━`,
    ];
    if (status.serverName) lines.push(`🏷 *Nomi:* ${esc(status.serverName)}`);
    lines.push(`🌐 *Manzil:* \`${esc(status.host)}${status.port ? ':' + status.port : ''}\``);
    if (status.error)  lines.push(`❌ *Sabab:* ${esc(status.error)}`);
    if (fromCache) lines.push(`\n📦 _Keshlangan \\(${Math.round(cachedAgoMs / 1000)}s oldin\\)_`);
    return lines.join('\n');
  }

  if (status.edition === 'java') {
    const lines = [
      `🟢 *Java Server — Online*`,
      `━━━━━━━━━━━━━━━━━━━━━━━`,
    ];
    if (status.serverName) lines.push(`🏷 *Nomi:* ${esc(status.serverName)}`);
    lines.push(`🌐 *Manzil:* \`${esc(status.host)}:${esc(String(status.port))}\``);
    lines.push(`🏷 *Versiya:* ${esc(status.version)} \\(Protocol ${esc(String(status.protocol))}\\)`);
    lines.push(`👥 *O'yinchilar:* ${esc(String(status.players))} / ${esc(String(status.maxPlayers))}`);
    if (status.software) lines.push(`🔧 *Dastur:* ${esc(status.software)}`);
    lines.push(`📡 *Ping:* ${esc(String(status.latencyMs))}ms`);
    lines.push(`📋 *MOTD:* ${esc(truncateMotd(status.motd))}`);
    if (fromCache) lines.push(`\n📦 _Keshlangan \\(${Math.round(cachedAgoMs / 1000)}s oldin\\)_`);
    return lines.join('\n');
  }

  if (status.edition === 'bedrock') {
    const lines = [
      `🟢 *Bedrock Server — Online*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ];
    if (status.serverName) lines.push(`🏷 *Nomi:* ${esc(status.serverName)}`);
    lines.push(`🌐 *Manzil:* \`${esc(status.host)}:${esc(String(status.port))}\``);
    lines.push(`🏷 *Versiya:* ${esc(status.version)} \\(Protocol ${esc(String(status.protocol))}\\)`);
    lines.push(`👥 *O'yinchilar:* ${esc(String(status.players))} / ${esc(String(status.maxPlayers))}`);
    if (status.gameMode) lines.push(`🎮 *O'yin turi:* ${esc(status.gameMode)}`);
    lines.push(`📡 *Ping:* ${esc(String(status.latencyMs))}ms`);
    lines.push(`📋 *MOTD:* ${esc(truncateMotd(status.motd))}`);
    if (fromCache) lines.push(`\n📦 _Keshlangan \\(${Math.round(cachedAgoMs / 1000)}s oldin\\)_`);
    return lines.join('\n');
  }

  return '❓ *Noma\'lum server holati*';
}

function buildCacheKey(parsed) {
  if (parsed.type === 'url') {
    return makeAternosCacheKey(parsed.raw);
  }
  if (parsed.type === 'aternos_name' || parsed.type === 'aternos_domain') {
    return makeAternosCacheKey(parsed.serverName);
  }
  return makeCacheKey(parsed.host, parsed.port);
}

function buildBreakerKey(parsed) {
  if (parsed.type === 'url') return `url:${parsed.raw}`;
  if (parsed.serverName) return `aternos:${parsed.serverName.toLowerCase()}`;
  return `${(parsed.host || '').toLowerCase()}:${parsed.port || 'auto'}`;
}

/**
 * Checks if the text message represents a Minecraft server address.
 * Matches URL formats, domains/ips with dots, or explicit port specifications.
 * Excludes single normal letters/greetings.
 */
function isServerAddress(text) {
  const clean = text.trim();
  if (clean.startsWith('/')) return false;
  return clean.includes('.') || clean.includes('/') || clean.includes(':');
}

/**
 * Handle incoming user server status checking requests.
 *
 * @param {object} bot - The main telegram-bot-api instance
 * @param {number} chatId - User chat ID
 * @param {string} rawInput - Address input string
 */
async function handleStatusCheck(bot, chatId, rawInput) {
  log.info(`Incoming status check request from chat ${chatId}: "${rawInput}"`);

  const validationError = validateInput(rawInput);
  if (validationError) {
    return bot.sendMessage(chatId, validationError).catch(() => {});
  }

  let placeholder;
  try {
    placeholder = await bot.sendMessage(chatId, '⏳ Server tekshirilmoqda...');
  } catch (err) {
    return;
  }

  const editMsg = async (text, keyboard = undefined) => {
    const opts = {
      chat_id:    chatId,
      message_id: placeholder.message_id,
      parse_mode: 'MarkdownV2'
    };
    if (keyboard) {
      opts.reply_markup = keyboard;
    }
    try {
      await bot.editMessageText(text, opts);
    } catch (_) {
      try {
        const sendOpts = { parse_mode: 'MarkdownV2' };
        if (keyboard) {
          sendOpts.reply_markup = keyboard;
        }
        await bot.sendMessage(chatId, text, sendOpts);
      } catch (_) {}
    }
  };

  let parsed;
  try {
    parsed = parseInput(rawInput);
  } catch (err) {
    return editMsg(`❌ Manzilni o'qib bo'lmadi: ${err.message}`);
  }

  const cacheKey   = buildCacheKey(parsed);
  const breakerKey = buildBreakerKey(parsed);

  if (!isAllowed(breakerKey)) {
    const remaining = getRemainingCooldownSeconds(breakerKey);
    return editMsg(
      `🚫 *Bu server hozirda blokda*\n\n` +
      `Server ketma\\-ket tekshirildi va javob bermadi\\.\n` +
      `Qayta tekshirish ${remaining > 0 ? `\\~${remaining}s dan keyin` : 'tez orada'} mumkin bo'ladi\\.`
    );
  }

  const cachedAt = Date.now();
  let   status;
  let   fromCache = false;

  try {
    const cached = require('./smartCache').getCached(cacheKey);
    if (cached) {
      fromCache = true;
      status = cached;
    } else {
      status = await enqueue(() =>
        getOrFetch(cacheKey, () => detectAndPing(parsed))
      );
    }
  } catch (err) {
    return editMsg(`❌ Server tekshirishda xato yuz berdi:\n\`${err.message}\``);
  }

  if (status.online) {
    recordSuccess(breakerKey);
  } else {
    recordFailure(breakerKey);
  }

  const cachedAgoMs = fromCache ? (Date.now() - cachedAt) : 0;
  const text = formatStatus(status, fromCache, cachedAgoMs);

  let keyboard;
  if (status.edition === 'bedrock' || status.serverName) {
    const sName = status.serverName || parsed.serverName;
    if (sName) {
      keyboard = {
        inline_keyboard: [
          [
            {
              text: '🎮 Minecraft-ga qo\'shish',
              url: `https://add.aternos.org/${encodeURIComponent(sName)}`
            }
          ]
        ]
      };
    }
  }

  return editMsg(text, keyboard);
}

module.exports = { isServerAddress, handleStatusCheck, formatStatus };
