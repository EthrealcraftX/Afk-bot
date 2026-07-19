'use strict';

const dgram  = require('dgram');
const crypto = require('crypto');
const { config } = require('./config');
const { getLogger } = require('./logger');

const log = getLogger('bedrock-ping');

const RAKNET_MAGIC = Buffer.from([
  0x00, 0xFF, 0xFF, 0x00, 0xFE, 0xFE, 0xFE, 0xFE,
  0xFD, 0xFD, 0xFD, 0xFD, 0x12, 0x34, 0x56, 0x78,
]);

const UNCONNECTED_PING_ID  = 0x01;
const UNCONNECTED_PONG_ID  = 0x1C;

function buildUnconnectedPing() {
  const packet = Buffer.allocUnsafe(1 + 8 + 16 + 8);
  let offset = 0;

  packet.writeUInt8(UNCONNECTED_PING_ID, offset);
  offset += 1;

  packet.writeBigInt64BE(BigInt(Date.now()), offset);
  offset += 8;

  RAKNET_MAGIC.copy(packet, offset);
  offset += 16;

  const guid = crypto.randomBytes(8);
  guid.copy(packet, offset);

  return packet;
}

function parseServerIdString(raw) {
  const parts = raw.split(';');
  const motd        = (parts[1]  || '').trim();
  const protocol    = parseInt(parts[2]  || '0',  10);
  const version     = (parts[3]  || '').trim();
  const players     = parseInt(parts[4]  || '0',  10);
  const maxPlayers  = parseInt(parts[5]  || '0',  10);
  const gameMode    = (parts[8]  || undefined);

  return {
    motd:       motd || 'Bedrock Server',
    protocol:   isNaN(protocol)   ? 0 : protocol,
    version:    version            || 'Unknown',
    players:    isNaN(players)     ? 0 : players,
    maxPlayers: isNaN(maxPlayers)  ? 0 : maxPlayers,
    gameMode:   gameMode           || undefined,
  };
}

function extractPongServerIdString(buf) {
  if (buf.length < 35) return null;

  const packetId = buf.readUInt8(0);
  if (packetId !== UNCONNECTED_PONG_ID) return null;

  const magicOffset = 17;
  for (let i = 0; i < RAKNET_MAGIC.length; i++) {
    if (buf[magicOffset + i] !== RAKNET_MAGIC[i]) return null;
  }

  const strOffset = 33;
  const strLen = buf.readUInt16BE(strOffset);

  if (buf.length < strOffset + 2 + strLen) return null;

  return buf.subarray(strOffset + 2, strOffset + 2 + strLen).toString('utf8');
}

async function pingBedrock(host, port) {
  const resolvedPort = port || 19132;
  log.info(`Bedrock Ping: ${host}:${resolvedPort}`);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const socket  = dgram.createSocket('udp4');
    let   settled = false;
    let   retryTimer = null;
    let   retryCount  = 0;
    const MAX_RETRIES = 2;

    const cleanup = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      try { socket.close(); } catch (_) {}
      if (err) reject(err);
    };

    const timer = setTimeout(
      () => cleanup(new Error('Bedrock ping timed out')),
      config.bedrockPingTimeoutMs
    );

    const sendPing = () => {
      const packet = buildUnconnectedPing();
      socket.send(packet, 0, packet.length, resolvedPort, host, (err) => {
        if (err && !settled && retryCount === 0) cleanup(err);
      });
    };

    const scheduleRetry = () => {
      if (retryCount >= MAX_RETRIES || settled) return;
      retryCount++;
      retryTimer = setTimeout(() => {
        if (!settled) {
          sendPing();
          scheduleRetry();
        }
      }, 600);
    };

    socket.on('error', cleanup);

    socket.on('message', (msg) => {
      if (settled) return;

      const serverIdStr = extractPongServerIdString(msg);
      if (!serverIdStr) return;

      const latencyMs = Date.now() - startTime;
      const parsed    = parseServerIdString(serverIdStr);

      const status = {
        edition:    'bedrock',
        online:     true,
        host,
        port:       resolvedPort,
        version:    parsed.version,
        protocol:   parsed.protocol,
        players:    parsed.players,
        maxPlayers: parsed.maxPlayers,
        motd:       parsed.motd,
        gameMode:   parsed.gameMode,
        latencyMs,
      };

      settled = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      try { socket.close(); } catch (_) {}
      resolve(status);
    });

    socket.bind(0, () => {
      sendPing();
      scheduleRetry();
    });
  });
}

module.exports = { pingBedrock };
