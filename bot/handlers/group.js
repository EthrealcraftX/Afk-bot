/**
 * handlers/group.js — Group/Channel message handler
 *
 * Handles:
 *  1. Bot added/removed from group (my_chat_member) → register/unregister
 *  2. Keyword detection ("server", "server bormi", etc.) → reply with last server info
 */

const context = require('../context');
const { esc } = require('../formatters');
const { loadVersions } = require('../store');
const { registerGroupChat, removeGroupChat } = require('../group_store');
const { getLastServer, getAtErnosJoinUrl, getPlayerState, buildGroupServerCard } = require('../group_announce');

// Keywords that trigger server info reply
// Matches: server, Server, ser, Ser, server bormi, server bor, server ochilad, serverlar
const SERVER_KEYWORD_RE = /\bserver(lar|ga|ni|da|bor|mi|ochil)?\b|\bser\b/i;

/**
 * Called when bot is added to or removed from a group/channel.
 * @param {object} update - my_chat_member update
 */
async function handleMyChatMember(update) {
  const { bot } = context;
  const chat    = update.chat;
  const newMem  = update.new_chat_member;

  if (!newMem || !newMem.user || !newMem.user.is_bot) return;

  const status = newMem.status;

  if (status === 'member' || status === 'administrator') {
    registerGroupChat(chat.id, chat.title || chat.username || String(chat.id));
    // Send welcome announcement
    try {
      await bot.sendMessage(
        chat.id,
        `🤖 *MC\\-AFK Bot ulandi\\!*\n\n` +
        `Endi bu guruhda yangi server qo'shilganda e'lon ko'rasiz\\.\n` +
        `Guruhda *"server"* so'zini yozing — oxirgi server haqida ma'lumot beriladi\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (e) { /* ignore send errors */ }

  } else if (status === 'left' || status === 'kicked') {
    removeGroupChat(chat.id);
  }
}

/**
 * Called for every non-command message in a group/supergroup/channel.
 * Detects server-related keywords and replies with latest server info.
 * @param {object} msg - Telegram message object
 */
async function handleGroupMessage(msg) {
  const { bot } = context;
  const text    = (msg.text || '').trim();

  if (!SERVER_KEYWORD_RE.test(text)) return;

  const srv = getLastServer();
  if (!srv) return; // no server recorded yet, silently ignore

  const ps = getPlayerState(srv.projectId);
  const atErnosUrl = (srv.type === 'bedrock') ? getAtErnosJoinUrl(srv.host) : null;

  // Build inline keyboard
  const kbRows = [];

  // Web panel button (standard URL, since web_app buttons cannot be opened in groups)
/*   const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://afk.hypepath.uz';
  kbRows.push([{
    text: '🎮 Panelni ochish',
    url: `${API_URL}/create`
  }]); */

  // Aternos auto-join button (Bedrock only)
  if (atErnosUrl) {
    kbRows.push([{
      text: '🔗 Aternos-ga kirish (Bedrock)',
      url: atErnosUrl
    }]);
  }

  // Version selection label row
  kbRows.push([{ text: '📋 Versiya tanlang:', callback_data: 'gver_header' }]);

  const cardText =
    `📢 *Oxirgi server ma'lumotlari*\n\n` +
    buildGroupServerCard({ ...srv, status: 'running' }, ps, esc);

  try {
    await bot.sendMessage(msg.chat.id, cardText, {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: kbRows }
    });
  } catch (e) {
    console.error('[Group] Failed to send keyword reply:', e.message);
  }
}

module.exports = { handleMyChatMember, handleGroupMessage };
