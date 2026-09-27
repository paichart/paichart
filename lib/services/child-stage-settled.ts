/**
 * childStageSettled — the ONE "is this pipeline's child stage settled?" predicate (RWF Stage 1.1).
 *
 * Every site that asserts "nothing is in flight in a harness's child stage" reads THIS module:
 *   - retrigger Guard 4            (pipelineRetriggerReactorService.ts)
 *   - the harness mode resolver    (harnessModeResolver.ts — SYNTHESIZE iff settled)
 *   - the 4-point invariant pt. 3  (complete-task-terminally.ts, inside the completion tx)
 *   - the F20 escalated-leg count  (execution-terminal-persist.ts, inside the persist tx)
 *   - the dead-end / R4 declines   (execution-terminal-persist.ts, RWF A3)
 * Before RWF these were four hand-written copies and only Guard 4 carried the in-flight (H-6) arm, so a
 * SYNTHESIZE that re-executed a child could be completed, escalated-to-COMPLETED or terminalized FAILED
 * while that child was still running. Plan + reviews: cline_docs/reviews/rwf-stage1-2026-09-26/.
 *
 * A child is UNSETTLED if either arm holds:
 *   (1) NOT TERMINAL — status != COMPLETED AND executionStatus IS DISTINCT FROM 'FAILED'
 *   (2) IN FLIGHT    — it has ANY agent_execution in ACTIVE_EXECUTION_STATUSES, whatever the task status.
 *
 * Arm (2) is deliberately WIDER than Guard 4's original H-6 arm (which required status=COMPLETED).
 * `agentTaskService` inserts the execution row BEFORE its CAS claim sets executionStatus=PENDING, so a
 * FAILED child being re-run is briefly IN_PROGRESS + executionStatus=FAILED + a PENDING row — arm (1)
 * reads that as terminal. Every state the widening adds carries a live PENDING/RUNNING row, i.e. is in
 * flight by definition (verified by event-system, agent-execution and database-manager reviews).
 *
 * `SCHEDULED` executions are deliberately NOT in flight: nothing promotes SCHEDULED → PENDING (the
 * engine poller selects PENDING only), so counting one would turn a dead row into a permanent hang.
 * A non-COMPLETED scheduled child is already unsettled by arm (1) (its create set executionStatus).
 * Callers that report counts surface scheduled rows BY NAME (countScheduledChildren) so the
 * exclusion is never silent.
 *
 * Dependency-light like mark-forward-cone.ts: TYPE-ONLY `@prisma/client` import, never `@/lib/prisma`,
 * so pure-mock persist tests do not transitively instantiate the client.
 *
 * ⚠️ Do NOT re-inline this predicate. `scripts/test-child-stage-settled.ts` source-scans for
 * stage-scoped child counts outside this module and fails on a copy.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The execution statuses that mean "in flight". Shared with the task-ready reactor's upstream
 * settledness arm (taskReadyReactorService.ts upstreamUnsatisfiedCondSql) — the same property.
 */
export const ACTIVE_EXECUTION_STATUSES = ['PENDING', 'RUNNING'] as const;

/**
 * Only `task` is needed (the in-flight arm is a relation filter), so the completion core's narrow
 * `Pick<TransactionClient, 'task' | 'stage' | '$queryRaw'>` client satisfies it without widening.
 */
type SettledClient = Pick<PrismaClient | Prisma.TransactionClient, 'task'>;

/** Prisma `where` for an UNSETTLED child of `stageId` (arm 1 OR arm 2 above). */
export function unsettledChildWhere(stageId: string): Prisma.TaskWhereInput {
  return {
    stageId,
    OR: [
      {
        AND: [
          { status: { not: 'COMPLETED' } },
          // IS DISTINCT FROM 'FAILED' — Prisma's `not` alone would drop NULL executionStatus rows.
          { OR: [{ executionStatus: null }, { executionStatus: { not: 'FAILED' } }] },
        ],
      },
      { executions: { some: { status: { in: [...ACTIVE_EXECUTION_STATUSES] } } } },
    ],
  };
}

/** Number of UNSETTLED children in `stageId`. 0 ⇒ the stage is settled (or empty — check separately). */
export async function countUnsettledChildren(client: SettledClient, stageId: string): Promise<number> {
  return client.task.count({ where: unsettledChildWhere(stageId) });
}

/** Children of `stageId` that currently have a PENDING/RUNNING execution (arm 2 alone), for diagnostics. */
export async function countInFlightChildren(client: SettledClient, stageId: string): Promise<number> {
  return client.task.count({
    where: { stageId, executions: { some: { status: { in: [...ACTIVE_EXECUTION_STATUSES] } } } },
  });
}

/** Children of `stageId` holding a SCHEDULED execution — NOT in flight, reported by name so it is never silent. */
export async function countScheduledChildren(client: SettledClient, stageId: string): Promise<number> {
  return client.task.count({ where: { stageId, executions: { some: { status: 'SCHEDULED' } } } });
}

/**
 * RWF-X4 (2026-09-26): the task ids, among `taskIds`, that live INSIDE a harness. That means the task's
 * stage is some PIPELINE task's `metadata.pipelineStageId`, the same link retrigger Guard 3 walks. This
 * covers a pipeline's children AND a program's legs (a leg is a child of the program root's stage), and
 * excludes a standalone or root harness. Used by reaped-task-persist.ts, where the reason it matters is
 * written out.
 */
type OwnershipClient = Pick<PrismaClient | Prisma.TransactionClient, '$queryRaw'>;

export async function harnessOwnedTaskIds(client: OwnershipClient, taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM tasks c
     WHERE c.id = ANY(${taskIds})
       AND c.stage_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM tasks p
                    WHERE p.type = 'PIPELINE' AND p.id <> c.id
                      AND p.metadata->>'pipelineStageId' = c.stage_id)`;
  return new Set(rows.map((r) => r.id));
}
