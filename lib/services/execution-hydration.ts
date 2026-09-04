/**
 * Execution Hydration — the canonical query SHAPES for execution context (convergence Phase 5b-i)
 *
 * Shapes, not a query: the three hydration sites keep their positions and root
 * models (AE-I1 position invariant, phase-5-agent-execution-signoff.md — engine
 * hydrates the EXECUTION in the poller PRE-claim so transient failures stay
 * PENDING and retry; the stream hydrates the TASK at the route edge PRE-row-create
 * so transient failures are an HTTP 5xx with zero execution rows. Moving either
 * across its boundary converts a retryable blip into a burnt FAILED run — do NOT
 * "unify" the call sites). What they share is WHAT they select:
 *
 *  - EXECUTION_TEMPLATE_SELECT: the 11-field UNION (template-system TS-I1) —
 *    the engine's former 7-field select silently disabled P9 (retired 2026-07-17),
 *    suppressed §2 EXPECTED OUTPUT (outputSchema), and dropped template
 *    maxRetries/timeout. The stream's
 *    former full-row include worked but carried untyped surplus. One select,
 *    every consumer covered, nothing extra.
 *  - EXECUTION_TASK_CONTEXT_INCLUDE: the engine-canonical task-relation superset
 *    (C-2) that renders §4/§5 of the user prompt. The stream adopting it IS the
 *    5b-i enrichment (GUI prompts gain team/assignee/subTasks/parentTask context;
 *    ≈ +200-500 input tokens/turn typical — Steve-gated 2026-07-05).
 *
 * Consumers of the union fields (template-system signoff Q3b):
 *   buildAgentPromptBody §1/§8 → defaultRole/constraints/promptTemplate; §2 → outputSchema
 *   buildTemplateModelParameters → maxRetries/timeout/metadata/promptTemplate
 *   applySystemPromptInjections → metadata (protocol flags)
 *
 * Gate: scripts/test-execution-hydration.ts
 */

import { Prisma } from '@prisma/client';

/** The 11-field template UNION select — every runtime template consumer covered. */
export const EXECUTION_TEMPLATE_SELECT = {
  id: true,
  name: true,
  defaultRole: true,
  promptTemplate: true,
  capabilities: true,
  constraints: true,
  metadata: true, // Required for protocol injection (loadProtocols / protocol flags)
  // 5b-i union additions (TS-I1) — restoring silently-dropped consumers:
  templateType: true,  // was P9 scope match (retired 2026-07-17); kept — typed template field, cheap, and GUI/template surfaces read it
  outputSchema: true,  // §2 EXPECTED OUTPUT completion contract (latent — 0 templates set it today)
  maxRetries: true,    // buildTemplateModelParameters (coincides with schema default 3 today)
  timeout: true,       // buildTemplateModelParameters (coincides with schema default 300 today)
} satisfies Prisma.AgentTemplateSelect;

/**
 * The engine-canonical task-relation superset — §4 (parent/subtasks) + §5
 * (POV/phase/team/assignee environment) prompt context. Deliberately does NOT
 * include agentTemplate: template linkage is per-adapter policy (engine resolves
 * from the EXECUTION row; the stream from the task) — adapters attach
 * `agentTemplate: { select: EXECUTION_TEMPLATE_SELECT }` at their own level.
 */
export const EXECUTION_TASK_CONTEXT_INCLUDE = {
  pov: { select: { id: true, title: true, description: true, objective: true, customerName: true, solution: true, status: true } },
  phase: { select: { id: true, name: true, description: true, type: true } },
  stage: { select: { id: true, name: true, order: true } },
  assignee: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
  // Include surrounding tasks for context
  subTasks: {
    select: { id: true, title: true, description: true, status: true, order: true },
    orderBy: { order: 'asc' as const },
    take: 10, // Limit to 10 sub-tasks to keep context manageable
  },
  parentTask: {
    select: { id: true, title: true, description: true, order: true },
  },
} satisfies Prisma.TaskInclude;
