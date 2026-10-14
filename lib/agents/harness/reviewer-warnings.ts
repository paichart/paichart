/**
 * REVIEWER WARNINGS — a FACT transcribing every labelled non-blocking warning a QA-gate reviewer wrote.
 *
 * WHY (WARNINGS-INVISIBLE, 2026-10-08). A reviewer can say "this is not blocking, but someone should know"
 * with a line-start `NON-BLOCKING WARNING (<id>): <text>` label (network-provisioning 1.19.0 introduced it).
 * Until now nothing transcribed it: the line lived only in the reviewer's own prose, and nobody who acts on
 * the deliverable — the customer, Node C, the release decision — ever saw it. This module is P1 of the
 * fix: the transcription. The leg-synthesize net `reviewerWarnings` hoists it onto the leg, and the terminal
 * persist renders it into the leg / program `report.md`.
 * Design + panel + audit: cline_docs/reviews/warnings-invisible-2026-10-08/SYNTHESIS.md (v0.3).
 *
 * Protocol 10: a transcription — "the reviewer labelled this line non-blocking" — never a platform judgement
 * about severity. It gates NOTHING (no `approved`, no `blocking[]`, no `qualityGate`, no `programReleasable`).
 *
 * ── GRAMMAR G1 (execution-facts review F4) ───────────────────────────────────────────────────────
 * A line is a warning iff ALL hold:
 *   1. POSITION: wholly before the TERMINAL `## VERDICT:` marker (`locateTerminalVerdict`, the parser's own
 *      rule). That makes warnings disjoint from `blocking[]` by construction — the terminal
 *      `Blocking issues:` list is read only AFTER the marker. There is deliberately NO body-heading scoping:
 *      reviewers write body "Blocking issues …" summaries (16 of 461), and scoping by them would make a real
 *      warning neither blocking nor a warning.
 *   2. Not inside a fenced block (``` / ~~~). Blockquotes (`>`) and table rows (`|`) fall out of the anchor.
 *   3. SHAPE, case-sensitive literal: optional ≤3 spaces · optional `#`-run · ONE optional list marker
 *      (`-` `*` `+` `1.` `1)`) · optional emphasis OR backtick closing before or after the colon (or at line end)
 *      · `NON-BLOCKING WARNING (`
 *      · id `[^()\n]{1,64}` · `)` · `:` · non-empty text.
 *   4. ONE line, one warning — continuation lines are not joined (no corpus to measure a stop rule on).
 *   5. The id is transcribed VERBATIM; whether it is a registered id is the NET's question (it knows the
 *      protocol), never this domain-blind parser's.
 *   6. Duplicates are kept.
 * Permissive on decoration, strict on the literal: a false transcription costs a visible line that literally
 * says NON-BLOCKING WARNING; a missed one costs exactly the failure this module exists to fix.
 *
 * Rejected (each pinned by a fixture): the label QUOTED inline in prose (the 2026-10-06 network reviewer that
 * correctly declined to raise one — the main negative fixture) · `| NON-BLOCKING (unavailable) |` · lower case
 * · empty text · a label under the terminal `Blocking issues:` (stays blocking).
 *
 * ── BOUNDS (mcp-artifacts F7, audit A15) ─────────────────────────────────────────────────────────
 * Text truncated at MAX_WARNING_TEXT_CHARS (`truncated: true`); at most MAX_WARNINGS transcribed, the rest
 * counted in `overflowCount`. Applied HERE so the fact and every render of it agree by construction.
 *
 * ── untranscribedLabelLines (execution-facts F5) ─────────────────────────────────────────────────
 * Lines carrying the case-sensitive literal `NON-BLOCKING WARNING` that G1 did NOT transcribe. It reads 1 on
 * the quote case and on a label written under `Blocking issues:` — the name claims no error. Without it a
 * label written in a rejected shape reads exactly like "no warnings" (the silent-zero class). UNRENDERED
 * diagnostic: MI-13 reads it; it never reaches a card or a report.
 *
 * PURE — text in, transcription out. Called inside `buildExecutionResultJson` beside `computeEvidenceGrading`
 * so dual-path parity is structural. NOT a registry net: it nests on `reviewerVerdict`.
 *
 * @created 2026-10-08
 */

import { locateTerminalVerdict } from './parse-verdict';

/** The literal the protocols write and this parser keys on. Exported so tests and text pins share it. */
export const WARNING_LABEL = 'NON-BLOCKING WARNING';
export const MAX_WARNING_TEXT_CHARS = 1000;
export const MAX_WARNINGS = 20;

export interface ReviewerWarning {
  /** The id between the parentheses, verbatim. */
  id: string;
  /** The rest of the labelled line, verbatim (trailing closing emphasis stripped), bounded. */
  text: string;
  /** Present and true only when `text` was cut at MAX_WARNING_TEXT_CHARS. */
  truncated?: true;
}

export interface ReviewerWarningsFact {
  warnings: ReviewerWarning[];
  /** Lines with the literal label that G1 did not transcribe (see header). */
  untranscribedLabelLines: number;
  /** Present only when more than MAX_WARNINGS lines matched. */
  overflowCount?: number;
}

// G1 shape. Groups: 1 = opening emphasis or backtick (re-used as the optional closer), 2 = id, 3/4 = the closer
// before / after the colon (empty when absent — a backreference to an unset group matches ''), 5 = text.
// The backtick opener (`` `NON-BLOCKING WARNING (id):` text ``) was added 2026-10-08 after the batch-2 lab:
// reviewers wrote it, and G1 lost the warning while untranscribedLabelLines counted it (BATCH2 lab D4).
const G1 =
  /^[ \t]{0,3}(?:#{1,6}[ \t]+)?(?:(?:[-*+]|\d{1,3}[.)])[ \t]+)?(\*\*|__|\*|_|`)?NON-BLOCKING WARNING \(([^()\n]{1,64})\)(\1)?:(\1)?[ \t]+(\S.*)$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

/**
 * Transcribe the labelled non-blocking warnings from a reviewer's response.
 *
 * @param text the reviewer's `finalResponse`
 * @returns the fact; `warnings: []` when the response carries none. Callers nest it only when the
 *          terminal verdict parsed — then `warnings: []` is a positive "checked, none" (three states:
 *          verdict absent / `[]` / `[…]`).
 */
export function computeReviewerWarnings(text: string | null | undefined): ReviewerWarningsFact {
  const src = text ?? '';
  const terminal = locateTerminalVerdict(src);
  // No terminal block ⇒ no position rule ⇒ nothing is transcribed (the caller does not nest it then).
  const body = terminal ? src.slice(0, terminal.index) : '';

  const matched: ReviewerWarning[] = [];
  // Track WHICH fence opened the block (sec-ops F6): a ~~~ line inside a ``` block must not close it.
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = line.match(FENCE);
    if (f) { if (fence === null) fence = f[1]; else if (f[1] === fence) fence = null; continue; }
    if (fence !== null) continue;
    const m = line.match(G1);
    if (!m) continue;
    const closer = m[1];
    // The closer is stripped from the END of the text only when it was not already consumed at the colon —
    // otherwise `` `LABEL (id):` uses `x` `` would lose the backtick closing its own inline code.
    const closedAtColon = Boolean(m[3] || m[4]);
    // trimEnd(), never /\s+$/: the regex is quadratic on long whitespace runs (sec-ops F1).
    let t = m[5].trimEnd();
    if (closer && !closedAtColon && t.endsWith(closer)) t = t.slice(0, -closer.length).trimEnd();
    if (t === '') continue;
    const w: ReviewerWarning = { id: m[2], text: t };
    if (t.length > MAX_WARNING_TEXT_CHARS) { w.text = t.slice(0, MAX_WARNING_TEXT_CHARS); w.truncated = true; }
    matched.push(w);
  }

  let literalLines = 0;
  for (const line of src.split('\n')) if (line.includes(WARNING_LABEL)) literalLines++;

  const fact: ReviewerWarningsFact = {
    warnings: matched.slice(0, MAX_WARNINGS),
    untranscribedLabelLines: Math.max(0, literalLines - matched.length),
  };
  if (matched.length > MAX_WARNINGS) fact.overflowCount = matched.length - MAX_WARNINGS;
  return fact;
}
