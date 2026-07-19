'use strict';

/**
 * JoinExecutor.js
 *
 * Creates the bedrock-protocol client and manages the live bot session.
 *
 * Design:
 *  - Returns a Promise<BotSession> that resolves on `join` (fully in-game)
 *    or rejects with the first fatal error.
 *  - All socket listeners are registered in the constructor and cleaned up
 *    on disconnect/error.
 *  - The AFK movement loop lives here because it is a concern of the session,
 *    not the retry logic.
 *  - Does NOT implement reconnect — that belongs to ConnectionManager.
 */

const fs   = require('fs');
const path = require('path');
const { Events } = require('./Logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @typedef {{
 *   bot: any,
 *   username: string,
 *   joinedAt: number,
 *   disconnect: function(): void
 * }} BotSession
 */

class JoinExecutor {
  /**
   * @param {{
   *   logger:  import('./Logger').Logger,
   *   metrics: import('./MetricsCollector').MetricsCollector,
   *   config: {
   *     host: string,
   *     port: number,
   *     version: string,
   *     joinTimeoutMs: number,
   *     movementIntervalMs: number,
   *     usernameFile?: string,
   *     projectId?: string
   *   }
   * }} deps
   */
  constructor({ logger, metrics, config }) {
    this._logger  = logger;
    this._metrics = metrics;
    this._config  = config;

    this._session     = null;     // current BotSession or null
    this._actionTimer = null;     // AFK movement interval
    this._posTimer    = null;     // position-wait poll
    this._playerList  = {};       // uuid → { username }
    this._botPosition = null;
    this._tickCounter = BigInt(0);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Attempt to join the server.
   * Resolves with BotSession when `join` fires, rejects on any error before that.
   *
   * @returns {Promise<BotSession>}
   */
  join() {
    if (this._session) {
      throw new Error('[JoinExecutor] join() called while a session is already active');
    }

    return new Promise((resolve, reject) => {
      const { host, port, version, joinTimeoutMs } = this._config;
      const username = this._pickUsername();

      this._logger.info(Events.JOIN_ATTEMPT, { host, port, version, username });
      this._metrics.recordAttempt();

      let createClient;
      try {
        createClient = require('bedrock-protocol').createClient;
      } catch (err) {
        return reject(new Error('bedrock-protocol not installed: ' + err.message));
      }

      let bot;
      try {
        bot = createClient({
          host,
          port,
          username,
          offline: true,
          version,
          skipPing: true,   // we already pinged — don't double-up
        });
      } catch (err) {
        return reject(new Error('createClient threw: ' + err.message));
      }

      let settled = false;

      // ── Join timeout ──────────────────────────────────────────────────────

      const timeout = joinTimeoutMs ?? 25_000;
      const timeoutHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          this._cleanupBot(bot);
          reject(new Error(`ConnectionTimeout: join did not fire within ${timeout}ms`));
        }
      }, timeout);

      // ── Helper ────────────────────────────────────────────────────────────

      const settle = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        fn();
      };

      // ── Event: join ───────────────────────────────────────────────────────

      bot.on('join', () => {
        settle(() => {
          const session = {
            bot,
            username,
            joinedAt: Date.now(),
            disconnect: () => this._cleanupBot(bot),
          };
          this._session = session;
          this._metrics.recordJoinSuccess();
          this._logger.info(Events.JOIN_SUCCESS, { username, host, port });
          this._startAfk(bot);
          resolve(session);
        });
      });

      // ── Event: start_game ─────────────────────────────────────────────────

      bot.on('start_game', (packet) => {
        if (packet?.player_position) {
          this._botPosition = {
            x: packet.player_position.x,
            y: packet.player_position.y,
            z: packet.player_position.z,
          };
        }
      });

      // ── Event: move_player / correct_player_move_prediction ───────────────

      bot.on('move_player', (p) => {
        if (p?.position) this._botPosition = p.position;
      });
      bot.on('correct_player_move_prediction', (p) => {
        if (p?.position) this._botPosition = p.position;
      });

      // ── Event: player_list ────────────────────────────────────────────────

      bot.on('player_list', (packet) => {
        if (!packet?.records?.records) return;
        for (const player of packet.records.records) {
          if (packet.records.type === 'add') {
            this._playerList[player.uuid] = { username: player.username };
          } else {
            delete this._playerList[player.uuid];
          }
        }
        this._writePlayerState(this._config.projectId);
      });

      // ── Event: text ───────────────────────────────────────────────────────

      bot.on('text', (packet) => {
        const sender = packet.source_name || '';
        if (sender && sender !== username) {
          this._logger.debug('CHAT', { sender, message: packet.message || '' });
        }
      });

      // ── Event: disconnect ─────────────────────────────────────────────────

      bot.on('disconnect', (packet) => {
        const reason = packet?.message || packet?.reason || 'Unknown';
        this._logger.info(Events.DISCONNECT, { reason });
        settle(() => {
          this._teardown();
          reject(new Error(`Disconnect: ${reason}`));
        });
        if (settled) {
          // Already joined — session disconnected after the fact
          this._teardown();
        }
      });

      // ── Event: error ─────────────────────────────────────────────────────

      bot.on('error', (err) => {
        const msg = err?.message || String(err);
        settle(() => {
          this._cleanupBot(bot);
          reject(new Error(`ErrorEvent: ${msg}`));
        });
        if (settled) {
          this._teardown();
        }
      });

      // ── Event: close ─────────────────────────────────────────────────────

      bot.on('close', () => {
        settle(() => {
          this._cleanupBot(bot);
          reject(new Error('ConnectionClosed'));
        });
        if (settled) {
          this._teardown();
        }
      });
    });
  }

  /**
   * Disconnect the active session cleanly.
   * Safe to call even if no session is active.
   */
  disconnect() {
    this._teardown();
  }

  /**
   * Is there currently an active bot session?
   */
  hasSession() {
    return this._session !== null;
  }

  playerCount() {
    return Object.keys(this._playerList).length;
  }

  // ── AFK Movement ────────────────────────────────────────────────────────────

  _startAfk(bot) {
    const intervalMs = this._config.movementIntervalMs ?? 5000;
    let logTick = 0;
    let posReady = false;

    const startInterval = () => {
      if (this._actionTimer) return;
      this._actionTimer = setInterval(() => {
        if (!bot) return;
        try {
          const pos = this._botPosition ?? { x: 0, y: 64, z: 0 };
          const newX = pos.x + (Math.random() - 0.5) * 2;
          const newZ = pos.z + (Math.random() - 0.5) * 2;
          this._botPosition = { x: newX, y: pos.y, z: newZ };
          bot.write('move_player', this._buildMovePacket(bot, newX, pos.y, newZ));

          logTick++;
          if (logTick % 12 === 0) {
            this._logger.debug('AFK_MOVE', {
              x: newX.toFixed(2),
              y: pos.y.toFixed(2),
              z: newZ.toFixed(2),
            });
          }
        } catch (e) {
          this._logger.warn('AFK_WRITE_ERROR', { error: e.message });
          this._teardown();
        }
      }, intervalMs);
    };

    // Wait up to 8s for the position to arrive; fallback to (0, 64, 0)
    this._posTimer = setInterval(() => {
      if (this._botPosition) {
        posReady = true;
        clearInterval(this._posTimer);
        this._posTimer = null;
        startInterval();
      }
    }, 500);

    setTimeout(() => {
      if (!posReady && this._posTimer) {
        clearInterval(this._posTimer);
        this._posTimer = null;
        startInterval();
      }
    }, 8000);
  }

  _buildMovePacket(bot, newX, y, newZ) {
    this._tickCounter += BigInt(1);
    const packet = {
      runtime_id: 1,
      position:   { x: newX, y, z: newZ },
      pitch: 0,
      yaw:   Math.random() * 360,
      head_yaw: 0,
      mode:     0,
      on_ground: true,
    };

    const proto = bot.serializer?.proto;
    const schema = proto?.types?.move_player;
    if (schema) {
      const s = JSON.stringify(schema);
      if (s.includes('ridden_runtime_entity_id')) packet.ridden_runtime_entity_id = BigInt(0);
      if (s.includes('"tick"'))                   packet.tick = this._tickCounter;
      if (s.includes('transaction'))              packet.transaction = {
        transaction_type: 0, reasons: [], tick: this._tickCounter
      };
    } else {
      packet.ridden_runtime_entity_id = BigInt(0);
      packet.tick = this._tickCounter;
    }
    return packet;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  _teardown() {
    if (this._session) {
      this._metrics.recordDisconnect();
      this._session = null;
    }
    if (this._actionTimer) { clearInterval(this._actionTimer); this._actionTimer = null; }
    if (this._posTimer)    { clearInterval(this._posTimer);    this._posTimer    = null; }
    this._botPosition = null;
    this._playerList  = {};
    this._tickCounter = BigInt(0);
    this._writePlayerState(this._config.projectId); // clear player list
  }

  _cleanupBot(bot) {
    try { bot.removeAllListeners(); bot.disconnect(); } catch (_) {}
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _pickUsername() {
    const file = this._config.usernameFile || path.join(__dirname, '..', 'username.txt');
    try {
      const names = fs.readFileSync(file, 'utf8')
        .split('\n').map(n => n.trim()).filter(Boolean);
      if (names.length > 0) return names[Math.floor(Math.random() * names.length)];
    } catch (_) {}
    return 'BedrockBot_' + Math.floor(1000 + Math.random() * 9000);
  }

  _writePlayerState(projectId) {
    try {
      const playersDir = path.join(__dirname, '..', '..', '..', 'data', 'players');
      if (!fs.existsSync(playersDir)) fs.mkdirSync(playersDir, { recursive: true });
      const players = Object.values(this._playerList).map(p => p.username).filter(Boolean);
      fs.writeFileSync(
        path.join(playersDir, `${projectId}.json`),
        JSON.stringify({ projectId, count: players.length, players, updatedAt: new Date().toISOString() }, null, 2)
      );
    } catch (_) {}
  }
}

module.exports = { JoinExecutor };
