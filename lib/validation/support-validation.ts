/**
 * Support & Feature Request Validation
 *
 * Security-critical validation using EXISTING security infrastructure
 * Reuses: ValidationPatterns, detectPromptInjection, sanitizeTemplateVariable
 *
 * Prevents: XSS, SQL injection, prompt injection, DoS
 *
 * @see /lib/security/prompt-injection-prevention.ts (807 lines, 31 patterns)
 * @see /lib/validation/input-validation-framework.ts (ValidationPatterns)
 */

import { z } from 'zod';
import { SupportRequestPriority, FeatureRequestImpact } from '@prisma/client';
import { detectPromptInjection, sanitizeTemplateVariable } from '@/lib/security/prompt-injection-prevention';
import { FIELD_LIMITS } from '@/lib/validation/field-limits';
import { ValidationPatterns } from './input-validation-framework';
import { PrismaEnum } from './enum-validation';
import { FormField } from './form-field-patterns';

// ==================== Secure Text Helper ====================

/**
 * Multi-layer security for user text input
 * Uses EXISTING security patterns (no new dependencies)
 *
 * Layers:
 * 1. Max length (DoS prevention)
 * 2. Prompt injection detection (31 patterns)
 * 3. Script injection blocking (ValidationPatterns)
 * 4. SQL injection blocking (ValidationPatterns)
 */
const secureText = (maxLength: number, fieldName: string) =>
  z.string()
    .min(1, `${fieldName} required`)
    .max(maxLength, `${fieldName} too long (max ${maxLength} chars)`)
    .refine((val) => {
      // Use existing prompt injection detection (31 patterns!)
      const check = detectPromptInjection(val);
      return check.severity !== 'CRITICAL';
    }, {
      message: `${fieldName} contains dangerous injection patterns`
    })
    .refine((val) => {
      // BC15 FIX: Use positive-match patterns (not negative lookahead — O(n²) ReDoS)
      return !ValidationPatterns._SCRIPT_INJECTION_MATCH.test(val);
    }, {
      message: `${fieldName} contains script injection`
    })
    .refine((val) => {
      // BC15 FIX: Use positive-match patterns (not negative lookahead — O(n²) ReDoS)
      return !ValidationPatterns._SQL_INJECTION_MATCH.test(val);
    }, {
      message: `${fieldName} contains SQL injection patterns`
    })
    .transform((val) => {
      // Sanitize using existing function (HTML escape)
      return sanitizeTemplateVariable(val, { maxLength, allowHtml: false });
    });

// ==================== Support Request Validation ====================

/**
 * Support Request Creation
 * Endpoint: POST /api/support/request
 *
 * Security: Multi-layer defense using existing patterns
 */
export const CreateSupportRequestSchema = z.object({
  type: z.enum(['TECHNICAL', 'BILLING', 'FEATURE', 'BUG', 'OTHER'], {
    errorMap: () => ({ message: 'Invalid request type' })
  }),

  // Use Prisma enum to prevent drift
  priority: z.nativeEnum(SupportRequestPriority, {
    errorMap: () => ({ message: 'Invalid priority' })
  }).default(SupportRequestPriority.MEDIUM),

  // Secure text (31 patterns + sanitization)
  subject: secureText(200, 'Subject'),

  // Secure text (31 patterns + sanitization)
  description: secureText(5000, 'Description'),

  // Optional attachments (URLs only, validated)
  attachments: FormField.optional(
    z.array(
      z.string()
        .url('Invalid attachment URL')
        .max(FIELD_LIMITS.URL_LONG, 'URL too long')
        .regex(/^https:\/\//, 'Attachments must use HTTPS')
    ).max(5, 'Maximum 5 attachments')
  ),
}).strict();

export type CreateSupportRequest = z.infer<typeof CreateSupportRequestSchema>;

// ==================== Feature Request Validation ====================

/**
 * Feature Request Creation
 * Endpoint: POST /api/support/feature
 *
 * Security: Multi-layer defense using existing patterns
 */
export const CreateFeatureRequestSchema = z.object({
  // Secure text (31 patterns + sanitization)
  title: secureText(200, 'Title'),

  // Secure text (31 patterns + sanitization)
  description: secureText(5000, 'Description'),

  // Business case field (REQUIRED in Prisma)
  businessCase: secureText(2000, 'Business case'),

  // Category enum (UI-specific)
  category: z.enum(
    ['UI_UX', 'PERFORMANCE', 'INTEGRATION', 'SECURITY', 'REPORTING', 'OTHER'],
    { errorMap: () => ({ message: 'Invalid category' }) }
  ),

  // Use Prisma enum to prevent drift
  impact: z.nativeEnum(FeatureRequestImpact, {
    errorMap: () => ({ message: 'Invalid impact level' })
  }),

  // Is urgent flag (Prisma has @default(false))
  isUrgent: z.boolean().default(false).optional(),
}).strict();

export type CreateFeatureRequest = z.infer<typeof CreateFeatureRequestSchema>;
