/**
 * PLATFORM-HELD-BYTES Stage B V-3 — `computeEditApplication`: apply an Author's edits to the held files, by name, or refuse
 * them by name (plan STAGE-B-PLAN.md v4.1 §3 V-3; §0.1 A2, A4). PURE and env-free (Stage C exports it): R9's version is an
 * input, R10 is called through its pure functions, nothing reads the clock, the environment or a database.
 *
 * WHAT IS MATCHED AGAINST WHAT. Every SEARCH is matched against the ORIGINAL view V (what the Author was shown) by whole
 * lines, never against a partly-edited file. The CANDIDATE is built from the BASE B (the held bytes): V and B are
 * line-for-line by construction (view.ts), a SEARCH may not cover a line R9 rewrote (`touches-rewritten-line`) or a line
 * R10 redacted (`touches-redacted-line`), so every replaced line of V equals its line of B, and every other line of the
 * candidate is B's own bytes. REPLACE lines go in VERBATIM. The candidate's final newline is the base's (the phantom empty
 * line after a final newline is never matchable).
 *
 * ALL-OR-NOTHING PER FILE: one refused edit on a file means no candidate for that file (its other edits are counted as not
 * applied); other files still apply ⇒ `partial`.
 *
 * Refusals are NAMED and CLASSED (`EDIT_REFUSAL_CLASS`, exhaustive, pinned). AUTHOR_CORRECTABLE names are what the
 * correction turn (V-5c) may fix; NOT_CORRECTABLE names are the Author's but never attempted (Phase 10 D3(b)); PLATFORM_STATE names are
 * the platform's own states and are never sent to the Author.
 * A refusal record carries the block index and the name — and line NUMBERS / a rule id / an R9 rewrite class where they
 * help — NEVER line text (the correction prompt and the digest are built from these records).
 */
import { createHash } from 'crypto';
import { parseHeldEdits, textLines, type ParsedBlock, type ParsedHeldEdits } from './edits';
import { HELD_EDIT_MAX_BYTES, HELD_EDIT_MAX_EDITS } from './caps';
import { countPlaceholders } from './canonical-text';
import { heldFilesWrittenWhole } from './whole-file';
import { redactArtifactSecrets, redactSecretsDeep, buildEchoMatcher, redactEchoes } from '../redact-artifact-secrets';
import { sanitizeChainedOutput } from '../sanitize-chained-output';
import { APPLY_BLOCK_PLACEHOLDER_FORMS } from '../apply-block-placeholder';

// ── names ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const AUTHOR_CORRECTABLE = [
  'search-not-found', 'search-not-unique', 'count-mismatch', 'search-empty', 'overlapping-edits', 'ambiguous-markers',
  'touches-redacted-line', 'touches-rewritten-line', 'edit-carries-placeholder', 'edit-introduces-secret-literal',
  'edit-redacted-at-persist', 'replace-unbindable', 'replace-not-reviewable', 'unknown-handle', 'edit-set-too-large',
  'edit-in-rollback-section', 'edits-outside-section', 'create-path-invalid', 'candidate-secret-residual',
] as const;
/** Phase 10 W3 + panel D3(b) (owner, 2026-10-17): Author-caused refusals the correction turn does NOT attempt — the leg is forced
 *  and no turn is spent. `held-file-written-whole` (whole-file.ts): adoption rule v1 cannot adopt a whole-file → edits conversion
 *  (panel PC-B1 / EF-S1), so a turn would be spent for nothing. The adoption rule v2 build spec is filed with the deferral
 *  (phase10-panel/SYNTHESIS.md D3; trigger: the first live fire, read by hand). */
export const NOT_CORRECTABLE = ['held-file-written-whole'] as const;
export const PLATFORM_STATE = [
  'handle-ambiguous', 'base-superseded', 'binding-invalid', 'view-not-rendered', 'view-over-budget', 'view-line-map-unstable',
  'base-not-held', 'unheld', 'handle-namespace-ambiguous', 'diff-over-budget',
] as const;
export type AuthorCorrectable = (typeof AUTHOR_CORRECTABLE)[number];
export type NotCorrectable = (typeof NOT_CORRECTABLE)[number];
export type PlatformState = (typeof PLATFORM_STATE)[number];
export type EditRefusalName = AuthorCorrectable | NotCorrectable | PlatformState;
export type EditRefusalClass = 'AUTHOR_CORRECTABLE' | 'NOT_CORRECTABLE' | 'PLATFORM_STATE';
export const EDIT_REFUSAL_CLASS: Readonly<Record<EditRefusalName, EditRefusalClass>> = Object.freeze({
  ...Object.fromEntries(AUTHOR_CORRECTABLE.map((n) => [n, 'AUTHOR_CORRECTABLE' as const])),
  ...Object.fromEntries(NOT_CORRECTABLE.map((n) => [n, 'NOT_CORRECTABLE' as const])),
  ...Object.fromEntries(PLATFORM_STATE.map((n) => [n, 'PLATFORM_STATE' as const])),
} as Record<EditRefusalName, EditRefusalClass>);

/** Package states that are decided BEFORE any edit is read (precedence 1–4); the caller (the step) decides them. */
export type PreState = 'binding-mismatch' | 'variant-protocol-not-injected' | 'demo-pov' | 'could-not-check';
export type PackageState =
  | PreState | 'r10-disabled' | 'no-base' | PlatformState | 'no-edits' | 'refused' | 'partial' | 'applied';

// ── inputs and outputs ───────────────────────────────────────────────────────────────────────────────────────────

export interface HeldFileInput {
  handle: string;
  path: string;
  /** 'rendered' when the entry carries a verified base and its view; otherwise the PLATFORM_STATE the entry is in. */
  state: 'rendered' | PlatformState;
  /** B — the held bytes (R10 output). Required when rendered. */
  baseText?: string;
  /** V — the view the Author was shown. Required when rendered. */
  viewText?: string;
  /** 1-based lines of V that R9 rewrote. */
  rewrittenLines?: number[];
  /** The base ref's `redactorVersion` ('none' ⇒ the package is `r10-disabled`). */
  redactorVersion?: string;
}

export interface EditApplicationInput {
  files: HeldFileInput[];
  /** R9's version in effect ('none' ⇒ R9 off: the explicit control/zero-width check replaces the sanitizer comparison). */
  r9Version: string;
  preState?: PreState;
  /** Package-level platform states (e.g. `handle-namespace-ambiguous`, `diff-over-budget`), decided by the chainer. */
  platformStates?: PlatformState[];
  /** R10-V8-RESIDUALS (b): the persist's OTHER echo sources — the tokens R10's keyed rules will take from this execution's tool
   *  records (collectR10EchoSources). A held-edit line carrying a bare echo of one of them persists as a placeholder, so it is
   *  `edit-redacted-at-persist`, never applied with the value in the candidate. In memory only (the values ARE secrets); absent ⇒
   *  the deliverable's own tokens only (the chainer's recompute reads the PERSISTED text, where those echoes are already gone). */
  persistEchoTokens?: Iterable<string>;
}

export interface EditRefusal {
  /** 1-based block index in the response (document order over every block), or null for a package-level refusal. */
  block: number | null;
  handle: string | null;
  name: EditRefusalName;
  /** View (V) line numbers the refusal is about (touches-*), never their text. */
  lines?: number[];
  /** The R9 rewrite class for replace-not-reviewable; the R10 rule family is not exposed (counts only). */
  rewriteClass?: string;
  /** Occurrences found (search-not-unique / count-mismatch). */
  found?: number;
}

export interface FileApplication {
  handle: string;
  path: string;
  op: 'edit' | 'create';
  /** create: the handle whose file identity it inherits. */
  onHandle?: string;
  state: 'applied' | 'refused' | 'unchanged';
  applied: number;
  total: number;
  mode: 'replace-file' | 'diff-only';
  addedLines: number;
  removedLines: number;
  editAddsCredentialDirective: number;
  /** In memory only — never stamped. Present iff state = 'applied'. */
  candidateText?: string;
  candidateSha256?: string;
  /** For the diff (V-3 diff.ts): the applied edits' 1-based V line ranges, ascending. */
  hunks?: Array<{ block: number; start: number; searchLen: number; replace: string[] }>;
}

export interface EditApplication {
  version: 1;
  state: PackageState;
  applied: number;
  total: number;
  refusals: EditRefusal[];
  refused: Partial<Record<EditRefusalName, number>>;
  refusedTotal: number;
  files: FileApplication[];
  rollback: Array<{ handle: string; directive: 'restore' }>;
  editsOutsideSection: number;
  restoreOutsideRollback: number;
  /** Phase 10 §1a (panel A-M1): EVERY parsed held block (SEARCH/REPLACE or create), in ANY section — computed from the parse, which
   *  runs before every precedence, so it is present on early-return states too. */
  blocksTotal: number;
  /** Phase 10 §1a: `restore H<n>` directives inside `Held File Rollback` (also pre-precedence). */
  rollbackRestores: number;
  /** A2: CANDIDATE rows the package writes — 0 unless state = 'applied'; each edited file and each create once. */
  candidateFiles: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

/** The file's lines without the phantom element after a final newline (never matchable, never edited). */
function bodyLines(text: string): { lines: string[]; finalNewline: boolean } {
  const ls = textLines(text);
  const finalNewline = text.endsWith('\n');
  if (finalNewline) ls.pop();
  if (text === '') return { lines: [], finalNewline: false };
  return { lines: ls, finalNewline };
}

/** R9's in-band markers: text the platform wrote, never the Author's or the file's. */
const R9_MARKERS = ['[NEUTRALIZED-INJECTION:', `${String.fromCharCode(0x2039)}prior_output`];
function carriesPlaceholder(text: string): boolean {
  const n = text.normalize('NFKC');
  if (APPLY_BLOCK_PLACEHOLDER_FORMS.some((f) => new RegExp(f.re.source, 'i').test(n))) return true;
  const lower = n.toLowerCase();
  return R9_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

/** R9 off: the characters R9 would strip are still unreviewable (they render invisibly or as control effects). */
const UNREVIEWABLE_RAW = /[​-‏‪-‮⁠-⁤⁦-⁯﻿\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function notReviewable(text: string, r9Version: string): string | null {
  if (r9Version === 'none') return UNREVIEWABLE_RAW.test(text) ? 'control-or-invisible' : null;
  const r = sanitizeChainedOutput(text);
  return r.text !== text ? (r.rewriteClasses[0] ?? 'unclassified') : null;
}

function unbindable(text: string): boolean {
  return text.includes('\r') || text.includes('\u0000') || !text.isWellFormed();
}

/** HELD-GIT-CREATE-PATH-SLASH (L-K2 F-2; re-homed to held-terraform step 1, 2026-10-21): a created path is written in the INHERITED
 *  file's form. A Git held path keeps the URI's leading slash (`/k8s/a.yaml`) and an Author naturally writes the repo-relative form
 *  (`k8s/new.yaml`); before this a same-directory create was refused `create-path-invalid`. ONE leading slash is added or dropped to
 *  match the inherited path — nothing else changes, and the result still goes through createPathValid (same directory, charset,
 *  no `..`). Obs paths are absolute too, so an obs create written without the slash now applies the same way. */
export function createPathInInheritedForm(path: string, onPath: string): string {
  if (typeof path !== 'string' || typeof onPath !== 'string') return path;
  if (onPath.startsWith('/') && !path.startsWith('/')) return '/' + path;
  if (!onPath.startsWith('/') && path.startsWith('/') && !path.startsWith('//')) return path.slice(1);
  return path;
}

/** Two held paths name one file when they are equal after dropping ONE leading slash on each (the Git `/k8s/a.yaml` vs `k8s/a.yaml`
 *  forms — createPathInInheritedForm). Used by the create-collision check (F-N2-1 sec-ops finding 1). */
export function samePath(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  const n = (p: string) => (p.startsWith('/') && !p.startsWith('//') ? p.slice(1) : p);
  return n(a) === n(b);
}

/** F-N2-1 (owner 2026-10-26) + sec-ops review finding 2 — the per-entry platform states an UNNAMED entry may carry without sinking the
 *  package: the platform holds NO bytes for it (a refused or failed source, or a base gone from the store). EXPLICIT — never derived as
 *  "PLATFORM_STATE minus …" (audit N-5); a held-but-not-shown state is never exempt. */
export const NAMING_EXEMPT_STATES: ReadonlySet<string> = new Set(['unheld', 'base-not-held']);

/** create-path-invalid (sec-ops SF-A): charset, length, no `..`, no control, SAME DIRECTORY as the inherited file. */
export function createPathValid(path: string, onPath: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.length > 512) return false;
  if (path.split('/').some((seg) => seg === '..')) return false;
  const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  return dir(path) === dir(onPath) && path !== onPath;
}

/** Credential directives counted on ADDED lines: the KEY only (no value gate, no exemption) — a reviewer-facing count. */
const CREDENTIAL_DIRECTIVE_RE =
  /^\s*(?:-\s*)?["']?(?:password|passwd|secret|client_secret|token|bearer_token|access_token|api_key|apikey|api-key|private_key|credentials|authorization|auth_token|x-api-key|dd-api-key)["']?\s*[:=]/i;

/** Non-overlapping occurrences of `needle` (a line sequence) in `hay`, left to right; 0-based start indices. */
function findOccurrences(hay: string[], needle: string[]): number[] {
  const out: number[] = [];
  if (needle.length === 0 || needle.length > hay.length) return out;
  for (let i = 0; i + needle.length <= hay.length; ) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) { out.push(i); i += needle.length; } else i++;
  }
  return out;
}

// ── the applier ──────────────────────────────────────────────────────────────────────────────────────────────────

export function computeEditApplication(finalResponse: string, input: EditApplicationInput): EditApplication {
  const text = typeof finalResponse === 'string' ? finalResponse : '';
  const parsed: ParsedHeldEdits = parseHeldEdits(text);
  const refusals: EditRefusal[] = [];
  const refuse = (r: EditRefusal) => { refusals.push(r); };
  const inEdits = parsed.blocks.filter((b) => b.section === 'edits');
  const files = input.files ?? [];
  const byHandle = new Map(files.map((f) => [f.handle, f]));
  const rollback: EditApplication['rollback'] = [];

  const result = (state: PackageState, fileApps: FileApplication[] = []): EditApplication => {
    const refused: Partial<Record<EditRefusalName, number>> = {};
    for (const r of refusals) refused[r.name] = (refused[r.name] ?? 0) + 1;
    const total = inEdits.length;
    const applied = fileApps.reduce((n, f) => n + f.applied, 0);
    return {
      version: 1, state, applied, total, refusals, refused, refusedTotal: refusals.length, files: fileApps, rollback,
      editsOutsideSection: parsed.editsOutsideSection, restoreOutsideRollback: parsed.restoreOutsideRollback,
      blocksTotal: parsed.blocks.length, rollbackRestores: parsed.restores.filter((r) => r.section === 'rollback').length,
      candidateFiles: state === 'applied' ? fileApps.filter((f) => f.state === 'applied').length : 0,
    };
  };

  // Precedence 1–5: decided before any edit is judged.
  if (input.preState === 'binding-mismatch' || input.preState === 'variant-protocol-not-injected') return result(input.preState);
  if (input.preState === 'demo-pov') return result('demo-pov');
  if (files.some((f) => f.redactorVersion === 'none')) return result('r10-disabled');
  if (input.preState === 'could-not-check') return result('could-not-check');
  if (files.length === 0) return result('no-base');
  // Precedence 6: a platform state — binding-invalid first. F-N2-1 (owner 2026-10-26, held-network L-N2 ADDENDUM (b)): an entry's
  // state counts when the package NAMES its handle (a SEARCH/REPLACE or a `create … on` in ANY section, or a `restore` anywhere), so an
  // edit of an unheld file is still refused — the package state names the platform state, as before. An entry the package does NOT
  // name is context, not the package's state — but ONLY when its state is in NAMING_EXEMPT_STATES (the platform holds NO bytes for it):
  // before this, one unnamed `unheld` item discarded a correct edit on every OTHER file (A-NL3: one device's refused ref; B-L2's
  // evidence-only read, now handleless). Still counted whatever the naming (fail-closed): the package-level states
  // (handle-namespace-ambiguous, diff-over-budget); every state outside the exempt list — `binding-invalid` (an integrity failure of the
  // chain's binding) and the held-but-NOT-SHOWN states (view-*, handle-ambiguous, base-superseded: the platform holds the file, the
  // Author was not shown it, and an agent can induce them — sec-ops F-N2-1 review finding 2); and every entry when NO entry is rendered
  // (nothing could apply, so the stamp keeps the state it has always carried — the all-unheld population does not move).
  const named = new Set<string>([
    ...parsed.blocks.flatMap((b) => (b.op === 'create' ? [b.handle, b.onHandle as string] : [b.handle])),
    ...parsed.restores.map((r) => r.handle),
  ]);
  const anyRendered = files.some((f) => f.state === 'rendered');
  const states = [...(input.platformStates ?? []), ...files
    .filter((f) => f.state !== 'rendered' && (!anyRendered || !NAMING_EXEMPT_STATES.has(f.state) || named.has(f.handle)))
    .map((f) => f.state as PlatformState)];
  if (states.length) return result(states.includes('binding-invalid') ? 'binding-invalid' : states[0]);
  // From here every judged file is rendered; an unnamed non-rendered entry takes no part (byHandle keeps it only for naming).
  const judged = files.filter((f) => f.state === 'rendered');

  // Rollback directives (stamped, never applied).
  for (const r of parsed.restores) {
    if (r.section !== 'rollback') continue;
    if (byHandle.has(r.handle)) { if (!rollback.some((x) => x.handle === r.handle)) rollback.push({ handle: r.handle, directive: 'restore' }); }
    else refuse({ block: null, handle: r.handle, name: 'unknown-handle' });
  }
  // Blocks in the rollback section are refused, never applied.
  for (const b of parsed.blocks.filter((x) => x.section === 'rollback')) refuse({ block: b.blockIndex, handle: b.handle, name: 'edit-in-rollback-section' });
  // Nothing in the sections, something outside them ⇒ a mis-placed package (correctable), not "no edits".
  if (inEdits.length === 0 && parsed.editsOutsideSection > 0) refuse({ block: null, handle: null, name: 'edits-outside-section' });
  if (parsed.restores.filter((r) => r.section === 'rollback').length === 0 && parsed.restoreOutsideRollback > 0) {
    refuse({ block: null, handle: null, name: 'edits-outside-section' });
  }
  // Phase 10 W3: a held file written WHOLE (a non-grammar fenced block outside the rollback section that covers ≥ 90% of the held
  // file in order AND adds a line to it — whole-file.ts; an unchanged quote is exempt, D5) is refused. `no-edits` below therefore
  // means what was CHECKED — no held edit, no restore refused, no whole-file write at ≥ 0.90 found — never "this package changes no
  // held file" (a write below 0.90 also lands there; panel AR-B2 / audit A-S7). Compared against the held base and its view.
  for (const h of heldFilesWrittenWhole(text, parsed, judged.map((f) => ({ handle: f.handle, texts: [f.baseText ?? '', f.viewText ?? ''] })))) {
    refuse({ block: null, handle: h, name: 'held-file-written-whole' });
  }
  // Precedence 7: nothing to apply and nothing refused.
  if (inEdits.length === 0 && refusals.length === 0) return result('no-edits');

  // edit-set-too-large: every in-section edit is refused (the cap bounds the applier's time — pinned).
  const bytes = inEdits.reduce((n, b) => n + Buffer.byteLength(b.search.join('\n') + b.replace.join('\n'), 'utf8'), 0);
  if (inEdits.length > HELD_EDIT_MAX_EDITS || bytes > HELD_EDIT_MAX_BYTES) {
    for (const b of inEdits) refuse({ block: b.blockIndex, handle: b.handle, name: 'edit-set-too-large' });
    return result('refused');
  }

  // The PERSISTED form, once (AE S4(i)): R10's deep walk over { finalResponse }, both arms. R10 is line-preserving, so a
  // block whose lines differ there is a block whose persisted text would not be the applied text.
  // R10 v8: plus the ECHO pass over the text's own keyed tokens — a held-edit line carrying a bare echo of a value redacted
  // elsewhere in this finalResponse persists as a placeholder, so it is not the applied text either (edit-redacted-at-persist).
  // The persist's echo source is wider: the execution's tool records (`persistEchoTokens`, R10-V8-RESIDUALS (b), 2026-10-25) —
  // report.md is the deliverable's own text.
  const echoSink = new Set<string>(input.persistEchoTokens ?? []);
  const deepPersisted = String((redactSecretsDeep({ finalResponse: text }, echoSink).value as { finalResponse: unknown }).finalResponse ?? '');
  const persisted = redactEchoes(deepPersisted, buildEchoMatcher(echoSink)).redacted;
  const tl = textLines(text); const pl = textLines(persisted);
  const redactedAtPersist = (b: ParsedBlock): boolean => {
    if (pl.length !== tl.length) return true;
    for (let x = b.openLine; x <= b.closeLine; x++) if (tl[x - 1] !== pl[x - 1]) return true;
    return false;
  };

  const ambiguousBlocks = new Set(parsed.ambiguous.filter((a) => a.blockIndex !== undefined).map((a) => a.blockIndex as number));
  if (parsed.ambiguous.some((a) => a.blockIndex === undefined && a.section === 'edits')) {
    refuse({ block: null, handle: null, name: 'ambiguous-markers' });
  }

  type Placed = { b: ParsedBlock; file: HeldFileInput; starts: number[] };
  const placed: Placed[] = [];
  const creates: Array<{ b: ParsedBlock; on: HeldFileInput; path: string }> = [];
  const failedHandles = new Set<string>();
  const createHandles = new Set<string>();
  const createPaths = new Set<string>(); // sec-ops step-1 SF-3: two creates of ONE path (any spelling) both applied before

  for (const b of inEdits) {
    const fail = (name: EditRefusalName, extra: Partial<EditRefusal> = {}) => {
      refuse({ block: b.blockIndex, handle: b.handle, name, ...extra });
      failedHandles.add(b.op === 'create' ? `create:${b.handle}` : b.handle);
    };
    if (ambiguousBlocks.has(b.blockIndex)) { fail('ambiguous-markers'); continue; }
    const body = b.replace.join('\n');
    if (b.op === 'create') {
      const on = byHandle.get(b.onHandle as string);
      if (!on) { fail('unknown-handle'); continue; }
      const createPath = createPathInInheritedForm(b.path as string, on.path); // HELD-GIT-CREATE-PATH-SLASH
      // sec-ops F-N2-1 review finding 1: the collision is checked against EVERY entry (an unnamed unheld file included — a create must
      // never overwrite a file the platform refused to hold), on a slash-normalised path so another spelling cannot slip past.
      if (byHandle.has(b.handle) || createHandles.has(b.handle) || createPaths.has(createPath) || files.some((f) => samePath(f.path, createPath))) { fail('overlapping-edits'); continue; }
      createHandles.add(b.handle);
      createPaths.add(createPath);
      if (unbindable(body)) { fail('replace-unbindable'); continue; }
      if (carriesPlaceholder(body)) { fail('edit-carries-placeholder'); continue; }
      if (redactArtifactSecrets(body).redactedCount > 0) { fail('edit-introduces-secret-literal'); continue; }
      if (redactedAtPersist(b)) { fail('edit-redacted-at-persist'); continue; }
      const rc = notReviewable(body, input.r9Version);
      if (rc) { fail('replace-not-reviewable', { rewriteClass: rc }); continue; }
      if (!createPathValid(createPath, on.path)) { fail('create-path-invalid'); continue; }
      creates.push({ b, on, path: createPath });
      continue;
    }
    const file = byHandle.get(b.handle);
    if (!file) { fail('unknown-handle'); continue; }
    if (b.search.length === 0) { fail('search-empty'); continue; }
    if (unbindable(body)) { fail('replace-unbindable'); continue; }
    if (carriesPlaceholder(body)) { fail('edit-carries-placeholder'); continue; }
    if (redactArtifactSecrets(body).redactedCount > 0) { fail('edit-introduces-secret-literal'); continue; }
    if (redactedAtPersist(b)) { fail('edit-redacted-at-persist'); continue; }
    const rc = notReviewable(body, input.r9Version);
    if (rc) { fail('replace-not-reviewable', { rewriteClass: rc }); continue; }
    const v = bodyLines(file.viewText ?? '').lines;
    const starts = findOccurrences(v, b.search);
    if (starts.length === 0) { fail('search-not-found'); continue; }
    if (b.count === undefined && starts.length > 1) { fail('search-not-unique', { found: starts.length }); continue; }
    if (b.count !== undefined && starts.length !== b.count) { fail('count-mismatch', { found: starts.length }); continue; }
    const covered = starts.flatMap((s) => b.search.map((_, j) => s + j + 1));
    const base = bodyLines(file.baseText ?? '').lines;
    const redacted = covered.filter((n) => countPlaceholders(base[n - 1] ?? '') > 0);
    if (redacted.length) { fail('touches-redacted-line', { lines: redacted }); continue; }
    const rw = new Set(file.rewrittenLines ?? []);
    const rewritten = covered.filter((n) => rw.has(n));
    if (rewritten.length) { fail('touches-rewritten-line', { lines: rewritten }); continue; }
    placed.push({ b, file, starts });
  }

  // overlapping-edits: two edits on one file whose ranges share a line — both refused.
  const byFile = new Map<string, Placed[]>();
  for (const p of placed) byFile.set(p.file.handle, [...(byFile.get(p.file.handle) ?? []), p]);
  const overlapping = new Set<Placed>();
  for (const ps of byFile.values()) {
    const ranges = ps.flatMap((p) => p.starts.map((s) => ({ p, a: s, z: s + p.b.search.length - 1 }))).sort((x, y) => x.a - y.a);
    for (let i = 1; i < ranges.length; i++) {
      for (let j = 0; j < i; j++) {
        if (ranges[j].p !== ranges[i].p && ranges[i].a <= ranges[j].z) { overlapping.add(ranges[i].p); overlapping.add(ranges[j].p); }
      }
    }
  }
  for (const p of overlapping) { refuse({ block: p.b.blockIndex, handle: p.b.handle, name: 'overlapping-edits' }); failedHandles.add(p.b.handle); }

  // Per-file candidates (all-or-nothing).
  const fileApps: FileApplication[] = [];
  for (const file of judged) {
    const mine = inEdits.filter((b) => b.op === 'replace' && b.handle === file.handle);
    if (mine.length === 0) continue;
    const ok = placed.filter((p) => p.file.handle === file.handle && !overlapping.has(p));
    const base = bodyLines(file.baseText ?? '');
    const fa: FileApplication = {
      handle: file.handle, path: file.path, op: 'edit', state: 'refused', applied: 0, total: mine.length,
      mode: 'diff-only', addedLines: 0, removedLines: 0, editAddsCredentialDirective: 0,
    };
    if (!failedHandles.has(file.handle) && ok.length === mine.length) {
      const lines = [...base.lines];
      const hunks = ok.flatMap((p) => p.starts.map((s) => ({ block: p.b.blockIndex, start: s + 1, searchLen: p.b.search.length, replace: p.b.replace })))
        .sort((x, y) => x.start - y.start);
      for (const h of [...hunks].reverse()) lines.splice(h.start - 1, h.searchLen, ...h.replace);
      const cand = lines.join('\n') + (base.finalNewline && lines.length ? '\n' : '');
      // candidate-secret-residual: parity over C (sec-ops NOTE-1) — deep(C) holds both arms; ignores isR10Disabled().
      const deep = String((redactSecretsDeep({ c: cand }).value as { c: unknown }).c ?? '');
      if (countPlaceholders(deep) > countPlaceholders(cand)) {
        refuse({ block: null, handle: file.handle, name: 'candidate-secret-residual' });
      } else {
        fa.state = 'applied'; fa.applied = mine.length; fa.candidateText = cand; fa.candidateSha256 = sha256(cand);
        fa.mode = countPlaceholders(file.baseText ?? '') === 0 && countPlaceholders(cand) === 0 ? 'replace-file' : 'diff-only';
        fa.removedLines = hunks.reduce((n, h) => n + h.searchLen, 0);
        fa.addedLines = hunks.reduce((n, h) => n + h.replace.length, 0);
        fa.editAddsCredentialDirective = hunks.reduce((n, h) => n + h.replace.filter((l) => CREDENTIAL_DIRECTIVE_RE.test(l)).length, 0);
        fa.hunks = hunks;
      }
    }
    fileApps.push(fa);
  }
  for (const { b, on, path: createPath } of creates) {
    if (failedHandles.has(`create:${b.handle}`)) continue;
    const cand = b.replace.join('\n') + (b.replace.length ? '\n' : '');
    const deep = String((redactSecretsDeep({ c: cand }).value as { c: unknown }).c ?? '');
    const fa: FileApplication = {
      handle: b.handle, path: createPath, op: 'create', onHandle: on.handle, state: 'refused', applied: 0, total: 1,
      mode: 'replace-file', addedLines: b.replace.length, removedLines: 0,
      editAddsCredentialDirective: b.replace.filter((l) => CREDENTIAL_DIRECTIVE_RE.test(l)).length,
    };
    if (countPlaceholders(deep) > countPlaceholders(cand)) refuse({ block: b.blockIndex, handle: b.handle, name: 'candidate-secret-residual' });
    else { fa.state = 'applied'; fa.applied = 1; fa.candidateText = cand; fa.candidateSha256 = sha256(cand); fa.hunks = []; }
    fileApps.push(fa);
  }
  for (const b of inEdits.filter((x) => x.op === 'create' && failedHandles.has(`create:${x.handle}`))) {
    fileApps.push({ handle: b.handle, path: b.path ?? '', op: 'create', onHandle: b.onHandle, state: 'refused', applied: 0, total: 1,
      mode: 'replace-file', addedLines: 0, removedLines: 0, editAddsCredentialDirective: 0 });
  }

  // Precedence 8–9.
  if (refusals.length === 0) return result(fileApps.some((f) => f.state === 'applied') ? 'applied' : 'no-edits', fileApps);
  return result(fileApps.some((f) => f.state === 'applied') ? 'partial' : 'refused', fileApps);
}
