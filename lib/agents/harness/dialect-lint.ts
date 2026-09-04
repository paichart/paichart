/**
 * dialect-lint.ts — mechanical banned-token check over a change package's fenced config blocks.
 *
 * WHY CODE (corpus-earned, IGP-T1 campaign 2026-08-23): the same dialect class failed past TWO
 * prose layers — R1 shipped `is-type level-2-only` + `metric-style wide` (IOS-isms on an Arista
 * EOS target) past an approving reviewer; R3 RE-EMITTED `metric-style wide` past a binding
 * interface-contract rule explicitly banning it, plus router-level `passive-interface`. Per the
 * FW-A3 rule of thumb, a prose contract failing on a second axis is the evidence that earns the
 * mechanical check. Every prose guard in this domain has failed at least once; every mechanical
 * one has held.
 *
 * WHAT IT IS: a pure function (no I/O, no prisma) that
 *   1. extracts banned tokens from the run's interface contract — any string-array value whose
 *      key matches /banned/i, at any depth (contract shapes vary per Architect; the convention
 *      the campaign converged on is a `bannedTokens`-style array; deep search keeps us shape-
 *      tolerant without a schema);
 *   2. scans ONLY fenced code blocks (``` … ```) of the deliverable for those tokens — prose is
 *      exempt BY DESIGN: requirements/contract text legitimately NAMES banned tokens when
 *      stating the rules (IGP-T1 R6's contract carried them 10-12 times in rule prose while the
 *      config was clean);
 *   3. returns a FACT (Protocol 10): checked/reason/tokensConsidered/violations — never a
 *      verdict. Consumption (gating, surfacing on the lean card) is the wiring layer's decision.
 *
 * TWO HALVES, and they fail independently:
 *   ABSENCE  — banned tokens must not appear (earned R1/R3: IOS-isms on an EOS target).
 *   PRESENCE — every required line of the contract's canonical stanza must appear (earned R7,
 *              2026-08-24): a package omitted `address-family ipv4 unicast` from the canonical
 *              stanza it was contractually required to transcribe. It was banned-token CLEAN, the
 *              config entered a config session with no error, committed successfully, and displayed
 *              as configured in `show running-config` — while IS-IS stayed DISABLED
 *              (`% IS-IS (1) is disabled because: IS-IS address family configuration is not
 *              present`). The leg reviewer approved it 90/100 with zero blocking issues, because a
 *              banned-token check runs in the opposite direction. An absence-only lint would have
 *              approved it too.
 *
 * PHASE 1 STATUS: pure module + fixture tests only (scripts/test-dialect-lint.ts, pinned on the
 * live R1/R3 packages). Engine wiring (execution-core beside derivation-containment enrichment,
 * RESULT_JSON_SUMMARY_KEYS, artifact-parity pins) is a follow-on change —
 * cline_docs/follow-ups/igp-t1-campaign-followups-2026-08-23.md item 2.
 */

export interface DialectLintViolation {
  /** The banned token found. */
  token: string;
  /** 1-indexed line number within the scanned document. */
  line: number;
  /** The offending line's text, trimmed, capped. */
  lineText: string;
}

/** One required line of a contract's canonical stanza, and how often it actually appears. */
export interface CanonicalLineCheck {
  /** The canonical line, verbatim from the contract's stanza (trimmed). */
  line: string;
  /** Which contract stanza this line came from — a contract carries several (e.g. the main config
   *  stanza AND a preference-knob stanza used only by a later phase). Without attribution, a line
   *  from a not-yet-applicable stanza reads as a defect (live false positive, IGP-T1 R9). */
  stanzaKey: string;
  /** literal = the whole line was matched; prefix = the line carries a <placeholder>, so only its
   *  leading literal segment could be matched. */
  matchedOn: 'literal' | 'prefix';
  /** The leading literal segment, when matchedOn === 'prefix'. */
  prefix?: string;
  /** How many candidate-config lines matched. 0 = MISSING. */
  occurrences: number;
}

/** Transcription-completeness fact — the PRESENCE half (see the R7 note in the header). */
export interface TranscriptionCheck {
  /** false when no canonical stanza was found in the contract (nothing to check). */
  checked: boolean;
  reason?: 'no-canonical-stanza' | 'no-fenced-blocks';
  /** How many canonical stanzas the contract carried. */
  stanzasConsidered: number;
  /** Required lines that appear at least once, and the total required. Read TOGETHER before
   *  treating `missing` as a defect — see the intent caveat in `scope`. */
  linesPresent?: number;
  linesRequired?: number;
  /** How each stanza was WRITTEN, in stanza order — the parser tolerates more than one form and
   *  the reader must not have to guess which it saw. `none` means it did not decompose into
   *  multiple lines at all; pair it with the `stanza-not-decomposable` entry in `skipped`.
   *  (Live IGP-T1 R12: the Architect emitted `slash` where the prior round emitted `newline`.) */
  separators?: StanzaSeparator[];
  /** Every required line with its occurrence count — asymmetry (e.g. 2 devices, 1 occurrence)
   *  is visible here even though the check itself is document-level. */
  lines: CanonicalLineCheck[];
  /** PER-STANZA rollup — the attribution `CanonicalLineCheck.stanzaKey` already carries, NOT
   *  flattened. A contract holds several stanzas and a leg legitimately applies only the ones its
   *  PHASE calls for, so a single cross-stanza total is a category error: it adds a stanza the leg
   *  was never meant to touch to one it completed. Read THIS, not `linesPresent`/`linesRequired`.
   *
   *  `attempted` = present > 0. The R7 defect shape is ATTEMPTED AND INCOMPLETE, per stanza — a leg
   *  plainly transcribing a stanza that dropped a line. A stanza with present === 0 was simply not
   *  this phase's job and is NOT a finding. That is an exact test; the 0.5 ratio threshold it
   *  replaces was only ever a proxy for the attribution available here all along.
   *
   *  Third occurrence before this shipped: IGP-T1 R9 (recorded on `stanzaKey` itself), R16-G3
   *  (patched in the RENDERER, which treated the symptom), and R18-P1 — where a correct coexistence
   *  deploy read 12 of 13 and tripped the renderer's threshold, because the missing line was the
   *  PREFERENCE KNOB belonging to P3. */
  byStanza?: Record<string, { present: number; required: number; attempted: boolean; complete: boolean }>;
  /** Convenience view: required lines with occurrences === 0. Read WITH `byStanza` — a line missing
   *  from a stanza this phase does not apply is expected, not the R7 shape. */
  missing: string[];
  /** Lines the check could not evaluate (separators, or a placeholder with no usable literal
   *  prefix). NAMED, never silently dropped. */
  skipped: string[];
  /** Honest scope statement — carried in the fact so a consumer cannot over-claim it. */
  scope: string;
}

export interface DialectLintResult {
  /** false when no banned-token list was found in the contract (nothing to check). */
  checked: boolean;
  /** Why checked is false, when it is. */
  reason?: 'no-contract' | 'no-banned-token-list' | 'no-fenced-blocks';
  /** The tokens the lint scanned for (deduped, as found in the contract). */
  tokensConsidered: string[];
  /** Violations found inside CANDIDATE-CONFIG blocks only (expected-output and rollback blocks may
   *  legitimately contain banned tokens — see the classification note in this file). */
  violations: DialectLintViolation[];
  /** How many fenced blocks of each kind were seen — so "0 violations" can be told apart from
   *  "nothing was classified as candidate config". */
  blockKinds: Record<string, number>;
  /** PRESENCE half — independent of the banned-token (absence) half above: a package can be
   *  banned-token clean and still fatally incomplete (IGP-T1 R7). Always emitted. */
  transcription: TranscriptionCheck;
}

const MAX_LINE_TEXT = 120;
const MAX_TOKENS = 64; // sanity cap — a "banned list" larger than this is not a token list
const MAX_STANZAS = 8; // sanity cap on canonical stanzas pulled from one contract
const MIN_PREFIX = 3;  // a placeholder line's literal prefix must be this long to be assertable
/** Carried IN the fact so a consumer cannot over-claim what the presence half proves. */
const SCOPE_NOTE =
  'document-level: catches a required line missing ENTIRELY (the IGP-T1 R7 defect). It does NOT ' +
  'verdict on per-device asymmetry — inspect `lines[].occurrences` for that (e.g. 2 devices but ' +
  'one occurrence of a required line). It also does NOT know a leg\'s INTENT: compare ' +
  '`linesPresent` against `linesRequired` before reading `missing` as a defect. A DEPLOY leg that ' +
  'dropped a line reads high-but-not-complete (live: 8 of 10, IGP-T1 R11 — a real defect). A ' +
  'REMOVAL or verification leg legitimately carries almost none of the stanza and reads near-zero ' +
  '(live: 1 of 10, IGP-T1 R12 P4 — a FALSE positive, and the leg reviewer was right to approve it). ' +
  'The counts are reported so a consumer can tell those apart; this check deliberately does not ' +
  'guess which one it is looking at.';

/** Deep-collect string entries of any array whose key matches /banned/i. */
export function extractBannedTokens(contract: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      // KEY PREDICATE — /banned|forbidden/i, deliberately broader than the name suggests.
      // `forbidden` was added 2026-08-25 (Phase 2 wiring) after replaying against a LIVE contract:
      // the Program Architect emits `platformDialect.forbiddenTokens`, and a /banned/-only test
      // matched ZERO tokens on every real network-provisioning run. The lint would have stamped
      // `checked:false, reason:'no-banned-token-list'` forever — a NAMED reason, so never a silent
      // pass, but a net that gates nothing while appearing wired. Found by the enrichment fixtures
      // BEFORE shipping, which is the whole reason they exist (contrast: derivation-containment
      // shipped three such defects because it was only reachable via a 30-50 minute program run).
      if (/banned|forbidden/i.test(key)) {
        if (Array.isArray(value)) {
          for (const v of value) if (typeof v === 'string' && v.trim()) out.push(v.trim());
        } else if (typeof value === 'string' && value.trim()) {
          out.push(value.trim());
        }
      }
      walk(value);
    }
  };
  walk(contract);
  return [...new Set(out)].slice(0, MAX_TOKENS);
}

/**
 * A change package's fenced blocks are NOT all candidate config. They are:
 *   - candidate config      (what the operator applies)          → ABSENCE half must scan this
 *   - rollback config       (`no <line>` forms)                   → not config; skip
 *   - commands to run       (`show ...`)                          → not config
 *   - EXPECTED OUTPUT       (device output the operator compares) → may legitimately contain a
 *                                                                   banned token, because it shows
 *                                                                   PRE-EXISTING state
 *
 * Scanning all of them for banned tokens is a false-positive generator: IGP-T1 R9's package carried
 * `passive-interface Loopback0` inside the OSPF-unchanged EXPECTED OUTPUT — the OSPF baseline the
 * change must preserve. That round's contract happened to word the token as a qualified phrase so
 * nothing matched; with the plain token (as R7's contract used) this lint would have blocked a
 * CLEAN package. That is the R5 mistake — a correct package blocked on distorted evidence —
 * reproduced inside our own guard. Hence classification before scanning.
 *
 * Classification uses the nearest preceding prose, because expected-output blocks are introduced by
 * a BOLD line ("**Expected output (ceos1):**"), not a markdown heading.
 */
export type BlockKind =
  | 'candidate-config' | 'rollback' | 'expected-output' | 'command' | 'harvested-state';

/** Read-only operator verbs. A block of ONLY these is something the operator RUNS, not config the
 *  device receives — so a banned token inside it is a search pattern, not a directive. */
const OPERATOR_VERB = /^(show|grep|egrep|fgrep|diff|awk|sed|cat|head|tail|wc|less|more)\b/i;

/**
 * A block quoting what the device ALREADY HAS — a verbatim harvest, a captured baseline, a
 * before-state. Added 2026-08-27 after IGP-T1 R15 P4 produced two false violations on
 * `passive-interface Loopback0` quoted under "Harvested OSPF baseline — ceos2 (quoted verbatim,
 * Phase 0 harvest)". The token is banned under `router isis`; this is harvested `router ospf`, where
 * it is valid and where the package is REQUIRED to quote it verbatim. There was no kind for
 * "evidence of current state", so it fell to candidate-config — the default that gets scanned.
 *
 * Deliberately matched on the block's LABEL, not its content: what makes a block harvested state is
 * that the package SAYS it is quoting the device, and content-sniffing here would be the same
 * circularity we refused elsewhere in this file.
 */
const HARVESTED_STATE_PROSE =
  /harvest|baseline|current\s+(running-?)?config|existing\s+config|quoted\s+verbatim|before[- ]state|as[- ]found|pre[- ]change/i;

function classifyBlock(precedingProse: string, body: string[]): BlockKind {
  // Order matters: a "harvested baseline" block inside a Rollback section is still evidence, and a
  // rollback that RESTORES harvested config is still a rollback — both are exempt from the absence
  // scan, so the precedence between them is not load-bearing. Kept first because it is the more
  // specific label.
  if (HARVESTED_STATE_PROSE.test(precedingProse)) return 'harvested-state';
  if (/rollback|restore|revert|back\s?out/i.test(precedingProse)) return 'rollback';
  if (/expected\s+(output|result)/i.test(precedingProse)) return 'expected-output';
  const meaningful = body.map((l) => l.trim()).filter(Boolean);
  // OPERATOR COMMANDS, not just `show` (widened 2026-08-27). A package may legitimately hand the
  // operator a verification command that MENTIONS a banned token as a search pattern — live: an
  // author wrote `grep -c -E 'metric-style|level-2-only|passive-interface' <file>` precisely to
  // PROVE those tokens are absent, and the ABSENCE half flagged it as four violations. That is the
  // R5 mistake reproduced inside our own guard for the third time: the check must scan what the
  // package ASKS THE DEVICE TO BECOME, never what it asks the operator to RUN.
  if (meaningful.length > 0 && meaningful.every((l) => OPERATOR_VERB.test(l))) return 'command';
  if (meaningful.length > 0 && meaningful.filter((l) => /^no\s/i.test(l)).length * 2 > meaningful.length) {
    return 'rollback';
  }
  return 'candidate-config';
}

/**
 * Extract fenced-block lines with their 1-indexed document line AND the kind of block they came
 * from, so each half can scan the blocks it should.
 */
function fencedBlockLines(doc: string): Array<{ line: number; text: string; kind: BlockKind }> {
  const lines = doc.split('\n');
  const out: Array<{ line: number; text: string; kind: BlockKind }> = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*```/.test(lines[i])) {
      i++;
      continue;
    }
    // Nearest preceding non-empty prose (skip blank lines) — up to 3 lines of context.
    const ctx: string[] = [];
    for (let k = i - 1; k >= 0 && ctx.length < 3; k--) {
      if (/^\s*```/.test(lines[k])) break;
      if (lines[k].trim()) ctx.push(lines[k]);
    }
    // …PLUS the section heading this block sits under, however far back it is (2026-08-27).
    // The 3-line window is easily SHADOWED: IGP-T1 R15 P4 put a per-device sub-label ("**ceos2:**")
    // immediately above a rollback block, which consumed the whole window and hid the "## Rollback"
    // heading four lines further up — so a correct rollback was scanned as candidate config and
    // produced a false violation. A heading governs every block beneath it until the next heading,
    // which is exactly the scope the classifier needs and the line-window cannot express.
    // NEAREST heading is NOT ENOUGH — walk the ANCESTRY (IGP-T1 R16 P4, same day, second cut).
    // The first version took only the nearest heading, and a per-device SUB-heading shadows the
    // section heading just as effectively as a bold label did. R16's document:
    //
    //     ## 5. Rollback Plan (per device — verbatim from Phase 0 harvest …)   <- governs
    //     ### ceos1        block here: no fence between, the 3-line window still reached the ##
    //     ### ceos2        block here: a fence intervenes, nearest heading is "### ceos2" — no kind
    //
    // The ceos1 and ceos2 blocks are IDENTICAL in content and intent; only ceos1 classified
    // correctly, purely because no fence sat between it and the section heading. That is the real
    // defect — the guard's correctness was POSITION-DEPENDENT — not the single false violation it
    // produced. So collect the ancestor chain: from the nearest heading, keep walking up taking
    // only headings of STRICTLY DECREASING level, stopping at the top.
    //
    // Still bounded, and in the way that matters: a later "## Candidate configuration" section is
    // its own blocks' h2 ancestor, so a previous "## Rollback Plan" can never reach them. Only
    // genuine ancestors are collected, never siblings.
    let level = 7;
    for (let k = i - 1; k >= 0 && level > 1; k--) {
      const m = /^\s{0,3}(#{1,6})\s/.exec(lines[k]);
      if (!m) continue;
      const thisLevel = m[1].length;
      if (thisLevel < level) { ctx.push(lines[k]); level = thisLevel; }
    }
    const body: string[] = [];
    const startLine = i + 1;
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])) {
      body.push(lines[j]);
      j++;
    }
    const kind = classifyBlock(ctx.join(' '), body);
    for (let b = 0; b < body.length; b++) out.push({ line: startLine + b + 1, text: body[b], kind });
    i = j + 1;
  }
  return out;
}

/**
 * Token match: case-insensitive substring with word-ish boundaries on both ends, so
 * `metric-style` matches `metric-style wide` but a token `is` never matches `isis`.
 */
function tokenRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i');
}

/**
 * Deep-collect canonical stanza TEMPLATES from the contract: any string value whose KEY names a
 * canonical stanza/exemplar/template. Shape-tolerant on purpose — across the campaign the
 * Architect has used `canonicalIsisStanza`, `canonicalStanza_P1_template`, `canonicalStanzaExemplar`
 * and `canonicalPreferenceKnobExemplar`, all meaning the same thing.
 */
export function extractCanonicalStanzas(contract: unknown): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (/canonical/i.test(key) && /(stanza|exemplar|template)/i.test(key) && typeof value === 'string' && value.trim()) {
        out.push({ key, text: value });
      }
      walk(value);
    }
  };
  walk(contract);
  return out.slice(0, MAX_STANZAS);
}

/** A stanza line we cannot meaningfully assert: a separator, or empty. */
function isTrivialStanzaLine(line: string): boolean {
  const t = line.trim();
  return t === '' || t === '!' || /^!+$/.test(t);
}

/**
 * Turn one canonical-stanza line into something checkable.
 * A line with no `<placeholder>` is matched LITERALLY. A line carrying a placeholder can only be
 * matched on its leading literal segment (`net <NET>` -> `net`), and only when that segment is
 * substantial enough to mean something (>= MIN_PREFIX chars). Anything else is SKIPPED and named.
 */
function classifyStanzaLine(line: string): { matchedOn: 'literal' | 'prefix'; needle: string } | null {
  const t = line.trim();
  const ph = t.indexOf('<');
  if (ph < 0) return { matchedOn: 'literal', needle: t };
  const prefix = t.slice(0, ph).trim();
  if (prefix.length < MIN_PREFIX) return null;
  return { matchedOn: 'prefix', needle: prefix };
}

function countOccurrences(configLines: string[], needle: string, mode: 'literal' | 'prefix'): number {
  const n = needle.toLowerCase();
  let count = 0;
  for (const raw of configLines) {
    const t = raw.trim().toLowerCase();
    // A rollback block is fenced too, and its `no <line>` forms are the NEGATION of config, not
    // config. Counting them inflated `interface Loopback0` to 3x on a 2-device package (live,
    // IGP-T1 R9) and produced a meaningless asymmetry warning.
    if (t.startsWith('no ')) continue;
    if (mode === 'literal') {
      if (t === n) count++;
    } else if (t.startsWith(n)) {
      // WORD BOUNDARY REQUIRED (2026-08-27). A placeholder line degrades to its literal prefix, and
      // a short prefix silently swallows longer tokens: the needle from `net <NET>` matched OSPF
      // `network 1.1.1.1/32 area 0.0.0.0` and reported FOUR NETs in a package that contained none
      // (measured live, IGP-T1 R12 P4). False PRESENCE is the worse direction — it makes a required
      // line look transcribed when it is absent, which is precisely the R7 defect this half exists
      // to catch.
      const next = t.charAt(n.length);
      if (next === '' || !/[a-z0-9]/.test(next)) count++;
    }
  }
  return count;
}

/**
 * The checkable needles derived from a contract's canonical stanzas — the SINGLE SOURCE for
 * *which lines count* (trivial `!` separators skipped, placeholder lines degraded to their literal
 * prefix, sub-MIN_PREFIX lines refused and named).
 *
 * Exported because a SECOND consumer needs the same derivation with DIFFERENT matching:
 * `contract-propagation-enrichment` asks "does this child's BRIEF mention this line?" over prose,
 * where a canonical line appears mid-sentence; the PRESENCE half below asks "does this CONFIG
 * contain this line?" over fenced blocks, where it must be its own line. Sharing the matcher would
 * be wrong; sharing the derivation is the point — a change to what counts as a required line must
 * reach both callers.
 */
export interface CanonicalNeedle {
  /** The stanza line as written (trimmed), for reporting. */
  line: string;
  /** Which contract key it came from. */
  stanzaKey: string;
  matchedOn: 'literal' | 'prefix';
  /** What to actually search for — the whole line, or its literal prefix. */
  needle: string;
}

/**
 * Split a canonical stanza into its lines, tolerating how the stanza was WRITTEN.
 *
 * Earned live on IGP-T1 R12 (2026-08-26), pre-gate. The Program Architect emitted the same stanza
 * as R11 but SLASH-SEPARATED on one line (`router isis <i> / net <NET> / ...`) instead of
 * newline-separated. Splitting on newlines alone yielded ONE needle — `router isis` — which every
 * IS-IS package on earth contains, so the PRESENCE half would have returned a confident clean pass
 * while checking nothing: the exact R7 failure mode reproduced inside R7's own guard, and not even
 * a named skip (`stanzasConsidered:1, needles:1, skipped:[]` reads as working).
 *
 * The Architect's output SHAPE is non-deterministic across rounds under an identical protocol and
 * requirements, so this cannot be left to chance. The durable fix is a contract schema that pins the
 * form; until then the parser tolerates both and REPORTS WHICH IT SAW, because a silently-guessed
 * format is how the check stops measuring without anyone noticing.
 */
export type StanzaSeparator = 'newline' | 'slash' | 'none';

export function splitStanzaLines(text: string): { lines: string[]; separator: StanzaSeparator } {
  // Contracts sometimes carry the stanza with escaped newlines rather than real ones.
  const normalized = text.replace(/\\n/g, '\n');
  const byNewline = normalized.split('\n');
  if (byNewline.filter((l) => l.trim()).length >= 2) {
    return { lines: byNewline, separator: 'newline' };
  }
  // ` / ` as a line separator — REQUIRE the surrounding spaces. A bare `/` is legitimate inside a
  // config token (a CIDR prefix, an interface path), so splitting on it would shred real lines.
  if (/\s\/\s/.test(normalized)) {
    const bySlash = normalized.split(/\s+\/\s+/);
    if (bySlash.filter((l) => l.trim()).length >= 2) {
      return { lines: bySlash, separator: 'slash' };
    }
  }
  return { lines: byNewline, separator: 'none' };
}

/** A stanza this long that yields fewer than 2 checkable lines did not decompose — see
 *  `stanza-not-decomposable` below. Well above a real single-line stanza, well below a real one. */
const MIN_MULTILINE_STANZA_CHARS = 60;

export function canonicalStanzaNeedles(
  contract: unknown
): {
  needles: CanonicalNeedle[];
  skipped: string[];
  stanzasConsidered: number;
  separators: StanzaSeparator[];
} {
  const needles: CanonicalNeedle[] = [];
  const skipped: string[] = [];
  const separators: StanzaSeparator[] = [];
  const seen = new Set<string>();
  const stanzas = extractCanonicalStanzas(contract);
  for (const { key: stanzaKey, text } of stanzas) {
    const before = needles.length;
    const { lines, separator } = splitStanzaLines(text);
    separators.push(separator);
    for (const raw of lines) {
      if (isTrivialStanzaLine(raw)) continue;
      const cls = classifyStanzaLine(raw);
      if (!cls) {
        skipped.push(raw.trim());
        continue;
      }
      const dedupeKey = `${stanzaKey}:${cls.matchedOn}:${cls.needle.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      needles.push({ line: raw.trim(), stanzaKey, matchedOn: cls.matchedOn, needle: cls.needle });
    }
    // A long stanza that produced fewer than 2 checkable lines did not decompose — an unrecognised
    // separator, most likely. NAME it: a one-needle check over a multi-line stanza is not a pass,
    // and the whole point of this fact is that absence is never silent.
    if (text.length >= MIN_MULTILINE_STANZA_CHARS && needles.length - before < 2) {
      skipped.push(`stanza-not-decomposable: ${stanzaKey} (${text.length} chars, ${needles.length - before} checkable line(s))`);
    }
  }
  return { needles, skipped: [...new Set(skipped)], stanzasConsidered: stanzas.length, separators };
}

export function runDialectLint(
  deliverable: string | null | undefined,
  contract: unknown
): DialectLintResult {
  const noTranscription = (reason: TranscriptionCheck['reason']): TranscriptionCheck => ({
    checked: false,
    reason,
    stanzasConsidered: 0,
    lines: [],
    missing: [],
    skipped: [],
    scope: SCOPE_NOTE,
  });

  if (!contract || typeof contract !== 'object') {
    return {
      checked: false,
      reason: 'no-contract',
      tokensConsidered: [],
      violations: [],
      blockKinds: {},
      transcription: noTranscription('no-canonical-stanza'),
    };
  }

  const doc = deliverable ?? '';
  const blockLines = fencedBlockLines(doc);
  // PRESENCE counts occurrences in CANDIDATE-CONFIG blocks only (2026-08-28). The original code
  // scanned every block kind on the reasoning that "looking for a required line cannot
  // false-positive" — true for a raw COUNT, false once the count drives per-stanza ATTRIBUTION.
  // Live: R18-P4 (OSPF removal) carries expected-output blocks showing the IS-IS config that
  // SURVIVES the removal; those lines made the deploy stanza read as attempted-but-incomplete on a
  // leg that never transcribes it. The question this half asks is "did the author transcribe the
  // stanza into the config being APPLIED", so candidate-config is the right and only scope.
  const configText = blockLines.filter((b) => b.kind === 'candidate-config').map((b) => b.text);
  const blockKinds: Record<string, number> = {};
  for (const b of blockLines) blockKinds[b.kind] = (blockKinds[b.kind] ?? 0) + 1;

  // ── PRESENCE half (transcription completeness) — independent of the absence half. ──
  const derived = canonicalStanzaNeedles(contract);
  let transcription: TranscriptionCheck;
  if (derived.stanzasConsidered === 0) {
    transcription = noTranscription('no-canonical-stanza');
  } else if (blockLines.length === 0) {
    transcription = {
      ...noTranscription('no-fenced-blocks'),
      stanzasConsidered: derived.stanzasConsidered,
      separators: derived.separators,
    };
  } else {
    const skipped: string[] = derived.skipped;
    // Line-based matching: a config line must BE the line (or start with its literal prefix).
    // The brief-fidelity consumer deliberately matches differently — see canonicalStanzaNeedles.
    const lines: CanonicalLineCheck[] = derived.needles.map((n) => ({
      line: n.line,
      stanzaKey: n.stanzaKey,
      matchedOn: n.matchedOn,
      ...(n.matchedOn === 'prefix' ? { prefix: n.needle } : {}),
      occurrences: countOccurrences(configText, n.needle, n.matchedOn),
    }));
    transcription = {
      checked: true,
      stanzasConsidered: derived.stanzasConsidered,
      separators: derived.separators,
      lines,
      linesPresent: lines.filter((l) => l.occurrences > 0).length,
      linesRequired: lines.length,
      // Per-stanza rollup — see byStanza's doc comment. The totals above are RETAINED for
      // back-compat with existing consumers, but they are the flattened view and must not be the
      // one a reader reaches for first.
      byStanza: (() => {
        // ATTEMPTED is decided on lines UNIQUE to a stanza. Stanzas SHARE container lines — the
        // deploy stanza and the preference-knob stanza both open `router isis <instance>`, and the
        // deploy stanza's `address-family ipv4 unicast` reappears inside the knob stanza. A shared
        // line therefore attributes nothing: counting it made a leg that applied ONLY the deploy
        // stanza read as having "attempted" the knob stanza (1 of 3), which is the same false
        // signal one level down. Caught by the R18-P1 fixture on the first draft of this rollup.
        const seen = new Map<string, number>();
        for (const l of lines) seen.set(l.line, (seen.get(l.line) ?? 0) + 1);
        const acc: Record<string, { present: number; required: number; attempted: boolean; complete: boolean }> = {};
        for (const l of lines) {
          const e = acc[l.stanzaKey] ?? { present: 0, required: 0, attempted: false, complete: false };
          e.required += 1;
          if (l.occurrences > 0) {
            e.present += 1;
            // only a line unique to THIS stanza is evidence the stanza was attempted
            if ((seen.get(l.line) ?? 0) === 1) e.attempted = true;
          }
          acc[l.stanzaKey] = e;
        }
        for (const k of Object.keys(acc)) acc[k].complete = acc[k].present === acc[k].required;
        return acc;
      })(),
      missing: lines.filter((l) => l.occurrences === 0).map((l) => `${l.line}  [from ${l.stanzaKey}]`),
      skipped: [...new Set(skipped)],
      scope: SCOPE_NOTE,
    };
  }

  // ── ABSENCE half (banned tokens) ──
  const tokens = extractBannedTokens(contract);
  if (tokens.length === 0) {
    return {
      checked: false,
      reason: 'no-banned-token-list',
      tokensConsidered: [],
      violations: [],
      blockKinds,
      transcription,
    };
  }
  if (blockLines.length === 0) {
    return {
      checked: false,
      reason: 'no-fenced-blocks',
      tokensConsidered: tokens,
      violations: [],
      blockKinds,
      transcription,
    };
  }
  const violations: DialectLintViolation[] = [];
  const regexes = tokens.map((t) => ({ token: t, re: tokenRegex(t) }));
  // ABSENCE scans CANDIDATE CONFIG ONLY — see the classification note above. So does the PRESENCE
  // half, since 2026-08-28: "looking for a required line cannot false-positive" holds for a raw
  // COUNT but NOT once that count drives per-stanza attribution (R18-P4 — see the note above it).
  for (const { line, text } of blockLines.filter((b) => b.kind === 'candidate-config')) {
    for (const { token, re } of regexes) {
      if (re.test(text)) {
        violations.push({ token, line, lineText: text.trim().slice(0, MAX_LINE_TEXT) });
      }
    }
  }
  return { checked: true, tokensConsidered: tokens, violations, blockKinds, transcription };
}
