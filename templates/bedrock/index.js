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

const fs = require('fs');
const path = require('path');
const { classify } = require('../../errors/DisconnectClassifier');

let config;
try {
  const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  config = JSON.parse(raw);
} catch (e) {
  console.error('❌ Config yuklashda xato:', e.message);
  process.exit(1);
}
// FIXED: config.json read wrapped in try/catch before uncaughtException is registered

// ── PLAYER STATE FILE ──────────────────────────────────────────────────────
const projectId = config.projectId || path.basename(path.resolve(__dirname));
const playersDir = path.join(__dirname, '..', '..', 'data', 'players');
const playerStateFile = path.join(playersDir, `${projectId}.json`);

function writePlayerState() {
  try {
    if (!fs.existsSync(playersDir)) fs.mkdirSync(playersDir, { recursive: true });
    const players = Object.values(playerList).map(p => p.username).filter(Boolean);
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

let bot = null;
let autoRestartTimer = null;
let connectTimer = null;
let reconnectTimer = null;
let actionInterval = null;
let waitForPosTimer = null;
let isReconnecting = false;
let connectAttempts = 0;
let hasConnected = false;
let tickCounter = BigInt(0);

let botPosition = null;
let playerList = {};

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
  clearPlayerState();
  hasConnected = false;
  botPosition = null;
  tickCounter = BigInt(0);
  playerList = {};

  if (autoRestartTimer) { clearTimeout(autoRestartTimer); autoRestartTimer = null; }
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (actionInterval) { clearInterval(actionInterval); actionInterval = null; }
  if (waitForPosTimer) { clearInterval(waitForPosTimer); waitForPosTimer = null; }
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

  bot.on('start_game', (packet) => {
    if (packet.player_position) {
      botPosition = {
        x: packet.player_position.x,
        y: packet.player_position.y,
        z: packet.player_position.z
      };
      console.log(color('green', `📍 Boshlang'ich pozitsiya: (${botPosition.x.toFixed(2)}, ${botPosition.y.toFixed(2)}, ${botPosition.z.toFixed(2)})`));
    }
  });

  bot.on('text', (packet) => {
    const sender = packet.source_name || '';
    const message = packet.message || '';
    if (!sender || sender === bot.options.username) return;
    console.log(color('green', `💬 [${sender}]: ${message}`));
  });

  bot.on('player_list', (packet) => {
    if (!packet.records || !packet.records.records) return;
    packet.records.records.forEach(player => {
      if (packet.records.type === 'add') {
        playerList[player.uuid] = { username: player.username, uuid: player.uuid };
        console.log(color('cyan', `➕ Kirdi: ${player.username} | Jami: ${Object.keys(playerList).length} o'yinchi`));
      } else {
        const name = playerList[player.uuid]?.username || 'Noma\'lum';
        delete playerList[player.uuid];
        console.log(color('yellow', `➖ Chiqdi: ${name} | Jami: ${Object.keys(playerList).length} o'yinchi`));
      }
    });
    writePlayerState();
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
  if (actionInterval) { clearInterval(actionInterval); actionInterval = null; }

  let positionReady = false;
  let logTickCount = 0;

  function startMovementInterval() {
    if (actionInterval) return;
    actionInterval = setInterval(() => {
      if (!bot) return;

      try {
        const pos = botPosition || { x: 0, y: 64, z: 0 };
        const newX = pos.x + (Math.random() - 0.5) * 2;
        const newZ = pos.z + (Math.random() - 0.5) * 2;

        botPosition = { x: newX, y: pos.y, z: newZ };

        const packet = buildMovePacket(newX, pos.y, newZ);
        bot.write('move_player', packet);

        logTickCount++;
        if (logTickCount % 12 === 0) {
          console.log(color('blue', `🚶 AFK pozitsiya: (${newX.toFixed(2)}, ${pos.y.toFixed(2)}, ${newZ.toFixed(2)})`));
        }
        // FIXED: logging reduced from 720/hour to 60/hour per bot
      } catch (e) {
        console.error('Failed to execute movement packet:', e.message);
        if (actionInterval) {
          clearInterval(actionInterval);
          actionInterval = null;
        }
        console.error('🔌 Socket yopiq, harakat intervali to\'xtatildi');
        if (!isReconnecting) {
          triggerReconnect('SocketWriteError');
        }
        // FIXED: dead socket no longer hammered by movement interval
      }
    }, config.movementInterval || 5000);
  }

  waitForPosTimer = setInterval(() => {
    if (botPosition && botPosition.x !== undefined) {
      positionReady = true;
      clearInterval(waitForPosTimer);
      startMovementInterval();
    }
  }, 500);

  // Fallback: give up waiting after 8 seconds and start anyway
  setTimeout(() => {
    if (!positionReady) {
      clearInterval(waitForPosTimer);
      if (!actionInterval) startMovementInterval();
    }
  }, 8000);
}

function triggerReconnect(reason) {
  const MAX_RECONNECT = 20;
  if (connectAttempts >= MAX_RECONNECT) {
    console.error(`❌ ${MAX_RECONNECT} ta ulanish urinishi muvaffaqiyatsiz. Bot to'xtatildi.`);
    process.exit(1);
  }
  // FIXED: infinite reconnect loop to permanently offline servers now stops after ~1 hour

  const decision = classify(reason);
  if (!decision.shouldRetry) {
    console.error(color('red', `\n❌ Automatic reconnect stopped.`));
    console.error(color('red', `  Category:    ${decision.category}`));
    console.error(color('red', `  Reason:      ${decision.reason}`));
    console.error(color('red', `  Confidence:  ${decision.confidence}`));
    console.error(color('red', `  Retry:       false`));
    if (decision.adminAction) {
      console.error(color('red', `  Admin Action: ${decision.adminAction}`));
    }
    cleanup();
    process.exit(1);
  }

  if (isReconnecting) return;
  isReconnecting = true;

  cleanup();

  connectAttempts = connectAttempts + 1;
  const delay = Math.min(5000 * Math.pow(2, Math.min(connectAttempts, 8) - 1), 3 * 60 * 1000);

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

createBot();