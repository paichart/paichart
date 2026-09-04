/**
 * markForwardConeBlocked — the shared forward-cone walk for the F16/F17/R4 terminalization family.
 *
 * Deliberately dependency-light: it takes a `Prisma.TransactionClient` and uses ONLY `tx.*`, with a
 * TYPE-ONLY `@prisma/client` import (erased at compile). It imports NEITHER `@/lib/prisma` NOR a
 * logger, so a module that pulls in this helper does NOT transitively instantiate the Prisma client
 * at load time. (This lives in its own file precisely so `execution-terminal-persist` can call it
 * without dragging `lib/prisma` into every pure-mock persist test — the CI-transitive-DB trap, es-r4v
 * pre-push flag, 2026-07-16.)
 *
 * Marks the FORWARD CONE of a failed task terminal — transitive same-stage dependents via a
 * depth-bounded recursive CTE over task_dependencies. Each gets `executionStatus='FAILED'` +
 * `metadata.blockedByUpstreamFailure` + a comment. Returns the marked cone task ids.
 *
 * Three callers share it: `handleCanNeverRunTask` (F16 can-never-run), `runTerminalSuccessTx`
 * truncation-stall branch (R4 Layer 2), and `runTerminalSuccessTx` F17 duplicate-halt branch. Without
 * the cone, a failed leg with a same-stage dependent (Node C is two hops from the leg) re-hangs the
 * program ONE node downstream — the F16 lesson.
 *
 * D4 gate semantics (verbatim from F16): FORWARD-ONLY from the failed task, so a parked upstream
 * plan-approval gate is structurally unreachable; a template-less gate INSIDE the cone IS marked (its
 * dependency can never complete). `ORDER BY t.id` gives a deterministic lock order so two concurrent
 * overlapping cone walks cannot deadlock (db-r4v P-DB-1). Sole-writer race safety: the ready-dependents
 * reactor can never queue a cone task (its SQL requires every upstream status='COMPLETED', and the
 * failed task's STATUS stays OPEN/IN_PROGRESS).
 */

import type { Prisma } from '@prisma/client';

/** Depth bound for the cone walk — mirrors GraphLimits.MAX_DEPTH (graph.ts). */
export const MAX_CONE_DEPTH = 20;

export async function markForwardConeBlocked(
  tx: Prisma.TransactionClient,
  failedTaskId: string,
  stageId: string,
  opts: { reasonCode: string; reasonPhrase: string; failedTitle: string; commentUserId: string; now: Date },
): Promise<string[]> {
  const { reasonCode, reasonPhrase, failedTitle, commentUserId, now } = opts;
  const cone = await tx.$queryRaw<Array<{ id: string; title: string }>>`
    WITH RECURSIVE cone AS (
      SELECT td."taskId" AS id, 1 AS depth
      FROM task_dependencies td
      WHERE td."dependsOnId" = ${failedTaskId}
      UNION ALL
      SELECT td."taskId", c.depth + 1
      FROM task_dependencies td
      INNER JOIN cone c ON td."dependsOnId" = c.id
      WHERE c.depth < ${MAX_CONE_DEPTH}
    )
    SELECT DISTINCT t.id, t.title
    FROM tasks t
    INNER JOIN cone c ON t.id = c.id
    WHERE t.stage_id = ${stageId}
      AND t.status IN ('OPEN', 'IN_PROGRESS')
      AND (t."executionStatus" IS NULL OR t."executionStatus" NOT IN ('FAILED', 'SUCCESS'))
      AND NOT EXISTS (
        SELECT 1 FROM agent_executions ae
        WHERE ae."taskId" = t.id AND ae.status IN ('PENDING', 'RUNNING', 'SUCCESS')
      )
    ORDER BY t.id
  `;

  for (const dep of cone) {
    const depRow = await tx.task.findUnique({ where: { id: dep.id }, select: { metadata: true } });
    const depMeta = (depRow?.metadata as Record<string, unknown> | null) ?? {};
    await tx.task.update({
      where: { id: dep.id },
      data: {
        executionStatus: 'FAILED',
        metadata: {
          ...depMeta,
          blockedByUpstreamFailure: {
            failedDependencyTaskId: failedTaskId,
            reasonCode,
            at: now.toISOString(),
          },
        } as any,
        updatedAt: now,
      },
    });
    await tx.comment.create({
      data: {
        taskId: dep.id,
        userId: commentUserId,
        text:
          `⛔ **Blocked by upstream failure** — dependency "${failedTitle}" (\`${failedTaskId}\`) ${reasonPhrase} ` +
          `(\`${reasonCode}\`), so this task is unreachable. Marked terminal so the owning ` +
          `pipeline/program can escalate instead of hanging. This task did NOT itself fail — ` +
          `see \`metadata.blockedByUpstreamFailure\`.`,
        createdAt: now,
      },
    });
  }

  return cone.map((c) => c.id);
}
