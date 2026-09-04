import { Prisma } from '@prisma/client';

// ActivePoVs Select
export const activePoVsSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  phases: {
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      endDate: true,
    },
  },
} satisfies Prisma.POVSelect;

// TeamStatus Select
export const teamStatusSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLogin: true,
  assignedTasks: {
    select: {
      id: true,
      status: true,
      priority: true,
    },
  },
  activities: {
    select: {
      id: true,
      type: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc' as const,
    },
    take: 10,
  },
  customRole: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

// Milestones Select
export const milestonesSelect = {
  id: true,
  title: true,
  phases: {
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      startDate: true,
      endDate: true,
      order: true,
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.POVSelect;

// ResourceUsage Select
export const resourceUsageSelect = {
  id: true,
  team: {
    select: {
      members: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              assignedTasks: {
                select: {
                  id: true,
                  status: true,
                  priority: true,
                },
              },
            },
          },
        },
      },
    },
  },
  phases: {
    select: {
      id: true,
      startDate: true,
      endDate: true,
      tasks: {
        select: {
          id: true,
          status: true,
          priority: true,
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.POVSelect;

// RiskOverview Select
export const riskOverviewSelect = {
  id: true,
  status: true,
  priority: true,
  metadata: true,
  phases: {
    select: {
      id: true,
      type: true,
      tasks: {
        select: {
          id: true,
          status: true,
          priority: true,
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.POVSelect;

// SuccessRate Select
export const successRateSelect = {
  id: true,
  status: true,
  metadata: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  phases: {
    select: {
      id: true,
      type: true,
      tasks: {
        select: {
          id: true,
          status: true,
          priority: true,
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.POVSelect;

// Types for select results
export type ActivePoVResult = Prisma.POVGetPayload<{
  select: typeof activePoVsSelect;
}>;

export type TeamStatusResult = Prisma.UserGetPayload<{
  select: typeof teamStatusSelect;
}>;

export type MilestonesPoVResult = Prisma.POVGetPayload<{
  select: typeof milestonesSelect;
}>;

export type ResourceUsagePoVResult = Prisma.POVGetPayload<{
  select: typeof resourceUsageSelect;
}>;

export type RiskOverviewPoVResult = Prisma.POVGetPayload<{
  select: typeof riskOverviewSelect;
}>;

export type SuccessRatePoVResult = Prisma.POVGetPayload<{
  select: typeof successRateSelect;
}>;
