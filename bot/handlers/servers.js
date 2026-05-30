const api = require('../api');
const { requireLogin } = require('../auth');
const { kbServer, kbBack, kbDeleteConfirm } = require('../keyboards');
const { esc, fmtShortId, fmtTime, fmtUptime } = require('../formatters');
const { editOrSend, buildServerCard } = require('../ui');

async function handleListServers(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', '/projects', null, sess.token);

  if (!result.success) {
    const text = `❌ *Serverlarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kbBack('menu'));
  }

  const projects = result.projects || {};
  const ids      = Object.keys(projects);

  if (ids.length === 0) {
    const text =
      `📋 *Serverlarim*\n\n` +
      `_Hozircha serveringiz yo'q\\._\n\n` +
      `➕ *Server qo'shish* tugmasini bosib birinchi AFK botingizni yarating\\.`;
    return editOrSend(chatId, msgId, text, {
      inline_keyboard: [
        [{ text: '➕  Server qo\'shish', callback_data: 'create_server' }],
        [{ text: '🏠  Asosiy menyu',     callback_data: 'menu'          }]
      ]
    });
  }

  let running = 0, stopped = 0;
  ids.forEach(id => projects[id].status === 'running' ? running++ : stopped++);

  let text =
    `📋 *Serverlarim* — ${esc(ids.length)} ta\n` +
    `🟢 ${esc(running)} ishlayapti  •  🔴 ${esc(stopped)} to'xtatilgan\n\n` +
    `_Boshqarish uchun serverga bosing:_\n`;

  const rows = ids.map(id => {
    const s = projects[id];
    const statusIcon = s.status === 'running' ? '🟢' : '🔴';
    const typeIcon   = s.type   === 'java'    ? '☕'  : '🟩';
    const shortId    = fmtShortId(id);
    return [{
      text: `${statusIcon} ${typeIcon} ${s.host}:${s.port} [${shortId}]`,
      callback_data: `srvinfo_${id}`
    }];
  });

  rows.push([
    { text: '➕  Server qo\'shish', callback_data: 'create_server' },
    { text: '🏠  Asosiy menyu',      callback_data: 'menu'          }
  ]);

  sess.lastMsgId = await editOrSend(chatId, msgId, text, { inline_keyboard: rows });
}

async function handleServerInfo(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', `/projects/${projectId}/status`, null, sess.token);

  if (!result.success) {
    const text = `❌ *Server topilmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kbBack('servers'));
  }

  const d = result.details;
  const text =
    `🖥 *Server ma'lumotlari*\n\n` +
    buildServerCard(projectId, d, d.uptime) + `\n\n` +
    `_Quyidan amalni tanlang:_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbServer(projectId, d.status));
}

async function handleServerAction(chatId, sess, msgId, projectId, action) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const actionLabel = action === 'start' ? 'Ishga tushirilmoqda' : 'To\'xtatilmoqda';
  await editOrSend(chatId, msgId,
    `⏳ *${esc(actionLabel)}\\.\\.\\.*\n\n\`${esc(projectId)}\``,
    { inline_keyboard: [] }
  );

  const result = await api('POST', `/projects/${projectId}/${action}`, null, sess.token);

  if (result.success) {
    // Refresh to update status
    await handleServerInfo(chatId, sess, msgId, projectId);
  } else {
    const text =
      `❌ *Server ${esc(action === 'start' ? 'ishga tushmadi' : 'to\'xtamadi')}*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbServer(projectId, action === 'start' ? 'stopped' : 'running'));
  }
}

async function handleDeleteConfirm(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const text =
    `⚠️ *O'chirishni tasdiqlang*\n\n` +
    `Ushbu serverni *butunlay o'chirmoqchimisiz*?\n\n` +
    `\`${esc(projectId)}\`\n\n` +
    `_Bu amalni bekor qilib bo'lmaydi\\!_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kbDeleteConfirm(projectId));
}

async function handleDeleteExecute(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `🗑 *Server o'chirilmoqda\\.\\.\\.*\n\n\`${esc(projectId)}\``,
    { inline_keyboard: [] }
  );

  const result = await api('DELETE', `/projects/${projectId}`, null, sess.token);

  if (result.success) {
    const text =
      `` +
      `✅ *Server muvaffaqiyatli o'chirildi\\.*\n\n` +
      `\`${esc(projectId)}\`\n\n` +
      `_U hisobingizdan olib tashlandi\\._`;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbBack('servers'));
  } else {
    const text =
      `❌ *Serverni o'chirib bo'lmadi*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    sess.lastMsgId = await editOrSend(chatId, msgId, text, kbBack('servers'));
  }
}

async function handleServerLogs(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `📄 *Loglar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', `/projects/${projectId}/logs?lines=30`, null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Loglarni yangilash', callback_data: `srvlogs_${projectId}`   },
        { text: '📋  Hodisalar',           callback_data: `srvevents_${projectId}` }
      ],
      [{ text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Loglarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawLog = (result.log || '').trim();
  if (!rawLog) {
    const text = `📄 *Loglar*\n\nID: \`${esc(projectId)}\`\n\n_Hozircha log yo'q — server ishlamayotgan bo'lishi mumkin\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const lines = rawLog.split('\n').slice(-20).map(l => {
    const clean = l.replace(/\[.*?\]\s*/g, '').trim().slice(0, 120);
    return esc(clean);
  }).filter(Boolean);

  const text =
    `📄 *Loglar* — so'nggi ${esc(lines.length)} ta qator\n` +
    `\`${esc(projectId)}\`\n\n` +
    `\`\`\`\n${lines.join('\n')}\n\`\`\``;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleServerEvents(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `📋 *Hodisalar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', `/projects/${projectId}/events?lines=30`, null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Hodisalarni yangilash', callback_data: `srvevents_${projectId}` },
        { text: '📄  Loglar',                callback_data: `srvlogs_${projectId}`   }
      ],
      [{ text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Hodisalarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawEvents = (result.events || '').trim();
  if (!rawEvents) {
    const text = `📋 *Hodisalar*\n\nID: \`${esc(projectId)}\`\n\n_Hozircha hodisalar yo'q\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const lines = rawEvents.split('\n').slice(-20).map(l => {
    const clean = l.replace(/\[.*?\]\s*/g, '').trim().slice(0, 120);
    return esc(clean);
  }).filter(Boolean);

  const text =
    `📋 *Hodisalar* — so'nggi ${esc(lines.length)} ta qator\n` +
    `\`${esc(projectId)}\`\n\n` +
    `\`\`\`\n${lines.join('\n')}\n\`\`\``;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleAllEvents(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `🔔 *Barcha hodisalar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', '/events?lines=40', null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Yangilash',     callback_data: 'all_events'   },
        { text: '📋  Serverlarim',   callback_data: 'list_servers' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Hodisalarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const rawEvents = (result.events || '').trim();
  if (!rawEvents) {
    const text = `🔔 *So'nggi hodisalar*\n\n_Serverlaringizdagi hodisalar hozircha yo'q\\._`;
    return editOrSend(chatId, msgId, text, kb);
  }

  const lines = rawEvents.split('\n')
    .filter(Boolean)
    .slice(-20)
    .map(l => {
      const clean = l.trim().slice(0, 120);
      const icon  = /start|join/i.test(clean)       ? '🟢' :
                    /stop|exit/i.test(clean)          ? '🔴' :
                    /restart|reconnect/i.test(clean)  ? '🔄' :
                    /creat|add/i.test(clean)          ? '✨' : '📌';
      return `${icon} ${esc(clean)}`;
    });

  const text =
    `🔔 *So'nggi hodisalar — Barcha serverlar*\n\n` +
    lines.join('\n');

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleStats(chatId, sess, msgId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  const result = await api('GET', '/projects', null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  Yangilash',   callback_data: 'stats'        },
        { text: '📋  Serverlarim', callback_data: 'list_servers' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };

  if (!result.success) {
    const text = `❌ *Statistikani yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const projects = result.projects || {};
  const ids      = Object.keys(projects);
  const total    = ids.length;
  const maxProj  = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3;
  let running = 0, stopped = 0, java = 0, bedrock = 0;

  ids.forEach(id => {
    const s = projects[id];
    if (s.status === 'running') running++; else stopped++;
    if (s.type   === 'java')    java++;    else bedrock++;
  });

  const bar = (n, max, char = '█') => {
    const filled = Math.round((n / max) * 10) || 0;
    return char.repeat(filled) + '░'.repeat(10 - filled);
  };

  const text =
    `📊 *Statistika*\n` +
    `👤 *${esc(sess.username)}*\n\n` +
    `┌─────────────────────────────\n` +
    `│ 🖥  Jami serverlar:   *${esc(total)}* \\/ ${esc(maxProj)}\n` +
    `│     \`${esc(bar(total, maxProj))}\`\n` +
    `├─────────────────────────────\n` +
    `│ 🟢  Ishlayapti:  *${esc(running)}*\n` +
    `│ 🔴  To'xtatilgan: *${esc(stopped)}*\n` +
    `├─────────────────────────────\n` +
    `│ ☕  Java:     *${esc(java)}*\n` +
    `│ 🟩  Bedrock:  *${esc(bedrock)}*\n` +
    `└─────────────────────────────\n\n` +
    `_Yangilangan: ${esc(new Date().toLocaleTimeString())}_`;

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

async function handleServerPlayers(chatId, sess, msgId, projectId) {
  if (!sess.token) return requireLogin(chatId, sess, msgId);

  await editOrSend(chatId, msgId,
    `👥 *O'yinchilar yuklanmoqda\\.\\.\\.*`,
    { inline_keyboard: [] }
  );

  const result = await api('GET', `/projects/${projectId}/players`, null, sess.token);

  const kb = {
    inline_keyboard: [
      [
        { text: '🔄  O\'yinchilarni yangilash', callback_data: `srvplayers_${projectId}` }
      ],
      [{ text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }]
    ]
  };

  if (!result.success) {
    const text = `❌ *O'yinchilarni yuklab bo'lmadi*\n\n\`${esc(result.error)}\``;
    return editOrSend(chatId, msgId, text, kb);
  }

  const count = result.count || 0;
  const players = result.players || [];

  let text;
  if (count === 0) {
    text = `👥 *Onlayn o'yinchilar*\n\nID: \`${esc(projectId)}\`\n\nHozircha serverda hech kim yo'q\\.`;
  } else {
    const playerNames = players.map(p => `• \`${esc(p)}\``).join('\n');
    text = `👥 *Onlayn o'yinchilar* \\(${esc(String(count))}\\)\n\nID: \`${esc(projectId)}\`\n\n${playerNames}`;
  }

  sess.lastMsgId = await editOrSend(chatId, msgId, text, kb);
}

module.exports = {
  handleListServers,
  handleServerInfo,
  handleServerAction,
  handleDeleteConfirm,
  handleDeleteExecute,
  handleServerLogs,
  handleServerEvents,
  handleAllEvents,
  handleStats,
  handleServerPlayers
};
