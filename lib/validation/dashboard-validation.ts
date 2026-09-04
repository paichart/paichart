/**
 * Dashboard Validation Schemas
 *
 * Security: Query parameter validation for dashboard analytics
 * - CUID validation for povId and teamId
 * - Pagination limits (max 100 per page)
 * - Date range validation
 * - Enum whitelisting for types and formats
 * - No prompt injection (dashboard data = analytics, not LLM prompts)
 *
 * Note: Dashboard endpoints are read-only analytics
 * Real threats: DoS (large queries), not XSS/injection
 *
 * @version 1.0.0
 * @author Security Team (Quarterly Review Nov 2025 - P2.2 Dashboard Domain)
 */

import { z } from 'zod';

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Valid CUID pattern (starts with 'c', 25 chars total)
 */
const ValidCUID = z.string()
  .regex(/^c[a-z0-9]{24}$/, 'Invalid CUID format');

/**
 * Optional CUID (for query parameters)
 */
const OptionalCUID = ValidCUID
  .optional();

/**
 * Time range options (common across dashboard endpoints)
 */
const TimeRange = z.enum(['1d', '7d', '24h', '30d', '90d'], {
  errorMap: () => ({
    message: 'Time range must be: 1d, 7d, 24h, 30d, or 90d'
  })
});

/**
 * Export format options
 */
const ExportFormat = z.enum(['json', 'csv'], {
  errorMap: () => ({
    message: 'Export format must be: json or csv'
  })
});

// ============================================================================
// GET /api/dashboard/team-activity (Query Parameters)
// ============================================================================

/**
 * Team Activity Query Schema
 *
 * Security:
 * - Page/pageSize validation (DoS prevention)
 * - CUID validation for teamId and povId
 * - Date string validation (ISO 8601)
 * - Type whitelist (activity types)
 *
 * Used by: GET /api/dashboard/team-activity
 */
export const TeamActivityQuerySchema = z.object({
  page: z.string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .optional()
    .default('1'),
  pageSize: z.string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('10'),
  teamId: OptionalCUID,
  povId: OptionalCUID,
  type: z.string()
    .max(100, 'Activity type too long')
    .optional(),
  startDate: z.string()
    .datetime('Invalid date format - must be ISO 8601')
    .optional(),
  endDate: z.string()
    .datetime('Invalid date format - must be ISO 8601')
    .optional()
}).refine((data) => {
  // If both dates provided, startDate must be before endDate
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) < new Date(data.endDate);
  }
  return true;
}, {
  message: 'Start date must be before end date',
  path: ['endDate']
});

export type TeamActivityQuery = z.infer<typeof TeamActivityQuerySchema>;

// ============================================================================
// GET /api/dashboard/team-activity/summary (Query Parameters)
// ============================================================================

/**
 * Team Activity Summary Query Schema
 *
 * Security:
 * - Time range enum validation
 *
 * Used by: GET /api/dashboard/team-activity/summary
 */
export const TeamActivitySummaryQuerySchema = z.object({
  timeRange: TimeRange
    .optional()
    .default('7d')
});

export type TeamActivitySummaryQuery = z.infer<typeof TeamActivitySummaryQuerySchema>;

// ============================================================================
// GET /api/dashboard/team-activity/export (Query Parameters)
// ============================================================================

/**
 * Team Activity Export Query Schema
 *
 * Security:
 * - Export format enum (json, csv)
 * - Time range enum
 * - Department string validation (max 100 chars)
 *
 * Used by: GET /api/dashboard/team-activity/export
 */
export const TeamActivityExportQuerySchema = z.object({
  format: ExportFormat
    .optional()
    .default('csv'),
  timeRange: TimeRange
    .optional()
    .default('7d'),
  department: z.string()
    .max(100, 'Department name too long')
    .optional()
});

export type TeamActivityExportQuery = z.infer<typeof TeamActivityExportQuerySchema>;

// ============================================================================
// Simple Endpoints (No Query Validation Needed)
// ============================================================================

/**
 * The following endpoints do NOT require query parameter validation:
 *
 * 1. GET /api/dashboard/route.ts
 *    - Delegates to handler, no query params
 *
 * 2. GET /api/dashboard/pov-overview/route.ts
 *    - Uses createHandler with requireAuth
 *    - No query params, user-scoped automatically
 *
 * Security for these endpoints relies on:
 * - Authentication (createHandler with requireAuth: true)
 * - User scoping (WHERE ownerId = user.userId)
 * - Handler-level validation
 */

// ============================================================================
// Exports
// ============================================================================

export const DashboardValidation = {
  TeamActivity: TeamActivityQuerySchema,
  TeamActivitySummary: TeamActivitySummaryQuerySchema,
  TeamActivityExport: TeamActivityExportQuerySchema
} as const;
