/**
 * reaped-task-persist: what a REAPER writes to the tasks whose executions it killed (RWF-X4, 2026-09-26).
 *
 * Both reapers call this: the startup orphan cleanup and the periodic stale sweep in
 * agentExecutionEngine.ts. They bypass the terminal persist, so this module decides the task side,
 * inside the reaper's own transaction, after the execution CAS has flipped the row to FAILED.
 *
 * WHY. Until X4 both reapers wrote `executionStatus = null` for every reaped task. For a task inside a
 * harness, null is "not terminal" in the shared settled predicate (child-stage-settled.ts arm 1), so the
 * child stage never settles. Retrigger Guard 4 then declines every wake-up, including the one the reaper
 * fires itself, and the harness hangs with nothing left to wake it. This was hit live on 2026-09-26 at
 * 06:19 UTC, when a deploy's pm2 reload killed a requirements-authoring Author mid-run.
 *
 * THE RULE: a reaped task behaves like a task whose execution FAILED, but only where that is the truth
 * and cannot convert a self-healing state into a worse one (agent-execution review of the first cut,
 * findings F1-F4):
 *
 *   still has a PENDING/RUNNING execution  → untouched. Its live run owns the task's status.
 *   status COMPLETED                       → null, as before. Already settled; FAILED on a COMPLETED task
 *                                            makes SYNTHESIZE step 1 ("any child FAILED ⇒ do not
 *                                            synthesize") abort an approved leg's program (F1).
 *   not harness-owned                      → null, as before. Out of scope.
 *   a harness whose OWN child stage is      → null, as before. Its children are still running and will
 *     still unsettled                        wake it; FAILED would let its program synthesize over live
 *                                            work (F2: a leg's CREATE reaped after dispatching).
 *   otherwise (harness-owned)              → FAILED, plus a comment saying why. A reaped PROGRAM LEG also
 *                                            marks its same-stage forward cone (UPSTREAM_REAPED), the same
 *                                            leg-only cone as REACTOR_BUDGET_EXHAUSTED and R4 (F3a).
 *
 * KNOWN RESIDUAL, shared with an ordinary failure rather than introduced here: a pipeline child that
 * fails with a same-stage DEPENDENT (Author → Reviewer) leaves that dependent OPEN, so its harness still
 * waits for a human re-execute. `runTerminalFailureTx` does exactly the same for a child that simply
 * throws, and 0 harnesses in prod are in that state today (measured 2026-09-26). Pipeline children are
 * deliberately NOT cone-marked: that would also stop a human re-execute of the Author from auto-cascading
 * to the Reviewer, which is the path that recovered the live X4 instance.
 *
 * RACE (F4): the task rows are locked FOR UPDATE, in id order, before the active-execution read. A
 * concurrent re-execute's claim CAS updates the same row, so it serializes behind this write instead of
 * being overwritten by it.
 */

import type { Prisma } from '@prisma/client';
import { harnessOwnedTaskIds, countUnsettledChildren, ACTIVE_EXECUTION_STATUSES } from './child-stage-settled';
import { markForwardConeBlocked } from './mark-forward-cone';

export interface ReapedExecution {
  executionId: string;
  taskId: string;
}

export type ReapedDecision = 'failed' | 'null' | 'untouched-active';

export interface ReapedTaskResult {
  decisions: Record<string, { decision: ReapedDecision; why: string }>;
  failed: string[];
  conedTaskIds: string[];
}

type Tx = Prisma.TransactionClient;

export async function writeReapedTaskStatuses(tx: Tx, reaped: ReapedExecution[], now: Date): Promise<ReapedTaskResult> {
  const result: ReapedTaskResult = { decisions: {}, failed: [], conedTaskIds: [] };
  const taskIds = [...new Set(reaped.map((r) => r.taskId))].sort();
  if (taskIds.length === 0) return result;

  // F4: lock first. Id order gives a deterministic lock order across concurrent reapers.
  await tx.$queryRaw`SELECT id FROM tasks WHERE id = ANY(${taskIds}) ORDER BY id FOR UPDATE`;

  const stillActive = new Set(
    (await tx.agentExecution.findMany({
      where: { taskId: { in: taskIds }, status: { in: [...ACTIVE_EXECUTION_STATUSES] } },
      select: { taskId: true },
    })).map((r) => r.taskId),
  );
  const tasks = await tx.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true, type: true, status: true, stageId: true, metadata: true,
      stage: { select: { name: true } }, pov: { select: { ownerId: true } } },
  });
  const owned = await harnessOwnedTaskIds(tx, taskIds);

  const toNull: string[] = [];
  for (const t of tasks) {
    const decide = (decision: ReapedDecision, why: string) => { result.decisions[t.id] = { decision, why }; };
    if (stillActive.has(t.id)) { decide('untouched-active', 'another execution is in flight'); continue; }
    if (t.status === 'COMPLETED') { decide('null', 'already COMPLETED (settled)'); toNull.push(t.id); continue; }
    if (!owned.has(t.id)) { decide('null', 'not inside a harness'); toNull.push(t.id); continue; }
    const ownStage = (t.metadata as Record<string, unknown> | null)?.pipelineStageId;
    if (t.type === 'PIPELINE' && typeof ownStage === 'string' && ownStage
        && (await countUnsettledChildren(tx, ownStage)) > 0) {
      decide('null', 'a harness whose own children are still running; they will wake it');
      toNull.push(t.id);
      continue;
    }
    decide('failed', 'harness-owned; FAILED so its harness can settle and re-enter');
    result.failed.push(t.id);
  }

  if (toNull.length > 0) {
    await tx.task.updateMany({ where: { id: { in: toNull } }, data: { executionStatus: null, updatedAt: now } });
  }
  if (result.failed.length === 0) return result;

  await tx.task.updateMany({ where: { id: { in: result.failed } }, data: { executionStatus: 'FAILED', updatedAt: now } });

  // A comment on each FAILED task, authored by whoever triggered the reaped run, else the POV owner (a
  // real user, so the comment FK and the leg cone never depend on resolving triggeredBy).
  const execFor = new Map(reaped.map((r) => [r.taskId, r.executionId]));
  const ctxRows = await tx.agentExecution.findMany({
    where: { id: { in: result.failed.map((id) => execFor.get(id)!).filter(Boolean) } },
    select: { taskId: true, context: true },
  });
  const userFor = new Map<string, string>();
  for (const r of ctxRows) {
    const id = ((r.context as Record<string, unknown> | null)?.triggeredBy as Record<string, unknown> | undefined)?.id;
    if (typeof id === 'string' && id) userFor.set(r.taskId, id);
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const taskId of result.failed) {
    const t = byId.get(taskId)!;
    const userId = userFor.get(taskId) ?? t.pov?.ownerId ?? null;
    if (userId) {
      await tx.comment.create({
        data: {
          taskId, userId, createdAt: now,
          text: `⛔ **Execution killed before it finished** (process restart or a hang past the watchdog).\n\n`
            + `Marked \`executionStatus: FAILED\` so the pipeline that owns this task can see it has stopped, `
            + `rather than waiting for it forever. To retry: re-execute this task.`,
        },
      });
    }
    const isProgramLeg = t.type === 'PIPELINE' && !!t.stage?.name?.startsWith('Program: ');
    if (isProgramLeg && t.stageId && userId) {
      result.conedTaskIds.push(...await markForwardConeBlocked(tx, taskId, t.stageId, {
        reasonCode: 'UPSTREAM_REAPED',
        reasonPhrase: 'was killed before it finished (process restart or a hang past the watchdog)',
        failedTitle: t.title ?? '',
        commentUserId: userId,
        now,
      }));
    }
  }
  return result;
}
