/**
 * Reviewer terminal-verdict parser — transcribes the `## VERDICT:` block a QA-gate reviewer is
 * required to END its `finalResponse` with (grammar canonical in the `change_reviewer` entry of
 * ROLE_GUIDANCE_LIBRARY, `pAIchartUniversalTemplate.ts`; the pipeline protocols only REFERENCE it).
 *
 * Protocol 10: the return value is a FACT — "the reviewer's terminal block said X" — a verifiable
 * transcription, never a platform judgment about the change. Fact-framing rules (reviewed 2026-07-14,
 * cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/):
 *   - No block / unrecognized token → `null` (field ABSENT downstream). NEVER default to
 *     `{approved: false}` — that would fabricate a verdict and re-create the false-NEEDS-REVISION
 *     failure this parser exists to prevent.
 *   - `approved` is transcribed from the APPROVED|NEEDS-REVISION token ONLY, and `blocking` from the
 *     `Blocking issues:` line ONLY — independently, never derived from each other. An inconsistent
 *     block ("NEEDS-REVISION" + "Blocking issues: none") is transcribed as-is so the inconsistency
 *     stays VISIBLE instead of being silently normalized.
 *   - LAST `## VERDICT:` match wins (load-bearing: the raise→retract→reassert shape is exactly the
 *     incident that motivated this; mirror of parse-confidence.ts last-match-wins).
 *   - Token set locked to exactly {APPROVED, NEEDS-REVISION} (case-insensitive); anything else → null.
 *
 * PURE — no prisma/logger/`this` coupling; text in, transcription out. Called inside
 * `buildExecutionResultJson` (the canonical builder both execution paths share) gated on
 * REVIEWER_ROLES, so dual-path parity is structural, not maintained-by-discipline.
 *
 * @created 2026-07-14 (harness verdict-misread fix; 3-specialist review)
 */

/** Roles whose finalResponse carries a terminal verdict block. Shared by network / k8s / terraform
 *  pipelines — all three reviewer templates resolve to `change_reviewer` (verified 2026-07-14). */
export const REVIEWER_ROLES = new Set(['change_reviewer']);

/** The literal marker the grammar, the protocols, and this parser all pin. Exported so tests can
 *  assert the role guidance still contains it (three-surface coupling guard). */
export const VERDICT_MARKER = '## VERDICT:';

export interface ReviewerVerdict {
  /** Transcribed from the terminal token: APPROVED → true, NEEDS-REVISION → false. */
  approved: boolean;
  /** Transcribed from the `Blocking issues:` line — `[]` for "none" (or a missing line). */
  blocking: string[];
  /** The terminal block verbatim (ground truth for forensics / mismatch audits). */
  raw: string;
}

/**
 * Parse the reviewer's terminal verdict block from response text.
 *
 * @param text the reviewer's `finalResponse` (may be null/undefined/empty)
 * @returns the transcribed verdict, or `null` when no well-formed terminal block exists
 */
export function parseReviewerVerdict(text: string | null | undefined): ReviewerVerdict | null {
  if (!text) return null;

  // LAST-match-wins on the marker line (case-insensitive on the whole line).
  const verdictLine = /^\s*#{0,6}\s*VERDICT:\s*(.+?)\s*$/gim;
  const matches = [...text.matchAll(verdictLine)]
    // Require the literal `## VERDICT:` shape (any heading level ≥ 2 discouraged but the marker is
    // `##` — accept `##`–`######` to tolerate renderer nesting, reject bare "VERDICT:" prose).
    .filter(m => /^\s*#{2,6}\s*VERDICT:/i.test(m[0]));
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  // Strip WRAPPING markdown only (leading/trailing ** / _ / `) — an inner underscore is part of the
  // token (`needs_revision`).
  const token = last[1].trim().replace(/^[*_`]+|[*_`]+$/g, '').replace(/[.!]+$/, '').trim();

  // Token set locked: exactly APPROVED or NEEDS-REVISION (case-insensitive; tolerate space/underscore
  // for the hyphen). Anything else — including the grammar's own "APPROVED | NEEDS-REVISION"
  // alternation copied verbatim — is NOT a verdict → null.
  let approved: boolean;
  if (/^APPROVED$/i.test(token)) approved = true;
  else if (/^NEEDS[-_ ]REVISION$/i.test(token)) approved = false;
  else return null;

  // Transcribe `Blocking issues:` INDEPENDENTLY from the lines after the verdict line.
  const after = text.slice((last.index ?? 0) + last[0].length);
  const blocking: string[] = [];
  // NB: `[ \t]*` after the colon, NOT `\s*` — `\s` matches `\n` and would swallow the newline,
  // mis-capturing the first bullet line as the inline value.
  const blockingLine = after.match(/^\s*\**Blocking issues\**:[ \t]*(.*)$/im);
  if (blockingLine) {
    const inline = blockingLine[1].trim().replace(/[*_`]+$/g, '').trim();
    if (inline && !/^none\b/i.test(inline)) blocking.push(inline);
    // Itemized form: bullet lines immediately following the `Blocking issues:` line.
    const rest = after.slice((blockingLine.index ?? 0) + blockingLine[0].length);
    for (const line of rest.split('\n')) {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) blocking.push(bullet[1].trim());
      else if (line.trim() !== '') break; // first non-bullet, non-blank line ends the list
    }
  }

  return { approved, blocking, raw: text.slice(last.index ?? 0).trim() };
}
