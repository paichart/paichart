'use strict';

/**
 * Surrogate-safe string cutting (X11, 2026-09-27).
 *
 * A JavaScript string is UTF-16: every character outside the Basic Multilingual Plane (every emoji, e.g. 🗑 U+1F5D1)
 * is TWO code units, a high surrogate (\uD800-\uDBFF) then a low one (\uDC00-\uDFFF). `str.slice(0, n)` counts code
 * units, so a cut landing between the two leaves a LONE surrogate. That is not a valid Unicode string:
 *   - JSON.stringify writes it as the escape `\ud83d`, and Postgres REJECTS that escape in jsonb — so a jsonb write
 *     throws, and a `text` column holding such JSON breaks every query that casts it `::jsonb` (X11: one
 *     pipeline-index.json, 2026-09-25, took down a replay runner that cast the whole table);
 *   - an LLM API request carrying it may be refused.
 *
 * Bare-Node loadable (plain CJS, no TS) because lib/mcp/server/tools/response-sanitizer.js requires it.
 */

/**
 * `str.slice(0, end)`, except that a cut which would split a surrogate pair drops the orphaned high surrogate — the
 * result is at most `end` code units and never ends mid-character. Only the END is adjusted: this is for prefix cuts.
 */
function sliceSurrogateSafe(str, end) {
  if (typeof str !== 'string') return str;
  if (end >= str.length) return str;
  if (end <= 0) return '';
  const last = str.charCodeAt(end - 1);
  const next = str.charCodeAt(end);
  const splitsPair = last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return str.slice(0, splitsPair ? end - 1 : end);
}

/**
 * Replace every lone surrogate with U+FFFD (String.prototype.toWellFormed, Node >= 20). For text that arrives from
 * outside our control (tool results from external MCP services), where the cut was not ours to make.
 */
function toWellFormed(str) {
  if (typeof str !== 'string') return str;
  return str.isWellFormed() ? str : str.toWellFormed();
}

/**
 * JSON.stringify with every string VALUE and KEY made well-formed first, so the output never carries a `\udXXX`
 * lone-surrogate escape. Returns the JSON text and how many strings had to be repaired (a fact, for a log line).
 */
function stringifyWellFormed(value, space) {
  let repaired = 0;
  const fix = (s) => {
    if (s.isWellFormed()) return s;
    repaired++;
    return s.toWellFormed();
  };
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (v === null || typeof v !== 'object') return v;
    if (typeof v.toJSON === 'function') return walk(v.toJSON());
    if (Array.isArray(v)) {
      let out = null;
      for (let i = 0; i < v.length; i++) {
        const w = walk(v[i]);
        if (w !== v[i]) { out = out || v.slice(); out[i] = w; }
      }
      return out || v;
    }
    // Rebuilt IN ORDER only when something changed: result.json key order is a contract (orderResultJsonForPersist).
    let changed = false;
    const entries = Object.keys(v).map((k) => {
      const w = walk(v[k]);
      const fk = fix(k);
      if (w !== v[k] || fk !== k) changed = true;
      return [fk, w];
    });
    return changed ? Object.fromEntries(entries) : v;
  };
  return { json: JSON.stringify(walk(value), null, space), repaired };
}

module.exports = { sliceSurrogateSafe, toWellFormed, stringifyWellFormed };
