const fs     = require('fs');
const fsp    = fs.promises;
const path   = require('path');
const crypto = require('crypto');
const { atomicWriteJsonSync, atomicWriteJsonAsync } = require('./atomicFs');

const TG_USERS_FILE      = path.join(__dirname, '..', 'data', 'tg_users.json');
const JAVA_VERSIONS_FILE = path.join(__dirname, '..', 'templates', 'java', 'version.json');
const BEDROCK_VERSIONS_FILE = path.join(__dirname, '..', 'templates', 'bedrock', 'version.json');
const TICKETS_FILE       = path.join(__dirname, '..', 'data', 'tickets.json');
const KNOWN_USERS_FILE   = path.join(__dirname, '..', 'data', 'known_users.json');

// ── In-memory state ───────────────────────────────────────────────────────────
const knownChatIds    = new Map();  // chatId → username
const usernameToChatId = new Map(); // username → chatId  (reverse)
let supportTickets    = [];
let ticketCounter     = 0;

// ── Persistence helpers ───────────────────────────────────────────────────────

function ensureDataDir() {
  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------- Tickets ----------------------------------------------------------

function loadTickets() {
  try {
    ensureDataDir();
    if (!fs.existsSync(TICKETS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
    supportTickets = Array.isArray(raw.tickets) ? raw.tickets : [];
    ticketCounter  = typeof raw.counter === 'number' ? raw.counter : 0;
    // Re-parse timestamps from strings to Date objects
    supportTickets.forEach(t => {
      if (t.timestamp) t.timestamp = new Date(t.timestamp);
      if (t.replyAt)   t.replyAt   = new Date(t.replyAt);
    });
  } catch (e) {
    console.error('[Store] Failed to load tickets:', e.message);
  }
}

function saveTickets() {
  try {
    ensureDataDir();
    atomicWriteJsonSync(TICKETS_FILE, {
      counter:  ticketCounter,
      tickets:  supportTickets
    });
  } catch (e) {
    console.error('[Store] Failed to save tickets:', e.message);
  }
}

// ---------- Known users (for admin panel / broadcast) ------------------------

function loadKnownUsers() {
  try {
    ensureDataDir();
    if (!fs.existsSync(KNOWN_USERS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(KNOWN_USERS_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      raw.forEach(({ chatId, username }) => {
        knownChatIds.set(chatId, username);
        usernameToChatId.set(username, chatId);
      });
    }
  } catch (e) {
    console.error('[Store] Failed to load known users:', e.message);
  }
}

function saveKnownUsers() {
  try {
    ensureDataDir();
    const arr = Array.from(knownChatIds.entries()).map(([chatId, username]) => ({ chatId, username }));
    atomicWriteJsonSync(KNOWN_USERS_FILE, arr);
  } catch (e) {
    console.error('[Store] Failed to save known users:', e.message);
  }
}

// ---------- TG user credentials ----------------------------------------------
// ---------- TG user credentials ----------------------------------------------
//
// SECURITY: passwords are encrypted using AES-256-GCM to prevent plaintext storage.
// CONCURRENCY: all reads go to an in-memory Map; disk writes are serialized
//   through a promise chain so concurrent saves cannot interleave.

let _encKey = null;
function getEncryptionKey() {
  if (_encKey) return _encKey;
  let keyMaterial = process.env.TG_USER_ENCRYPTION_KEY;
  if (!keyMaterial) {
    keyMaterial = process.env.SECRET_KEY || 'default_secret';
    console.warn('[Store] WARNING: TG_USER_ENCRYPTION_KEY is not set. Falling back to SECRET_KEY for Telegram user password encryption. A dedicated key is recommended.');
  }
  // Derive a 32-byte key for AES-256
  _encKey = crypto.scryptSync(keyMaterial, 'tg_salt', 32);
  return _encKey;
}

function encryptPassword(plaintext) {
  const iv = crypto.randomBytes(12); // 12 bytes is standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), ciphertext, authTag };
}

function decryptPassword(encObj) {
  try {
    if (!encObj || !encObj.iv || typeof encObj.ciphertext !== 'string' || !encObj.authTag) {
      throw new Error('Invalid encryption object structure');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(encObj.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encObj.authTag, 'hex'));
    let plaintext = decipher.update(encObj.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch (err) {
    console.error('[Store] AES Decryption/Authentication failed:', err.message);
    return null; // Return null on failure to prevent silent overwriting
  }
}

/** @type {Map<string, { username: string, encryptedPassword?: {iv: string, ciphertext: string, authTag: string}, password?: string }>} */
const _tgUsers = new Map();

// Serialized write queue: each pending write appends itself to this chain.
// This guarantees that disk writes never overlap, preventing lost-update races.
let _writeQueue = Promise.resolve();

function _loadTgUsers() {
  try {
    if (!fs.existsSync(TG_USERS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8'));
    for (const [id, entry] of Object.entries(raw)) {
      if (entry && entry.username) {
        // If it has old passwordHash (from previous broken implementation), 
        // it cannot be decrypted. We keep it as is, or ignore the hash.
        _tgUsers.set(String(id), entry);
      }
    }
  } catch (e) {
    console.error('[Store] Failed to load tg_users:', e.message);
  }
}

/**
 * Flush the in-memory Map to disk, serialized via the write queue.
 * Safe to call from any async context — concurrent callers will queue up
 * and each will see the latest Map state when its turn arrives.
 */
function _flushTgUsers() {
  _writeQueue = _writeQueue.then(async () => {
    try {
      const dir = path.dirname(TG_USERS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Snapshot the Map into a plain object for serialization.
      const out = {};
      for (const [id, entry] of _tgUsers) {
        out[id] = { username: entry.username };
        if (entry.encryptedPassword) {
          out[id].encryptedPassword = entry.encryptedPassword;
        } else if (entry.password && !entry.passwordHash) {
          out[id].password = entry.password; // Unmigrated legacy
        }
      }
      await atomicWriteJsonAsync(TG_USERS_FILE, out);
    } catch (e) {
      console.error('[Store] Failed to flush tg_users:', e.message);
    }
  });
}

/**
 * Retrieve credentials for a chatId.
 *
 * MIGRATION: Legacy entries written before this fix have a plaintext
 * 'password' field. On first access, the entry is
 * migrated in-place: the plaintext is encrypted, the plaintext field is
 * removed, and the updated entry is flushed to disk. The plaintext is
 * returned to the current caller exactly once so the in-progress login
 * can complete, then it is gone from the process permanently.
 *
 * @param {string|number} chatId
 * @returns {{ username: string, password?: string } | null}
 */
function getTgUser(chatId) {
  const key = String(chatId);
  const entry = _tgUsers.get(key);
  if (!entry) return null;

  // Modern format: return decrypted plaintext.
  if (entry.encryptedPassword) {
    const plaintext = decryptPassword(entry.encryptedPassword);
    if (plaintext === null) {
       // Decryption failed (e.g. wrong key or tampered data).
       // We log the error inside decryptPassword and return null so the
       // corrupted entry is NOT overwritten and authentication fails safely.
       return null;
    }
    return { username: entry.username, password: plaintext };
  }

  // Legacy migration: plaintext 'password' field present (old format)
  // We exclude passwordHash entries to avoid crashing on the previous broken fix.
  if (entry.password && !entry.passwordHash) {
    console.log(`[Store] Migrating legacy plaintext credentials for chatId ${chatId}`);
    const plaintext = entry.password;
    
    // Encrypt and save asynchronously — do not block the caller.
    _writeQueue = _writeQueue.then(async () => {
      try {
        const current = _tgUsers.get(key);
        if (!current) return; // user was removed
        // Overwrite with encrypted version only if still in legacy format.
        if (current.password && !current.encryptedPassword) {
          const encObj = encryptPassword(current.password);
          _tgUsers.set(key, { username: current.username, encryptedPassword: encObj });
          _flushTgUsers();
        }
      } catch (e) {
        console.error('[Store] Migration encryption failed for chatId', chatId, e.message);
      }
    });
    
    // Return with plaintext available for the caller's immediate use.
    // After this tick the plaintext is removed from the entry (see above).
    return { username: entry.username, password: plaintext };
  }

  return null; // Fallback for any weird format (like passwordHash only)
}

/**
 * Save (or overwrite) credentials for a chatId.
 * The plaintext password is encrypted before storing — it is never written
 * to disk. The write is enqueued so concurrent calls are serialised.
 *
 * @param {string|number} chatId
 * @param {string} username
 * @param {string} password  - plaintext; will be encrypted before persistence
 */
function saveTgUser(chatId, username, password) {
  const key = String(chatId);
  // Enqueue the async work so concurrent saves are serialized.
  _writeQueue = _writeQueue.then(async () => {
    try {
      const encObj = encryptPassword(password);
      _tgUsers.set(key, { username, encryptedPassword: encObj });
      
      const dir = path.dirname(TG_USERS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const out = {};
      for (const [id, entry] of _tgUsers) {
        out[id] = { username: entry.username };
        if (entry.encryptedPassword) {
          out[id].encryptedPassword = entry.encryptedPassword;
        } else if (entry.password && !entry.passwordHash) {
          out[id].password = entry.password; // Unmigrated legacy
        }
      }
      await fsp.writeFile(TG_USERS_FILE, JSON.stringify(out, null, 2), 'utf8');
    } catch (e) {
      console.error('[Store] saveTgUser failed for chatId', chatId, e.message);
    }
  });
}

// ---------- Minecraft versions -----------------------------------------------

function loadVersions(type) {
  const file = type === 'java' ? JAVA_VERSIONS_FILE : BEDROCK_VERSIONS_FILE;
  const defaultVersions = type === 'java'
    ? ["1.21.4", "1.21.1", "1.21", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9"]
    : ["1.21.2", "1.21.0", "1.20.80", "1.20.70", "1.20.60"];
  try {
    if (!fs.existsSync(file)) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      atomicWriteJsonSync(file, defaultVersions);
      return defaultVersions;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Failed to load ${type} versions:`, e);
    return defaultVersions;
  }
}

function saveVersions(type, versions) {
  const file = type === 'java' ? JAVA_VERSIONS_FILE : BEDROCK_VERSIONS_FILE;
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    atomicWriteJsonSync(file, versions);
    return true;
  } catch (e) {
    console.error(`Failed to save ${type} versions:`, e);
    return false;
  }
}

// ---------- Utilities --------------------------------------------------------

function getOpenTicketCount() {
  return supportTickets.filter(t => !t.closed).length;
}

function trackUser(chatId, username) {
  if (username && username !== 'guest') {
    const changed = knownChatIds.get(chatId) !== username;
    knownChatIds.set(chatId, username);
    usernameToChatId.set(username, chatId);
    if (changed) saveKnownUsers();
  }
}

// ── Load persisted data on startup ────────────────────────────────────────────
loadTickets();
loadKnownUsers();
_loadTgUsers();

module.exports = {
  knownChatIds,
  usernameToChatId,
  get supportTickets() { return supportTickets; },
  get ticketCounter()  { return ticketCounter;  },
  set ticketCounter(val) {
    ticketCounter = val;
    // counter is saved together with tickets in saveTickets()
  },
  getTgUser,
  saveTgUser,
  loadVersions,
  saveVersions,
  saveTickets,
  saveKnownUsers,
  getOpenTicketCount,
  _cryptoForTest: {
    getEncryptionKey,
    encryptPassword,
    decryptPassword
  },
  trackUser
};
