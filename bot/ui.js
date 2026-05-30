const context = require('./context');
const { fmtType, fmtStatus, fmtUptime, esc } = require('./formatters');

async function editOrSend(chatId, msgId, text, keyboard) {
  try {
    if (msgId) {
      await context.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });
      return msgId;
    }
  } catch (_) { /* fall through to send */ }
  const m = await context.bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboard
  });
  return m.message_id;
}

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

module.exports = {
  editOrSend,
  buildServerCard
};
