/**
 * Task Ready Reactor Service
 *
 * Orchestration Reactor — event-driven automation loop-closure service.
 * File name follows the `<domain>ReactorService.ts` convention so all reactors
 * are grep-findable: `find lib/services -name '*ReactorService.ts'`.
 *
 * @see .claude/knowledge/patterns/orchestration-reactor-pattern.md (Pattern #46)
 * @see .claude/knowledge/domain/harness/automation-loop-closure-architecture.md
 *
 * Purpose:
 *   When a task becomes runnable — i.e., it's OPEN, has an agentTemplateId,
 *   and all of its task-dependency blockers are now in a terminal state —
 *   automatically queue a PENDING agent_execution row so the engine's
 *   existing poller picks it up and executes it.
 *
 *   This closes the final gap in the Pipeline Harness v3 architecture: the
 *   harness creates child tasks with dependencies wired at task.create time
 *   and exits. Without an auto-executor, those children would sit as OPEN
 *   forever. This reactor makes the harness's "exit after CREATE" promise
 *   actually deliver children that run.
 *
 * Scope — when to fire:
 *   1. A task transitions to COMPLETED → scan the same stage for OPEN tasks
 *      whose remaining dependencies all just became COMPLETED, queue them.
 *   2. A task transitions to executionStatus=FAILED → DO NOT auto-run its
 *      dependents. A failed upstream leaves downstream tasks non-runnable
 *      until a human or the harness decides what to do.
 *
 * Loop guards:
 *   1. Task must be OPEN (not IN_PROGRESS / COMPLETED / BLOCKED).
 *   2. Task must have an agentTemplateId (we don't know how to run it otherwise).
 *   3. ALL direct dependencies must be status=COMPLETED (failed upstream
 *      means downstream is not eligible — see "Scope" note above).
 *   4. No existing PENDING or RUNNING execution for the task (don't stack).
 *   5. Debounce: skip if an execution was created for this task within the
 *      last 30 seconds (absorbs near-simultaneous upstream completions).
 *
 * Called from:
 *   - lib/services/agentExecutionEngine.ts (after successful task COMPLETED tx)
 *   - lib/mcp/tasks/action/handlers/task/task-complete-handler.ts
 *     (after task COMPLETED via MCP task.complete)
 *
 * Fire-and-forget: never throws. All internal errors are caught and logged.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { mcpLogger } from '@/lib/logger';
import { buildRichExecutionConfig, resolveTriggeredByFromParent } from './agentExecutionConfigBuilder';
import { createAgentExecution } from './agent-execution-create';
import { CanNeverRunError, DuplicateActiveExecutionError } from '@/lib/errors';
import { logReactorDuplicateSkip } from './reactor-skip-counter';

const log = mcpLogger.child({ module: 'TaskReadyReactor' });

const DEBOUNCE_MS = 30_000;

/**
 * Shared SQL predicate: EXISTS-true when the task identified by `taskIdExpr`
 * has at least one UNSATISFIED dependency. Used by BOTH reactors (dep-completion
 * scan and the create/assign born-ready check — gap (e), 2026-07-18) so the
 * definition of "satisfied" can never drift between them.
 *
 * A dependency is unsatisfied when the upstream is not COMPLETED, OR:
 * F18 settledness (2026-07-16): a PIPELINE upstream is COMPLETED-but-UNSETTLED
 * between its mid-SYNTHESIZE task.complete and its terminal persist committing
 * report.md (~13s window, T4e run #1: producer chained a stale pre-completion
 * snapshot queued by a SIBLING's persist-time fire — finding-9's deferral only
 * guards the completing task's own fire). Treat such an upstream as unsatisfied.
 * Release valves: the straggler's own terminal persist re-fires the dep-completion
 * reactor (engine path), and the 20-min zombie sweep re-fires on a flip — a
 * lingering RUNNING row delays (bounded), never strands. NOTE the shared finding-9
 * assumption: the re-fire exists on the ENGINE path only (stream fireReactors=OFF);
 * program legs run engine-path by construction.
 * See cline_docs/reviews/nonterminal-family-2026-07-16/synthesis.md (F18).
 *
 * @param taskIdExpr - SQL expression for the dependent task's id: a column
 *   reference (Prisma.sql`t.id`) or a parameterized value (Prisma.sql`${taskId}`).
 */
function unsatisfiedDepExistsSql(taskIdExpr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM task_dependencies d2
    INNER JOIN tasks upstream ON upstream.id = d2."dependsOnId"
    WHERE d2."taskId" = ${taskIdExpr}
      AND ${upstreamUnsatisfiedCondSql()}
  )`;
}

/**
 * The per-upstream "unsatisfied" condition, factored so the EXISTS predicate
 * above and the diagnostic listing below can never drift (P1-C1, completion-path
 * unification 2026-07-24). Expects the upstream task row aliased `upstream`.
 */
function upstreamUnsatisfiedCondSql(): Prisma.Sql {
  return Prisma.sql`(
        upstream.status != 'COMPLETED'
        OR (
          upstream.type = 'PIPELINE'
          AND EXISTS (
            SELECT 1 FROM agent_executions ae2
            WHERE ae2."taskId" = upstream.id
              AND ae2.status IN ('PENDING', 'RUNNING')
          )
        )
      )`;
}

/**
 * Exported wrapper over the module-private predicate (P1-C1): "does this task
 * have at least one unsatisfied dependency?" — the completion dep-guard's
 * entry point (complete-task-terminally.ts). Takes any client with $queryRaw
 * (tx or bare prisma) so the guard runs inside the caller's transaction.
 * The SQL stays single-source in this module — never copy it.
 */
export async function hasUnsatisfiedDeps(
  taskId: string,
  client: Pick<typeof prisma, '$queryRaw'>
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ unsatisfied: boolean }>>(
    Prisma.sql`SELECT ${unsatisfiedDepExistsSql(Prisma.sql`${taskId}`)} AS unsatisfied`
  );
  return rows[0]?.unsatisfied === true;
}

/** One unsatisfied upstream dependency, for typed guard errors (facts only). */
export interface UnsatisfiedDep {
  dependsOnId: string;
  title: string;
  status: string;
  /** true = F18: upstream PIPELINE is COMPLETED but its execution is still PENDING/RUNNING (unsettled). */
  unsettledPipeline: boolean;
}

/**
 * Exported diagnostic listing (P1-C1): the concrete unsatisfied dependencies
 * behind a `hasUnsatisfiedDeps` true — carried as FACTS in
 * DependencyNotSatisfiedError. Shares upstreamUnsatisfiedCondSql with the
 * predicate, so the two cannot disagree.
 */
export async function listUnsatisfiedDeps(
  taskId: string,
  client: Pick<typeof prisma, '$queryRaw'>
): Promise<UnsatisfiedDep[]> {
  return client.$queryRaw<UnsatisfiedDep[]>(
    Prisma.sql`
      SELECT upstream.id AS "dependsOnId",
             upstream.title,
             upstream.status,
             (upstream.type = 'PIPELINE' AND EXISTS (
               SELECT 1 FROM agent_executions ae2
               WHERE ae2."taskId" = upstream.id
                 AND ae2.status IN ('PENDING', 'RUNNING')
             )) AS "unsettledPipeline"
      FROM task_dependencies d2
      INNER JOIN tasks upstream ON upstream.id = d2."dependsOnId"
      WHERE d2."taskId" = ${taskId}
        AND ${upstreamUnsatisfiedCondSql()}
    `
  );
}

/**
 * Called after a task transitions to COMPLETED. Scans the same stage for any
 * OPEN task whose dependencies are now fully satisfied and queues a PENDING
 * execution for each one.
 *
 * Safe to call fire-and-forget — all errors caught and logged internally.
 * Never throws (never blocks the caller's flow).
 *
 * @param completedTaskId - Task that just transitioned to COMPLETED
 */
export async function maybeQueueReadyDependents(completedTaskId: string): Promise<void> {
  try {
    // Load the completed task to get its stage and confirm it's really completed.
    const completed = await prisma.task.findUnique({
      where: { id: completedTaskId },
      select: { id: true, stageId: true, status: true },
    });

    if (!completed?.stageId) {
      // FIX-C (2026-07-18): info-level with reason — these silent returns made the run-7
      // cascade-miss undiagnosable post-hoc ("the event fired into silence").
      log.info({ completedTaskId, reason: 'no-stage-or-missing-task' }, 'Reactor skipped');
      return;
    }
    if (completed.status !== 'COMPLETED') {
      // This reactor only fires on actual completions. Failed-but-executionStatus
      // paths are explicitly out of scope (see header — failed upstream means
      // downstream is ineligible until human decides). NOTE: this also catches a fire
      // that raced the caller's status-commit — if seen with a near-simultaneous
      // completion, that IS the race (FIX-C observability).
      log.info(
        { completedTaskId, statusSeen: completed.status, reason: 'not-completed-at-read' },
        'Reactor skipped'
      );
      return;
    }

    // Find all OPEN tasks in the same stage that depend (directly or via
    // task_dependencies) on the just-completed task. Those are the ones whose
    // state might have just changed.
    //
    // We use a single SQL query to (a) find dependents, (b) check their own
    // status, template, and active-execution state, and (c) check all their
    // deps are terminal. Simpler than N separate queries per dependent.
    // Column naming note: Prisma uses @map() on some columns and not others.
    // `stage_id` is @map'd (snake_case), but `agentTemplateId`, `taskId`,
    // `dependsOnId`, `createdAt` are NOT @map'd — they live in Postgres with
    // their camelCase names and require double quotes in raw SQL. Check
    // prisma/schema.prisma before adding new column references here.
    const dependents = await prisma.$queryRaw<
      Array<{ id: string; title: string; agentTemplateId: string | null; stageId: string | null; assigneeId: string | null }>
    >`
      SELECT t.id, t.title, t."agentTemplateId", t.stage_id AS "stageId", t.assignee_id AS "assigneeId"
      FROM tasks t
      INNER JOIN task_dependencies dep ON dep."taskId" = t.id
      WHERE dep."dependsOnId" = ${completedTaskId}
        AND t.stage_id = ${completed.stageId}
        AND t.status = 'OPEN'
        AND t."agentTemplateId" IS NOT NULL
        AND t."executionStatus" IS DISTINCT FROM 'FAILED'::"ExecutionStatus"
        -- Unsatisfied-dep predicate is shared with the born-ready check —
        -- see unsatisfiedDepExistsSql (carries the F18 settledness clause).
        AND NOT ${unsatisfiedDepExistsSql(Prisma.sql`t.id`)}
        AND NOT EXISTS (
          SELECT 1 FROM agent_executions ae
          WHERE ae."taskId" = t.id
            AND ae.status IN ('PENDING', 'RUNNING')
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_executions ae
          WHERE ae."taskId" = t.id
            AND ae."createdAt" >= ${new Date(Date.now() - DEBOUNCE_MS)}
        )
    `;

    if (dependents.length === 0) {
      // FIX-C (2026-07-18): promoted debug→info. This is the load-bearing skip — a guarded
      // SQL miss here at info level would have answered the run-7 cascade-miss in minutes.
      log.info(
        { completedTaskId, stageId: completed.stageId, reason: 'no-ready-dependents' },
        'Reactor skipped: no dependents in this stage became runnable'
      );
      return;
    }

    // Queue PENDING executions for each newly-ready dependent. The engine's
    // processPendingExecutions poller (10s) will pick them up.
    for (const dep of dependents) {
      try {
        // A5: resolve triggeredBy from the parent PIPELINE's original
        // triggerer (task #85). Tri-state policy: parent found + valid →
        // propagate; no parent → assignee fallback (legitimate non-harness);
        // parent found + malformed → skip queue loud.
        const triggeredBy = await resolveTriggeredByFromParent(
          { id: dep.id, stageId: dep.stageId, assigneeId: dep.assigneeId },
          'reactor-task-ready'
        );
        if (!triggeredBy) {
          log.warn(
            { taskId: dep.id, completedTaskId },
            'Skipping queue: resolveTriggeredByFromParent returned null (parent malformed or no assignee)'
          );
          continue;
        }

        // Rich config via shared helper — same shape as engine path so GUI
        // Monitoring tab and analytics render consistently.
        const built = await buildRichExecutionConfig(dep.id, {
          triggerSource: 'task-ready-reactor',
          extraConfigKeys: {
            autoQueued: true,
            reason: 'dependencies-satisfied',
          },
        });
        if (!built) {
          log.warn(
            { taskId: dep.id, completedTaskId },
            'Skipped queuing: buildRichExecutionConfig returned null (task/template load failed)'
          );
          continue;
        }

        // Write via canonical wrapper (task #85 E2/E3). Wrapper validates
        // triggeredBy shape + fires forensic audit entry. L3 (2026-04-18):
        // throws DuplicateActiveExecutionError if the partial UNIQUE index
        // rejects a concurrent duplicate create — silent no-op on that case.
        try {
          const { execution } = await createAgentExecution({
            taskId: dep.id,
            agentTemplateId: built.taskAgentTemplateId,
            status: 'PENDING',
            config: built.config,
            triggeredBy,
            contextExtras: { upstreamCompletedTaskId: completedTaskId },
            logs: [`Auto-queued by task-ready reactor (upstream ${completedTaskId} completed)`],
          });

          log.info(
            {
              taskId: dep.id,
              taskTitle: dep.title,
              executionId: execution.id,
              triggeredBy: completedTaskId,
            },
            'Task auto-queued for execution — dependencies satisfied'
          );
        } catch (innerErr) {
          if (innerErr instanceof DuplicateActiveExecutionError) {
            logReactorDuplicateSkip('task-ready-depcompletion', {
              taskId: dep.id,
              existingExecutionId: innerErr.existingExecutionId,
              upstreamCompletedTaskId: completedTaskId,
            });
            continue;
          }
          throw innerErr;
        }
      } catch (err) {
        // F16 (2026-07-16): a typed PERMANENT refusal (CanNeverRunError, e.g. CC7
        // INTERFACE_CONTRACT_MISSING). The chokepoint already marked the task +
        // forward cone executionStatus=FAILED and fired the program retrigger —
        // this catch only narrates. Distinct from the transient warn below, which
        // stays retryable (task left OPEN).
        if (err instanceof CanNeverRunError) {
          log.warn(
            { taskId: dep.id, reasonCode: err.reasonCode, triggeredBy: completedTaskId, errorCode: 'TASK_CAN_NEVER_RUN' },
            'Dependent can never run — marked FAILED at the create chokepoint; owning pipeline/program will escalate (continuing with others)'
          );
          continue;
        }
        // Log per-task failure but don't abort others. Pre-L3 a unique-constraint
        // race would land here; post-L3 the typed catch above handles that case,
        // so anything reaching here is a different failure (BoundaryContractViolation,
        // network, etc.) and should log.
        log.warn(
          { err, taskId: dep.id, triggeredBy: completedTaskId },
          'Failed to queue execution for ready dependent (continuing with others)'
        );
      }
    }
  } catch (err) {
    // Never throw — reactor is best-effort. Log and move on.
    log.error(
      { err, completedTaskId },
      'Task-ready reactor failed (non-fatal — caller completion unaffected)'
    );
  }
}

/**
 * Called after a pipeline child stage is populated with new tasks (e.g., by
 * the Pipeline Harness in CREATE mode) to fire the initial wave of executions
 * for tasks that have no dependencies — and, since the gap (e) fix
 * (2026-07-18), for non-PIPELINE "born-ready" tasks whose dependencies were
 * ALL already satisfied at create/assign time (satisfaction judged by the
 * same shared predicate the dep-completion reactor uses).
 *
 * Without this, a harness that correctly exits after CREATE would leave all
 * children OPEN — the first wave has no upstream COMPLETED event to trigger
 * maybeQueueReadyDependents, so they'd sit forever. Likewise a born-ready
 * task has no FUTURE upstream completion to fire the dep-completion reactor.
 *
 * Call sites:
 *   - lib/mcp/tasks/action/handlers/task/task-create-handler.ts (per task, after
 *     atomic create + dependency wiring). Idempotent per task: if the task
 *     already has an execution, no-op. So calling on every task.create is safe.
 *
 * Fire-and-forget.
 *
 * @param taskId - Task that was just created (may or may not be dep-free)
 */
export async function maybeQueueIfDepFree(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        type: true,             // gap (e): PIPELINE keeps the blanket has-deps skip (CC6)
        executionStatus: true,  // 2026-04-18 (L2): for race-guard check
        agentTemplateId: true,
        stageId: true,
        assigneeId: true,
        _count: { select: { dependencies: true } },
      },
    });

    if (!task) return;
    if (task.status !== 'OPEN') return;
    if (!task.agentTemplateId) return;

    // Gap (e) fix (2026-07-18): born-ready tasks. A task CREATED (or assigned a
    // template) with all dependencies ALREADY satisfied was queued by NO event —
    // the old blanket has-deps skip here waited for a dep-completion trigger that
    // will never fire (that reactor only fires on FUTURE completions; run-10 live:
    // gates released while PLAN-SPAWN was still creating the roster). Replace the
    // blanket skip with the dep-completion reactor's own satisfaction predicate
    // (shared unsatisfiedDepExistsSql — includes the F18 settledness clause).
    //
    // PIPELINE tasks keep the blanket skip: per CC6 / L1 (agent-execute race,
    // 2026-04-18 §L1) the ONLY auto-start path for a PIPELINE child is the
    // dep-completion reactor — the program plan-gate design derives from this
    // (seed-protocol-prompts.ts pov-program header). Operator recovery for a
    // born-ready PIPELINE stays explicit agent.execute.
    //
    // Deliberate divergences from the dep-completion SCAN's dependent-guards
    // (2026-07-18 review, task-dependency A1/A2 — choices, not omissions):
    // this path does NOT refuse a dependent with executionStatus=FAILED
    // (unreachable on create; on assign it matches pre-existing dep-free
    // behavior, and re-running a FAILED task on template re-assign is
    // desirable), and it judges the task's own deps regardless of stage
    // (same-stage scoping is a property of the completion CASCADE, not of
    // satisfaction — a born-ready task with satisfied cross-stage deps would
    // otherwise strand).
    let bornReady = false;
    if (task._count.dependencies > 0) {
      if (task.type === 'PIPELINE') {
        log.info(
          { taskId, reason: 'pipeline-with-deps' },
          'Reactor skipped: PIPELINE with deps only starts via dep-completion reactor (CC6)'
        );
        return;
      }
      const rows = await prisma.$queryRaw<Array<{ hasUnsatisfied: boolean }>>(
        Prisma.sql`SELECT ${unsatisfiedDepExistsSql(Prisma.sql`${taskId}`)} AS "hasUnsatisfied"`
      );
      if (rows[0]?.hasUnsatisfied !== false) {
        // Normal case: deps not yet satisfied — the dep-completion reactor owns it.
        log.debug(
          { taskId, reason: 'deps-unsatisfied' },
          'Reactor skipped: task has unsatisfied deps — dep-completion trigger will fire'
        );
        return;
      }
      bornReady = true;
    }

    // 2026-04-18 (L2, Concern A): if another path already claimed the task, no-op.
    //
    // The specific window this closes: task.executionStatus=PENDING (agent.execute
    // has run its CAS at agentTaskService.ts:328-340) but the agent_executions
    // INSERT hasn't committed yet. The existing check below queries agent_executions
    // and would miss Thread B's row by a few ms; task.executionStatus is already
    // PENDING and visible.
    //
    // READY is exclusively set on scheduledFor executions (agentTaskService.ts:327,
    // app/api/tasks/[taskId]/agent/execute/route.ts:216,257) — no reactor sets it,
    // so including it in the block list is correct (a scheduled execution is
    // about to flip to PENDING; racing it is pointless).
    //
    // See plan §L2 at cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md
    // and event-system-specialist-review.md §F5 (9-cell state-space table showing zero misbehavior).
    if (
      task.executionStatus === 'PENDING' ||
      task.executionStatus === 'RUNNING' ||
      task.executionStatus === 'READY'
    ) {
      log.debug(
        { taskId, executionStatus: task.executionStatus, reason: 'task-already-claimed' },
        'Reactor skipped: task already claimed by another path'
      );
      return;
    }

    // Check no execution already exists (idempotency guard)
    const existing = await prisma.agentExecution.findFirst({
      where: {
        taskId,
        status: { in: ['PENDING', 'RUNNING', 'SUCCESS'] },
      },
      select: { id: true },
    });
    if (existing) {
      log.debug(
        { taskId, executionId: existing.id, reason: 'already-has-execution' },
        'Reactor skipped: task already has an execution'
      );
      return;
    }

    // A5: resolve triggeredBy from parent PIPELINE's triggerer (task #85).
    // Tri-state: parent + valid → propagate; no parent → assignee fallback;
    // parent + malformed → skip queue.
    const triggeredBy = await resolveTriggeredByFromParent(
      { id: task.id, stageId: task.stageId, assigneeId: task.assigneeId },
      'reactor-task-ready-initial'
    );
    if (!triggeredBy) {
      log.warn(
        { taskId },
        'Skipping dep-free queue: resolveTriggeredByFromParent returned null (parent malformed or no assignee)'
      );
      return;
    }

    // Rich-config helper.
    const built = await buildRichExecutionConfig(taskId, {
      triggerSource: 'task-ready-reactor',
      extraConfigKeys: {
        autoQueued: true,
        // Two distinct facts (Protocol 10): dep-free = created with no deps;
        // born-ready = created with deps that were ALL already satisfied (gap (e)).
        reason: bornReady ? 'born-ready-deps-already-satisfied' : 'dep-free-initial-wave',
      },
    });
    if (!built) {
      log.warn({ taskId }, 'Skipped dep-free queue: buildRichExecutionConfig returned null');
      return;
    }

    // Write via wrapper (task #85 E2/E3). L3 (2026-04-18): throws
    // DuplicateActiveExecutionError if the partial UNIQUE index rejects a
    // concurrent duplicate create — silent no-op on that case.
    try {
      const { execution } = await createAgentExecution({
        taskId,
        agentTemplateId: built.taskAgentTemplateId,
        status: 'PENDING',
        config: built.config,
        triggeredBy,
        logs: [
          bornReady
            ? 'Auto-queued by task-ready reactor (born-ready: created with all deps already satisfied)'
            : 'Auto-queued by task-ready reactor (dep-free initial wave)',
        ],
      });

      log.info(
        { taskId, executionId: execution.id, bornReady },
        bornReady
          ? 'Born-ready task auto-queued on creation — all deps already satisfied'
          : 'Dep-free task auto-queued on creation'
      );
    } catch (innerErr) {
      if (innerErr instanceof DuplicateActiveExecutionError) {
        logReactorDuplicateSkip('task-ready-depfree', {
          taskId,
          existingExecutionId: innerErr.existingExecutionId,
        });
        return;
      }
      throw innerErr;
    }
  } catch (err) {
    log.error({ err, taskId }, 'Dep-free auto-queue failed (non-fatal)');
  }
}
