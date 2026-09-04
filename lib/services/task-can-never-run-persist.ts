/**
 * Task Can-Never-Run Persist — the F16/F13 frozen-cone fix (2026-07-16)
 *
 * Invoked from the `createAgentExecution` chokepoint when `prepareTaskForExecution`
 * throws a typed `CanNeverRunError` (permanent precondition failure, e.g. a
 * pov-program pipeline child whose interface contract is absent — CC7). The throw
 * happens BEFORE any `agent_executions` row exists, so none of the terminal-persist
 * machinery (finding 9) ever fires for this task; without this helper the task sits
 * OPEN/execs:0 forever, its forward cone (dependents) never queues, and the owning
 * program never reaches "all children terminal" — the designed D9 escalation is
 * structurally unreachable (T4b' hang, program cmrm6an89006wyxcyokapxks8).
 *
 * What it does, in ONE transaction (panel: task-dependency Q2 — order is load-bearing):
 *   1. Mark the refused task `executionStatus='FAILED'` (status untouched — the
 *      `workflowEngine.ts:470` OPEN+FAILED idiom) + `metadata.cannotRun` + a comment
 *      naming the reason (F13's GUI signal). IDEMPOTENT: updateMany gated on
 *      executionStatus NOT already FAILED/SUCCESS — 0 rows ⇒ another attempt already
 *      handled it ⇒ return early (no duplicate comments, no duplicate retrigger).
 *   2. Mark its FORWARD CONE terminal: transitive dependents via a stage-scoped,
 *      depth-bounded recursive CTE over task_dependencies (Node C is TWO hops from the
 *      leg — transitive, not direct-only). Each gets `executionStatus='FAILED'` +
 *      `metadata.blockedByUpstreamFailure` + a comment. Filters: status IN
 *      (OPEN, IN_PROGRESS), no PENDING/RUNNING/SUCCESS execution, not already terminal.
 *
 *      D4 gate semantics (deliberate — corrects the panel's belt-and-braces): the walk
 *      is FORWARD-ONLY from the refused task, so a parked upstream plan-approval gate is
 *      structurally unreachable and never marked (the catastrophic false positive). A
 *      template-less gate INSIDE the cone (v1.0.2 pipeline→gate→pipeline topologies) IS
 *      marked: its dependency can never complete, so it can never be meaningfully
 *      released — leaving it OPEN would keep Guard 4 unsatisfied and re-create the exact
 *      hang this module fixes, one gate downstream.
 * Then POST-COMMIT, fire-and-forget: `maybeRetriggerPipelineHarness(taskId)` so the
 * owning program (if any) recounts its children — now all-terminal — and queues
 * SYNTHESIZE, whose step-1 prose escalates on the FAILED children.
 *
 * Sole-writer property (why the cone write is race-safe): the ready-dependents
 * reactor can never queue a cone task, because its SQL requires every upstream
 * status='COMPLETED' and the refused task's STATUS stays OPEN forever.
 *
 * Terminal predicates (retrigger Guard 4 + harnessModeResolver) are deliberately
 * UNTOUCHED — executionStatus='FAILED' is already what both count.
 *
 * @see cline_docs/reviews/f16-frozen-cone-2026-07-16/synthesis.md
 */

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import type { CanNeverRunError } from '@/lib/errors';
import { markForwardConeBlocked } from './mark-forward-cone';

const log = mcpLogger.child({ module: 'TaskCanNeverRunPersist' });

export async function handleCanNeverRunTask(
  taskId: string,
  err: CanNeverRunError,
  commentUserId: string
): Promise<void> {
  return persistCanNeverRun(
    taskId,
    { code: err.code, reasonCode: err.reasonCode, message: err.message },
    commentUserId
  );
}

/**
 * FIX-A (2026-07-18, reactor-cascade audit): the agent-stamped entry point.
 *
 * A harness that bails in its OWN pre-flight (run 9: upstream escalation detected before any
 * child stage existed) stamps `metadata.cannotRun` via task.update on a SUCCESSFUL execution —
 * it never touches the createAgentExecution chokepoint, so the typed-error path above never
 * fires and the stamp was inert data (cone frozen, program unstampable). This entry consumes
 * the stamp at its write path with the SAME idempotent effector. Invariant (ratified
 * 2026-07-18): non-terminal = waiting-for-a-human, always — when the machine knows a task can
 * never run, writing that fact MAKES it terminal.
 */
export async function handleAgentStampedCannotRun(
  taskId: string,
  stampText: string,
  commentUserId: string
): Promise<void> {
  return persistCanNeverRun(
    taskId,
    {
      code: 'TASK_CAN_NEVER_RUN',
      reasonCode: 'AGENT_STAMPED_CANNOT_RUN',
      message: stampText || 'Agent stamped metadata.cannotRun with no further detail.',
    },
    commentUserId,
    { allowFlipFromSuccess: true }
  );
}

async function persistCanNeverRun(
  taskId: string,
  err: { code: string; reasonCode: string; message: string },
  commentUserId: string,
  opts?: { allowFlipFromSuccess?: boolean }
): Promise<void> {
  const now = new Date();
  let markedCone: string[] = [];
  let marked = false;

  await prisma.$transaction(async (tx) => {
    // 1. The refused task. Idempotency gate: only the FIRST refusal writes.
    // allowFlipFromSuccess (FIX-A): a pre-flight-bailing harness ENDS ITS EXECUTION SUCCESS
    // while stamping cannotRun, so the task column reads executionStatus=SUCCESS (run-9 leg:
    // IN_PROGRESS|SUCCESS) — the chokepoint-path gate would no-op on the exact shape the
    // agent-stamped entry exists for. On that path the FAILED check alone carries idempotency,
    // and status != COMPLETED guards against flipping a genuinely finished task.
    const flipped = await tx.task.updateMany({
      where: {
        id: taskId,
        OR: [
          { executionStatus: null },
          { executionStatus: { notIn: opts?.allowFlipFromSuccess ? ['FAILED'] : ['FAILED', 'SUCCESS'] } },
        ],
        ...(opts?.allowFlipFromSuccess ? { status: { not: 'COMPLETED' as const } } : {}),
      },
      data: { executionStatus: 'FAILED', updatedAt: now },
    });
    if (flipped.count === 0) {
      return; // already handled by a prior refusal — fixpoint, write nothing else
    }
    marked = true;

    const legRow = await tx.task.findUnique({
      where: { id: taskId },
      select: { metadata: true, stageId: true, title: true },
    });
    const legMeta = (legRow?.metadata as Record<string, unknown> | null) ?? {};
    await tx.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...legMeta,
          // Preserve an agent-authored cannotRun value (FIX-A path: the agent's own reason
          // text is the better record); write the structured form only when absent.
          cannotRun: legMeta.cannotRun ?? { code: err.code, reasonCode: err.reasonCode, at: now.toISOString() },
          cannotRunPersistedAt: now.toISOString(),
        } as any,
      },
    });
    await tx.comment.create({
      data: {
        taskId,
        userId: commentUserId,
        text:
          `⛔ **Execution refused — task can never run as configured** (\`${err.reasonCode}\`).\n\n` +
          `${err.message.substring(0, 1500)}\n\n` +
          `Marked \`executionStatus: FAILED\` so the owning pipeline/program can escalate instead of hanging (F16).`,
        createdAt: now,
      },
    });

    // 2. Forward cone (transitive dependents, same stage, executable nodes only) — shared walk.
    if (legRow?.stageId) {
      markedCone = await markForwardConeBlocked(tx, taskId, legRow.stageId, {
        reasonCode: err.reasonCode,
        reasonPhrase: 'can never run',
        failedTitle: legRow.title ?? '',
        commentUserId,
        now,
      });
    }
  });

  if (!marked) {
    log.debug({ taskId, reasonCode: err.reasonCode }, 'can-never-run already persisted — no-op');
    return;
  }

  log.warn(
    { taskId, reasonCode: err.reasonCode, coneTaskIds: markedCone, errorCode: 'TASK_CAN_NEVER_RUN' },
    'Task can never run — marked FAILED with forward cone; firing pipeline retrigger for escalation'
  );

  // POST-COMMIT, fire-and-forget (execution-terminal-persist discipline): let the
  // owning harness recount its children and enter SYNTHESIZE to escalate. Internally
  // guarded (Guards 1-8); no-ops when no harness owns this task's stage.
  try {
    const { maybeRetriggerPipelineHarness } = await import('./pipelineRetriggerReactorService');
    maybeRetriggerPipelineHarness(taskId).catch(() => {});
  } catch {
    // Ignore import errors — marking is the durable part; a missed retrigger is
    // recovered by the next sibling-terminal event.
  }
}
