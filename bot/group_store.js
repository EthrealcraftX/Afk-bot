const fs = require('fs');
const path = require('path');
const { atomicWriteJsonSync } = require('./atomicFs');

const GROUP_CHATS_FILE = path.join(__dirname, '..', 'data', 'group_chats.json');

function getGroupChats() {
  try {
    if (!fs.existsSync(GROUP_CHATS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(GROUP_CHATS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function registerGroupChat(chatId, title) {
  try {
    const dir = path.dirname(GROUP_CHATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const groups = getGroupChats();
    const existing = groups.find(g => g.chatId === String(chatId));
    if (!existing) {
      groups.push({
        chatId: String(chatId),
        title: title || 'Unknown',
        addedAt: new Date().toISOString()
      });
      atomicWriteJsonSync(GROUP_CHATS_FILE, groups);
      console.log(`[GroupStore] Registered group: ${chatId} (${title})`);
    }
  } catch (e) {
    console.error('[GroupStore] Failed to register group:', e);
  }
}

function removeGroupChat(chatId) {
  try {
    const groups = getGroupChats();
    const filtered = groups.filter(g => g.chatId !== String(chatId));
    if (filtered.length < groups.length) {
      atomicWriteJsonSync(GROUP_CHATS_FILE, filtered);
      console.log(`[GroupStore] Removed group: ${chatId}`);
    }
  } catch (e) {
    console.error('[GroupStore] Failed to remove group:', e);
  }
}

module.exports = { getGroupChats, registerGroupChat, removeGroupChat };
