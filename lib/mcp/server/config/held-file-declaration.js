/**
 * WI-B10 (2026-10-23) — the ONE held-file declaration grammar + validator, used by registration, the capture extractor,
 * the capture table build (re-validates on read) and MI-13. Plain CommonJS whose only requires are node built-ins and the
 * require-free sibling git-file-source-pin.js, so it
 * loads under bare Node, ts-node (paichart-mcp) and webpack alike (the git-file-source-pin.js precedent; tool-schemas.js
 * deliberately imports no TS).
 *
 * The selector grammar, `pathProblem`, `TARGET_PATTERN` and `SELECTOR_MAX` MOVED here from held-bytes/extract.ts (design
 * §9.1 H: one grammar, never a second copy). Grammar, from the tool result root (`data.result`):
 *   select := seg ('.' seg)*        seg := key | key '[' field '=' literal ']' | '*'
 * At most ONE `*` (any position — WI-B10 widens it from trailing-only, so a keyed map in the MIDDLE of a path, e.g. a
 * per-device object, binds each key to `{key}`); a bracketed seg never coexists with a `*`.
 *
 * Design: cline_docs/reviews/held-network-2026-10-22/WI-B10-DESIGN.md §9.1 D/F/H/I, §10.
 */
'use strict';

const crypto = require('crypto');

/** Bump when the grammar or a validation rule changes; held_declarations.grammarVersion records the FIRST accepting one. */
const GRAMMAR_VERSION = 1;

const TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,252}$/;
/** = the store's in-tx string bound (HELD_STRING_MAX): a selector longer than this could not be bound. */
const SELECTOR_MAX = 2048;
const MAX_PATH = 1024;
/** Design D: ≤ 64 entries, ≤ 32 KB canonical. */
const MAX_ENTRIES = 64;
const MAX_CANONICAL_BYTES = 32 * 1024;
const MAX_NOT_A_FILE = 200;

/** held-k8s: `name[field=literal]`. */
const BRACKET_SEG = /^([A-Za-z_][A-Za-z0-9_]*)\[([A-Za-z_][A-Za-z0-9_]*)=([a-z][a-z0-9-]*)\]$/;
/** A registrant key segment (the extractor itself accepts any key the platform defaults name). */
const KEY_SEG = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/;
const TOOL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const GIT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const GIT_REF = /^(refs\/heads\/)?[A-Za-z0-9][A-Za-z0-9._\/-]{0,199}$/;

/** Why a path is unsafe, or null — P3 §4.2 plus the contract's "R9-safe rendering" (code review SF-V3): no C0 or C1
 *  control (incl. TAB and ESC), no U+2028/U+2029 line or paragraph separator, no bidi override, no '..' / '.' / empty
 *  segment. A path is shown to people later (Stage B); nothing that can lie about itself when rendered is held. */
function pathProblem(p) {
  if (!p.startsWith('/')) return 'not-absolute';
  if (p.length > MAX_PATH) return 'too-long';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(p)) return 'control-character';
  if (/[\u2028\u2029]/.test(p)) return 'line-separator';
  if (/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/.test(p)) return 'bidi-control';
  if (!p.isWellFormed()) return 'lone-surrogate';
  const segs = p.split('/').slice(1);
  if (segs.includes('..')) return 'dot-dot-segment';
  if (segs.some((s, i) => s === '.' || (s === '' && i < segs.length - 1))) return 'empty-or-dot-segment';
  return null;
}

/** Parse a selector into its segments, or say why it is outside the grammar. `strict` adds the registrant key-character
 *  rule (the platform default table predates it and is trusted). */
function parseSelector(select, { strict = false } = {}) {
  if (typeof select !== 'string' || select.length === 0) return { ok: false, reason: 'selector-empty' };
  if (select.length > SELECTOR_MAX) return { ok: false, reason: 'selector-too-long' };
  const parts = select.split('.');
  const segments = [];
  let stars = 0;
  let brackets = 0;
  for (const p of parts) {
    if (p === '*') { stars++; segments.push({ type: 'star' }); continue; }
    const b = BRACKET_SEG.exec(p);
    if (b) { brackets++; segments.push({ type: 'bracket', name: b[1], field: b[2], literal: b[3] }); continue; }
    if (p.length === 0) return { ok: false, reason: 'selector-empty-segment' };
    if (strict && !KEY_SEG.test(p)) return { ok: false, reason: 'selector-bad-key' };
    if (p.includes('[') || p.includes(']')) return { ok: false, reason: 'selector-bad-bracket' };
    segments.push({ type: 'key', name: p });
  }
  if (stars > 1) return { ok: false, reason: 'selector-multiple-stars' };
  if (stars === 1 && brackets > 0) return { ok: false, reason: 'selector-star-with-bracket' };
  if (stars === 1 && segments.length === 1) return { ok: false, reason: 'selector-bare-star' };
  return { ok: true, segments, hasStar: stars === 1 };
}

/** Canonical JSON: object keys sorted at every level, no whitespace. Arrays keep their order. */
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The declaration identity (design §9.2 C3): sha256 of the canonical heldFiles JSON — computable for both producers. */
function heldFilesSha256(entries) {
  return sha256Hex(canonicalJson(entries));
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const asciiFold = (s) => (/^[\x20-\x7e]*$/.test(s) ? s.toLowerCase() : null);

/** Build a value source from allowlisted keys only (never a spread of caller input). `allowUri` only for a gitPin entry. */
function normalizeSource(src, field, { allowUri, hasStar }) {
  if (!isPlainObject(src)) return { ok: false, reason: `${field}-not-an-object` };
  const keys = Object.keys(src);
  if (keys.length !== 1) return { ok: false, reason: `${field}-one-source-key` };
  const k = keys[0];
  const v = src[k];
  if (k === 'const') return typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH ? { ok: true, value: { const: v } } : { ok: false, reason: `${field}-const-invalid` };
  if (k === 'template') {
    if (typeof v !== 'string' || v.length === 0 || v.length > MAX_PATH) return { ok: false, reason: `${field}-template-invalid` };
    const vars = v.match(/\{[^}]*\}/g) || [];
    if (vars.some((x) => x !== '{key}')) return { ok: false, reason: `${field}-template-variable` };
    if (vars.length > 0 && !hasStar) return { ok: false, reason: `${field}-template-needs-star` };
    return { ok: true, value: { template: v } };
  }
  if (k === 'argument') return typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(v) ? { ok: true, value: { argument: v } } : { ok: false, reason: `${field}-argument-invalid` };
  if (k === 'uri') return allowUri && v === 'path' ? { ok: true, value: { uri: 'path' } } : { ok: false, reason: `${field}-uri-invalid` };
  return { ok: false, reason: `${field}-unknown-source` };
}

/**
 * Validate a REGISTRANT declaration and return its canonical form. Never throws; a refusal names the first failing entry.
 *
 * ctx: { serviceName, capabilityToolNames: string[], platformServiceNames: string[], platformPins: {owner,repo}[],
 *        platformTargets: string[] }
 *
 * Input shape (the public descriptor's `heldFiles` section):
 *   { notAFile?: string[], files: [{ tool, select, target, path, gitPin?: {owner, repo, ref?} }] }
 * or the bare array of file entries (the shape a human registration may pass).
 * Returns { ok: true, declaration: { files, notAFile }, sha256 } | { ok: false, index, reason }.
 */
function validateHeldFiles(input, ctx) {
  const c = ctx || {};
  const toolNames = new Set(Array.isArray(c.capabilityToolNames) ? c.capabilityToolNames : []);
  const platformNames = new Set(Array.isArray(c.platformServiceNames) ? c.platformServiceNames : []);
  const platformTargets = new Set(Array.isArray(c.platformTargets) ? c.platformTargets : []);
  const platformPins = (Array.isArray(c.platformPins) ? c.platformPins : []).map((p) => `${asciiFold(p.owner)}/${asciiFold(p.repo)}`);

  // F(a): ANY declaration on a platform-default service name is refused (the defaults apply there).
  if (typeof c.serviceName === 'string' && platformNames.has(c.serviceName)) return { ok: false, index: -1, reason: 'platform-service-name' };

  let files; let notAFile = [];
  if (Array.isArray(input)) files = input;
  else if (isPlainObject(input)) {
    for (const k of Object.keys(input)) if (k !== 'files' && k !== 'notAFile') return { ok: false, index: -1, reason: 'unknown-key' };
    files = input.files;
    if (own(input, 'notAFile')) {
      if (!Array.isArray(input.notAFile) || input.notAFile.length > MAX_NOT_A_FILE
        || input.notAFile.some((t) => typeof t !== 'string' || !TOOL_NAME.test(t))) return { ok: false, index: -1, reason: 'not-a-file-invalid' };
      notAFile = [...new Set(input.notAFile)].sort();
    }
  } else return { ok: false, index: -1, reason: 'not-an-array-or-object' };
  if (!Array.isArray(files) || files.length === 0) return { ok: false, index: -1, reason: 'files-empty' };
  if (files.length > MAX_ENTRIES) return { ok: false, index: -1, reason: 'too-many-entries' };

  const out = [];
  const seenPair = new Set();
  for (let i = 0; i < files.length; i++) {
    const e = files[i];
    if (!isPlainObject(e)) return { ok: false, index: i, reason: 'entry-not-an-object' };
    for (const k of Object.keys(e)) if (!['tool', 'select', 'target', 'path', 'gitPin'].includes(k)) return { ok: false, index: i, reason: 'entry-unknown-key' };
    if (typeof e.tool !== 'string' || !TOOL_NAME.test(e.tool)) return { ok: false, index: i, reason: 'tool-invalid' };
    // guard (2): a declaration covers only its OWN service's tools.
    if (!toolNames.has(e.tool)) return { ok: false, index: i, reason: 'tool-not-in-capabilities' };
    if (notAFile.includes(e.tool)) return { ok: false, index: i, reason: 'tool-also-not-a-file' };
    const sel = parseSelector(e.select, { strict: true });
    if (!sel.ok) return { ok: false, index: i, reason: sel.reason };
    const pairKey = `${e.tool}\u0000${e.select}`;
    if (seenPair.has(pairKey)) return { ok: false, index: i, reason: 'duplicate-entry' };
    seenPair.add(pairKey);

    let gitPin = null;
    if (own(e, 'gitPin')) {
      const g = e.gitPin;
      if (!isPlainObject(g)) return { ok: false, index: i, reason: 'git-pin-not-an-object' };
      for (const k of Object.keys(g)) if (!['owner', 'repo', 'ref'].includes(k)) return { ok: false, index: i, reason: 'git-pin-unknown-key' };
      if (typeof g.owner !== 'string' || !GIT_NAME.test(g.owner) || typeof g.repo !== 'string' || !GIT_NAME.test(g.repo)) {
        return { ok: false, index: i, reason: 'git-pin-invalid' };
      }
      if (own(g, 'ref') && (typeof g.ref !== 'string' || !GIT_REF.test(g.ref) || g.ref.includes('..'))) return { ok: false, index: i, reason: 'git-pin-ref-invalid' };
      // F(c): never the platform's Git source / pin (WB-1).
      if (platformPins.includes(`${asciiFold(g.owner)}/${asciiFold(g.repo)}`)) return { ok: false, index: i, reason: 'git-pin-is-platform' };
      gitPin = { owner: g.owner, repo: g.repo, ...(own(g, 'ref') ? { ref: g.ref } : {}) };
    }

    // F(d): a github: target is DERIVED from the entry's own gitPin, never accepted as a const.
    let target;
    if (gitPin) {
      if (own(e, 'target')) return { ok: false, index: i, reason: 'target-derived-from-git-pin' };
      target = { const: `github:${gitPin.owner}:${gitPin.repo}` };
    } else {
      const t = normalizeSource(e.target, 'target', { allowUri: false, hasStar: sel.hasStar });
      if (!t.ok) return { ok: false, index: i, reason: t.reason };
      target = t.value;
      // sec-ops build SF-2: a target taken from a CALL ARGUMENT is agent-controlled — never on a registrant entry.
      if ('argument' in target) return { ok: false, index: i, reason: 'target-from-argument' };
      // ...and a template whose literal text already names a github: target (its expansion is re-checked at capture).
      if ('template' in target && /^\s*github:/i.test(target.template)) return { ok: false, index: i, reason: 'target-github-needs-git-pin' };
      if ('const' in target) {
        if (!TARGET_PATTERN.test(target.const)) return { ok: false, index: i, reason: 'target-pattern' };
        if (/^github:/i.test(target.const)) return { ok: false, index: i, reason: 'target-github-needs-git-pin' };
      }
    }
    if ('const' in target && (platformTargets.has(target.const) || (!gitPin && isReservedRegistrantTarget(target.const)))) return { ok: false, index: i, reason: 'target-is-platform' };

    const p = normalizeSource(e.path, 'path', { allowUri: !!gitPin, hasStar: sel.hasStar });
    if (!p.ok) return { ok: false, index: i, reason: p.reason };
    if ('const' in p.value && pathProblem(p.value.const)) return { ok: false, index: i, reason: 'path-unsafe' };
    if (gitPin && !('uri' in p.value)) return { ok: false, index: i, reason: 'git-pin-path-must-be-uri' };

    out.push({ tool: e.tool, select: e.select, target, path: p.value, ...(gitPin ? { gitPin } : {}) });
  }
  const declaration = { files: out, notAFile };
  const canonical = canonicalJson(declaration);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_CANONICAL_BYTES) return { ok: false, index: -1, reason: 'too-large' };
  return { ok: true, declaration, sha256: sha256Hex(canonical) };
}

/** Re-validate a STORED declaration's grammar only (design §10 A-11e — guard 2 needs capabilities, checked at register). */
function revalidateStoredGrammar(declaration) {
  if (!isPlainObject(declaration) || !Array.isArray(declaration.files)) return { ok: false, reason: 'declaration-shape' };
  for (let i = 0; i < declaration.files.length; i++) {
    const e = declaration.files[i];
    if (!isPlainObject(e) || typeof e.tool !== 'string') return { ok: false, index: i, reason: 'entry-shape' };
    const sel = parseSelector(e.select, { strict: true });
    if (!sel.ok) return { ok: false, index: i, reason: sel.reason };
  }
  return { ok: true };
}

/**
 * sec-ops build SF-2: targets a REGISTRANT entry may never resolve to — the platform's own targets, and any `github:` target
 * (a Git target is DERIVED from the entry's own gitPin, never written or expanded). Checked at registration (const +
 * literal template prefix) AND at capture on the RESOLVED value (a `{key}` template expands to whatever the registrant's
 * own service returns, so only the resolved value can be judged). The operator's held-base-check builds its Git fetch from
 * a `github:` target string, so a registrant must never be able to produce one.
 */
// LAB-CONFIGS Build 1: the Git target DERIVES from the platform pin (GIT_FILE_SOURCE_PIN) — the one sibling plain-CJS require,
// itself require-free, so this module still loads under bare Node, ts-node and webpack.
const { PLATFORM_GIT_TARGET } = require('./git-file-source-pin');
const PLATFORM_DECLARATION_TARGETS = Object.freeze(['obs-ingress', 'obs-otelcol', PLATFORM_GIT_TARGET]);
function isReservedRegistrantTarget(t) {
  if (typeof t !== 'string') return false;
  const folded = t.trim().toLowerCase();
  return /^github:/.test(folded) || PLATFORM_DECLARATION_TARGETS.some((x) => x.toLowerCase() === folded);
}

module.exports = {
  PLATFORM_DECLARATION_TARGETS,
  isReservedRegistrantTarget,
  GRAMMAR_VERSION,
  TARGET_PATTERN,
  SELECTOR_MAX,
  MAX_PATH,
  MAX_ENTRIES,
  MAX_CANONICAL_BYTES,
  BRACKET_SEG,
  pathProblem,
  parseSelector,
  canonicalJson,
  sha256Hex,
  heldFilesSha256,
  validateHeldFiles,
  revalidateStoredGrammar,
};
