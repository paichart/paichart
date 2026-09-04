import { NextRequest } from 'next/server';
import { createHandler } from '@/lib/api-handler';
import { handleGetDashboard } from '@/lib/dashboard/handlers/get';
import { UserRole } from '@/lib/types/auth';
import { corsPreflightResponse } from '@/lib/utils/cors';

// Dashboard shows aggregate data from ALL POVs - Admin only
// P1 #3 Fix: Added auth protection (Q4 2025 Security Review)
export const GET = createHandler(handleGetDashboard, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'GET, OPTIONS');
}
