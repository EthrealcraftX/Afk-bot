const context = require('./context');
const { getSession } = require('./session');
const { ensureTelegramAuth } = require('./auth');
const { sendMenu, handleHelp } = require('./handlers/menu');
const { registerGroupChat } = require('./group_store');

function initCommands() {
  const { bot } = context;

  bot.onText(/\/start/, async (msg) => {
    const chatId   = msg.chat.id;
    const chatType = msg.chat.type;

    // In groups: just register and silently ignore (no private menu)
    if (chatType === 'group' || chatType === 'supergroup') {
      registerGroupChat(chatId, msg.chat.title || String(chatId));
      return;
    }

    const sess = getSession(chatId);
    sess.state = null;
    sess.draft = {};

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
    const chatId   = msg.chat.id;
    const chatType = msg.chat.type;

    // Groups: ignore /menu
    if (chatType !== 'private') return;

    const sess = getSession(chatId);
    sess.state = null;
    sess.draft = {};

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

  bot.onText(/\/help/, (msg) => {
    // Groups: ignore /help
    if (msg.chat.type !== 'private') return;
    handleHelp(msg.chat.id, getSession(msg.chat.id));
  });
}

module.exports = initCommands;
