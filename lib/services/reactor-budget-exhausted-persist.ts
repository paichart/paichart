/**
 * Reactor-budget exhaustion terminalization — RWF Stage 1.7 (A2, 2026-09-26).
 *
 * Guard 8 (pipelineRetriggerReactorService) caps how many times the retrigger reactor may re-enter one
 * harness. Before RWF, hitting the cap was a debug-level skip that left the harness IN_PROGRESS forever —
 * a bound that ended in a HANG, not a terminal state. On a program leg that hung the whole program. This
 * module makes exhaustion TERMINAL, in the shape of the other non-terminal-family members (R4, F16, F17):
 * the harness is marked `executionStatus = 'FAILED'` with an honesty comment, a program LEG's forward cone
 * is marked, and the owning program is retriggered so it can escalate.
 *
 * The decision was made OUTSIDE any transaction (Guards 4/6/7/8 in the reactor), so this transaction
 * RE-ASSERTS its premises before writing (database-manager + event-system reviews):
 *   - the harness's newest execution is still the one Guard 8 counted from (else: a human re-execute
 *     landed in the gap — it resets the generation to 0 — and the budget decision is stale → roll back);
 *   - the harness has no PENDING/RUNNING execution (a live rescue run must never be FAILED + coned —
 *     nothing un-marks a cone);
 *   - the harness is not COMPLETED and not already FAILED (CAS — the idempotency gate; 0 rows = handled).
 * Wrapped in withSerializationRetry: two legs terminalizing concurrently can deadlock on each other's
 * cone (40P01), and the aborted one has no later event to re-fire it.
 *
 * Recovery is a human re-execute: that execution is not a reactor prior, so Guard 8 reads generation 0.
 * Plan: cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §2 A.3.
 */

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { markForwardConeBlocked } from './mark-forward-cone';
import { ACTIVE_EXECUTION_STATUSES } from './child-stage-settled';

const log = mcpLogger.child({ module: 'ReactorBudgetExhausted' });

export type BudgetTier = 'leg' | 'program-root';

export interface BudgetExhaustedInput {
  harnessTaskId: string;
  /** The harness execution Guard 8 read `priorGeneration` from. */
  evaluatedExecutionId: string;
  generation: number;
  budget: number;
  tier: BudgetTier;
  cascadeCompletedTaskId: string;
  /** Author of the honesty comment — the chain's triggering user. */
  commentUserId: string;
}

class StaleBudgetDecision extends Error {
  constructor(readonly newestExecutionId: string | null) { super('stale budget decision'); }
}

export async function handleReactorBudgetExhausted(input: BudgetExhaustedInput): Promise<'terminalized' | 'already-handled' | 'stale'> {
  const now = new Date();
  let marked = false;
  let coneTaskIds: string[] = [];

  try {
    await withSerializationRetry(() => prisma.$transaction(async (tx) => {
      // Premise 1: the generation Guard 8 counted is still the harness's newest execution.
      const newest = await tx.agentExecution.findFirst({
        where: { taskId: input.harnessTaskId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (newest?.id !== input.evaluatedExecutionId) throw new StaleBudgetDecision(newest?.id ?? null);

      // Premises 2+3 in the CAS itself: not COMPLETED, not already FAILED, no live execution.
      const flipped = await tx.task.updateMany({
        where: {
          id: input.harnessTaskId,
          status: { not: 'COMPLETED' },
          OR: [{ executionStatus: null }, { executionStatus: { not: 'FAILED' } }],
          executions: { none: { status: { in: [...ACTIVE_EXECUTION_STATUSES] } } },
        },
        data: { executionStatus: 'FAILED', updatedAt: now },
      });
      if (flipped.count === 0) return; // fixpoint — someone else terminalized it, or a run is live
      marked = true;

      // Row is locked by the CAS above, so this read-then-merge cannot lose a concurrent write.
      const harness = await tx.task.findUnique({
        where: { id: input.harnessTaskId },
        select: { metadata: true, stageId: true, title: true, stage: { select: { name: true } } },
      });
      const meta = (harness?.metadata as Record<string, unknown> | null) ?? {};
      await tx.task.update({
        where: { id: input.harnessTaskId },
        data: {
          metadata: {
            ...meta,
            // Keyed by the execution it was decided from, so a stamp that survives a human recovery
            // cannot read as describing the current run.
            reactorBudgetExhausted: {
              harnessExecutionId: input.evaluatedExecutionId,
              generation: input.generation,
              budget: input.budget,
              tier: input.tier,
              cascadeCompletedTaskId: input.cascadeCompletedTaskId,
              at: now.toISOString(),
            },
          } as any,
        },
      });
      await tx.comment.create({
        data: {
          taskId: input.harnessTaskId,
          userId: input.commentUserId,
          text:
            `⛔ **Re-entry budget exhausted** (\`REACTOR_BUDGET_EXHAUSTED\`).\n\n` +
            `This pipeline was re-entered by the retrigger reactor ${input.generation} times — the ` +
            `${input.tier === 'program-root' ? 'program-root' : 'pipeline'} budget is ${input.budget}. ` +
            `Each re-entry follows a child settling, so this usually means children are being re-run ` +
            `repeatedly. Marked \`executionStatus: FAILED\` so ` +
            (input.tier === 'program-root'
              ? `the program is visibly stopped instead of hanging.`
              : `the owning program (if any) can escalate instead of hanging.`) +
            `\n\nTo retry: re-execute this task — a human re-execute starts a new run and resets the count.`,
          createdAt: now,
        },
      });

      // Program LEG only: its forward cone (Node C, gates, consumer legs) would otherwise re-hang the
      // program one node downstream. A program ROOT and a standalone pipeline are leg-mark only.
      const isProgramLeg = !!harness?.stage?.name?.startsWith('Program: ');
      if (isProgramLeg && harness?.stageId) {
        coneTaskIds = await markForwardConeBlocked(tx, input.harnessTaskId, harness.stageId, {
          reasonCode: 'UPSTREAM_REACTOR_BUDGET_EXHAUSTED',
          reasonPhrase: `exhausted its re-entry budget (${input.generation} of ${input.budget}) and was stopped`,
          failedTitle: harness.title ?? '',
          commentUserId: input.commentUserId,
          now,
        });
      }
    }), 'reactor-budget-exhausted');
  } catch (err) {
    if (err instanceof StaleBudgetDecision) {
      log.info(
        { harnessTaskId: input.harnessTaskId, evaluatedExecutionId: input.evaluatedExecutionId, newestExecutionId: err.newestExecutionId },
        'Budget decision stale (a newer harness execution exists) — not terminalizing'
      );
      return 'stale';
    }
    throw err;
  }

  if (!marked) {
    log.info({ harnessTaskId: input.harnessTaskId }, 'Budget exhaustion already handled, or a harness run is live — no-op');
    return 'already-handled';
  }

  log.warn(
    { harnessTaskId: input.harnessTaskId, generation: input.generation, budget: input.budget, tier: input.tier,
      coneTaskIds, errorCode: 'REACTOR_BUDGET_EXHAUSTED' },
    'Harness re-entry budget exhausted — marked executionStatus=FAILED (+ cone on a program leg); retriggering the owning program'
  );

  // POST-COMMIT: let the owning program (if any) recount and escalate. Guarded; no-op when nothing owns it.
  try {
    const { maybeRetriggerPipelineHarness } = await import('./pipelineRetriggerReactorService');
    maybeRetriggerPipelineHarness(input.harnessTaskId).catch(() => {});
  } catch { /* marking is the durable part */ }

  return 'terminalized';
}
