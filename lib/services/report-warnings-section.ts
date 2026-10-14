/**
 * The "Reviewer warnings (non-blocking)" section appended to a leg / program `report.md`
 * (WARNINGS-INVISIBLE, 2026-10-08; SYNTHESIS v0.3 P3, owner decisions O1/O2).
 *
 * PURE. It renders ONLY from the `reviewerWarnings` leg-synthesize stamp already on the persist's resultJson —
 * it never reads a reviewer (no query inside the terminal transaction; agent-execution F2, mcp-artifacts F3).
 * Precedent: the VERDICT banner in `runTerminalSuccessTx`, which likewise transcribes stamped facts onto the
 * artifact and COMMANDS NOTHING (Steve's ruling 2026-08-18). This section follows that ruling: facts only, no
 * directive to any later reader, no outcome claim (audit A4).
 *
 * Rules (each pinned in test-reviewer-warnings-net):
 *   - Renders only when `renderScope` is 'leg-section' or 'program-section' AND there is at least one line (O1).
 *     Otherwise returns the input unchanged — every report without warnings stays BYTE-IDENTICAL.
 *   - A leg section shows only `change_reviewer` lines (O1).
 *   - Lines are `- <id> — <text>`: never the literal `NON-BLOCKING WARNING (` label, so a downstream reviewer that
 *     copies a line cannot have it re-transcribed as its own warning (prompt-construction F2).
 *   - Every rendered string is passed through `sanitizeLLMForMarkdown`, newlines/whitespace collapsed, a leading
 *     `#` stripped, backticks removed from ids (the upstream body is NOT sanitised — see the SEC follow-up — so
 *     the section must not rely on it). The caller appends BEFORE R10 redaction, so R10 covers it too.
 *   - An odd number of fence lines in the body is closed first, so the heading never renders inside a code block.
 *   - The header names the reviewer execution id(s) (prompt-construction F10: an Author can forge a heading; the
 *     execution id and the leg card's `reviewerWarnings` fact are what it cannot forge).
 */

import { sanitizeLLMForMarkdown } from './execution-artifacts';
import { PLATFORM_WARNINGS_HEADING, APPLY_PLACEHOLDER_WARNING_ID } from '@/lib/agents/harness/apply-block-placeholder';

export const WARNINGS_SECTION_HEADING = '## Reviewer warnings (non-blocking)';

type W = { id?: unknown; text?: unknown };
type R = { executionId?: unknown; role?: unknown; warnings?: unknown; overflowCount?: unknown };

// Escape the characters that would let a line become a link, an image or an HTML tag (sec-ops F4): the section is
// plain text by construction, whatever the viewer does.
function escapeInline(s: string): string {
  return s.replace(/[\\[\]<>!]/g, (c) => `\\${c}`);
}
function oneLine(s: string): string {
  return escapeInline(sanitizeLLMForMarkdown(s).replace(/\s+/g, ' ').trim().replace(/^#+\s*/, ''));
}
function safeId(s: string): string {
  return oneLine(s).replace(/`/g, '');
}

function linesOf(r: R): string[] {
  const ws = Array.isArray(r.warnings) ? (r.warnings as W[]) : [];
  const out = ws
    .filter(w => typeof w?.id === 'string' && typeof w?.text === 'string')
    .map(w => `- ${safeId(w.id as string)} — ${oneLine(w.text as string)}`);
  const extra = typeof r.overflowCount === 'number' && r.overflowCount > 0 ? r.overflowCount : 0;
  if (extra) out.push(`- (${extra} more recorded on the leg's \`reviewerWarnings\` fact)`);
  return out;
}

function reviewerBlock(r: R): string[] {
  const lines = linesOf(r);
  if (!lines.length) return [];
  const ex = typeof r.executionId === 'string' ? safeId(r.executionId) : 'unknown';
  return [`Reviewer execution \`${ex}\`:`, ...lines];
}

function closeOpenFence(body: string): string {
  // Track WHICH fence opened the block (sec-ops F6) and close with the same characters. trimEnd(), never /\s*$/:
  // that regex is quadratic on long whitespace runs and runs inside the terminal transaction (sec-ops F1).
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^[ \t]{0,3}(```|~~~)/);
    if (!m) continue;
    if (fence === null) fence = m[1]; else if (m[1] === fence) fence = null;
  }
  return fence !== null ? `${body.trimEnd()}\n${fence}\n` : body;
}

/**
 * @returns the report with the section appended, and how many warning lines were appended (0 ⇒ unchanged).
 */
export function appendReviewerWarningsSection(
  reportMd: string,
  fact: unknown,
): { content: string; appended: number } {
  const f = fact && typeof fact === 'object' ? (fact as Record<string, any>) : null;
  if (!f) return { content: reportMd, appended: 0 };

  let parts: string[] = [];
  let appended = 0;

  if (f.renderScope === 'leg-section') {
    const revs = (Array.isArray(f.reviewers) ? f.reviewers : []).filter((r: R) => r?.role === 'change_reviewer');
    const withLines = revs.filter((r: R) => linesOf(r).length > 0);
    if (!withLines.length) return { content: reportMd, appended: 0 };
    const exIds = withLines.map((r: R) => `\`${typeof r.executionId === 'string' ? safeId(r.executionId) : 'unknown'}\``);
    parts.push(withLines.length === 1
      ? `Lines this leg's reviewer (execution ${exIds[0]}) labelled non-blocking. They are that reviewer's record.`
      : `Lines this leg's reviewers (executions ${exIds.join(', ')}) labelled non-blocking. They are those reviewers' record.`);
    for (const r of withLines) {
      const ls = linesOf(r);
      appended += ls.length;
      parts.push('', ...(withLines.length > 1 ? reviewerBlock(r) : ls));
    }
  } else if (f.renderScope === 'program-section') {
    const groups: string[][] = [];
    for (const leg of Array.isArray(f.legs) ? f.legs : []) {
      const blocks = (Array.isArray(leg?.reviewers) ? leg.reviewers : []).flatMap((r: R) => reviewerBlock(r));
      if (!blocks.length) continue;
      appended += blocks.filter((l: string) => l.startsWith('- ')).length;
      const title = typeof leg.legTitle === 'string' ? oneLine(leg.legTitle) : 'Leg';
      const id = typeof leg.legTaskId === 'string' ? safeId(leg.legTaskId) : 'unknown';
      groups.push([`### ${title} (leg \`${id}\`)`, ...blocks]);
    }
    const nodeC = (Array.isArray(f.reviewers) ? f.reviewers : []).flatMap((r: R) => reviewerBlock(r));
    if (nodeC.length) {
      appended += nodeC.filter((l: string) => l.startsWith('- ')).length;
      groups.push(['### Program integration review', ...nodeC]);
    }
    if (!groups.length) return { content: reportMd, appended: 0 };
    parts.push('Lines the program\'s reviewers labelled non-blocking, by leg. They are those reviewers\' record. They are not inputs to `programReleasable`.');
    for (const g of groups) parts.push('', ...g);
  } else {
    return { content: reportMd, appended: 0 };
  }

  const body = closeOpenFence(reportMd).trimEnd();
  return { content: `${body}\n\n---\n\n${WARNINGS_SECTION_HEADING}\n\n${parts.join('\n')}\n`, appended };
}

// ── Platform warnings (PLACEHOLDER-APPLIES-AS-LITERAL interim guard, 2026-10-13) ───────────────────────────────────

/**
 * Append the "Platform warnings (non-blocking)" section to a LEG report.md when its source Author's own
 * `applyBlockPlaceholder` stamp records a hit (lib/agents/harness/apply-block-placeholder.ts). No stamp, `count: 0`,
 * `checked: false` or a malformed value ⇒ the report is returned unchanged, byte for byte.
 *
 * PLATFORM-written, not a reviewer's record — hence its own heading, not the reviewer section above. The line is
 * `- placeholder-in-apply-block — …`, never the literal reviewer label (`NON-BLOCKING WARNING (`), for the same reason
 * as `linesOf` (prompt-construction F2: a reviewer that copies it must not have it transcribed as its own warning). It
 * names no placeholder spelling: the spelling in a report would self-match every text trigger over report.md. Facts
 * only, commands nothing (the 2026-08-18 banner ruling). The caller appends BEFORE R10, so R10 covers it too.
 */
export function appendApplyBlockPlaceholderSection(
  reportMd: string,
  fact: unknown,
  sourceTaskId: string,
): { content: string; appended: number } {
  const f = fact && typeof fact === 'object' ? (fact as Record<string, unknown>) : null;
  if (!f || f.checked !== true || typeof f.count !== 'number' || !(f.count > 0)) return { content: reportMd, appended: 0 };
  const count = f.count;
  const hits = Array.isArray(f.hits) ? (f.hits as Array<Record<string, unknown>>) : [];
  const where = hits
    .filter((h) => Number.isInteger(h?.line) && typeof h?.role === 'string')
    .map((h) => `line ${h.line} (${String(h.role).replace(/[^a-z-]/g, '')})`);
  const more = count > where.length ? `${where.length ? ', and ' : ''}${count - where.length} more` : '';
  const n = count === 1 ? 'line' : 'lines';
  const line =
    `- ${APPLY_PLACEHOLDER_WARNING_ID} — ${count} ${n} inside a desired-state or rollback block of the change package ` +
    `(Author task \`${safeId(sourceTaskId)}\`) ${count === 1 ? 'carries' : 'carry'} a secret-redaction placeholder: ` +
    `${where.join(', ')}${more}. Line numbers are those of the Author's result.json finalResponse, not of this report ` +
    `(which may drop a preamble and add a banner). A device or tool may accept the placeholder as a ` +
    `literal value, and a passing validation step does not show such a block is safe to apply as written.`;
  const body = closeOpenFence(reportMd).trimEnd();
  return { content: `${body}\n\n---\n\n${PLATFORM_WARNINGS_HEADING}\n\n${line}\n`, appended: 1 };
}
