/**
 * R9 -- neutralize untrusted connected-service output before it (a) re-enters the
 * Harvester's reasoner at the tool-loop, or (b) chains to downstream children.
 *
 * Pure + zero-DB -> exercised directly in CI (scripts/test-security-invariants.ts); no
 * module-level state (consistent with the tool-loop's S1 rule).
 *
 * LAYERING (Protocol 10 -- fact, not verdict): the PRIMARY defense is the structural
 * `<prior_output role="context_only">` quarantine in render-pipeline-context.ts. This
 * module is DEFENSE-IN-DEPTH over the known-pattern subset detectPromptInjection() covers
 * (documented evasions remain: split-token, base64, translated). Absence of a
 * [NEUTRALIZED-INJECTION:...] marker does NOT mean "clean".
 *
 * ORDERING is load-bearing: normalize (NFKC + strip zero-width/bidi/controls/ANSI)
 * -> detect -> neutralize. Detecting before stripping lets zero-width-interior payloads evade.
 *
 * Does NOT redact secrets (that is R10 / redact-artifact-secrets.ts): an `enable secret 5
 * $1$...` line passes through unchanged -- proving R9 != R10.
 *
 * BOUNDARY (review 2026-06-24, pipeline-harness I-3; SHARPENED 2026-07-26): R9 covers
 * REASONER-BOUND paths only -- the tool-loop re-entry (site A) and the chained read into a
 * downstream prompt (site B). A leaf report.md's finalResponse is NOT re-sanitized at write (it
 * has no downstream reasoner); that is a deliberate boundary, not a gap.
 *
 * "REASONER-BOUND" IS NOT THE SAME AS "PERSISTED". Read this before concluding R9 has a coverage
 * gap -- the 2026-07-26 finding below was derived, reviewed by two specialists, CONFIRMED by both,
 * and then disproven:
 *
 *   RAW, UNSANITIZED PAYLOADS ARE PERSISTED BY DESIGN. record.result (agentic-tool-loop.ts, the
 *   success branch) is assigned BEFORE the site-A gate and keeps the original object; only the
 *   LLM-bound copy is rewritten. That raw payload reaches result.json.toolCalls deliberately --
 *   it is forensic EVIDENCE, and R10 draws the same line for secrets. Persisting it is not a gap.
 *
 *   CORRECTED 2026-09-25 (F9-s7) -- IT *DOES* COME BACK TO A HARNESS REASONER. The 2026-07-26
 *   disproof traced advanced/agent-results-handler.js (300-char preview), a handler the ENGINE does
 *   not reach. The engine's perform (embedded-server.ts `perform` -> task-action-handler.js) formats
 *   with formatActionResult, which carries FULL artifact content; with `verbose:true` it is capped
 *   only at 100 KB, and read_more pages it. So a harness reading a child's result.json via
 *   agent.results can receive that child's RAW toolCalls[].result -- and `perform` is not screened by
 *   site A (services only). Live-evidenced; OPEN as register item F9-s7, fix direction there
 *   (serve engine callers a toolCalls-result-stripped result.json -- do NOT add perform to site A;
 *   in-place rewriting corrupts JSON a consumer parses). Evidence:
 *   cline_docs/reviews/f9-r9-rewrite-fact-2026-09-25/sec-ops-f9-s7.md
 *
 *   A DOWNSTREAM FETCH RE-ENTERS SITE A. A stored artifact fetched back into a tool loop THROUGH
 *   `services` (e.g. browser-automation-service reading a published report) is screened at site A
 *   on the way in. Two prior "R9 gap" derivations (2026-07-26, 2026-09-21) missed this step; check
 *   which TOOL delivers the bytes before concluding a path is unscreened.
 *
 *   EXTERNAL clients also receive full content -- Claude Desktop / ChatGPT via
 *   fetch(mcp://artifacts/{id}), and resource reads via embedded-server's getAgentExecutionContent.
 *   Human-supervised, own-tenant, and largely the point of storing it.
 *
 * SO THE RULE IS: R9's scope is decided by whether a path feeds an AUTONOMOUS reasoner, not by
 * whether the bytes are stored or who stored them. If you are adding a tool that returns stored
 * artifact bodies INTO the tool loop, that is a new reasoner-bound path and it belongs in scope --
 * mark it (structural envelope) rather than mutating it: R9 rewrites in place and defangs < > into
 * angle-quotes, which would corrupt first-party JSON a consumer may JSON.parse.
 * 2026-07-26 trace (its agent.results disproof is WRONG, see above):
 *   cline_docs/reviews/r9-option-b-2026-07-26/TRACE-CORRECTION.md
 * Original finding (RE-OPENED 2026-09-25 as F9-s7): cline_docs/follow-ups/r9-artifact-read-trust-laundering-2026-07-26.md
 *
 * MARKER IS ADVISORY (review 2026-06-24, validation I-1): the in-band `[NEUTRALIZED-INJECTION:cat]`
 * string is operator-facing and attacker-spoofable (device output may contain that literal verbatim
 * -- it passes through unchanged). Any consumer / coverage-gate MUST key on the structured
 * `neutralizedInjections[]` / `neutralizedCount`, NEVER on the in-band string.
 *
 * "WAS THIS REWRITTEN?" -- read `rewritten` (F9, 2026-09-25). It is ONE comparison, `text !== raw`,
 * taken at the end of this function before any caller truncates, so it covers every transform,
 * present and future, by construction. `rewriteClasses` says WHICH step changed bytes -- a fact
 * about the transform, never about intent or severity (Protocol 10); attack-vs-cosmetic is decided
 * by the CONSUMERS (the securityEvent gate, the section-6 transport note), not stamped here:
 *   nfkc, zero-width-bidi, ansi, control, quarantine-tag, injection-pattern, emptied
 *   + `unclassified` -- rewritten but no step claimed it: a transform was added OUTSIDE step().
 *     Pinned to 0 (test-security-invariants section I); a non-zero in production is the finding.
 * `nfkc` is NOT guaranteed cosmetic: on the site-A JSON envelope a fullwidth quote/backslash becomes
 * structural (register F9-s1).
 *
 * `sanitized` (both call sites) is LEGACY and FROZEN at its 2026-07-26 meaning --
 * `strippedControlChars > 0 || neutralizedInjections.length > 0`, i.e. classes include any of {zero-width-bidi,
 * control, injection-pattern}. It does NOT mean "rewritten" (NFKC, ANSI, the tag defang and
 * `emptied` are excluded). The 2(e) rule that told consumers to key "rewritten at all" on it was
 * ~3/4 wrong (F9 record: cline_docs/follow-ups/f9-r9-rewrite-facts-2026-09-21.md). Do not widen it:
 * archived rows and injected chainedFrom copies hold this meaning; an equivalence pin fails CI.
 *
 * SITE A CANNOT REACH `ansi`, C0 `control` OR `emptied`: it sanitizes JSON.stringify(toolResult),
 * which escapes U+0000-001F into literal `\u001b` text, and the envelope is never empty. Only
 * DEL/C1, zero-width/bidi, nfkc, quarantine-tag and injection-pattern fire there. A zero for those
 * three classes at site A is a zero BY CONSTRUCTION (register F9-s1 records the evasion consequence).
 *
 * NOTE: control/zero-width chars are expressed as \uXXXX inside RegExp() strings so this
 * source file stays pure-ASCII (no invisible bytes).
 */
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

// Zero-width + bidi controls that hide/obfuscate injection tokens.
const ZERO_WIDTH_BIDI = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF]', 'g');
// C0/C1 controls EXCEPT \t \n \r (legitimate in device config); also mops up any stray ESC (0x1B).
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');
// ANSI/VT escape sequences emitted by device pagers/banners (CSI + OSC). A lone ESC+final
// (e.g. `ESC c` full-reset) has its ESC stripped by CONTROL_CHARS below; the trailing printable
// byte is intentionally left (cosmetic stray char, not a quarantine-breakout vector — sec-ops NTH-1).
const ANSI_CSI = new RegExp('\\u001B\\[[0-9;?]*[ -/]*[@-~]', 'g');
const ANSI_OSC = new RegExp('\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)', 'g');
// Defang the quarantine tag (open AND close), case-insensitive + whitespace-tolerant,
// so device output cannot break out of its <prior_output> block.
const PRIOR_OUTPUT_TAG = /<\s*\/?\s*prior_output\b[^>]*>/gi;
const SINGLE_LT = String.fromCharCode(0x2039); // angle-quote stand-in for '<'
const SINGLE_GT = String.fromCharCode(0x203A); // angle-quote stand-in for '>'

export type RewriteClass =
  | 'nfkc' | 'zero-width-bidi' | 'ansi' | 'control' | 'quarantine-tag'
  | 'injection-pattern' | 'emptied' | 'unclassified';

export interface SanitizeChainedResult {
  text: string;
  strippedControlChars: number;
  neutralizedInjections: Array<{ category: string; match: string }>;
  /** `text !== raw` -- see header. false for non-string / empty input. */
  rewritten: boolean;
  /** Which steps changed bytes, in pipeline order. [] iff !rewritten. */
  rewriteClasses: RewriteClass[];
}

export function sanitizeChainedOutput(raw: string): SanitizeChainedResult {
  if (!raw || typeof raw !== 'string') {
    // Explicit: a naive end comparison would call null/undefined/number "rewritten" ('' !== raw).
    return { text: typeof raw === 'string' ? raw : '', strippedControlChars: 0, neutralizedInjections: [], rewritten: false, rewriteClasses: [] };
  }

  let strippedControlChars = 0;
  const countStrip = (s: string, re: RegExp): string =>
    s.replace(re, (m) => { strippedControlChars += m.length; return ''; });

  // Classification = compare before/after EACH step (never re-run a regex: two are costly on
  // hostile input, register F9-s2). A new transform goes through step(); one added outside it
  // surfaces as `unclassified` below rather than disappearing.
  const classes = new Set<RewriteClass>();
  const step = (cls: RewriteClass, s: string, fn: (x: string) => string): string => {
    const out = fn(s);
    if (out !== s) classes.add(cls);
    return out;
  };

  // 1) NORMALIZE (must precede detect). ORDER AND NFKC ARE LOAD-BEARING -- do not change (F9 record).
  let text = step('nfkc', raw, (x) => x.normalize('NFKC'));
  text = step('zero-width-bidi', text, (x) => countStrip(x, ZERO_WIDTH_BIDI));
  text = step('ansi', text, (x) => x.replace(ANSI_CSI, '').replace(ANSI_OSC, ''));
  text = step('control', text, (x) => countStrip(x, CONTROL_CHARS)); // also removes any leftover ESC
  text = step('quarantine-tag', text, (x) => x.replace(PRIOR_OUTPUT_TAG, (m) => m.replace(/</g, SINGLE_LT).replace(/>/g, SINGLE_GT)));

  // 2) DETECT on the normalized text (positions are valid indices into `text`)
  const { detectedPatterns } = detectPromptInjection(text);

  // 3) NEUTRALIZE in place, right-to-left so indices stay valid; skip overlaps.
  const neutralizedInjections: SanitizeChainedResult['neutralizedInjections'] = [];
  const spans = detectedPatterns
    .map((p) => ({ start: p.position, end: p.position + p.match.length, category: p.category, match: p.match }))
    .filter((s) => s.match.length > 0)
    .sort((a, b) => b.start - a.start);
  let lastStart = Number.POSITIVE_INFINITY;
  for (const s of spans) {
    if (s.end > lastStart) continue; // overlaps an already-neutralized (rightmost) span
    text = text.slice(0, s.start) + `[NEUTRALIZED-INJECTION:${s.category}]` + text.slice(s.end);
    neutralizedInjections.push({ category: s.category, match: s.match });
    lastStart = s.start;
  }

  if (neutralizedInjections.length > 0) classes.add('injection-pattern');

  // EMPTIED: the normalize/strip steps removed every visible character of a non-empty input
  // (a terminal clear-screen, a zero-width-only string). It is NEVER an injection: neutralizing a
  // pattern always leaves a marker, so the text cannot be empty on that path (F9 panel, executed).
  // The in-band label below still says INJECTION -- known-false, kept for now (register F9-s4).
  if (text.trim().length === 0 && raw.trim().length > 0) {
    text = '[NEUTRALIZED-INJECTION:full-block]';
    classes.add('emptied');
  }

  const rewritten = text !== raw;
  if (rewritten && classes.size === 0) classes.add('unclassified');
  const rewriteClasses = PIPELINE_ORDER.filter((c) => classes.has(c));

  return { text, strippedControlChars, neutralizedInjections, rewritten, rewriteClasses };
}

/**
 * The classes that are OPERATOR EVENTS (the pino `securityEvent` warn, both sites). A consumer's
 * judgement, deliberately kept OUT of the stamped fact (Protocol 10). NOT `emptied` (a device
 * clear-screen), NOT the cosmetic strips, and NEVER "any rewrite" (`rewritten` would warn on ~5% of
 * results -- every ellipsis -- and bury the one quarantine-tag firing that matters). F9 panel D.
 */
export const R9_OPERATOR_EVENT_CLASSES: readonly RewriteClass[] = ['quarantine-tag', 'injection-pattern'];

/** Classes that leave a VISIBLE platform mark in the reader's copy (a [NEUTRALIZED-...] marker or an
 *  angle-quoted tag) -- the section-6 transport note keys on these. The rest leave nothing to misread. */
export const R9_VISIBLE_MARK_CLASSES: readonly RewriteClass[] = ['injection-pattern', 'quarantine-tag', 'emptied'];

export function isR9OperatorEvent(classes: readonly string[] | undefined): boolean {
  return !!classes && classes.some((c) => (R9_OPERATOR_EVENT_CLASSES as readonly string[]).includes(c));
}

const PIPELINE_ORDER: RewriteClass[] = [
  'nfkc', 'zero-width-bidi', 'ansi', 'control', 'quarantine-tag', 'injection-pattern', 'emptied', 'unclassified',
];
