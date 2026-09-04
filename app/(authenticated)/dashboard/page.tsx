import { redirect } from 'next/navigation';
import { getAuthUserFromServer } from '@/lib/auth/get-auth-user';
import { UserRole } from '@/lib/types/auth';
import { DashboardTabs } from './DashboardTabs';

// ✅ PHASE 0: Define allowed admin roles (sec-ops-specialist recommendation)
const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

/**
 * Admin Dashboard Page
 *
 * Security: Server-side role-based access control
 * - Only ADMIN and SUPER_ADMIN roles can access
 * - Non-admins redirected to /analytics (user dashboard)
 * - Uses server component for secure auth check
 *
 * Phase 0 Security Fix:
 * - Prevents privilege escalation
 * - Prevents admin UI exposure to regular users
 * - Adds security audit logging
 */
export default async function DashboardPage() {
  // ✅ PHASE 0: Server-side authentication (cannot be bypassed by client)
  const user = await getAuthUserFromServer();

  // ✅ PHASE 0: Role-based access control with enum validation
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    // ✅ Security logging (sec-ops-specialist recommendation)
    console.warn('[Dashboard Access] Unauthorized attempt:', {
      userId: user?.userId || 'anonymous',
      role: user?.role || 'none',
      timestamp: new Date().toISOString(),
      action: 'DENIED'
    });

    // Redirect non-admins to user-facing analytics dashboard
    redirect('/analytics');
  }


  return (
    <div className="p-6">
      {/* Client component for tab interactivity */}
      <DashboardTabs />
    </div>
  );
}
