'use strict';

const { pingJava }      = require('./pingJava');
const { pingBedrock }   = require('./pingBedrock');
const { ResolverChain } = require('./resolvers/ResolverChain');
// Instantiate resolvers
const { AternosResolver } = require('./resolvers/AternosResolver');
const { GenericRedirectResolver } = require('./resolvers/GenericRedirectResolver');
ResolverChain.add(new AternosResolver());
ResolverChain.add(new GenericRedirectResolver());

const { getLogger }     = require('./logger');

const log = getLogger('detector');

function detectPlaceholder(result, host) {
  if (!result || result.edition !== 'bedrock') return false;

  let score = 0;
  const motd = (result.motd || '').toLowerCase();
  const sName = (result.serverName || host || '').toLowerCase();

  if (motd === 'offline') score += 5;
  if (motd.includes('aternos')) score += 5;
  if (result.players === 0 && result.maxPlayers === 1) score += 2;
  if (sName.includes('aternos')) score += 1;

  return score >= 5;
}

async function tryPing(edition, host, port) {
  try {
    let result;
    if (edition === 'java') {
      result = await pingJava(host, port);
    } else {
      result = await pingBedrock(host, port);
    }

    if (result && detectPlaceholder(result, host)) {
      result.online = false;
      result.isPlaceholder = true;
    }

    return result;
  } catch (err) {
    return null;
  }
}

function offlineResult(host, port, serverName, errorMsg) {
  return {
    edition:    'unknown',
    online:     false,
    host:       host  || 'unknown',
    port:       port  || null,
    serverName: serverName || null,
    error:      errorMsg,
  };
}

async function detectAndPing(parsed) {
  const { type, serverName, host, port, hintEdition } = parsed;

  log.info(`Detection starting for type: ${type}`);

  // 1. Try Resolver Chain
  const resolved = await ResolverChain.resolve(parsed);
  if (resolved) {
    const result = await tryPing(resolved.edition, resolved.host, resolved.port);
    if (result) {
      result.serverName = resolved.serverName;
      return result;
    }
    return offlineResult(resolved.host, resolved.port, resolved.serverName, 'Server o\'chiq yoki javob bermadi');
  }

  // 2. Aternos bare name fallback (if user just types "Horror-oyin" and it wasn't caught by a URL)
  if (type === 'aternos_name') {
    return offlineResult(
      `add.aternos.org/${serverName}`, null, serverName,
      `Iltimos, serverning to'liq manzilini yuboring (masalan: add.aternos.org/${serverName})`
    );
  }

  if (hintEdition === 'java') {
    const result = await tryPing('java', host, port);
    if (result) return result;
    return offlineResult(host, port, null, 'Java server offline');
  }

  if (hintEdition === 'bedrock') {
    const result = await tryPing('bedrock', host, port);
    if (result) return result;
    return offlineResult(host, port, null, 'Bedrock server offline');
  }

  // Auto detect
  const javaPort   = (!port || port === 25565) ? 25565 : port;
  const bedrockPort= (!port || port === 19132) ? 19132 : port;

  const javaResult = await tryPing('java', host, javaPort);
  if (javaResult) return javaResult;

  const bedrockResult = await tryPing('bedrock', host, bedrockPort);
  if (bedrockResult) return bedrockResult;

  return offlineResult(host, port, null, 'Server offline (Java ham, Bedrock ham)');
}

module.exports = { detectAndPing };
