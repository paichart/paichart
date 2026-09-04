import { prisma } from '@/lib/prisma';
import { POVStatus, Priority } from '../types/core';

export enum PoVActivityType {
  POV_DELETED = 'POV_DELETED',
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  TEAM_MEMBER_ADDED = 'TEAM_MEMBER_ADDED',
  TEAM_MEMBER_REMOVED = 'TEAM_MEMBER_REMOVED',
  TEAM_MEMBER_ROLE_CHANGED = 'TEAM_MEMBER_ROLE_CHANGED',
  PHASE_ADDED = 'PHASE_ADDED',
  PHASE_UPDATED = 'PHASE_UPDATED',
  PHASE_REMOVED = 'PHASE_REMOVED',
  PHASE_REORDERED = 'PHASE_REORDERED',
  METADATA_UPDATED = 'METADATA_UPDATED',
}

interface BaseActivityData {
  userId: string;
  povId: string;
}

interface StatusChangeData extends BaseActivityData {
  oldStatus: POVStatus;
  newStatus: POVStatus;
}

interface PriorityChangeData extends BaseActivityData {
  oldPriority: Priority;
  newPriority: Priority;
}

interface TeamMemberData extends BaseActivityData {
  memberId: string;
  memberName: string;
  role?: string;
}

interface PhaseData extends BaseActivityData {
  phaseId: string;
  phaseName: string;
}

interface MetadataUpdateData extends BaseActivityData {
  fields: string[];
}

export class ActivityService {
  /**
   * Create PoV activity log
   */
  private static async createActivity(
    type: PoVActivityType,
    data: BaseActivityData & Record<string, any>
  ) {
    const { userId, povId, ...details } = data;

    await prisma.activity.create({
      data: {
        type,
        action: type,
        metadata: {
          povId, // Store povId in metadata since Activity model doesn't have povId field
          ...details
        },
        user: {
          connect: { id: userId }
        }
      },
    });
  }

  /**
   * Log PoV creation
   */
  static async logCreation(data: BaseActivityData) {
    await this.createActivity(PoVActivityType.CREATED, data);
  }

  /**
   * Log PoV update
   */
  static async logUpdate(data: BaseActivityData) {
    await this.createActivity(PoVActivityType.UPDATED, data);
  }

  /**
   * Log status change
   */
  static async logStatusChange(data: StatusChangeData) {
    await this.createActivity(PoVActivityType.STATUS_CHANGED, data);
  }

  /**
   * Log priority change
   */
  static async logPriorityChange(data: PriorityChangeData) {
    await this.createActivity(PoVActivityType.PRIORITY_CHANGED, data);
  }

  /**
   * Log team member addition
   */
  static async logTeamMemberAdded(data: TeamMemberData) {
    await this.createActivity(PoVActivityType.TEAM_MEMBER_ADDED, data);
  }

  /**
   * Log team member removal
   */
  static async logTeamMemberRemoved(data: TeamMemberData) {
    await this.createActivity(PoVActivityType.TEAM_MEMBER_REMOVED, data);
  }

  /**
   * Log team member role change
   */
  static async logTeamMemberRoleChanged(data: TeamMemberData) {
    await this.createActivity(PoVActivityType.TEAM_MEMBER_ROLE_CHANGED, data);
  }

  /**
   * Log phase addition
   */
  static async logPhaseAdded(data: PhaseData) {
    await this.createActivity(PoVActivityType.PHASE_ADDED, data);
  }

  /**
   * Log phase update
   */
  static async logPhaseUpdated(data: PhaseData) {
    await this.createActivity(PoVActivityType.PHASE_UPDATED, data);
  }

  /**
   * Log phase removal
   */
  static async logPhaseRemoved(data: PhaseData) {
    await this.createActivity(PoVActivityType.PHASE_REMOVED, data);
  }

  /**
   * Log phase reordering
   */
  static async logPhaseReordered(data: BaseActivityData) {
    await this.createActivity(PoVActivityType.PHASE_REORDERED, data);
  }

  /**
   * Log metadata update
   */
  static async logMetadataUpdated(data: MetadataUpdateData) {
    await this.createActivity(PoVActivityType.METADATA_UPDATED, data);
  }

  /**
   * Get PoV activity log - Since Activity model doesn't have povId,
   * we get activities by users associated with the POV
   */
  static async getActivityLog(povId: string) {
    // First get users associated with this POV (owner and team members)
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      include: {
        team: {
          include: {
            members: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!pov) {
      return [];
    }

    const userIds = [pov.ownerId];
    if (pov.team?.members) {
      userIds.push(...pov.team.members.map(member => member.userId));
    }

    return prisma.activity.findMany({
      where: {
        userId: { in: userIds },
        // Filter activities that contain POV-related metadata
        metadata: {
          path: ['povId'],
          equals: povId
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });
  }

  /**
   * Get user's PoV activity
   */
  static async getUserActivity(userId: string) {
    return prisma.activity.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        type: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });
  }

  /**
   * Format activity for display
   */
  static formatActivity(activity: any): string {
    const { type, metadata: details, user } = activity;
    const userName = user?.name || 'Unknown user';

    switch (type) {
      case PoVActivityType.CREATED:
        return `${userName} created the PoV`;
      case PoVActivityType.STATUS_CHANGED:
        return `${userName} changed status from ${details.oldStatus} to ${details.newStatus}`;
      case PoVActivityType.PRIORITY_CHANGED:
        return `${userName} changed priority from ${details.oldPriority} to ${details.newPriority}`;
      case PoVActivityType.TEAM_MEMBER_ADDED:
        return `${userName} added ${details.memberName} to the team`;
      case PoVActivityType.TEAM_MEMBER_REMOVED:
        return `${userName} removed ${details.memberName} from the team`;
      case PoVActivityType.TEAM_MEMBER_ROLE_CHANGED:
        return `${userName} changed ${details.memberName}'s role to ${details.role}`;
      case PoVActivityType.PHASE_ADDED:
        return `${userName} added phase "${details.phaseName}"`;
      case PoVActivityType.PHASE_UPDATED:
        return `${userName} updated phase "${details.phaseName}"`;
      case PoVActivityType.PHASE_REMOVED:
        return `${userName} removed phase "${details.phaseName}"`;
      case PoVActivityType.PHASE_REORDERED:
        return `${userName} reordered phases`;
      case PoVActivityType.METADATA_UPDATED:
        return `${userName} updated ${details.fields.join(', ')}`;
      default:
        return `${userName} performed an action`;
    }
  }

  /**
   * Log PoV deletion
   */
  static async logPoVDeleted(data: BaseActivityData) {
    await this.createActivity(PoVActivityType.POV_DELETED, data);
  }
}
