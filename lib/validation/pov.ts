import { z } from 'zod';
import { POVStatus, Priority, SalesTheatre, StageStatus, TeamRole, TaskStatus, TaskPriority } from '@prisma/client';
import { PhaseType } from '@/lib/types/phase';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { PrismaEnum } from './enum-validation';
import { POVId, OptionalCUIDStrict } from './id-validation';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { safeRecord, InjectionSafeOptional } from './zod-helpers';
import { NestedTaskInputSchema } from './task-shapes';

// Base schema without refinements (allows .extend() and .partial())
const povBaseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(1, 'Description is required'),
  startDate: z.date(),
  endDate: z.date(),

  // Geographic fields (Team tab) - CRITICAL ADDITIONS
  salesTheatre: z.nativeEnum(SalesTheatre, {
    errorMap: () => ({ message: 'Sales Theatre is required' })
  }),
  countryId: z.string().min(1, 'Country is required'),
  regionId: z.string().nullable().optional(),

  // Owner field (required in Prisma)
  ownerId: z.string().min(1, 'Owner is required'),

  // Team and optional fields
  teamId: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),

  metadata: z.object({
    customer: z.string(),
    teamSize: z.string(),
    successCriteria: z.string(),
    technicalRequirements: z.string(),
  }).nullable().optional(),
});

// Schema with date validation refinement
export const povSchema = povBaseSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

export const createPoVSchema = povBaseSchema.extend({
  status: z.nativeEnum(POVStatus).default(POVStatus.PROJECTED),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
}).refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

export const updatePoVSchema = povBaseSchema.partial().extend({
  status: z.nativeEnum(POVStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
});

export const phaseSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name too long (max 255 chars)')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Phase name contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  description: z.string()
    .min(1, 'Description is required')
    .max(2000, 'Description too long (max 2000 chars)')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Phase description contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  type: z.nativeEnum(PhaseType),
  startDate: z.date(),
  endDate: z.date(),
  order: z.number().min(0).max(1000000).optional(),  // Match task/stage validation (supports 1000 increment)
});

export const createPhaseSchema = phaseSchema;
export const updatePhaseSchema = phaseSchema.partial();

/**
 * Delete Multiple Phases Schema
 * Extracted from: lib/pov/handlers/delete.ts
 *
 * Validates bulk phase deletion with duplicate prevention
 */
export const DeleteMultiplePhasesSchema = z.object({
  // Database uses CUID format (@id @default(cuid()))
  phaseIds: z.array(z.string().cuid('Invalid phase ID format'))
    .min(1, 'At least one phase ID required')
    .max(50, 'Cannot delete more than 50 phases at once')
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'Duplicate phase IDs not allowed'
    })
});

export type DeleteMultiplePhases = z.infer<typeof DeleteMultiplePhasesSchema>;

/**
 * Update POV Schema (Comprehensive)
 * Extracted from: lib/pov/handlers/put.ts
 *
 * Validates POV updates with nested tasks, phases, stages
 */
export const UpdatePOVSchemaComprehensive = z.object({
  // Text fields with injection detection - use nullable + transform for form compatibility
  title: InjectionSafeOptional(FIELD_LIMITS.TITLE, 'Title', 1),
  description: InjectionSafeOptional(FIELD_LIMITS.METADATA, 'Description'),
  objective: InjectionSafeOptional(FIELD_LIMITS.DESCRIPTION, 'Objective'),

  // Use Prisma enums to prevent drift (already using FormField ✅)
  status: FormField.optional(PrismaEnum.povStatus),
  priority: FormField.optional(PrismaEnum.priority),

  // Dates - use FormField helper
  startDate: FormField.optional(z.string().datetime().or(z.date())),
  endDate: FormField.optional(z.string().datetime().or(z.date())),
  forecastDate: FormField.optional(z.string().datetime().or(z.date())),

  // Customer and partner info - use FormField helper
  customerName: FormField.optionalString(FIELD_LIMITS.NAME),
  customerContact: FormField.optionalString(FIELD_LIMITS.NAME),
  partnerName: FormField.optionalString(FIELD_LIMITS.NAME),
  partnerContact: FormField.optionalString(FIELD_LIMITS.NAME),

  // Financial fields - use FormField helper with union transform
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

  // Geographic fields (already using FormField ✅)
  salesTheatre: FormField.optional(PrismaEnum.salesTheatre),
  countryId: FormField.optionalCUID('country ID'),
  regionId: FormField.optionalCUID('region ID'),

  // Business fields - use FormField helper
  solution: FormField.optionalString(FIELD_LIMITS.MODERATE_TEXT),
  // 2026-05-15: injection refine added per BC75 sibling-drift follow-up.
  // Pre-existing drift: CreatePOVSchema (pov.ts:267-270) and CreatePOVDirectPathSchema
  // (pov.ts:338-342) both had the refine; Update side (this line) did not.
  // Closes the inconsistency — same injection-defense posture on every entry path.
  // Phase 0 (2026-05-15): 10 prod POVs have competitor values; all clean
  // (vendor names like "Palo Alto Networks", "Fortinet"). No retro-breakage risk.
  competitors: FormField.optional(z.array(
    z.string().max(FIELD_LIMITS.NAME).refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Competitor contains HTML tags or instruction override patterns. Please use plain text.'
    })
  ).max(20)),
  opportunityName: FormField.optionalString(FIELD_LIMITS.NAME),

  // Relations
  teamMembers: FormField.optional(z.array(z.object({
    userId: z.string().cuid(),
    role: PrismaEnum.teamRole
  }))),

  // Metadata
  metadata: FormField.optional(safeRecord()),

  // Nested task updates
  //
  // 2026-05-15: nested task shape extracted to lib/validation/task-shapes.ts
  // as `NestedTaskInputSchema`. BC75 prevention per arch-review-specialist's
  // BC76 site #7 final-gate recommendation — single source of truth for the
  // task shape across UpdatePOVSchemaComprehensive, future
  // MCPParameterSchemas['pov.update'] (spec at
  // cline_docs/spec-mcp-pov-update-2026-05-15.md), and eventually
  // CreateTaskSchema / UpdateTaskSchema. See task-shapes.ts for the field
  // inventory + refines + BC76 site #7 backstory.
  tasks: FormField.optional(z.array(NestedTaskInputSchema)),

  // F5 (2026-07-25): opt-in destruction. The handler used to DELETE every DB task for this POV
  // that was absent from `tasks` — so any caller sending a PARTIAL list silently destroyed the
  // omitted ones, with no confirmation and no soft-delete. We hit this ourselves during the
  // completion-arc probes and had to build a throwaway POV to test safely; an agent doing a
  // partial POV update would have wiped real work.
  //
  // Default FALSE is safe for every existing caller: the POV editor — the only client that sends
  // a task array — deletes tasks via an explicit DELETE /api/tasks/{id}
  // (components/poveditor/pov/sections/PhasesSection.tsx handleDeleteTask), NOT by omitting them
  // from the save. Delete-by-omission was never the GUI's deletion mechanism, so nothing needs
  // to opt in. Verified 2026-07-25; the residuals charter had assumed the opposite.
  deleteMissing: FormField.optional(z.boolean()),

  // ── Bug Class 81 site #5 fix (2026-08-19): explicit phase-deletion list ──
  // Phase deletion is now an EXPLICIT statement of intent, not inferred from payload
  // omission (the GUI's page-load snapshot omits phases created concurrently; the old
  // omission-diff deleted them, cascading to their stages). The editor tracks removed
  // real ids in ui.deletedPhaseIds and sends them here. Control flag like deleteMissing —
  // stripped before prisma.pOV.update.
  deletedPhaseIds: FormField.optional(z.array(z.string().cuid('Invalid phase ID format')).max(50)),

  // ── 2026-05-14 BC76 site #7: team-management side-fields ──
  // Previously survived only via outer `.passthrough()` (architectural
  // smell — implicit contract that breaks if anyone tightens the outer
  // schema). Declared explicitly with DoS caps + per-element CUID.
  projectManager: FormField.optionalCUID('project manager ID'),
  salesEngineers: FormField.optional(z.array(z.string().cuid()).max(50)),
  technicalTeam: FormField.optional(z.array(z.string().cuid()).max(50)),
  replaceTeamMembers: FormField.optional(z.boolean()),
  phaseTemplateIds: FormField.optional(z.array(z.string().cuid()).max(50)),

  // Nested stage updates
  stages: FormField.optional(z.array(z.object({
    id: FormField.optionalString(50),
    name: z.string().min(1).max(FIELD_LIMITS.NAME),
    description: FormField.optionalString(FIELD_LIMITS.MODERATE_TEXT),
    status: FormField.optional(z.nativeEnum(StageStatus)).transform(val => val ?? StageStatus.PENDING),
    order: z.number().int().min(0),
    phaseId: FormField.optionalCUID('phase ID')
  })).max(500)),
  // R-C3 (2026-06-17) capped this array to stop an unbounded nested write. Raised 50 → 500 on
  // 2026-08-16 after a live 400: the POV editor round-trips EVERY stage in the POV on every save,
  // so this bound is a LIFETIME budget for the POV, not a per-request batch size. It was originally
  // set to "mirror the stage-delete cap 50" — a category error, since that cap governs how many
  // stages one delete call may remove. The two are unrelated and are now DELIBERATELY different;
  // do not "restore consistency" by lowering this.
  //
  // Why it bit: a long-running POV accumulates stages (each pipeline/program run creates ~3). The
  // Live Exhibits POV reached 51 and became unsaveable through the GUI, with an error naming the
  // limit but not the POV's actual count. 500 ≈ 160 runs of headroom; the DoS property (a finite
  // bound) is unchanged.

  // Nested phase updates
  phases: FormField.optional(z.array(z.object({
    id: FormField.optionalCUID('phase ID'),
    name: z.string().min(1).max(FIELD_LIMITS.NAME),
    description: FormField.optionalString(FIELD_LIMITS.MODERATE_TEXT),
    // Use PrismaEnum to prevent BC75 sibling drift — Prisma Phase.type is PhaseType (default PLANNING)
    type: PrismaEnum.phaseType,
    order: z.number().int().min(0),
    startDate: FormField.optional(z.string().datetime().or(z.date())),
    endDate: FormField.optional(z.string().datetime().or(z.date()))
  })).max(20)) // R-C3 (2026-06-17): cap nested-phase array (mirrors mcp-action phases .max(20))
}).passthrough().transform(stripDangerousKeys);

export type UpdatePOVComprehensive = z.infer<typeof UpdatePOVSchemaComprehensive>;

/**
 * Create POV Schema
 * Extracted from: app/api/pov/route.ts (line 311)
 *
 * Fixed (Nov 2025):
 * - ✅ UUID → CUID (4 instances fixed)
 * - ✅ Hardcoded enums → z.nativeEnum (3 instances fixed)
 * - ✅ FormField helpers applied (P0 Fix #2 - Quarterly Review 2025-11-26)
 */
export const CreatePOVSchemaInline = z.object({
  // Template-based creation
  templateId: FormField.optionalCUID('template ID'),
  formData: z.object({
    // Core POV fields
    title: z.string()
      .min(1, 'Title is required')
      .max(FIELD_LIMITS.TITLE, 'Title too long')
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Title contains HTML tags or instruction override patterns. Please use plain text.'
      }),
    description: z.string()
      .min(1, 'Description is required')
      .max(FIELD_LIMITS.METADATA, 'Description too long')
      .refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Description contains HTML tags or instruction override patterns. Please use plain text.'
      }),
    objective: InjectionSafeOptional(FIELD_LIMITS.DESCRIPTION, 'Objective'),

    // Use Prisma enums to prevent drift
    status: z.nativeEnum(POVStatus),
    priority: z.nativeEnum(Priority),

    // Dates (validate order: start < end)
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    forecastDate: FormField.optional(z.string().datetime()),

    // Customer and partner info — InjectionSafeOptional adds the
    // .refine(detectPromptInjection) that FormField.optionalString lacked
    // (sibling fix to the 2026-05-14 P1 direct-path bypass; same fields,
    // same risk surface, parallel path through templateService).
    customerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer name'),
    customerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer contact'),
    partnerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner name'),
    partnerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner contact'),

    // Financial fields - use FormField for form compatibility
    estimatedBudget: FormField.optionalNumber(0, 100000000),
    budget: FormField.optionalNumber(0, 100000000),
    revenue: FormField.optionalNumber(0, 100000000),

    // Geographic fields (required)
    salesTheatre: z.nativeEnum(SalesTheatre).default(SalesTheatre.NORTH_AMERICA),
    countryId: z.string()
      .cuid('Invalid country ID format')
      .min(1, 'Country ID is required'),
    regionId: FormField.optionalCUID('region ID'),

    // Business fields — text fields use InjectionSafeOptional for refine.
    solution: InjectionSafeOptional(FIELD_LIMITS.MODERATE_TEXT, 'Solution'),
    competitors: FormField.optional(z.array(
      z.string().max(FIELD_LIMITS.NAME).refine((val) => detectPromptInjection(val).isSafe, {
        message: 'Competitor contains HTML tags or instruction override patterns. Please use plain text.'
      })
    ).max(20)),
    opportunityName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Opportunity name'),

    // Team members - use FormField for form compatibility
    teamMembers: FormField.optional(z.array(z.object({
      userId: z.string().cuid(),
      role: z.enum(['PROJECT_MANAGER', 'SALES_ENGINEER', 'TECHNICAL_TEAM'])
    })))
  }).refine((data) => {
    // Validate date order: startDate < endDate
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) < new Date(data.endDate);
    }
    return true;
  }, {
    message: 'Start date must be before end date'
  }).optional(),

  // Direct POV creation (alternative to template-based)
  //
  // SECURITY (2026-05-14, sec-ops review): every field actually read by the
  // POST /api/pov direct branch (app/api/pov/route.ts:574-604) must be
  // declared here. A prior bypass at route.ts:546 read raw request body
  // instead of validatedData; the route now reads validatedData, so any
  // field missing from this schema gets stripped before the Prisma write.
  // Text fields use InjectionSafeOptional for stored-XSS + prompt-injection
  // defense — the direct path is admin-gated but in-codebase agent templates
  // read POV.{solution,objective} into LLM prompts, so injection on these
  // fields is the headline attack surface for compromised-admin scenarios.
  title: z.string()
    .min(1)
    .max(FIELD_LIMITS.TITLE)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Title contains HTML tags or instruction override patterns. Please use plain text.'
    })
    .optional(),
  description: z.string()
    .max(FIELD_LIMITS.METADATA)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Description contains HTML tags or instruction override patterns. Please use plain text.'
    })
    .optional(),
  objective: InjectionSafeOptional(FIELD_LIMITS.DESCRIPTION, 'Objective'),
  // Step 3d: Fixed hardcoded enums → z.nativeEnum (prevents drift)
  status: z.nativeEnum(POVStatus).optional(),
  // Step 3e: Fixed hardcoded enum → z.nativeEnum (prevents drift)
  priority: z.nativeEnum(Priority).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  forecastDate: FormField.optional(z.string().datetime()),
  // Step 2e: Fixed UUID → CUID (database uses @default(cuid()))
  countryId: z.string().cuid().optional(),
  // Step 2f: Fixed UUID → CUID (database uses @default(cuid()))
  regionId: z.string().cuid().optional(),
  estimatedBudget: z.number().min(0).max(100000000).optional(),
  // `budget` is the legacy alias the route's fallback at route.ts:592 reads.
  // Keep in sync with estimatedBudget bounds.
  budget: z.number().min(0).max(100000000).optional(),
  revenue: z.number().min(0).max(100000000).optional(),
  // Step 3f: Fixed hardcoded enum → z.nativeEnum (prevents drift)
  salesTheatre: z.nativeEnum(SalesTheatre).optional(),
  customerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer name'),
  customerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Customer contact'),
  partnerName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner name'),
  partnerContact: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Partner contact'),
  solution: InjectionSafeOptional(FIELD_LIMITS.MODERATE_TEXT, 'Solution'),
  opportunityName: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Opportunity name'),
  competitors: z.array(
    z.string().max(FIELD_LIMITS.NAME).refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Competitor contains HTML tags or instruction override patterns. Please use plain text.'
    })
  ).max(20, 'Maximum 20 competitors allowed').optional(),
  teamMembers: z.array(z.object({
    // Step 2g: Fixed UUID → CUID (database uses @default(cuid()))
    userId: z.string().cuid(),
    role: z.enum(['PROJECT_MANAGER', 'SALES_ENGINEER', 'TECHNICAL_TEAM'])
  })).optional(),

  // Phase template IDs
  // Step 2h: Fixed UUID → CUID (database uses @default(cuid()))
  phaseTemplateIds: z.array(z.string().cuid()).optional()
}).refine((data) => {
  // Must have either templateId + formData OR direct fields
  const hasTemplate = data.templateId && data.formData;
  const hasDirect = data.title && data.description && data.status;
  return hasTemplate || hasDirect;
}, {
  message: 'Must provide either templateId with formData or direct POV fields'
});

export type CreatePOVInline = z.infer<typeof CreatePOVSchemaInline>;

// ========================================
// POV Import/Export schemas deleted 2026-05-15 alongside the orphan
// import/export flow. The whole feature was dead code: 0 production
// import attempts in the Activity log, 0 production export attempts,
// the only frontend caller (components/pov/ImportExportButtons.tsx)
// had zero parent imports, and the export/schema/service shapes were
// three-way incompatible (any round-trip would 400 at the service's
// "Missing updates object" check). Same orphan-cleanup pattern as
// the launch routes (40f1502c) and phase/reorder (8f01e04c).
// ========================================

// ========================================
// POV Launch schemas deleted 2026-05-14 alongside the launch routes
// (orphaned after the launch UI was removed in 7b5c8018). See commit
// chain in the same session for the cascade delete.
// ========================================

// ========================================
// Stage CRUD Validation Schemas
// Added: 2025-11-06 (Week 3 P2 - Group 3 Stage Management domain)
// ========================================

/**
 * Create Stage Schema
 *
 * Part of POV hierarchy: POV → Phase → Stage
 * XSS prevention on text fields, DoS prevention on arrays
 */
export const CreateStageSchema = z.object({
  phaseId: OptionalCUIDStrict('phaseId'),
  name: z.string()
    .min(1, 'Stage name is required')
    .max(255, 'Stage name must be 255 characters or less')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Stage name contains HTML tags or instruction override patterns. Please use plain text.'
    }),
  // SECURITY (2026-05-14 bug-class sweep, sibling to POV bypass): description
  // promoted from FormField.optionalString to InjectionSafeOptional so XSS /
  // prompt-injection refine fires. Stage description renders in POV editor UI.
  description: InjectionSafeOptional(FIELD_LIMITS.DESCRIPTION, 'Stage description'),
  status: PrismaEnum.stageStatus.default('PENDING'),
  type: z.enum(['MILESTONE', 'DELIVERABLE', 'APPROVAL', 'CUSTOM']).optional(),
  order: z.number().int().min(0).max(1000000).optional(),  // Match MCP validation (supports 1000 increment pattern)
  metadata: safeRecord().optional(),
  // Transient request hints — NOT stored as stage fields. Declared here so
  // the route handler can read them from validation.data (was filteredData
  // bypass per 2026-05-14 sweep). afterStage / beforeStage are stage names
  // used for relative positioning; position is a coarse first/last hint.
  afterStage: InjectionSafeOptional(FIELD_LIMITS.NAME, 'After-stage reference'),
  beforeStage: InjectionSafeOptional(FIELD_LIMITS.NAME, 'Before-stage reference'),
  position: z.enum(['first', 'last']).optional(),
});

/**
 * Update Stage Schema (Partial)
 */
export const UpdateStageSchema = CreateStageSchema.partial().extend({
  stageId: OptionalCUIDStrict('stageId'),
});

/**
 * Reorder Stages Schema with DoS Prevention
 */
export const ReorderStagesSchema = z.object({
  phaseId: OptionalCUIDStrict('phaseId'),
  stageIds: z.array(OptionalCUIDStrict('stageId'))
    .min(1, 'At least one stage ID required')
    .max(50, 'Maximum 50 stages allowed'), // DoS prevention
});

// Type exports
export type CreateStageInput = z.infer<typeof CreateStageSchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageSchema>;
export type ReorderStagesInput = z.infer<typeof ReorderStagesSchema>;
