const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      token:     null,
      username:  null,
      state:     null,
      draft:     {},
      lastMsgId: null
    });
  }
  return sessions.get(chatId);
}

module.exports = {
  sessions,
  getSession
};
