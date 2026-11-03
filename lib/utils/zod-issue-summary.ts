/**
 * Bounded view of a ZodError for logs and client messages (2026-11-03, zod alert #305 P2). zod reports one issue per bad element,
 * so logging or joining ALL of them multiplies an oversized body into memory and response size. Log the first `max` plus the count;
 * the message lists the first `max` and says how many more.
 */
import type { ZodError } from 'zod';

export const ZOD_ISSUE_SUMMARY_MAX = 20;

export function summarizeZodIssues(error: ZodError, max = ZOD_ISSUE_SUMMARY_MAX) {
  const all = error.issues;
  const shown = all.slice(0, max);
  const more = all.length - shown.length;
  const message = shown.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') + (more > 0 ? ` (+${more} more)` : '');
  return { issues: shown, issueCount: all.length, message };
}
