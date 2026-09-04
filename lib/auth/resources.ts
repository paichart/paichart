import { prisma } from '@/lib/prisma';
import { ResourceType, Resource } from '../types/auth';

export async function getPovResource(povId: string): Promise<Resource> {
  const pov = await prisma.pOV.findUnique({
    where: { id: povId },
    select: {
      id: true,
      ownerId: true,
      teamId: true,
    },
  });

  if (!pov) {
    throw new Error('PoV not found');
  }

  return {
    id: pov.id,
    type: ResourceType.PoV,
    ownerId: pov.ownerId,
    teamId: pov.teamId || undefined,
  };
}

export async function getPhaseResource(phaseId: string): Promise<Resource> {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    include: {
      pov: {
        select: {
          ownerId: true,
          teamId: true,
        },
      },
    },
  });

  if (!phase) {
    throw new Error('Phase not found');
  }

  return {
    id: phase.id,
    type: ResourceType.PHASE,
    ownerId: phase.pov.ownerId,
    teamId: phase.pov.teamId || undefined,
  };
}

export async function getTaskResource(taskId: string): Promise<Resource> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      phase: {
        include: {
          pov: {
            select: {
              ownerId: true,
              teamId: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  if (!task.phase) {
    throw new Error('Task not properly associated with phase');
  }

  return {
    id: task.id,
    type: ResourceType.TASK,
    ownerId: task.phase.pov.ownerId,
    teamId: task.phase.pov.teamId || undefined,
  };
}

export async function getUserResource(userId: string): Promise<Resource> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    id: user.id,
    type: ResourceType.USER,
  };
}

export async function getTeamResource(teamId: string): Promise<Resource> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: {
          role: 'OWNER',
        },
        take: 1,
        select: {
          userId: true,
        },
      },
    },
  });

  if (!team) {
    throw new Error('Team not found');
  }

  return {
    id: team.id,
    type: ResourceType.TEAM,
    ownerId: team.members[0]?.userId,
  };
}

export async function getSettingsResource(): Promise<Resource> {
  return {
    id: 'settings',
    type: ResourceType.SETTINGS,
  };
}

export async function getAnalyticsResource(): Promise<Resource> {
  return {
    id: 'analytics',
    type: ResourceType.ANALYTICS,
  };
}

export async function getResourceById(type: ResourceType, id: string): Promise<Resource> {
  switch (type) {
    case ResourceType.PoV:
      return getPovResource(id);
    case ResourceType.PHASE:
      return getPhaseResource(id);
    case ResourceType.TASK:
      return getTaskResource(id);
    case ResourceType.USER:
      return getUserResource(id);
    case ResourceType.TEAM:
      return getTeamResource(id);
    case ResourceType.SETTINGS:
      return getSettingsResource();
    case ResourceType.ANALYTICS:
      return getAnalyticsResource();
    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
}
