/**
 * Human-readable "old → new" labels for task activity field-changes.
 *
 * Task field changes are written with `TaskActivity.details = { fieldName, oldValue, newValue,
 * ...names }` (see lib/tasks/services/taskActivityService.ts logFieldChange/logStageChange/
 * logPhaseChange). The activity timelines historically rendered only the `action` string, so a
 * status change showed a generic "Changed status" with no from/to. This helper turns the
 * structured `details` into "Status: OPEN → BLOCKED" etc.
 *
 * Dependency-free on purpose — imported by client components (no prisma/server imports).
 */

export type ActivityChangeDetails = {
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  oldStageName?: string;
  newStageName?: string;
  oldPhaseName?: string;
  newPhaseName?: string;
} | null | undefined;

const show = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '—' : String(v);

/**
 * Build an "old → new" label from an activity's action + details, or null when there is no
 * structured change to render (caller falls back to the raw action string).
 */
export function formatActivityChange(
  action: string,
  details: ActivityChangeDetails
): string | null {
  if (!details) return null;
  const a = (action || '').toLowerCase();
  const field = (details.fieldName || '').toLowerCase();

  // Stage / phase: prefer the human-readable names captured alongside the IDs.
  if (field === 'stage' || a.includes('stage')) {
    const o = details.oldStageName ?? details.oldValue;
    const n = details.newStageName ?? details.newValue;
    if (n !== undefined) return `Stage: ${show(o)} → ${show(n)}`;
  }

  if (field === 'phase' || a.includes('phase')) {
    const o = details.oldPhaseName ?? details.oldValue;
    const n = details.newPhaseName ?? details.newValue;
    if (n !== undefined) return `Phase: ${show(o)} → ${show(n)}`;
  }

  if (field === 'assignee' || a.includes('assign')) {
    if ('oldValue' in details || 'newValue' in details) {
      const o = details.oldValue ?? 'Unassigned';
      const n = details.newValue ?? 'Unassigned';
      return `Assignee: ${show(o)} → ${show(n)}`;
    }
  }

  // Any field carrying old/new — label from fieldName so "status" → "Status" and the
  // POV-level "POV status" renders distinctly from a task's "Status".
  if (details.newValue !== undefined || details.oldValue !== undefined) {
    const label = details.fieldName
      ? details.fieldName.charAt(0).toUpperCase() + details.fieldName.slice(1)
      : a.includes('status')
        ? 'Status'
        : 'Changed';
    return `${label}: ${show(details.oldValue)} → ${show(details.newValue)}`;
  }

  return null;
}
