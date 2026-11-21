/**
 * Config sources STEP 3 P3 (plan v2.1 W2 / W3, §5, §13.A A3 A4, §13.B, §13.C) — the PLATFORM's comparison of a held Git file with
 * the served file, PURE. No prisma, no logger, no I/O, no clock.
 *
 * QUESTION (one): for each label a leg declares with a `git-file` base AND a `live-read` line, which LINES differ between the text
 * the platform holds from Git and the text the declared service returned? Both sides are capture's own canonical, redacted text
 * (`canonicalBase`, the same call with the same flag and the same echo sources, in the same persist) — never the raw bytes, and
 * never a text this module redacts itself: each whole text is redacted, THEN split.
 *
 * WHERE IT RUNS: once, in the execution core, synchronously after the capture is planned and before the next `await`
 * (lib/services/file-source-compare-run.ts is the core's one entry). Its output is the stored record `fileSourceCompare`. Every
 * reader — `gitLiveDrift`, `configSourceReads`, `liveEvidence`, a replay, the lab — reads THAT record (re-validated by
 * git-live-drift.ts `validFileCompareRecord`) and never recomputes: a replay cannot, the served text is not stored anywhere.
 *
 * BOUNDED BY COUNTS, never by a clock (so the same input always reads the same state):
 *   - a byte and a line cap per side (`COMPARE_SIDE_MAX_BYTES`, `COMPARE_SIDE_MAX_LINES`) ⇒ `over-compare-cap`, tested before
 *     anything reads the text whole;
 *   - an operation budget per persist (`COMPARE_PERSIST_OP_BUDGET`) ⇒ the pair that crosses it and every later one read
 *     `comparison-budget`. Every loop over lines counts: the interning loop, the prefix and suffix trim, the search.
 * The search is Myers' shortest-edit search in LINEAR SPACE (the middle snake, divide and conquer) over interned lines — integers,
 * so no pattern ever runs over file text here.
 *
 * NEVER THROWS: `buildFileSourceCompare` has its own try; a throw gives every label `compare-error` (plan §13 A4).
 *
 * A FACT, never a gate: nothing in qualityGate or programReleasable reads it, and no force reads the overlap (owner decision 2b).
 */
import type { ConfigSourceLine, LegConfigSources } from './config-sources';
import { resolveConfigLabel } from './held-bytes/config-label';
import { isFileOfGitLine } from './held-bytes/device-read-scope';
import { configPinRefusesRef, servedKeyOf, DECLARED_SCOPE_REFUSALS, GIT_TARGET_PREFIX } from './held-bytes/config-source-scope';
import { COMPARE_SIDE_MAX_BYTES, COMPARE_SIDE_MAX_LINES, COMPARE_PERSIST_MAX_FILES, COMPARE_PERSIST_OP_BUDGET, COMPARE_PERSIST_EVIDENCE_MAX_BYTES } from './held-bytes/caps';
import { gitArgsMatch, serviceCalls, serviceMatcher, shownService } from './device-source-facts';
import { PLACEHOLDER, CREDENTIAL_LINE_VERSION } from './redact-artifact-secrets';
import { sanitizeChainedOutput } from './sanitize-chained-output';
import { quotableLine, quoteSeamOpen } from './file-compare-quote-seam';
import {
  FILE_COMPARE_METHOD, FILE_COMPARE_RECORD_VERSION, FILE_COMPARE_DETAILS, FILE_LINES_QUOTED_CAP, FILE_FACT_QUOTED_CAP, FILE_LINE_SCAN_UNITS,
  FILE_RETURNED_KEYS_CAP, FILE_COMPARE_FILES_CAP, QUOTES_WITHHELD_NO_LIST, fileCompareStateOf, sanitizeQuotedLine, validFileCompareRecord,
  type FileNotCheckedReason,
} from './git-live-drift';

export { COMPARE_SIDE_MAX_BYTES, COMPARE_SIDE_MAX_LINES, COMPARE_PERSIST_MAX_FILES, COMPARE_PERSIST_OP_BUDGET, COMPARE_PERSIST_EVIDENCE_MAX_BYTES };
/** Ranges kept per file and per record, shared by `gitOnlyRanges` and `servedOnlyAfter` (plan §13 C2). Over either ⇒ `rangesTruncated`. */
export const COMPARE_RANGES_PER_FILE = 500;
export const COMPARE_RANGES_PER_RECORD = 2000;

type Obj = Record<string, unknown>;
type ParsedSources = Extract<LegConfigSources, { state: 'parsed' }>;
type GitLine = Extract<ConfigSourceLine, { kind: 'git-file' }>;

/** One served file as capture's evidence chain left it (lib/services/held-bytes-capture.ts). `B` — the canonical, redacted text —
 *  exists ONLY on a `state: 'evidence'` item and ONLY in memory: it is never written, never logged, never on the capture plan. */
export interface CaptureEvidenceItem {
  target: string; path: string; toolCallIndex: number; serviceName: string; serviceId: string | null;
  state: 'evidence' | 'over-compare-cap' | 'comparison-budget' | 'redaction-off' | 'served-file-refused';
  /** The name of the chain step that refused it (`served-file-refused` only). */
  detail?: string;
  B?: string; sha256?: string; redactedCount?: number;
}
export interface CaptureEvidence { items: CaptureEvidenceItem[]; /** how many items entered the chain (ruling E2) */ reached: number; /** their raw bytes */ bytes: number }

/** What the builder reads of the capture plan — strings and numbers only. */
export interface ComparePlanView {
  files: ReadonlyArray<{ target: string; path: string; content: string; sha256: string; storedByteLength: number; toolCallIndex: number; serviceName: string; serviceId: string | null }>;
  refusals: ReadonlyArray<{ target: string | null; path: string | null; refusal: string; toolCallIndex: number; serviceName: string | null; serviceId: string | null; detail?: Record<string, string | number> }>;
}

// ── The ordered line compare ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The ONE thing the comparator throws on purpose: the persist's operation budget ran out. A frozen sentinel, not an Error class —
 *  it is control flow inside this module (always caught by the builder, which names the state `comparison-budget`), carries no
 *  message and no stack to leak, and a domain error class must extend AppError (`test:typed-error-contract`). */
export const COMPARE_BUDGET_EXCEEDED: { readonly compareBudgetExceeded: true } = Object.freeze({ compareBudgetExceeded: true as const });
export const isCompareBudgetExceeded = (e: unknown): boolean => e === COMPARE_BUDGET_EXCEEDED;
export interface OpBudget { used: number; limit: number }
const spend = (ops: OpBudget, n: number): void => { ops.used += n; if (ops.used > ops.limit) throw COMPARE_BUDGET_EXCEEDED; };

/** Is the line one the comparison IGNORES — blank, or a whole-line `#` comment? A character loop (no pattern). */
function ignoredLine(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 0x20 || c === 0x09) continue;
    return c === 0x23;
  }
  return true;
}

interface Side { ids: Int32Array; orig: Int32Array; raw: string[]; ignored: number; redacted: number;
  /** Which lines of this side may never be quoted (by UNFILTERED index). Null while the seam is closed — nothing is quoted then. */
  withhold: LineWithholder | null }

/** How many differing lines a side the comparator TRIES to quote in one file (each try asks the redactor's line test twice). */
export const QUOTE_ATTEMPTS_PER_SIDE = 100;
/** How many DISTINCT lines of one side may be put to the credential-shaped line test by the withholding rules (block openers, a
 *  list item's lines, the line before a quoted one). Past it a line is TREATED AS FLAGGED — the safe direction. Set by the memory
 *  pin: the test is the redactor's and it allocates. Never raise it without re-running TIME2c. */
export const LINE_TESTS_PER_SIDE = 1000;

/** The net change in `{` depth of one line, counting only braces OUTSIDE quotes and before an unquoted `#`. Quote-aware on purpose:
 *  the redactor's own map scan ends a block at ANY brace (sec-ops), and a `}` inside a quoted value must not end ours early — a
 *  block that ends too soon is a quoted credential. A character loop; linear. */
function braceDelta(line: string): number {
  let depth = 0; let quote = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (quote !== 0) { if (c === 0x5c) i++; else if (c === quote) quote = 0; continue; }
    if (c === 0x22 || c === 0x27) { quote = c; continue; }
    if (c === 0x23) break;
    if (c === 0x7b) depth++; else if (c === 0x7d) depth--;
  }
  return depth;
}
/** The same count with quotes and comments IGNORED. Used only to decide whether a flagged line OPENS a block: an unbalanced quote
 *  on the opener must not hide its `{` (a block that never starts is a quoted credential; one that starts needlessly costs detail). */
function naiveBraceDelta(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) { const c = line.charCodeAt(i); if (c === 0x7b) depth++; else if (c === 0x7d) depth--; }
  return depth;
}
const indentOf = (line: string): number => { let i = 0; while (i < line.length && (line.charCodeAt(i) === 0x20 || line.charCodeAt(i) === 0x09)) i++; return i; };
/** Does the line end (trailing blanks aside) as a YAML block opener — a key ending `:`, or a block scalar `|` / `>` with an
 *  optional chomping mark? */
function opensYamlBlock(line: string): boolean {
  let e = line.length; while (e > 0 && (line.charCodeAt(e - 1) === 0x20 || line.charCodeAt(e - 1) === 0x09)) e--;
  if (e === 0) return false;
  let c = line.charCodeAt(e - 1);
  if ((c === 0x2d || c === 0x2b) && e > 1) c = line.charCodeAt(e - 2);
  return c === 0x3a || c === 0x7c || c === 0x3e;
}

/** A YAML sequence entry: `- value`, or a lone `-`. */
function isDashLine(line: string): boolean {
  const n = indentOf(line);
  return line.charCodeAt(n) === 0x2d && (n + 1 === line.length || line.charCodeAt(n + 1) === 0x20 || line.charCodeAt(n + 1) === 0x09);
}
/** Does the line END its statement — trailing blanks aside, with `;`, `{` or `}`? A line that does not may continue on the next. */
function endsStatement(line: string): boolean {
  let e = line.length; while (e > 0 && (line.charCodeAt(e - 1) === 0x20 || line.charCodeAt(e - 1) === 0x09 || line.charCodeAt(e - 1) === 0x0d)) e--;
  if (e === 0) return true;
  const c = line.charCodeAt(e - 1);
  return c === 0x3b || c === 0x7b || c === 0x7d;
}

/** The line test of one side, by line index: asked at most once a line and at most `maxTests` times; past that, FLAGGED. */
function lineTester(all: readonly string[], flagged: (line: string) => boolean, maxTests: number): (i: number) => boolean {
  const memo = new Int8Array(all.length);   // 0 not asked · 1 flagged · 2 not flagged
  let tests = 0;
  return (i) => {
    if (memo[i] === 0) memo[i] = tests >= maxTests ? 1 : (tests++, flagged(all[i]) ? 1 : 2);
    return memo[i] === 1;
  };
}

/**
 * The redactor's CONTRACT, step 2 (redact-artifact-secrets.ts `isCredentialShapedLine`): after a credential-shaped line that OPENS
 * a block, every line up to the block's end is withheld — a secret that only its block marks cannot be seen from its own line.
 *   - a brace block: from the flagged line that leaves a `{` open — or whose `{` stands at the start of the NEXT non-blank line —
 *     to the line where the depth returns to where it was (braces outside quotes only);
 *   - a YAML block: from a flagged line ending `:` / `|` / `>`, every following line indented MORE than it (blank lines too), and
 *     every sequence entry (`- …`) at the SAME indent — YAML lets a key's list sit at the key's own indent (sec-ops J1).
 * The line test is asked ONLY of a line that could open a block. Over-withholding costs detail and nothing else.
 */
function scanBlocks(all: readonly string[], flaggedAt: (i: number) => boolean): Uint8Array {
  const out = new Uint8Array(all.length);
  let braceUntil = -1;   // inside a flagged brace block while depth > braceUntil
  let depth = 0;
  let yamlIndent = -1;   // inside a flagged YAML block while a line is indented more than this (or is a `- ` entry at it)
  let prev = -1;         // the last non-blank line, when it opened nothing: a `{` starting the next one is its block
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    let d = braceDelta(line);
    const inBrace = braceUntil >= 0;
    const n = indentOf(line);
    const blank = n === line.length;
    const inYaml = yamlIndent >= 0 && (blank || n > yamlIndent || (n === yamlIndent && isDashLine(line)));
    if (yamlIndent >= 0 && !inYaml) yamlIndent = -1;
    if (inBrace || inYaml) out[i] = 1;
    if (!inBrace) {
      // the opener is judged with quotes ignored as well (the safe direction); the END of a block only with quotes honoured
      const opens = d > 0 ? d : naiveBraceDelta(line);
      if (opens > 0) {
        if (flaggedAt(i)) { d = opens; braceUntil = depth; }
        else if (d > 0 && prev >= 0 && line.charCodeAt(n) === 0x7b && flaggedAt(prev)) braceUntil = depth;
      }
    }
    if (!blank) prev = d <= 0 ? i : -1;
    depth = Math.max(0, depth + d);   // a stray `}` never takes the depth below zero
    if (braceUntil >= 0 && depth <= braceUntil) braceUntil = -1;
    if (yamlIndent < 0 && opensYamlBlock(line) && flaggedAt(i)) yamlIndent = n;
  }
  return out;
}
/** The block rule alone, one flag per line of `all` (the UNFILTERED lines). Past `maxTests` a candidate opener is treated as flagged. */
export function blockWithheldLines(all: readonly string[], flagged: (line: string) => boolean, maxTests: number = LINE_TESTS_PER_SIDE): Uint8Array {
  return scanBlocks(all, lineTester(all, flagged, maxTests));
}

/** Which lines of one side may never be quoted. `withheld(i)` takes the index of a line in the UNFILTERED text. */
export interface LineWithholder { withheld(i: number): boolean }
/**
 * EVERY rule that withholds a line from quoting, for one side (`flagged` = the line carries the placeholder, or the redactor's
 * line test says credential-shaped). A line is withheld when:
 *   1. it is flagged itself;
 *   2. it sits in a block a flagged line opened (`scanBlocks`: brace, YAML, a same-indent YAML list — J1);
 *   3. the line before it (blank and comment lines skipped) is flagged and does not END its statement — a directive continued on
 *      the next line, `set $api_token` / `"<secret>";` (sec-ops J4);
 *   4. it sits in a YAML list item with a flagged line: any line of its innermost item, or any EARLIER line of an item that
 *      encloses it — `- key: X-API-Key` / `  value: <secret>` (sec-ops J2). A very long item spends the line tester's bound, past which every line reads flagged.
 * Rules 3 and 4 are asked lazily, of the few lines a quote is tried on; rule 2 is one pass. All share one bounded line tester.
 */
export function lineWithholder(all: readonly string[], flagged: (line: string) => boolean, maxTests: number = LINE_TESTS_PER_SIDE): LineWithholder {
  const flaggedAt = lineTester(all, flagged, maxTests);
  const blocks = scanBlocks(all, flaggedAt);
  const skipped = (line: string): boolean => { const n = indentOf(line); return n === line.length || line.charCodeAt(n) === 0x23; };
  const continuesFlagged = (i: number): boolean => {
    for (let p = i - 1; p >= 0; p--) {
      if (skipped(all[p])) continue;
      return !endsStatement(all[p]) && flaggedAt(p);
    }
    return false;
  };
  // The list items that enclose each line, by ONE pass over an indent stack (exact, linear): `top[i]` = the first line of the
  // OUTERMOST enclosing item, `inner[i]` = of the innermost (a `- ` line is its own innermost item); -1 = in no list item.
  const top = new Int32Array(all.length).fill(-1); const inner = new Int32Array(all.length).fill(-1);
  {
    const sIndent: number[] = []; const sDash: number[] = [];   // the stack: an indent, and the line index when it is a `- ` line (else -1)
    for (let i = 0; i < all.length; i++) {
      const n = indentOf(all[i]);
      if (n === all[i].length) continue;
      while (sIndent.length > 0 && sIndent[sIndent.length - 1] >= n) { sIndent.pop(); sDash.pop(); }
      const dash = isDashLine(all[i]);
      for (let k = 0; k < sDash.length; k++) if (sDash[k] >= 0) { if (top[i] < 0) top[i] = sDash[k]; inner[i] = sDash[k]; }
      if (dash) { if (top[i] < 0) top[i] = i; inner[i] = i; }
      sIndent.push(n); sDash.push(dash ? i : -1);
    }
  }
  const inFlaggedItem = (i: number): boolean => {
    if (top[i] < 0) return false;
    for (let j = top[i]; j < i; j++) if (all[j].length > 0 && flaggedAt(j)) return true;   // an earlier line of an item that encloses it
    const base = indentOf(all[inner[i]]);
    for (let j = i + 1; j < all.length; j++) {                            // the rest of its innermost item
      const n = indentOf(all[j]);
      if (n === all[j].length) continue;
      if (n <= base) break;
      if (flaggedAt(j)) return true;
    }
    return false;
  };
  return { withheld: (i) => flaggedAt(i) || blocks[i] === 1 || continuesFlagged(i) || inFlaggedItem(i) };
}

/** Split one canonical text, drop the ignored lines, and intern the rest. `orig[i]` is the 1-based line number in the UNFILTERED
 *  text of the i-th compared line (plan §13 C1). A final newline closes the last line, it opens none. */
function sideOf(text: string, intern: Map<string, number>, ops: OpBudget, seam: QuoteSeam): Side {
  const all = text.split('\n');
  if (all.length > 0 && all[all.length - 1] === '') all.pop();
  const ids: number[] = []; const orig: number[] = []; const raw: string[] = [];
  let ignored = 0; let redacted = 0;
  // only when a line can be quoted at all: with the seam closed nothing is, and the scan would buy nothing. The line test sees the
  // WHOLE line (a line is at most the side's byte cap; the test is linear in it) — never a prefix (sec-ops, LOW).
  let withhold: LineWithholder | null = null;
  if (seam.open) { spend(ops, all.length); withhold = lineWithholder(all, (l) => l.includes(PLACEHOLDER) || !seam.quotable(l)); }
  for (let i = 0; i < all.length; i++) {
    spend(ops, 1);
    const line = all[i];
    if (ignoredLine(line)) { ignored++; continue; }
    if (line.includes(PLACEHOLDER)) redacted++;
    let id = intern.get(line);
    if (id === undefined) { id = intern.size; intern.set(line, id); }
    ids.push(id); orig.push(i + 1); raw.push(line);
  }
  return { ids: Int32Array.from(ids), orig: Int32Array.from(orig), raw, ignored, redacted, withhold };
}

/** Does the text have more than `max` lines? Counted by index, stopping at the cap — never splits the text to find out. */
function overLineCap(text: string, max: number): boolean {
  let n = 0; let at = -1;
  while ((at = text.indexOf('\n', at + 1)) >= 0) { if (++n > max) return true; }
  return n + (text.length > 0 && !text.endsWith('\n') ? 1 : 0) > max;
}

/**
 * Myers' shortest-edit search in linear space. Marks `ma[i] = 1` / `mb[j] = 1` for every element on the common subsequence; an
 * unmarked element of `a` is only in `a`, of `b` only in `b`. Memory: the two mark arrays and two diagonal arrays of
 * 2·(n+m)+3 integers. Time: proportional to (n+m)·(edit distance), every step counted against `ops`.
 */
export function shortestEditMarks(a: Int32Array, b: Int32Array, ops: OpBudget): { ma: Uint8Array; mb: Uint8Array } {
  const ma = new Uint8Array(a.length); const mb = new Uint8Array(b.length);
  const size = a.length + b.length + 2;
  const vf = new Int32Array(2 * size + 3); const vb = new Int32Array(2 * size + 3);
  const off = size + 1;
  // An explicit stack: the two halves of a split are independent, and a recursion as deep as the edit distance must not be possible.
  const stack: number[] = [0, a.length, 0, b.length];
  while (stack.length > 0) {
    let bHi = stack.pop() as number; let bLo = stack.pop() as number; let aHi = stack.pop() as number; let aLo = stack.pop() as number;
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) { ma[aLo++] = 1; mb[bLo++] = 1; spend(ops, 1); }
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) { ma[--aHi] = 1; mb[--bHi] = 1; spend(ops, 1); }
    const N = aHi - aLo; const M = bHi - bLo;
    if (N === 0 || M === 0) continue;
    // The middle snake of the box (aLo..aHi) × (bLo..bHi).
    const delta = N - M; const odd = (delta & 1) !== 0; const max = (N + M + 1) >> 1;
    vf[off + 1] = 0; vb[off + 1] = 0;
    let sx = -1; let sy = -1; let su = -1; let sv = -1;
    search: for (let D = 0; D <= max; D++) {
      spend(ops, 2 * (D + 1));
      for (let k = -D; k <= D; k += 2) {
        let x = k === -D || (k !== D && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
        let y = x - k;
        const xs = x; const ys = y;
        while (x < N && y < M && a[aLo + x] === b[bLo + y]) { x++; y++; }
        if (x > xs) spend(ops, x - xs);
        vf[off + k] = x;
        const kr = delta - k;
        if (odd && kr >= -(D - 1) && kr <= D - 1 && x + vb[off + kr] >= N) { sx = xs; sy = ys; su = x; sv = y; break search; }
      }
      for (let k = -D; k <= D; k += 2) {
        let x = k === -D || (k !== D && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
        let y = x - k;
        const xs = x; const ys = y;
        while (x < N && y < M && a[aHi - 1 - x] === b[bHi - 1 - y]) { x++; y++; }
        if (x > xs) spend(ops, x - xs);
        vb[off + k] = x;
        const kf = delta - k;
        if (!odd && kf >= -D && kf <= D && x + vf[off + kf] >= N) { sx = N - x; sy = M - y; su = N - xs; sv = M - ys; break search; }
      }
    }
    if (sx < 0) throw new Error('shortest-edit search found no middle snake');   // unreachable: a path of length ≤ N+M always exists
    for (let i = 0; i < su - sx; i++) { ma[aLo + sx + i] = 1; mb[bLo + sy + i] = 1; }
    // After the trim both sides are non-empty and differ at both ends, so the edit distance is ≥ 2 and each half is strictly
    // smaller than the box. Guarded anyway: a defect here is a named error (⇒ `compare-error`), never a loop.
    if ((sx === N && sy === M) || (su === 0 && sv === 0)) throw new Error('shortest-edit search made no progress');
    stack.push(aLo, aLo + sx, bLo, bLo + sy);
    stack.push(aLo + su, aHi, bLo + sv, bHi);
  }
  return { ma, mb };
}

export interface CompareCounts { gitOnly: number; servedOnly: number; redactedGit: number; redactedServed: number; ignoredGit: number; ignoredServed: number;
  withheldCredential: number; withheldInstruction: number; notQuoted: number }
export interface LineCompare {
  counts: CompareCounts; gitOnlyLines: string[]; servedOnlyLines: string[];
  /** 1-based line numbers of the UNFILTERED Git text: each run of Git-only lines as `[from, to]`. */
  gitOnlyRanges: Array<[number, number]>;
  /** For each run of served-only lines, the UNFILTERED Git line it follows (0 = before the first line). */
  servedOnlyAfter: number[];
  rangesTruncated: boolean;
}

/** The quote seam as the comparator asks it. Production ALWAYS uses `SHIPPING_SEAM` (file-compare-quote-seam.ts); the parameter
 *  exists so the quoting path — the sanitiser, the two withheld counters, the caps — can be tested apart from the shipping list, and the switch's CLOSED state stays proven. */
export interface QuoteSeam { open: boolean; quotable: (line: string) => boolean }
const SHIPPING_SEAM: QuoteSeam = Object.freeze({ get open() { return quoteSeamOpen(); }, quotable: quotableLine });

/** The quote of one differing line, or which counter it lands in. The seam decides whether ANY line may be quoted. `index` is the
 *  line's index in the side's UNFILTERED text. */
function quoteOf(raw: string, index: number, counts: CompareCounts, seam: QuoteSeam, withhold: LineWithholder | null): string | null {
  if (!seam.open) { counts.notQuoted++; return null; }
  // The redactor's contract, in its order: (1) the text is REDACTED already; (2) a line R10 changed — it carries the placeholder —
  // and every line its context marks (a block, a list item, a continued directive) are withheld; (3) the line test, on the WHOLE
  // raw line (inside `withhold`) and on the quote that would be shown.
  if (withhold === null || withhold.withheld(index)) { counts.withheldCredential++; return null; }
  const clean = sanitizeQuotedLine(raw.length > FILE_LINE_SCAN_UNITS ? raw.slice(0, FILE_LINE_SCAN_UNITS) : raw);
  if (!seam.quotable(clean)) { counts.withheldCredential++; return null; }
  // A line R9 would rewrite is withheld and counted — on the ≤ 160-character quote, so R9's patterns never see a long line here.
  if (sanitizeChainedOutput(clean).text !== clean) { counts.withheldInstruction++; return null; }
  return clean;
}

/**
 * THE COMPARATOR: two canonical, redacted texts ⇒ counts, at most `quoteLeft` quoted lines (≤ FILE_LINES_QUOTED_CAP a side), and
 * the full ranges. Throws the sentinel `COMPARE_BUDGET_EXCEEDED` when the persist's operation budget runs out. Injectable (plan §13 A4's gate).
 */
export type Comparator = (git: string, served: string, ops: OpBudget, quoteLeft: number, rangesLeft: number, seam?: QuoteSeam) => LineCompare;
export const compareOrderedLines: Comparator = (git, served, ops, quoteLeft, rangesLeft, seam = SHIPPING_SEAM) => {
  const intern = new Map<string, number>();
  const g = sideOf(git, intern, ops, seam); const s = sideOf(served, intern, ops, seam);
  // A line that occurs on ONE side only can never be on the common subsequence: it is dropped before the search and stays
  // unmarked. The longest common subsequence is unchanged (so are the counts and the ranges), and two files with nothing in common
  // — the cheapest hostile input to write — cost one pass instead of (lines × lines) steps of the search.
  const inG = new Uint8Array(intern.size); const inS = new Uint8Array(intern.size);
  for (let i = 0; i < g.ids.length; i++) inG[g.ids[i]] = 1;
  for (let j = 0; j < s.ids.length; j++) inS[s.ids[j]] = 1;
  spend(ops, g.ids.length + s.ids.length);
  const gKeep: number[] = []; const sKeep: number[] = [];
  for (let i = 0; i < g.ids.length; i++) if (inS[g.ids[i]] === 1) gKeep.push(i);
  for (let j = 0; j < s.ids.length; j++) if (inG[s.ids[j]] === 1) sKeep.push(j);
  const reduced = shortestEditMarks(Int32Array.from(gKeep, (i) => g.ids[i]), Int32Array.from(sKeep, (j) => s.ids[j]), ops);
  const ma = new Uint8Array(g.ids.length); const mb = new Uint8Array(s.ids.length);
  for (let k = 0; k < gKeep.length; k++) ma[gKeep[k]] = reduced.ma[k];
  for (let k = 0; k < sKeep.length; k++) mb[sKeep[k]] = reduced.mb[k];
  const counts: CompareCounts = { gitOnly: 0, servedOnly: 0, redactedGit: g.redacted, redactedServed: s.redacted, ignoredGit: g.ignored, ignoredServed: s.ignored,
    withheldCredential: 0, withheldInstruction: 0, notQuoted: 0 };
  const seamOpen = seam.open;
  const gitOnlyLines: string[] = []; const servedOnlyLines: string[] = [];
  const gitOnlyRanges: Array<[number, number]> = []; const servedOnlyAfter: number[] = [];
  const rangeCap = Math.max(0, Math.min(COMPARE_RANGES_PER_FILE, rangesLeft));
  let rangesTruncated = false; let quoted = 0;
  const addRange = (push: () => void) => { if (gitOnlyRanges.length + servedOnlyAfter.length < rangeCap) push(); else rangesTruncated = true; };
  // A quote is ATTEMPTED on at most QUOTE_ATTEMPTS_PER_SIDE differing lines a side: a withheld line fills no list, so without this
  // bound a file of thousands of differing credential-shaped lines put every one to the redactor's line test (measured: 14.5 MiB
  // of garbage on the worst pair — over the 16 MiB pin). A line past the bound is counted in gitOnly / servedOnly and in no
  // withheld counter; the render's "+N differing line(s) not listed" covers it.
  let gTried = 0; let sTried = 0;
  const sideCap = (list: string[], tried: number) => list.length < FILE_LINES_QUOTED_CAP && quoted < quoteLeft && (!seamOpen || tried < QUOTE_ATTEMPTS_PER_SIDE);
  let i = 0; let j = 0; let inServedRun = false;
  while (i < g.ids.length || j < s.ids.length) {
    spend(ops, 1);
    if (i < g.ids.length && ma[i] === 0) {
      counts.gitOnly++;
      const last = gitOnlyRanges[gitOnlyRanges.length - 1];
      // a run continues while the compared Git lines are consecutive in the FILTERED sequence (the original numbers may skip a
      // comment or a blank line between them — the range covers it)
      if (i > 0 && ma[i - 1] === 0 && last && last[1] === g.orig[i - 1] && !inServedRun) last[1] = g.orig[i];
      else addRange(() => gitOnlyRanges.push([g.orig[i], g.orig[i]]));
      if (sideCap(gitOnlyLines, gTried)) { gTried++; const qd = quoteOf(g.raw[i], g.orig[i] - 1, counts, seam, g.withhold); if (qd !== null) { gitOnlyLines.push(qd); quoted++; } }
      else if (!seamOpen) counts.notQuoted++;
      inServedRun = false; i++;
    } else if (j < s.ids.length && mb[j] === 0) {
      counts.servedOnly++;
      if (!inServedRun) { const after = i > 0 ? g.orig[i - 1] : 0; addRange(() => servedOnlyAfter.push(after)); }
      if (sideCap(servedOnlyLines, sTried)) { sTried++; const qd = quoteOf(s.raw[j], s.orig[j] - 1, counts, seam, s.withhold); if (qd !== null) { servedOnlyLines.push(qd); quoted++; } }
      else if (!seamOpen) counts.notQuoted++;
      inServedRun = true; j++;
    } else { inServedRun = false; i++; j++; }
  }
  return { counts, gitOnlyLines, servedOnlyLines, gitOnlyRanges, servedOnlyAfter, rangesTruncated };
};

// ── The stored record ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const notChecked = (label: string, git: Obj, served: Obj | null, reason: FileNotCheckedReason, detail?: string): Obj => ({
  label, git, ...(served ? { served } : {}), state: 'not-checked', reason, ...(detail && FILE_COMPARE_DETAILS.has(detail) ? { detail } : {}),
});

/** The labels of a parsed declaration, in declaration order: each label's base line and its `live-read` line (the pair rule gives
 *  at most one of each), with the platform (target, path) the label names. A label that does not resolve names nothing here — a
 *  governing `parsed` declaration has none (it would govern as `unparseable`). */
function labelsOf(sources: ParsedSources): Array<{ label: string; base: ConfigSourceLine | null; live: Extract<ConfigSourceLine, { kind: 'live-read' }> | null; target: string | null; path: string | null }> {
  const out = new Map<string, { label: string; base: ConfigSourceLine | null; live: Extract<ConfigSourceLine, { kind: 'live-read' }> | null; target: string | null; path: string | null }>();
  for (const e of sources.entries) {
    let g = out.get(e.label);
    if (!g) { const r = resolveConfigLabel(e.label); g = { label: e.label, base: null, live: null, target: r.ok ? r.target : null, path: r.ok ? r.path : null }; out.set(e.label, g); }
    if (e.kind === 'live-read') g.live = e; else g.base = e;
  }
  return [...out.values()];
}

/** A record with every label not-checked for ONE reason (`no-capture-plan`, `compare-error`) — built from the declaration alone, by
 *  code simple enough that it cannot fail the way the comparison did. */
function recordForAll(sources: ParsedSources, harvesterExecutionId: string | null, reason: 'no-capture-plan' | 'compare-error'): Obj {
  const labels = labelsOf(sources).slice(0, FILE_COMPARE_FILES_CAP);
  return {
    version: FILE_COMPARE_RECORD_VERSION, method: FILE_COMPARE_METHOD, credentialLineVersion: CREDENTIAL_LINE_VERSION, harvesterExecutionId,
    capture: sources.entries.slice(0, FILE_COMPARE_FILES_CAP).map((e) => ({ label: e.label, kind: e.kind, outcome: reason })),
    returnedKeys: {},
    files: labels.filter((l) => l.base?.kind === 'git-file').map((l) => {
      const b = l.base as GitLine;
      return notChecked(l.label, { path: b.path, ref: b.ref }, l.live && l.target && l.path ? { target: l.target, path: l.path } : null, reason);
    }),
    budget: { opsUsed: 0, opsLimit: COMPARE_PERSIST_OP_BUDGET, filesOverBudget: 0, evidenceReached: 0, evidenceLimit: COMPARE_PERSIST_MAX_FILES, evidenceBytes: 0, evidenceBytesLimit: COMPARE_PERSIST_EVIDENCE_MAX_BYTES },
  };
}

export interface BuildFileSourceCompareInput {
  sources: ParsedSources;
  harvesterExecutionId: string | null;
  /** The capture plan (null: the switch is off, capture caught, or nothing was extracted — every label reads `no-capture-plan`). */
  plan: ComparePlanView | null;
  evidence: CaptureEvidence | null;
  /** The execution's RAW tool-call records (the full descriptor table already ran over them in capture). */
  toolCalls: readonly unknown[];
  /** R10 is switched off on this install: nothing is compared and nothing is quoted (`redaction-off`, per file). */
  redactionOff: boolean;
  /** Tests inject a comparator and limits; production passes neither. */
  compare?: Comparator;
  opsLimit?: number;
  /** Tests only: the CLOSED state of the quote seam (the switch in file-compare-quote-seam.ts), so it stays proven while the shipping seam is open. */
  seam?: QuoteSeam;
}

/**
 * THE RECORD (plan §5.2). One entry of `capture` per declared line — what capture did for it, never bytes; one entry of `files`
 * per label with a `git-file` base. NEVER THROWS.
 */
export function buildFileSourceCompare(input: BuildFileSourceCompareInput): Obj {
  try {
    return build(input);
  } catch {
    try { return recordForAll(input.sources, input.harvesterExecutionId, 'compare-error'); }
    catch { return { version: FILE_COMPARE_RECORD_VERSION, method: FILE_COMPARE_METHOD, credentialLineVersion: CREDENTIAL_LINE_VERSION, harvesterExecutionId: null, capture: [], returnedKeys: {}, files: [],
      budget: { opsUsed: 0, opsLimit: COMPARE_PERSIST_OP_BUDGET, filesOverBudget: 0, evidenceReached: 0, evidenceLimit: COMPARE_PERSIST_MAX_FILES, evidenceBytes: 0, evidenceBytesLimit: COMPARE_PERSIST_EVIDENCE_MAX_BYTES } }; }
  }
}

function build(input: BuildFileSourceCompareInput): Obj {
  const { sources, plan } = input;
  if (!plan) return recordForAll(sources, input.harvesterExecutionId, 'no-capture-plan');
  const compare = input.compare ?? compareOrderedLines;
  const ops: OpBudget = { used: 0, limit: input.opsLimit ?? COMPARE_PERSIST_OP_BUDGET };
  const calls = serviceCalls(input.toolCalls);
  const matches = serviceMatcher(input.toolCalls);
  const evidence = input.evidence?.items ?? [];
  const labels = labelsOf(sources).slice(0, FILE_COMPARE_FILES_CAP);

  const refusalAt = (target: string, path: string): string | null =>
    plan.refusals.find((r) => r.target === target && r.path === path && !DECLARED_SCOPE_REFUSALS.has(r.refusal))?.refusal ?? null;
  /** What a declared SERVICE did for a file that capture has no item for. */
  const serviceState = (service: string): { outcome: 'not-read' | 'read-failed' | 'not-returned' | 'result-not-readable'; detail?: string } => {
    const mine = calls.filter((c) => matches(service, c));
    if (mine.length === 0) return { outcome: 'not-read' };
    const ok = mine.filter((c) => c.ok);
    if (ok.length === 0) return { outcome: 'read-failed' };
    const idx = new Set(ok.map((c) => c.index));
    const unreadable = plan.refusals.find((r) => idx.has(r.toolCallIndex) && r.target === null && !DECLARED_SCOPE_REFUSALS.has(r.refusal));
    return unreadable ? { outcome: 'result-not-readable', detail: unreadable.refusal } : { outcome: 'not-returned' };
  };
  const gitHeld = (l: GitLine) => (configPinRefusesRef(l) ? undefined : plan.files.find((f) => isFileOfGitLine(f, l)));
  const gitTargetOf = (l: GitLine) => `${GIT_TARGET_PREFIX}${l.owner.toLowerCase()}:${l.repo.toLowerCase()}`;

  // capture[] — one entry per declared line. `returned: true` is written by the branches where capture HAS an item for the file
  // (held, kept as evidence, refused by name, read and not held): the reader derives `read` from it, never from an unknown outcome word.
  const capture: Obj[] = [];
  for (const e of sources.entries.slice(0, FILE_COMPARE_FILES_CAP)) {
    const lab = labels.find((l) => l.label === e.label);
    if (e.kind === 'git-file') {
      const held = gitHeld(e);
      const head = { label: e.label, kind: e.kind, target: held?.target ?? gitTargetOf(e), path: `/${e.path}`, service: shownService(e.service) };
      if (held) { capture.push({ ...head, outcome: 'held', returned: true, sha256: held.sha256, toolCallIndex: held.toolCallIndex }); continue; }
      const refused = plan.refusals.find((r) => r.path === `/${e.path}` && typeof r.target === 'string' && r.target.toLowerCase() === gitTargetOf(e) && !DECLARED_SCOPE_REFUSALS.has(r.refusal));
      if (refused) { capture.push({ ...head, outcome: refused.refusal, returned: true, toolCallIndex: refused.toolCallIndex }); continue; }
      const mine = calls.filter((c) => matches(e.service, c) && gitArgsMatch(e, c.args));
      const okCall = mine.find((c) => c.ok);
      capture.push({ ...head, outcome: okCall ? 'read-not-held' : mine.length ? 'read-failed' : 'not-read', ...(okCall ? { returned: true, toolCallIndex: okCall.index } : mine.length ? { toolCallIndex: mine[0].index } : {}) });
      continue;
    }
    if (e.kind === 'supplied') { capture.push({ label: e.label, kind: e.kind, outcome: 'supplied' }); continue; }
    const head = { label: e.label, kind: e.kind, ...(lab?.target && lab.path ? { target: lab.target, path: lab.path } : {}), service: shownService(e.service) };
    if (!lab?.target || !lab.path) { capture.push({ ...head, outcome: 'label-not-resolved' }); continue; }
    if (e.kind === 'service-held') {
      const held = plan.files.find((f) => f.target === lab.target && f.path === lab.path && matches(e.service, { service: f.serviceName, serviceId: f.serviceId }));
      if (held) { capture.push({ ...head, outcome: 'held', returned: true, sha256: held.sha256, toolCallIndex: held.toolCallIndex }); continue; }
      const refused = refusalAt(lab.target, lab.path);
      if (refused) { capture.push({ ...head, outcome: refused, returned: true }); continue; }
      const st = serviceState(e.service);
      capture.push({ ...head, outcome: st.outcome, ...(st.detail && FILE_COMPARE_DETAILS.has(st.detail) ? { detail: st.detail } : {}) });
      continue;
    }
    // live-read: the served file is EVIDENCE when its label has a Git base; beside a `service-held` base the grammar refuses it.
    const ev = evidence.find((x) => x.target === lab.target && x.path === lab.path && matches(e.service, { service: x.serviceName, serviceId: x.serviceId }));
    if (ev) {
      capture.push({ ...head, outcome: ev.state, returned: true, toolCallIndex: ev.toolCallIndex, ...(ev.state === 'evidence' && ev.sha256 ? { sha256: ev.sha256 } : {}),
        ...(ev.detail && FILE_COMPARE_DETAILS.has(ev.detail) ? { detail: ev.detail } : {}) });
      continue;
    }
    const st = serviceState(e.service);
    capture.push({ ...head, outcome: st.outcome, ...(st.detail && FILE_COMPARE_DETAILS.has(st.detail) ? { detail: st.detail } : {}) });
  }

  // returnedKeys — per platform target a declared label names, the keys the capture saw the service return (validated, capped).
  const returnedKeys: Record<string, string[]> = {};
  const targets = new Set(labels.map((l) => l.target).filter((t): t is string => !!t));
  const seen: Array<{ target: string | null; path: string | null }> = [...plan.files, ...plan.refusals, ...evidence];
  for (const t of targets) {
    const keys = new Set<string>();
    for (const x of seen) { if (x.target === t && typeof x.path === 'string') { const k = servedKeyOf(t, x.path); if (k !== null) keys.add(k); } }
    if (keys.size) returnedKeys[t] = [...keys].sort().slice(0, FILE_RETURNED_KEYS_CAP);
  }

  // files[] — one entry per label with a Git base.
  const files: Obj[] = [];
  let filesOverBudget = 0; let quoteLeft = FILE_FACT_QUOTED_CAP; let rangesLeft = COMPARE_RANGES_PER_RECORD; let budgetGone = false;
  for (const l of labels) {
    if (l.base?.kind !== 'git-file') continue;
    const base = l.base;
    const servedHead = l.live && l.target && l.path ? { target: l.target, path: l.path } : null;
    const gitHead = { path: base.path, ref: base.ref };
    if (!l.live || !servedHead) { files.push(notChecked(l.label, gitHead, null, 'no-live-read-line')); continue; }
    if (input.redactionOff) { files.push(notChecked(l.label, gitHead, servedHead, 'redaction-off')); continue; }
    const held = gitHeld(base);
    if (!held) { files.push(notChecked(l.label, gitHead, servedHead, 'git-file-not-held')); continue; }
    const git = { ...gitHead, target: held.target, sha256: held.sha256, toolCallIndex: held.toolCallIndex };
    const live = l.live;
    const ev = evidence.find((x) => x.target === l.target && x.path === l.path && matches(live.service, { service: x.serviceName, serviceId: x.serviceId }));
    if (!ev) {
      const st = serviceState(live.service);
      const reason: FileNotCheckedReason = st.outcome === 'not-read' ? 'live-read-not-read' : st.outcome === 'read-failed' ? 'live-read-failed'
        : st.outcome === 'result-not-readable' ? 'served-result-not-readable' : 'served-file-not-returned';
      files.push(notChecked(l.label, git, servedHead, reason, st.detail));
      continue;
    }
    const served = { ...servedHead, toolCallIndex: ev.toolCallIndex, service: shownService(live.service) };
    if (ev.state !== 'evidence' || typeof ev.B !== 'string' || !ev.sha256) {
      if (ev.state === 'comparison-budget') filesOverBudget++;
      files.push(notChecked(l.label, git, served, ev.state === 'evidence' ? 'compare-error' : ev.state, ev.detail));
      continue;
    }
    // The Git side's caps (the served side's byte cap was tested in capture, before and after `canonicalBase`).
    if (held.storedByteLength > COMPARE_SIDE_MAX_BYTES || overLineCap(held.content, COMPARE_SIDE_MAX_LINES) || overLineCap(ev.B, COMPARE_SIDE_MAX_LINES)) {
      files.push(notChecked(l.label, git, served, 'over-compare-cap')); continue;
    }
    if (budgetGone || ops.used >= ops.limit) { budgetGone = true; filesOverBudget++; files.push(notChecked(l.label, git, served, 'comparison-budget')); continue; }
    let cmp: LineCompare;
    try { cmp = compare(held.content, ev.B, ops, quoteLeft, rangesLeft, input.seam ?? SHIPPING_SEAM); }
    catch (err) {
      if (!isCompareBudgetExceeded(err)) throw err;      // any other throw ⇒ `compare-error` on every label (the outer catch)
      budgetGone = true; filesOverBudget++; files.push(notChecked(l.label, git, served, 'comparison-budget')); continue;
    }
    quoteLeft -= cmp.gitOnlyLines.length + cmp.servedOnlyLines.length;
    rangesLeft -= cmp.gitOnlyRanges.length + cmp.servedOnlyAfter.length;
    files.push({
      label: l.label, git, served: { ...served, sha256: ev.sha256 },
      state: fileCompareStateOf(cmp.counts, held.sha256 === ev.sha256),
      counts: cmp.counts, gitOnlyLines: cmp.gitOnlyLines, servedOnlyLines: cmp.servedOnlyLines,
      gitOnlyRanges: cmp.gitOnlyRanges, servedOnlyAfter: cmp.servedOnlyAfter, ...(cmp.rangesTruncated ? { rangesTruncated: true } : {}),
    });
  }
  return {
    version: FILE_COMPARE_RECORD_VERSION, method: FILE_COMPARE_METHOD, credentialLineVersion: CREDENTIAL_LINE_VERSION, harvesterExecutionId: input.harvesterExecutionId,
    capture, returnedKeys, files,
    budget: { opsUsed: Math.min(ops.used, ops.limit), opsLimit: ops.limit, filesOverBudget, evidenceReached: input.evidence?.reached ?? 0, evidenceLimit: COMPARE_PERSIST_MAX_FILES,
      evidenceBytes: input.evidence?.bytes ?? 0, evidenceBytesLimit: COMPARE_PERSIST_EVIDENCE_MAX_BYTES },
    ...((input.seam ?? SHIPPING_SEAM).open ? {} : { quotesWithheld: QUOTES_WITHHELD_NO_LIST }),
  };
}

// ── What was WRITTEN (plan §13 A3) ──────────────────────────────────────────────────────────────────────────────────────────────

const notHeldFile = (f: Obj): Obj => {
  const git = f.git as Obj; const served = f.served as Obj | undefined;
  return { label: f.label, git: { path: git.path, ref: git.ref }, ...(served ? { served: { target: served.target, path: served.path } } : {}), state: 'not-checked', reason: 'git-file-not-held' };
};

/**
 * FINALISE after the capture write (the I/O half, `captureHeldFiles`): a declared line whose `held` file has no ref in the batch
 * the terminal transaction will be handed reads the batch's refusal name for it (`store-error`), else `not-written`, and its file
 * entry reads `git-file-not-held` — the record never claims a held base the store did not take. `batch` null ⇒ unchanged (there
 * was no plan). PURE; returns the same object when nothing moves.
 */
export function finaliseFileSourceCompare(record: Obj, batch: { refs: ReadonlyArray<{ target?: unknown; path?: unknown; blobSha256?: unknown }>; refusals: ReadonlyArray<{ target?: unknown; path?: unknown; refusal?: unknown }> } | null): Obj {
  if (!batch || !Array.isArray(record.capture)) return record;
  const written = (c: Obj) => batch.refs.some((r) => r.target === c.target && r.path === c.path && r.blobSha256 === c.sha256);
  const lost = new Set<string>(); let moved = false;
  const capture = (record.capture as Obj[]).map((c) => {
    if (c.outcome !== 'held' || written(c)) return c;
    moved = true; lost.add(String(c.label));
    const why = batch.refusals.find((r) => r.target === c.target && r.path === c.path);
    const { sha256: _s, ...rest } = c; void _s;
    return { ...rest, outcome: typeof why?.refusal === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(why.refusal) ? why.refusal : 'not-written' };
  });
  if (!moved) return record;
  const gitLost = new Set((record.capture as Obj[]).filter((c) => c.kind === 'git-file' && lost.has(String(c.label))).map((c) => String(c.label)));
  return { ...record, capture, files: (record.files as Obj[]).map((f) => (gitLost.has(String(f.label)) && f.reason !== 'no-live-read-line' ? notHeldFile(f) : f)) };
}

/** THE ROLLED-BACK OVERLAY (plan §13 A3): the ref rows sit in a savepoint inside the terminal transaction; when it rolls back
 *  nothing this record called `held` is held. `refWrite: 'rolled-back'`, every `held` outcome `not-written`, every compared or
 *  comparable file entry `git-file-not-held` — no held base, no Git sha. */
export function rolledBackFileSourceCompare(record: Obj): Obj {
  if (!Array.isArray(record.capture) || !Array.isArray(record.files)) return record;
  return {
    ...record, refWrite: 'rolled-back',
    capture: (record.capture as Obj[]).map((c) => { if (c.outcome !== 'held') return c; const { sha256: _s, ...rest } = c; void _s; return { ...rest, outcome: 'not-written' }; }),
    files: (record.files as Obj[]).map((f) => (f.reason === 'no-live-read-line' ? f : notHeldFile(f))),
  };
}

// ── The OVERLAP fact (plan §3.4, §13.C; owner decision 2b — a fact, no force) ───────────────────────────────────────────────────

/** One held file the Author's edit step resolved: its capture identity, the sha of the BASE the step used, and — when the edit was
 *  applied — the 1-based line ranges of the base its hunks replace (the view is line-for-line with the base). Built in the core's
 *  pre-transaction held-edit step, where the applier's hunks are in memory; carried to the net as a plain field of `held`. */
export interface EditHunkFile { target: string; path: string; baseSha256: string | null; op: 'edit' | 'create'; applied: boolean; hunks: Array<[number, number]> }

/** Does a hunk's base range touch a differing range? A Git-only range: they intersect. A served-only run after Git line `g`: the
 *  hunk contains `g` or the line after it — it contains or abuts the insertion point (plan §13 C4). */
function hunkTouches(h: [number, number], gitOnlyRanges: ReadonlyArray<[number, number]>, servedOnlyAfter: readonly number[]): boolean {
  return gitOnlyRanges.some((r) => h[0] <= r[1] && h[1] >= r[0]) || servedOnlyAfter.some((g) => h[0] <= g + 1 && h[1] >= g);
}

/**
 * `editOverlap` for ONE record file entry — states and counts, never a range and never text (§13 C3). Runs on the FULL ranges of
 * the record, never on the quoted lines. `no-overlap` states the geometry and the denominator; it is not reassurance (§13 C4).
 */
export function computeEditOverlap(edit: EditHunkFile | null, file: Obj): Obj {
  const counts = file.counts as CompareCounts | undefined;
  const redacted = counts ? counts.redactedGit + counts.redactedServed : 0;
  const tail = redacted > 0 ? { redactedLinesNotChecked: redacted } : {};
  const no = (reason: string): Obj => ({ state: 'not-checked', reason, ...tail });
  if (file.state === 'not-checked' || !Array.isArray(file.gitOnlyRanges) || !Array.isArray(file.servedOnlyAfter)) return no('file-not-compared');
  if (!edit) return no('no-applied-edit');
  if (edit.op === 'create' || edit.baseSha256 === null) return no('no-base');
  if (!edit.applied || edit.hunks.length === 0) return no('no-applied-edit');
  if (edit.baseSha256 !== (file.git as Obj).sha256) return no('base-differs');
  if (file.rangesTruncated === true) return no('ranges-truncated');
  const ranges = file.gitOnlyRanges as Array<[number, number]>; const after = file.servedOnlyAfter as number[];
  const hunks = edit.hunks.filter((h) => hunkTouches(h, ranges, after)).length;
  const rangesTotal = ranges.length + after.length;
  return hunks > 0 ? { state: 'touches-differing-lines', hunks, hunksTotal: edit.hunks.length, ranges: rangesTotal, ...tail }
    : { state: 'no-overlap', hunksTotal: edit.hunks.length, ranges: rangesTotal, ...tail };
}

/** The base-sha fact for ONE record file entry (owner decision 1 — a fact, rendered, no force). */
export function baseMatchOf(edit: EditHunkFile | null, file: Obj): 'same' | 'differs' | 'no-base' {
  const sha = (file.git as Obj | undefined)?.sha256;
  if (!edit || edit.baseSha256 === null || typeof sha !== 'string') return 'no-base';
  return edit.baseSha256 === sha ? 'same' : 'differs';
}

/** The Author's edit of the file a record entry names, or null. Matched on the capture identity (target, path) of the Git file. */
export function editFor(edits: readonly EditHunkFile[], file: Obj): EditHunkFile | null {
  const git = file.git as Obj | undefined;
  if (!git || typeof git.path !== 'string') return null;
  const target = typeof git.target === 'string' ? git.target.toLowerCase() : null;
  return edits.find((e) => e.path === `/${git.path}` && (target === null ? e.target.startsWith(GIT_TARGET_PREFIX) : e.target.toLowerCase() === target)) ?? null;
}

/**
 * THE AUTHOR'S ADDITIONS to its transcription of the Harvester's `gitLiveDrift` (plan §13 C4): per file, `baseMatch` and
 * `editOverlap`, under their own keys and nowhere else — with those two keys (and the transcription's own `point` and
 * `harvesterExecutionId`) removed, the result equals the Harvester's stamp byte for byte.
 *   `edits` null ⇒ the platform has no record of the applied edit (`no-edit-record`): the overlap is not checked, by name.
 *   `stored` ⇒ a REPLAY: nothing stored can rebuild the hunk positions, so the stored overlap is handed back and re-validated by
 *   the fact's own reader (plan §13 C2).
 */
export function withAuthorEditFacts(harvesterDrift: Obj, record: unknown, edits: readonly EditHunkFile[] | null,
  stored?: ReadonlyMap<string, { baseMatch?: unknown; editOverlap?: unknown }> | null): Obj {
  if (harvesterDrift.checked !== true || !Array.isArray(harvesterDrift.files)) return harvesterDrift;
  const rec = validFileCompareRecord(record, quotableLine);
  const byLabel = new Map<string, Obj>((rec ? (rec.files as Obj[]) : []).map((f) => [String(f.label), f]));
  return {
    ...harvesterDrift,
    files: (harvesterDrift.files as Obj[]).map((f) => {
      if (stored) { const s = stored.get(String(f.label)); return s ? { ...f, ...(s.baseMatch !== undefined ? { baseMatch: s.baseMatch } : {}), ...(s.editOverlap !== undefined ? { editOverlap: s.editOverlap } : {}) } : f; }
      const full = byLabel.get(String(f.label));
      if (!full) return { ...f, baseMatch: 'no-base', editOverlap: { state: 'not-checked', reason: 'file-not-compared' } };
      if (edits === null) return { ...f, baseMatch: 'no-base', editOverlap: { state: 'not-checked', reason: 'no-edit-record' } };
      const edit = editFor(edits, full);
      return { ...f, baseMatch: baseMatchOf(edit, full), editOverlap: computeEditOverlap(edit, full) };
    }),
  };
}

/** The package overlay (plan §13 C2): on a rolled-back package no edit was written, so every overlap reads `package-rolled-back`. */
export function rolledBackEditOverlap(authorDrift: Obj): Obj {
  if (!Array.isArray(authorDrift.files)) return authorDrift;
  return { ...authorDrift, files: (authorDrift.files as Obj[]).map((f) => (f && typeof f === 'object' && 'editOverlap' in f
    ? { ...f, editOverlap: { state: 'not-checked', reason: 'package-rolled-back' } } : f)) };
}
