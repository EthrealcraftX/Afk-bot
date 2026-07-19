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

// 4. Start Background Jobs
const { BackgroundJobs } = require('./jobs/healthCheck');
BackgroundJobs.startHealthChecker();

// 4. Handle polling errors
bot.on('polling_error', (err) => {
  const code = err.code || '';
  const message = err.message || '';

  // 409 Conflict means another bot instance is already polling Telegram.
  // Continuing is pointless — every subsequent getUpdates call will also fail.
  // Exit immediately so the operator (or PM2 / systemd) knows what happened.
  if (code === 'ETELEGRAM' && message.includes('409')) {
    console.error(
      '❌ [Bot] FATAL: 409 Conflict — another instance of this bot is already running.\n' +
      '   Stop the other instance and restart this one.\n' +
      '   Tip: run  Get-WmiObject Win32_Process | Where-Object Name -eq node.exe  to find it.'
    );
    process.exit(1);
  }

  console.error('Polling error:', code, message);
});

module.exports = bot;
