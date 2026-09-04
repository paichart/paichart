/**
 * Phase Template Validation Schemas
 *
 * Security: Import injection prevention, circular dependency detection
 * - Prompt injection detection on text fields
 * - Whitelist-based type/priority enums
 * - Size limits on arrays and strings
 * - Circular dependency detection in task graph
 *
 * @version 1.0.0
 * @author Security Team (Quarterly Review Nov 2025 - P0 Fix #3)
 */

import { z } from 'zod';
import { detectPromptInjection } from '../security/prompt-injection-prevention';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { PhaseType, TaskPriority } from '@prisma/client';
import { safeRecord } from './zod-helpers';
import { PrismaEnum } from './enum-validation';

/**
 * Task within a stage
 */
const TemplateTaskSchema = z.object({
  id: FormField.optionalString(FIELD_LIMITS.LABEL),
  key: FormField.optionalString(FIELD_LIMITS.LABEL),
  title: z.string()
    .min(1, 'Task title is required')
    .max(FIELD_LIMITS.TITLE, 'Task title too long')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Task title contains prompt injection patterns. Please use plain text.'
    })
    .nullable()
    .optional()
    .transform(val => val ?? undefined),
  name: FormField.optionalString(FIELD_LIMITS.TITLE),
  description: z.string()
    .max(2000, 'Task description too long')
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Task description contains prompt injection patterns. Please use plain text.'
    })
    .nullable()
    .optional()
    .transform(val => val ?? undefined),
  priority: FormField.optional(z.nativeEnum(TaskPriority)),
  // Use PrismaEnum to prevent BC75 sibling drift — task templates instantiate as Task rows (Task.type: TaskType)
  type: FormField.optional(PrismaEnum.taskType),
  metadata: FormField.optional(safeRecord()),
  dependencies: FormField.optional(
    z.array(z.string().max(FIELD_LIMITS.LABEL)).max(20, 'Too many dependencies (max 20)')
  )
});

/**
 * Stage within a phase template
 */
const TemplateStageSchema = z.object({
  name: z.string()
    .min(1, 'Stage name is required')
    .max(255, 'Stage name too long')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Stage name contains prompt injection patterns. Please use plain text.'
    }),
  description: z.string()
    .max(1000, 'Stage description too long')
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Stage description contains prompt injection patterns. Please use plain text.'
    })
    .nullable()
    .optional()
    .transform(val => val ?? undefined),
  order: FormField.optional(z.number().int().min(0)),
  metadata: FormField.optional(safeRecord()),
  tasks: FormField.optional(
    z.array(TemplateTaskSchema).max(100, 'Too many tasks in stage')
  ).transform(val => val ?? [])
});

/**
 * Phase Template Schema with comprehensive validation
 *
 * Enforces:
 * - Prompt injection detection on all text fields
 * - Type-safe enums from Prisma
 * - Size limits (50 stages max, 100 tasks per stage)
 * - Circular dependency detection in task graph
 */
export const PhaseTemplateSchema = z.object({
  name: z.string()
    .min(1, 'Template name is required')
    .max(255, 'Template name too long')
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Template name contains prompt injection patterns. Please use plain text.'
    }),
  description: z.string()
    .max(1000, 'Description too long')
    .refine((val) => !val || detectPromptInjection(val).isSafe, {
      message: 'Description contains prompt injection patterns. Please use plain text.'
    })
    .nullable()
    .optional()
    .transform(val => val ?? ''),
  type: z.nativeEnum(PhaseType, {
    errorMap: () => ({ message: 'Invalid template type' })
  }).default(PhaseType.PLANNING),
  isDefault: z.boolean().default(false),
  stages: z.array(TemplateStageSchema)
    .min(1, 'At least one stage is required')
    .max(50, 'Too many stages (max 50)')
}).refine((data) => {
  // SECURITY: Validate no circular dependencies in task graph using DFS
  const allTasks = new Map<string, string[]>();

  // Collect all task IDs and their dependencies
  data.stages.forEach((stage, stageIdx) => {
    stage.tasks?.forEach((task, taskIdx) => {
      const taskId = task.id || task.key || `task-${stageIdx}-${taskIdx}`;
      const deps = task.dependencies || [];
      allTasks.set(taskId, deps);
    });
  });

  // Check for circular dependencies using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const MAX_DFS_DEPTH = 100; // BC30: prevent stack overflow on deep chains

  function hasCycle(taskId: string, depth = 0): boolean {
    if (depth > MAX_DFS_DEPTH) return true; // BC30: depth guard — treat excessively deep chains as cyclic
    if (recStack.has(taskId)) return true; // Circular dependency detected
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recStack.add(taskId);

    const deps = allTasks.get(taskId) || [];
    for (const dep of deps) {
      if (hasCycle(dep, depth + 1)) return true;
    }

    recStack.delete(taskId);
    return false;
  }

  for (const taskId of Array.from(allTasks.keys())) {
    if (hasCycle(taskId)) {
      return false; // Circular dependency found
    }
  }

  return true; // No circular dependencies
}, {
  message: 'Circular dependencies detected in task graph'
});

/**
 * Import phase templates request schema
 *
 * Enforces:
 * - templates array required
 * - validateOnly flag (for dry-run imports)
 * - overwrite and createMissing options
 */
export const ImportPhaseTemplatesSchema = z.object({
  templates: z.array(PhaseTemplateSchema)
    .min(1, 'At least one template required')
    .max(100, 'Too many templates (max 100)'),
  options: z.object({
    validateOnly: z.boolean().default(false),
    overwrite: z.boolean().default(false),
    createMissing: z.boolean().default(false)
  }).optional().default({})
});

/**
 * Type exports
 */
export type PhaseTemplateInput = z.infer<typeof PhaseTemplateSchema>;
export type ImportPhaseTemplatesInput = z.infer<typeof ImportPhaseTemplatesSchema>;
