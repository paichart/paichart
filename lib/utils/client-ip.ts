import type { NextRequest } from 'next/server';

/**
 * Resolve the real client IP from a NextRequest. SINGLE SOURCE OF TRUTH for the
 * Next app — used both for rate-limit bucketing AND for audit-log `ip:` fields
 * (trackActivity et al.), so attribution is consistent and non-spoofable.
 * Consolidated several previously-duplicated/inline copies that had drifted
 * (rate-limit.ts + rate-limiter-enhanced.ts + request-throttle.ts + ~7 audit
 * sites + the login legacy limiter; arch F2, 2026-06-13).
 *
 * Precedence:
 * 1. CF-Connecting-IP — the true client IP, non-spoofable in our deployment:
 *    the origin's 443 only accepts Cloudflare ranges (ufw-verified) and
 *    Cloudflare OVERWRITES any client-supplied cf-connecting-ip with the real
 *    peer before forwarding. nginx passes it through unmodified to both
 *    upstreams. This is the L6 fix — see
 *    cline_docs/reviews/loopback-refresh-rate-limit-2026-06-13/ + the ledger.
 * 2. XFF / x-real-ip — ONLY when TRUSTED_PROXY is set (BC54: else spoofable).
 * 3. request.ip || 'direct' — dev/local fallback (no Cloudflare in front).
 *
 * Why CF-Connecting-IP must be primary: TRUSTED_PROXY is unset in prod, so
 * without (1) every request fell to (3), which is a CONSTANT behind the
 * nginx→localhost custom server (request.ip empty) — collapsing every IP-keyed
 * limiter into ONE global bucket (false-locks the platform at scale).
 *
 * Pure (header reads + env only) → Edge-runtime safe.
 *
 * DELIBERATELY SEPARATE from `clientIp()` in lib/mcp/server/routes/oauth-flow-routes.ts:
 * that one is Express-typed (paichart-mcp process), returns `undefined` (caller picks
 * fallback), and serves AUDIT LOGGING — a best-effort attribution contract, not this
 * spoof-proof gating one. Not merged on purpose (different request type + purpose). The
 * one rule they share is CF-Connecting-IP-primary — if THAT ever changes (e.g. CF
 * deprecates the header), update BOTH.
 */
export function getClientIP(request: NextRequest): string {
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  if (process.env.TRUSTED_PROXY) {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || realIP;
    if (ip) return ip.trim();
  }
  // Fallback (dev/local, no Cloudflare): stable identifier, not spoofable headers.
  return request.ip || 'direct';
}
