'use strict';

const IPV4_RE   = /^(\d{1,3}\.){3}\d{1,3}$/;
const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

function hintFromPort(port) {
  if (port === 25565) return 'java';
  if (port === 19132) return 'bedrock';
  return null;
}

function parseInput(rawInput) {
  let raw = rawInput.trim();

  // Basic normalization
  try { raw = decodeURI(raw); } catch (e) {}
  raw = raw.replace(/\/+$/, ''); // remove trailing slash

  // 1. Is it explicitly an HTTP/HTTPS URL?
  if (/^https?:\/\//i.test(raw)) {
    return { type: 'url', raw };
  }

  // 2. Does it look like a bare redirect URL? (e.g. add.aternos.org/xxx)
  // If it has a path and a domain, treat as URL.
  if (/^(?:www\.)?add\.aternos\.(?:org|me)\/[^\s/?#]+/i.test(raw)) {
    return { type: 'url', raw: `https://${raw}` };
  }

  // 3. Aternos domain fallback (foo.aternos.me)
  const aternos_me = raw.match(/^([a-zA-Z0-9\-]+)\.aternos\.me(?::(\d+))?$/i);
  if (aternos_me) {
    const serverName = aternos_me[1];
    const port = aternos_me[2] ? parseInt(aternos_me[2], 10) : 19132;
    return {
      type:        'aternos_domain',
      serverName,
      host:        `${serverName}.aternos.me`,
      port,
      hintEdition: 'bedrock',
      raw,
    };
  }

  // 4. IPv4 with Port
  const ipv4Port = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
  if (ipv4Port) {
    const host = ipv4Port[1];
    const port = parseInt(ipv4Port[2], 10);
    return { type: 'ipv4', host, port, hintEdition: hintFromPort(port), raw };
  }

  // 5. IPv4 bare
  if (IPV4_RE.test(raw)) {
    return { type: 'ipv4', host: raw, port: null, hintEdition: null, raw };
  }

  // 6. Hostname with Port
  const hostPort = raw.match(/^([a-zA-Z0-9\.\-]+):(\d+)$/);
  if (hostPort) {
    const host = hostPort[1];
    const port = parseInt(hostPort[2], 10);
    return { type: 'hostname', host, port, hintEdition: hintFromPort(port), raw };
  }

  // 7. Bare Hostname
  if (DOMAIN_RE.test(raw) || raw.includes('.')) {
    return { type: 'hostname', host: raw, port: null, hintEdition: null, raw };
  }

  // 8. Bare Aternos Server Name (fallback if user just types "Horror-oyin")
  if (/^[a-zA-Z0-9][a-zA-Z0-9\-]*$/.test(raw)) {
    return { type: 'aternos_name', serverName: raw, raw };
  }

  return { type: 'hostname', host: raw, port: null, hintEdition: null, raw };
}

module.exports = { parseInput };
