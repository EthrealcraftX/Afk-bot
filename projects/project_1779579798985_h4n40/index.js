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
const path = require('path');

let bot = null;
let autoRestartTimer = null;
let connectTimer = null;
let reconnectTimer = null;
let actionInterval = null;
let isReconnecting = false;
let connectAttempts = 0;
let hasConnected = false;
let tickCounter = BigInt(0);

let botPosition = null;

function pickRandomUsernameFromFile() {
  try {
    const filePath = path.join(__dirname, 'username.txt');
    const data = fs.readFileSync(filePath, 'utf8');
    const names = data.split('\n').map(n => n.trim()).filter(Boolean);
    if (names.length === 0) return 'BedrockBot_' + Math.floor(1000 + Math.random() * 9000);
    const index = Math.floor(Math.random() * names.length);
    return names[index];
  } catch (err) {
    console.error(color('red', 'username.txt fayl o\'qib bo\'lmadi:'), err.message);
    return 'BedrockBot_' + Math.floor(1000 + Math.random() * 9000);
  }
}

function cleanup() {
  hasConnected = false;
  botPosition = null;
  tickCounter = BigInt(0);

  if (autoRestartTimer) { clearTimeout(autoRestartTimer); autoRestartTimer = null; }
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (actionInterval) { clearInterval(actionInterval); actionInterval = null; }
  if (bot) {
    try { bot.removeAllListeners(); bot.disconnect(); } catch (e) {}
    bot = null;
  }
}

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
      skipPing: true
    });
  } catch (err) {
    console.error(color('red', `⚠️ Botni yaratishda xato: ${err.message}`));
    triggerReconnect(`CreationError: ${err.message}`);
    return;
  }

  const CONNECT_TIMEOUT = parseInt(process.env.CONNECT_TIMEOUT_MS) || 20000;
  connectTimer = setTimeout(() => {
    if (!hasConnected) {
      console.error(color('red', `⌛ Connection timed out to ${config.host}:${config.port} after ${CONNECT_TIMEOUT}ms`));
      triggerReconnect('ConnectionTimeout');
    }
  }, CONNECT_TIMEOUT);

  bot.on('join', () => {
    hasConnected = true;
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    connectAttempts = 0;
    console.log(color('green', `✅ '${username}' serverga muvaffaqiyatli qo'shildi: ${config.host}:${config.port}`));

    const RECONNECT_HOURS = config.reconnectHours || 2;
    const RECONNECT_MS = RECONNECT_HOURS * 60 * 60 * 1000;
    autoRestartTimer = setTimeout(() => {
      console.log(color('magenta', `⏳ ${RECONNECT_HOURS} soat o'tdi — bot qayta ulanadi.`));
      triggerReconnect('ScheduledRotation');
    }, RECONNECT_MS);

    setupMovement();
  });

  bot.on('move_player', (packet) => {
    if (packet && packet.position) {
      botPosition = { x: packet.position.x, y: packet.position.y, z: packet.position.z };
    }
  });

  bot.on('correct_player_move_prediction', (packet) => {
    if (packet && packet.position) {
      botPosition = { x: packet.position.x, y: packet.position.y, z: packet.position.z };
    }
  });

  bot.on('disconnect', (packet) => {
    const reason = packet && (packet.message || packet.reason) ? (packet.message || packet.reason) : 'Unknown';
    console.log(color('red', `❌ Bot uzildi. Sabab: ${reason}`));
    triggerReconnect(`Disconnect: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(color('red', '⚠️ Botda xatolik:'), err.message || err);
    triggerReconnect(`ErrorEvent: ${err.message || 'unknown'}`);
  });

  bot.on('close', () => {
    console.log(color('yellow', '🔌 Server bilan ulanish yopildi.'));
    if (hasConnected || connectAttempts > 0) {
      triggerReconnect('ConnectionClosed');
    }
  });
}

function buildMovePacket(newX, y, newZ) {
  tickCounter += BigInt(1);

  // Base packet fields all versions support
  const packet = {
    runtime_id: 1,
    position: { x: newX, y: y, z: newZ },
    pitch: 0,
    yaw: Math.random() * 360,
    head_yaw: 0,
    mode: 0,
    on_ground: true,
  };

  // Try to detect schema by checking what proto fields exist
  const proto = bot.serializer && bot.serializer.proto;
  const schema = proto && proto.types && proto.types.move_player;

  if (schema) {
    const schemaStr = JSON.stringify(schema);
    if (schemaStr.includes('ridden_runtime_entity_id')) {
      packet.ridden_runtime_entity_id = BigInt(0);
    }
    if (schemaStr.includes('"tick"')) {
      packet.tick = tickCounter;
    }
    if (schemaStr.includes('transaction')) {
      packet.transaction = {
        transaction_type: 0,
        reasons: [],
        tick: tickCounter
      };
    }
  } else {
    // Fallback: try minimal packet, most versions accept this
    packet.ridden_runtime_entity_id = BigInt(0);
    packet.tick = tickCounter;
  }

  return packet;
}

function setupMovement() {
  if (actionInterval) clearInterval(actionInterval);

  actionInterval = setInterval(() => {
    if (!bot) return;

    try {
      const pos = botPosition || { x: 0, y: 64, z: 0 };
      const newX = pos.x + (Math.random() - 0.5) * 2;
      const newZ = pos.z + (Math.random() - 0.5) * 2;

      botPosition = { x: newX, y: pos.y, z: newZ };

      const packet = buildMovePacket(newX, pos.y, newZ);
      bot.write('move_player', packet);

      console.log(color('blue', `🚶 AFK Yurish: (${newX.toFixed(2)}, ${pos.y.toFixed(2)}, ${newZ.toFixed(2)})`));
    } catch (e) {
      console.error('Failed to execute movement packet:', e.message);
    }
  }, config.movementInterval || 5000);
}

function triggerReconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;

  cleanup();

  connectAttempts = Math.min(connectAttempts + 1, 8);
  const delay = Math.min(5000 * Math.pow(2, connectAttempts - 1), 3 * 60 * 1000);

  console.log(color('yellow', `🔁 Reconnect rejalashtirildi. Sabab: "${reason}".`));
  console.log(color('yellow', `⌛ Kutish: ${Math.round(delay / 1000)}s (Urinish #${connectAttempts})...`));

  reconnectTimer = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

process.on('uncaughtException', (err) => {
  console.error(color('red', `🔥 Unhandled Exception: ${err.message}`));
  console.error(err.stack);
  triggerReconnect(`UncaughtException: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error(color('red', `🔥 Unhandled Rejection: ${reason}`));
  triggerReconnect(`UnhandledRejection: ${reason}`);
});

createBot();
