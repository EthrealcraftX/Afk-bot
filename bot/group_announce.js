/**
 * group_announce.js — Bot-process helper
 *
 * Provides:
 *  - getLastServer()   → reads data/last_server.json (written by API when server is created)
 *  - getAtErnosJoinUrl(host) → builds add.aternos.org link if host is *.aternos.me
 *  - getPlayerState(projectId) → reads data/players/<id>.json
 *  - buildGroupServerCard(data, playerState, esc) → builds MarkdownV2 text for group messages
 */

const fs = require('fs');
const path = require('path');

const LAST_SERVER_FILE = path.join(__dirname, '..', 'data', 'last_server.json');

/**
 * Returns the last server that was announced (written by API process).
 * @returns {{ projectId, host, port, version, type, owner, createdAt }|null}
 */
function getLastServer() {
  try {
    if (!fs.existsSync(LAST_SERVER_FILE)) return null;
    return JSON.parse(fs.readFileSync(LAST_SERVER_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * If host matches something.aternos.me, returns the add.aternos.org/<name> join URL.
 * Otherwise returns null.
 * @param {string} host
 * @returns {string|null}
 */
function getAtErnosJoinUrl(host) {
  const match = String(host || '').match(/^([a-zA-Z0-9_-]+)\.aternos\.me$/i);
  if (!match) return null;
  return `https://add.aternos.org/${match[1]}`;
}

/**
 * Reads player state file for a given projectId.
 * @param {string} projectId
 * @returns {{ count: number, players: string[] }}
 */
function getPlayerState(projectId) {
  try {
    const file = path.join(__dirname, '..', 'data', 'players', `${projectId}.json`);
    if (!fs.existsSync(file)) return { count: 0, players: [] };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { count: data.count || 0, players: data.players || [] };
  } catch (e) {
    return { count: 0, players: [] };
  }
}

/**
 * Builds a MarkdownV2 server card for group announcements / keyword replies.
 *
 * @param {object} srv - { projectId, host, port, version, type, status }
 * @param {{ count: number, players: string[] }} ps - player state
 * @param {Function} esc - MarkdownV2 escape function
 * @returns {string}
 */
function buildGroupServerCard(srv, ps, esc) {
  const typeLabel  = srv.type === 'java' ? '☕ Java'    : '🟩 Bedrock';
  const statusIcon = srv.status === 'running' ? '🟢 Online' : '🔴 Offline';

  const playerLine = ps.count === 0
    ? `👥 O'yinchilar: _Hali yo'q_`
    : `👥 O'yinchilar \\(${esc(String(ps.count))}\\): ${ps.players.map(p => `\`${esc(p)}\``).join(', ')}`;

  return (
    `🎮 *Minecraft Server*\n\n` +
    `🌐 \`${esc(srv.host)}:${esc(String(srv.port))}\`\n` +
    `🏷 Versiya: \`${esc(srv.version)}\`  •  ${esc(typeLabel)}\n` +
    `📡 Status: ${esc(statusIcon)}\n` +
    `${playerLine}`
  );
}

module.exports = {
  getLastServer,
  getAtErnosJoinUrl,
  getPlayerState,
  buildGroupServerCard
};
