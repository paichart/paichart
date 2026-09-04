/**
 * Shared per-task execution retention policy (Flip 2 Increment 2, 2026-07-06).
 *
 * ONE status-aware selection algorithm, called by BOTH pruners with different budgets:
 *   - prune-on-complete (execution-terminal-persist.ts) → PRUNE_ON_COMPLETE_RETENTION (the in-tx cap)
 *   - resourceManager.cleanupArtifactsByTask           → RM_DAILY_RETENTION (the daily settle)
 * Share the LOGIC, parameterize the NUMBERS — a single shared constant can't span 10/10 vs 4/4, and the
 * drift-prone thing is the algorithm (the status-blind vs status-aware bug), not the tunable count.
 *
 * Pure — no Prisma, no I/O — so it's unit-testable without a DB (test:execution-retention).
 */

export interface RetentionBudget {
  /** max SUCCESS executions retained per task */
  maxSuccess: number;
  /** max FAILED executions retained per task */
  maxFailed: number;
}

/** In-transaction prune-on-complete cap (rich in-session history; the immediate bloat ceiling). */
export const PRUNE_ON_COMPLETE_RETENTION: RetentionBudget = { maxSuccess: 10, maxFailed: 10 };

/** Daily midnight settle (the steady-state retention the RM enforces once per day). */
export const RM_DAILY_RETENTION: RetentionBudget = { maxSuccess: 4, maxFailed: 4 };

export interface RetentionExecRow {
  id: string;
  /** ExecutionStatus as stored (String). Only SUCCESS/FAILED count toward the budget. */
  status: string | null;
  /** keep-best marker — a non-null value means this SUCCESS row was superseded by a better one. */
  supersededById: string | null;
  createdAt: Date;
}

/**
 * Status-aware retention: given a task's executions, return the ids to DELETE to enforce the budget.
 *
 * Safety properties (this is why the algorithm is shared, not just the numbers):
 *  - **Non-terminal never deleted**: RUNNING/PENDING/other in-flight rows are excluded from BOTH budgets, so a
 *    live or queued execution can NEVER evict a terminal deliverable (the status-blind bug: the old RM sweep
 *    ranked status-blind and could keep newer FAILED/RUNNING rows while deleting the authoritative SUCCESS).
 *  - **SUCCESS keep-best inversion (I-PRUNE-1)**: within the SUCCESS budget, non-superseded winners are retained
 *    before superseded losers (then recency), so a newer superseded sibling never deletes the authoritative winner.
 *  - **Separate SUCCESS / FAILED budgets**: a burst of failures can't push out good deliverables and vice-versa.
 *
 * FAILED rows rank by recency only (supersededById is a SUCCESS concept). Order of the returned ids is not
 * significant. Input order is irrelevant — the function sorts by createdAt itself (robust to caller query order).
 */
export function selectExecutionsToDelete(execs: RetentionExecRow[], budget: RetentionBudget): string[] {
  const recencyDesc = (a: RetentionExecRow, b: RetentionExecRow) => b.createdAt.getTime() - a.createdAt.getTime();

  const success = execs.filter((e) => e.status === 'SUCCESS').sort((a, b) => {
    const aSup = a.supersededById ? 1 : 0;
    const bSup = b.supersededById ? 1 : 0;
    if (aSup !== bSup) return aSup - bSup; // non-superseded first (retained preferentially)
    return recencyDesc(a, b);              // then most-recent first
  });
  const failed = execs.filter((e) => e.status === 'FAILED').sort(recencyDesc);

  return [
    ...success.slice(budget.maxSuccess),
    ...failed.slice(budget.maxFailed),
  ].map((e) => e.id);
}

/**
 * Milliseconds from `now` until the next 00:00:00 UTC. Pure (testable with a fixed clock). Used to re-arm the
 * daily cleanup at clock-midnight instead of a drifting `setInterval(24h)` (which re-phases on every restart).
 * UTC by decision (2026-07-06) — DST-free by construction, so no timezone helper needed.
 */
export function msUntilNextMidnightUTC(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return next - now.getTime();
}
