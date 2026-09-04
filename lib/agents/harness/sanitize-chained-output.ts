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
 *   IT DOES NOT COME BACK TO A HARNESS REASONER. perform(action:'agent.results') does not return
 *   artifact content: the results formatter emits a 300-char preview per artifact
 *   (advanced/agent-results-handler.js, "Never dump full content inline"), the embedded server
 *   exposes no artifact-read tool (project/perform/analytics/template/services/registry -- no
 *   `fetch`), and the preview reads the HEAD of result.json while toolCalls is written last.
 *   `verbose:true` raises the cap on the assembled SUMMARY TEXT, not on the artifact.
 *
 *   THE ONE PLACE FULL CONTENT IS SERVED is an EXTERNAL client -- Claude Desktop / ChatGPT via
 *   fetch(mcp://artifacts/{id}), and resource reads via embedded-server's
 *   getAgentExecutionContent. Human-supervised, own-tenant, and largely the point of storing it.
 *
 * SO THE RULE IS: R9's scope is decided by whether a path feeds an AUTONOMOUS reasoner, not by
 * whether the bytes are stored or who stored them. If you are adding a tool that returns stored
 * artifact bodies INTO the tool loop, that is a new reasoner-bound path and it belongs in scope --
 * mark it (structural envelope) rather than mutating it: R9 rewrites in place and defangs < > into
 * angle-quotes, which would corrupt first-party JSON a consumer may JSON.parse.
 * Full trace + disproof: cline_docs/reviews/r9-option-b-2026-07-26/TRACE-CORRECTION.md
 * Original finding (CLOSED): cline_docs/follow-ups/r9-artifact-read-trust-laundering-2026-07-26.md
 *
 * MARKER IS ADVISORY (review 2026-06-24, validation I-1): the in-band `[NEUTRALIZED-INJECTION:cat]`
 * string is operator-facing and attacker-spoofable (device output may contain that literal verbatim
 * -- it passes through unchanged). Any consumer / coverage-gate MUST key on the structured
 * `neutralizedInjections[]` / `neutralizedCount`, NEVER on the in-band string.
 *
 * ...BUT `neutralizedCount` alone answers only "did an INJECTION pattern fire". A normalize-pass
 * strip (zero-width/bidi/C0-C1/ANSI) rewrites the text with neutralizedCount 0, and that is still
 * silent modification of device output. A consumer asking "was this rewritten at all" must key on
 * `strippedControlChars > 0 || neutralizedInjections.length > 0` -- persisted at both call sites as
 * the `sanitized` fact (agentic-tool-loop ToolCallRecord, context-chainer chainedFrom).
 * (Review 2026-07-26, sec-ops finding 2(e): the shorter rule above had a control-char blind spot.)
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

export interface SanitizeChainedResult {
  text: string;
  strippedControlChars: number;
  neutralizedInjections: Array<{ category: string; match: string }>;
}

export function sanitizeChainedOutput(raw: string): SanitizeChainedResult {
  if (!raw || typeof raw !== 'string') {
    return { text: typeof raw === 'string' ? raw : '', strippedControlChars: 0, neutralizedInjections: [] };
  }

  let strippedControlChars = 0;
  const countStrip = (s: string, re: RegExp): string =>
    s.replace(re, (m) => { strippedControlChars += m.length; return ''; });

  // 1) NORMALIZE (must precede detect)
  let text = raw.normalize('NFKC');
  text = countStrip(text, ZERO_WIDTH_BIDI);
  text = text.replace(ANSI_CSI, '').replace(ANSI_OSC, '');
  text = countStrip(text, CONTROL_CHARS); // also removes any leftover ESC
  text = text.replace(PRIOR_OUTPUT_TAG, (m) => m.replace(/</g, SINGLE_LT).replace(/>/g, SINGLE_GT));

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

  // sec-ops I-3: an entirely-injection banner must not collapse to empty (banner-DoS).
  if (text.trim().length === 0 && raw.trim().length > 0) {
    text = '[NEUTRALIZED-INJECTION:full-block]';
  }

  return { text, strippedControlChars, neutralizedInjections };
}
