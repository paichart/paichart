/**
 * User Preferences Validation Schemas
 * P1-3 Security Fix: Comprehensive validation for user preferences
 *
 * @version 1.0
 * @created 2025-12-04
 * @security-fix P1-3 (sec-ops-specialist recommendation)
 */

import { z } from 'zod';
import { SalesTheatre } from '@prisma/client';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

/**
 * PUT /api/auth/profile body validation
 * All fields are optional (partial update) — at least one must be present.
 * Cross-field rule: newPassword requires currentPassword.
 */
export const ProfileUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(FIELD_LIMITS.LABEL, 'Name must be 100 characters or less')
    .trim()
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Name contains invalid characters or potential injection patterns',
    })
    .optional(),
  email: z.string()
    .email('Invalid email format')
    .max(FIELD_LIMITS.NAME, 'Email must be 255 characters or less')
    .toLowerCase()
    .optional(),
  currentPassword: z.string()
    .max(FIELD_LIMITS.LABEL, 'Password must be 100 characters or less')
    .optional(),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .max(FIELD_LIMITS.LABEL, 'New password must be 100 characters or less')
    .optional(),
}).strict().superRefine((data, ctx) => {
  if (data.newPassword && !data.currentPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Current password is required when setting a new password',
      path: ['currentPassword'],
    });
  }
});

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

// ✅ P1-3 FIX: User Preferences Schema (replaces manual validation)
export const UserPreferencesSchema = z.object({
  preferredSalesTheatre: z.nativeEnum(SalesTheatre, {
    errorMap: () => ({ message: 'Invalid sales theatre' })
  }).optional(),

  preferredCountryId: FormField.optionalCUID('preferredCountryId'),

  preferredRegionId: FormField.optionalCUID('preferredRegionId')
}).refine((data) => {
  // At least one field must be provided
  return data.preferredSalesTheatre !== undefined ||
         data.preferredCountryId !== undefined ||
         data.preferredRegionId !== undefined;
}, { message: 'At least one preference field must be provided' });
