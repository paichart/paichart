import { z } from 'zod';
import { KPIType } from '@prisma/client';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { FIELD_LIMITS } from './field-limits';

/**
 * KPI Validation Schemas
 * BC30 FIX: Replace TypeScript `as` casts with Zod validation
 * Pattern compliance: native-enum-pattern (z.nativeEnum prevents drift)
 * Pattern compliance: cross-domain-security-patterns (SAFE_TEXT on names)
 *
 * @created 2026-02-28 Session 7 Defensive Hardening
 * @updated 2026-03-14 KPI Service — native enum, SAFE_TEXT, current type
 */

// KPI types — use native enum to prevent drift with Prisma schema [PATTERN-11]
const KPITypeEnum = z.nativeEnum(KPIType);

// KPI target shape
const KPITargetSchema = z.object({
  value: z.number(),
  threshold: z.object({
    warning: z.number(),
    critical: z.number(),
  }).optional(),
});

/**
 * POST /api/pov/[povId]/kpi (type=template) - Create KPI template
 */
export const KPITemplateCreateSchema = z.object({
  name: z.string().min(1).max(255).refine(
    (val) => detectPromptInjection(val).isSafe,
    { message: 'Name contains invalid characters or potential injection patterns' }
  ),
  description: z.string().max(FIELD_LIMITS.DESCRIPTION).optional(),
  type: KPITypeEnum,
  isCustom: z.boolean().optional(),
  defaultTarget: z.unknown().optional(),
  calculation: z.string().max(FIELD_LIMITS.DESCRIPTION).optional(),
  visualization: z.string().max(FIELD_LIMITS.DESCRIPTION).optional(),
}).strict();

/**
 * PUT /api/pov/[povId]/kpi (type=template) - Update KPI template
 */
export const KPITemplateUpdateSchema = KPITemplateCreateSchema.partial().strict();

/**
 * POST /api/pov/[povId]/kpi (default) - Create KPI
 */
// Concrete type for calculator output [BOUNDARY-C1, DB-P2]
const KPICurrentSchema = z.object({
  value: z.number(),
  format: z.string().optional(),
  calculatedAt: z.string().optional(),
}).optional();

export const KPICreateSchema = z.object({
  templateId: z.string().cuid().optional(),
  name: z.string().min(1).max(255).refine(
    (val) => detectPromptInjection(val).isSafe,
    { message: 'Name contains invalid characters or potential injection patterns' }
  ),
  target: KPITargetSchema,
  current: KPICurrentSchema,
  weight: z.number().min(0).max(100).optional(),
}).strict();

/**
 * PUT /api/pov/[povId]/kpi (default) - Update KPI
 */
export const KPIUpdateSchema = z.object({
  name: z.string().min(1).max(255).refine(
    (val) => detectPromptInjection(val).isSafe,
    { message: 'Name contains invalid characters or potential injection patterns' }
  ).optional(),
  target: KPITargetSchema.optional(),
  current: KPICurrentSchema,
  weight: z.number().min(0).max(100).optional(),
}).strict();

export type KPITemplateCreateInput = z.infer<typeof KPITemplateCreateSchema>;
export type KPITemplateUpdateInput = z.infer<typeof KPITemplateUpdateSchema>;
export type KPICreateInput = z.infer<typeof KPICreateSchema>;
export type KPIUpdateInput = z.infer<typeof KPIUpdateSchema>;
