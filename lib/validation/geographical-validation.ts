/**
 * Geographical Validation Schemas
 *
 * Security: Path parameter validation for geographical lookups
 * - CUID validation for country and region IDs
 * - SalesTheatre enum validation
 * - No body validation needed (all GET endpoints)
 * - No prompt injection (geographical data = static lookups, not LLM prompts)
 *
 * Note: Geographical endpoints are read-only reference data
 * Real threats: Minimal (static lookups with authentication)
 *
 * @version 1.0.0
 * @author Security Team (Quarterly Review Nov 2025 - P2.2 Geographical Domain)
 */

import { z } from 'zod';
import { SalesTheatre } from '@prisma/client';

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Valid CUID pattern (starts with 'c', 25 chars total)
 */
const ValidCUID = z.string()
  .regex(/^c[a-z0-9]{24}$/, 'Invalid CUID format');

// ============================================================================
// Path Parameter Validation
// ============================================================================

/**
 * Country ID Path Parameter
 * Used by: GET /api/geographical/country/[id]
 */
export const CountryIdParamSchema = z.object({
  id: ValidCUID
});

export type CountryIdParam = z.infer<typeof CountryIdParamSchema>;

/**
 * Region ID Path Parameter
 * Used by: GET /api/geographical/region/[id]
 */
export const RegionIdParamSchema = z.object({
  id: ValidCUID
});

export type RegionIdParam = z.infer<typeof RegionIdParamSchema>;

/**
 * Sales Theatre Path Parameter
 *
 * Security:
 * - Uses Prisma SalesTheatre enum (single source of truth)
 * - Values: NORTH_AMERICA, LAC, EMEA, APJ
 *
 * Used by: GET /api/geographical/theatre/[theatre]/countries
 */
export const TheatreParamSchema = z.object({
  theatre: z.nativeEnum(SalesTheatre, {
    errorMap: () => ({
      message: 'Invalid sales theatre. Must be: NORTH_AMERICA, LAC, EMEA, or APJ'
    })
  })
});

export type TheatreParam = z.infer<typeof TheatreParamSchema>;

// ============================================================================
// Simple Endpoints (No Validation Needed)
// ============================================================================

/**
 * The following endpoints do NOT require validation:
 *
 * 1. GET /api/geographical/route.ts
 *    - No parameters, returns all regions
 *
 * 2. GET /api/geographical/countries/route.ts
 *    - No parameters, returns all countries
 *
 * 3. GET /api/geographical/distribution/route.ts
 *    - No parameters, returns POV distribution
 *
 * 4. GET /api/geographical/countries/[id]/regions
 *    - Path param [id] - can use CountryIdParamSchema if needed
 *
 * Security for these endpoints relies on:
 * - Authentication (getAuthUser)
 * - Read-only access (GET only)
 * - Static reference data (no user input)
 */

// ============================================================================
// Exports
// ============================================================================

export const GeographicalValidation = {
  CountryIdParam: CountryIdParamSchema,
  RegionIdParam: RegionIdParamSchema,
  TheatreParam: TheatreParamSchema
} as const;
