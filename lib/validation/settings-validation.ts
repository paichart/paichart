/**
 * User Settings Validation
 *
 * Security-critical validation for user preferences
 * Prevents: Settings injection, path traversal, DoS
 *
 * Uses EXISTING security patterns (no new dependencies)
 * Matches: lib/settings/types/index.ts UserSettings type
 */

import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';

/**
 * User Settings Update
 * Endpoint: PUT /api/settings
 *
 * Security: Basic sanitization, size limits, whitelisted enums
 * Flexible: Allows existing handler to work unchanged
 */
export const UpdateUserSettingsSchema = z.object({
  // Theme object (matches UserSettings type)
  theme: FormField.optional(
    z.object({
      mode: z.enum(['light', 'dark', 'system']).optional(),
      primaryColor: FormField.optionalString(FIELD_LIMITS.ID),
      fontSize: z.enum(['small', 'medium', 'large']).optional(),
    }).passthrough().transform(stripDangerousKeys)  // Allow other theme fields
  ),

  // Strict timezone validation (prevent path traversal)
  timezone: FormField.optional(
    z.string()
      .max(100, 'Timezone too long')
      .regex(/^[a-zA-Z0-9/_-]+$/, 'Invalid timezone format')
      .refine(val => !val?.includes('..'), {
        message: 'Path traversal detected in timezone'
      })
  ),

  // Notification preferences (matches UserSettings type)
  notifications: FormField.optional(
    z.object({
      email: z.boolean(),
      inApp: z.boolean(),
      desktop: z.boolean(),
    }).partial()  // All fields optional when updating
  ),

  // Display preferences
  display: FormField.optional(
    z.object({
      dateFormat: FormField.optionalString(FIELD_LIMITS.ID),
      timeFormat: z.enum(['12h', '24h']).optional(),
      firstDayOfWeek: z.union([z.literal(0), z.literal(1)]).optional(),
    }).passthrough().transform(stripDangerousKeys)
  ),

  // Accessibility preferences
  accessibility: FormField.optional(
    z.object({
      reducedMotion: z.boolean().optional(),
      highContrast: z.boolean().optional(),
      screenReader: z.boolean().optional(),
    }).passthrough().transform(stripDangerousKeys)
  ),

  // Allow other fields (settings stored as Json in Prisma)
}).passthrough().transform(stripDangerousKeys);  // Flexible: allow additional settings fields

export type UpdateUserSettings = z.infer<typeof UpdateUserSettingsSchema>;

// ============================================================================
// Admin Settings
// ============================================================================

/**
 * System Settings Update Schema
 *
 * Security:
 * - ID enum whitelist (notifications, twoFactor, darkMode)
 * - Boolean validation
 * - Minimum 1 setting required
 *
 * Used by: PUT /api/admin/settings
 */
export const UpdateSystemSettingsSchema = z.array(
  z.object({
    id: z.enum(['notifications', 'twoFactor', 'darkMode']),
    value: z.boolean() // System settings are boolean toggles
  })
).min(1, 'At least one setting required');

export type UpdateSystemSettings = z.infer<typeof UpdateSystemSettingsSchema>;

/**
 * LLM Settings Update Schema
 *
 * Security:
 * - Provider enum whitelist
 * - URL validation for custom/ollama endpoints
 * - API key format validation (no XSS/injection in keys)
 * - Boolean validation for allowUserOverride
 *
 * Used by: PUT /api/admin/settings/llm
 */
export const UpdateLLMSettingsSchema = z.object({
  // 'gemini' removed 2026-08-05 with the Gemini LLM provider. 'ollama'/'custom' are left in
  // place — they were not part of that removal. No stored row used 'gemini' (verified in prod),
  // so tightening this enum cannot reject an existing settings payload on save.
  provider: z.enum(['anthropic', 'anthropic_sdk', 'ollama', 'custom'], {
    errorMap: () => ({
      message: 'Provider must be: anthropic, anthropic_sdk, ollama, or custom'
    })
  }),
  anthropicApiKey: z.string()
    .max(500, 'API key too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format')
    .optional(),
  /**
   * Explicit delete signal (2026-08-06). An ABSENT/empty `anthropicApiKey` means "leave the
   * stored key alone" — the form loads with an empty box because the GET never returns the
   * key, so treating empty as "delete" silently wipes the credential on any unrelated save.
   * Removing a key therefore needs its own signal rather than being inferred from emptiness.
   */
  clearAnthropicApiKey: z.boolean().optional(),
  // BC53 FIX: Enforce http(s) protocol to prevent file://, ftp://, etc.
  ollamaApiUrl: z.string()
    .url('Invalid Ollama API URL')
    .max(500, 'URL too long')
    .refine(
      (u) => u.startsWith('https://') || u.startsWith('http://'),
      'URL must use http or https protocol'
    )
    .optional(),
  customApiUrl: z.string()
    .url('Invalid custom API URL')
    .max(500, 'URL too long')
    .refine(
      (u) => u.startsWith('https://') || u.startsWith('http://'),
      'URL must use http or https protocol'
    )
    .optional(),
  customApiKey: z.string()
    .max(500, 'API key too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format')
    .optional(),
  allowUserOverride: z.boolean()
});

export type UpdateLLMSettings = z.infer<typeof UpdateLLMSettingsSchema>;
