/**
 * Form Field Validation Patterns
 *
 * Reusable patterns for form field validation that handle null values
 * from HTML forms and React Hook Form.
 *
 * Problem: Forms send `null` for empty fields, but `.optional()` only accepts `undefined`
 * Solution: Use `.optional().nullable().transform(val => val ?? undefined)`
 *
 * @see /cline_docs/reviews/schema-validation-audit-2025-11-03/
 * @see /cline_docs/reviews/schema-validation-high-priority-fixes-2025-11-03/
 */
import { z } from 'zod';

/**
 * Generic optional field helper that accepts null or undefined
 * Transforms null to undefined for consistent optionality
 *
 * @example
 * metadata: OptionalField(z.record(z.any()))
 * customEnum: OptionalField(z.nativeEnum(CustomEnum))
 */
export const OptionalField = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .optional()
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Optional string field that accepts null or undefined
 * Use for form text inputs, textareas
 *
 * @param maxLength Maximum string length (default: 255)
 * @returns Zod schema that accepts string | undefined (transforms null)
 *
 * @example
 * description: OptionalString(5000)
 * notes: OptionalString(1000)
 */
export const OptionalString = (maxLength = 255) =>
  z.string()
    .max(maxLength, `Maximum ${maxLength} characters`)
    .optional()
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Optional number field that accepts null or undefined
 * Use for form number inputs
 *
 * @param min Minimum value (default: 0)
 * @param max Maximum value (default: Number.MAX_SAFE_INTEGER)
 * @returns Zod schema that accepts number | undefined (transforms null)
 *
 * @example
 * estimatedHours: OptionalNumber(0, 1000)
 * age: OptionalNumber(0, 120)
 */
export const OptionalNumber = (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.number()
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`)
    .optional()
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Optional datetime field that accepts null or undefined
 * Use for form date/time pickers
 *
 * @returns Zod schema that accepts ISO datetime string | undefined (transforms null)
 *
 * @example
 * dueDate: OptionalDateTime()
 * startDate: OptionalDateTime()
 */
export const OptionalDateTime = () =>
  z.string()
    .datetime('Invalid datetime format')
    .optional()
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Optional array field that accepts null or undefined
 * Use for multi-select inputs, tag inputs
 *
 * @param itemSchema Schema for array items
 * @returns Zod schema that accepts array<T> | undefined (transforms null)
 *
 * @example
 * tags: OptionalArray(z.string().max(50))
 * permissions: OptionalArray(z.nativeEnum(Permission))
 */
export const OptionalArray = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.array(itemSchema)
    .optional()
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Optional CUID field — FORM-FRIENDLY semantics.
 *
 * Accepts CUID, `null`, or `undefined`. **Transforms `null` → `undefined`**
 * (so Prisma skips the column on write rather than writing NULL).
 *
 * Use for: form text inputs where blank-text or null arrives from the UI —
 * fields where "no value" means "omit, don't clear."
 *
 * Consume via `FormField.optionalCUID(...)`, not by importing this export
 * directly. Direct-import callers should use `OptionalCUIDStrict` from
 * `lib/validation/id-validation.ts` if they want null-rejection semantics
 * (the opposite of this function).
 *
 * @param fieldName Field name for error messages
 * @returns Zod schema that accepts CUID | null | undefined (transforms null → undefined)
 *
 * @example
 * phaseId: FormField.optionalCUID('phase ID')      // form-friendly
 * assigneeId: FormField.optionalCUID('assignee ID')
 */
export const OptionalCUID = (fieldName: string) =>
  z.preprocess(
    // Forms send '' for "unassigned" (e.g. an empty <select>); treat blank/null
    // as absent BEFORE the CUID check so optional fields aren't rejected.
    (val) => (val == null || (typeof val === 'string' && val.trim() === '') ? undefined : val),
    z.string()
      .cuid(`Invalid ${fieldName} format - expected CUID`)
      .optional()
  );

/**
 * Required field that accepts null but transforms to undefined
 * Use when field is logically required but form may send null initially
 *
 * @param schema Base schema
 * @returns Schema that accepts null but normalizes to undefined
 *
 * @example
 * requiredField: RequiredNullable(z.string().min(1))
 */
export const RequiredNullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullable()
    .transform(val => val ?? undefined);

/**
 * Convenience object export for easier imports
 *
 * @example
 * import { FormField } from '@/lib/validation/form-field-patterns';
 *
 * description: FormField.optionalString(5000),
 * estimatedHours: FormField.optionalNumber(0, 1000)
 */
export const FormField = {
  optionalString: OptionalString,
  optionalNumber: OptionalNumber,
  optionalDateTime: OptionalDateTime,
  optionalArray: OptionalArray,
  optionalCUID: OptionalCUID,
  requiredNullable: RequiredNullable,
  optional: OptionalField,
};
