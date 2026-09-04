/**
 * GET    /api/workflows/[id] - Get workflow (Admin only)
 * PUT    /api/workflows/[id] - Update workflow (Admin only)
 * DELETE /api/workflows/[id] - Delete workflow (Admin only)
 */
import { createHandler } from '@/lib/api-handler';
import { handleGetWorkflow, handleUpdateWorkflow, handleDeleteWorkflow } from '@/lib/workflows/handlers';
import { UserRole } from '@/lib/types/auth';

export const GET = createHandler(handleGetWorkflow, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});

export const PUT = createHandler(handleUpdateWorkflow, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});

export const DELETE = createHandler(handleDeleteWorkflow, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});
