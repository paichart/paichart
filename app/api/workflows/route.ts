/**
 * GET  /api/workflows - List workflows (Admin only)
 * POST /api/workflows - Create workflow (Admin only)
 */
import { createHandler } from '@/lib/api-handler';
import { handleListWorkflows, handleCreateWorkflow } from '@/lib/workflows/handlers';
import { UserRole } from '@/lib/types/auth';

export const GET = createHandler(handleListWorkflows, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});

export const POST = createHandler(handleCreateWorkflow, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});
