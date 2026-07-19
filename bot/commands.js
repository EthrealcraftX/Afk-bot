const context = require('./context');
const { getSession } = require('./session');
const { ensureTelegramAuth } = require('./auth');
const { sendMenu, handleHelp } = require('./handlers/menu');
const { handleEditServer } = require('./handlers/servers');
const { registerGroupChat } = require('./group_store');
const { esc } = require('./formatters');

function initCommands() {
  const { bot } = context;

  bot.onText(/\/start/, async (msg) => {
    // FIXED: Wrap command handler in try/catch to prevent bot crash
    try {
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
    } catch (err) {
      console.error('Error in /start command handler:', err);
    }
  });

  bot.onText(/\/menu/, async (msg) => {
    // FIXED: Wrap command handler in try/catch to prevent bot crash
    try {
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
    } catch (err) {
      console.error('Error in /menu command handler:', err);
    }
  });

  bot.onText(/\/help/, (msg) => {
    // Groups: ignore /help
    if (msg.chat.type !== 'private') return;
    handleHelp(msg.chat.id, getSession(msg.chat.id));
  });

  // ── /edit [botId] — open the mini app edit page ────────────────────────────
  bot.onText(/\/edit(?:\s+(\S+))?/, async (msg, match) => {
    // FIXED: Wrap command handler in try/catch to prevent bot crash
    try {
      const chatId   = msg.chat.id;
      const chatType = msg.chat.type;
      if (chatType !== 'private') return;

      const sess = getSession(chatId);
      const ok = await ensureTelegramAuth(chatId, sess);
      if (!ok) {
        await bot.sendMessage(chatId,
          `❌ *Tizimga kirishingiz kerak\\.*\n\n_\/start bosing\\._`,
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      const projectId = (match[1] || '').trim();

      if (!projectId) {
        // No botId provided — show list of servers to pick from
        const api = require('./api');
        const result = await api('GET', '/projects', null, sess.token);
        if (!result.success || !Object.keys(result.projects || {}).length) {
          await bot.sendMessage(chatId,
            `❌ *Tahrirlash uchun server topilmadi\\.*\n\n_Avval server qo'shing\\._`,
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        const ids = Object.keys(result.projects);
        const rows = ids.map(id => {
          const s = result.projects[id];
          return [{ text: `✏️ ${s.host}:${s.port}`, callback_data: `srvedit_${id}` }];
        });
        rows.push([{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]);
        await bot.sendMessage(chatId,
          `✏️ *Qaysi serverni tahrirlaysiz?*`,
          { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: rows } }
        );
        return;
      }

      await handleEditServer(chatId, sess, null, projectId);
    } catch (err) {
      console.error('Error in /edit command handler:', err);
    }
  });

  bot.onText(/\/recommend/, async (msg) => {
    try {
      const { RecommendationService } = require('./status/recommendation');
      const recommendations = await RecommendationService.getRecommendations(5);
      if (recommendations.length === 0) {
        return bot.sendMessage(msg.chat.id, 'Hozircha onlayn serverlar topilmadi.');
      }
      
      let replyMsg = `🔎 *Tavsiya etiladigan serverlar:*\n\n`;
      recommendations.forEach((rec, idx) => {
        replyMsg += `${idx + 1}. *${rec.host}* ${rec.port !== 19132 && rec.port !== 25565 ? `:${rec.port}` : ''}\n`;
        replyMsg += `   O'yinchilar: ${rec.players} | Ping: ${rec.latency}ms\n`;
        replyMsg += `   Turi: ${rec.edition === 'java' ? 'Java ☕' : 'Bedrock 🟩'} | ${rec.version || 'Unknown'}\n\n`;
      });
      await bot.sendMessage(msg.chat.id, replyMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi.');
    }
  });

  bot.onText(/\/randomserver/, async (msg) => {
    try {
      const { RecommendationService } = require('./status/recommendation');
      const recommendations = await RecommendationService.getRecommendations(1);
      if (recommendations.length === 0) {
        return bot.sendMessage(msg.chat.id, 'Hozircha onlayn serverlar topilmadi.');
      }
      const rec = recommendations[0];
      const replyMsg = `🎲 *Tasodifiy Server:*\n\n*${rec.host}* ${rec.port !== 19132 && rec.port !== 25565 ? `:${rec.port}` : ''}\nO'yinchilar: ${rec.players}\nTuri: ${rec.edition === 'java' ? 'Java ☕' : 'Bedrock 🟩'}`;
      await bot.sendMessage(msg.chat.id, replyMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi.');
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    try {
      const { ServerRepository } = require('./db/serverRepository');
      const servers = await ServerRepository.getAllStoredServers();
      const onlineCount = servers.filter(s => s.status === 'online').length;
      const totalCount = servers.length;

      const replyMsg = `📊 *Bot Statistikasi*\n\nJami aniqlangan serverlar: ${totalCount}\nHozirda onlayn serverlar: ${onlineCount}\n`;
      await bot.sendMessage(msg.chat.id, replyMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi.');
    }
  });

  bot.onText(/\/settings/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      if (msg.chat.type === 'private') {
        return bot.sendMessage(chatId, 'Bu buyruq faqat guruhlar uchun.');
      }
      
      const member = await bot.getChatMember(chatId, msg.from.id);
      if (!['administrator', 'creator'].includes(member.status)) {
        return bot.sendMessage(chatId, '❌ Bu buyruq faqat guruh adminlari uchun.');
      }
      
      const { GroupSettingsRepository } = require('./db/groupSettingsRepository');
      const settings = await GroupSettingsRepository.getSettings(String(chatId));
      
      const replyMsg = `⚙️ *Guruh sozlamalari:*\n\nAuto-reply: ${settings.autoReplyEnabled ? 'Yoqilgan ✅' : "O'chirilgan ❌"}\nRecommendations: ${settings.recommendationsEnabled ? 'Yoqilgan ✅' : "O'chirilgan ❌"}`;
      await bot.sendMessage(chatId, replyMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      await bot.sendMessage(msg.chat.id, 'Xatolik yuz berdi.');
    }
  });
}

module.exports = initCommands;

