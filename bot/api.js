const { API_URL } = require('./config');

async function api(method, endpoint, body, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Include bot token so the backend can authorize tg_ password overwrites
    if (process.env.TELEGRAM_BOT_TOKEN) {
      headers['x-telegram-bot-token'] = process.env.TELEGRAM_BOT_TOKEN;
    }

    const res = await fetch(`${API_URL}/api${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { success: false, error: text }; }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 10 seconds' };
    }
    return { success: false, error: `Connection error: ${err.message}` };
  }
}

module.exports = api;
