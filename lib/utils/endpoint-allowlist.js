/**
 * Operator endpoint allowlist — E14 (2026-09-07), self-host.
 *
 * `validateUrlSafety` (url-safety.js) answers "could the hub open a socket to this address" for a SaaS
 * where private space is never legitimate. A self-hosted hub lives ON a private network, next to the
 * services it registers, and prod's escape hatch (`SSRF_EXEMPT_SERVICES`, a seeded name list) is not a
 * self-service path. This module lets the OPERATOR declare, by network address, where the hub may
 * connect — and nothing else:
 *
 *   HUB_PRIVATE_ENDPOINT_ALLOWLIST="127.0.0.1:3107,192.168.86.0/24"
 *
 *   entry = IPv4 literal WITH port  a.b.c.d:port      (that host, that port only)
 *         | IPv4 CIDR               a.b.c.d/n, 8≤n≤32  (that network, EVERY port; host bits must be 0)
 *   Hostnames, IPv6, schemes/paths, port-less hosts, /0–/7, and CIDRs overlapping the hard-deny space
 *   are PARSE ERRORS: the entry is ignored and named in getEndpointAllowlistReport(); the rest still
 *   apply; all-malformed ⇒ empty ⇒ identical to unset. Never allow-all.
 *
 * Hard-deny (checked on the canonical form, BEFORE the allowlist; never allowlistable):
 *   169.254.0.0/16 (link-local incl. cloud metadata), 0.0.0.0/8 (connects to loopback on Linux),
 *   any IPv6 that is not IPv4-in-disguise (url-safety collapses mapped/NAT64/:: to IPv4 first),
 *   any hostname, and the hub's OWN listeners by host:port (a self-loop is unbounded today).
 *   Loopback is allowlistable only as an exact host:port — never as a CIDR.
 *
 * Panel: cline_docs/reviews/self-host-endpoint-allowlist-2026-09-07/SYNTHESIS.md (sec-ops /
 * validation-engine / boundary-contract, all GO-with-change). Design rules that came out of it:
 *  - `validateUrlSafety` stays pure (no env, no imports); THIS file is the one env reader (pinned).
 *  - Consulted only at the seven CONNECT sites via `validateEndpointSafety` — never at the parameter
 *    URL scan in service-call-policy.js, which answers a different question (what a caller may hand
 *    to another service).
 *  - Entry side and URL side go through ONE canonicaliser (the WHATWG URL parser), or `127.1:3107`
 *    silently never matches.
 *  - Result shape adds `allowlisted` + `matchedEntry`; `reason` stays block-only.
 *  - Allowlisted says nothing about trust: JWT forwarding is decided by name/ownership elsewhere.
 *
 * @module lib/utils/endpoint-allowlist
 */

'use strict';

const { validateUrlSafety, normalizeIPv4Host, ipv6ToEmbeddedIPv4 } = require('./url-safety');

const ENV_NAME = 'HUB_PRIVATE_ENDPOINT_ALLOWLIST';
const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** @returns {number} 32-bit unsigned, or -1 */
function v4ToInt(ip) {
  const m = DOTTED_QUAD.exec(ip);
  if (!m) return -1;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255) return -1;
    n = (n * 256) + o;
  }
  return n >>> 0;
}

/** Ranges that are never allowlistable, as [base, prefix]. */
const HARD_DENY_V4 = [
  ['169.254.0.0', 16], // link-local incl. 169.254.169.254 metadata (whole block: providers vary the tail)
  ['0.0.0.0', 8],      // "current network" — connects to loopback on Linux
];
/** CIDR entries may not cover loopback (exact host:port only). */
const NO_CIDR_V4 = [['127.0.0.0', 8], ...HARD_DENY_V4];

function inRange(ipInt, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
}
function rangesOverlap(baseA, prefixA, baseB, prefixB) {
  const p = Math.min(prefixA, prefixB);
  return inRange(v4ToInt(baseA), baseB, p) || inRange(v4ToInt(baseB), baseA, p);
}

/**
 * Canonical host + effective port of a URL, the same way the gate sees it.
 * Returns null when the URL does not parse or is not http(s).
 * @param {string} urlString
 * @returns {{ host: string, port: number, isIPv4: boolean } | null}
 */
function canonicalHostPort(urlString) {
  let u;
  try { u = new URL(urlString); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = normalizeIPv4Host(u.hostname.toLowerCase().replace(/\.$/, ''));
  if (host.startsWith('[')) {
    const embedded = ipv6ToEmbeddedIPv4(host);
    if (embedded) host = embedded;
  }
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  return { host, port, isIPv4: DOTTED_QUAD.test(host) && v4ToInt(host) !== -1 };
}

/**
 * Parse the raw env value. Pure. Never throws.
 * @param {string|undefined} raw
 * @returns {{ entries: Array<object>, rejected: Array<{raw: string, why: string}> }}
 */
function parseEndpointAllowlist(raw) {
  const entries = [];
  const rejected = [];
  if (raw === undefined || raw === null) return { entries, rejected };
  let value = String(raw).trim();
  // dotenv-style quoting of the WHOLE value
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  for (const piece of value.split(/[,\s]+/)) {
    const item = piece.trim();
    if (!item) continue;
    const reject = (why) => rejected.push({ raw: item, why });
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(item) || item.includes('/') && !/^[^/]+\/\d{1,2}$/.test(item)) {
      reject('entry must be a.b.c.d:port or a.b.c.d/n — no scheme or path'); continue;
    }
    if (item.includes('/')) {
      // CIDR
      const [base, prefixStr] = item.split('/');
      const prefix = Number(prefixStr);
      const baseInt = v4ToInt(base);
      if (baseInt === -1 || !DOTTED_QUAD.test(base)) { reject('CIDR base must be a dotted-quad IPv4 literal'); continue; }
      if (!Number.isInteger(prefix) || prefix < 8 || prefix > 32) { reject('CIDR prefix must be 8..32 (never /0–/7: that is allow-all)'); continue; }
      const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
      if (((baseInt & mask) >>> 0) !== baseInt) { reject('CIDR has host bits set — write the network address'); continue; } // never silently mask
      const clash = NO_CIDR_V4.find(([b, p]) => rangesOverlap(base, prefix, b, p));
      if (clash) { reject(`CIDR overlaps ${clash[0]}/${clash[1]} — loopback only as exact host:port; link-local and 0/8 never`); continue; }
      entries.push({ raw: item, kind: 'cidr', base, prefix });
      continue;
    }
    // host:port — host canonicalised through the URL parser (same as the gate); port REQUIRED and read
    // from the entry text (the URL parser elides default ports — `10.0.0.5:80` must still mean port 80).
    const colon = item.lastIndexOf(':');
    if (colon === -1 || item.startsWith('[')) { reject('host entry needs an explicit port (a.b.c.d:port); use a CIDR for every port on a network; IPv6 is not allowlistable'); continue; }
    const hostText = item.slice(0, colon);
    const portText = item.slice(colon + 1);
    if (!/^\d{1,5}$/.test(portText)) { reject('port must be 1..65535'); continue; }
    const port = Number(portText);
    if (port < 1 || port > 65535) { reject('port must be 1..65535'); continue; }
    let u;
    try { u = new URL(`http://${hostText}/`); } catch { reject('not a valid host:port'); continue; }
    const host = normalizeIPv4Host(u.hostname.toLowerCase());
    if (!DOTTED_QUAD.test(host) || v4ToInt(host) === -1) { reject('host must be an IPv4 literal (hostnames and IPv6 are not allowlistable — the gate does not resolve names)'); continue; }
    if (HARD_DENY_V4.some(([b, p]) => inRange(v4ToInt(host), b, p))) { reject('address is in the hard-deny set (link-local / 0.0.0.0/8)'); continue; }
    entries.push({ raw: item, kind: 'host', host, port });
  }
  return { entries, rejected };
}

/**
 * The hub's own listeners as host:port strings (self-loop deny). Pure over the env object passed.
 * @param {NodeJS.ProcessEnv} env
 * @returns {Set<string>}
 */
function ownListeners(env) {
  const out = new Set();
  const add = (urlString) => { const c = urlString && canonicalHostPort(urlString); if (c) out.add(`${c.host}:${c.port}`); };
  const webPort = Number(env.PORT) || 3000;
  const mcpPort = Number(env.MCP_HTTP_PORT) || 8080;
  add(env.APP_BASE_URL);
  add(env.APP_INTERNAL_BASE_URL || `http://127.0.0.1:${webPort}`);
  out.add(`127.0.0.1:${webPort}`); out.add(`127.0.0.1:${mcpPort}`);
  const pub = env.APP_BASE_URL && canonicalHostPort(env.APP_BASE_URL);
  if (pub) { out.add(`${pub.host}:${webPort}`); out.add(`${pub.host}:${mcpPort}`); }
  return out;
}

/**
 * Match a URL against a parsed allowlist. Pure.
 * @returns {{ matched: boolean, entry?: string, denied?: string }}
 */
function matchEndpointAllowlist(urlString, parsed, self) {
  const c = canonicalHostPort(urlString);
  if (!c || !c.isIPv4) return { matched: false };                       // hostnames / IPv6 never match
  const ipInt = v4ToInt(c.host);
  if (HARD_DENY_V4.some(([b, p]) => inRange(ipInt, b, p))) return { matched: false, denied: 'hard-deny' };
  if (self && self.has(`${c.host}:${c.port}`)) return { matched: false, denied: 'own-listener' };
  for (const e of parsed.entries) {
    if (e.kind === 'host' && e.host === c.host && e.port === c.port) return { matched: true, entry: e.raw };
    if (e.kind === 'cidr' && inRange(ipInt, e.base, e.prefix)) return { matched: true, entry: e.raw };
  }
  return { matched: false };
}

// ── Read once at load (like public-base-url); tests use the pure functions or a spawned child. ──
let state = null;
function load(env = process.env) {
  state = { parsed: parseEndpointAllowlist(env[ENV_NAME]), self: ownListeners(env) };
  return state;
}
function current() { return state || load(); }

/**
 * The connect-site gate: hard-deny → operator allowlist → validateUrlSafety.
 * Same shape as validateUrlSafety plus `allowlisted` / `matchedEntry` on the allowlisted path.
 * @param {string} urlString
 * @returns {{ safe: boolean, reason?: string, allowlisted?: boolean, matchedEntry?: string }}
 */
function validateEndpointSafety(urlString) {
  const base = validateUrlSafety(urlString);
  if (base.safe) return base;                                          // public — allowlist irrelevant
  const { parsed, self } = current();
  if (parsed.entries.length === 0) return base;                        // unset/empty ⇒ identical to today
  const m = matchEndpointAllowlist(urlString, parsed, self);
  if (m.denied === 'own-listener') {
    const c = canonicalHostPort(urlString);
    return { safe: false, reason: `Blocked: ${c.host}:${c.port} is this hub's own listener (self-loop)` };
  }
  if (m.matched) return { safe: true, allowlisted: true, matchedEntry: m.entry };
  return base;
}

/** For the entrypoints to log at startup. */
function getEndpointAllowlistReport() {
  const { parsed } = current();
  return { envName: ENV_NAME, entries: parsed.entries.map((e) => e.raw), rejected: parsed.rejected };
}

function _resetForTests(env) { state = null; if (env) load(env); }

module.exports = {
  ENV_NAME, parseEndpointAllowlist, canonicalHostPort, matchEndpointAllowlist, ownListeners,
  validateEndpointSafety, getEndpointAllowlistReport, _resetForTests,
};
