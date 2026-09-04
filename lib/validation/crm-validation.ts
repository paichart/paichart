/**
 * CRM Validation Schemas
 * Replaces manual field checks in admin CRM endpoints
 *
 * @created 2026-02-19
 */

import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';

/**
 * POST /api/admin/crm/settings body validation
 * Replaces manual required-field check + isNaN range guards
 */
export const CRMSettingsSchema = z.object({
  // BC53 FIX: Enforce http(s) protocol to prevent file://, ftp://, etc.
  apiUrl: z.string()
    .url('Invalid API URL format')
    .max(FIELD_LIMITS.URL, 'API URL must be 500 characters or less')
    .refine(
      (u) => u.startsWith('https://') || u.startsWith('http://'),
      'URL must use http or https protocol'
    ),
  apiKey: z.string()
    .min(1, 'API key is required')
    .max(FIELD_LIMITS.SECRET, 'API key must be 500 characters or less'),
  clientId: z.string()
    .min(1, 'Client ID is required')
    .max(FIELD_LIMITS.NAME, 'Client ID must be 255 characters or less'),
  clientSecret: z.string()
    .min(1, 'Client secret is required')
    .max(FIELD_LIMITS.SECRET, 'Client secret must be 500 characters or less'),
  autoSync: z.coerce.boolean().optional().default(true),
  // syncInterval: minutes between syncs (5 min – 24 hours)
  syncInterval: z.coerce.number()
    .int()
    .min(5, 'Sync interval must be at least 5 minutes')
    .max(1440, 'Sync interval cannot exceed 1440 minutes (24 hours)')
    .optional()
    .default(30),
  retryAttempts: z.coerce.number()
    .int()
    .min(1, 'Retry attempts must be at least 1')
    .max(10, 'Retry attempts cannot exceed 10')
    .optional()
    .default(3),
});

export type CRMSettings = z.infer<typeof CRMSettingsSchema>;

/**
 * POST /api/admin/crm/sync body validation
 * Validates syncType enum; povId validated against DB in route (business logic)
 */
export const CRMSyncSchema = z.object({
  syncType: z.enum(['incremental', 'full'], {
    errorMap: () => ({ message: "syncType must be 'incremental' or 'full'" }),
  }).default('incremental'),
  // CUID if provided — DB existence check stays in route
  povId: FormField.optionalCUID('POV ID'),
});

export type CRMSync = z.infer<typeof CRMSyncSchema>;
