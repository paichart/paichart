import { Prisma } from '@prisma/client';
import { taskFullSelect } from '@/lib/tasks/prisma/select';

// User Select Types
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true
} as const;

// POV Select Types
export const povWithOwner = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    owner: {
      select: {
        id: true,
        name: true,
        email: true
      }
    }
  }
});

export const povWithTeam = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    team: {
      select: {
        id: true,
        name: true
      }
    }
  }
});

export const povWithPhases = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    phases: {
      include: {
        template: true
      }
    }
  }
});

export const povWithMilestones = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    milestones: true
  }
});

export const povWithKPIs = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    kpis: {
      include: {
        template: true
      }
    }
  }
});

export const povWithLaunch = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    launch: true
  }
});

export const povWithSyncHistory = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    syncHistory: {
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    }
  }
});

export const fullPOV = Prisma.validator<Prisma.POVDefaultArgs>()({
  include: {
    owner: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    },
    team: {
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        }
      }
    },
    phases: {
      include: {
        template: true,
        tasks: {
          select: {
            ...taskFullSelect,
            comments: {
              include: {
                user: { select: { id: true, name: true, email: true } }
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        stages: {
          include: {
            tasks: {
              select: {
                ...taskFullSelect,
                comments: {
                  include: {
                    user: { select: { id: true, name: true, email: true } }
                  },
                  orderBy: { createdAt: 'desc' }
                }
              },
              orderBy: [
                // Order tasks by our 1000x ordering system
                {
                  order: 'asc'
                },
                // Fallback to creation date for tasks with same order
                {
                  createdAt: 'asc'
                }
              ]
            }
          },
          orderBy: {
            order: 'asc'
          }
        }
      },
      orderBy: [
        // 1. Order by Phase Type (logical workflow: PLANNING → EXECUTION → REVIEW)
        {
          type: 'asc'
        },
        // 2. Order by Phase order (within same type)
        {
          order: 'asc'
        }
      ]
    },
    milestones: true,
    kpis: {
      include: {
        template: true
      }
    },
    launch: true,
    syncHistory: {
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    },
    country: true,
    region: true,
    // Note: When using include, all scalar fields are returned by default
    // Prisma should include metadata automatically, but we can't mix select and include
  }
});

// Phase Select Types
export const phaseWithTemplate = Prisma.validator<Prisma.PhaseDefaultArgs>()({
  include: {
    template: true
  }
});

export const phaseWithTasks = Prisma.validator<Prisma.PhaseDefaultArgs>()({
  include: {
    tasks: true
  }
});

export const fullPhase = Prisma.validator<Prisma.PhaseDefaultArgs>()({
  include: {
    template: true,
    stages: {
      include: {
        tasks: {
          select: taskFullSelect,
          orderBy: [
            // Order tasks by our 1000x ordering system
            {
              order: 'asc'
            },
            // Fallback to creation date for tasks with same order
            {
              createdAt: 'asc'
            }
          ]
        }
      },
      orderBy: {
        order: 'asc'
      }
    },
    tasks: {
      select: taskFullSelect,
      orderBy: [
        // Order tasks by our 1000x ordering system
        {
          order: 'asc'
        },
        // Fallback to creation date for tasks with same order
        {
          createdAt: 'asc'
        }
      ]
    },
    pov: {
      select: {
        id: true,
        title: true,
        status: true
      }
    }
  }
});

// KPI Select Types
export const kpiWithTemplate = Prisma.validator<Prisma.POVKPIDefaultArgs>()({
  include: {
    template: true
  }
});

export const fullKPI = Prisma.validator<Prisma.POVKPIDefaultArgs>()({
  include: {
    template: true,
    pov: {
      select: {
        id: true,
        title: true,
        status: true
      }
    }
  }
});

// Types based on selects
export type POVWithOwner = Prisma.POVGetPayload<typeof povWithOwner>;
export type POVWithTeam = Prisma.POVGetPayload<typeof povWithTeam>;
export type POVWithPhases = Prisma.POVGetPayload<typeof povWithPhases>;
export type POVWithMilestones = Prisma.POVGetPayload<typeof povWithMilestones>;
export type POVWithKPIs = Prisma.POVGetPayload<typeof povWithKPIs>;
export type POVWithLaunch = Prisma.POVGetPayload<typeof povWithLaunch>;
export type POVWithSyncHistory = Prisma.POVGetPayload<typeof povWithSyncHistory>;
export type FullPOV = Prisma.POVGetPayload<typeof fullPOV>;

export type PhaseWithTemplate = Prisma.PhaseGetPayload<typeof phaseWithTemplate>;
export type PhaseWithTasks = Prisma.PhaseGetPayload<typeof phaseWithTasks>;
export type FullPhase = Prisma.PhaseGetPayload<typeof fullPhase>;

export type KPIWithTemplate = Prisma.POVKPIGetPayload<typeof kpiWithTemplate>;
export type FullKPI = Prisma.POVKPIGetPayload<typeof fullKPI>;
