const context = require('../context');
const store = require('../store');
const { saveTickets } = require('../store');
const { requireLogin } = require('../auth');
const { kbCancel, kbMain } = require('../keyboards');
const { esc } = require('../formatters');
const { editOrSend } = require('../ui');
const { ADMIN_USERNAME } = require('../config');

function isAdminUser(sess) {
  return sess.username === ADMIN_USERNAME;
}

async function startSupportMessage(chatId, sess) {
  if (!sess.token) return requireLogin(chatId, sess);

  sess.state = 'support_msg';
  sess.draft = {};

  const m = await context.bot.sendMessage(chatId,
    `💬 *Yordam so'rash*\n\n` +
    `Quyida xabaringizni yozing, admin jamoamiz imkon qadar tez javob beradi\\.\n\n` +
    `_Muammongizni batafsil tushuntiring:_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardSupportMsg(chatId, sess, text) {
  sess.state = null;

  store.ticketCounter = store.ticketCounter + 1;
  const ticketId = store.ticketCounter;

  const ticket = {
    id:        ticketId,
    chatId,
    username:  sess.username,
    message:   text,
    timestamp: new Date(),
    closed:    false,
    replied:   false,
    replyText: null,
    replyAt:   null
  };
  store.supportTickets.push(ticket);
  saveTickets(); // persist to disk immediately

  const confirmText =
    `✅ *Yordam so'rovi yaratildi\\!*\n\n` +
    `🎫 Ticket \\#${esc(ticket.id)}\n` +
    `📝 "${esc(text.slice(0, 100))}${text.length > 100 ? '\\.\\.\\.' : ''}"\n\n` +
    `_Admin jamoamiz tez orada javob beradi\\. Bu yerda bildirishnoma olasiz\\._`;

  sess.lastMsgId = await editOrSend(chatId, null, confirmText, kbMain(true, isAdminUser(sess)));

  // Notify admin if they're tracked
  const adminChatId = store.usernameToChatId.get(ADMIN_USERNAME);
  if (adminChatId && adminChatId !== chatId) {
    try {
      await context.bot.sendMessage(adminChatId,
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

module.exports = {
  startSupportMessage,
  wizardSupportMsg
};
