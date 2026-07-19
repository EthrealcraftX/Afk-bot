'use strict';

const { getLogger } = require('../logger');
const log = getLogger('resolver-chain');

class ResolverChain {
  constructor() {
    this.resolvers = [];
  }

  /**
   * Register a resolver into the chain.
   * @param {object} resolver Must have `canResolve(input)` and `resolve(input)` methods.
   */
  add(resolver) {
    this.resolvers.push(resolver);
  }

  /**
   * Iterates through registered resolvers.
   * First resolver that returns non-null resolves the chain.
   * 
   * @param {object} parsed The parsed input object from parser.js
   * @returns {Promise<{host: string, port: number, edition: string, serverName: string}|null>}
   */
  async resolve(parsed) {
    if (!parsed || !parsed.raw) return null;

    for (const resolver of this.resolvers) {
      if (resolver.canResolve(parsed)) {
        log.info(`[${resolver.name}] Claimed input: ${parsed.raw}`);
        try {
          const result = await resolver.resolve(parsed);
          if (result) {
            log.info(`[${resolver.name}] Successfully resolved to ${result.host}:${result.port} (${result.edition})`);
            return result;
          }
        } catch (err) {
          log.warn(`[${resolver.name}] Failed to resolve: ${err.message}`);
          // If a resolver claims it but fails, we stop the chain and return null.
          // This prevents falling back to generic HTTP redirects if Aternos explicitly fails.
          return null;
        }
      }
    }
    
    return null;
  }
}

// Singleton export
const chain = new ResolverChain();

module.exports = { ResolverChain: chain };
