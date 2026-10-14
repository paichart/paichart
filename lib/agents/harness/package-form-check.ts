/**
 * Package form check — the mechanical-trigger reflection pass's DETECTOR and FACT (Step A, 2026-10-07).
 *
 * Plan: cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/PLAN.md (§1 corpus, §2 scope, §7 fact).
 * Build + review fold: …/BUILD-REPORT-A.md (agent-execution F1–F11, architectural-review H1–L9).
 *
 * PURE: text in, fact out. No prisma, no logger, no LLM. It counts lines in a `config_change_author`
 * package's fenced blocks and reports what a reader cannot see by looking:
 *
 *   1. `hunk-count-mismatch` — a NUMBERED unified-diff hunk header (`@@ -a,b +c,d @@`) whose counts do not
 *      equal its body's lines BY LINE TYPE (' ' or empty = both sides, '-' = old, '+' = new, '\' ignored).
 *      A hunk ends at the next `@@`, a `diff --git`, a `---`/`+++` pair, or the fence end. A body LONGER than its
 *      header (`extraBodyLines`) is the silent-truncation class: `git apply` exits 0 and writes only the declared
 *      count — and silently ignores ANY trailing line, including an intended `-` removal
 *      (TF-HUNK-UNDERCOUNT-SILENT-TRUNCATION). A body SHORTER than its header fails `git apply` loudly.
 *   2. marker lines — a line that IS (after an optional diff prefix and comment leader) a bare `...`/`…`, or a
 *      `(full block …)` / `(as … above)` / `(see above)` parenthetical (optionally behind a bare ellipsis), or
 *      `<snip>`. ANCHORED to the whole line (review M1): an annotation on a line that is present —
 *      `acl = "private"  # unchanged (see above)` — is not a marker. Named for what was OBSERVED (review L5): a
 *      marker matched the lexicon; whether it is an elision is not asserted.
 *      `marker-line-located` when the lines just above and below it appear in ANOTHER fenced block with ≥1
 *      non-blank, non-marker line between them; otherwise `marker-line-unlocated`, a FACT ONLY.
 *   3. `hunk-side-overflow` — one side of a hunk holds more lines than its header declares while the totals still
 *      close (review L1: header `-1,3 +1,3` over four `-` and three `+`). FACT ONLY: `git apply` rejects this shape
 *      loudly ("corrupt patch"), so it is not the silent class and never triggers.
 *
 * The TRIGGER is `hunk-count-mismatch` OR `marker-line-located`. Unnumbered `@@` headers are COUNTED only
 * (`unnumberedHunkHeaders`). Step B (2026-10-07) ACTS on a trigger only when EVERY hit is an undercount
 * (`allHitsAreUndercounts`, review B-M1); any marker, short hunk or mixed package is stamped and left alone
 * (`notAttemptedReason: 'hits-include-non-undercount'`).
 *
 * DENOMINATORS: fences are CommonMark — ``` or ~~~, three or more, a closer of the same character at least as long
 * as its opener and with no info string. A fence form outside that grammar is not counted. On an unchecked arm
 * (`checked: false`) every count is `null`: nobody counted, so no zero is asserted (review L3).
 *
 * Protocol 10: every field is a count, a location or a transcription; no `ok` / `valid` / `pass`. `correction`
 * records what the platform did (`attempted`, `adopted`, the guard's reason), never a judgement of the package.
 *
 * WHO CAN SEE IT (review M2, decided 2026-10-07: document, do not hide). The fact is never PUSHED to a Reviewer: it is
 * not rendered in §6, not on the lean card, and the context chainer does not copy `toolLoop`. It IS readable by PULL:
 * `pickResultJsonSummary` copies `toolLoop` verbatim, so `agent.results` hands it to any reasoner that calls it (the
 * harness SYNTHESIZE, Node C, a reviewer reaching around to its sibling Author). A `flag-off` reason there is a
 * platform-internal state — it does not mean the platform chose not to fix the package.
 *
 * The marker set is the plan's v1 set, corpus-measured 2026-10-07 over 312 Author executions; the label regex
 * (`# … unchanged/omitted/not shown`) was measured and REJECTED. Do not widen the set without re-running
 * `scripts/replay-form-check.ts` and reading every new hit (the dialect-lint R12 lesson).
 *
 * Gate: scripts/test-package-form-check.ts (fixtures, the negative controls, code-mutation proofs, perf pins).
 * Replay: scripts/replay-form-check.ts (asserts 15/9/5/1 — the plan's 16 was corrected, see the replay header).
 */

import { redactArtifactSecrets } from './redact-artifact-secrets';

export const FORM_CHECK_VERSION = 1;

/** The ONE eligible role, by EXACT match. Never `/author/i` — that also matches `requirements_author`. */
export const FORM_CHECK_ELIGIBLE_ROLE = 'config_change_author';

/** Hits persisted on the fact (the full count rides in `hitsTotal`). `toolLoop` sits in the head slice. */
export const FORM_CHECK_MAX_HITS = 8;
/** Copy-source locations persisted per hit (the full count rides in `locatedInTotal`; review F2). */
export const FORM_CHECK_MAX_LOCATIONS = 3;
const MAX_HEADING_CHARS = 80;
const MAX_TEXT_CHARS = 120;

/** R10 placeholders (`<<REDACTED-SECRET>>` and any `<<REDACTED…>>` sibling). A line carrying one is never a marker. */
export const R10_PLACEHOLDER_RE = /<<REDACTED[^<>\n]{0,40}>>/g;

// ── Code-mutation switch (TEST ONLY; review F11/L9) ─────────────────────────────────────────────────────────
// Not exported as state: an importer cannot flip a rule process-wide. `withFormCheckMutation` enables ONE mutation for
// the duration of a SYNCHRONOUS callback and always restores it. The detector is synchronous, so nothing else can
// observe the window. Used only by scripts/test-package-form-check.ts to prove each rule's code branch is load-bearing.
export type FormCheckMutation =
  | 'gap-any-line' | 'phrase-unanchored' | 'label-lexicon' | 'substring-ellipsis' | 'empty-line-foreign'
  | 'backslash-counted' | 'no-file-boundary' | 'no-r10-exclusion' | 'no-yaml-doc-end' | 'no-crlf-strip'
  | 'no-fence-length-match';
const ACTIVE_MUTATIONS = new Set<FormCheckMutation>();
export function withFormCheckMutation<T>(m: FormCheckMutation, fn: () => T): T {
  ACTIVE_MUTATIONS.add(m);
  try { return fn(); } finally { ACTIVE_MUTATIONS.delete(m); }
}
const mut = (m: FormCheckMutation) => ACTIVE_MUTATIONS.size > 0 && ACTIVE_MUTATIONS.has(m);

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const UNNUMBERED_HUNK_RE = /^@@(?! -\d)/;
/** Applied to a trimEnd()-ed line (review F1: `\s+(.*\S)\s*$` backtracks quadratically on `#` + spaces). */
const HEADING_RE = /^#{1,6}\s+(\S.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;

/**
 * The v1 marker set, anchored to the whole line. LINEAR by construction (review F1): the comment leader carries its own
 * trailing whitespace, so only ONE whitespace quantifier precedes the ellipsis when the leader is absent. Do not put
 * `\s*` before `[+-]?` — two whitespace quantifiers with only an optional character between them reintroduce the blow-up.
 */
const LEAD = String.raw`^[\s+-]?\s*(?:(?:#|\/\/|!|--|;)\s*)?`;
export const ELISION_MARKER_RES: readonly RegExp[] = Object.freeze([
  new RegExp(`${LEAD}(?:\\.\\.\\.|…)\\s*$`),
  new RegExp(`${LEAD}(?:(?:\\.\\.\\.|…)\\s*)?\\(\\s*(?:full block|as (?:added |shown |written |quoted )?above|see above)[^)\\n]*\\)\\s*$`, 'i'),
  new RegExp(`${LEAD}<\\s*snip\\s*>\\s*$`, 'i'),
]);
// The rejected/old forms, reachable only through a mutation.
const MUTANT_RES: Partial<Record<FormCheckMutation, RegExp>> = {
  'phrase-unanchored': /\(\s*(?:full block|as (?:added |shown |written |quoted )?above|see above)/i,
  'label-lexicon': /(?:#|\/\/|!|\(|^\s*[+-]?\s*\.\.\.).*\b(?:omitted|elided|not shown|unchanged)\b/i,
  'substring-ellipsis': /\.\.\./,
};

export type FormCheckHitKind = 'hunk-count-mismatch' | 'marker-line-located' | 'marker-line-unlocated' | 'hunk-side-overflow';
export const FORM_CHECK_TRIGGER_KINDS: readonly FormCheckHitKind[] = Object.freeze(['hunk-count-mismatch', 'marker-line-located'] as FormCheckHitKind[]);

/** `heading` is carried in the ANALYSIS (the prompt names it) and dropped on the persisted fact (size; review F2). */
export interface FormCheckLocation { block: number; heading?: string; lines: [number, number] }

export interface FormCheckHit {
  kind: FormCheckHitKind;
  /** 1-based index of the fenced block, in package order. */
  block: number;
  /** Nearest markdown heading above the block (outside fences), ≤80 chars; '' when none. */
  heading: string;
  /** 1-based line number in the whole package. */
  line: number;
  header?: string;
  declared?: { old: number; new: number };
  observed?: { old: number; new: number };
  /** Non-blank lines after the declared counts were satisfied (or foreign lines inside the hunk). */
  extraBodyLines?: number;
  /** The marker line, trimmed, ≤120 chars, R10-redacted BEFORE it enters the fact. */
  marker?: string;
  /** Where the lines this hit stands for already sit in the package (capped at 3 on the fact). */
  locatedIn?: FormCheckLocation[];
  locatedInTotal?: number;
}

/** An analysis hit carries the internals the adoption guard needs. Never persisted (the fact builder strips them). */
export interface AnalysisHit extends FormCheckHit {
  /** Hunk hits: body indices [header, end). */
  hunkRange?: [number, number];
  /** Marker hits: body index of the marker line. */
  markerIndex?: number;
  /** The candidate lines this hit stands for, one array per located source, in SOURCE form. */
  fills?: string[][];
}

export interface FencedBlock {
  /** 1-based. */
  index: number;
  /** Info string after the opening fence, trimmed, lower-cased. */
  lang: string;
  heading: string;
  /** 1-based package line numbers of the opening and closing fence (closing = last line when unclosed). */
  openLine: number;
  closeLine: number;
  /** Opener, body and closer, joined — the unit the adoption guard compares byte-for-byte. */
  raw: string;
  body: string[];
}

export interface PackageFormAnalysis {
  /** The package split into lines, with one trailing `\r` per line stripped (CRLF, review L2). */
  lines: string[];
  blocks: FencedBlock[];
  numberedHunks: number;
  unnumberedHunkHeaders: number;
  /** ALL hits, trigger kinds first, then by line. Uncapped — the correction prompt reads this, never the fact. */
  hits: AnalysisHit[];
}

export type FormCheckTextSource = 'loop' | 'diagnostic-retry' | 'form-correction';
export type FormCheckReason = 'checked' | 'not-end-turn' | 'empty-deliverable' | 'checker-error';
export type FormCorrectionNotAttemptedReason =
  | 'not-checked' | 'no-trigger-hit' | 'prior-pass-used:anti-fabrication' | 'budget-flagged' | 'flag-off'
  /** Step B scope (Steve 2026-10-07; narrowed by review B-M1): a correction runs only when EVERY hit — fact-only kinds
   *  included — is a header undercount. */
  | 'hits-include-non-undercount';
export type FormCorrectionNotAdoptedReason =
  | 'empty' | 'llm-error' | 'not-end-turn' | 'trigger-hits-remain' | 'new-hit' | 'block-changed'
  | 'placeholder-changed' | 'prose-changed' | 'confidence-missing' | 'confidence-changed' | 'header-start-changed'
  | 'content-not-from-named-source'
  | 'new-address-token';

export interface FormCorrectionFact {
  attempted: boolean;
  notAttemptedReason?: FormCorrectionNotAttemptedReason;
  adopted?: boolean;
  notAdoptedReason?: FormCorrectionNotAdoptedReason;
  /** ALL hits on the corrected text (fact-only kinds included, e.g. an untouched unlocated marker). */
  postHitsTotal?: number;
  /** TRIGGER hits on the corrected text — 0 on every adopted correction by construction (kill criterion 3). */
  postTriggerHitsTotal?: number;
  /** Step B: trigger hits at the decision point (the text the correction was asked to repair). */
  decisionTriggerHitsTotal?: number;
  /** Step B: the capped hits at the decision point. When adopted, the top-level `hits` describe the CORRECTED
   *  (persisted) text, so these are the only record of what was repaired (review L4). */
  decisionHits?: FormCheckHit[];
  /** Step B (review B-L5): ALL hits at the decision point, uncapped — the denominator beside the capped list. */
  decisionHitsTotal?: number;
  /** Step B (review B-M5): on adoption, every line the correction changed, `{line, before, after}` (1-based line in the
   *  package; values R10-redacted, ≤120 chars). Under the Step B scope the guard bounds this to hunk-header lines, so the
   *  original package is exactly reconstructible from the persisted text. Capped at 8, with `editsTotal`. */
  edits?: Array<{ line: number; before: string; after: string }>;
  editsTotal?: number;
  /** Set (instead of `edits`) when the correction changed the line count — never on the Step B live path. */
  editsUnaligned?: boolean;
  /** Cache tokens of the correction turn (review B-L3), when the provider reported them. */
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export interface FormCheckFact {
  version: number;
  checked: boolean;
  reason: FormCheckReason;
  /** Which text was counted: the loop's deliverable, #90's reflection when #90 replaced it, or the adopted form
   *  correction (Step B — the re-check of the persisted text; `correction` then describes the decision point). */
  textSource: FormCheckTextSource;
  /** `null` on an unchecked arm — nothing was counted. */
  fencedBlocks: number | null;
  numberedHunks: number | null;
  unnumberedHunkHeaders: number | null;
  hitsTotal: number | null;
  triggerHitsTotal: number | null;
  hits: FormCheckHit[];
  correction: FormCorrectionFact;
}

/** Eligibility, by exact role and non-PIPELINE task. Absent fact on every other role is the contract (§7a). */
export function isFormCheckEligible(agentRole: string | null | undefined, taskType: string | null | undefined): boolean {
  return taskType !== 'PIPELINE' && agentRole === FORM_CHECK_ELIGIBLE_ROLE;
}

function cap(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function splitPackageLines(text: string): string[] {
  const lines = (text || '').split('\n');
  return mut('no-crlf-strip') ? lines : lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

/** Fenced blocks, CommonMark: opener ``` / ~~~ (≥3); closer = same char, ≥ opener length, no info string. */
export function parseFencedBlocks(text: string): FencedBlock[] {
  return fencedBlocksOf(splitPackageLines(text));
}

function fencedBlocksOf(lines: string[]): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let heading = '';
  let i = 0;
  while (i < lines.length) {
    const open = FENCE_RE.exec(lines[i]);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      const fence = open[1];
      const lang = open[2].trim().toLowerCase();
      const start = i;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const c = FENCE_RE.exec(lines[i]);
        const closes = c && c[1][0] === fence[0] && c[2].trim() === '' &&
          (mut('no-fence-length-match') || c[1].length >= fence.length);
        if (closes) break;
        body.push(lines[i]);
        i++;
      }
      const end = Math.min(i, lines.length - 1);
      blocks.push({
        index: blocks.length + 1, lang, heading, openLine: start + 1, closeLine: end + 1,
        raw: lines.slice(start, end + 1).join('\n'), body,
      });
      i++;
      continue;
    }
    const h = HEADING_RE.exec(lines[i].trimEnd());
    if (h) heading = cap(h[1], MAX_HEADING_CHARS);
    i++;
  }
  return blocks;
}

export interface ParsedHunk {
  /** Index into body of the header line. */
  at: number;
  /** Body index range end (exclusive). */
  end: number;
  header: string;
  declared: { old: number; new: number };
  observed: { old: number; new: number };
  extra: number;
  mismatch: boolean;
  /** One side holds more lines than declared while the totals closed (review L1). Fact only. */
  sideOverflow: boolean;
}

/** Unified-diff hunks in one block body, with line-type arithmetic (plan §2). */
export function parseHunks(body: string[]): ParsedHunk[] {
  const out: ParsedHunk[] = [];
  let i = 0;
  while (i < body.length) {
    const m = HUNK_RE.exec(body[i]);
    if (!m) { i++; continue; }
    const declOld = m[2] !== undefined ? Number(m[2]) : 1;
    const declNew = m[4] !== undefined ? Number(m[4]) : 1;
    let o = 0; let n = 0; let extra = 0;
    let j = i + 1;
    while (j < body.length) {
      const l = body[j];
      if (HUNK_RE.test(l) || l.startsWith('diff --git') ||
          (!mut('no-file-boundary') && l.startsWith('--- ') && j + 1 < body.length && body[j + 1].startsWith('+++ '))) break;
      const satisfied = o >= declOld && n >= declNew;
      if (l.startsWith('\\') && !(mut('backslash-counted') && satisfied)) {
        // "\ No newline at end of file" — not a line of either side, wherever it falls.
      } else if (satisfied) {
        if (l.trim()) extra++;
      } else if (l.startsWith('+')) {
        n++;
      } else if (l.startsWith('-')) {
        o++;
      } else if (l.startsWith(' ') || (l === '' && !mut('empty-line-foreign'))) {
        o++; n++;
      } else {
        extra++; // a foreign line inside an unsatisfied hunk
      }
      j++;
    }
    const short = o < declOld || n < declNew;
    const mismatch = short || extra > 0;
    out.push({
      at: i, end: j, header: body[i], declared: { old: declOld, new: declNew }, observed: { old: o, new: n },
      extra, mismatch, sideOverflow: !mismatch && (o > declOld || n > declNew),
    });
    i = j;
  }
  return out;
}

export function isElisionMarker(line: string): boolean {
  if (!mut('no-r10-exclusion') && /<<REDACTED[^<>\n]{0,40}>>/.test(line)) return false; // R10: never a marker
  if (ELISION_MARKER_RES.some((re) => re.test(line))) return true;
  if (ACTIVE_MUTATIONS.size) for (const [k, re] of Object.entries(MUTANT_RES)) if (mut(k as FormCheckMutation) && re!.test(line)) return true;
  return false;
}

function normLine(l: string): string {
  return l.replace(/^[+\- ]/, '').trim();
}

function nontrivial(s: string): boolean {
  return s.length >= 8 && /[A-Za-z0-9]/.test(s) && !isElisionMarker(s);
}

/** YAML document-end `...` (last non-blank line, or followed by `---`) is a document marker, not a marker line. */
function isYamlDocumentEnd(block: FencedBlock, i: number): boolean {
  if (mut('no-yaml-doc-end')) return false;
  if (block.lang !== 'yaml' && block.lang !== 'yml') return false;
  if (block.body[i].trim() !== '...') return false;
  for (let k = i + 1; k < block.body.length; k++) {
    const t = block.body[k].trim();
    if (!t) continue;
    return t === '---';
  }
  return true;
}

interface Located { loc: FormCheckLocation; fill: string[] }

/**
 * Find the span a marker stands for in ANOTHER fenced block: the nearest non-trivial line above the marker and the
 * nearest one below must both appear there, in order, with ≥1 non-blank, non-marker line between them (the gap rule —
 * two blocks that elide the SAME span must not locate each other). No line above ⇒ unlocatable.
 * `normBodies` is precomputed once per analysis (review F3).
 */
function locateMarker(blocks: FencedBlock[], normBodies: string[][], blockIdx: number, lineIdx: number): Located[] {
  const body = normBodies[blockIdx];
  let above: string | null = null;
  for (let k = lineIdx - 1; k >= 0; k--) if (nontrivial(body[k])) { above = body[k]; break; }
  let below: string | null = null;
  for (let k = lineIdx + 1; k < body.length; k++) if (nontrivial(body[k])) { below = body[k]; break; }
  if (!above) return [];
  const isContent = (raw: string) => raw.trim() !== '' && !isElisionMarker(raw);
  const out: Located[] = [];
  blocks.forEach((b, j) => {
    if (j === blockIdx) return;
    const s2 = normBodies[j];
    for (let a = 0; a < s2.length; a++) {
      if (s2[a] !== above) continue;
      if (below === null) {
        if (b.body.slice(a + 1).filter(isContent).length >= 2) {
          out.push({ loc: { block: b.index, heading: b.heading, lines: [b.openLine + 1 + a, b.openLine + s2.length] },
            fill: b.body.slice(a + 1) });
          return;
        }
      } else {
        let z = s2.indexOf(below, a + 1);
        const gapOk = (zz: number) => (mut('gap-any-line') ? zz >= a + 2 : b.body.slice(a + 1, zz).some(isContent));
        while (z !== -1 && !gapOk(z)) z = s2.indexOf(below, z + 1);
        if (z !== -1) {
          out.push({ loc: { block: b.index, heading: b.heading, lines: [b.openLine + 1 + a, b.openLine + 1 + z] },
            fill: b.body.slice(a + 1, z) });
          return;
        }
      }
    }
  });
  return out;
}

function redactedMarker(line: string): string {
  return cap(redactArtifactSecrets(line.trim()).redacted, MAX_TEXT_CHARS);
}

/** Full analysis of a package. Uncapped; the fact builder caps it. */
export function analyzePackageForm(text: string): PackageFormAnalysis {
  const lines = splitPackageLines(text);
  const blocks = fencedBlocksOf(lines);
  const normBodies = blocks.map((b) => b.body.map(normLine));
  const hits: AnalysisHit[] = [];
  let numberedHunks = 0;
  let unnumberedHunkHeaders = 0;

  // Pass 1: every hunk; the exact ADD hunks indexed by count (an elided pure-deletion hunk's copy source).
  const hunksByBlock = blocks.map((b) => parseHunks(b.body));
  const addHunksByCount = new Map<number, Array<{ block: FencedBlock; h: ParsedHunk }>>();
  blocks.forEach((b, bi) => {
    for (const h of hunksByBlock[bi]) {
      if (h.declared.old !== 0 || h.mismatch) continue;
      const list = addHunksByCount.get(h.declared.new) ?? [];
      list.push({ block: b, h });
      addHunksByCount.set(h.declared.new, list);
    }
  });

  blocks.forEach((b, bi) => {
    for (const l of b.body) if (UNNUMBERED_HUNK_RE.test(l)) unnumberedHunkHeaders++;
    for (const h of hunksByBlock[bi]) {
      numberedHunks++;
      const base = {
        block: b.index, heading: b.heading, line: b.openLine + 1 + h.at, header: cap(h.header.trim(), MAX_TEXT_CHARS),
        declared: h.declared, observed: h.observed, hunkRange: [h.at, h.end] as [number, number],
      };
      if (h.sideOverflow) { hits.push({ kind: 'hunk-side-overflow', ...base }); continue; }
      if (!h.mismatch) continue;
      const hit: AnalysisHit = { kind: 'hunk-count-mismatch', ...base, extraBodyLines: h.extra };
      // An elided PURE-DELETION hunk (short body, nothing added): the removed lines are the lines an add hunk of the
      // same count wrote. Matched on COUNT only (no file key parsed); every candidate is listed, never guessed.
      // Undercounts carry no locatedIn — their own body IS the content.
      const isShort = h.observed.old < h.declared.old || h.observed.new < h.declared.new;
      if (isShort && h.declared.new === 0 && h.declared.old > 0) {
        const src = addHunksByCount.get(h.declared.old) ?? [];
        if (src.length) {
          hit.locatedIn = src.map((a) => ({
            block: a.block.index, heading: a.block.heading,
            // The BODY lines only (header excluded): that is what the copy instruction points at.
            lines: [a.block.openLine + 2 + a.h.at, a.block.openLine + a.h.end] as [number, number],
          }));
          hit.fills = src.map((a) => a.block.body.slice(a.h.at + 1, a.h.end));
        }
      }
      hits.push(hit);
    }
    b.body.forEach((l, li) => {
      if (!isElisionMarker(l) || isYamlDocumentEnd(b, li)) return;
      const loc = locateMarker(blocks, normBodies, bi, li);
      hits.push({
        kind: loc.length ? 'marker-line-located' : 'marker-line-unlocated', block: b.index, heading: b.heading,
        line: b.openLine + 1 + li, marker: redactedMarker(l), markerIndex: li,
        ...(loc.length ? { locatedIn: loc.map((x) => x.loc), fills: loc.map((x) => x.fill) } : {}),
      });
    });
  });

  const isTrigger = (h: FormCheckHit) => FORM_CHECK_TRIGGER_KINDS.includes(h.kind);
  hits.sort((x, y) => (Number(isTrigger(y)) - Number(isTrigger(x))) || (x.line - y.line));
  return { lines, blocks, numberedHunks, unnumberedHunkHeaders, hits };
}

export function triggerHits<T extends FormCheckHit>(a: { hits: T[] }): T[] {
  return a.hits.filter((h) => FORM_CHECK_TRIGGER_KINDS.includes(h.kind));
}

/**
 * An UNDERCOUNT (Step B scope, Steve 2026-10-07): a `hunk-count-mismatch` whose body holds MORE lines than its
 * header declares — both sides reached their declared counts, lines continued after them — and whose every body line
 * is a diff line (' ', '+', '-', '\\' or empty). The last conjunct excludes a mismatch caused by a FOREIGN line (no diff
 * prefix): a header recount cannot repair that, so attempting it would only spend the pass. The repair of an
 * undercount is a header-only recount whose content is the Author's own body — the one class A.5 adopted 9 of 9
 * with 0 collateral (final-prompt run). A SHORT hunk (body fewer than declared) is never an undercount.
 */
export function isUndercountHit(h: AnalysisHit, a: Pick<PackageFormAnalysis, 'blocks'>): boolean {
  if (h.kind !== 'hunk-count-mismatch' || !h.declared || !h.observed || !h.hunkRange) return false;
  if (h.observed.old < h.declared.old || h.observed.new < h.declared.new) return false;
  if (!h.extraBodyLines || h.extraBodyLines <= 0) return false;
  const block = a.blocks[h.block - 1];
  if (!block) return false;
  return block.body.slice(h.hunkRange[0] + 1, h.hunkRange[1]).every((l) => l === '' || /^[ +\-\\]/.test(l));
}

/** Every TRIGGER hit is an undercount (fact-only kinds ignored). Kept as a building block; the Step B scope is the
 *  stricter `allHitsAreUndercounts`. */
export function allTriggerHitsAreUndercounts(a: PackageFormAnalysis): boolean {
  const t = triggerHits(a);
  return t.length > 0 && t.every((h) => isUndercountHit(h, a));
}

/**
 * Step B scope (review B-M1, 2026-10-07): there is ≥1 hit and EVERY hit — fact-only kinds included — is a header
 * undercount (`hitsTotal === triggerHitsTotal`, all undercounts). Why every HIT and not every trigger hit: an elision
 * marker inside the undercount's own extra lines (`+    # ...`) is a diff line, so the hunk still reads as an undercount;
 * the adopted recount would then APPLY the literal `...` — turning a loud `terraform validate` failure into a valid but
 * wrong config. Any marker, overflow, short hunk or foreign-line mismatch anywhere ⇒ false (fact only, no attempt).
 * Corpus effect: none — the 9 A.5 in-scope specimens each carry exactly one hit.
 */
export function allHitsAreUndercounts(a: PackageFormAnalysis): boolean {
  return a.hits.length > 0 && a.hits.every((h) => isUndercountHit(h, a));
}

/**
 * The precedence rule (plan §4): #89 > form > #90; budget and stop reason disqualify; then the flag; then the Step B
 * scope. The flag sits BEFORE the scope on purpose: with the flag off, every reason is byte-identical to Step A.
 */
export function decideFormCorrection(input: {
  checked: boolean;
  triggerHitsTotal: number;
  correctionTurnUsed: boolean;
  budgetFlagged: boolean;
  enabled: boolean;
  /** Step B: every hit is an undercount (`allHitsAreUndercounts`). Omitted ⇒ false (never attempt). */
  allUndercount?: boolean;
}): FormCorrectionFact {
  if (!input.checked) return { attempted: false, notAttemptedReason: 'not-checked' };
  if (input.triggerHitsTotal === 0) return { attempted: false, notAttemptedReason: 'no-trigger-hit' };
  if (input.correctionTurnUsed) return { attempted: false, notAttemptedReason: 'prior-pass-used:anti-fabrication' };
  if (input.budgetFlagged) return { attempted: false, notAttemptedReason: 'budget-flagged' };
  if (!input.enabled) return { attempted: false, notAttemptedReason: 'flag-off' };
  if (!input.allUndercount) return { attempted: false, notAttemptedReason: 'hits-include-non-undercount' };
  return { attempted: true };
}

/** The persisted shape of one hit: internals stripped, `locatedIn` capped with its total (review F2). */
function toFactHit(h: AnalysisHit): FormCheckHit {
  const { hunkRange: _r, markerIndex: _m, fills: _f, locatedIn, ...rest } = h;
  void _r; void _m; void _f;
  return locatedIn
    ? { ...rest, locatedIn: locatedIn.slice(0, FORM_CHECK_MAX_LOCATIONS).map((l) => ({ block: l.block, lines: l.lines })), locatedInTotal: locatedIn.length }
    : rest;
}

/**
 * Build the persisted fact. Never throws: a checker failure is the named `checker-error` arm (fail-OPEN — the key is
 * present and says what happened), and the error message goes to `onCheckerError` so the caller can log it (review F4/L7).
 */
export function computeFormCheckFact(input: {
  text: string;
  stopReason: string | null | undefined;
  textSource?: FormCheckTextSource;
  correctionTurnUsed?: boolean;
  budgetFlagged?: boolean;
  /** Step B: `isFormCorrectionEnabled()` at the core call site (`FORM_CORRECTION_ENABLED=true`; default OFF). */
  correctionEnabled?: boolean;
  onCheckerError?: (message: string) => void;
}): FormCheckFact {
  const unchecked = (reason: FormCheckReason): FormCheckFact => ({
    version: FORM_CHECK_VERSION, checked: false, reason, textSource: input.textSource ?? 'loop',
    fencedBlocks: null, numberedHunks: null, unnumberedHunkHeaders: null, hitsTotal: null, triggerHitsTotal: null, hits: [],
    correction: { attempted: false, notAttemptedReason: 'not-checked' },
  });
  if (input.stopReason !== 'end_turn') return unchecked('not-end-turn');
  if (!input.text || !input.text.trim()) return unchecked('empty-deliverable');
  try {
    const a = analyzePackageForm(input.text);
    const trig = triggerHits(a).length;
    return {
      version: FORM_CHECK_VERSION, checked: true, reason: 'checked', textSource: input.textSource ?? 'loop',
      fencedBlocks: a.blocks.length, numberedHunks: a.numberedHunks, unnumberedHunkHeaders: a.unnumberedHunkHeaders,
      hitsTotal: a.hits.length, triggerHitsTotal: trig, hits: a.hits.slice(0, FORM_CHECK_MAX_HITS).map(toFactHit),
      correction: decideFormCorrection({
        checked: true, triggerHitsTotal: trig, correctionTurnUsed: !!input.correctionTurnUsed,
        budgetFlagged: !!input.budgetFlagged, enabled: !!input.correctionEnabled,
        allUndercount: allHitsAreUndercounts(a),
      }),
    };
  } catch (err) {
    try { input.onCheckerError?.(err instanceof Error ? err.message : String(err)); } catch { /* a logger must not fail the run */ }
    return unchecked('checker-error');
  }
}
