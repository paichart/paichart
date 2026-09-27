/**
 * "Did THIS harness execution dispatch a child?" — the server-written fact, and the lost-wakeup self-check
 * built on it. RWF Stage 1, commit A3 (2026-09-26). Plan: cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md
 * §2 A.1b + A.2 (+ §11 I15/I16).
 *
 * WHY A DB FACT, NOT THE TOOL-CALL LOG (four reviews found it independently): a REFUSED `agent.execute`
 * (dependency block, duplicate active execution, a cap) comes back as an `isError` result and the tool loop
 * records it `success: true`, so "a successful agent.execute call" does not mean "an execution was created".
 * And the failure persist carries no tool calls at all. The row below exists ONLY when the chokepoint
 * actually created an execution; `triggeredBy.parentExecutionId` is written server-side from the calling
 * execution (clients cannot forge it), and a claim-lost create is deleted. A refusal therefore can never
 * manufacture the fact — which is what keeps the self-check from looping on its own refusals.
 *
 * Dependency-light: type-only Prisma import, and the reactor is imported at fire time — so the persist
 * module can import this without pulling `@/lib/prisma` into pure-mock persist tests.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { countUnsettledChildren } from './child-stage-settled';

type RawClient = Pick<PrismaClient | Prisma.TransactionClient, '$queryRaw'>;

/**
 * Child task ids in `childStageId` that have an execution created BY `executionId` (an orchestrator dispatch
 * from inside that harness run). `source = 'mcp-direct'` is required because the retrigger reactor ALSO writes
 * `parentExecutionId` (its parent is the harness's previous execution, not a dispatch). Stage-filtered by
 * construction, so a dispatch outside the harness's own child stage never counts.
 */
export async function childTasksDispatchedBy(
  client: RawClient,
  args: { executionId: string; childStageId: string },
): Promise<string[]> {
  const rows = await client.$queryRaw<Array<{ taskId: string }>>`
    SELECT DISTINCT ae."taskId"
    FROM agent_executions ae
    JOIN tasks t ON t.id = ae."taskId"
    WHERE t.stage_id = ${args.childStageId}
      AND ae.context::jsonb -> 'triggeredBy' ->> 'source' = 'mcp-direct'
      AND ae.context::jsonb -> 'triggeredBy' ->> 'parentExecutionId' = ${args.executionId}`;
  return rows.map((r) => r.taskId);
}

type SelfCheckClient = Pick<PrismaClient, '$queryRaw' | 'task'>;

/**
 * Post-commit lost-wakeup self-check for a PIPELINE harness execution (RWF A.2).
 *
 * The retrigger reactor's Guard 6 skips while the harness has an active execution, so a child that settles
 * DURING the harness's own run has its one wakeup swallowed, and nothing re-fires it. After the harness
 * persists, this re-evaluates the harness's child stage through the ordinary reactor (Guards 3.5/4/6/8 all
 * apply; only Guard 7's 30s debounce is bypassed — Steve 2026-09-26: this is a single post-persist event,
 * and BC67 still de-duplicates).
 *
 * Fires when:
 *   - this execution dispatched a child in its own child stage (the DB fact above) — both tails; or
 *   - (success tail only, `resolvedMode` CREATE/ORCHESTRATE) the child stage is already settled: the last
 *     child settled during a non-SYNTHESIZE run. Loop-safe: the next run is SYNTHESIZE, which self-checks
 *     only on the dispatch fact. The failure tail has no resolved mode, so it uses the dispatch fact only —
 *     otherwise a SYNTHESIZE that keeps failing could self-retrigger until Guard 8.
 * Never throws.
 */
export async function maybeSelfCheckLostWakeup(
  db: SelfCheckClient,
  args: { taskId: string; executionId: string; resolvedMode: string | null; tail: 'success' | 'failure' },
  log?: { warn: (o: Record<string, unknown>, m: string) => void; info: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  try {
    const harness = await db.task.findUnique({ where: { id: args.taskId }, select: { type: true, metadata: true } });
    if (harness?.type !== 'PIPELINE') return;
    const childStageId = (harness.metadata as Record<string, unknown> | null)?.pipelineStageId;
    if (typeof childStageId !== 'string') return;

    let fireFor: string | null = null;
    let reason: 'child-dispatched-this-run' | 'stage-settled-during-run' | null = null;
    const dispatched = await childTasksDispatchedBy(db, { executionId: args.executionId, childStageId });
    if (dispatched.length > 0) {
      fireFor = dispatched[0]; reason = 'child-dispatched-this-run';
    } else if (args.tail === 'success' && (args.resolvedMode === 'CREATE' || args.resolvedMode === 'ORCHESTRATE')) {
      const anyChild = await db.task.findFirst({ where: { stageId: childStageId }, select: { id: true } });
      if (anyChild && (await countUnsettledChildren(db, childStageId)) === 0) {
        fireFor = anyChild.id; reason = 'stage-settled-during-run';
      }
    }
    if (!fireFor) return;

    log?.info({ taskId: args.taskId, executionId: args.executionId, childStageId, reason, tail: args.tail },
      'Lost-wakeup self-check: re-evaluating the harness child stage post-persist');
    const { maybeRetriggerPipelineHarness } = await import('./pipelineRetriggerReactorService');
    maybeRetriggerPipelineHarness(fireFor, { bypassDebounce: true }).catch(() => {});
  } catch (err) {
    log?.warn({ taskId: args.taskId, executionId: args.executionId, err: err instanceof Error ? err.message : String(err) },
      'Lost-wakeup self-check failed — non-fatal (a later child event still re-fires the reactor)');
  }
}
