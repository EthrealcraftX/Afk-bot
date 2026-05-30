require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.BOT_API_URL || process.env.EXPO_PUBLIC_API_URL || 'https://afk.hypepath.uz';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

if (!TOKEN) {
  console.error('❌  TELEGRAM_BOT_TOKEN is not set in .env!');
  process.exit(1);
}

module.exports = {
  TOKEN,
  API_URL,
  ADMIN_USERNAME
};
