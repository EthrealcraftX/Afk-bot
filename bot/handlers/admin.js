const context = require('../context');
const api = require('../api');
const { knownChatIds, supportTickets, loadVersions, saveVersions, saveTickets, getOpenTicketCount } = require('../store');
const { sessions } = require('../session');
const { ensureTelegramAuth } = require('../auth');
const { kbAdminPanel, kbAdminBack, kbBroadcastConfirm, kbBack, kbCancelAdmin } = require('../keyboards');
const { esc, fmtTime } = require('../formatters');
const { editOrSend } = require('../ui');
const { ADMIN_USERNAME } = require('../config');

function isAdminUser(sess) {
  return sess.username === ADMIN_USERNAME;
}

async function handleAdminPanel(chatId, sess, msgId) {
  // Refresh token before admin operations
  await ensureTelegramAuth(chatId, sess);

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

async function handleAdminServers(chatId, sess, msgId) {
  // Refresh token before making API calls
  await ensureTelegramAuth(chatId, sess);

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

async function handleAdminUsers(chatId, sess, msgId) {
  await ensureTelegramAuth(chatId, sess);
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

async function startBroadcast(chatId, sess) {
  if (!isAdminUser(sess)) return;

  if (knownChatIds.size === 0) {
    await context.bot.sendMessage(chatId,
      `❌ *Xabar yuborish uchun foydalanuvchi yo'q*\n\n_Hali hech kim bot bilan muloqot qilmagan\\._`,
      { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
    );
    return;
  }

  sess.state = 'broadcast_text';
  sess.draft = {};

  const m = await context.bot.sendMessage(chatId,
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
      await context.bot.sendMessage(cid, broadcastMsg, { parse_mode: 'MarkdownV2' });
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

async function handleSupportList(chatId, sess, msgId) {
  await ensureTelegramAuth(chatId, sess);
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
  const m = await context.bot.sendMessage(chatId,
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
  saveTickets(); // persist reply to disk

  try {
    await context.bot.sendMessage(ticket.chatId,
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
  saveTickets(); // persist close to disk

  try {
    await context.bot.sendMessage(ticket.chatId,
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

async function handleAdminVersions(chatId, sess, msgId) {
  if (!isAdminUser(sess)) return handleAdminPanel(chatId, sess, msgId);
  sess.state = null;

  const text =
    `🛡 *Versiyalarni boshqarish*\n\n` +
    `Minecraft server turlaridan birini tanlang:`;

  const kb = {
    inline_keyboard: [
      [
        { text: '☕ Java Edition',    callback_data: 'admvers_list_java'    },
        { text: '🟩 Bedrock Edition', callback_data: 'admvers_list_bedrock' }
      ],
      [{ text: '🔙 Orqaga', callback_data: 'admin_panel' }]
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
  const m = await context.bot.sendMessage(chatId,
    `➕ *Yangi ${typeLabel} versiyasini qo'shish*\n\n` +
    `Qo'shmoqchi bo'lgan versiyani yuboring (Masalan: \`1.20.2\`):`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
  );
  sess.lastMsgId = m.message_id;
}

async function handleAddVersionInput(chatId, sess, text, type) {
  if (!isAdminUser(sess)) return;

  if (!/^\d+\.\d+(\.\d+)?$/.test(text)) {
    return context.bot.sendMessage(chatId,
      `❌ *Noto'g'ri format*\n\nVersiya \`1.20.1\` kabi formatda bo'lishi kerak. Qayta urinib ko'ring:`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancelAdmin() }
    );
  }

  const versions = loadVersions(type);
  if (versions.includes(text)) {
    sess.state = null;
    return context.bot.sendMessage(chatId,
      `⚠️ \`${esc(text)}\` versiyasi allaqachon mavjud!`,
      { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
    );
  }

  versions.unshift(text); // Add new version to the top
  saveVersions(type, versions);
  sess.state = null;

  await context.bot.sendMessage(chatId,
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
    return context.bot.sendMessage(chatId,
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

  await context.bot.sendMessage(chatId,
    `✅ *${typeLabel}* uchun \`${esc(version)}\` versiyasi muvaffaqiyatli o'chirildi!`,
    { parse_mode: 'MarkdownV2', reply_markup: kbAdminBack() }
  );
}

module.exports = {
  isAdminUser,
  handleAdminPanel,
  handleAdminServers,
  handleAdminUsers,
  startBroadcast,
  wizardBroadcastText,
  executeBroadcast,
  handleSupportList,
  handleTicketView,
  startTicketReply,
  wizardTicketReply,
  handleTicketClose,
  handleAdminVersions,
  handleAdminVersionList,
  startAddVersion,
  handleAddVersionInput,
  startDelVersion,
  executeDelVersion
};
