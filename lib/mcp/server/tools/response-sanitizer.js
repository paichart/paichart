'use strict';

/**
 * Response Sanitizer — output-boundary sanitization for MCP tool responses.
 *
 * Purpose: prevent reflected-XSS material from reaching MCP clients that may
 * render responses as HTML (markdown→HTML pipelines, future browser-based
 * MCP clients per streamable-http transport direction).
 *
 * Created: 2026-05-22 (BUG-BASIC-XSS-1, Phase 2.1)
 * Pattern: Defense-in-depth — call from inside every echo site that
 *   interpolates user-supplied strings into response text.
 *
 * REUSES the canonical lib/utils/sanitize.ts:escapeHtml (5-char OWASP escape
 * set: & < > " ') per BUG-BASIC-XSS-1 Plan v2 BD-2 (sec-ops C1 + C2). Do NOT
 * invent a parallel escape primitive — that creates audit-time divergence.
 *
 * Single-pass safe — do NOT double-sanitize. Helpers should call once at the
 * top of the function and reuse the safe* aliases.
 *
 * @module tools/response-sanitizer
 */

// KEEP IN SYNC with lib/utils/sanitize.ts:escapeHtml — inlined here because
// response-sanitizer.js must be bare-Node loadable (same cross-runtime
// constraint as tool-schemas.js DANGEROUS_KEYS / ARGS_SHAPE_MAX_DEPTH; .ts
// files can't be require()'d outside the build environment). The 5-character
// OWASP HTML-context escape set MUST stay aligned with the canonical helper
// at lib/utils/sanitize.ts — if either changes, update both.
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => HTML_ENTITIES[char] || char);
}

// Pino logger via the project's compiled logger module. If the logger module
// fails to load (bare-Node contexts where the TS compiler isn't available),
// fall back to a no-op — the sanitization still happens; we just lose the
// forensic log for that specific run. test:logging-validation enforces no
// console.* in MCP server files, so console.warn is not an option here.
let warnLog;
try {
  const { apiLogger } = require('../../../logger');
  warnLog = apiLogger.warn.bind(apiLogger);
} catch (_err) {
  warnLog = () => {}; // no-op fallback
}

const MAX_RESPONSE_FIELD_LEN = 200;

/**
 * Sanitize a user-supplied string for safe inclusion in MCP response text.
 *
 * Three-stage pipeline:
 *   1. Type coercion — null/undefined → '', non-strings → String(input)
 *   2. Length cap at 200 chars (DoS guard) + forensic log via apiLogger.warn
 *      when the cap fires (sec-ops N3 — preserves attacker-probe trail)
 *   3. Strip ASCII control chars (\x00-\x1F + \x7F) — no legitimate purpose
 *      in user-facing names/titles
 *   4. HTML-escape via lib/utils/sanitize.ts:escapeHtml (5-char OWASP set)
 *
 * @param {*} input - User-supplied value (any type, coerced to string)
 * @returns {string} Sanitized string safe for response interpolation
 *
 * @example
 *   sanitizeForResponse('<script>alert(1)</script>')
 *   // → '&lt;script&gt;alert(1)&lt;/script&gt;'
 *
 *   sanitizeForResponse('She said "hello"')
 *   // → 'She said &quot;hello&quot;'  (5-char escape preserves attribute context safety)
 *
 *   sanitizeForResponse(null)
 *   // → ''
 *
 *   sanitizeForResponse('A'.repeat(500))
 *   // → 'AAA...AAA...' (truncated at 197 + '...'; apiLogger.warn fired)
 */
function sanitizeForResponse(input) {
  // 1. Type-defensive (Phase 0 BH-6)
  if (input == null) return '';
  const str = typeof input === 'string' ? input : String(input);

  // 2. Length cap + forensic log (sec-ops N3)
  if (str.length > MAX_RESPONSE_FIELD_LEN) {
    warnLog(
      {
        bugClass: 'BC71',
        inputLength: str.length,
        truncated: true,
        sample: str.slice(0, 50)
      },
      'response sanitizer truncated long input'
    );
    // eslint-disable-next-line no-control-regex
    const cappedStripped = str.slice(0, 197).replace(/[\x00-\x1F\x7F]/g, '');
    return escapeHtml(cappedStripped) + '...';
  }

  // 3 + 4. Strip control chars then HTML-escape via canonical helper
  // eslint-disable-next-line no-control-regex
  return escapeHtml(str.replace(/[\x00-\x1F\x7F]/g, ''));
}

/**
 * Sanitize a metadata object for audit/persistence write.
 *
 * 2026-05-23 (BUG-AUDIT-XSS-2 sweep): Activity.create + similar JSONB writes
 * persist user-controlled strings into DB columns that admin UIs may render
 * later. sanitizeForResponse handles single strings; this walker handles
 * the {string|number|boolean|null, ...} metadata shape we use in audit rows.
 *
 * - String values: escapeHtml + length cap (5-char OWASP escape via
 *   sanitizeForResponse).
 * - Number/boolean/null: passed through unchanged (safe in JSON).
 * - Nested objects/arrays: walked recursively up to maxDepth (default 4).
 * - Depth ceiling: returns the value untouched when exceeded (DoS guard).
 *
 * Idempotent on already-sanitized strings (escapeHtml on `&amp;` yields
 * `&amp;amp;` — known minor downside; see BUG-XSS-D4 task #191). Acceptable
 * for write-time audit persistence; consumers can de-escape if they need
 * the original value.
 *
 * @param {*} value - Metadata value (typically an object; primitives pass through)
 * @param {number} [maxDepth=4] - Recursion ceiling (DoS guard)
 * @returns {*} Sanitized metadata safe for Prisma JSONB write
 */
function sanitizeMetadataForAudit(value, maxDepth = 4) {
  return _walkMetadata(value, maxDepth, 0);
}

function _walkMetadata(value, maxDepth, depth) {
  if (depth > maxDepth) return value;
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeForResponse(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map(item => _walkMetadata(item, maxDepth, depth + 1));
  }
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      // Strip prototype-pollution keys at walk time (defense in depth — Zod
      // schemas already strip but audit-write callers may bypass schema).
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      sanitized[key] = _walkMetadata(val, maxDepth, depth + 1);
    }
    return sanitized;
  }
  // Fallback for unexpected types (function, symbol, bigint) — coerce + sanitize
  return sanitizeForResponse(String(value));
}

module.exports = { sanitizeForResponse, sanitizeMetadataForAudit, MAX_RESPONSE_FIELD_LEN };
