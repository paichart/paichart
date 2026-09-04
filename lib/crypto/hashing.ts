/**
 * Cryptographic Hashing Utilities
 * SHA-256 one-way hashing for API keys (write-time hashing before storage)
 *
 * 2026-06-12: hashSecret + verifyApiKey deleted as zero-caller orphans
 * (Protocol 11 Axis 6 — the api-key RS256 migration of 2026-06-04 removed
 * verifyApiKey's last potential consumer; hashSecret was specced in the
 * 2025-10/11 plans but never wired). hashApiKey remains live
 * (app/api/admin/settings/llm/route.ts).
 *
 * @version 1.1
 * @created 2025-10-30
 * @specialist-reviewed sec-ops (72%), validation-engine (78%)
 */

import { createHash } from 'crypto';

/**
 * Hash an API key using SHA-256
 * One-way hashing - cannot decrypt
 *
 * @param key - The API key to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashApiKey(key: string): string {
  if (!key || key.length < 10) {
    throw new Error('Invalid API key: too short');
  }

  return createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Hash an MCP first-party refresh token using SHA-256 (hex).
 *
 * One-way: the `RefreshToken` row stores this hash in `token`, never the raw
 * 256-bit `mcp_refresh_*` secret (a DB-read compromise yields no replayable
 * credential). Encoding is PINNED to hex — every MCP refresh store/lookup/delete
 * site MUST route through this single helper, or the rotation delete-by-hash
 * would fail to resolve the row it stored (P2025 on every refresh → total outage).
 *
 * @param raw - The raw `mcp_refresh_*` token
 * @returns Hex-encoded SHA-256 hash
 */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256')
    .update(raw)
    .digest('hex');
}

