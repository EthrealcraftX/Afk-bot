require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let rawApiUrl = process.env.BOT_API_URL || process.env.EXPO_PUBLIC_API_URL || 'https://afk.hypepath.uz';
if (rawApiUrl && !rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://')) {
  rawApiUrl = 'http://' + rawApiUrl;
}
const API_URL = rawApiUrl;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

if (!TOKEN) {
  console.error('❌  TELEGRAM_BOT_TOKEN is not set in .env!');
  process.exit(1);
}

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://afk.hypepath.uz';
const IS_HTTPS = WEB_APP_URL.startsWith('https://');

if (!IS_HTTPS) {
  console.warn('⚠️  WARNING: WEB_APP_URL is not HTTPS (' + WEB_APP_URL + ').');
  console.warn('Telegram Web Apps require HTTPS. Buttons will fall back to opening in an external browser.');
}

const DEFAULT_MAX_PROJECTS = parseInt(process.env.MAX_PROJECTS_PER_USER) || 3;

module.exports = {
  TOKEN,
  API_URL,
  ADMIN_USERNAME,
  WEB_APP_URL,
  IS_HTTPS,
  DEFAULT_MAX_PROJECTS
};
