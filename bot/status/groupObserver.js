'use strict';

const { parseInput } = require('./parser');
const { detectAndPing } = require('./detector');
const { ServerRepository } = require('../db/serverRepository');
const { GroupSettingsRepository } = require('../db/groupSettingsRepository');
const { groupCooldown } = require('./groupCooldown');
const { getOrFetch, makeCacheKey, makeAternosCacheKey } = require('./smartCache');
const { formatStatus } = require('./handler');

const IP_DOMAIN_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?\b|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|aternos\.me)(?::\d{1,5})?\b|(?:https?:\/\/)?add\.aternos\.org\/[^\s]+|\b[a-zA-Z0-9-]+\.aternos\.me\b/ig;

const DEFAULT_COOLDOWN_MS = 45_000;

// In-memory cache tracking which bot reply message_id corresponds to each user message.
// Key: `${chatId}:${msgId}:${cacheKey}`
// Value: bot reply message_id
const replyCache = new Map();

// Prevent unbounded memory growth on very active bots
setInterval(() => {
  if (replyCache.size > 10000) {
    replyCache.clear();
  }
}, 3600_000).unref();

/**
 * Derives a canonical cache key from a parsed input object.
 * Mirrors the same logic used in handler.js so all three paths
 * (DM, group scan, background health check) share the same TTL cache.
 */
function deriveCacheKey(parsed) {
  if (parsed.type === 'url') {
    return makeAternosCacheKey(parsed.raw);
  }
  if (parsed.type === 'aternos_name' || parsed.type === 'aternos_domain') {
    return makeAternosCacheKey(parsed.serverName);
  }
  return makeCacheKey(parsed.host, parsed.port);
}

async function handleObserver(msg, bot) {
  const text = (msg.text || msg.caption || '').trim();
  if (!text) return;

  const matches = text.match(IP_DOMAIN_REGEX);
  if (!matches || matches.length === 0) return;

  const uniqueMatches = Array.from(new Set(matches.map((m) => m.toLowerCase())));

  const settings = await GroupSettingsRepository.getSettings(String(msg.chat.id));
  if (!settings.autoReplyEnabled) return;

  const chatId = msg.chat.id;
  const cooldownMs = settings.cooldownMs || DEFAULT_COOLDOWN_MS;

  for (const match of uniqueMatches) {
    try {
      const parsed = parseInput(match);
      const cacheKey = deriveCacheKey(parsed);

      if (groupCooldown.isOnCooldown(chatId, cacheKey, null, cooldownMs)) {
        continue;
      }

      // getOrFetch:
      //   - returns cached result if still fresh (same TTL as DM handler)
      //   - coalesces concurrent pings for the same server into one in-flight Promise
      //   - calls detectAndPing() only on a true cache miss
      const status = await getOrFetch(cacheKey, () => detectAndPing(parsed));

      if (!status) continue;

      groupCooldown.setCooldown(chatId, cacheKey, null, cooldownMs);

      if (status.online) {
        await ServerRepository.upsertServer(status, parsed);
      }

      const isAternos = parsed.type === 'url' || parsed.type === 'aternos_domain' || parsed.type === 'aternos_name';
      const sName = status.serverName || parsed.serverName;
      const kb = [];
      if (isAternos && sName) {
        kb.push([{ text: "🎮 Minecraft-ga qo'shish", url: `https://add.aternos.org/${encodeURIComponent(sName)}` }]);
      }

      const replyMsg = formatStatus(status);
      const replyKey = `${chatId}:${msg.message_id}:${cacheKey}`;
      const previousReplyId = replyCache.get(replyKey);

      const options = {
        parse_mode: 'MarkdownV2',
        reply_markup: kb.length > 0 ? { inline_keyboard: kb } : undefined,
      };

      if (previousReplyId) {
        // Edit existing reply instead of spamming a new message
        try {
          await bot.editMessageText(replyMsg, {
            ...options,
            chat_id: chatId,
            message_id: previousReplyId,
          });
        } catch (editErr) {
          // "message is not modified" is not a real error
          if (!editErr.message.includes('not modified')) {
            console.error('[Observer] editMessageText failed:', editErr.message);
          }
        }
      } else {
        // First time seeing this server in this message — send a new reply
        try {
          const sent = await bot.sendMessage(chatId, replyMsg, {
            ...options,
            reply_to_message_id: msg.message_id,
          });
          replyCache.set(replyKey, sent.message_id);
        } catch (sendErr) {
          console.error('[Observer] sendMessage failed:', sendErr.message);
        }
      }
    } catch (err) {
      // Silently absorb unexpected errors so one bad match doesn't kill the whole loop
    }
  }
}

module.exports = { handleObserver };
