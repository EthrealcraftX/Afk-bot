'use strict';

const http  = require('http');
const https = require('https');
const { getLogger } = require('../logger');

const log = getLogger('generic-redirect');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'minecraft:']);
const MAX_REDIRECTS     = 3;
const TIMEOUT_MS        = 5000;

/**
 * Parses a minecraft://?addExternalServer=name|host:port URI.
 * Returns { host, port, serverName } or null if the URI cannot be parsed.
 */
function parseMinecraftURI(uri) {
  const match = uri.match(/addExternalServer=([^|&]+)\|([^:]+):(\d+)/i);
  if (!match) return null;

  const [, rawName, host, portStr] = match;
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) return null;

  return { host, port, serverName: decodeURIComponent(rawName) };
}

/**
 * Validates a redirect target URL.
 * Returns the parsed URL on success or throws with a reason.
 */
function validateRedirectTarget(location, depth, input) {
  let parsed;
  try {
    parsed = new URL(location);
  } catch {
    throw new Error(`Hop ${depth}: invalid Location header: ${location}`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Hop ${depth}: rejected protocol "${parsed.protocol}" in Location: ${location} ` +
      `(input: ${input}). Only http, https, minecraft are allowed.`
    );
  }

  return parsed;
}

/**
 * Fetches only the response headers for a URL using HEAD, with a GET fallback
 * for servers that respond 405 Method Not Allowed to HEAD.
 */
function fetchHeaders(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const tryRequest = (method) => {
      const options = { method, timeout: timeoutMs };
      const mod = urlStr.startsWith('https://') ? https : http;

      const req = mod.request(urlStr, options, (res) => {
        const result = { statusCode: res.statusCode, headers: res.headers };
        // Drain body to free socket, regardless of body content
        res.resume();
        resolve(result);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout after ${timeoutMs}ms: ${urlStr}`));
      });

      req.on('error', (err) => {
        // If HEAD returned 405 and we haven't tried GET yet, retry
        if (method === 'HEAD' && err.code === 'ECONNRESET') {
          return tryRequest('GET');
        }
        reject(err);
      });

      req.end();
    };

    tryRequest('HEAD');
  });
}

class GenericRedirectResolver {
  constructor() {
    this.name = 'GenericRedirectResolver';
  }

  /**
   * Claims any generic http:// or https:// URL not already claimed by a
   * higher-priority resolver (e.g. AternosResolver).
   */
  canResolve(parsed) {
    return parsed.type === 'url';
  }

  async resolve(parsed) {
    const originalInput = parsed.raw;
    let currentUrl      = originalInput;

    log.info(`Starting redirect resolution`, { input: originalInput, maxRedirects: MAX_REDIRECTS });

    for (let depth = 1; depth <= MAX_REDIRECTS; depth++) {
      log.info(`Hop ${depth}: → ${currentUrl}`);

      let response;
      try {
        response = await fetchHeaders(currentUrl, TIMEOUT_MS);
      } catch (err) {
        log.warn(`Hop ${depth}: request failed — ${err.message}`, { url: currentUrl });
        return null;
      }

      const { statusCode, headers } = response;
      log.info(`Hop ${depth}: ← HTTP ${statusCode}`, { url: currentUrl });

      if (![301, 302, 303, 307, 308].includes(statusCode)) {
        log.info(`Hop ${depth}: non-redirect status ${statusCode}, stopping`, { url: currentUrl });
        return null;
      }

      const location = headers['location'];
      if (!location) {
        log.warn(`Hop ${depth}: redirect ${statusCode} had no Location header`, { url: currentUrl });
        return null;
      }

      // Resolve relative paths against the current URL
      const absoluteLocation = (() => {
        if (location.startsWith('/')) {
          const base = new URL(currentUrl);
          return `${base.protocol}//${base.host}${location}`;
        }
        return location;
      })();

      log.info(`Hop ${depth}: Location → ${absoluteLocation}`);

      // Validate protocol — throws on forbidden protocols
      let parsedLocation;
      try {
        parsedLocation = validateRedirectTarget(absoluteLocation, depth, originalInput);
      } catch (err) {
        log.warn(err.message);
        return null;
      }

      // ── minecraft:// terminal destination ──────────────────────────────────
      if (parsedLocation.protocol === 'minecraft:') {
        log.info(`Hop ${depth}: minecraft:// URI detected, parsing…`);
        const parsed = parseMinecraftURI(absoluteLocation);
        if (!parsed) {
          log.warn(`Hop ${depth}: minecraft:// URI present but could not parse addExternalServer payload`, { location: absoluteLocation });
          return null;
        }
        log.info(`Hop ${depth}: resolved → ${parsed.host}:${parsed.port}`, { serverName: parsed.serverName });
        return {
          host:          parsed.host,
          port:          parsed.port,
          edition:       'bedrock',
          serverName:    parsed.serverName,
          originalInput,
          metadata:      { resolvedAt: new Date().toISOString(), hops: depth },
        };
      }

      // ── Next HTTP/HTTPS hop ────────────────────────────────────────────────
      currentUrl = absoluteLocation;
    }

    log.warn(`Max redirect depth (${MAX_REDIRECTS}) reached without finding a minecraft:// target`, { input: originalInput });
    return null;
  }
}

module.exports = { GenericRedirectResolver };
