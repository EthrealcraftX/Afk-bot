const context = require('./context');
const { getSession } = require('./session');
const { esc } = require('./formatters');
const { kbServer } = require('./keyboards');

const { handleMenu, handleHelp } = require('./handlers/menu');
const {
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
} = require('./handlers/servers');

const {
  startCreate,
  startCreateWizard,
  wizardCreateIp,
  wizardCreatePort,
  wizardCreateVersion,
  handleSetType,
  handleSetVersion
} = require('./handlers/create');

const {
  startSupportMessage,
  wizardSupportMsg
} = require('./handlers/support');

const {
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
} = require('./handlers/admin');

const {
  wizardLoginUser,
  wizardLoginPass,
  wizardRegUser,
  wizardRegPass
} = require('./auth');

const { handleMyChatMember, handleGroupMessage } = require('./handlers/group');
const { registerGroupChat } = require('./group_store');

function initRouter() {
  const { bot } = context;

  // ── my_chat_member: bot added to / removed from group ─────────────────────
  bot.on('my_chat_member', async (update) => {
    try {
      await handleMyChatMember(update);
    } catch (e) {
      console.error('[Router] my_chat_member error:', e.message);
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId  = query.message.message_id;
    const data   = query.data;
    const sess   = getSession(chatId);

    sess.lastMsgId = msgId;
    // Do not auto-answer custom alerts/popups, handle them inside the handler
    if (!data.startsWith('gver_') && data !== 'send_help_video') {
      await bot.answerCallbackQuery(query.id).catch(() => {});
    }

    // ── Group version info popup (non-interactive informational) ──────────────
    if (data === 'gver_header') {
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      const text = `🎮 *Minecraft Platformasini Tanlang\\:*`;
      await bot.sendMessage(chatId, text, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '☕ Java Edition', callback_data: 'gshow_java' },
              { text: '🟩 Bedrock Edition', callback_data: 'gshow_bedrock' }
            ]
          ]
        }
      }).catch(() => {});
      return;
    }
    if (data === 'gshow_java' || data === 'gshow_bedrock') {
      const type = data === 'gshow_java' ? 'java' : 'bedrock';
      const label = type === 'java' ? '☕ Java Edition' : '🟩 Bedrock Edition';
      
      const Project = require('../api/models/Project');
      
      // Get most used versions from DB
      let versions = [];
      try {
        const projects = await Project.find({ type }).sort({ createdAt: -1 });
        const freqs = {};
        projects.forEach(p => {
          freqs[p.version] = (freqs[p.version] || 0) + 1;
        });
        versions = Object.keys(freqs).sort((a, b) => freqs[b] - freqs[a]);
      } catch (e) {
        console.error('[Router] Failed to query projects:', e.message);
      }
      
      const kbRows = [];
      if (versions.length > 0) {
        // Chunk versions into rows of 2
        for (let i = 0; i < versions.length; i += 2) {
          const row = [];
          row.push({ text: `🏷 ${versions[i]}`, callback_data: `gver_${versions[i]}` });
          if (i + 1 < versions.length) {
            row.push({ text: `🏷 ${versions[i+1]}`, callback_data: `gver_${versions[i+1]}` });
          }
          kbRows.push(row);
        }
      } else {
        // If no versions exist in DB, fallback to top versions from config
        const { loadVersions } = require('./store');
        const defaultVersions = loadVersions(type).slice(0, 3);
        for (let i = 0; i < defaultVersions.length; i += 2) {
          const row = [];
          row.push({ text: `🏷 ${defaultVersions[i]}`, callback_data: `gver_${defaultVersions[i]}` });
          if (i + 1 < defaultVersions.length) {
            row.push({ text: `🏷 ${defaultVersions[i+1]}`, callback_data: `gver_${defaultVersions[i+1]}` });
          }
          kbRows.push(row);
        }
      }
      
      // Add Back button
      kbRows.push([{ text: '🔙 Orqaga', callback_data: 'gver_header' }]);
      
      const text = `🏷 *${esc(label)} faol versiyalari\\:*`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: kbRows }
      }).catch(async () => {
        // If edit fails (e.g. message was deleted or text is identical), send a new one
        await bot.sendMessage(chatId, text, {
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: kbRows }
        });
      });
      return;
    }
    if (data.startsWith('gver_')) {
      const version = data.slice(5);
      
      // Determine the type based on the active state or the previous message
      const msgText = query.message?.text || '';
      const type = msgText.toLowerCase().includes('java') ? 'java' : 'bedrock';
      const typeLabel = type === 'java' ? 'Java' : 'Bedrock';
      
      const Project = require('../api/models/Project');
      const { getPlayerState, getAtErnosJoinUrl } = require('./group_announce');
      
      // 1. Answer callback
      await bot.answerCallbackQuery(query.id).catch(() => {});
      
      // 2. Query MongoDB for active running (online) servers of this version and type
      let onlineServers = [];
      try {
        onlineServers = await Project.find({
          version: version,
          type: type,
          status: 'running'
        });
      } catch (e) {
        console.error('[Router] Failed to query online servers:', e.message);
      }
      
      let text = `🏷 *Versiya:* \`${esc(version)}\` \\(${esc(typeLabel)}\\)\n\n`;
      const kbRows = [];
      
      if (onlineServers.length > 0) {
        text += `🟢 *Mavjud online serverlar:* \n\n`;
        onlineServers.forEach((srv, idx) => {
          const ps = getPlayerState(srv.projectId);
          const playersStr = ps.count === 0
            ? `_O'yinchilar yo'q_`
            : `_O'yinchilar \\(${esc(String(ps.count))}\\):_ ` + ps.players.map(p => `\`${esc(p)}\``).join(', ');
            
          text += `${idx + 1}\\. 🌐 \`${esc(srv.host)}:${esc(String(srv.port))}\`\n   👥 ${playersStr}\n\n`;
          
          // Add Aternos join button if applicable
          if (type === 'bedrock') {
            const atErnosUrl = getAtErnosJoinUrl(srv.host);
            if (atErnosUrl) {
              kbRows.push([{
                text: `🎮 Kirish: ${srv.host}`,
                url: atErnosUrl
              }]);
            }
          }
        });
      } else {
        text += `🔴 *Ushbu versiyada hozirda hech qanday faol (online) server topilmadi\\.*`;
      }
      
      // Add Back button
      kbRows.push([{ text: '🔙 Boshqa versiya tanlash', callback_data: `gshow_${type}` }]);
      
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: kbRows }
      }).catch(async () => {
        // If edit fails, send a new message
        await bot.sendMessage(chatId, text, {
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: kbRows }
        });
      });
      return;
    }

    // ── Send Help Video ──────────────────────────────────────────────────────
    if (data === 'send_help_video') {
      const fs = require('fs');
      const videoInput = process.env.HELP_VIDEO_URL || 'https://raw.githubusercontent.com/w3c/web-platform-tests/master/media/movie_5.mp4';
      
      await bot.answerCallbackQuery(query.id, { text: 'Videoni yuborish boshlandi...' }).catch(() => {});
      
      try {
        if (fs.existsSync(videoInput)) {
          await bot.sendVideo(chatId, fs.createReadStream(videoInput), {
            caption: '📹 *Botdan foydalanish bo\'yicha video qo\'llanma\\!*'
          });
        } else {
          await bot.sendVideo(chatId, videoInput, {
            caption: '📹 *Botdan foydalanish bo\'yicha video qo\'llanma\\!*'
          });
        }
      } catch (e) {
        console.error('[Video] Failed to send video:', e.message);
        await bot.sendMessage(chatId, '❌ *Videoni yuborib bo\'lmadi\\.*\n_Iltimos, keyinroq qayta urinib ko\'ring\\._', {
          parse_mode: 'MarkdownV2'
        });
      }
      return;
    }

    // ── Basic ──
    if (data === 'menu')           return handleMenu(chatId, sess, msgId);
    if (data === 'help')           return handleHelp(chatId, sess, msgId);
    if (data === 'list_servers')   return handleListServers(chatId, sess, msgId);
    if (data === 'create_server')  return startCreate(chatId, sess);
    if (data === 'create_wizard')  return startCreateWizard(chatId, sess);
    if (data === 'stats')          return handleStats(chatId, sess, msgId);
    if (data === 'all_events')     return handleAllEvents(chatId, sess, msgId);

    // ── Server ──
    if (data.startsWith('srvinfo_'))    return handleServerInfo(chatId, sess, msgId, data.slice(8));
    if (data.startsWith('srvstart_'))   return handleServerAction(chatId, sess, msgId, data.slice(9),  'start');
    if (data.startsWith('srvstop_'))    return handleServerAction(chatId, sess, msgId, data.slice(8),  'stop');
    if (data.startsWith('srvdel_'))     return handleDeleteConfirm(chatId, sess, msgId, data.slice(7));
    if (data.startsWith('confirmdel_')) return handleDeleteExecute(chatId, sess, msgId, data.slice(11));
    if (data.startsWith('srvlogs_'))    return handleServerLogs(chatId, sess, msgId, data.slice(8));
    if (data.startsWith('srvevents_'))  return handleServerEvents(chatId, sess, msgId, data.slice(10));
    if (data.startsWith('srvplayers_')) return handleServerPlayers(chatId, sess, msgId, data.slice(11));
    if (data.startsWith('settype_'))    return handleSetType(chatId, sess, data.slice(8));
    if (data.startsWith('setversion_')) return handleSetVersion(chatId, sess, msgId, data.slice(11));

    // ── Admin ──
    if (data === 'admin_panel')      return handleAdminPanel(chatId, sess, msgId);
    if (data === 'admin_servers')    return handleAdminServers(chatId, sess, msgId);
    if (data === 'admin_broadcast')  return startBroadcast(chatId, sess);
    if (data === 'admin_support')    return handleSupportList(chatId, sess, msgId);
    if (data === 'admin_users')      return handleAdminUsers(chatId, sess, msgId);
    if (data === 'bcast_confirm')    return executeBroadcast(chatId, sess, msgId);

    // ── Admin Version Management ──
    if (data === 'admin_versions')          return handleAdminVersions(chatId, sess, msgId);
    if (data.startsWith('admvers_list_'))   return handleAdminVersionList(chatId, sess, msgId, data.slice(13));
    if (data.startsWith('admvers_add_'))    return startAddVersion(chatId, sess, data.slice(12));
    if (data.startsWith('admvers_del_'))    return startDelVersion(chatId, sess, data.slice(12));
    if (data.startsWith('admvers_do_del_')) return executeDelVersion(chatId, sess, msgId, data.slice(15));

    // ── Support ──
    if (data === 'support_new')       return startSupportMessage(chatId, sess);
    if (data.startsWith('ticket_'))   return handleTicketView(chatId, sess, msgId, parseInt(data.slice(7)));
    if (data.startsWith('treply_'))   return startTicketReply(chatId, sess, parseInt(data.slice(7)));
    if (data.startsWith('tclose_'))   return handleTicketClose(chatId, sess, msgId, parseInt(data.slice(7)));
  });

  bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;

    const chatId   = msg.chat.id;
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup', 'channel'

    // ── Group/Channel: only handle keyword detection ──────────────────────────
    if (chatType === 'group' || chatType === 'supergroup') {
      // Register group if not already done (e.g. bot was added before this code)
      registerGroupChat(chatId, msg.chat.title || String(chatId));
      await handleGroupMessage(msg).catch(e =>
        console.error('[Router] handleGroupMessage error:', e.message)
      );
      return;
    }

    // ── Private chat only below ───────────────────────────────────────────────
    const sess = getSession(chatId);

    // ── Web App Data (Mini App server creation callback) ──────────────────────
    if (msg.web_app_data) {
      try {
        const data = JSON.parse(msg.web_app_data.data);
        if (data.action === 'server_created') {
          const { projectId, ip, port, version, type } = data;
          const typeLabel = type === 'java' ? '☕ Java' : '🟩 Bedrock';
          const text =
            `✅ *Server muvaffaqiyatli qo'shildi\\!*\n\n` +
            `🆔 ID: \`${esc(projectId)}\`\n` +
            `🌐 \`${esc(ip)}:${esc(String(port))}\`\n` +
            `🏷 Versiya: \`${esc(version)}\`  •  ${esc(typeLabel)}\n\n` +
            `_Quyidagi tugmalar orqali serverni boshqaring:_`;
          await bot.sendMessage(chatId, text, {
            parse_mode: 'MarkdownV2',
            reply_markup: kbServer(projectId, 'stopped')
          });
          return;
        }
      } catch (e) {
        console.error('[WebApp] Failed to parse web_app_data:', e);
      }
      return;
    }

    const text = (msg.text ?? '').trim();

    if (!sess.state || !text) return;

    const state = sess.state;

    // ── Auth ──
    if (state === 'login_username')  return wizardLoginUser(chatId, sess, text);
    if (state === 'login_password')  return wizardLoginPass(chatId, sess, text);
    if (state === 'reg_username')    return wizardRegUser(chatId, sess, text);
    if (state === 'reg_password')    return wizardRegPass(chatId, sess, text);

    // ── Create server ──
    if (state === 'create_ip')       return wizardCreateIp(chatId, sess, text);
    if (state === 'create_port')     return wizardCreatePort(chatId, sess, text);
    if (state === 'create_version')  return wizardCreateVersion(chatId, sess, text);

    // ── Support ──
    if (state === 'support_msg')     return wizardSupportMsg(chatId, sess, text);

    // ── Admin ──
    if (state === 'broadcast_text')  return wizardBroadcastText(chatId, sess, text);
    if (state === 'ticket_reply')    return wizardTicketReply(chatId, sess, text);
    if (state.startsWith('admvers_add_input_')) return handleAddVersionInput(chatId, sess, text, state.slice(18));
  });
}

module.exports = initRouter;
