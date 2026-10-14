import { NextRequest, NextResponse } from 'next/server';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { logger } from '@/lib/logger';
import { trackActivity } from '@/lib/auth/audit';
import { getCurrentKid } from '@/lib/auth/jwt-key-store';
import { calculateKeyAge, calculateNextRotationDate } from '@/lib/auth/jwt-key-age';

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
 * 2026-10-13: age now comes from JWT_KEY_ROTATED_AT (exact day) when it is a valid YYYY-MM-DD,
 * falling back to the kid's month — see lib/auth/jwt-key-age.ts (same rule as the daily summary).
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
      const rotatedAt = process.env.JWT_KEY_ROTATED_AT;
      const keyAgeDays = calculateKeyAge(keyId, rotatedAt);

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
          nextRotationDate: calculateNextRotationDate(keyId, rotatedAt),
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
