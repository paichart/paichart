import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { checkPermission } from '@/lib/auth/permissions';
import { ResourceAction, ResourceType, UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { TeamService } from '../services/team';
import { AvailableTeamMembersResponse } from '../types/team';
import { mapTeamMemberFromPrisma } from '../prisma/team';
import { canManageTeamMembers } from '../auth/team-authorization';
import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'TeamHandler' });

/**
 * Get available team members handler
 */
export async function getAvailableTeamMembersHandler(
  req: NextRequest,
  povId: string,
  user?: any,
  pov?: any
) {
  try {
    // ✅ If user and pov provided by withPOVAccess, auth already done
    let authUser = user;
    let authPov = pov;

    // ✅ Fallback: manual auth (for backward compatibility)
    if (!authUser || !authPov) {
      authUser = await getAuthUser(req);
      if (!authUser) {
        throw new Error('Unauthorized');
      }

      // Get PoV with team members to check team management permissions
      authPov = await prisma.pOV.findUnique({
        where: { id: povId },
        include: {
          team: {
            include: {
              members: true  // Needed for canManageTeamMembers check
            }
          }
        }
      });

      if (!authPov) {
        throw new Error('PoV not found');
      }
    } else {
      localLogger.debug({ povId }, 'using pre-validated context for available team members');
    }

    // Check team management permission (Owner, Admin, or PROJECT_MANAGER)
    // If user can manage team, they need to see available users for adding members
    const authCheck = canManageTeamMembers(authUser, authPov, { operation: 'add' });

    if (!authCheck.allowed) {
      throw new Error(authCheck.reason || 'Permission denied');
    }

    // Get available team members
    const availableMembers = await TeamService.getAvailableMembers({
      povId,
      ownerId: authPov.ownerId,
      teamId: authPov.teamId || undefined,
    });

    // Return the data directly
    return availableMembers.map(mapTeamMemberFromPrisma);
  } catch (error) {
    localLogger.error({ err: error, povId }, 'getAvailableTeamMembersHandler failed');
    throw error;
  }
}
