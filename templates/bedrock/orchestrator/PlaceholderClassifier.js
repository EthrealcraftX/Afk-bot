'use strict';

/**
 * PlaceholderClassifier.js
 * 
 * Analyzes the normalized ping response from a Bedrock server and classifies
 * whether it is a real server, an offline placeholder (e.g. Aternos offline proxy),
 * or starting.
 * 
 * Aternos and similar free hosts often route DNS to a placeholder proxy when the
 * underlying server is offline, returning a valid ping response with fake metadata.
 */

const Classification = {
  REAL_SERVER: 'REAL_SERVER',
  OFFLINE_PLACEHOLDER: 'OFFLINE_PLACEHOLDER',
  STARTING: 'STARTING',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN'
};

class PlaceholderClassifier {
  /**
   * Classify a ping result using a multi-signal heuristic.
   * 
   * @param {Object} pingResult The normalized ping result from BedrockPingService
   * @returns {string} One of the Classification constants
   */
  classify(pingResult) {
    if (!pingResult || !pingResult.online) {
      return Classification.OFFLINE;
    }

    const motd1 = (pingResult.motd || '').trim().toLowerCase();
    const motd2 = (pingResult.motd2 || '').trim().toLowerCase();
    const onlinePlayers = pingResult.players?.online ?? 0;
    const maxPlayers = pingResult.players?.max ?? 0;
    
    // Evaluate placeholder signals
    let placeholderConfidence = 0;
    
    if (motd1 === 'offline' || motd1.includes('offline')) {
      placeholderConfidence += 2;
    }
    
    if (motd2.includes('aternos')) {
      placeholderConfidence += 2;
    }
    
    if (onlinePlayers === 0) {
      placeholderConfidence += 1;
    }
    
    if (maxPlayers === 0 || maxPlayers === 1) {
      placeholderConfidence += 1;
    }
    
    // Evaluate starting signals
    let startingConfidence = 0;
    if (motd1 === 'starting' || motd1.includes('starting')) {
      startingConfidence += 2;
    }
    
    if (motd2.includes('aternos') && motd1.includes('starting')) {
      startingConfidence += 2;
    }
    
    // Sometimes Aternos says "Loading..."
    if (motd1.includes('loading')) {
      startingConfidence += 2;
    }
    
    if (motd2.includes('aternos') && motd1.includes('loading')) {
      startingConfidence += 2;
    }

    if (startingConfidence >= 3) {
      return Classification.STARTING;
    }

    // Aternos offline proxy usually returns 0/1 players, MOTD: "Offline", MOTD2: "Aternos"
    // We require a high confidence score to avoid false positives (e.g. a real server named "Offline")
    if (placeholderConfidence >= 4) {
      return Classification.OFFLINE_PLACEHOLDER;
    }

    return Classification.REAL_SERVER;
  }
}

module.exports = {
  PlaceholderClassifier,
  Classification
};
