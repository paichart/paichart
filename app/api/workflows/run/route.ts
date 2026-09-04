/**
 * POST /api/workflows/run - Execute workflow (Admin only)
 */
import { createHandler } from '@/lib/api-handler';
import { handleRunWorkflow } from '@/lib/workflows/handlers';
import { UserRole } from '@/lib/types/auth';

export const POST = createHandler(handleRunWorkflow, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});
