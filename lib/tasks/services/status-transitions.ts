/**
 * Task status transition machine — ZERO-dependency module.
 *
 * Extracted verbatim from lib/tasks/services/task.ts (P1-C1, completion-path
 * unification 2026-07-24) so the completion core (complete-task-terminally.ts)
 * can import the validator without importing task.ts (which imports the core
 * once updateTask becomes an adapter — the extraction dissolves that cycle).
 * task.ts re-exports both symbols, so existing importers are unaffected.
 *
 * This module must stay dependency-free apart from `@/lib/errors` — pinned by
 * scripts/test-completion-core-boundary.ts. The real invariant is "nothing that can cycle back
 * into task.ts or the core"; `lib/errors.ts` is itself import-free, so it cannot participate in a
 * cycle, and the pin asserts that leafness so the exemption cannot rot (F4, 2026-07-25).
 */
import { InvalidTransitionError } from '@/lib/errors';

/**
 * Valid task status transitions.
 * OPEN → IN_PROGRESS, BLOCKED
 * IN_PROGRESS → COMPLETED, BLOCKED
 * BLOCKED → IN_PROGRESS (unblock only)
 * COMPLETED → (terminal — no transitions allowed)
 */
export const VALID_TASK_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['COMPLETED', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS'],
  COMPLETED: [],
};

/**
 * Validate that a task status transition is allowed.
 * @throws InvalidTransitionError if the transition is not permitted by the state machine
 * @throws Error if `currentStatus` is not a known status (a programming error, not a user one)
 */
export function validateTaskStatusTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TASK_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`Unknown current task status: "${currentStatus}"`);
  }
  if (!allowed.includes(newStatus)) {
    const allowedStr = allowed.length > 0 ? allowed.join(', ') : 'none (terminal status)';
    // Message text is BYTE-IDENTICAL to the pre-F4 plain Error — the seeded pipeline protocol
    // prompts quote it verbatim to agents. Do not reword without updating
    // scripts/seed-protocol-prompts.ts in the same commit.
    throw new InvalidTransitionError(
      currentStatus,
      newStatus,
      allowed,
      `Invalid task status transition: ${currentStatus} → ${newStatus}. ` +
      `Allowed transitions from ${currentStatus}: ${allowedStr}`
    );
  }
}
