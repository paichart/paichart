/**
 * Input Sanitization Utilities
 * XSS prevention and content validation
 */

const MAX_COMMENT_LENGTH = 2000;

// X26 (2026-09-28): an HTML start tag, bounded and quote-aware. Quote-aware so a `>` or `<` inside
// an earlier quoted value (`<img alt=">" onerror=…>`) does not end the tag early. Linear by
// construction — a greedy tag match with no suffix to backtrack into, then a per-tag replace (the
// lazy-prefix-plus-suffix single regex was measured quadratic: ~850 ms on 120 KB of `<a `). The
// bounds (1000 units, 1000 chars per quoted value, 40-char handler name) cap per-tag work as
// belt-and-braces. Accepted residual: a handler after >1000 attribute units is not reached
// (off-GUI defense-in-depth only — the GUI renders report.md without raw HTML).
// sec-ops second pass (2026-09-28): the trailing `|["']` alternative is a LONE-QUOTE fallback — in HTML a quote inside an
// UNQUOTED value is part of the value (`<img src=x"y onerror=…>` has a real onerror), so an unmatched quote must not end
// the tag match early. Quoted values are tried first, so `alt=">"` still works; the fallback can only lengthen a tag.
const HTML_START_TAG = /<[a-z](?:[^<>"']|"[^"]{0,1000}"|'[^']{0,1000}'|["']){0,1000}/gi;
// An `on*=` attribute, only when it starts an attribute (after whitespace, `/` or a closing quote),
// with a double-quoted, single-quoted or unquoted value.
// The separator is a LOOKBEHIND, not a capture: a capture consumed the closing quote of one handler's value, so a second
// handler written straight after it (`<img oncut=""onerror=…>`) had no separator left and survived (sec-ops second pass).
const EVENT_HANDLER_ATTR = /(?<=[\s\/"'])on\w{1,40}\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

/**
 * Remove inline event-handler attributes (onclick, onerror, …) from HTML start tags ONLY.
 *
 * X26: the previous unscoped `on\w+\s*=` replaces matched any word containing `on` followed by `=`,
 * which corrupted non-HTML text — `-o jsonpath='{…}'` → `-o js[event handler removed]`, HCL
 * `Environment = "prod"` → `Envir[event handler removed]`, `component=receiver` → `compreceiver` —
 * missed unquoted handlers (`<img src=x onerror=alert(1)>`), and was quadratic. Text outside a tag is
 * never touched; every handler inside a tag is replaced (not just the first).
 */
export function stripHtmlEventHandlers(text: string): string {
  return text.replace(HTML_START_TAG, (tag) => tag.replace(EVENT_HANDLER_ATTR, '[event handler removed]'));
}

/**
 * Sanitize comment text to prevent XSS attacks
 *
 * Removes:
 * - Script tags
 * - Iframe tags
 * - Javascript: URLs
 * - Inline event handlers (onclick, onload, etc.)
 *
 * @param text - Raw comment text
 * @returns Sanitized comment text
 */
export function sanitizeComment(text: string): string {
  if (!text) return '';

  let sanitized = text.trim();

  // Remove script tags and content
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');

  // Remove iframe tags and content
  sanitized = sanitized.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove inline event handlers (onclick, onload, onerror, etc.) — inside HTML tags only (X26)
  sanitized = stripHtmlEventHandlers(sanitized);

  // Remove data: URLs (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Limit length
  sanitized = sanitized.substring(0, MAX_COMMENT_LENGTH);

  return sanitized;
}

/**
 * Validate comment text meets requirements
 *
 * @param text - Comment text to validate
 * @returns Validation result with error message if invalid
 */
export function validateComment(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Comment cannot be empty' };
  }

  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return { valid: false, error: `Comment too long (${text.trim().length} chars, max ${MAX_COMMENT_LENGTH}). Truncate your text or split across multiple comments using perform(action: "task.comment").` };
  }

  // Check for suspicious patterns after sanitization.
  // X27 (2026-09-28): compare against the TRIMMED text — sanitizeComment's own normalization is
  // trim() + a length cap (a no-op here: trimmed length <= MAX_COMMENT_LENGTH is checked above), so
  // any remaining difference is unsafe-content removal. Comparing against the raw text refused every
  // comment with leading/trailing whitespace (e.g. a trailing newline) as "unsafe". The persisted
  // value (the caller stores sanitizeComment(text)) is trimmed either way.
  const sanitized = sanitizeComment(text);
  if (sanitized !== text.trim()) {
    return { valid: false, error: 'Comment contains potentially unsafe content' };
  }

  return { valid: true };
}

export { MAX_COMMENT_LENGTH };
