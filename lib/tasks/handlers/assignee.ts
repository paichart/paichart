import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getPOVForAccess } from '../helpers/pov-access';
import { TaskService } from '../services/task';

/**
 * Get available assignees handler
 */
export async function getAvailableAssigneesHandler(
  req: NextRequest,
  povId: string,
  phaseId: string
): Promise<{ data: any[] }> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get PoV for permission check
  const pov = await getPOVForAccess(povId);

  if (!pov) {
    throw new Error('PoV not found');
  }

  // Instance-scoped: requires owner / team-member / admin access to this POV
  validatePOVAccess(user, pov, { throwOnDeny: true, logContext: 'Available Assignees' });

  if (!pov.teamId) {
    throw new Error('PoV has no team assigned');
  }

  const users = await TaskService.getAvailableAssignees(pov.teamId);
  return { data: users };
}
