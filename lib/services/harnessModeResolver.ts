/**
 * Harness Mode Resolver — third application of the trust-direction-shift pattern.
 *
 * Pre-execution mode resolution from DB state. Replaces agent's per-prose
 * Branch A/B detection (which fails under budget exhaustion) with a verified
 * platform-resolved mode injected into the system prompt.
 *
 * See: cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/
 * Pattern: trust-direction-shift (3rd application after clobber-detection back-pointer at 8f225353)
 *
 * Failure mode being fixed (3 occurrences in 30 days, exec cmo10q2fx005yyxlaojiei0in):
 * when the harness's tool calls fail under budget exhaustion, it cannot read
 * task.metadata via tool calls, mis-detects mode, and writes artifacts saying
 * "first-run attempt" on tasks that have live children. Confusing but
 * non-destructive (children already ran via earlier executions).
 */
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'HarnessModeResolver' });

export type ResolvedHarnessMode =
  | 'CREATE'
  | 'ORCHESTRATE'
  | 'SYNTHESIZE'
  | 'NOT_PIPELINE'
  | 'CROSS_TENANT_DETECTED'
  | 'UNKNOWN';

export type ResolvedReasonCode =
  | 'no-pipelineStageId'
  | 'empty-stage'
  | 'all-terminal'
  | 'partial-terminal'
  | 'in-flight'
  | 'missing-stage'
  | 'cross-tenant-detected'
  | 'not-pipeline'
  | 'resolver-error';

export interface ResolvedHarnessContext {
  mode: ResolvedHarnessMode;
  reasonCode: ResolvedReasonCode;
  reason: string;
  resolvedAt: string;
  pipelineStageId: string | null;
  childStageTaskCount?: number;
  childStageTerminalCount?: number;
}

export async function resolveHarnessMode(taskId: string): Promise<ResolvedHarnessContext> {
  const start = Date.now();
  const resolvedAt = new Date().toISOString();
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { type: true, povId: true, metadata: true },
    });

    if (!task || task.type !== 'PIPELINE') {
      return {
        mode: 'NOT_PIPELINE',
        reasonCode: 'not-pipeline',
        reason: 'task type is not PIPELINE',
        resolvedAt,
        pipelineStageId: null,
      };
    }

    const meta = (task.metadata as Record<string, unknown> | null) || {};
    const pipelineStageId =
      typeof meta.pipelineStageId === 'string' ? meta.pipelineStageId : null;

    if (!pipelineStageId) {
      const result: ResolvedHarnessContext = {
        mode: 'CREATE',
        reasonCode: 'no-pipelineStageId',
        reason: 'no pipelineStageId in task.metadata',
        resolvedAt,
        pipelineStageId: null,
      };
      log.info(
        { taskId, mode: result.mode, reasonCode: result.reasonCode, durationMs: Date.now() - start },
        'Harness mode resolved'
      );
      return result;
    }

    // Cross-tenant guard (per boundary-contract MEDIUM-1):
    // If the referenced stage's POV doesn't match the task's POV, treat as
    // CROSS_TENANT_DETECTED — same class as STAGE_CROSSTENANT_7D in the
    // daily email. Defense-in-depth.
    const stage = await prisma.stage.findUnique({
      where: { id: pipelineStageId },
      select: { phase: { select: { povId: true } } },
    });

    if (!stage) {
      const result: ResolvedHarnessContext = {
        mode: 'CREATE',
        reasonCode: 'missing-stage',
        reason: `pipelineStageId ${pipelineStageId} references missing stage`,
        resolvedAt,
        pipelineStageId,
      };
      log.warn(
        { taskId, mode: result.mode, reasonCode: result.reasonCode, pipelineStageId },
        'Harness mode resolved with missing-stage'
      );
      return result;
    }

    if (stage.phase.povId !== task.povId) {
      const result: ResolvedHarnessContext = {
        mode: 'CROSS_TENANT_DETECTED',
        reasonCode: 'cross-tenant-detected',
        reason: `pipelineStageId ${pipelineStageId} references stage in POV ${stage.phase.povId}; task POV is ${task.povId}`,
        resolvedAt,
        pipelineStageId,
      };
      log.warn(
        { taskId, mode: result.mode, reasonCode: result.reasonCode, taskPovId: task.povId, stagePovId: stage.phase.povId, securityEvent: true },
        'Harness mode resolver detected cross-tenant'
      );
      return result;
    }

    const children = await prisma.task.findMany({
      where: { stageId: pipelineStageId },
      select: { status: true, executionStatus: true },
    });

    const total = children.length;
    const terminal = children.filter(
      c => c.status === 'COMPLETED' || c.executionStatus === 'FAILED'
    ).length;

    let result: ResolvedHarnessContext;

    if (total === 0) {
      result = {
        mode: 'CREATE',
        reasonCode: 'empty-stage',
        reason: 'pipelineStageId set but child stage empty',
        resolvedAt,
        pipelineStageId,
        childStageTaskCount: 0,
        childStageTerminalCount: 0,
      };
    } else if (terminal === total) {
      result = {
        mode: 'SYNTHESIZE',
        reasonCode: 'all-terminal',
        reason: `${total} of ${total} children terminal`,
        resolvedAt,
        pipelineStageId,
        childStageTaskCount: total,
        childStageTerminalCount: terminal,
      };
    } else if (terminal === 0) {
      // In-flight branch (per pipeline-harness I4): ALL children executing —
      // distinct from "ORCHESTRATE because templates missing".
      result = {
        mode: 'ORCHESTRATE',
        reasonCode: 'in-flight',
        reason: `${total} of ${total} children executing — pipeline in flight, exit and wait for retrigger`,
        resolvedAt,
        pipelineStageId,
        childStageTaskCount: total,
        childStageTerminalCount: terminal,
      };
    } else {
      result = {
        mode: 'ORCHESTRATE',
        reasonCode: 'partial-terminal',
        reason: `${terminal} of ${total} children terminal, ${total - terminal} non-terminal`,
        resolvedAt,
        pipelineStageId,
        childStageTaskCount: total,
        childStageTerminalCount: terminal,
      };
    }

    log.info(
      { taskId, mode: result.mode, reasonCode: result.reasonCode, durationMs: Date.now() - start },
      'Harness mode resolved'
    );
    return result;
  } catch (error) {
    // Fail-loud-without-crash (resolves agent-execution I4 vs arch-review I2):
    // UNKNOWN sentinel + WARN log. LLM turn proceeds; monitoring catches the
    // outage via pino without crashing the execution.
    log.warn(
      { err: error, taskId, durationMs: Date.now() - start },
      'Harness mode resolver error — returning UNKNOWN'
    );
    return {
      mode: 'UNKNOWN',
      reasonCode: 'resolver-error',
      reason: `resolver error: ${error instanceof Error ? error.message : String(error)}`,
      resolvedAt,
      pipelineStageId: null,
    };
  }
}
