/**
 * Centralized ID validation helpers
 *
 * Database Reality: All 42 models use CUID format (@id @default(cuid()))
 * Example CUID: cmh4fnoe80000yxt5685r9flh
 *
 * @see /cline_docs/reviews/uuid-to-cuid-validation-fix-2025-11-03/
 * @see /.claude/knowledge/patterns/id-validation-pattern.md (when created)
 */
import { z } from 'zod';

/**
 * Base CUID validator
 * Matches Prisma @default(cuid()) format
 */
export const ValidCUID = z.string().cuid();

/**
 * Required CUID field with custom error message
 * @example povId: RequiredCUID('POV ID')
 */
export const RequiredCUID = (fieldName: string) =>
  z.string({ required_error: `${fieldName} is required` })
    .cuid(`Invalid ${fieldName} format - expected CUID`);

/**
 * Optional CUID field — STRICT semantics.
 *
 * Accepts a valid CUID string or `undefined`. **Rejects `null`.**
 *
 * Use for: action parameters, bulk operation inputs, query-string IDs —
 * fields where "no value" means "omit the field," not "send null."
 *
 * For form-friendly null→undefined transform semantics
 * (accepts null and transforms it away), use `FormField.optionalCUID` from
 * `lib/validation/form-field-patterns.ts` instead.
 *
 * Naming convention: the `Strict` suffix disambiguates from `FormField.optionalCUID`
 * since both serve the "optional CUID" purpose but with different null behavior.
 * Renamed 2026-05-15 (BC75 §Task-Shape Sibling Drift adjacent finding).
 *
 * @example taskId: OptionalCUIDStrict('task ID')  // bulk action input — rejects null
 */
export const OptionalCUIDStrict = (fieldName: string) =>
  z.string()
    .cuid(`Invalid ${fieldName} format - expected CUID`)
    .optional();

/**
 * Nullable CUID field — STRICT semantics.
 *
 * Accepts CUID, `null`, or `undefined`. Preserves `null` (does NOT transform to undefined).
 *
 * For form-friendly null→undefined transform, use `FormField.optionalCUID` from
 * `lib/validation/form-field-patterns.ts`.
 *
 * @example templateId: NullableCUIDStrict('template ID')
 */
export const NullableCUIDStrict = (fieldName: string) =>
  z.string()
    .cuid(`Invalid ${fieldName} format - expected CUID`)
    .nullable()
    .optional();

/**
 * Array of CUID strings with custom error message
 * @example phaseIds: ArrayOfCUIDs('phase IDs')
 */
export const ArrayOfCUIDs = (fieldName: string) =>
  z.array(z.string().cuid(`Invalid ${fieldName} format - expected CUID`));

// Domain-specific ID validators (for clarity and reusability)
export const POVId = RequiredCUID('POV ID');
export const TaskId = RequiredCUID('task ID');
export const PhaseId = RequiredCUID('phase ID');
export const StageId = RequiredCUID('stage ID');
export const UserId = RequiredCUID('user ID');
export const TeamId = RequiredCUID('team ID');
export const TemplateId = RequiredCUID('template ID');
export const AutomationId = RequiredCUID('automation ID');
export const ResourceId = RequiredCUID('resource ID');
export const MCPToolId = RequiredCUID('MCP tool ID');

// Optional variants (strict semantics — reject null)
export const OptionalPOVId = OptionalCUIDStrict('POV ID');
export const OptionalPhaseId = OptionalCUIDStrict('phase ID');
export const OptionalStageId = OptionalCUIDStrict('stage ID');
export const OptionalAssigneeId = OptionalCUIDStrict('assignee ID');
export const OptionalTaskId = OptionalCUIDStrict('task ID');
export const OptionalTemplateId = OptionalCUIDStrict('template ID');

// ========================================
// Inline Validation Helpers (for routes without schemas)
// Added: 2025-11-07 (consistency improvement)
// ========================================

/**
 * Validate CUID format for inline checks (e.g., DELETE endpoints with no body)
 *
 * Use this when you need to validate an ID in a route without creating a full Zod schema.
 * Maintains consistency with Zod CUID validation.
 *
 * @param id - The ID to validate
 * @param fieldName - Human-readable field name for error messages
 * @returns { valid: boolean, error?: string }
 *
 * @example
 * const check = validateCUIDFormat(params.phaseId, 'phase ID');
 * if (!check.valid) {
 *   return NextResponse.json({ error: check.error }, { status: 400 });
 * }
 */
export function validateCUIDFormat(id: string | undefined, fieldName: string): { valid: boolean; error?: string } {
  if (!id) {
    return { valid: false, error: `${fieldName} is required` };
  }

  // CUID format: c[a-z0-9]{24} (matches Prisma @default(cuid()))
  if (!id.match(/^c[a-z0-9]{24}$/)) {
    return { valid: false, error: `Invalid ${fieldName} format (expected CUID, got: ${id.substring(0, 10)}...)` };
  }

  return { valid: true };
}

/**
 * Validate multiple CUIDs (for bulk operations)
 *
 * @param ids - Array of IDs to validate
 * @param fieldName - Field name for error messages (plural)
 * @returns { valid: boolean, errors?: string[] }
 *
 * @example
 * const check = validateCUIDFormats(phaseIds, 'phase IDs');
 * if (!check.valid) {
 *   return NextResponse.json({ error: 'Invalid IDs', details: check.errors }, { status: 400 });
 * }
 */
export function validateCUIDFormats(ids: string[] | undefined, fieldName: string): { valid: boolean; errors?: string[] } {
  if (!ids || ids.length === 0) {
    return { valid: false, errors: [`${fieldName} array is required and must not be empty`] };
  }

  const errors: string[] = [];
  ids.forEach((id, index) => {
    const check = validateCUIDFormat(id, `${fieldName}[${index}]`);
    if (!check.valid && check.error) {
      errors.push(check.error);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
