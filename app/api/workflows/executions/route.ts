/**
 * GET /api/workflows/executions - List workflow executions (Admin only)
 *
 * Query Parameters:
 * - workflowId: Filter by specific workflow
 * - status: Filter by execution status (RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT)
 * - limit: Max results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 */
import { createHandler } from '@/lib/api-handler';
import { handleListExecutions } from '@/lib/workflows/handlers';
import { UserRole } from '@/lib/types/auth';

export const GET = createHandler(handleListExecutions, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});
