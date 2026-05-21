let createClient;
try {
  createClient = require('bedrock-protocol').createClient;
} catch (err) {
  console.error('Failed to load bedrock-protocol or native bindings (raknet-native). Please run `npm install` and, if necessary, `npm rebuild raknet-native`. Error:', err && err.message);
  process.exit(1);
}

let chalk;
try {
  chalk = require('chalk');
  if (chalk && !chalk.cyan && chalk.default) chalk = chalk.default;
} catch (e) {
  chalk = null;
}

function color(name, text) {
  if (!chalk) return text;
  return typeof chalk[name] === 'function' ? chalk[name](text) : text;
}

const config = require('./config.json');
const fs = require('fs');

let bot = null;
let autoRestartTimer = null;
let connectTimer = null;
let reconnectTimer = null;
let actionInterval = null;
let isReconnecting = false;
let connectAttempts = 0;

// --- USERNAME FILEDAN RANDOM TANLASH ---
function pickRandomUsernameFromFile() {
  try {
    const data = fs.readFileSync('username.txt', 'utf8');
    const names = data.split('\n').map(n => n.trim()).filter(Boolean);
    if (names.length === 0) return 'BedrockBot_' + Math.floor(1000 + Math.random() * 9000);
    const index = Math.floor(Math.random() * names.length);
    return names[index];
  } catch (err) {
    console.error(color('red', 'username.txt fayl o‘qib bo‘lmadi:'), err.message);
    return 'BedrockBot_' + Math.floor(1000 + Math.random() * 9000);
  }
}

// --- CLEANUP ---
function cleanup() {
  if (autoRestartTimer) {
    clearTimeout(autoRestartTimer);
    autoRestartTimer = null;
  }
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
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

// --- BOT YARATISH ---
function createBot() {
  cleanup();
  
  const username = pickRandomUsernameFromFile();
  console.log(color('cyan', `🆕 Bot yaratilmoqda... Tanlangan username: ${username}`));

  try {
    bot = createClient({
      host: config.host,
      port: config.port,
      username: username,
      offline: true,
      version: config.version,
      raknetBackend: 'jsp-raknet'
    });
  } catch (err) {
    console.error(color('red', `⚠️ Botni yaratishda xato: ${err.message}`));
    triggerReconnect(`CreationError: ${err.message}`);
    return;
  }

  // Connection watchdog: if join/login doesn't happen in time, disconnect and try later
  const CONNECT_TIMEOUT = parseInt(process.env.CONNECT_TIMEOUT_MS) || 15000;
  connectTimer = setTimeout(() => {
    console.error(color('red', `⌛ Connection timed out to ${config.host}:${config.port} after ${CONNECT_TIMEOUT}ms`));
    triggerReconnect('ConnectionTimeout');
  }, CONNECT_TIMEOUT);

  // Reset connect attempts on successful connect
  function onSuccessfulConnect() {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    connectAttempts = 0;
  }

  bot.on('join', () => {
    console.log(color('green', `✅ '${username}' serverga muvaffaqiyatli qo‘shildi.`));
    onSuccessfulConnect();
    
    // Auto restart in 2 hours to rotate usernames and recover resources
    const RECONNECT_HOURS = config.reconnectHours || 2;
    const RECONNECT_MS = RECONNECT_HOURS * 60 * 60 * 1000;
    autoRestartTimer = setTimeout(() => {
      console.log(color('magenta', `⏳ ${RECONNECT_HOURS} soat o‘tdi — bot qayta ulanadi qolgan resurslarni ozod etish va username almashtirish uchun.`));
      triggerReconnect('ScheduledRotation');
    }, RECONNECT_MS);

    // Dynamic movement actions inside the server
    setupMovement();
  });

  bot.on('disconnect', (reason) => {
    console.log(color('red', '❌ Bot uzildi (Disconnect). Sabab:'), reason || 'Noma\'lum');
    triggerReconnect(`Disconnect: ${reason || 'unknown'}`);
  });

  bot.on('error', (err) => {
    console.log(color('red', '⚠️ Botda xatolik yuz berdi (Error):'), err.message || err);
    triggerReconnect(`ErrorEvent: ${err.message || 'unknown'}`);
  });

  bot.on('session', () => {
    onSuccessfulConnect();
  });

  bot.on('packet', () => {
    onSuccessfulConnect();
  });
}

function setupMovement() {
  if (actionInterval) clearInterval(actionInterval);
  
  actionInterval = setInterval(() => {
    if (!bot || !bot.player || !bot.player.position) return;

    try {
      const pos = bot.player.position;
      const dx = (Math.random() - 0.5) * 2;
      const dz = (Math.random() - 0.5) * 2;

      bot.write('move_player', {
        position: {
          x: pos.x + dx,
          y: pos.y,
          z: pos.z + dz
        },
        mode: 0,
        on_ground: true,
        ridden_entity_runtime_id: 0,
        teleport_cause: 0,
        entity_type: 0
      });

      console.log(color('blue', `🚶 AFK Yurish harakati: (${(pos.x + dx).toFixed(2)}, ${(pos.z + dz).toFixed(2)})`));
    } catch (e) {
      console.error('Failed to execute movement packet:', e.message);
    }
  }, config.movementInterval || 5000);
}

function triggerReconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  
  cleanup();

  connectAttempts = Math.min(connectAttempts + 1, 8); // cap attempts to prevent complete runaway
  const delay = Math.min(5000 * Math.pow(2, connectAttempts - 1), 3 * 1000 * 60); // exp backoff: 5s, 10s, 20s, 40s, 80s, max 3 minutes
  
  console.log(color('yellow', `🔁 Reconnect rejalashtirildi. Sabab: "${reason}".`));
  console.log(color('yellow', `⌛ Kutish vaqti: ${Math.round(delay/1000)} soniya (Urinish #${connectAttempts})...`));
  
  reconnectTimer = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

// Handle uncaught exceptions gracefully to prevent crash of panels background process
process.on('uncaughtException', (err) => {
  console.error(color('red', `🔥 Unhandled Exception in Bot Process: ${err.message}`));
  console.error(err.stack);
  triggerReconnect(`UncaughtException: ${err.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(color('red', `🔥 Unhandled Rejection: ${reason}`));
  triggerReconnect(`UnhandledRejection: ${reason}`);
});

// Start
createBot();