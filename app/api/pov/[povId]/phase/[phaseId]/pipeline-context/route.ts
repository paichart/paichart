/**
 * GET /api/pov/[povId]/phase/[phaseId]/pipeline-context?taskId=X
 *
 * Returns pipeline-context metadata for a single task: its role in any
 * pipeline (HARNESS | CHILD | NONE), plus sibling / peer / parent-harness
 * info for the `PipelineTab.tsx` rendering.
 *
 * Shape: see components/poveditor/pov/components/tabs/signals/SignalTypes.ts
 * Auth: withPOVAccess middleware (user + POV validation)
 * Rate limit: analyticsReadLimiter (200 req/min/IP)
 * Cache: private, max-age=15, stale-while-revalidate=120, Vary: Authorization
 *
 * Query composition (3 queries, all indexed, no N+1):
 *   1. findFirst task by {id, povId, phaseId}  — integrity + input validation
 *   2. $queryRaw harness lookup                 — uses idx_tasks_pipeline_stage_id (A6)
 *   3. findMany siblings/peers by {povId, stageId} — uses @@index([stageId])
 *   (+ optional Stage.findFirst for childStageName on HARNESS)
 *
 * Plan: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 2
 * Review: boundary-contract (93%), api-efficiency (94%), database-manager (97%), dev-ops (96%)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { validateCUIDFormat } from '@/lib/validation/id-validation';
import { analyticsReadLimiter } from '@/lib/middleware/rate-limit';
import { povLogger } from '@/lib/logger';
import {
  PipelineContextResponseSchema,
  type PipelineContextResponse,
} from '@/lib/validation/pipeline-context-schemas';
import type {
  SiblingRow,
  PipelineCounts,
  ParentHarnessSummary,
  TaskStatus,
  ExecutionStatus,
} from '@/components/poveditor/pov/components/tabs/signals/SignalTypes';

const SIBLINGS_CAP = 50;

export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // Rate limit (api-efficiency I2)
    const rateLimitResponse = analyticsReadLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { povId, phaseId } = params;
    const taskId = new URL(request.url).searchParams.get('taskId') ?? undefined;

    // Input validation — CUID format on all IDs
    const phaseCheck = validateCUIDFormat(phaseId, 'phaseId');
    if (!phaseCheck.valid) {
      return NextResponse.json({ error: phaseCheck.error }, { status: 400 });
    }
    const taskCheck = validateCUIDFormat(taskId, 'taskId');
    if (!taskCheck.valid) {
      return NextResponse.json({ error: taskCheck.error }, { status: 400 });
    }

    // Query 1 — B3 CRITICAL: taskId must belong to the URL's povId + phaseId.
    // Returns 404 (not 403) on mismatch — don't leak existence of cross-POV task.
    const task = await prisma.task.findFirst({
      where: { id: taskId!, povId, phaseId },
      select: {
        id: true,
        type: true,
        stageId: true,
        phaseId: true,
        povId: true,
        title: true,
        metadata: true,
      },
    });
    if (!task) {
      povLogger.debug(
        { povId, phaseId, taskId, userId: user.userId },
        'pipeline-context: task not found in this phase (404)'
      );
      return NextResponse.json({ error: 'Task not found in this phase' }, { status: 404 });
    }

    // Role classification — HARNESS wins for nested-pipeline case (B5).
    let role: 'HARNESS' | 'CHILD' | 'NONE' = 'NONE';
    let childStageId: string | null = null;
    let parentHarness: ParentHarnessSummary | undefined;

    if (task.type === 'PIPELINE') {
      role = 'HARNESS';
      childStageId = (task.metadata as { pipelineStageId?: string } | null)?.pipelineStageId ?? null;
    }

    // Query 2 — CHILD / nested-pipeline lookup.
    // B4 CRITICAL: explicit pov_id predicate (defense-in-depth even though
    // withPOVAccess already validated POV). Uses A6 partial JSONB index
    // `idx_tasks_pipeline_stage_id`.
    if (task.stageId) {
      const harnesses = await prisma.$queryRaw<
        Array<{ id: string; title: string; stage_id: string }>
      >`
        SELECT t.id, t.title, t.stage_id
        FROM tasks t
        WHERE t.type = 'PIPELINE'
          AND t."pov_id" = ${povId}
          AND t.metadata->>'pipelineStageId' = ${task.stageId}
          AND t.id != ${task.id}
        LIMIT 1
      `;
      if (harnesses[0]) {
        parentHarness = {
          taskId: harnesses[0].id,
          title: harnesses[0].title,
          stageId: harnesses[0].stage_id,
        };
        if (task.type !== 'PIPELINE') {
          role = 'CHILD';
        }
        // If task.type === 'PIPELINE': stays HARNESS (B5), parentHarness kept as optional.
      }
    }

    // Short-circuit for NONE
    if (role === 'NONE') {
      const response: PipelineContextResponse = { role: 'NONE' };
      return withCacheHeaders(NextResponse.json(validate(response)));
    }

    // Query 3 — siblings (HARNESS) or peers (CHILD).
    const targetStageId = role === 'HARNESS' ? childStageId : task.stageId;
    let siblings: SiblingRow[] = [];
    let truncated = false;

    if (targetStageId) {
      const rows = await prisma.task.findMany({
        where: { povId, stageId: targetStageId },
        select: {
          id: true,
          title: true,
          stageId: true,
          status: true,
          executionStatus: true,
          stage: { select: { id: true, name: true } },
        },
        orderBy: { order: 'asc' },
        take: SIBLINGS_CAP + 1, // +1 to detect truncation
      });
      truncated = rows.length > SIBLINGS_CAP;
      siblings = rows.slice(0, SIBLINGS_CAP).map((r) => ({
        taskId: r.id,
        title: r.title,
        stageId: r.stageId!,
        stageName: r.stage?.name ?? r.stageId!,
        status: r.status as TaskStatus,
        executionStatus: (r.executionStatus ?? undefined) as ExecutionStatus | undefined,
      }));
    }

    // Compute counts server-side (avoid client aggregation at scale).
    const counts: PipelineCounts = {
      total: siblings.length,
      done: siblings.filter((s) => s.executionStatus === 'SUCCESS').length,
      running: siblings.filter((s) => s.executionStatus === 'RUNNING').length,
      pending: siblings.filter(
        (s) => s.executionStatus === 'PENDING' || s.executionStatus === 'READY' || !s.executionStatus,
      ).length,
      failed: siblings.filter(
        (s) => s.executionStatus === 'FAILED' || s.executionStatus === 'REVIEW_REJECTED',
      ).length,
    };

    // childStageName inline lookup (folds the tab's separate /stages fetch)
    let childStageName: string | null = null;
    if (role === 'HARNESS' && childStageId) {
      const stage = await prisma.stage.findFirst({
        where: { id: childStageId, phase: { povId } }, // POV-scoped via phase relation
        select: { name: true },
      });
      childStageName = stage?.name ?? null;
    }

    // 2026-04-20 (#1): harness synthesis completion signal.
    //
    // Derive the harness's latest SUCCESS execution mode so the UI can show
    // "Pipeline synthesis: ✓ complete" vs "CREATE only — SYNTHESIZE pending".
    // Without this, the natural UX trap is "specialist report.md exists →
    // assume pipeline done" — but the harness may never have synthesised.
    //
    // Derivation: fetch the latest SUCCESS pipeline-index.json, parse
    // content.protocolValidation.mode. Null if no SUCCESS executions OR
    // the artifact lacks protocolValidation (budget-exhausted runs).
    let synthesisStatus: 'SYNTHESIZE' | 'CREATE' | 'ORCHESTRATE' | null = null;
    if (role === 'HARNESS') {
      try {
        // selection-exempt: Phase 2 (arch synthesis §3 — C7 presentation GET). Derives
        // synthesis-mode status for the GUI, not the deliverable; adopting the shared selector
        // here is bundled with the C2/C3/C6 presentation-contract work + the startTime→createdAt
        // ordering unification (BC-7). Tracked in the retry-band review Phase 2.
        const latestSuccess = await prisma.agentExecution.findFirst({
          where: { taskId: task.id, status: 'SUCCESS' },
          orderBy: { startTime: 'desc' },
          select: {
            id: true,
            artifacts: {
              where: { name: 'pipeline-index.json' },
              select: { content: true },
              take: 1,
            },
          },
        });
        const content = latestSuccess?.artifacts?.[0]?.content;
        if (content) {
          const parsed = JSON.parse(content) as { protocolValidation?: { mode?: string } };
          const mode = parsed?.protocolValidation?.mode;
          if (mode === 'SYNTHESIZE' || mode === 'CREATE' || mode === 'ORCHESTRATE') {
            synthesisStatus = mode;
          }
        }
      } catch {
        // Non-JSON content or stale schema — fall through to null. The UI
        // degrades to "synthesis status unknown" rather than a wrong badge.
      }
    }

    const response: PipelineContextResponse =
      role === 'HARNESS'
        ? {
            role: 'HARNESS',
            childStageId,
            childStageName,
            siblings,
            siblingsTruncated: truncated,
            counts,
            synthesisStatus,
            ...(parentHarness ? { parentHarness } : {}),
          }
        : {
            role: 'CHILD',
            parentHarness: parentHarness!, // guaranteed non-null when role='CHILD'
            peers: siblings,
            peersTruncated: truncated,
            counts,
          };

    return withCacheHeaders(NextResponse.json(validate(response)));
  } catch (error) {
    povLogger.error({ err: error }, 'pipeline-context GET error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
});

/**
 * Zod-validate the response before serialization. Catches shape drift as a
 * 500 in dev (visible in logs) before it ships. In prod, if validation fails
 * we still want the shape that was intended — log loudly and pass through.
 */
function validate(response: PipelineContextResponse): PipelineContextResponse {
  const parsed = PipelineContextResponseSchema.safeParse(response);
  if (!parsed.success) {
    povLogger.error(
      { issues: parsed.error.issues, response },
      'pipeline-context response shape drift at API boundary'
    );
    // Return the intended shape anyway — the caller was the server, the
    // client still needs a usable payload.
    return response;
  }
  return parsed.data;
}

function withCacheHeaders(res: NextResponse): NextResponse {
  // 15s max-age: sibling execution status changes on every agent execution.
  // stale-while-revalidate=120 lets the tab refresh in background on re-open.
  // Vary: Authorization prevents cross-user cache poisoning (BC40 fix pattern).
  res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=120');
  res.headers.set('Vary', 'Authorization');
  return res;
}
