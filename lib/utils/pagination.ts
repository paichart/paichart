/**
 * Shared pagination utilities for API endpoints
 *
 * Provides consistent pagination parameter parsing and response formatting
 * across all paginated list endpoints.
 */

const DEFAULT_LIMIT = 50;
// R-C2 (2026-06-18): 100 is the DEFAULT ceiling for UI-paged LIST endpoints — a page
// is a screenful, and a low cap bounds deep-scan + payload cost. Callers may raise it
// per-endpoint via the `maxLimit` override (e.g. tasks/get.ts uses 200). It is
// DELIBERATELY lower than the search/bulk ceilings: `TaskSearchQuerySchema.limit`
// (task-validation.ts:472) and `PAGINATION_LIMIT` (input-validation-framework.ts:85)
// cap at 1000 because a SEARCH returns a result SET to scan/export, not a UI page.
// The 100 / 200 / 1000 spread is intentional per-use-case tuning, not drift.
const MAX_LIMIT = 100;
// R-C1 (2026-06-17): offset was floor-clamped only (Math.max(0, …)) — unbounded
// upward. Deep OFFSET is O(offset) in Postgres; this ceiling bounds a pathological
// deep-scan (statement_timeout is the last-resort backstop, not the intended one).
// 100000 = the value the now-dead PAGINATION_OFFSET schema intended; enforced here.
const MAX_OFFSET = 100000;

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parse and validate pagination parameters from URL search params.
 * Enforces MAX_LIMIT and provides safe defaults.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaults?: { limit?: number; maxLimit?: number }
): { limit: number; offset: number } {
  const maxLimit = defaults?.maxLimit ?? MAX_LIMIT;
  const defaultLimit = defaults?.limit ?? DEFAULT_LIMIT;

  const rawLimit = searchParams.get('limit');
  const rawOffset = searchParams.get('offset');

  const limit = rawLimit
    ? Math.min(Math.max(1, parseInt(rawLimit, 10) || defaultLimit), maxLimit)
    : defaultLimit;

  const offset = rawOffset
    ? Math.min(Math.max(0, parseInt(rawOffset, 10) || 0), MAX_OFFSET)
    : 0;

  return { limit, offset };
}

/**
 * Build a standardised pagination response envelope.
 */
export function paginationResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    },
  };
}
