const { ServerRepository } = require('../db/serverRepository');

class RecommendationService {
  static async getRecommendations(limit = 3) {
    const servers = await ServerRepository.getTopServers(limit);
    if (!servers || servers.length === 0) return [];

    // Shuffle the top servers slightly to avoid always recommending the exact same ones
    const shuffled = servers.sort(() => 0.5 - Math.random());
    
    // Pick the requested limit
    const selected = shuffled.slice(0, limit);

    // Increment their recommendation count asynchronously
    Promise.all(selected.map(s => ServerRepository.incrementRecommended(s.id))).catch(() => {});

    return selected;
  }
}

module.exports = { RecommendationService };
