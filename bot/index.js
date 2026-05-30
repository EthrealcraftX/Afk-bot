const TelegramBot = require('node-telegram-bot-api');
const { TOKEN } = require('./config');
const context = require('./context');
const { loadVersions } = require('./store');
const initCommands = require('./commands');
const initRouter = require('./router');
const connectDB = require('../api/db');

// Connect to MongoDB
connectDB().catch(err => console.error('MongoDB bot connection error:', err));

// 1. Initialize Bot instance with explicit allowed_updates in polling
const bot = new TelegramBot(TOKEN, {
  polling: {
    params: {
      allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member', 'chat_member'])
    }
  }
});
console.log('🤖  MC-AFK Telegram Bot started...');

// Set bot into context
context.bot = bot;

// 2. Ensure versions files are initialized
loadVersions('java');
loadVersions('bedrock');

// 3. Initialize Commands and Router
initCommands();
initRouter();

// 4. Handle polling errors
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

module.exports = bot;
