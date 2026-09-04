import { NextRequest, NextResponse } from 'next/server';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { logger } from '@/lib/logger';
import { trackActivity } from '@/lib/auth/audit';
import { getCurrentKid } from '@/lib/auth/jwt-key-store';

/**
 * Admin JWT Status Endpoint
 *
 * Returns JWT key rotation status information for authorized admin users only.
 *
 * Phase 3: Multi-key JWKS Support - Security Enhancement
 *
 * Security:
 * - Requires admin authentication (ADMIN, SUPER_ADMIN roles only)
 * - Rate limited (admin operations: 100 req/min per IP)
 * - Does NOT expose sensitive cryptographic material
 * - Prevents timing information leakage to attackers
 * - Follows industry best practice (Auth0, Okta, AWS KMS)
 * - Skips rate limiting for internal calls (localhost)
 *
 * CRITICAL FIX #1: Move from public /api/health to admin-only endpoint
 * - Recommendation: boundary-contract-specialist
 * - Rationale: Public exposure of rotation timing reduces security
 *
 * CRITICAL FIX #2: Edge case handling in calculateKeyAge()
 * - Recommendation: validation-engine-specialist
 * - Handles: future dates, invalid years/months, malformed key IDs
 *
 * @see cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/implementation-plan.md - Component 2.2
 * @see cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/boundary-contract-review.md - Critical Fix
 * @see cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/validation-engine-review.md - Critical Fix
 */

export const GET = createHandler(
  async (req: NextRequest, context, user) => {
    // User already validated by createHandler (requireAuth + allowedRoles)

    try {
      // Report the EFFECTIVE kid: when JWT_KEY_ID is unset the system genuinely
      // mints/serves with DEFAULT_JWT_KEY_ID (getCurrentKid warns once), so
      // 'unknown' would misreport live state. Centralized 2026-06-11.
      const keyId = getCurrentKid();
      const keyAgeDays = calculateKeyAge(keyId);

      // CRITICAL FIX #2: Handle invalid key ID (validation-engine-specialist)
      if (keyAgeDays === -1) {
        return {
          error: {
            message: 'Invalid key ID configuration',
            code: 'INVALID_KEY_ID',
          },
        };
      }

      const rotationDueDays = 90 - keyAgeDays;

      const status = keyAgeDays > 90 ? 'critical' :
                     keyAgeDays > 75 ? 'warning' : 'ok';

      // Audit log for successful access
      logger.info({ userId: user!.userId, role: user!.role, keyId, keyAgeDays, status }, 'JWT Status admin access');

      // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — sensitive-read audit.
      // Exposes JWT rotation timing — auditor wants to see who viewed it.
      void trackActivity(user!.userId, 'JWT_STATUS', 'VIEW', {
        keyId, keyAgeDays, status, source: 'admin',
      });

      return {
        data: {
          keyId,
          keyAgeDays,
          rotationDueDays: Math.max(0, rotationDueDays), // Never negative
          status,
          nextRotationDate: calculateNextRotationDate(keyId),
          hasMultipleKeys: !!process.env.JWT_KEY_ID_PREV,
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'JWT Status error');
      return {
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
        },
      };
    }
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    rateLimit: 'admin', // Apply admin operation rate limiting (100 req/min per IP)
  }
);

/**
 * Calculate JWT key age in days
 *
 * CRITICAL FIX #2: Comprehensive edge case handling
 * - Validates year range (2000-2100)
 * - Validates month range (1-12)
 * - Handles future dates (returns 0 for brand new keys)
 * - Returns -1 for invalid key IDs
 *
 * @param keyId - Key identifier (format: paichart-YYYY-MM)
 * @returns Age in days, or -1 if invalid
 */
function calculateKeyAge(keyId: string): number {
  // Extract YYYY-MM from paichart-YYYY-MM
  const match = keyId.match(/paichart-(\d{4})-(\d{2})/);
  if (!match) {
    logger.error({ keyId }, 'JWT Status invalid key ID format');
    return -1; // Signal error
  }

  const [_, yearStr, monthStr] = match;
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  // Validate year range (2000-2100)
  if (year < 2000 || year > 2100) {
    logger.error({ year }, 'JWT Status invalid year in key ID');
    return -1;
  }

  // Validate month range (1-12)
  if (month < 1 || month > 12) {
    logger.error({ month }, 'JWT Status invalid month in key ID');
    return -1;
  }

  const keyDate = new Date(year, month - 1, 1);
  const now = new Date();

  const diffMs = now.getTime() - keyDate.getTime();
  const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Handle future dates (negative age)
  if (ageDays < 0) {
    logger.warn({ keyId, daysInFuture: -ageDays }, 'JWT Status future key date detected');
    return 0; // Treat as brand new key
  }

  return ageDays;
}

/**
 * Calculate next rotation date based on 90-day cadence
 *
 * @param keyId - Key identifier (format: paichart-YYYY-MM)
 * @returns Next rotation date (YYYY-MM-DD) or error message
 */
function calculateNextRotationDate(keyId: string): string {
  const keyAge = calculateKeyAge(keyId);

  // Handle invalid key ID
  if (keyAge === -1) {
    return 'Invalid key ID';
  }

  const daysUntilRotation = 90 - keyAge;

  const nextRotation = new Date();
  nextRotation.setDate(nextRotation.getDate() + Math.max(0, daysUntilRotation));

  return nextRotation.toISOString().split('T')[0]; // YYYY-MM-DD
}
