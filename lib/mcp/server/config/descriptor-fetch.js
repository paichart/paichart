/**
 * WI-B10 (2026-10-23) — the platform-side descriptor fetch (owner NS-1 (a): the platform fetches the descriptor from the
 * URL the agent names; the bytes never pass through the model). A NEW single-purpose fetcher — the hub's existing
 * "SSRF gate" is a STRING check (no DNS, no redirect, any port), so it is the first cheap check here, never the control.
 *
 * Properties (design §9.1 A + §10 A-6/A-11b/c; sec-ops B-3; mcp-hub SF-4):
 *   - https: on any port, strict TLS (rejectUnauthorized forced true — never NODE_TLS_REJECT_UNAUTHORIZED). Plain http: ONLY when
 *     the operator sets DESCRIPTOR_FETCH_ALLOW_HTTP=true (a self-hosted install on its own network; INTERNAL-FIT I-6, owner
 *     2026-10-24). The hosted platform never sets it. Port 443-only was retired (I-5): the address check is the control.
 *   - Refused BEFORE any connect, each with a NAMED reason: scheme, userinfo, query/fragment, the address gate.
 *   - ONE resolution (A + AAAA via dns.lookup all), EVERY address classified; the connection uses the CHECKED address
 *     (https.request `lookup` — never a second resolution); SNI + certificate verification stay on the hostname.
 *   - Any 3xx refused (`descriptor-redirect`); identity encoding; stream abort at 256 KB; ONE deadline (10 s) covering
 *     connect + headers + body.
 *   - Every post-connect failure is ONE uniform `descriptor-fetch-failed` (no status, body, address or TLS text reaches
 *     the caller); the cause is a content-free `cause` for logs only.
 *   - Accepts application/json and text/plain (raw.githubusercontent serves text/plain); the gate is JSON.parse to an
 *     object root. sha256 over the RAW bytes (provenance — `descriptorSha256`).
 *   - The operator's HUB_PRIVATE_ENDPOINT_ALLOWLIST IS consulted, like every other connect site (INTERNAL-FIT I-4, owner
 *     2026-10-24, reversing WI-B10 §9.2 C2 / §10 A-12; sec-ops B-3 item 7): a private address is fetched ONLY when the operator
 *     allowlisted it — an IP-literal host before connect, and EVERY resolved address in the checked lookup (an internal
 *     hostname resolves to a private address). The hard-deny ranges and this hub's own listeners are never allowlistable
 *     (endpoint-allowlist.js). IPv4 only (the allowlist's own rule). Unset allowlist ⇒ identical to before (prod: loopback only).
 * Plain CommonJS (bare Node, ts-node, webpack). Never throws.
 */
'use strict';

const https = require('https');
const http = require('http');
const dns = require('dns');
const crypto = require('crypto');
const net = require('net');
const { isPrivateIPv4, isPrivateIPv6, expandIPv6 } = require('../../../utils/url-safety');
const { validateEndpointSafety } = require('../../../utils/endpoint-allowlist');

/** INTERNAL-FIT I-6: plain http only on an operator opt-in (self-host). Read per call so a test / restart sees the current value. */
const httpAllowed = (opts) => (opts && typeof opts.allowHttp === 'boolean' ? opts.allowHttp : process.env.DESCRIPTOR_FETCH_ALLOW_HTTP === 'true');

/** INTERNAL-FIT I-4: is this resolved/literal address one the OPERATOR allowlisted (never hard-deny, never our own listener)? */
function allowlistedAddress(address, family, port) {
  if (family !== 4) return false;
  const r = validateEndpointSafety(`http://${address}:${port}/`);
  return !!(r && r.safe === true && r.allowlisted === true);
}

const MAX_BYTES = 256 * 1024;
const DEADLINE_MS = 10_000;
const MAX_URL = 2048;

function ipv4ToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return -1;
  return ((Number(p[0]) << 24) >>> 0) + (Number(p[1]) << 16) + (Number(p[2]) << 8) + Number(p[3]);
}
const inV4 = (n, base, bits) => { const b = ipv4ToInt(base); const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; return ((n & m) >>> 0) === ((b & m) >>> 0); };

/** The ranges url-safety.js does not cover (sec-ops B-3 probe), added for RESOLVED addresses. */
function isExtraBlockedV4(ip) {
  const n = ipv4ToInt(ip);
  if (n < 0) return true; // not an IPv4 we can read ⇒ fail closed
  return inV4(n, '224.0.0.0', 4) || inV4(n, '240.0.0.0', 4) || inV4(n, '198.18.0.0', 15) || inV4(n, '192.0.0.0', 24);
}

/** True when a RESOLVED address must not be connected to. Fail closed on anything unreadable. */
function isBlockedAddress(address, family) {
  if (family === 4 || (family === undefined && !String(address).includes(':'))) {
    return isPrivateIPv4(address) || isExtraBlockedV4(address);
  }
  if (isPrivateIPv6(address)) return true;
  const g = expandIPv6(String(address).replace(/^\[|\]$/g, ''));
  if (!g) return true;
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // IPv4-compatible ::a.b.c.d (deprecated, still routed to the embedded v4 by some stacks)
  if (g.slice(0, 6).every((x) => x === 0)) { const e = v4(g[6], g[7]); return isPrivateIPv4(e) || isExtraBlockedV4(e); }
  // 6to4 2002:AABB:CCDD::/16 — judge the embedded v4
  if (g[0] === 0x2002) { const e = v4(g[1], g[2]); return isPrivateIPv4(e) || isExtraBlockedV4(e); }
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // local-use NAT64 64:ff9b:1::/48
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation 2001:db8::/32
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo 2001::/32 (an obfuscated v4)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  return false;
}

/**
 * INTERNAL-FIT I-7 (sec-ops conditions 3.1/3.3): THE one masking function for the stored descriptor URL — applied to the
 * in-memory URL before ANY write. Stored = origin + pathname + '?' + each PARSED key '=***' (repeated keys kept, order kept).
 * Parsed, never a regex over the raw string. Anything odd ⇒ the whole query becomes '?***': a ';' separator, an empty key,
 * a key over 64 chars, a key outside [A-Za-z0-9._~[]-] (that includes keys that decoded from %26 / %3D), a non-printable,
 * or ANY parameter without '=' (a bare parameter can be the token itself — sec-ops IF-2 build SF-1).
 * Keys are kept only so the owner can recognise the URL. v1 never re-fetches (WI-B10 §10), so nothing needs the token after
 * this fetch: no token at rest, and no projection can leak one. A masked URL is NOT fetchable (MASKED_VALUE refusal below).
 */
const MASKED_VALUE = '***';
const SAFE_QUERY_KEY = /^[A-Za-z0-9._~\[\]-]{1,64}$/;
function maskQueryValues(u) {
  const base = `${u.origin}${u.pathname}`;
  const rawQuery = u.search ? u.search.slice(1) : '';
  if (rawQuery === '') return base;
  if (rawQuery.includes(';') || /[\x00-\x1f\x7f]/.test(rawQuery)) return `${base}?${MASKED_VALUE}`;
  // sec-ops IF-2 build SF-1: a parameter with NO '=' in the RAW query is all name — and a bare parameter can BE the token
  // (`?3f9a…`). URLSearchParams cannot tell `?k` from `?k=`, so decide on the raw segments. `?k=` still keeps its key.
  if (rawQuery.split('&').some((seg) => seg !== '' && !seg.includes('='))) return `${base}?${MASKED_VALUE}`;
  const keys = [];
  for (const [k] of new URLSearchParams(rawQuery)) {
    if (!SAFE_QUERY_KEY.test(k)) return `${base}?${MASKED_VALUE}`;
    keys.push(k);
  }
  if (keys.length === 0) return `${base}?${MASKED_VALUE}`;
  return `${base}?${keys.map((k) => `${k}=${MASKED_VALUE}`).join('&')}`;
}

/** True when a URL carries a masked value — such a URL is a STORED record, never fetchable (sec-ops 3.3). */
function carriesMaskedValue(u) {
  if (!u.search) return false;
  if (u.search === `?${MASKED_VALUE}` || u.search.includes(encodeURIComponent(MASKED_VALUE))) return true;
  for (const [, v] of new URLSearchParams(u.search.slice(1))) if (v === MASKED_VALUE) return true;
  return false;
}

/** Pre-connect URL checks. Returns { ok: true, url } or { ok: false, reason } with a NAMED reason. */
function checkDescriptorUrl(raw, opts) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return { ok: false, reason: 'descriptor-url-invalid' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'descriptor-url-invalid' }; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && httpAllowed(opts))) return { ok: false, reason: 'descriptor-scheme' };
  if (u.username || u.password) return { ok: false, reason: 'descriptor-userinfo' };
  // Fragment: never (it never reaches the server; a URL carrying one is malformed for this use).
  if (u.hash !== '' || raw.includes('#')) return { ok: false, reason: 'descriptor-query' };
  // INTERNAL-FIT I-7 (owner 2026-10-24, sec-ops option b): a QUERY only when the caller is a HUMAN (opts.allowQuery — the
  // registration handler's isAgentCaller predicate). An agent-supplied URL with a query keeps refusing: the token would
  // already sit in the task text, the toolCalls arguments and the transcript, where R10 does not know these query shapes.
  if ((u.search !== '' || raw.includes('?')) && !(opts && opts.allowQuery === true)) return { ok: false, reason: 'descriptor-query' };
  // sec-ops 3.3: a stored (masked) URL is a record, not an address — a future refresh must take the URL from the owner again.
  if (carriesMaskedValue(u)) return { ok: false, reason: 'descriptor-url-masked' };
  const gate = validateEndpointSafety(raw); // the string gate, admitting an operator-allowlisted private IPv4 host (I-4)
  if (!gate || gate.safe !== true) return { ok: false, reason: 'descriptor-address' };
  // sec-ops BUILD-B-1: Node never calls a custom `lookup` for an IP-literal host — it connects directly — so the checked
  // lookup below cannot see it. Classify an IP literal HERE with the same block list (WHATWG URL already canonicalises
  // decimal/octal/hex IPv4 to dotted form, and an IPv6 host is bracketed).
  const literal = u.hostname.replace(/^\[|\]$/g, '');
  const fam = net.isIP(literal);
  const port = Number(u.port) || (u.protocol === 'http:' ? 80 : 443);
  if (fam !== 0 && isBlockedAddress(literal, fam) && !allowlistedAddress(literal, fam, port)) return { ok: false, reason: 'descriptor-address' };
  return { ok: true, url: u, port };
}

/** A dns `lookup` for https.request: resolve ALL addresses once, refuse if ANY is blocked, hand back the checked one. */
function makeCheckedLookup(dnsLookup, onDecision, port = 443) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err || !Array.isArray(addresses) || addresses.length === 0) { onDecision('dns'); return cb(err || new Error('no-address')); }
      // I-4: a blocked address passes ONLY when the operator allowlisted it (hard-deny + own listeners never pass).
      if (addresses.some((a) => isBlockedAddress(a.address, a.family) && !allowlistedAddress(a.address, a.family, port))) { onDecision('blocked'); return cb(new Error('blocked-address')); }
      const chosen = addresses[0];
      onDecision('ok');
      // Node asks for `all` on some paths (autoSelectFamily); answer in the shape asked, always from the checked list.
      if (options && typeof options === 'object' && options.all) return cb(null, addresses.map((a) => ({ address: a.address, family: a.family })));
      return cb(null, chosen.address, chosen.family);
    });
  };
}

/**
 * Fetch a descriptor. Resolves to:
 *   { ok: true, bytes: Buffer, sha256: hex, json: object, url: string (scheme+host+path, no query), storedUrl: string (query VALUES masked — what is persisted) }
 *   { ok: false, reason, preConnect: boolean, cause?: string }   — reason is NAMED pre-connect, else uniform.
 * opts (tests only): { httpsRequest, dnsLookup, deadlineMs, maxBytes }
 */
function fetchDescriptor(rawUrl, opts = {}) {
  const pre = checkDescriptorUrl(rawUrl, opts);
  if (!pre.ok) return Promise.resolve({ ok: false, reason: pre.reason, preConnect: true });
  const u = pre.url;
  const isHttps = u.protocol === 'https:';
  const httpsRequest = opts.httpsRequest || (isHttps ? https.request : http.request);
  const dnsLookup = opts.dnsLookup || dns.lookup;
  const deadlineMs = opts.deadlineMs || DEADLINE_MS;
  const maxBytes = opts.maxBytes || MAX_BYTES;

  return new Promise((resolve) => {
    let settled = false;
    let lookupDecision = null;
    const fail = (cause) => { if (!settled) { settled = true; clearTimeout(timer); try { req && req.destroy(); } catch { /* ignore */ } resolve({ ok: false, reason: 'descriptor-fetch-failed', preConnect: false, cause }); } };
    const redirect = () => { if (!settled) { settled = true; clearTimeout(timer); try { req && req.destroy(); } catch { /* ignore */ } resolve({ ok: false, reason: 'descriptor-redirect', preConnect: false }); } };
    const timer = setTimeout(() => fail('deadline'), deadlineMs);
    let req;
    try {
      req = httpsRequest({
        protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: pre.port, method: 'GET',
        path: u.pathname + u.search, ...(isHttps ? { servername: /^[\d.]+$|:/.test(u.hostname) ? undefined : u.hostname } : {}),
        headers: { Accept: 'application/json, text/plain;q=0.9', 'Accept-Encoding': 'identity', 'User-Agent': 'paichart-descriptor-fetch/1' },
        lookup: makeCheckedLookup(dnsLookup, (d) => { lookupDecision = d; }, pre.port),
        ...(isHttps ? { rejectUnauthorized: true } : {}), agent: false,
      }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) { res.resume(); return redirect(); }
        if (status !== 200) { res.resume(); return fail(`status-${Math.floor(status / 100)}xx`); }
        const ctype = String(res.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
        if (ctype !== 'application/json' && ctype !== 'text/plain') { res.resume(); return fail('content-type'); }
        if (res.headers['content-encoding'] && String(res.headers['content-encoding']).toLowerCase() !== 'identity') { res.resume(); return fail('content-encoding'); }
        const chunks = []; let size = 0;
        res.on('data', (c) => { size += c.length; if (size > maxBytes) return fail('too-large'); chunks.push(c); });
        res.on('error', () => fail('stream'));
        res.on('end', () => {
          if (settled) return;
          const bytes = Buffer.concat(chunks);
          let json;
          try { json = JSON.parse(bytes.toString('utf8')); } catch { return fail('not-json'); }
          if (!json || typeof json !== 'object' || Array.isArray(json)) return fail('not-an-object');
          settled = true; clearTimeout(timer);
          resolve({ ok: true, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), json, url: `${u.protocol}//${u.host}${u.pathname}`, storedUrl: maskQueryValues(u) });
        });
      });
      req.on('error', () => fail(lookupDecision === 'blocked' ? 'blocked-address' : lookupDecision === 'dns' ? 'dns' : 'connect'));
      req.end();
    } catch {
      fail('request');
    }
  });
}

module.exports = { maskQueryValues, carriesMaskedValue, MASKED_VALUE, fetchDescriptor, checkDescriptorUrl, isBlockedAddress, makeCheckedLookup, MAX_BYTES, DEADLINE_MS };
