const context = require('../context');
const api = require('../api');
const { kbCancel, kbServerType, kbVersions, kbServer, kbBack } = require('../keyboards');
const { esc } = require('../formatters');

/**
 * Version aliases: maps a selected version string to the canonical version
 * that the bot engine actually supports.
 *
 * Example:
 *   "1.17.41" is a minor Bedrock patch but the bot library uses "1.17.40"
 *   as the protocol version name — so both are stored as "1.17.40".
 *
 * Add more entries here as needed.
 */
const VERSION_ALIASES = {
  // ==================== BEDROCK ====================
 
  // 1.16.x
  '1.16.0':   '1.16.201',
  '1.16.1':   '1.16.201',
  '1.16.10':  '1.16.201',
  '1.16.20':  '1.16.201',
  '1.16.40':  '1.16.201',
  '1.16.100': '1.16.201',
  '1.16.101': '1.16.201',
  '1.16.200': '1.16.201',
  '1.16.221': '1.16.220',
 
  // 1.17.x
  '1.17.1':  '1.17.0',
  '1.17.2':  '1.17.0',
  '1.17.11': '1.17.10',
  '1.17.31': '1.17.30',
  '1.17.32': '1.17.30',
  '1.17.33': '1.17.30',
  '1.17.34': '1.17.40',
  '1.17.41': '1.17.40',
 
  // 1.18.x
  '1.18.1':  '1.18.0',
  '1.18.2':  '1.18.0',
  '1.18.10': '1.18.11',
  '1.18.12': '1.18.11',
  '1.18.31': '1.18.30',
  '1.18.32': '1.18.30',
  '1.18.33': '1.18.30',
 
  // 1.19.x
  '1.19.0':  '1.19.1',
  '1.19.2':  '1.19.1',
  '1.19.11': '1.19.10',
  '1.19.22': '1.19.21',
  '1.19.31': '1.19.30',
  '1.19.51': '1.19.50',
  '1.19.52': '1.19.50',
  '1.19.61': '1.19.60',
  '1.19.71': '1.19.70',
  '1.19.72': '1.19.70',
  '1.19.73': '1.19.70',
  '1.19.81': '1.19.80',
  '1.19.83': '1.19.80',
 
  // 1.20.x
  '1.20.1':  '1.20.0',
  '1.20.11': '1.20.10',
  '1.20.12': '1.20.10',
  '1.20.13': '1.20.10',
  '1.20.14': '1.20.10',
  '1.20.15': '1.20.10',
  '1.20.31': '1.20.30',
  '1.20.32': '1.20.30',
  '1.20.41': '1.20.40',
  '1.20.51': '1.20.50',
  '1.20.60': '1.20.61',
  '1.20.62': '1.20.61',
  '1.20.70': '1.20.71',
  '1.20.72': '1.20.71',
  '1.20.73': '1.20.71',
  '1.20.81': '1.20.80',
 
  // 1.21.x
  '1.21.1':   '1.21.0',
  '1.21.3':   '1.21.2',
  '1.21.20':  '1.21.21',
  '1.21.22':  '1.21.21',
  '1.21.23':  '1.21.21',
  '1.21.31':  '1.21.30',
  '1.21.40':  '1.21.42',
  '1.21.41':  '1.21.42',
  '1.21.43':  '1.21.42',
  '1.21.44':  '1.21.42',
  '1.21.51':  '1.21.50',
  '1.21.61':  '1.21.60',
  '1.21.62':  '1.21.60',
  '1.21.71':  '1.21.70',
  '1.21.72':  '1.21.70',
  '1.21.73':  '1.21.70',
  '1.21.81':  '1.21.80',
  '1.21.82':  '1.21.80',
  '1.21.83':  '1.21.80',
  '1.21.84':  '1.21.80',
  '1.21.91':  '1.21.90',
  '1.21.92':  '1.21.90',
  '1.21.94':  '1.21.93',
  '1.21.95':  '1.21.93',
  '1.21.101': '1.21.100',
  '1.21.102': '1.21.100',
  '1.21.112': '1.21.111',
  '1.21.113': '1.21.111',
  '1.21.114': '1.21.111',
  '1.21.121': '1.21.120',
  '1.21.122': '1.21.120',
  '1.21.123': '1.21.120',
  '1.21.131': '1.21.130',
  '1.21.132': '1.21.130',
 
  // 26.x
  '26.1':  '1.26.0',
  '26.2':  '1.26.0',
  '26.3':  '1.26.0',
  '26.11': '1.26.10',
  '26.12': '1.26.10',
  '26.13': '1.26.10',
  '26.14': '1.26.10',
  '26.21': '1.26.20',
 
  // ==================== JAVA ====================
  // 1.8.x
  '1.8.1': '1.8',
  '1.8.2': '1.8',
  '1.8.3': '1.8',
  '1.8.4': '1.8',
  '1.8.5': '1.8',
  '1.8.6': '1.8',
  '1.8.7': '1.8',
  '1.8.8': '1.8',
  '1.8.9': '1.8',
 
  // 1.9.x
  '1.9.1': '1.9',
  '1.9.2': '1.9',
  '1.9.3': '1.9',
  '1.9.4': '1.9',
 
  // 1.10.x
  '1.10.1': '1.10',
  '1.10.2': '1.10',
 
  // 1.11.x
  '1.11.1': '1.11',
  '1.11.2': '1.11',
 
  // 1.12.x
  '1.12.1': '1.12',
  '1.12.2': '1.12',
 
  // 1.13.x
  '1.13.1': '1.13',
  '1.13.2': '1.13',
 
  // 1.14.x
  '1.14.1': '1.14',
  '1.14.2': '1.14',
  '1.14.3': '1.14',
  '1.14.4': '1.14',
 
  // 1.15.x
  '1.15.1': '1.15',
  '1.15.2': '1.15',
 
  // 1.16.x
  '1.16.1': '1.16',
  '1.16.2': '1.16',
  '1.16.3': '1.16',
  '1.16.4': '1.16',
  '1.16.5': '1.16',
 
  // 1.17.x
  '1.17.1': '1.17',
 
  // 1.18.x
  '1.18.1': '1.18',
  '1.18.2': '1.18',
 
  // 1.19.x
  '1.19.1': '1.19',
  '1.19.2': '1.19',
  '1.19.3': '1.19',
  '1.19.4': '1.19',
 
  // 1.20.x
  '1.20.1': '1.20',
  '1.20.2': '1.20',
  '1.20.3': '1.20',
  '1.20.4': '1.20',
  '1.20.5': '1.20',
  '1.20.6': '1.20',
 
  // 1.21.x
  '1.21.1': '1.21',
  '1.21.2': '1.21',
  '1.21.3': '1.21',
  '1.21.4': '1.21',
  '1.21.5': '1.21',
  '1.21.6': '1.21',
  '1.21.7': '1.21',
  '1.21.8': '1.21',
  '1.21.10': '1.21.9',
  '1.21.11': '1.21.11',
};

async function startCreate(chatId, sess) {
  if (!sess.token) {
    await context.bot.sendMessage(chatId,
      `🔒 *Tizimga kirish talab etiladi*\n\n` +
      `Server yaratish uchun tizimga kirishingiz kerak\\.\n Qayta /start bosing yoki quyidagi tugma orqali botni qayta ishga tushiring:\n`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄  Botni qayta ishga tushirish', url: 'https://t.me/AvtoServerBot/?start=1' }],
            [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
          ]
        }
      }
    );
    return;
  }

  const kb = {
    inline_keyboard: [
      [
        {
          text: "📱 Mini ilovada ochish",
          web_app: {
            url: `https://afk.hypepath.uz/create?token=${encodeURIComponent(sess.token)}`
          }
        }
      ],
      [
        {
          text: "🔙 Orqaga",
          callback_data: "menu"
        }
      ]
    ]
  };

  const text = `➕ *Yangi server qo'shish*\n\n` +
    `Serverni qulay interfeysli *Mini Ilova \\(Web App\\)* orqali tezda qo'shishingiz yoki botning o'zida *Wizard \\(qadamma\\-qadam chat\\)* orqali qo'shishingiz mumkin:`;

  const m = await context.bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: kb
  });
  sess.lastMsgId = m.message_id;
}

async function startCreateWizard(chatId, sess) {
  if (!sess.token) {
    await context.bot.sendMessage(chatId,
      `🔒 *Tizimga kirish talab etiladi*\n\n` +
      `Server yaratish uchun tizimga kirishingiz kerak\\.\n Qayta /start bosing yoki quyidagi tugma orqali botni qayta ishga tushiring:\n`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄  Botni qayta ishga tushirish', url: 'https://t.me/AvtoServerBot/?start=1' }],
            [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
          ]
        }
      }
    );
    return;
  }

  sess.state = 'create_ip';
  sess.draft = {};

  const m = await context.bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 1\\-qadam / 4\n\n` +
    `🌐 Minecraft server *IP manzili yoki hostnameni* kiriting:\n\n` +
    `_Misol: \`Server\\.aternos\\.me\` yoki \`192\\.168\\.1\\.1\`_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
  sess.lastMsgId = m.message_id;
}

async function wizardCreateIp(chatId, sess, text) {
  if (!/^[a-zA-Z0-9.\-_]{1,253}$/.test(text)) {
    return context.bot.sendMessage(chatId,
      `❌ *Noto'g'ri hostname*\n\nIltimos to'g'ri IP yoki domen kiriting \\(bo'sh joy bo'lmasin\\)\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
    );
  }
  sess.draft.ip = text;
  sess.state = 'create_port';

  await context.bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 2\\-qadam / 4\n\n` +
    `🔌 Server *portini* kiriting:\n\n` +
    `_Java uchun: \`25565\`  •  Bedrock uchun: \`19132\`_`,
    { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
  );
}

async function wizardCreatePort(chatId, sess, text) {
  const port = parseInt(text);
  if (isNaN(port) || port < 1 || port > 65535) {
    return context.bot.sendMessage(chatId,
      `❌ *Noto'g'ri port*\n\nPort 1 dan 65535 gacha bo'lgan son bo'lishi kerak\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: kbCancel() }
    );
  }
  sess.draft.port = port;
  sess.state = 'create_type';

  await context.bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 3\\-qadam / 4\n\n` +
    `🎮 Server *turini* tanlang:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbServerType() }
  );
}

async function wizardCreateVersion(chatId, sess, text) {
  return context.bot.sendMessage(chatId,
    `⚠️ *Iltimos, quyidagi ro'yxatdan birorta versiyani tanlang\\!*`,
    { parse_mode: 'MarkdownV2', reply_markup: kbVersions(sess.draft.type) }
  );
}

async function handleSetType(chatId, sess, type) {
  if (!['java', 'bedrock'].includes(type)) return;
  if (sess.state !== 'create_type') return;

  sess.draft.type = type;
  sess.state = 'create_version';

  const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
  await context.bot.sendMessage(chatId,
    `➕ *Yangi server qo'shish* — 4\\-qadam / 4\n\n` +
    `🏷 *${typeLabel}* uchun Minecraft *versiyasini* tanlang:`,
    { parse_mode: 'MarkdownV2', reply_markup: kbVersions(type) }
  );
}

async function handleSetVersion(chatId, sess, msgId, version) {
  if (sess.state !== 'create_version') return;

  // Normalize: if user selected an alias version, map it to the canonical one
  const canonical = VERSION_ALIASES[version] || version;
  const wasNormalized = canonical !== version;

  sess.draft.version = canonical;
  sess.state = null;

  const { ip, port, type } = sess.draft;
  const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';

  // Build the version display line — show mapping note if version was aliased
  const bt = '`'; // backtick helper to avoid template literal conflicts
  const versionDisplay = wasNormalized
    ? bt + esc(canonical) + bt + ' _(' + esc(version) + ' \u2192 ' + esc(canonical) + ')_'
    : bt + esc(canonical) + bt;

  await context.bot.sendMessage(chatId,
    `⏳ *Server yaratilmoqda\\.\\.\\.*\n\n` +
    `🌐 Host: \`${esc(ip)}:${esc(String(port))}\`\n` +
    `🏷 Versiya: ${versionDisplay}\n` +
    `🎮 Tur: ${esc(typeLabel)}`,
    { parse_mode: 'MarkdownV2' }
  );

  const result = await api('POST', '/projects', {
    ip, port, version: canonical, type
  }, sess.token);

  if (result.success) {
    const text =
      `✅ *Server muvaffaqiyatli yaratildi\\!*\n\n` +
      `🆔 ID: \`${esc(result.projectId)}\`\n` +
      `🌐 \`${esc(ip)}:${esc(String(port))}\`\n` +
      `🏷 Versiya: \`${esc(canonical)}\`  •  ${esc(typeLabel)}\n\n` +
      `_Boshqarish uchun quyidagi tugmalardan foydalaning\\._`;

    await context.bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: kbServer(result.projectId, 'stopped')
    });
  } else {
    const text =
      `❌ *Server yaratib bo'lmadi*\n\n` +
      `\`${esc(result.error || 'Noma\'lum xato')}\``;
    await context.bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: kbBack('menu')
    });
  }
}

module.exports = {
  startCreate,
  startCreateWizard,
  wizardCreateIp,
  wizardCreatePort,
  wizardCreateVersion,
  handleSetType,
  handleSetVersion
};
