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

let bot;
let autoRestartTimer = null;
let connectAttempts = 0; // exponential backoff attempts

// --- USERNAME FILEDAN RANDOM TANLASH ---
function pickRandomUsernameFromFile() {
  try {
    const data = fs.readFileSync('username.txt', 'utf8');
    const names = data.split('\n').map(n => n.trim()).filter(Boolean);
    const index = Math.floor(Math.random() * names.length);
    return names[index];
  } catch (err) {
    console.error(color('red', 'username.txt fayl o‘qib bo‘lmadi:'), err.message);
    return 'DefaultBot';
  }
}

// --- BOT YARATISH ---
function createBot() {
  const username = pickRandomUsernameFromFile();
  console.log(color('cyan', `🆕 Bot yaratildi: ${username}`));

  bot = createClient({
    host: config.host,
    port: config.port,
    username: username,
    offline: true,
    version: config.version
  });

  // Connection watchdog: if join/login doesn't happen in time, disconnect and try later
  const CONNECT_TIMEOUT = parseInt(process.env.CONNECT_TIMEOUT_MS) || 10000;
  let connectTimer = setTimeout(() => {
    console.error(color('red', `Connection timed out to ${config.host}:${config.port} after ${CONNECT_TIMEOUT}ms`));
    try { bot?.end && bot.end(); } catch (e) { console.error('Error ending bot after timeout', e); }
    reconnect();
  }, CONNECT_TIMEOUT);

  // Reset connect attempts on successful connect
  function onSuccessfulConnect() {
    clearTimeout(connectTimer);
    connectAttempts = 0;
  }

  bot.on('join', () => {
    console.log(color('green', `✅ '${username}' serverga qo‘shildi.`));
    // successful connect
    onSuccessfulConnect();
    autoRestartTimer = setTimeout(() => {
      console.log(color('magenta','⏳ 2 soat o‘tdi — bot qayta ulanadi.'));
      bot.disconnect();
    }, 2 * 60 * 60 * 1000);
  });

  bot.on('disconnect', (reason) => {
    console.log(color('red','❌ Bot uzildi. Sabab:'), reason);
    if (autoRestartTimer) clearTimeout(autoRestartTimer);
    reconnect();
  });

  bot.on('error', (err) => {
    console.log(color('red','⚠️ Xatolik:'), err.message);
    console.error(err);
    try { bot?.end && bot.end(); } catch (e) {}
    reconnect();
  });

  bot.on('session', () => {
    onSuccessfulConnect();
  });

  bot.on('packet', () => {
    onSuccessfulConnect();
  });

  setInterval(() => {
    if (!bot.player || !bot.player.position) return;

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

    console.log(color('blue', `🚶 Yurdi: (${(pos.x + dx).toFixed(2)}, ${(pos.z + dz).toFixed(2)})`));
  }, 3000);
}

function reconnect() {
  connectAttempts = Math.min(connectAttempts + 1, 6); // cap attempts
  const delay = Math.min(5000 * Math.pow(2, connectAttempts - 1), 5 * 60 * 1000); // exponential backoff up to 5min
  console.log(color('yellow', `🔁 Reconnect attempt ${connectAttempts}, retrying in ${Math.round(delay/1000)}s...`));
  setTimeout(() => {
    createBot();
  }, delay);
}

// Start
createBot();