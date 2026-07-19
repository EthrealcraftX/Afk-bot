'use strict';

const http2 = require('http2');
const { config } = require('../config');

// HTTP/2 ALPN required to bypass Cloudflare gracefully for Aternos endpoints.
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

class AternosResolver {
  constructor() {
    this.name = 'AternosResolver';
  }

  /**
   * Claims URL inputs that match Aternos signatures, or explicit Aternos domains.
   */
  canResolve(parsed) {
    if (parsed.type === 'url') {
      try {
        const url = new URL(parsed.raw);
        return url.hostname.endsWith('aternos.org') || url.hostname.endsWith('aternos.me');
      } catch {
        return false;
      }
    }
    // Handle the foo.aternos.me direct hostname input
    if (parsed.type === 'aternos_domain') {
      return true;
    }
    return false;
  }

  /**
   * Resolves the Aternos URL or domain into a Bedrock host/port by parsing the 302 redirect.
   */
  async resolve(parsed) {
    let serverName = '';
    
    if (parsed.type === 'aternos_domain') {
      serverName = parsed.serverName;
    } else {
      try {
        const url = new URL(parsed.raw);
        // Extracts "Horror-oyin" from "https://add.aternos.org/Horror-oyin"
        serverName = url.pathname.replace(/^\/+/, '');
      } catch (err) {
        throw new Error('Invalid Aternos URL format');
      }
    }

    if (!serverName) {
      throw new Error('Could not extract Aternos server name from input');
    }

    let response;
    try {
      response = await new Promise((resolve, reject) => {
        const client = http2.connect('https://add.aternos.org');
        let settled = false;

        const done = (val, err) => {
          if (settled) return;
          settled = true;
          try { client.close(); } catch (_) {}
          clearTimeout(timer);
          if (err) reject(err); else resolve(val);
        };

        const timer = setTimeout(
          () => done(null, new Error(`Aternos resolve timed out`)),
          config.aternosResolveTimeoutMs || 5000
        );

        client.on('error', (err) => done(null, err));

        const req = client.request({
          ':method':         'GET',
          ':path':           `/${encodeURIComponent(serverName)}`,
          ':authority':      'add.aternos.org',
          ':scheme':         'https',
          'user-agent':      ANDROID_UA,
          'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        });

        req.on('response', (headers) => {
          req.resume();
          done({
            status:  headers[':status'],
            headers: { get: (name) => headers[name.toLowerCase()] ?? null },
          });
        });

        req.on('error', (err) => done(null, err));
        req.end();
      });
    } catch (err) {
      throw new Error(err.message.includes('timed out')
        ? `Aternos resolve timed out`
        : `Aternos fetch failed: ${err.message}`);
    }

    if (response.status !== 302 && response.status !== 301) {
      throw new Error(`Aternos returned HTTP ${response.status} (expected 302/301)`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Aternos returned no Location header');
    }

    // Look for minecraft://?addExternalServer=name|hostname:port
    const match = location.match(/addExternalServer=([^|&]+)\|([^:]+):(\d+)/i);
    if (!match) {
      throw new Error(`Cannot parse Aternos Location header: ${location}`);
    }

    const [, resolvedName, host, portStr] = match;
    const port = parseInt(portStr, 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${portStr}`);
    }

    return { 
      host, 
      port, 
      edition:       'bedrock', 
      serverName:    decodeURIComponent(resolvedName),
      originalInput: parsed.raw,
      metadata:      { resolvedAt: new Date().toISOString(), resolver: 'AternosResolver' },
    };
  }
}

module.exports = { AternosResolver };
