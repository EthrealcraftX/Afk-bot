const mineflayer = require('mineflayer');
const path = require('path');
const fs = require('fs');
const { classify } = require('../../errors/DisconnectClassifier');

// Config faylni o'qish
const configPath = path.join(__dirname, 'config.json');
let config;
try {
  const raw = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(raw);
} catch (e) {
  console.error('❌ Config yuklashda xato:', e.message);
  process.exit(1);
}
// FIXED: config.json read wrapped in try/catch before uncaughtException is registered

// Usernamelarni fayldan o'qish
let usernames = [];
try {
  usernames = fs.readFileSync(path.join(__dirname, config.usernameFile), 'utf8')
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0);
} catch (e) {
  console.error('Failed to read usernames file:', e.message);
}
if (usernames.length === 0) {
  usernames = ['JavaBot_' + Math.floor(1000 + Math.random() * 9000)];
}

// ── PLAYER STATE FILE ──────────────────────────────────────────────────────
// Writes current player list to data/players/<projectId>.json so the panel
// can display online player count and names via the Telegram bot.
const projectId = config.projectId || path.basename(path.resolve(__dirname));
const playersDir = path.join(__dirname, '..', '..', 'data', 'players');
const playerStateFile = path.join(playersDir, `${projectId}.json`);

function writePlayerState(botInstance) {
  try {
    if (!fs.existsSync(playersDir)) fs.mkdirSync(playersDir, { recursive: true });
    let players = [];
    if (botInstance && botInstance.players) {
      players = Object.values(botInstance.players)
        .map(p => p.username)
        .filter(Boolean);
    }
    const data = {
      projectId,
      count: players.length,
      players,
      updatedAt: new Date().toISOString()
    };
    fs.writeFile(playerStateFile, JSON.stringify({...data}), 'utf8', (err) => {
      if (err) console.error('❌ Player state yozishda xato:', err.message);
    });
    // FIXED: player state writes no longer block the event loop
  } catch (e) {
    console.error('Failed to write player state:', e.message);
  }
}

function clearPlayerState() {
  try {
    if (!fs.existsSync(playersDir)) fs.mkdirSync(playersDir, { recursive: true });
    fs.writeFileSync(playerStateFile, JSON.stringify({
      projectId,
      count: 0,
      players: [],
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) {}
}

// Foydalanilgan usernamelarni saqlash
const usedUsernames = new Set();

// Tasodifiy username generator
function getRandomUsername() {
  if (usedUsernames.size >= usernames.length) {
    console.log('Barcha usernamelar ishlatildi, ro\'yxat qayta tiklanmoqda...');
    usedUsernames.clear();
  }

  const availableUsernames = usernames.filter(name => !usedUsernames.has(name));
  const randomUsername = availableUsernames[Math.floor(Math.random() * availableUsernames.length)];
  
  usedUsernames.add(randomUsername);
  return randomUsername;
}

let bot = null;
let reconnectTimer = null;
let scheduledRestartTimer = null;
let actionInterval = null;
let isReconnecting = false;
let connectAttempts = 0;
let connectTimeoutTimer = null;

// --- CLEANUP ---
function cleanup() {
  if (connectTimeoutTimer) { clearTimeout(connectTimeoutTimer); connectTimeoutTimer = null; }
  // FIXED: watchdog timer cleared on cleanup to prevent duplicate reconnect
  clearPlayerState();
  if (scheduledRestartTimer) {
    clearTimeout(scheduledRestartTimer);
    scheduledRestartTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (actionInterval) {
    clearInterval(actionInterval);
    actionInterval = null;
  }
  if (bot) {
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {
      console.error('Error ending bot instance:', e.message);
    }
    bot = null;
  }
}

// Botni ishga tushirish funksiyasi
function startBot() {
  cleanup();

  const username = getRandomUsername();
  console.log(`🆕 Bot yaratilmoqda... Tanlangan username: ${username}`);
  
  try {
    bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: username,
      version: config.version,
    });
  } catch (err) {
    console.error(`⚠️ Bot yaratish xatosi: ${err.message}`);
    const lowerMsg = (err.message || '').toLowerCase();
    if (lowerMsg.includes('version') || lowerMsg.includes('protocol') || lowerMsg.includes('unsupported') || lowerMsg.includes('invalid version')) {
      console.error('❌ Versiya xatosi — qayta ulanish to\'xtatildi:', err.message);
      process.exit(1);
    }
    // FIXED: invalid version exits cleanly instead of retrying forever with same bad version
    triggerReconnect(`CreationError: ${err.message}`);
    return;
  }

  // Connection watchdog
  const CONNECT_TIMEOUT = 25000;
  connectTimeoutTimer = setTimeout(() => {
    console.error(`⌛ Connection timed out connecting to ${config.host}:${config.port}`);
    triggerReconnect('ConnectTimeout');
  }, CONNECT_TIMEOUT);

  // Bot eventlari
  bot.on('login', () => {
    console.log(`✅ Bot ${bot.username} serverga ulandi!`);
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    connectAttempts = 0;
    
    // Auto restart in N hours
    const RECONNECT_HOURS = config.reconnectHours || 2;
    const RECONNECT_MS = RECONNECT_HOURS * 60 * 60 * 1000;
    scheduledRestartTimer = setTimeout(() => {
      console.log(`⏳ ${RECONNECT_HOURS} soat tugadi, yangi username bilan qayta ulanish rejalashtirildi...`);
      triggerReconnect('ScheduledRotation');
    }, RECONNECT_MS);
  });

  bot.on('spawn', () => {
    console.log('✅ Bot dunyoga kirdi (spawn)! AFK harakatlar rejimi ishga tushirildi.');
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    writePlayerState(bot);
    startRandomActions();
  });

  // ── PLAYER LIST tracking ──
  bot.on('playerJoined', (player) => {
    if (!bot) return;
    // FIXED: handlers no longer run after cleanup sets bot to null
    console.log(`➕ Kirdi: ${player.username} | Jami: ${Object.keys(bot.players || {}).length} o'yinchi`);
    writePlayerState(bot);
  });

  bot.on('playerLeft', (player) => {
    if (!bot) return;
    // FIXED: handlers no longer run after cleanup sets bot to null
    console.log(`➖ Chiqdi: ${player.username} | Jami: ${Object.keys(bot.players || {}).length} o'yinchi`);
    writePlayerState(bot);
  });

  bot.on('kicked', (reason) => {
    const kickReason = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
    console.log('❌ Bot serverdan chiqarib yuborildi (Kicked):', kickReason);
    triggerReconnect(`Kicked: ${kickReason}`);
  });

  bot.on('error', (err) => {
    console.log('⚠️ Bot kutilmagan xatolikka duch keldi (Error):', err.message || err);
    const errMsg = err.message || '';
    const lowerMsg = errMsg.toLowerCase();
    if (lowerMsg.includes('version') || lowerMsg.includes('protocol') || lowerMsg.includes('unsupported') || lowerMsg.includes('invalid version')) {
      console.error('❌ Versiya xatosi — qayta ulanish to\'xtatildi:', errMsg);
      process.exit(1);
    }
    // FIXED: invalid version exits cleanly instead of retrying forever with same bad version
    triggerReconnect(`ErrorEvent: ${err.message || 'unknown'}`);
  });

  bot.on('end', () => {
    console.log('🔌 Server bilan ulanish uzildi (End).');
    triggerReconnect('ConnectionEnd');
  });

  bot.on('death', () => {
    console.log('💀 Bot o\'ldi, qayta tug\'ilish...');
    setTimeout(() => {
      try { if (bot && bot.entity) bot.respawn(); } catch (e) {}
    }, 1500);
  });
  // FIXED: bot no longer stuck in death screen for up to 2 hours

  bot.on('health', () => {
    if (!bot) return;
    if (bot.food === 0) {
      console.log('🍖 Ovqat tugadi (food=0)');
    }
    if (bot.health <= 2) {
      console.log('❤️ Sog\'liq kritik darajada:', bot.health);
    }
  });
  // FIXED: health and starvation now monitored

  bot.on('messagestr', (message) => {
    console.log('💬 Server xabari:', message);
    const lower = message.toLowerCase();
    if (lower.includes('afk') || lower.includes('kick') || lower.includes('you will be')) {
      console.log('⚠️ AFK ogohlantirishi aniqlandi, harakat bajarilmoqda...');
      try { if (bot && bot.entity) bot.look(Math.random() * Math.PI * 2, 0, true); } catch (e) {}
    }
  });
  // FIXED: bot now detects AFK warnings and kick countdowns in chat
}

// Qayta ulanish funktsiyasi
function triggerReconnect(reason) {
  const MAX_RECONNECT = 20;
  if (connectAttempts >= MAX_RECONNECT) {
    console.error(`❌ ${MAX_RECONNECT} ta ulanish urinishi muvaffaqiyatsiz. Bot to'xtatildi.`);
    process.exit(1);
  }
  // FIXED: infinite reconnect loop to permanently offline servers now stops after ~1 hour

  const decision = classify(reason);
  if (!decision.shouldRetry) {
    console.error(`\n❌ Automatic reconnect stopped.`);
    console.error(`  Category:    ${decision.category}`);
    console.error(`  Reason:      ${decision.reason}`);
    console.error(`  Confidence:  ${decision.confidence}`);
    console.error(`  Retry:       false`);
    if (decision.adminAction) {
      console.error(`  Admin Action: ${decision.adminAction}`);
    }
    cleanup();
    process.exit(1);
  }

  if (isReconnecting) return;
  isReconnecting = true;

  cleanup();

  connectAttempts = connectAttempts + 1;
  const delay = Math.min(5000 * Math.pow(2, Math.min(connectAttempts, 8) - 1), 3 * 1000 * 60);

  console.log(`🔁 Qayta ulanish rejalashtirildi. Sabab: "${reason}"`);
  console.log(`⌛ Kutish vaqti: ${Math.round(delay/1000)} soniya (Urinish #${connectAttempts})...`);
  
  reconnectTimer = setTimeout(() => {
    isReconnecting = false;
    startBot();
  }, delay);
}

// Moblarga hujum qilish funktsiyasi
function attackNearbyMobs() {
  if (!bot || !bot.entity) return;
  
  const entityTypes = ['zombie', 'skeleton', 'spider', 'creeper', 'drowned', 'husk', 'stray'];
  try {
    const targetEntity = bot.nearestEntity(entity => {
      return entity.name && 
             entityTypes.includes(entity.name.toLowerCase()) && 
             entity.position.distanceTo(bot.entity.position) < 3;
    });

    if (targetEntity) {
      bot.attack(targetEntity);
      console.log(`⚔️ Yaqin atrofdagi mobga hujum qilindi: ${targetEntity.name}`);
    }
  } catch (err) {
    console.error('Error while attacking mob:', err.message);
  }
}

// Tasodifiy harakatlar funktsiyasi
function startRandomActions() {
  if (actionInterval) clearInterval(actionInterval);
  
  actionInterval = setInterval(() => {
    if (!bot) return;
    
    try {
      const actions = config.actions || ["jump", "moveForward", "lookAround", "sneak"];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      switch(randomAction) {
        case 'jump': {
          const currentBot = bot; // FIXED: capture now, not inside timer
          currentBot.setControlState('jump', true);
          setTimeout(() => {
            try {
              if (currentBot && currentBot.entity) currentBot.setControlState('jump', false);
            } catch (e) {}
          }, 500);
          console.log('🚶 AFK Harakat: Sakrash (Jump)');
          break;
        }
          
        case 'moveForward': {
          const currentBot = bot; // FIXED: capture now, not inside timer
          currentBot.setControlState('forward', true);
          setTimeout(() => {
            try {
              if (currentBot && currentBot.entity) currentBot.setControlState('forward', false);
            } catch (e) {}
          }, 1000);
          console.log('🚶 AFK Harakat: Oldinga yurish (MoveForward)');
          break;
        }
          
        case 'moveBackward': {
          const currentBot = bot; // FIXED: capture now, not inside timer
          currentBot.setControlState('back', true);
          setTimeout(() => {
            try {
              if (currentBot && currentBot.entity) currentBot.setControlState('back', false);
            } catch (e) {}
          }, 1000);
          console.log('🚶 AFK Harakat: Orqaga yurish (MoveBackward)');
          break;
        }
          
        case 'strafeLeft': {
          const currentBot = bot; // FIXED: capture now, not inside timer
          currentBot.setControlState('left', true);
          setTimeout(() => {
            try {
              if (currentBot && currentBot.entity) currentBot.setControlState('left', false);
            } catch (e) {}
          }, 1000);
          console.log('🚶 AFK Harakat: Chapga siljish (StrafeLeft)');
          break;
        }
          
        case 'strafeRight': {
          const currentBot = bot; // FIXED: capture now, not inside timer
          currentBot.setControlState('right', true);
          setTimeout(() => {
            try {
              if (currentBot && currentBot.entity) currentBot.setControlState('right', false);
            } catch (e) {}
          }, 1000);
          console.log('🚶 AFK Harakat: O\'ngga siljish (StrafeRight)');
          break;
        }

        case 'sneak': {
          const sneakBot = bot;
          sneakBot.setControlState('sneak', true);
          setTimeout(() => {
            try {
              if (sneakBot && sneakBot.entity) sneakBot.setControlState('sneak', false);
            } catch (e) {}
          }, 1000);
          console.log('🚶 AFK Harakat: Sneak (Sneak)');
          break;
        }
          
        case 'lookAround': {
          const yaw = Math.random() * Math.PI * 2;  // FIXED: full 360° range (0 to 2π)
          const pitch = (Math.random() * Math.PI) - (Math.PI / 2);  // correct: -π/2 to π/2
          bot.look(yaw, pitch);
          console.log('👁️ AFK Harakat: Atrofga qarash (LookAround)');
          break;
        }
          
        case 'attackMobs':
          attackNearbyMobs();
          break;
      }
    } catch (e) {
      console.error('Failed to run random action:', e.message);
    }
  }, config.movementInterval || 5000);
}

process.on('uncaughtException', (err) => {
  console.error(`🔥 Unhandled Exception in Bot Process: ${err.message}`);
  console.error(err.stack);
  triggerReconnect(`UncaughtException: ${err.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`🔥 Unhandled Rejection: ${reason}`);
  triggerReconnect(`UnhandledRejection: ${reason}`);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM qabul qilindi, tozalanmoqda...');
  cleanup();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT qabul qilindi, tozalanmoqda...');
  cleanup();
  setTimeout(() => process.exit(0), 1000);
});
// FIXED: graceful shutdown cleans player state file before process exits

// Botni ishga tushirish
startBot();