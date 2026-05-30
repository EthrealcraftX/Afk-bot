const mineflayer = require('mineflayer');
const path = require('path');
const fs = require('fs');

// Config faylni o'qish
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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
    fs.writeFileSync(playerStateFile, JSON.stringify({
      projectId,
      count: players.length,
      players,
      updatedAt: new Date().toISOString()
    }, null, 2));
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

// --- CLEANUP ---
function cleanup() {
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
    triggerReconnect(`CreationError: ${err.message}`);
    return;
  }

  // Connection watchdog
  const CONNECT_TIMEOUT = 25000;
  let connectTimeoutTimer = setTimeout(() => {
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
    console.log(`➕ Kirdi: ${player.username} | Jami: ${Object.keys(bot.players || {}).length} o'yinchi`);
    writePlayerState(bot);
  });

  bot.on('playerLeft', (player) => {
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
    triggerReconnect(`ErrorEvent: ${err.message || 'unknown'}`);
  });

  bot.on('end', () => {
    console.log('🔌 Server bilan ulanish uzildi (End).');
    triggerReconnect('ConnectionEnd');
  });
}

// Qayta ulanish funktsiyasi
function triggerReconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;

  cleanup();

  connectAttempts = Math.min(connectAttempts + 1, 8);
  const delay = Math.min(5000 * Math.pow(2, connectAttempts - 1), 3 * 1000 * 60);

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
      const actions = config.actions || ["jump", "moveForward", "lookAround"];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      switch(randomAction) {
        case 'jump':
          bot.setControlState('jump', true);
          setTimeout(() => { if (bot) bot.setControlState('jump', false); }, 500);
          console.log('🚶 AFK Harakat: Sakrash (Jump)');
          break;
          
        case 'moveForward':
          bot.setControlState('forward', true);
          setTimeout(() => { if (bot) bot.setControlState('forward', false); }, 1000);
          console.log('🚶 AFK Harakat: Oldinga yurish (MoveForward)');
          break;
          
        case 'moveBackward':
          bot.setControlState('back', true);
          setTimeout(() => { if (bot) bot.setControlState('back', false); }, 1000);
          console.log('🚶 AFK Harakat: Orqaga yurish (MoveBackward)');
          break;
          
        case 'strafeLeft':
          bot.setControlState('left', true);
          setTimeout(() => { if (bot) bot.setControlState('left', false); }, 1000);
          console.log('🚶 AFK Harakat: Chapga siljish (StrafeLeft)');
          break;
          
        case 'strafeRight':
          bot.setControlState('right', true);
          setTimeout(() => { if (bot) bot.setControlState('right', false); }, 1000);
          console.log('🚶 AFK Harakat: O\'ngga siljish (StrafeRight)');
          break;
          
        case 'lookAround':
          const yaw = Math.random() * Math.PI - (0.5 * Math.PI);
          const pitch = Math.random() * Math.PI - (0.5 * Math.PI);
          bot.look(yaw, pitch);
          console.log('👁️ AFK Harakat: Atrofga qarash (LookAround)');
          break;
          
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

// Botni ishga tushirish
startBot();