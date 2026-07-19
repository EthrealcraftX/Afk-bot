'use strict';

const net  = require('net');
const dns  = require('dns').promises;
const { config } = require('./config');
const { getLogger } = require('./logger');

const log = getLogger('java-ping');

function encodeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7F;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function decodeVarInt(buf, offset) {
  let value     = 0;
  let shift     = 0;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= buf.length) return null;
    const byte = buf[offset + bytesRead];
    bytesRead++;
    value |= (byte & 0x7F) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
    if (shift >= 32) throw new Error('VarInt exceeds 32 bits');
  }
  return { value, bytesRead };
}

function buildHandshake(host, port) {
  const hostBytes = Buffer.from(host, 'utf8');
  const portBuf   = Buffer.allocUnsafe(2);
  portBuf.writeUInt16BE(port, 0);

  const payload = Buffer.concat([
    encodeVarInt(-1),
    encodeVarInt(hostBytes.length),
    hostBytes,
    portBuf,
    encodeVarInt(1),
  ]);

  const packetId  = encodeVarInt(0x00);
  const packetLen = encodeVarInt(packetId.length + payload.length);
  return Buffer.concat([packetLen, packetId, payload]);
}

function buildStatusRequest() {
  const packetId  = encodeVarInt(0x00);
  const packetLen = encodeVarInt(packetId.length);
  return Buffer.concat([packetLen, packetId]);
}

function tryParseResponse(buf) {
  let offset = 0;

  const lenResult = decodeVarInt(buf, offset);
  if (!lenResult) return null;
  offset += lenResult.bytesRead;

  const packetBodyLen = lenResult.value;
  if (buf.length < offset + packetBodyLen) return null;

  const idResult = decodeVarInt(buf, offset);
  if (!idResult) return null;
  offset += idResult.bytesRead;

  if (idResult.value !== 0x00) {
    throw new Error(`Unexpected packet ID 0x${idResult.value.toString(16)}`);
  }

  const strLenResult = decodeVarInt(buf, offset);
  if (!strLenResult) return null;
  offset += strLenResult.bytesRead;

  const jsonLen = strLenResult.value;
  if (buf.length < offset + jsonLen) return null;

  const jsonStr = buf.subarray(offset, offset + jsonLen).toString('utf8');
  return { json: JSON.parse(jsonStr), bytesConsumed: offset + jsonLen };
}

function extractMotd(description) {
  if (!description) return '';
  if (typeof description === 'string') return description.replace(/§[0-9a-fklmnor]/gi, '').trim();
  if (typeof description === 'object') {
    let text = description.text || '';
    if (Array.isArray(description.extra)) {
      for (const part of description.extra) {
        text += typeof part === 'string' ? part : (part.text || '');
      }
    }
    return text.replace(/§[0-9a-fklmnor]/gi, '').trim();
  }
  return '';
}

function extractSoftware(versionName) {
  if (!versionName) return undefined;
  const known = ['Paper', 'Spigot', 'CraftBukkit', 'Purpur', 'Pufferfish',
                 'Waterfall', 'Velocity', 'BungeeCord', 'Fabric', 'Forge',
                 'NeoForge', 'Mohist', 'Magma', 'Arclight'];
  for (const name of known) {
    if (versionName.includes(name)) return name;
  }
  return undefined;
}

async function resolveSrv(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records && records.length > 0) {
      const rec = records.sort((a, b) => a.priority - b.priority)[0];
      return { host: rec.name, port: rec.port };
    }
  } catch (_) {}
  return null;
}

async function pingJava(inputHost, inputPort) {
  const srv = await resolveSrv(inputHost);
  const host = srv ? srv.host : inputHost;
  const port = srv ? srv.port : (inputPort || 25565);

  log.info(`Java Ping: ${host}:${port}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const socket    = new net.Socket();
    let   buffer    = Buffer.alloc(0);
    let   settled   = false;

    const cleanup = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
    };

    const timer = setTimeout(
      () => cleanup(new Error(`Java ping timed out`)),
      config.javaPingTimeoutMs
    );

    socket.on('error', cleanup);
    socket.on('close', () => cleanup(new Error('Connection closed')));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const result = tryParseResponse(buffer);
        if (!result) return;

        const { json } = result;
        const latencyMs = Date.now() - startTime;

        const versionObj  = json.version      || {};
        const playersObj  = json.players       || {};
        const versionName = versionObj.name    || 'Unknown';

        const status = {
          edition:    'java',
          online:     true,
          host:       inputHost,
          port,
          version:    versionName,
          protocol:   versionObj.protocol || 0,
          players:    playersObj.online   || 0,
          maxPlayers: playersObj.max      || 0,
          motd:       extractMotd(json.description),
          software:   extractSoftware(versionName),
          latencyMs,
        };

        cleanup();
        resolve(status);
      } catch (e) {
        cleanup(e);
      }
    });

    socket.connect(port, host, () => {
      socket.write(Buffer.concat([
        buildHandshake(host, port),
        buildStatusRequest(),
      ]));
    });
  });
}

module.exports = { pingJava };
