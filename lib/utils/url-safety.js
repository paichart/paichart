/**
 * URL Safety Utilities — SSRF Prevention (BC22)
 *
 * Validates URLs against private/internal address ranges before
 * making server-side HTTP requests to user-controlled endpoints.
 *
 * @module lib/utils/url-safety
 */

'use strict';

/**
 * Private and reserved IPv4 ranges that should never be fetched from user input.
 * Includes RFC 1918 private ranges, loopback, link-local, and cloud metadata.
 */
const PRIVATE_IPV4_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // RFC 1918 — Private networks
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local (includes AWS/GCP/Azure metadata at 169.254.169.254)
  { start: '169.254.0.0', end: '169.254.255.255' },
  // Documentation ranges (should never be routable)
  { start: '192.0.2.0', end: '192.0.2.255' },
  { start: '198.51.100.0', end: '198.51.100.255' },
  { start: '203.0.113.0', end: '203.0.113.255' },
  // Shared address space
  { start: '100.64.0.0', end: '100.127.255.255' },
  // Current network
  { start: '0.0.0.0', end: '0.255.255.255' },
];

/**
 * Blocked hostnames that resolve to internal addresses.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

/**
 * Convert an IPv4 address string to a 32-bit integer for range comparison.
 * @param {string} ip
 * @returns {number}
 */
function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return -1;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return -1;
    result = (result << 8) + num;
  }
  return result >>> 0; // unsigned
}

/**
 * Check if an IPv4 address falls within any private/reserved range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIPv4(ip) {
  const ipInt = ipToInt(ip);
  if (ipInt === -1) return false; // Not a valid IPv4 — let DNS resolution handle it
  for (const range of PRIVATE_IPV4_RANGES) {
    const startInt = ipToInt(range.start);
    const endInt = ipToInt(range.end);
    if (ipInt >= startInt && ipInt <= endInt) return true;
  }
  return false;
}

/**
 * Check if an IPv6 address is a loopback or private address.
 * @param {string} ip - IPv6 address (may include brackets)
 * @returns {boolean}
 */
function isPrivateIPv6(ip) {
  const cleaned = ip.replace(/^\[|\]$/g, '').toLowerCase();
  // Loopback
  if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1') return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (cleaned.startsWith('::ffff:')) {
    const v4Part = cleaned.slice(7);
    return isPrivateIPv4(v4Part);
  }
  // Unique Local Address (fc00::/7)
  if (cleaned.startsWith('fc') || cleaned.startsWith('fd')) return true;
  // Link-local (fe80::/10)
  if (cleaned.startsWith('fe8') || cleaned.startsWith('fe9') ||
      cleaned.startsWith('fea') || cleaned.startsWith('feb')) return true;
  return false;
}

/**
 * Normalize a URL host to canonical dotted-quad IPv4 when it's an integer/hex/octal
 * encoding of an address (SSRF bypass defense — 2026-05-26). e.g.
 *   2852039166   -> 169.254.169.254   (decimal)
 *   0xa9fea9fe   -> 169.254.169.254   (hex)
 *   017277524776 -> 169.254.169.254   (octal)
 * Dotted forms and hostnames are returned unchanged (isPrivateIPv4 / DNS handle those).
 * @param {string} host
 * @returns {string}
 */
function normalizeIPv4Host(host) {
  if (!host || typeof host !== 'string') return host;
  const h = host.trim();
  if (h.includes('.') || h.includes(':')) return h; // dotted IPv4 / hostname / IPv6
  let n;
  if (/^0x[0-9a-f]+$/i.test(h)) n = parseInt(h, 16);
  else if (/^0[0-7]+$/.test(h)) n = parseInt(h, 8);
  else if (/^\d+$/.test(h)) n = parseInt(h, 10);
  else return h;
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return h;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * Validate that a URL is safe to fetch from server-side code.
 *
 * Returns an object with `safe` (boolean) and `reason` (string if unsafe).
 *
 * @param {string} urlString - The URL to validate
 * @returns {{ safe: boolean, reason?: string }}
 */
function validateUrlSafety(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { safe: false, reason: 'Empty or invalid URL' };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Malformed URL' };
  }

  // Only allow HTTP(S)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = normalizeIPv4Host(parsed.hostname.toLowerCase());

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Block private IPv4 addresses
  if (isPrivateIPv4(hostname)) {
    return { safe: false, reason: `Blocked private IPv4: ${hostname}` };
  }

  // Block private IPv6 addresses (may appear in brackets in URL)
  if (hostname.startsWith('[') || hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) {
      return { safe: false, reason: `Blocked private IPv6: ${hostname}` };
    }
  }

  // Block hostnames that look like they resolve to internal addresses
  // (e.g., 127.0.0.1.nip.io, localtest.me)
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    return { safe: false, reason: `Blocked internal domain: ${hostname}` };
  }

  return { safe: true };
}

module.exports = { validateUrlSafety, isPrivateIPv4, isPrivateIPv6, normalizeIPv4Host };
