const fs = require('fs');
const path = require('path');

const TG_USERS_FILE = path.join(__dirname, '..', 'data', 'tg_users.json');
const JAVA_VERSIONS_FILE = path.join(__dirname, '..', 'templates', 'java', 'version.json');
const BEDROCK_VERSIONS_FILE = path.join(__dirname, '..', 'templates', 'bedrock', 'version.json');

const knownChatIds = new Map();   // chatId → username
const usernameToChatId = new Map();   // username → chatId  (reverse)
const supportTickets = [];
let ticketCounter = 0;

function getTgUser(chatId) {
  try {
    if (!fs.existsSync(TG_USERS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8'));
    return data[String(chatId)] || null;
  } catch (e) { return null; }
}

function saveTgUser(chatId, username, password) {
  try {
    const dir = path.dirname(TG_USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data = {};
    if (fs.existsSync(TG_USERS_FILE)) {
      data = JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8'));
    }
    data[String(chatId)] = { username, password };
    fs.writeFileSync(TG_USERS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save tg user credentials:', e);
  }
}

function loadVersions(type) {
  const file = type === 'java' ? JAVA_VERSIONS_FILE : BEDROCK_VERSIONS_FILE;
  const defaultVersions = type === 'java'
    ? ["1.21.4", "1.21.1", "1.21", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9"]
    : ["1.21.2", "1.21.0", "1.20.80", "1.20.70", "1.20.60"];
  try {
    if (!fs.existsSync(file)) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(defaultVersions, null, 2));
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
    fs.writeFileSync(file, JSON.stringify(versions, null, 2));
    return true;
  } catch (e) {
    console.error(`Failed to save ${type} versions:`, e);
    return false;
  }
}

function getOpenTicketCount() {
  return supportTickets.filter(t => !t.closed).length;
}

function trackUser(chatId, username) {
  if (username && username !== 'guest') {
    knownChatIds.set(chatId, username);
    usernameToChatId.set(username, chatId);
  }
}

module.exports = {
  knownChatIds,
  usernameToChatId,
  supportTickets,
  get ticketCounter() { return ticketCounter; },
  set ticketCounter(val) { ticketCounter = val; },
  getTgUser,
  saveTgUser,
  loadVersions,
  saveVersions,
  getOpenTicketCount,
  trackUser
};
