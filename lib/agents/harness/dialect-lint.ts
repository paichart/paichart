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
   *  legitimately contain banned tokens — see the classification note in this file). An occurrence
   *  inside a quoted grep-family search pattern is not a violation — see `searchPatternExempt`. */
  violations: DialectLintViolation[];
  /** How many fenced-block LINES of each kind were seen — LINES, not blocks (every line of a block
   *  carries its block's kind and is counted once; a 12-line rollback adds 12 to `rollback`). It is
   *  the CLASSIFIER'S READING of the document, not ground truth: it tells "0 violations" apart from
   *  "nothing was classified as candidate config" only in the TOTAL case (no `candidate-config` key
   *  at all). A mis-kinded config block moves lines between keys without making the stamp look
   *  empty — EF-DL2 measured 32 real-config blocks / 503 lines exempted that way. Series break:
   *  compare values only between stamps with the same `classifier`. */
  blockKinds: Record<string, number>;
  /** Version of the block classifier (`fencedBlockLines` + `classifyBlock`) that produced
   *  `blockKinds` and decided which lines BOTH halves scanned. Present exactly when the classifier
   *  RAN — absent on the `no-contract` path (nothing classified) and on stamps written before
   *  2026-09-28 (implicitly 1). See `DIALECT_LINT_CLASSIFIER`. Optional in the type for that reason. */
  classifier?: number;
  /** Banned-token occurrences NOT counted as violations because every occurrence on the line sits
   *  inside a quoted grep-family search pattern (EF-DL1 — a check FOR the token's absence is not
   *  its presence). Present ONLY when non-empty. Named rather than silently dropped, so a reader
   *  can see the exemption fired and audit it. */
  searchPatternExempt?: DialectLintViolation[];
  /** PRESENCE half — independent of the banned-token (absence) half above: a package can be
   *  banned-token clean and still fatally incomplete (IGP-T1 R7). Always emitted. */
  transcription: TranscriptionCheck;
}

/**
 * THE CLASSIFIER VERSION stamped as `dialectLint.classifier` (EF-DL2 Phase D decision 4, 2026-09-28).
 *
 * BUMP THIS IN EVERY COMMIT THAT CHANGES WHICH KIND A LINE RECEIVES — the ancestry walk, the
 * window, `classifyBlock`'s vocabulary/precedence/body rules. Not for a change to the halves that
 * CONSUME the kinds. Why a field and not a documented date: `blockKinds` and the scan scope move
 * on most contract packages at every such change, and a query that splits the series on a typed
 * date silently mixes the two sides the day someone re-runs a leg. A field makes each cut derive
 * itself.
 *   1 — implicit: every stamp before 2026-09-28 (no field).
 *   2 — F1: the heading-ancestry walk is fence-aware (a `#` line inside a fence is not a heading).
 *   3 — EF-DL2 commit 2, option (ac), 2026-09-28: the 3-line prose window stops AT the first
 *       heading (heading line included, so `label` is unmoved); `harvested-state` is decided only
 *       from the block's own label (`labelProse`, ≤ MAX_LABEL_CHARS) + heading ancestry. Moves
 *       `blockKinds` on most contract packages and 2 PRESENCE results (both corrections); 0
 *       violations and 0 net #3 dispositions on the archive.
 *
 * NESTED on the fact (E3b), never a `RESULT_JSON_SUMMARY_KEYS` entry: the result-json whitelist
 * copies `dialectLint` verbatim, so a nested field survives by construction (pinned: E3b-5 in
 * test-execution-artifacts-parity).
 */
export const DIALECT_LINT_CLASSIFIER = 3;

const MAX_LINE_TEXT = 120;
const MAX_TOKENS = 64; // sanity cap — a "banned list" larger than this is not a token list
const MAX_STANZAS = 8; // sanity cap on canonical stanzas pulled from one contract
const MIN_PREFIX = 3;  // a placeholder line's literal prefix must be this long to be assertable
/** A block LABEL is short; a paragraph that merely precedes a block is not. See `labelProse`. */
const MAX_LABEL_CHARS = 120;
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
 *
 * Since `classifier: 3` (EF-DL2 option ac) the "label" is literal: this is tested only against the
 * block's own short label line and its heading ancestry, never against a sentence elsewhere in the
 * prose window (see the call site in `fencedBlockLines`).
 *
 * ⚠️ RE-OPEN TRIGGER for Author-side fence-role declaration — EF-DL2 option (d), deferred with this
 * trigger by all four panel lanes (Phase D decision 3, Lane 2's form, 2026-09-28):
 *   re-open ONLY IF, after `classifier: 3`, a GOLD-LABELLED false SKIP (real config kinded as anything
 *   but candidate-config) appears on a NEW package — one stamped by classifier ≥ 3 — OR a second
 *   POSITION-DEPENDENCE incident occurs (identical blocks classified differently by where they sit).
 *   D098 (`cmu4wyjzv006syx8ybnafzc9n`, pinned in test-dialect-lint) is a KNOWN PRE-FIX RESIDUAL,
 *   not a trigger.
 * If it is ever built: the LABEL-LINE form, in the shared VALIDATION_SHAPE_CLAUSE (protocol tail,
 * auto-seeded), widening-only, the declaration never replacing the prose source label. NEVER the
 * info-string form (```` ```harvested ````): `parseFencedJsonBlock` (derivation-containment.ts) reads
 * a tagged marker block as ABSENT, which fails a CORRECT program leg closed.
 * Measure it with the lane-1 replay (discovery §E, "EF-DL2 re-measure").
 */
const HARVESTED_STATE_PROSE =
  /harvest|baseline|current\s+(running-?)?config|existing\s+config|quoted\s+verbatim|before[- ]state|as[- ]found|pre[- ]change/i;

/** Rollback/restore intent. Named because TWO axes read it — `kind` below and `restoreIntent`. */
const ROLLBACK_PROSE = /rollback|restore|revert|back\s?out/i;
/** Device output the operator COMPARES against, never config the device receives. */
const EXPECTED_OUTPUT_PROSE = /expected\s+(output|result)/i;
/** Prose that labels a block as something the operator RUNS to check, not content to apply. */
const VERIFICATION_PROSE = /verif|validat|\bcheck\b|confirm|\bcommands?\b/i;

/** A separator-only config line (`!`, `!!!`, `---`). Carries no directive. */
export function isSeparatorLine(text: string): boolean {
  const t = text.trim();
  return /^!+$/.test(t) || /^-{3,}$/.test(t);
}

/**
 * @param precedingProse the bounded prose window (up to 3 lines, stopping AT the block's first heading,
 *   heading included) plus the heading ancestry. Decides rollback / expected-output.
 * @param ownProse the block's OWN label (`labelProse`, the nearest line when ≤ MAX_LABEL_CHARS) plus the
 *   heading ancestry. Since `classifier: 3` (EF-DL2 option ac) it is the ONLY input to the
 *   `harvested-state` decision — see the note at `fencedBlockLines`' call site.
 */
function classifyBlock(precedingProse: string, body: string[], ownProse: string): BlockKind {
  // Order matters: a "harvested baseline" block inside a Rollback section is still evidence, and a
  // rollback that RESTORES harvested config is still a rollback — both are exempt from the absence
  // scan, so the precedence between them is not load-bearing HERE.
  //
  // ⚠️ It IS load-bearing for `restoreIntent` below, which is why that axis is computed
  // independently rather than derived from `kind`. Measured 2026-09-11 on the R19-P4 package: the
  // rollback section's own preamble says "the configuration HARVESTED LIVE by this P4 leg", so one
  // of its three device blocks lands `harvested-state` while the other two land `rollback` — a
  // `kind === 'rollback'` filter would silently drop a third of the restore config, position-
  // dependently. Same shape as the R16-P4 defect recorded in fencedBlockLines below.
  if (HARVESTED_STATE_PROSE.test(ownProse)) return 'harvested-state';
  if (ROLLBACK_PROSE.test(precedingProse)) return 'rollback';
  if (EXPECTED_OUTPUT_PROSE.test(precedingProse)) return 'expected-output';
  const meaningful = body.map((l) => l.trim()).filter(Boolean);
  // OPERATOR COMMANDS, not just `show` (widened 2026-08-27). A package may legitimately hand the
  // operator a verification command that MENTIONS a banned token as a search pattern — live: an
  // author wrote `grep -c -E 'metric-style|level-2-only|passive-interface' <file>` precisely to
  // PROVE those tokens are absent, and the ABSENCE half flagged it as four violations. That is the
  // R5 mistake reproduced inside our own guard for the third time: the check must scan what the
  // package ASKS THE DEVICE TO BECOME, never what it asks the operator to RUN.
  if (meaningful.length > 0 && meaningful.every((l) => OPERATOR_VERB.test(l))) return 'command';
  // ⚠️ SEPARATORS STAY IN THIS DENOMINATOR. DO NOT "FIX" THIS — it was tried on 2026-09-11 and
  // REVERTED, measured, before shipping.
  //
  // The tempting change is to exclude `!` separator lines from the ratio, on the reasoning that a
  // ratio about DIRECTIVES should not count punctuation, and that an Arista-style inverse rollback
  // (6 `no `-forms + 3 context lines + 5 `!` = 14, so `12 > 14` is false) therefore falls through to
  // `candidate-config` and gets scanned. That reasoning is locally correct and globally wrong.
  //
  // A REMOVAL leg's candidate configuration is TEXTUALLY IDENTICAL to an inverse rollback: mostly
  // `no ...` lines with `!` separators. Nothing in the block distinguishes them; only the heading
  // does, and the heading path (ROLLBACK_PROSE, above) already handles it. Measured on the live
  // R19-P4 removal package, the "fix" moved 30 lines out of `candidate-config` into `rollback` —
  // i.e. it would have stopped the ABSENCE half scanning a removal package's real candidate config.
  // That trades a hypothetical false SCAN for a live false SKIP on the exact class this net exists
  // to catch, which is the worse direction. (R12 recorded the mirror-image mistake — a false BLOCK
  // on a removal leg — so this heuristic has now erred in both directions and should be treated as
  // a last resort, not sharpened.)
  //
  // `isSeparatorLine` is exported for consumers whose question really is about directives —
  // rollback-containment scopes with it — but this classifier is not one of them.
  if (meaningful.length > 0 && meaningful.filter((l) => /^no\s/i.test(l)).length * 2 > meaningful.length) {
    return 'rollback';
  }
  return 'candidate-config';
}

/**
 * How a block was LABELLED by the prose immediately above it — an axis orthogonal to `kind`.
 * `null` means the nearest prose labelled it as nothing in particular.
 */
export type BlockLabel = 'expected-output' | 'verification' | null;

export interface FencedBlockLine {
  /** 1-indexed line within the scanned document. */
  line: number;
  text: string;
  kind: BlockKind;
  /**
   * Does this block sit under a ROLLBACK/RESTORE heading? Computed from the heading ANCESTRY
   * ALONE — deliberately NOT from the nearest prose and NOT derived from `kind`. The ancestry is
   * FENCE-AWARE since `classifier: 2` (a `#` line inside an earlier fence is content, not a
   * heading — see the walk in `fencedBlockLines`).
   *
   * WHY IT IS A SEPARATE AXIS (measured 2026-09-11, the reason net #3 exists): `kind` answers
   * "should the banned-token scan read this block?", where `rollback` and `harvested-state` are
   * both simply exempt, so their precedence is arbitrary. `restoreIntent` answers "is this block
   * content the package promises to RESTORE?", where that precedence decides the answer. On the
   * live R19-P4 package the rollback preamble mentions "harvested", so `kind` splits one logical
   * rollback section across two kinds; the ancestry does not. A heading governs every block
   * beneath it until the next heading of the same or lower level, which is exactly the scope
   * "is this the rollback section" needs — and the scope a prose window cannot express.
   */
  restoreIntent: boolean;
  label: BlockLabel;
}

/**
 * Extract fenced-block lines with their 1-indexed document line, the kind of block they came
 * from, and the orthogonal restore-intent/label axes, so each consumer can scope as it should.
 */
export function fencedBlockLines(doc: string): FencedBlockLine[] {
  const lines = doc.split('\n');
  const out: FencedBlockLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*```/.test(lines[i])) {
      i++;
      continue;
    }
    // Nearest preceding non-empty prose (skip blank lines) — up to 3 lines of context, stopping at
    // the first fence OR AT the first heading, the heading line INCLUDED.
    //
    // BOUNDED AT THE HEADING (EF-DL2 commit 2 / option (ac), 2026-09-28 — `classifier: 3`). The window
    // used to climb PAST a block's own section heading into the previous section's prose. Live
    // (EF-DL1 package): `## 2. Full Desired-State Config File` sat directly above its config, and the
    // window reached section 1's table naming the "Phase 0 Harvester" — so the package's REAL config
    // was `harvested-state`, scanned by neither half (production stamped PRESENCE 0 of 2 on a package
    // carrying both lines). Gold-labelled census (panel lane 1, 310 blocks): 23 of the shipped rule's
    // 32 false SKIPs were this crossing.
    //
    // ⚠️ The heading is INCLUDED, not excluded, and that is load-bearing: when the nearest non-empty
    // line IS the heading, `ctx[0]` — and so `labelProse` and `label` below — must not move. Excluding
    // it moved `label` on 59 archived blocks (the `acx` control), and net #3 (rollback-containment)
    // scopes on `label`. Pinned by the EF-DL2 synthetic `label` fixture.
    const ctx: string[] = [];
    for (let k = i - 1; k >= 0 && ctx.length < 3; k--) {
      if (/^\s*```/.test(lines[k])) break;
      if (lines[k].trim()) ctx.push(lines[k]);
      if (/^\s{0,3}#{1,6}\s/.test(lines[k])) break;
    }
    // The NEAREST prose line alone — not the 3-line window, not the ancestry. `label` answers "what
    // does the line directly above call this block?", and every other scope gets that wrong:
    //   • the ancestry would mark every block in a rollback section as expected-output the moment
    //     one of them was;
    //   • the 3-line window pulls in ordinary paragraphs. Measured on the live FW-A3.3 R3 package,
    //     the rollback's introductory sentence contains the word "confirmed", which labelled a real
    //     inverse-rollback block as a verification command.
    // A label is also SHORT. The same FW paragraph ends in a colon and would pass any punctuation
    // test, so the discriminator is length: a genuine block label ("**Expected output (ceos1):**",
    // "- **Post-rollback verification:**", "**Command:**") is well under this cap; a sentence of
    // prose that happens to precede a block is not.
    const nearestProse = ctx.length > 0 ? ctx[0].trim() : '';
    const labelProse = nearestProse.length <= MAX_LABEL_CHARS ? nearestProse : '';
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
    //
    // FENCE-AWARE (EF-DL2 commit 1 / "F1", 2026-09-28 — `classifier: 2`). The walk used to test
    // EVERY earlier line against the heading pattern, including lines INSIDE earlier fenced blocks,
    // so a `#` comment in HCL/YAML/bash/nginx read as a heading. Under CommonMark a line inside a
    // fence is never a heading. A `# comment` is level 1, so it did two things at once: its words
    // were fed to classifyBlock as an "ancestor", AND it stopped the walk (level 1), hiding the
    // block's real `##`/`###` section heading. Live (panel-architectural-review.md §0, terraform):
    // `# NEW: Enforce public-access restrictions per security baseline` inside candidate HCL made
    // every later Part B command/expected block `harvested-state` ("baseline"), and a `# Find the
    // commit hash …` inside a bash block hid `### 3. Rollback Plan`, so the rollback block read
    // `restoreIntent: false`.
    //
    // Walking UP from an opening fence (the forward loop guarantees `i` is one), every fence line
    // toggles in/out, exactly mirroring the forward pairing — so the two scans can never disagree
    // about where a block starts and ends. Structure only: no vocabulary, threshold or precedence
    // moved. F1 left the 3-line WINDOW unchanged (it already stopped at the first fence); commit 2 (`classifier: 3`) bounded it at the first heading too.
    let level = 7;
    const headings: string[] = [];
    let insideFence = false;
    for (let k = i - 1; k >= 0 && level > 1; k--) {
      if (/^\s*```/.test(lines[k])) {
        insideFence = !insideFence;
        continue;
      }
      if (insideFence) continue;
      const m = /^\s{0,3}(#{1,6})\s/.exec(lines[k]);
      if (!m) continue;
      const thisLevel = m[1].length;
      if (thisLevel < level) { ctx.push(lines[k]); headings.push(lines[k]); level = thisLevel; }
    }
    const body: string[] = [];
    const startLine = i + 1;
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])) {
      body.push(lines[j]);
      j++;
    }
    // ⚠️ THE HARVEST DECISION'S INPUT CHANGED (EF-DL2 option (ac), `classifier: 3`). This note used to
    // read "UNCHANGED INPUT SHAPE", and that stopped being true here — deliberately, approved as such
    // (Phase D decision 1, 2026-09-28; SYNTHESIS v2 §2 D1 "AC5 passes in letter only").
    //   • `harvested-state` is decided ONLY from the block's OWN label (`labelProse` — the nearest
    //     line, when ≤ MAX_LABEL_CHARS) or the heading ANCESTRY. Harvest words anywhere else in the
    //     window no longer count. Why: a sentence ABOUT provenance is not a label OF the block, and the
    //     protocols MANDATE such sentences beside real config (dialect notes, gap-naming, the (e1)
    //     source line) — live D076: "Dialect note: transcribed from … ceos1's own harvested `show
    //     running-config`" exempted a real deploy stanza. Bounding the window (above) cannot fix that
    //     one: the sentence is inside the block's own section. The 120-char label rule already
    //     separates a label from a sentence, so this reuses it.
    //   • rollback / expected-output keep their inputs (the bounded window + ancestry), and the
    //     vocabulary, the thresholds and the precedence (harvest → rollback → expected → body rules)
    //     are all unchanged. So a block whose harvest word lived only in the window now falls through
    //     to the rollback/expected/body rules on the SAME window — live D042 (an OSPF rollback quoted
    //     from harvest) stays exempt, now as `rollback`.
    // Measured on the gold census (310 blocks): false SKIP 32 blocks / 503 lines → 2 / 21 (with F1);
    // false SCAN 5 → 109 blocks, all operator commands / marker+allocation JSON, 0 expected-output,
    // 0 violations on the archive. The remaining false SKIPs are NAMED: F028 (title leak, F1) and D098
    // (ROLLBACK_PROSE in a long own-section sentence + a majority-`no` body — fixing it needs the
    // rollback/expected decision label-capped too, which re-scans long `**Expected output** (…)`
    // labels, the R9 class).
    // The two axes below (`restoreIntent`, `label`) read `headings` / `labelProse` directly and are
    // unaffected by the harvest change.
    const ownProse = [labelProse, ...headings].join(' ');
    const kind = classifyBlock(ctx.join(' '), body, ownProse);
    const restoreIntent = ROLLBACK_PROSE.test(headings.join(' '));
    const label: BlockLabel = EXPECTED_OUTPUT_PROSE.test(labelProse)
      ? 'expected-output'
      : VERIFICATION_PROSE.test(labelProse)
        ? 'verification'
        : null;
    for (let b = 0; b < body.length; b++) {
      out.push({ line: startLine + b + 1, text: body[b], kind, restoreIntent, label });
    }
    i = j + 1;
  }
  return out;
}

/**
 * Token match: case-insensitive substring with word-ish boundaries on both ends, so
 * `metric-style` matches `metric-style wide` but a token `is` never matches `isis`.
 * Global, because the ABSENCE half must judge EACH occurrence on a line (see searchPatternRanges).
 */
function tokenRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'gi');
}

/** The grep family — the same read-only search verbs OPERATOR_VERB already treats as operator commands. */
const SEARCH_VERB = /(?<![\w-])(?:grep|egrep|fgrep|zgrep)(?![\w-])/g;

/**
 * Character ranges of a line that are QUOTED ARGUMENTS OF A grep-FAMILY COMMAND — i.e. a search
 * pattern, which the device never receives (EF-DL1, 2026-09-27).
 *
 * WHY OCCURRENCE-LEVEL, NOT A BLOCK KIND: the live defect was a one-line block
 * `docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow all;'` — a check that the banned
 * token is ABSENT, flagged as its presence. The whole-block `command` rule above cannot see it
 * because the line starts with an exec WRAPPER (`docker exec`, `kubectl exec`, `ssh`), not an
 * operator verb, so the block defaults to candidate-config. Widening the classifier to wrappers
 * would re-kind every exec block in the corpus and move the PRESENCE half's denominator and the
 * stamped per-kind block counts with it — and this classifier is recorded above as a last resort that has
 * erred in both directions. The exemption here touches ONLY the absence half and ONLY an
 * occurrence that sits inside a grep pattern, so the block keeps its kind and everything else on
 * the line is still scanned.
 *
 * Polarity is deliberately NOT read (`grep -c … → 0` vs `grep -A1 …`): a search pattern is not a
 * directive whichever way the operator is checking, which is the same reason a block of bare `grep`
 * lines is already `command`. Reading the expected-output block to decide polarity would buy nothing
 * and add a cross-block dependency.
 *
 * Bounded so it cannot swallow config on the same line: the scan starts AT a grep verb and stops at
 * the first unquoted `|`, `;` or `&`, so `grep -q x f || echo 'allow all;' >> f` still flags the
 * echo. QUOTED arguments only — an unquoted pattern, or an unterminated quote, is NOT exempt; both
 * fail toward a visible false positive rather than a silent miss.
 */
function searchPatternRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  SEARCH_VERB.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEARCH_VERB.exec(text)) !== null) {
    let quote: string | null = null;
    let start = -1;
    for (let i = m.index + m[0].length; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && !(quote === '"' && text[i - 1] === '\\')) {
          ranges.push([start, i]);
          quote = null;
        }
      } else if (ch === "'" || ch === '"') {
        quote = ch;
        start = i + 1;
      } else if (ch === '|' || ch === ';' || ch === '&') {
        break;
      }
    }
  }
  return ranges;
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
      classifier: DIALECT_LINT_CLASSIFIER,
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
      classifier: DIALECT_LINT_CLASSIFIER,
      transcription,
    };
  }
  const violations: DialectLintViolation[] = [];
  const regexes = tokens.map((t) => ({ token: t, re: tokenRegex(t) }));
  // ABSENCE scans CANDIDATE CONFIG ONLY — see the classification note above. So does the PRESENCE
  // half, since 2026-08-28: "looking for a required line cannot false-positive" holds for a raw
  // COUNT but NOT once that count drives per-stanza attribution (R18-P4 — see the note above it).
  //
  // Each occurrence is judged separately (EF-DL1): one inside a grep search pattern is exempt and
  // RECORDED in `searchPatternExempt`; any other occurrence on the same line is still a violation.
  const searchPatternExempt: DialectLintViolation[] = [];
  for (const { line, text } of blockLines.filter((b) => b.kind === 'candidate-config')) {
    let ranges: Array<[number, number]> | null = null;
    for (const { token, re } of regexes) {
      re.lastIndex = 0;
      let directive = false;
      let exempt = false;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const s = m.index;
        const e = s + m[0].length;
        ranges ??= searchPatternRanges(text);
        if (ranges.some(([a, b]) => s >= a && e <= b)) exempt = true;
        else directive = true;
        if (m[0].length === 0) re.lastIndex++;
      }
      const entry = { token, line, lineText: text.trim().slice(0, MAX_LINE_TEXT) };
      if (directive) violations.push(entry);
      else if (exempt) searchPatternExempt.push(entry);
    }
  }
  return {
    checked: true, tokensConsidered: tokens, violations, blockKinds, classifier: DIALECT_LINT_CLASSIFIER, transcription,
    // Emitted ONLY when the exemption fired: every stamp without one stays byte-identical to what
    // production has already written (the net-registry equivalence gate compares serialized bytes).
    ...(searchPatternExempt.length ? { searchPatternExempt } : {}),
  };
}
