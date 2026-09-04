/**
 * Agent Status Handler
 *
 * Handles agent.status action - retrieves execution status for agents.
 *
 * Features:
 * - Query by taskId or executionId
 * - Returns last 10 executions for task
 * - Includes execution summary (running/completed/failed)
 * - POV access validation
 *
 * @created 2025-12-18 (Phase 2.3, Step 3)
 * @extraction Facade extraction pattern (Dec 15-17, 2025)
 */

import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import type { TokenPayload } from '@/lib/types/auth';
import type { Prisma } from '@prisma/client';

/**
 * The ONE projection this surface reads (2026-07-25, error-surface panel).
 *
 * Formerly `let executions: any[]` — and that `any` was the ROOT CAUSE, not a style
 * nit: it erased Prisma's inferred payload type at the DB→handler boundary, which is
 * the only reason `exec.progress` and `exec.error` ever compiled. Neither column has
 * ever existed on `agent_executions` (confirmed by `git log -S`: no add/remove pair).
 * So the surface emitted `progress: 0` for every execution including completed ones —
 * a FALSE FACT an agent can read as "no work done" and retry a run that already burned
 * a full LLM call — while `error` silently serialized away as `undefined`.
 *
 * An explicit `select` makes the next phantom field a compile error instead of a
 * plausible-looking zero on the wire. Keep it a `select` (not `include`): this is the
 * hot polling surface (its own nextSteps tell agents to call it every 10-30s), so it
 * must fetch exactly what it renders — never artifact `content`.
 */
const STATUS_EXECUTION_SELECT = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  errorCode: true,
  task: { select: { id: true, title: true } },
  agentTemplate: { select: { id: true, name: true, category: true } },
} satisfies Prisma.AgentExecutionSelect;

type StatusExecution = Prisma.AgentExecutionGetPayload<{ select: typeof STATUS_EXECUTION_SELECT }>;

export async function handleAgentStatus(parameters: any, user: TokenPayload, actionId: string) {
  const { taskId, executionId } = parameters;

  if (!taskId && !executionId) {
    throw new Error('Either taskId or executionId is required for agent status check');
  }

  // 🔒 SECURITY: Validate POV access before checking agent status
  // Resolve executionId to taskId if needed (prevents executionId bypass)
  let resolvedTaskId = taskId;
  // Pre-flight halt fact (duplicateHalt / cannotRun stamped in task metadata on a non-terminal task)
  let haltFact: { kind: string; detail: unknown } | null = null;

  if (executionId && !taskId) {
    const exec = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: { taskId: true }
    });
    if (!exec) {
      throw new Error('Execution not found');
    }
    resolvedTaskId = exec.taskId;
  }

  if (resolvedTaskId) {
    const taskForAuth = await prisma.task.findUnique({
      where: { id: resolvedTaskId },
      select: {
        status: true,
        metadata: true,
        pov: {
          select: {
            id: true,
            ownerId: true,
            metadata: true,
            team: {
              select: {
                members: {
                  select: { userId: true }
                }
              }
            }
          }
        }
      }
    });

    if (!taskForAuth?.pov) {
      throw new Error(
        `Task not found: "${resolvedTaskId}"\n\n` +
        `The task may not exist or you don't have access.\n\n` +
        `💡 Find tasks:\n` +
        `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
        `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
        `• search("task keywords") - Search across all tasks\n\n` +
        `Or verify the task ID is correct.`
      );
    }

    validatePOVAccess(user, taskForAuth.pov, {
      throwOnDeny: true,
      logContext: 'Agent Status'
    });

    // 2026-08-23 (FW-A3 campaign, duplicate-halt "looks hung" finding): a pre-flight halt is
    // stamped in task metadata + announced in a comment, but NOTHING at execution-status level
    // distinguished "halted awaiting a human" from "working" — an operator watching agent.status
    // saw SUCCESS + get_results and read it as progress. Surface the STAMPED FACTS here
    // (Protocol 10: the stamp content, plus the documented release mechanism — no new judgement).
    const tMeta = (taskForAuth as any).metadata ?? {};
    if ((taskForAuth as any).status !== 'COMPLETED') {
      if (tMeta.duplicateHalt) haltFact = { kind: 'duplicateHalt', detail: tMeta.duplicateHalt };
      else if (tMeta.cannotRun) haltFact = { kind: 'cannotRun', detail: tMeta.cannotRun };
    }
  }

  let executions: StatusExecution[] = [];

  if (executionId) {
    // Get specific execution
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: STATUS_EXECUTION_SELECT
    });

    if (execution) {
      executions = [execution];
    }
  } else if (taskId) {
    // Get all executions for task
    executions = await prisma.agentExecution.findMany({
      where: { taskId },
      select: STATUS_EXECUTION_SELECT,
      orderBy: { startTime: 'desc' },
      take: 10
    });
  }

  if (executions.length === 0) {
    return {
      actionId,
      action: 'agent.status',
      status: 'completed',
      result: {
        executions: [],
        message: 'No agent executions found'
      }
    };
  }

  const formattedExecutions = executions.map(exec => ({
    id: exec.id,
    status: exec.status,
    startTime: exec.startTime,
    endTime: exec.endTime,
    duration: exec.endTime && exec.startTime ?
      Math.round((new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime()) / 1000) :
      null,
    task: exec.task,
    agentTemplate: exec.agentTemplate,
    // The branchable failure code (2026-07-25). `null` means "no code recorded" — either
    // this execution did not fail, or it failed before/without a typed error. It is NEVER
    // a placeholder: an agent may branch on a code it sees, so a synthesized 'UNKNOWN'
    // would be a verdict rather than a fact (Protocol 10).
    // Removed in the same change: `progress` (always 0 — a false fact) and `error` (always
    // undefined, dropped by serialization). Both read columns that never existed.
    errorCode: exec.errorCode ?? null
  }));

  // P2: Add conditional nextSteps based on execution status
  const latestExecution = formattedExecutions[0];
  const hasRunning = executions.some(e => e.status === 'RUNNING');
  const hasCompleted = executions.some(e => e.status === 'SUCCESS');
  const hasFailed = executions.some(e => e.status === 'FAILED');

  let nextSteps = [];
  if (hasRunning) {
    nextSteps = [
      "⏳ Agent is still running",
      "Check again in 10-30 seconds",
      `perform(action: 'agent.status', parameters: { taskId: '${taskId}' })`,
      "Or wait for completion and get results"
    ];
  } else if (hasCompleted) {
    nextSteps = [
      "✅ Agent execution completed",
      `Get results: perform(action: 'agent.results', taskId: '${taskId}')`,
      `Or: perform(action: 'agent.results', parameters: { taskId: '${taskId}' })`,
      "Review artifacts: result.json, report.md, logs"
    ];
  } else if (hasFailed) {
    // 2026-07-25: the old third line told agents to "Review logs for failure cause" — an
    // unactionable instruction on a surface that returns no logs. Replaced with the code
    // itself when one was recorded (a fact), and a pointer to the surface that does carry
    // the forensic detail when one was not.
    const failedCode = formattedExecutions.find(e => e.status === 'FAILED')?.errorCode ?? null;
    nextSteps = [
      "❌ Agent execution failed",
      failedCode
        ? `Failure code: ${failedCode} (branch on this; full detail in error.json)`
        : "No failure code was recorded for this execution",
      `Full error detail: perform(action: 'agent.results', taskId: '${taskId}')`,
      "Consider: Re-assign different template or retry execution"
    ];
  } else {
    nextSteps = [
      "No agent executions found",
      `Assign agent first: perform(action: 'agent.assign', parameters: { taskId: '${taskId}', agentTemplateId: '...' })`,
      "Then execute: agent.execute"
    ];
  }

  return {
    actionId,
    action: 'agent.status',
    status: 'completed',
    result: {
      executions: formattedExecutions,
      summary: {
        total: executions.length,
        running: executions.filter(e => e.status === 'RUNNING').length,
        completed: executions.filter(e => e.status === 'SUCCESS').length,
        failed: executions.filter(e => e.status === 'FAILED').length
      },
      message: `Found ${executions.length} agent execution(s)`,
      nextSteps,
      ...(haltFact ? { preFlightHalt: haltFact } : {}),
      workflow: haltFact && !hasRunning ? {
        current: "halted_awaiting_human",
        recommendation: haltFact.kind === 'duplicateHalt'
          ? "release_via_task_state: set metadata.duplicateAcknowledged (the detected stage's id/name) or a PRE-FLIGHT CLEARANCE description block, then re-execute — a comment reply cannot clear it"
          : "review metadata.cannotRun; recovery is typically a fresh task (see the halt comment)"
      } : {
        current: hasRunning ? "executing" : hasCompleted ? "completed" : hasFailed ? "failed" : "not_started",
        recommendation: hasRunning ? "wait_and_check_again" : hasCompleted ? "get_results" : hasFailed ? "review_and_retry" : "assign_agent_first"
      }
    }
  };
}
