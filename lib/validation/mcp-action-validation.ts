/**
 * MCP Task Action API Validation
 * Comprehensive input validation for MCP task action endpoint
 * 
 * CRITICAL SECURITY: This API has elevated MCP access and needs strict validation
 * 
 * @version 1.0.0
 * @author Validation-Engine Specialist
 */

import { z } from 'zod';
import { Priority, TaskType, PhaseType } from '@prisma/client';
import { ValidationSchemas } from './input-validation-framework';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { mcpLogger } from '@/lib/logger';
import { safePassthrough, safeRecord, InjectionSafeOptional } from './zod-helpers';
import { ModelParametersPassthroughSchema } from './model-parameters';
import { RUNTIME_LIMITS } from './runtime-limits';
import { stripDangerousKeys, deepStripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { FIELD_LIMITS } from './field-limits';
import { FormField } from './form-field-patterns';
import { PrismaEnum } from './enum-validation';
import { OptionalCUIDStrict } from './id-validation';

const localLogger = mcpLogger.child({ module: 'MCPActionValidation' });

/**
 * Rich text field validation - allows markdown, emojis, unicode
 * Uses semantic pattern detection instead of character whitelists
 * Aligns with main task-validation.ts approach
 *
 * Default `FIELD_LIMITS.CONTENT` (50000) matches the limit used by
 * `task.description` and other content fields across the validation layer.
 * Keeps MCP intake aligned with POV PUT and direct REST writes — same
 * field-limit-alignment guarantee the FIELD_LIMITS constants exist to
 * provide (see Bug Class 75 § FIELD_LIMITS drift).
 *
 * @param maxLength Maximum string length (default: FIELD_LIMITS.CONTENT)
 */
const RichTextField = (maxLength: number = FIELD_LIMITS.CONTENT) => z.string()
  .max(maxLength, `Maximum ${maxLength} characters`)
  .refine((val) => !val || detectPromptInjection(val).isSafe, {
    message: 'Contains HTML tags or instruction override patterns. Markdown, emojis, and unicode are allowed.'
  });

/**
 * Simple text field validation - allows unicode but checks for injection
 * For short text fields like names, roles, titles (not full markdown content)
 * Aligns with FormField.optionalString pattern from main validation.
 *
 * Default `FIELD_LIMITS.NAME` (255) matches the limit used by entity
 * names across the validation layer.
 *
 * @param maxLength Maximum string length (default: FIELD_LIMITS.NAME)
 */
// BUG-BASIC-XSS-1 Phase 2.1 (2026-05-22): exported so tool-schemas.js (L1
// dispatch boundary) can wrap its 15+ unprotected free-text lookup fields
// with the same injection-rejection refinement that MCPActionRequestSchema
// (L3) applies. Defense-in-depth — L1 rejects loudly, L4 escapes silently.
export const SimpleTextField = (maxLength: number = FIELD_LIMITS.NAME) => z.string()
  .max(maxLength, `Maximum ${maxLength} characters`)
  .refine((val) => !val || detectPromptInjection(val).isSafe, {
    message: 'Contains HTML tags or instruction override patterns.'
  });

/**
 * Semantic Enum Mapping
 * Maps common user-friendly values to system enum values
 * Reduces friction from URGENT→HIGH, TODO→OPEN, etc.
 */
const SEMANTIC_ENUM_MAPPINGS: Record<string, Record<string, string>> = {
  priority: {
    'URGENT': 'HIGH',
    'CRITICAL': 'HIGH',
    'NORMAL': 'MEDIUM',
    'MINOR': 'LOW',
    'TRIVIAL': 'LOW'
  },
  status: {
    'TODO': 'OPEN',
    'PENDING': 'IN_PROGRESS',
    'DOING': 'IN_PROGRESS',
    'WORKING': 'IN_PROGRESS',
    'DONE': 'COMPLETED',
    'FINISHED': 'COMPLETED',
    'CLOSED': 'COMPLETED'
  },
  workflowType: {
    'UI_TESTING': 'UI_INTERACTION',
    'UI_TEST': 'UI_INTERACTION',
    'SCRAPING': 'ACTION',
    'SCRAPE': 'ACTION',
    'FORM': 'ACTION',
    'AUTOMATION': 'ACTION'
  },
  position: {
    'START': 'first',
    'BEGIN': 'first',
    'TOP': 'first',
    'END': 'last',
    'BOTTOM': 'last',
    'BETWEEN': 'middle',
    'CENTER': 'middle'
  },
  type: {
    'TODO': 'ACTION',
    'TASK': 'ACTION',
    'REVIEW': 'REVIEW',
    'CHECK': 'REVIEW',
    'MEET': 'MEETING',
    'CALL': 'MEETING'
  },
  analysisType: {
    'PERF': 'performance',
    'PERFORMANCE': 'performance',
    'INSIGHT': 'insights',
    'SUMMARY': 'summary',
    'REPORT': 'summary'
  }
};

/**
 * Parameter Alias Mappings
 * Centralizes all alias → canonical field mappings
 * Pattern: { alias: canonical } - alias gets copied to canonical if canonical is missing
 */
const PARAMETER_ALIAS_MAPPINGS: Record<string, string> = {
  // Snake_case → camelCase
  'task_name': 'taskName',
  'pov_id': 'povId',
  'due_date': 'dueDate',
  'agent_template_name': 'agentTemplateName',
  'agent_template_id': 'agentTemplateId',
  'task_id': 'taskId',
  'phase_id': 'phaseId',
  'stage_id': 'stageId',
  'team_id': 'teamId',
  'assignee_id': 'assigneeId',
  'assignee_name': 'assignee',       // BUG-002: snake_case assignee alias
  'team_name': 'teamName',           // BUG-002: snake_case team alias

  // Alternative naming → canonical
  'role': 'agentRole',
  'completionNotes': 'completionNote',
  'analyticsType': 'analysisType',

  // Common variations
  'taskTitle': 'title',
  'povTitle': 'title',
  'task_title': 'title',             // BUG-004: snake_case title alias
};

/**
 * Normalize parameter aliases to canonical names
 * Applies PARAMETER_ALIAS_MAPPINGS to convert aliases to canonical field names
 * @param data - Object with potential alias fields
 * @param contextAliases - Optional context-specific aliases (e.g., stageName→name only for stage.create)
 * @returns Object with normalized field names
 */
function normalizeAliases(
  data: Record<string, any>,
  contextAliases?: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = { ...data };
  const allAliases = { ...PARAMETER_ALIAS_MAPPINGS, ...contextAliases };

  for (const [alias, canonical] of Object.entries(allAliases)) {
    if (result[alias] !== undefined && result[canonical] === undefined) {
      result[canonical] = result[alias];
    }
  }

  return result;
}

/**
 * Apply semantic mapping to normalize user input
 * @param field - Field name (priority, status, etc.)
 * @param value - User-provided value
 * @returns Normalized value or original if no mapping exists
 *
 * EXPORTED 2026-07-25 so the tasks-action-router can apply it at ITS boundary. The router
 * safeParses MCPParameterSchemas directly, and every non-HTTP entry path reaches the router
 * WITHOUT passing through validateMCPActionRequest or the route's preNormalizeParameters — so
 * aliases were normalized on some transports and 400'd on others (BC75 sibling drift; live smoke
 * test 2026-07-25: task.list accepted URGENT, task.update rejected it). One alias table, applied
 * at the chokepoint every path crosses — do NOT add a third copy.
 */
export function applySemanticMapping(field: string, value: any): any {
  if (typeof value !== 'string') return value;

  const mapping = SEMANTIC_ENUM_MAPPINGS[field];
  if (!mapping) return value;

  const normalized = mapping[value.toUpperCase()];
  if (normalized) {
    localLogger.debug({ field, originalValue: value, normalizedValue: normalized }, 'Semantic enum mapped');
    return normalized;
  }

  return value;
}

// Allowed MCP actions (whitelist approach)
const ALLOWED_MCP_ACTIONS = [
  'pov.create',
  'pov.update',
  'task.create',
  'task.update',
  'task.assign',
  'task.complete',
  'task.comment',
  'stage.create',
  'agent.configure',
  'agent.assign',
  'agent.execute',
  'agent.status',
  'agent.results',
  'analytics.generate'
] as const;

export type MCPAction = typeof ALLOWED_MCP_ACTIONS[number];

// Base MCP request schema
export const MCPActionRequestSchema = z.object({
  action: z.enum(ALLOWED_MCP_ACTIONS, {
    errorMap: (issue, ctx) => {
      const received = (issue as any).received || 'unknown';
      const validActions = ALLOWED_MCP_ACTIONS.slice(0, 7); // Show first 7
      const moreCount = ALLOWED_MCP_ACTIONS.length - 7;

      return {
        message:
          `❌ Invalid action: "${received}"\n\n` +
          `Valid actions:\n` +
          validActions.map(a => `  • ${a}`).join('\n') +
          `\n  ... and ${moreCount} more\n\n` +
          `Common actions: task.create, task.update, agent.execute, pov.create\n\n` +
          `Example: { action: "task.update", parameters: { taskId: "...", status: "IN_PROGRESS" } }`
      };
    }
  }),
  
  parameters: safePassthrough() // BC27: Prevent prototype pollution
    .refine(
    (params) => {
      try {
        const paramString = JSON.stringify(params);
        return paramString.length <= 50000; // 50KB limit
      } catch { return false; } // BC30: stack overflow on deep nesting
    },
    'Parameters object too large or too deeply nested'
  ).refine(
    (params) => {
      try {
        const paramString = JSON.stringify(params).toLowerCase();
        return !/<script|javascript:|vbscript:|union\s+select|drop\s+table/i.test(paramString);
      } catch { return false; }
    },
    'Parameters contain dangerous injection patterns'
  ),
  
  taskId: ValidationSchemas.TASK_ID.optional(),
  assigneeId: ValidationSchemas.USER_ID.optional(),
  priority: ValidationSchemas.TASK_PRIORITY.optional(),
  
  metadata: safePassthrough() // BC27: Prevent prototype pollution
    .refine(
    (meta) => {
      try {
        const metaString = JSON.stringify(meta);
        return metaString.length <= 10000; // 10KB limit for metadata
      } catch { return false; } // BC30: stack overflow on deep nesting
    },
    'Metadata too large or too deeply nested'
  ).optional()
});

// Action-specific parameter validation schemas
export const MCPParameterSchemas = {
  'pov.create': z.object({
    title: SimpleTextField(500),
    description: RichTextField(50000).optional(),

    // Country identification (one required)
    countryName: ValidationSchemas.SAFE_NAME.optional(),
    countryCode: z.string().length(2).optional(),
    countryId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid country ID').optional(),

    // POV properties
    duration: z.number().min(7).max(730).optional(),  // 7 days to 2 years
    priority: ValidationSchemas.TASK_PRIORITY.optional(),
    createDefaultPhases: z.boolean().optional(),  // Default: true

    // Custom phases (optional). When supplied & non-empty, these OVERRIDE the
    // default 3-phase generation — the handler builds phases from this array
    // and ignores createDefaultPhases. Without this field the param is silently
    // stripped here (the three-layer MCP-param rule) and the handler falls back
    // to default names — the exact bug this field fixes (2026-06-09).
    // .strict() inner object rejects surplus keys loudly (e.g. an LLM passing
    // `order` — the handler owns ordering deterministically). Cap mirrors
    // `competitors` (.max(20)) — the closest small, user-named array sibling.
    // type is z.nativeEnum(PhaseType) (Prisma-sourced) to avoid enum drift.
    phases: z.array(z.object({
      name: SimpleTextField(255),
      type: z.nativeEnum(PhaseType),
      description: SimpleTextField(2000).optional()
    }).strict()).max(20).optional(),

    // Business details
    customerName: SimpleTextField(255).optional(),
    revenue: z.number().min(0).optional(),
    estimatedBudget: z.number().min(0).optional(),
    opportunityName: SimpleTextField(255).optional(),
    objective: SimpleTextField(2000).optional(),

    // Dates
    forecastDate: z.string().datetime().optional()  // POV forecast date
  }).refine(
    data => data.countryName || data.countryCode || data.countryId,
    { message: "One of countryName, countryCode, or countryId is required" }
  ),

  // Schema design per Option B plan v3.4 at
  // cline_docs/reviews/pov-update-spec-2026-05-15/option-b-implementation-plan.md
  // Auth: admin-only (D1 v3, customer-confirmed 2026-05-15). Handler at
  // lib/mcp/tasks/action/handlers/pov/pov-update-handler.ts adds explicit
  // admin role check before validatePOVAccess. .strict() rejects surplus
  // keys loudly. .refine() empty-update guard checks key count after
  // FormField transforms. phaseTemplateIds intentionally excluded (legacy
  // product feature, Steve 2026-05-15) — see parity-audit allowlist in
  // scripts/test-mcp-pov-update.ts.
  'pov.update': z.object({
    // POV identification — required (URL semantic equivalent)
    povId: ValidationSchemas.POV_ID,

    // ── Text fields with injection refines ──
    title: InjectionSafeOptional(FIELD_LIMITS.TITLE, 'Title', 1),
    description: InjectionSafeOptional(FIELD_LIMITS.METADATA, 'Description'),
    objective: InjectionSafeOptional(FIELD_LIMITS.DESCRIPTION, 'Objective'),
    customerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer name'),
    customerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer contact'),
    partnerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner name'),
    partnerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner contact'),
    solution: InjectionSafeOptional(FIELD_LIMITS.MODERATE_TEXT, 'Solution'),
    opportunityName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Opportunity name'),

    // ── Enums (Prisma source — auto-syncs) ──
    status: FormField.optional(PrismaEnum.povStatus),
    priority: FormField.optional(PrismaEnum.priority),
    salesTheatre: FormField.optional(PrismaEnum.salesTheatre),

    // ── Dates (string-only per D3 — AI clients send JSON) ──
    startDate: FormField.optional(z.string().datetime()),
    endDate: FormField.optional(z.string().datetime()),
    forecastDate: FormField.optional(z.string().datetime()),

    // ── Geographic CUIDs (strict per D4 — reject null) ──
    countryId: OptionalCUIDStrict('country ID'),
    regionId: OptionalCUIDStrict('region ID'),

    // ── Financial fields ──
    estimatedBudget: FormField.optional(
      z.union([z.string(), z.number()])
        .transform(val => typeof val === 'string' ? parseFloat(val) : val)
        .pipe(z.number().min(0).max(100000000))
    ),
    revenue: FormField.optional(
      z.union([z.string(), z.number()])
        .transform(val => typeof val === 'string' ? parseFloat(val) : val)
        .pipe(z.number().min(0).max(100000000))
    ),

    // ── Competitors (DoS cap + injection refine per BC75 sibling-drift closure 2026-05-15) ──
    competitors: FormField.optional(z.array(
      z.string().max(FIELD_LIMITS.NAME).refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Competitor contains HTML tags or instruction override patterns. Please use plain text.'
      })
    ).max(20)),

    // ── Team management (CUIDs strict per D4; DoS caps; handler delegates
    //    to lib/pov/services/team.ts:applyTeamUpdate inside $transaction) ──
    projectManager: OptionalCUIDStrict('project manager ID'),
    salesEngineers: FormField.optional(z.array(z.string().cuid()).max(50)),
    technicalTeam: FormField.optional(z.array(z.string().cuid()).max(50)),
    replaceTeamMembers: FormField.optional(z.boolean()),
    teamMembers: FormField.optional(z.array(z.object({
      userId: z.string().cuid(),
      role: PrismaEnum.teamRole
    })).max(100)),
    // phaseTemplateIds intentionally excluded per v3.1 (legacy product feature)

    // ── Metadata (BC27 stripping happens per-nested-field via safeRecord) ──
    metadata: FormField.optional(safeRecord())
  })
  .strict()  // Surplus keys rejected (loud failure per val-engine #10 + arch-review #11)
  .refine(
    // Empty-update guard — keys() check tolerates FormField null→undefined transforms.
    // Per D2 v2: MCP does NOT support null-clearing; null on text fields is silently
    // skipped (transform strips it) and null on CUID fields is rejected at parse.
    (data) => Object.keys(data).filter(k => k !== 'povId').length > 0,
    { message: 'At least one updatable field required besides povId' }
  )
  .transform(data => normalizeAliases(data)),  // MCP convention (snake_case → camelCase)

  'task.create': z.object({
    title: SimpleTextField(500),  // User content: unicode allowed
    description: RichTextField(50000).optional(),  // Rich text: markdown, emojis, unicode allowed
    povId: ValidationSchemas.POV_ID, // CRITICAL: Required to prevent orphaned tasks

    // Phase and stage
    phaseId: ValidationSchemas.PHASE_ID.optional(),
    stageId: ValidationSchemas.STAGE_ID.optional(),
    stageName: ValidationSchemas.SAFE_NAME.optional(),
    phaseName: ValidationSchemas.SAFE_NAME.optional(),

    // Task properties
    priority: ValidationSchemas.TASK_PRIORITY.optional(),
    status: ValidationSchemas.TASK_STATUS.optional(),
    type: z.nativeEnum(TaskType).optional(),
    dueDate: z.string().datetime().optional(),

    // Assignment
    assigneeId: ValidationSchemas.USER_ID.optional(),
    teamId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid team ID').optional(),

    // Ordering
    order: z.number().min(0).max(1000000).optional(),
    position: z.enum(['first', 'last', 'middle']).optional(),
    afterTask: ValidationSchemas.TASK_ID.optional(),
    beforeTask: ValidationSchemas.TASK_ID.optional(),

    // Hierarchy (future use)
    parentTask: ValidationSchemas.TASK_ID.optional(),

    // Pipeline dependencies (wire task execution order)
    dependencyIds: z.array(ValidationSchemas.TASK_ID).optional(),

    // CC7 (2026-07-15, program-harness design): the program interface contract — binding
    // shared design constants (IP/VLAN/ASN/naming plan) written atomically into the child's
    // inputContext.interfaceContract at create. Structured-object only (never prose; boundary
    // B1 — prose rides through head-keep truncation caps and R9 mutation). Size-bounded:
    // a realistic contract is single-digit KB; 64KB stringified is a generous runaway guard.
    // BC27 (2026-07-15 CC8 review, valeng Gap 2): DEEP dangerous-key strip — the contract is
    // nested user-shaped JSON that gets DB-persisted AND rendered into the child prompt; the
    // L1 shallow strip does not reach parameters.interfaceContract.*. Refine BEFORE transform
    // (a refine after a transform silently skips on failure — standing rule).
    interfaceContract: z.record(z.any()).superRefine((val, ctx) => {
      if (JSON.stringify(val).length > 65536) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'interfaceContract too large (max 64KB stringified)' });
      }
    }).transform((obj) => deepStripDangerousKeys(obj)).optional()
  }),

  'task.update': z.object({
    // Task identification (taskId OR task_name/taskName with POV context)
    taskId: ValidationSchemas.TASK_ID.optional(),
    task_name: SimpleTextField(500).optional(),  // Task lookup by name
    taskName: SimpleTextField(500).optional(),   // Alias for task_name
    pov_id: ValidationSchemas.POV_ID.optional(), // POV context for name lookup
    povId: ValidationSchemas.POV_ID.optional(),  // Alias for pov_id

    // Task fields to update
    title: SimpleTextField(500).optional(),
    description: RichTextField(50000).optional(),
    priority: ValidationSchemas.TASK_PRIORITY.optional(),
    status: ValidationSchemas.TASK_STATUS.optional(),
    dueDate: z.string().datetime().optional(),
    due_date: z.string().datetime().optional(),  // Snake_case alias
    assigneeId: ValidationSchemas.USER_ID.optional(),

    // Agent template assignment
    agentTemplateId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    agentTemplateName: SimpleTextField(255).optional(),
    agent_template_name: SimpleTextField(255).optional(),

    // Pipeline dependencies (replace existing dependencies)
    dependencyIds: z.array(ValidationSchemas.TASK_ID).optional(),

    // Metadata — shallow-merged into existing task.metadata by the handler.
    // Required for the Pipeline Harness protocol which records pipelineStageId
    // here after creating the child stage. 10KB size cap + dangerous-key strip
    // prevents prototype pollution and DoS.
    metadata: safeRecord()
      .refine(
        (m) => { try { return JSON.stringify(m).length <= 10000; } catch { return false; } },
        'Metadata too large (max 10KB serialized)'
      )
      .optional(),

    // Nested updates object (backward compatibility)
    updates: safePassthrough().optional()
  }).refine(
    data => data.taskId || data.task_name || data.taskName,
    { message: "Either taskId or task_name/taskName (with POV context) is required" }
  ).transform(data => normalizeAliases(data)),

  'task.assign': z.object({
    // Task identification (taskId OR taskTitle with POV context)
    taskId: ValidationSchemas.TASK_ID.optional(),
    taskTitle: SimpleTextField(500).optional(),  // Task lookup by title
    povId: ValidationSchemas.POV_ID.optional(),  // POV context for title lookup
    povTitle: SimpleTextField(500).optional(),   // POV lookup by title

    // Assignee (assigneeId OR assignee name/email lookup)
    assigneeId: ValidationSchemas.USER_ID.optional(),
    assignee: SimpleTextField(255).optional(),     // User lookup by name/email
    assigneeName: ValidationSchemas.SAFE_NAME.optional(),  // Alias

    // Team assignment
    teamId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid team ID').optional(),
    teamName: SimpleTextField(255).optional(),  // Team lookup by name

    // Assignment reason
    reason: RichTextField(5000).optional()
  // Wave C ZCO-1 fix (2026-05-23, Basic Tools validation Phase 3): converted
  // .transform.refine to .superRefine.transform per BUG-REGISTRY-003 class.
  // Refines see both raw + normalized aliases (taskTitle, assigneeName, etc).
  }).superRefine((data, ctx) => {
    if (!(data.taskId || data.taskTitle || (data as any).task_title || (data as any).taskName || (data as any).task_name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taskId'],
        message: 'Either taskId or taskTitle (with POV context) is required',
      });
    }
    if (!(data.assigneeId || data.assignee || data.assigneeName || (data as any).assignee_id || (data as any).assignee_name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assigneeId'],
        message: 'Either assigneeId or assignee/assigneeName is required',
      });
    }
  }).transform(data => normalizeAliases(data)),

  'task.complete': z.object({
    taskId: ValidationSchemas.TASK_ID,
    completionNote: RichTextField(5000).optional(),  // Rich text: markdown, emojis, unicode allowed
    completionNotes: RichTextField(5000).optional(),  // Alias for completionNote
    completedBy: ValidationSchemas.USER_ID.optional(),
    confidence: z.number().min(0).max(100).optional(),  // Pipeline scoring (0-100)
    summary: z.string().max(FIELD_LIMITS.SHORT_TEXT).optional(),  // Completion summary for harness
    // Audited dependency-guard override (completion-path unification P1-C2). Skips ONLY the
    // APPROVAL dep-guard; stamps the completedWithDependencyOverride fact. This action is the
    // ONLY surface that accepts it (bulk NEVER — panel ruling TD3).
    dependencyOverrideReason: SimpleTextField(500).optional()
  }).transform(data => normalizeAliases(data)),

  'task.comment': z.object({
    taskId: ValidationSchemas.TASK_ID.optional(),
    taskTitle: SimpleTextField(500).optional(),  // BUG-007: Support task title lookup
    povId: ValidationSchemas.POV_ID.optional(),  // For task title disambiguation
    povTitle: SimpleTextField(500).optional(),  // For task title disambiguation
    comment: RichTextField(5000),  // Rich text: markdown, emojis, @mentions allowed
    commentBy: ValidationSchemas.USER_ID.optional()
  }).refine(
    data => data.taskId || data.taskTitle,
    { message: "Either taskId or taskTitle is required" }
  ),

  'stage.create': z.object({
    phaseId: ValidationSchemas.PHASE_ID.optional(),
    phaseName: ValidationSchemas.SAFE_NAME.optional(),
    povId: ValidationSchemas.POV_ID.optional(),  // For phaseName lookup context

    // Stage identification (name OR stageName required)
    name: SimpleTextField(255).optional(),
    stageName: SimpleTextField(255).optional(),  // Alias for name
    description: RichTextField(5000).optional(),

    // Stage properties
    priority: ValidationSchemas.TASK_PRIORITY.optional(),

    // Ordering
    order: z.number().min(0).max(1000000).optional(),
    position: z.enum(['first', 'last', 'middle']).optional(),
    afterStage: ValidationSchemas.SAFE_NAME.optional(),
    beforeStage: ValidationSchemas.SAFE_NAME.optional()
  }).refine(
    data => data.phaseId || data.phaseName,
    { message: "Either phaseId or phaseName is required" }
  ).refine(
    data => data.name || data.stageName,
    { message: "Either name or stageName is required" }
  ).transform(data => normalizeAliases(data, { 'stageName': 'name' })),

  'agent.configure': z.object({
    taskId: ValidationSchemas.TASK_ID.optional(),

    // Agent template (ID OR name lookup)
    agentTemplateId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    agent_template_id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    agentTemplateName: SimpleTextField(255).optional(),
    agent_template_name: SimpleTextField(255).optional(),

    // Agent role (role OR agentRole)
    role: SimpleTextField(255).optional(),       // Alias for agentRole
    agentRole: SimpleTextField(255).optional(),  // Unicode allowed

    // Prompt configuration
    prompt: RichTextField(50000).optional(),  // Rich text: markdown, code examples (50KB)
    inputContext: safePassthrough().optional(),  // Execution context

    // Execution settings
    maxRetries: z.number().min(1).max(RUNTIME_LIMITS.MAX_RETRIES).optional(),
    // Timeout in SECONDS (30s–1hr range). Handler converts to milliseconds
    // before writing to task.timeout column (which stores ms, matching REST).
    // See: agent-configure-handler.ts:468 — `timeout * 1000`.
    // Drift bug pre-2026-05-15: handler stored raw seconds value as ms, causing
    // 60s timeouts to be interpreted as 60ms (instant timeout). Prod evidence:
    // 2 tasks with timeout=60 and timeout=450 before the fix.
    timeout: z.number().min(30).max(3600).optional(),

    // MCP configuration
    mcpToolId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
    mcpWorkflowId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
    mcpTools: z.array(z.string()).max(50).optional(),  // Tool selection (max 50)

    // Advanced configuration
    // R-2 (2026-06-17): was safePassthrough() (uncapped) — now the shared
    // ModelParametersPassthroughSchema (caps the known runtime-ceiling fields
    // on this USER-reachable MCP write path; unknown keys + proto-strip preserved).
    modelParameters: ModelParametersPassthroughSchema.optional(),
    workflow: safePassthrough().optional(),
    successMetrics: safePassthrough().optional(),
    executionType: z.enum(['immediate', 'scheduled', 'queued', 'batch']).optional()
  }).refine(
    data => data.role || data.agentRole || data.prompt || data.agentTemplateId || data.agent_template_id || data.agentTemplateName || data.agent_template_name,
    { message: "At least one of role/agentRole, prompt, agentTemplateId, or agentTemplateName is required" }
  ).transform(data => normalizeAliases(data)),

  'agent.assign': z.object({
    taskId: ValidationSchemas.TASK_ID,
    agentTemplateId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    // Wave C ACG-3 + ZCO-2 fix (2026-05-23, Basic Tools validation Phase 3):
    // previously `agent_template_id` was accepted at L1 but silently stripped
    // at L3 (no .transform(normalizeAliases)). Users got misleading
    // "template required" errors. Now accepts the snake_case alias AND
    // runs normalizeAliases. superRefine runs BEFORE transform so the
    // identifier check sees both raw + alias keys (defensive vs ZCO-1 class).
    agent_template_id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    agentTemplateName: SimpleTextField(255).optional(),  // BUG-008: Support template name lookup
    agent_template_name: SimpleTextField(255).optional(),  // Alias for Claude Desktop compatibility
    agentRole: SimpleTextField(255).optional()  // Unicode allowed, aligns with main validation
  }).superRefine((data, ctx) => {
    const hasId = data.agentTemplateId || data.agent_template_id;
    const hasName = data.agentTemplateName || data.agent_template_name;
    if (!hasId && !hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either agentTemplateId (or agent_template_id) or agentTemplateName (or agent_template_name) is required',
      });
    }
  }).transform(data => normalizeAliases(data)),

  'agent.execute': z.object({
    taskId: ValidationSchemas.TASK_ID,
    agentTemplateId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional(),
    inputContext: safePassthrough().optional(),
    // R-3 (2026-06-17): was max(5) — an unjustified outlier vs the platform-wide
    // 10 (runtime enforces no retry max, so validation is the only ceiling).
    maxRetries: z.number().min(1).max(RUNTIME_LIMITS.MAX_RETRIES).optional(),

    // Execution control
    priority: z.nativeEnum(Priority).optional(),
    scheduledFor: z.string().datetime().optional(),  // Schedule for future execution
    // Finding A (2026-06-18): overrideConfig.modelParameters is read at
    // agentTaskService.ts:159-160 at PRECEDENCE-0 (wins over task.metadata) on this
    // USER-reachable action — a third modelParameters door that was bypassing the R-2/R-4
    // caps. Type the nested modelParameters with the shared schema; passthrough the rest
    // of overrideConfig (agentRole/prompt/maxRetries/timeout/…) + strip dangerous keys.
    overrideConfig: z.object({
      modelParameters: ModelParametersPassthroughSchema.optional()
    }).passthrough().transform(stripDangerousKeys).optional()  // Override default config
  }),

  'agent.status': z.object({
    taskId: ValidationSchemas.TASK_ID.optional(),
    executionId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid execution ID').optional(),
    agentTemplateId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid agent template ID').optional()
  }),

  'agent.results': z.object({
    taskId: ValidationSchemas.TASK_ID.optional(),
    executionId: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/, 'Invalid execution ID').optional()
  }),

  'analytics.generate': z.object({
    povId: ValidationSchemas.POV_ID.optional(),
    analysisType: z.enum(['performance', 'insights']).optional(),
    analyticsType: z.enum(['performance', 'insights']).optional(),  // Alias
    timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
    filters: safePassthrough().optional(),

    // Output verbosity — aligned with the perform tool-level enum (tool-schemas.js:504) so the
    // two validation layers agree and `format` reaches the handler. The old
    // json|csv|markdown|html was dead config (no handler consumed it) and contradicted the tool
    // layer, making `format` unusable for analytics.generate.
    format: z.enum(['summary', 'detailed', 'raw']).optional()
  // Wave C ZCO-1 fix (2026-05-23, Basic Tools validation Phase 3): converted
  // .transform.refine to .superRefine.transform per BUG-REGISTRY-003 class.
  // Check considers both pre-normalized keys (analysisType, analyticsType).
  }).superRefine((data, ctx) => {
    if (data.analysisType === undefined && data.analyticsType === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysisType'],
        message: 'analysisType (or analyticsType) is required. Valid values: performance, insights. For agent execution data, use agent.status or agent.results actions.',
      });
    }
  }).transform(data => normalizeAliases(data))
};

/**
 * Validate MCP action request with action-specific parameter validation
 */
export function validateMCPActionRequest(body: any): {
  success: boolean;
  validatedData?: any;
  errors?: string[];
  securityIssues?: string[];
} {
  try {
    // First validate base MCP request structure
    const baseValidation = MCPActionRequestSchema.parse(body);
    
    // Then validate action-specific parameters
    const action = baseValidation.action as MCPAction;
    const parameterSchema = MCPParameterSchemas[action];

    // Apply semantic enum mapping to normalize user input (P0-6: Quick Win)
    const normalizedParameters = { ...baseValidation.parameters };
    Object.keys(normalizedParameters).forEach(key => {
      normalizedParameters[key] = applySemanticMapping(key, normalizedParameters[key]);
    });

    if (parameterSchema) {
      const paramValidation = parameterSchema.parse(normalizedParameters);
      
      return {
        success: true,
        validatedData: {
          ...baseValidation,
          parameters: paramValidation
        }
      };
    } else {
      // Action doesn't have specific parameter validation
      return {
        success: true,
        validatedData: baseValidation
      };
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      // CRITICAL FIX: Enhanced error messages showing what was sent vs expected
      const errors = error.errors.map(err => {
        const fieldPath = err.path.join('.');
        const fieldName = err.path[err.path.length - 1] as string;

        // Build helpful error message based on error type
        if (err.code === 'invalid_type') {
          if (err.received === 'undefined') {
            // Parameter is missing - check if user sent a variation
            const receivedParams = body?.parameters || {};
            const similarParams = Object.keys(receivedParams).filter(key =>
              key.toLowerCase().includes(fieldName.toLowerCase()) ||
              fieldName.toLowerCase().includes(key.toLowerCase())
            );

            if (similarParams.length > 0) {
              return `${fieldPath}: Required (you sent '${similarParams[0]}' but expected '${fieldName}')`;
            }

            // P3: Add example values for common parameters
            const exampleValues: Record<string, string> = {
              // IDs
              'taskId': 'cm123abcdef456',
              'povId': 'cm789ghijkl012',
              'phaseId': 'cm345mnopqr678',
              'stageId': 'cm901stuvwx234',
              'assigneeId': 'cm567yzabcd890',
              'teamId': 'cm234teamid567',
              'agentTemplateId': 'cmf6gvbkl0005yxvvqayf35ug',
              // Names (for lookup)
              'title': 'Task title',
              'description': 'Task description',
              'phaseName': 'Planning and Design',
              'stageName': 'Implementation',
              'name': 'Resource name',
              'taskName': 'Setup Infrastructure',
              'task_name': 'Setup Infrastructure',
              'teamName': 'Engineering Team',
              'assignee': 'john.smith@company.com',
              // Agent fields
              'role': 'Senior Developer',
              'agentRole': 'Code reviewer specializing in TypeScript',
              'prompt': 'Analyze the code for security vulnerabilities',
              'inputContext': '{"files": ["src/api.ts"], "focus": "security"}',
              // Task fields
              'comment': 'Your comment text',
              'type': 'ACTION',
              'position': 'first',
              'dueDate': '2025-01-15',
              'due_date': '2025-01-15'
            };

            const example = exampleValues[fieldName];
            let message = `${fieldPath}: Required but not provided`;

            if (example) {
              message += `\n\nExample: { ${fieldName}: "${example}" }`;
            }

            return message;
          }
          return `${fieldPath}: Expected ${err.expected} but received ${err.received}`;
        }

        if (err.code === 'invalid_string') {
          // Character validation or pattern mismatch
          if (err.validation === 'regex') {
            // Provide context-aware error messages based on field type
            const fieldValue = body?.parameters?.[fieldName] || body?.[fieldName];

            // Detect which validation pattern failed
            if (fieldPath.includes('name') || fieldPath.includes('Name')) {
              // SAFE_NAME pattern: [a-zA-Z0-9\s\-_.]
              const invalidChars = fieldValue?.match(/[^a-zA-Z0-9\s\-_.]/g);
              const invalidList = invalidChars ? [...new Set(invalidChars)].join(', ') : 'unknown';
              return `${fieldPath}: Contains invalid characters: ${invalidList}. Allowed: letters, numbers, spaces, hyphens, underscores, periods. Try replacing '&' with 'and' or use ID directly (e.g., phaseId instead of phaseName).`;
            } else {
              // SAFE_TEXT pattern: [a-zA-Z0-9\s\-_.!?():;,'"]
              const invalidChars = fieldValue?.match(/[^a-zA-Z0-9\s\-_.!?():;,'"]/g);
              const invalidList = invalidChars ? [...new Set(invalidChars)].join(', ') : 'unknown';
              return `${fieldPath}: Contains invalid characters: ${invalidList}. Allowed: letters, numbers, spaces, hyphens, underscores, periods, and common punctuation (!?():;,'"). Script tags and SQL injection patterns are blocked.`;
            }
          }
          return `${fieldPath}: ${err.message}`;
        }

        if (err.code === 'invalid_enum_value') {
          // P0-6: Add semantic mapping suggestions for common mistakes
          const fieldName = err.path[err.path.length - 1] as string;
          const mapping = SEMANTIC_ENUM_MAPPINGS[fieldName];
          let suggestionText = '';

          if (mapping) {
            const userValue = String(err.received || '').toUpperCase();
            const alternatives = Object.entries(mapping)
              .filter(([synonym]) => synonym !== userValue)
              .map(([synonym, canonical]) => `${synonym}→${canonical}`)
              .slice(0, 3)
              .join(', ');

            if (alternatives) {
              suggestionText = `\n💡 Did you mean: ${alternatives}`;
            }
          }

          return `${fieldPath}: Must be one of: ${err.options?.join(', ')} (you sent '${err.received}')${suggestionText}`;
        }

        // Default: Use path and message
        return `${fieldPath}: ${err.message}`;
      });

      // Check for security-related validation failures
      const securityIssues = errors.filter(err =>
        err.includes('injection') ||
        err.includes('dangerous') ||
        err.includes('unauthorized')
      );

      return {
        success: false,
        errors,
        securityIssues: securityIssues.length > 0 ? securityIssues : undefined
      };
    }

    return {
      success: false,
      errors: ['Validation system error'],
      securityIssues: ['Unknown validation error']
    };
  }
}

/**
 * Security analysis of current MCP task action API
 */
export const MCPSecurityAssessment = {
  CURRENT_VULNERABILITIES: [
    'No input validation on action parameter (injection risk)',
    'Unvalidated parameters object (direct database access)',
    'No size limits on request payload (DoS risk)', 
    'No parameter type checking (type confusion attacks)',
    'Metadata accepts any JSON (XSS/injection vector)'
  ],
  
  ATTACK_VECTORS: [
    'Malicious action strings could cause unexpected behavior',
    'Parameter injection through unvalidated JSON objects',
    'Large payloads could cause memory exhaustion',
    'Metadata could contain script injection for downstream consumers'
  ],
  
  BUSINESS_IMPACT: [
    'Complete MCP system compromise possible',
    'Database corruption through parameter injection',
    'Service denial through large payload attacks',
    'Cross-site scripting through metadata injection'
  ]
};

const MCPValidation = { validateMCPActionRequest, MCPParameterSchemas, MCPActionRequestSchema };
export default MCPValidation;