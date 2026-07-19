const { GroupSettingsRepository } = require('../db/groupSettingsRepository');
const { RecommendationService } = require('./recommendation');

const INTENT_PATTERNS = [
  /server\s+kerak/i,
  /kimda\s+server\s+bor/i,
  /bedwars\s+bormi/i,
  /survival\s+server/i,
  /join\s+qilamizmi/i,
  /server\s+ochildimi/i,
  /minecraft\s+server/i,
  /realm\s+emas\s+server/i,
  /play\s+qiladigan\s+server/i,
  /server\s+tashla/i,
  /server\s+bervor/i,
  /server\s+kere/i,
  /yaxshi\s+server/i,
  /qanaqa\s+server/i,
];

async function handleIntent(msg, bot) {
  const text = (msg.text || msg.caption || '').trim();
  if (!text) return;

  const isIntentMatched = INTENT_PATTERNS.some((pattern) => pattern.test(text));
  if (!isIntentMatched) return;

  const settings = await GroupSettingsRepository.getSettings(String(msg.chat.id));
  if (!settings.recommendationsEnabled) return;

  try {
    const limit = settings.recommendationLimit || 3;
    const recommendations = await RecommendationService.getRecommendations(limit);

    if (recommendations.length > 0) {
      let replyMsg = `🔎 *Sizga mos Minecraft serverlar:*\n\n`;
      recommendations.forEach((rec, idx) => {
        const portSuffix = rec.port !== 19132 && rec.port !== 25565 ? `:${rec.port}` : '';
        const editionLabel = rec.edition === 'java' ? 'Java ☕' : 'Bedrock 🟩';
        replyMsg += `${idx + 1}. \`${rec.host}${portSuffix}\`\n`;
        replyMsg += `   O'yinchilar: ${rec.players} | Ping: ${rec.latency}ms\n`;
        replyMsg += `   ${editionLabel} | ${rec.version || 'Unknown'}\n\n`;
      });

      await bot.sendMessage(msg.chat.id, replyMsg, {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id,
      });
    }
  } catch (err) {
    // Silently ignore failures
  }
}

module.exports = { handleIntent };
