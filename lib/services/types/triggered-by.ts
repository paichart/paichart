/**
 * TriggeredBy shape contract — the user-identity attribution written into
 * `agent_executions.context.triggeredBy` JSONB on every execution row.
 *
 * ## Storage
 *
 * Lives inside the `context` JSONB column of `agent_executions`, under the
 * key `triggeredBy`. Example stored row:
 * ```json
 * {
 *   "context": {
 *     "triggeredBy": {
 *       "id": "cmh86xj81002tyxmi5k2qv1ls",
 *       "source": "mcp-direct",
 *       "parentExecutionId": "cmnzr9m7w001tyx0bvvsfnaty"
 *     }
 *   }
 * }
 * ```
 *
 * ## Write-strict, read-soft contract
 *
 * - **Write boundary** (`lib/services/agent-execution-create.ts`): every
 *   execution-create call funnels through a wrapper that invokes
 *   `TriggeredBySchema.parse(triggeredBy)`. Parse failure throws a
 *   `BoundaryContractViolation` (see `lib/errors.ts`) — NEW writes must be
 *   clean, no exceptions.
 * - **Read boundary** (`agentExecutionEngine.ts extractUserId`):
 *   `TriggeredBySchema.safeParse(...)` — on failure, warn-log and fall back
 *   to `task.assigneeId` for backward-compat with pre-2026-04-16 JSONB rows
 *   that may store `triggeredBy` as a bare string or missing fields.
 *
 * ## Why this schema exists
 *
 * Before 2026-04-16, reactor services wrote a bare-string task ID
 * (`context.triggeredBy = "cmnzq6g5j000s..."`) while the direct-path MCP
 * handler wrote an object (`context.triggeredBy = { id: "cmh86xj81..." }`).
 * The engine's `extractUserId` did `.id` access, returning `undefined` for
 * the string and falling through to `task.assigneeId` (POV owner). This
 * silently routed pipeline child executions to a user who typically had no
 * apiKey configured — surfacing as masked "empty LLM response" errors.
 *
 * The schema eradicates the class: `.strict()` rejects unknown/missing keys
 * at write time. `source` is required, so a bare-string write fails parse
 * because the input isn't even an object. `.cuid()` on `id` catches the
 * specific regression where a reactor wrote a task-ID-shaped CUID into the
 * userId slot (same CUID format, wrong semantic).
 *
 * ## Security note
 *
 * `.strict()` serves double duty: (1) typo rejection for all 8 callers, and
 * (2) prototype-pollution defense at the JSONB boundary — keys like
 * `__proto__` are rejected before reaching Postgres.
 *
 * Full context: task #85 implementation plan at
 * `cline_docs/reviews/reactor-userid-propagation-2026-04-16/implementation-plan.md`
 * and Pattern #46 "Context Field Shape Drift Across Reactor Boundary".
 */

import { z } from 'zod';

/**
 * Valid sources for a triggered execution. Each value corresponds to exactly
 * one code path that creates execution records.
 *
 * `'system'` is retained for legitimate non-user-triggered executions
 * (startup jobs, seeders, health checks, future scheduled tasks). It MUST
 * NOT be used as a silent fallback when user resolution fails — user-
 * resolution failures must throw per target model. Any write of
 * `source: 'system'` should have an inline code comment justifying the
 * bootstrap path it represents.
 */
export const TriggeredBySourceEnum = z.enum([
  'mcp-direct',                    // agentTaskService.executeAgentOnTask via MCP tool
  'api-task-execute',              // app/api/tasks/[taskId]/agent/execute
  'api-pov-stream',                // app/api/pov/agent/execute/stream
  'reactor-task-ready',            // taskReadyReactor.maybeQueueReadyDependents (dep cascade)
  'reactor-task-ready-initial',    // taskReadyReactor.maybeQueueIfDepFree (initial wave)
  'reactor-pipeline-retrigger',    // pipelineRetriggerReactor (SYNTHESIZE)
  'child-assignee-fallback',       // Non-harness dep-free task: no parent PIPELINE to inherit from; falls back to task.assigneeId (event-system-specialist tri-state policy)
  'system',                        // Bootstrap/seeder/health-check ONLY — NEVER a silent fallback. Every caller must justify inline.
]);

export type TriggeredBySource = z.infer<typeof TriggeredBySourceEnum>;

/**
 * The triggeredBy object written into `agent_executions.context.triggeredBy`.
 *
 * `.strict()` rejects unknown keys. The `required_error` messages produce
 * readable pino output when a field is missing (default Zod error would be
 * just `"Required"` at the field path).
 */
export const TriggeredBySchema = z.object({
  id: z.string().cuid('triggeredBy.id must be a CUID userId, not a taskId or arbitrary string'),
  source: z.enum([
    'mcp-direct',
    'api-task-execute',
    'api-pov-stream',
    'reactor-task-ready',
    'reactor-task-ready-initial',
    'reactor-pipeline-retrigger',
    'child-assignee-fallback',
    'system',
  ], { required_error: 'triggeredBy.source is required — identifies which code path created the execution' }),
  parentExecutionId: z.string().cuid('triggeredBy.parentExecutionId must be a CUID').optional(),
  parentTaskId: z.string().cuid('triggeredBy.parentTaskId must be a CUID').optional(),
}).strict();

export type TriggeredBy = z.infer<typeof TriggeredBySchema>;

/**
 * Type guard for read-boundary consumers that need TypeScript narrowing
 * alongside Zod validation. Uses `safeParse` so legacy JSONB rows don't
 * throw — returns `false` and the caller can fall back.
 */
export function isTriggeredBy(value: unknown): value is TriggeredBy {
  return TriggeredBySchema.safeParse(value).success;
}
