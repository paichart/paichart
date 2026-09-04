/**
 * Reusable Zod schema helpers for common validation patterns.
 *
 * objectOrJsonString: Accepts a plain object or a JSON string, coercing strings to objects.
 * safePassthrough: z.object({}).passthrough() with prototype pollution prevention.
 * safeRecord: z.record(z.any()) with prototype pollution prevention.
 * InjectionSafeOptional: form-compat text field with detectPromptInjection refine.
 *
 * See: lib/utils/ensure-object.ts (runtime version for data layer)
 * See: lib/utils/sanitize-keys.ts (prototype pollution prevention)
 * See: lib/security/prompt-injection-prevention.ts (detectPromptInjection)
 * See: /.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md
 */

import { z } from 'zod';
import { stripDangerousKeys, deepStripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

/**
 * Zod schema that accepts a plain object or a JSON string, coercing to object.
 * Reports a Zod validation error on invalid JSON (strict behavior).
 *
 * Use at validation boundaries for fields that may arrive as JSON strings
 * due to MCP transport serialization of nested objects.
 */
export const objectOrJsonString = z.union([
  z.object({}).passthrough().transform(stripDangerousKeys),
  z.string().transform((str, ctx) => {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return stripDangerousKeys(parsed);
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected JSON object string, got: ' + typeof parsed
      });
      return z.NEVER;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON string'
      });
      return z.NEVER;
    }
  })
]);

/**
 * Safe passthrough schema — z.object({}).passthrough() with __proto__ stripping.
 * Drop-in replacement for z.object({}).passthrough() in validation schemas.
 *
 * Prevents prototype pollution (BC27) by stripping __proto__, constructor,
 * prototype keys before the object reaches application code.
 */
export const safePassthrough = () =>
  z.object({}).passthrough().transform(stripDangerousKeys);

/**
 * Safe record schema — z.record(z.any()) with __proto__ stripping.
 * Drop-in replacement for z.record(z.any()) in validation schemas.
 */
export const safeRecord = () =>
  z.record(z.any()).transform(stripDangerousKeys);

/**
 * Deep safe passthrough — strips dangerous keys recursively.
 * Use for deeply nested user-provided metadata/context objects.
 */
export const deepSafePassthrough = () =>
  z.object({}).passthrough().transform((obj) => deepStripDangerousKeys(obj));

/**
 * Injection-safe optional text field with form-compatible null handling.
 *
 * Pattern: max-length + prompt-injection refine + nullable + optional +
 * transform-null-to-undefined. Used pervasively in update schemas where
 * forms post null for empty inputs and the handler treats undefined as
 * "skip this field."
 *
 * `fieldName` is interpolated into the error message — keep it singular
 * (the message template uses "contains," not "contain"). Plural nouns
 * like "Notes" or "Objectives" need their own inline declarations.
 *
 * `minLength` defaults to 0; pass a positive value to require non-empty
 * content (e.g., pov title needs minLength=1).
 *
 * Promoted from lib/validation/pov.ts to zod-helpers.ts on 2026-05-15
 * after usage crossed 4+ files (per validation-engine specialist
 * 88% confidence recommendation, BC76 site #7 review session).
 */
export const InjectionSafeOptional = (max: number, fieldName: string, minLength = 0) => {
  const base = minLength > 0 ? z.string().min(minLength) : z.string();
  return base
    .max(max)
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: `${fieldName} contains HTML tags or instruction override patterns. Please use plain text.`,
    })
    .nullable()
    .optional()
    .transform((val) => val ?? undefined);
};
