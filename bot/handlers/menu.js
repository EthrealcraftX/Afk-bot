const context = require('../context');
const { ensureTelegramAuth } = require('../auth');
const { trackUser } = require('../store');
const { ADMIN_USERNAME, DEFAULT_MAX_PROJECTS } = require('../config');
const { kbMain, kbBack } = require('../keyboards');
const { esc } = require('../formatters');
const { editOrSend } = require('../ui');

function isAdminUser(sess) {
  return sess.username === ADMIN_USERNAME;
}

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

  const msg = await context.bot.sendMessage(chatId, header, {
    parse_mode: 'MarkdownV2',
    reply_markup: kbMain(true, admin)
  });
  sess.lastMsgId = msg.message_id;
  return msg;
}

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
    `➕ Yangi server bot yaratish \\(maksimal ${esc(DEFAULT_MAX_PROJECTS)} ta\\)\n` +
    `▶️ Ishga tushirish  ⏹ To'xtatish — bir bosish bilan\n` +
    `📄 Bot jarayonidan loglarni ko'rish\n` +
    `📋 Hayot sikli hodisalarini ko'rish\n` +
    `💬 Admin bilan bog'lanish\n` +
    `🔔 Barcha serverlaringizdagi so'nggi hodisalar\n\n` +
    `_MC\\-AFK Panel API tomonidan quvvatlanadi_`;

  const kb = {
    inline_keyboard: [
      [{ text: '📹 Video yordam', callback_data: 'send_help_video' }],
      [{ text: '🏠 Asosiy menyu', callback_data: 'menu' }]
    ]
  };
  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleLogout(chatId, sess, msgId) {
  sess.token    = null;
  sess.username = null;
  sess.state    = null;
  sess.draft    = {};
  const text = `✅ *Logged out successfully\\.*\n\n_See you next time\\!_`;
  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbMain(false));
}

module.exports = {
  isAdminUser,
  sendMenu,
  handleMenu,
  handleHelp,
  handleLogout
};
