import { NextRequest } from 'next/server';
import { getAdminActivitiesHandler } from '@/lib/admin/handlers/activity';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { trackActivity } from '@/lib/auth/audit';

export const GET = createHandler(
  async (req: NextRequest, context, user) => {
    // User and role already validated by createHandler (requireAuth + allowedRoles)
    // Manual checks below are redundant but kept for defense-in-depth

    if (!user) {
      return {
        error: {
          message: 'Unauthorized',
          code: 'UNAUTHORIZED',
        },
      };
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return {
        error: {
          message: 'Forbidden',
          code: 'FORBIDDEN',
        },
      };
    }

    // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — meta-audit.
    // Tracks every admin view of the audit log (privacy / insider-threat
    // signal). Captures filter params so we know WHAT they looked at.
    void trackActivity(user.userId, 'AUDIT_LOG', 'VIEW', {
      filters: Object.fromEntries(new URL(req.url).searchParams.entries()),
      source: 'admin',
    });

    return getAdminActivitiesHandler(req, context, user);
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    rateLimit: 'admin', // Prevent audit log reconnaissance/spam (100 req/min per IP)
  }
);
