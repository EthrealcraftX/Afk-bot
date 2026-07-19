'use strict';

/**
 * Normalizes common Aternos add-link input variants into a canonical https URL.
 */
function normalizeAternosAddLink(url) {
  const trimmed = url.trim();

  // If it starts with http/https protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  // If it starts with www.
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // If it starts with add.aternos.
  if (/^add\.aternos\.(org|me)\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // If it looks like a path/slug but contains add.aternos.
  if (trimmed.includes('add.aternos.')) {
    return `https://${trimmed}`;
  }

  // If it is just the slug (e.g. aternos.org/slug or similar)
  if (/^aternos\.(org|me)\//i.test(trimmed)) {
    return `https://add.${trimmed}`;
  }

  return trimmed;
}

/**
 * Checks if a string looks like an Aternos Bedrock/Java add link.
 */
function isAternosAddLink(url) {
  try {
    const normalized = normalizeAternosAddLink(url);
    const parsed = new URL(normalized);
    const host = parsed.hostname;
    return (
      host === 'add.aternos.org' ||
      host === 'www.add.aternos.org' ||
      host === 'add.aternos.me' ||
      host === 'www.add.aternos.me' ||
      host === 'aternos.org' ||
      host === 'aternos.me'
    ) && parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

/**
 * Parses a minecraft:// URI with addExternalServer query parameter.
 * Expected format: minecraft://?addExternalServer=displayName|hostname:port
 */
function parseMinecraftUri(uri) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'minecraft:') {
      return null;
    }

    const params = new URLSearchParams(url.search);
    const addExternal = params.get('addExternalServer');
    if (!addExternal) {
      return null;
    }

    // Split on the first '|' (pipe) after the display name
    const pipeIndex = addExternal.indexOf('|');
    if (pipeIndex === -1) {
      return null;
    }

    const displayName = addExternal.substring(0, pipeIndex);
    const address = addExternal.substring(pipeIndex + 1);

    // Now address is hostname:port (or just hostname, but port required)
    const colonIndex = address.lastIndexOf(':');
    if (colonIndex === -1) {
      return null;
    }
    const hostname = address.substring(0, colonIndex);
    const portStr = address.substring(colonIndex + 1);
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return null;
    }

    return { displayName: displayName || hostname, hostname, port };
  } catch {
    return null;
  }
}

/**
 * Slug-based fallback to infer hostname and port when Cloudflare or redirect check fails.
 */
function resolveAternosFallback(link) {
  try {
    const normalized = normalizeAternosAddLink(link);
    const parsed = new URL(normalized);
    const slug = parsed.pathname.split('/').filter(Boolean)[0];
    if (!slug) {
      return null;
    }

    return {
      displayName: slug,
      hostname: `${slug}.aternos.me`,
      port: 64848,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves an Aternos add link to its actual hostname and port.
 */
async function resolveAternosLink(link) {
  const normalizedLink = normalizeAternosAddLink(link);

  try {
    // FIX: fetch() = undici TLS flagged by Cloudflare.
    // https.request = OpenSSL rejects TLS renegotiation -> timeout.
    // http2.connect = h2 ALPN bypasses Bot Fight Mode -> HTTP 302.
    const http2 = require('http2');
    const parsedUrl = new URL(normalizedLink);

    const response = await new Promise((resolve, reject) => {
      const client = http2.connect(`https://${parsedUrl.hostname}`);
      let settled = false;

      const done = (val, err) => {
        if (settled) return;
        settled = true;
        try { client.close(); } catch (_) {}
        clearTimeout(timer);
        if (err) reject(err); else resolve(val);
      };

      const timer = setTimeout(
        () => done(null, new Error('Aternos request timed out')),
        10000
      );

      client.on('error', (err) => done(null, err));

      const req = client.request({
        ':method':         'GET',
        ':path':           parsedUrl.pathname + parsedUrl.search,
        ':authority':      parsedUrl.hostname,
        ':scheme':         'https',
        'user-agent':      'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.5',
        'accept-encoding': 'gzip, deflate, br',
      });

      req.on('response', (headers) => {
        req.resume(); // drain body - we only need status + location
        done({
          status:  headers[':status'],
          headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        });
      });

      req.on('error', (err) => done(null, err));
      req.end();
    });

    const location = response.headers.get('location');
    const isCloudflareChallenge = response.status === 403;

    if (isCloudflareChallenge) {
      const fallback = resolveAternosFallback(normalizedLink);
      if (fallback) {
        return fallback;
      }
      throw new Error('Aternos redirect was challenged by Cloudflare and could not be resolved automatically.');
    }

    // Check if we got a redirect (3xx)
    if (response.status < 300 || response.status >= 400) {
      const fallback = resolveAternosFallback(normalizedLink);
      if (fallback) {
        return fallback;
      }
      throw new Error(`Unexpected HTTP status ${response.status}. This link may not be valid.`);
    }

    if (!location) {
      throw new Error('Redirect Location header missing.');
    }

    let redirectUri = location;
    if (!redirectUri.startsWith('minecraft://')) {
      const fallback = resolveAternosFallback(normalizedLink);
      if (fallback) {
        return fallback;
      }
      throw new Error(`Redirect target is not a minecraft:// URI: ${location}`);
    }

    const resolved = parseMinecraftUri(redirectUri);
    if (!resolved) {
      throw new Error('Failed to parse the minecraft:// URI.');
    }

    return resolved;
  } catch (error) {
    console.warn(`Aternos resolution error: ${error.message}. Using fallback...`);
    const fallback = resolveAternosFallback(normalizedLink);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

module.exports = {
  normalizeAternosAddLink,
  isAternosAddLink,
  parseMinecraftUri,
  resolveAternosLink
};
