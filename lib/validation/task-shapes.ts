/**
 * Shared task-shape schemas.
 *
 * Single source of truth for the nested task validator referenced by:
 *   - lib/validation/pov.ts:UpdatePOVSchemaComprehensive.tasks (active)
 *   - lib/validation/task-validation.ts:CreateTaskSchema (eventual migration)
 *   - lib/validation/task-validation.ts:UpdateTaskSchema (eventual migration)
 *   - lib/validation/mcp-action-validation.ts:MCPParameterSchemas['pov.update']
 *     (planned — see cline_docs/spec-mcp-pov-update-2026-05-15.md)
 *
 * Created 2026-05-15 per arch-review-specialist's BC75 prevention
 * recommendation in the BC76 site #7 final gate. Three task schemas
 * had begun to diverge after the handler-layer + comprehensive-update
 * sweeps (commits bfab85bf and 408a4f67); anchoring on a shared shape
 * closes the drift class structurally — future field additions land
 * in one place and propagate everywhere.
 *
 * **Promotion order** (preserved during extraction):
 * - 2026-05-15: NestedTaskInputSchema extracted from
 *   UpdatePOVSchemaComprehensive.tasks (pure refactor, no behaviour change)
 * - Future commit: CreateTaskSchema → derive from NestedTaskInputSchema
 *   via `.extend()` (needs `povId` required, `status`/`priority` defaults)
 * - Future commit: UpdateTaskSchema → derive via `.partial().extend()`
 *
 * See related docs:
 *   - `.claude/knowledge/domain/mcp/bug-class-registry.md` § Bug Class 76
 *   - `.claude/knowledge/patterns/coupled-atomic-schema-read-fix-pattern.md`
 *   - `cline_docs/reviews/partial-bc76-put-handler-2026-05-14/`
 */

import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { PrismaEnum } from './enum-validation';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { safeRecord, InjectionSafeOptional } from './zod-helpers';
import { ModelParametersPassthroughSchema } from './model-parameters';
import { RUNTIME_LIMITS } from './runtime-limits';

/**
 * Nested task input shape — the canonical shape for a task inside a
 * comprehensive POV update or MCP pov.update payload.
 *
 * **Field categories**:
 * - Identity: `id` (optional — present for updates, absent for creates
 *   in nested batches)
 * - Core editable scalars: title (required), description, status,
 *   priority, type, dueDate, order
 * - Lineage: phaseId, stageId, parentTaskId-equivalent via metadata
 * - Agent-execution: agentRole, prompt, inputContext, agentTemplateId,
 *   maxRetries, timeout, agentLog, outputArtifacts (NOT executionStatus —
 *   engine-owned, stripped 2026-07-25 per F1)
 * - Storage/routing: metadata, modelParameters (handler routes INTO
 *   metadata.modelParameters at put.ts:526-556), assigneeId
 *
 * **Refines on LLM-context text fields**: title, description, prompt,
 * agentRole, agentLog, inputContext (string variant). These feed into
 * the LLM Directive section at agentExecutionEngine.ts:2078 — sec-ops
 * P2 attack surface.
 *
 * **Behaviour notes**:
 * - dueDate has NO `.transform(val => val ?? undefined)` so null
 *   propagates to the handler (preserves "user clears dueDate" via PUT)
 * - inputContext accepts both string and safeRecord (object). String
 *   variant carries the injection refine; object variant relies on
 *   safeRecord's stripDangerousKeys transform.
 * - modelParameters is declared at task level even though the handler
 *   routes it into metadata.modelParameters — the schema must declare
 *   it explicitly or the field is silently stripped (BC76 site #7 fix).
 */
export const NestedTaskInputSchema = z.object({
  id: FormField.optionalString(50),
  title: z.string().min(1).max(500)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Task title contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  // FIELD_LIMITS.CONTENT (50000) matches MCP intake limit. Refine added
  // 2026-05-14 per sec-ops P2 (LLM-context attack vector).
  description: FormField.optionalString(FIELD_LIMITS.CONTENT)
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Task description contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  status: PrismaEnum.taskStatus,
  priority: PrismaEnum.taskPriority,
  // PrismaEnum.taskType instead of optionalString(100). Matches sibling
  // status/priority. Schema reflects Prisma's TaskType enum; handler
  // stops getting free-form strings that Prisma rejects at the DB layer.
  type: FormField.optional(PrismaEnum.taskType),
  // dueDate: no transform so null clears the field via PUT.
  dueDate: z.union([z.string(), z.date()]).nullable().optional(),
  order: FormField.optional(z.number().int().min(0)),
  phaseId: FormField.optionalCUID('phase ID'),
  stageId: FormField.optionalCUID('stage ID'),
  // LLM-context text fields use InjectionSafeOptional (refine on
  // detectPromptInjection). agentRole and prompt feed directly into
  // the LLM Directive section at agentExecutionEngine.ts:2078.
  agentRole: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Agent role'),
  prompt: InjectionSafeOptional(FIELD_LIMITS.CONTENT, 'Prompt'),
  // String variant has injection refine. Object variant is covered by
  // safeRecord's stripDangerousKeys transform.
  inputContext: FormField.optional(z.union([
    z.string().max(FIELD_LIMITS.EXTENDED_CONTENT)
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Input context contains HTML tags or instruction override patterns. Please use plain text.'
      }),
    safeRecord(),
  ])),
  maxRetries: FormField.optional(z.number().int().min(0).max(RUNTIME_LIMITS.MAX_RETRIES)),
  timeout: FormField.optional(z.number().int().min(0).max(3600000)),
  agentTemplateId: FormField.optionalCUID('agent template ID'),
  metadata: FormField.optional(safeRecord()),
  // ── BC76 site #7 (2026-05-14): 4 fields the handler reads but the
  //    schema previously stripped. Phase 0 confirmed 272 prod tasks have
  //    outputArtifacts — without these declarations, the read-swap would
  //    silently null all of them. (executionStatus was the 5th until F1
  //    2026-07-25 — see the tombstone below.)
  assigneeId: FormField.optionalCUID('assignee ID'),
  // F1 (2026-07-25): executionStatus deliberately absent — engine-owned.
  // Its BC76 declaration existed so the POV-PUT read-swap would not null the 164 prod
  // rows that carry a value; since SYNTHESIS §1.9 the handler omits the field from ALL
  // three write branches (put.ts :592-594 update, :647 temp-id create, :698 no-id create),
  // so declaring it now protects nothing and only advertises a field that is silently
  // dropped. Stripping here also closes the derive-later trap: the promotion planned in
  // this file's header (CreateTaskSchema/UpdateTaskSchema derived from this shape via
  // .extend()) would otherwise re-open F1 in both REST schemas at once. Do not re-add.
  agentLog: InjectionSafeOptional(FIELD_LIMITS.CONTENT, 'Agent log'),
  // Written as an array of artifact refs (agentExecutionEngine.ts:1917 .map());
  // 100% of non-null prod rows are arrays. Must validate array, not object.
  outputArtifacts: FormField.optional(z.array(safeRecord())),
  // modelParameters arrives at task object level (frontend normalizer at
  // components/poveditor/pov/context/utils/normalizer.ts:491-501); the
  // handler routes it INTO metadata.modelParameters at put.ts:526-556.
  // R-2 (2026-06-17): was safeRecord() (uncapped freeform) — now the shared
  // ModelParametersPassthroughSchema, which caps the known runtime-ceiling
  // fields (maxTokens/temperature/topP/maxToolTurns/thinkingBudgetTokens) on
  // this USER-reachable path while preserving unknown forward-compat keys +
  // the proto-strip. Same SSOT shape as the template/MCP write paths.
  modelParameters: FormField.optional(ModelParametersPassthroughSchema)
});

/**
 * Inferred type for the nested task input shape. Use this when typing
 * downstream consumers (TaskService, frontend payload builders).
 */
export type NestedTaskInput = z.infer<typeof NestedTaskInputSchema>;
