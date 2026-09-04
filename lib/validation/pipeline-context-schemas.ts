/**
 * Zod schemas for the PipelineContext API boundary.
 *
 * Server-side: `PipelineContextResponseSchema.parse(response)` before
 * `NextResponse.json()` catches shape drift as a 500 in dev (visible in logs)
 * before it ships. Feb 2026 `boundary-response-shape-discovery.md` lists 4
 * bugs found in one session from exactly this missing layer.
 *
 * These schemas MUST mirror the authoritative discriminated union in:
 *   components/poveditor/pov/components/tabs/signals/SignalTypes.ts
 *
 * Plan: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 2.7
 */

import { z } from 'zod';

const ErrorCategorySchema = z.enum([
  'TEMPLATE_MISMATCH_SELF_REPORTED',
  'BUDGET_EXHAUSTED',
  'TOOL_LOOP_DEGRADED',
  'TOOL_FAILURES',
  'SILENT_REFUSAL',
  'PROTOCOL_STEP_SKIPPED',
  // Drift catch-up (2026-07-17, found during HARNESS_NO_OUTPUT work): the two categories
  // below shipped 2026-07-05 (EMPTY_DELIVERABLE) and 2026-07-16 (TRUNCATED_NO_OUTPUT)
  // without this enum learning them — a sibling row carrying either would fail this
  // schema silently (the exact drift its own header warns about).
  'EMPTY_DELIVERABLE',
  'TRUNCATED_NO_OUTPUT',
  'HARNESS_NO_OUTPUT', // 2026-07-17: PIPELINE + empty pre-note deliverable (residual net)
  'TEMPLATE_SCOPE_MISMATCH', // RETIRED 2026-07-17 (P9: ~60 firings, 0 true positives) — kept for READS of historical artifacts; no writer emits it
]);

// Exported 2026-05-23 for scripts/test-enum-parity.ts MCP* literal
// parity coverage. These shadow Prisma TaskStatus + ExecutionStatus
// respectively; drift causes silent SiblingRow validation failures.
export const TaskStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']);

export const ExecutionStatusSchema = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'PENDING_REVIEW',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
  'SUCCESS',
  'FAILED',
]);

const SiblingRowSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  stageId: z.string(),
  stageName: z.string(),
  status: TaskStatusSchema,
  executionStatus: ExecutionStatusSchema.optional(),
  errorCategory: ErrorCategorySchema.nullable().optional(),
});

const PipelineCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

const ParentHarnessSummarySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  stageId: z.string(),
});

/**
 * Discriminated union mirroring `PipelineContext` in SignalTypes.ts.
 * Use `z.discriminatedUnion('role', [...])` so TS inference on parsed
 * values gives consumers the role-specific shape.
 */
export const PipelineContextResponseSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('HARNESS'),
    childStageId: z.string().nullable(),
    childStageName: z.string().nullable(),
    siblings: z.array(SiblingRowSchema),
    siblingsTruncated: z.boolean(),
    counts: PipelineCountsSchema,
    parentHarness: ParentHarnessSummarySchema.optional(),
    // 2026-04-20: harness synthesis completion signal.
    //   'SYNTHESIZE' = harness's latest SUCCESS execution ran in SYNTHESIZE
    //                  mode — pipeline is fully synthesized
    //   'CREATE'     = latest SUCCESS was CREATE (or ORCHESTRATE); children
    //                  may have run but SYNTHESIZE hasn't completed yet
    //   null         = no successful executions, OR latest artifact lacks
    //                  protocolValidation.mode (e.g., budget-exhausted run)
    // Prevents the "specialist report.md exists → assume pipeline done" trap.
    synthesisStatus: z.enum(['SYNTHESIZE', 'CREATE', 'ORCHESTRATE']).nullable().optional(),
  }),
  z.object({
    role: z.literal('CHILD'),
    parentHarness: ParentHarnessSummarySchema,
    peers: z.array(SiblingRowSchema),
    peersTruncated: z.boolean(),
    counts: PipelineCountsSchema,
  }),
  z.object({
    role: z.literal('NONE'),
  }),
]);

export type PipelineContextResponse = z.infer<typeof PipelineContextResponseSchema>;
