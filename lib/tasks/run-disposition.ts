/**
 * Run disposition — the missing terminal vocabulary (item 10, 2026-09-15).
 *
 * THE PROBLEM THIS SOLVES. A task's terminal states are COMPLETED and FAILED, and
 * BOTH are claims about the WORK. A run that a human simply decided not to pursue is
 * neither: saying COMPLETED is false, saying FAILED is false (it did not fail — often
 * it correctly refused to proceed). So the only truthful action available was to leave
 * it open, which is what ~100 non-terminal PIPELINE tasks are. **The vocabulary forced
 * the mess**, and anyone tidying it had to lie about an outcome to do it.
 *
 * Measured 2026-09-15: of 100 stopped PIPELINE tasks, 23 waited on an open human gate,
 * 8 carried a halt stamp, and 69 had no machine-readable reason at all — indistinguishable
 * from a genuine hang by any query.
 *
 * WHAT THIS IS, IN PROTOCOL 10 TERMS. `runDisposition` is a **FACT**: it records that a
 * human made a decision, written by that human through the same state channel as
 * `duplicateAcknowledged` (metadata via `task.update`), which is already proven to work.
 * It is NEVER derived. A disposition the platform inferred would be a verdict, and a
 * wrong one would erase a live run from the board — exactly the failure mode Protocol 10
 * exists to stop.
 *
 * SCOPE — PHASE 1 ONLY. This records the decision and lets consumers stop reporting a
 * disposed run as awaiting action. It does **NOT** terminalize the task and does NOT
 * freeze the forward cone: a disposed run still holds its open gates, so approving one
 * later still cascades normally. That is Phase 2 and a bigger decision; ship the fact
 * first and let the data say whether Phase 2 is needed.
 */

/** Why a human stopped pursuing a run. Closed set — a coined state is silently unmatched. */
export type RunDispositionState = 'abandoned' | 'superseded';

export interface RunDisposition {
  state: RunDispositionState;
  /** Free text: why. Required — a disposition with no reason is how the next reader loses the thread. */
  reason: string;
  /** ISO timestamp of the human decision. */
  at: string;
  /** For `superseded`: the stage or task id that replaces this run. */
  supersededBy?: string;
}

const STATES: readonly string[] = ['abandoned', 'superseded'];

/**
 * Read a disposition off task metadata, or null.
 *
 * Deliberately STRICT: a malformed disposition returns null rather than a partial object,
 * so a typo cannot silently mark a live run as disposed. Failing closed here means the
 * worst case is a run that still shows as live — recoverable — instead of one that
 * vanishes from the board.
 */
export function readRunDisposition(metadata: unknown): RunDisposition | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).runDisposition;
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.state !== 'string' || !STATES.includes(d.state)) return null;
  if (typeof d.reason !== 'string' || d.reason.trim() === '') return null;
  if (typeof d.at !== 'string' || d.at.trim() === '') return null;
  return {
    state: d.state as RunDispositionState,
    reason: d.reason,
    at: d.at,
    ...(typeof d.supersededBy === 'string' && d.supersededBy ? { supersededBy: d.supersededBy } : {}),
  };
}

/** True when a human has recorded that this run is no longer being pursued. */
export function isDisposed(metadata: unknown): boolean {
  return readRunDisposition(metadata) !== null;
}
