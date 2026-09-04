import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { POVStatus } from '@prisma/client';

const dashboardLogger = logger.child({ module: 'DashboardService' });
import {
  activePoVsSelect,
  teamStatusSelect,
  milestonesSelect,
  resourceUsageSelect,
  riskOverviewSelect,
  successRateSelect,
} from '../prisma/select';
import {
  mapToActivePoVStats,
  mapToTeamStatusData,
  mapToMilestones,
  mapToResourceUsageData,
  mapToRiskOverviewData,
  mapToSuccessRateData,
} from '../prisma/mappers';

// OPTIMIZATION: Dashboard analytics caching with aggressive 15-minute TTL
const dashboardCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (aggressive caching for analytics)
const WIDGET_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for individual widgets

// TIME BOMB PREVENTION: Map size limit (Category 1: Unbounded Caches)
const MAX_CACHE_SIZE = 200;

// BC57 FIX: Periodic cleanup prevents unbounded growth between active evictions
const dashboardCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of dashboardCache.entries()) {
    if (now - value.timestamp > value.ttl) {
      dashboardCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
dashboardCleanupInterval.unref();

// OPTIMIZATION: Helper functions for dashboard analytics optimization
function getCacheKey(type: string, params?: any): string {
  const baseKey = `dashboard:${type}`;
  if (params) {
    const sortedParams = Object.keys(params).sort().reduce((result: any, key) => {
      result[key] = params[key];
      return result;
    }, {});
    return `${baseKey}:${JSON.stringify(sortedParams)}`;
  }
  return baseKey;
}

function getCachedData(cacheKey: string, ttl: number = CACHE_TTL) {
  const cached = dashboardCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  
  return null;
}

function setCachedData(cacheKey: string, data: any, ttl: number = CACHE_TTL): void {
  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (dashboardCache.size >= MAX_CACHE_SIZE && !dashboardCache.has(cacheKey)) {
    const oldestKey = dashboardCache.keys().next().value;
    if (oldestKey) {
      dashboardCache.delete(oldestKey);
    }
  }

  dashboardCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl
  });

  // Cleanup old cache entries (TTL-based)
  if (dashboardCache.size > MAX_CACHE_SIZE / 2) {
    const entries = Array.from(dashboardCache.entries());
    const now = Date.now();

    entries.forEach(([key, value]) => {
      if (now - value.timestamp > value.ttl) {
        dashboardCache.delete(key);
      }
    });
  }
}

// OPTIMIZATION: Cache invalidation for real-time updates
function invalidateRelatedCache(type: 'pov' | 'user' | 'task' | 'all') {
  const keysToInvalidate: string[] = [];
  
  dashboardCache.forEach((value, key) => {
    if (type === 'all') {
      keysToInvalidate.push(key);
    } else if (key.includes(type) || key.includes('dashboard:all')) {
      keysToInvalidate.push(key);
    }
  });
  
  keysToInvalidate.forEach(key => dashboardCache.delete(key));
  dashboardLogger.debug({ invalidatedCount: keysToInvalidate.length, cacheType: type }, 'Cache entries invalidated');
}

// Export cache invalidation for external use
export { invalidateRelatedCache as invalidateDashboardCache };

export async function getActivePoVStats() {
  try {
    const povs = await prisma.pOV.findMany({
      where: {
        status: {
          in: [POVStatus.PROJECTED, POVStatus.IN_PROGRESS, POVStatus.WON],
        },
      },
      select: activePoVsSelect,
      take: 200, // Phase 2 safety cap: prevent memory blow-up as POV count grows
    });

    return mapToActivePoVStats(povs);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch active PoVs');
    throw error;
  }
}

export async function getTeamStatusData() {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: teamStatusSelect,
      take: 500, // Phase 2 safety cap: active users typically < 100
    });

    return mapToTeamStatusData(users);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch team status');
    throw error;
  }
}

export async function getMilestones() {
  try {
    const povs = await prisma.pOV.findMany({
      where: {
        status: POVStatus.IN_PROGRESS,
      },
      select: milestonesSelect,
      take: 200, // Phase 2 safety cap
    });

    return mapToMilestones(povs);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch milestones');
    throw error;
  }
}

export async function getResourceUsage() {
  try {
    const povs = await prisma.pOV.findMany({
      where: {
        status: POVStatus.IN_PROGRESS,
      },
      select: resourceUsageSelect,
      take: 200, // Phase 2 safety cap
    });

    return mapToResourceUsageData(povs);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch resource usage');
    throw error;
  }
}

export async function getRiskOverview() {
  try {
    const povs = await prisma.pOV.findMany({
      where: {
        status: {
          in: [POVStatus.IN_PROGRESS, POVStatus.WON],
        },
      },
      select: riskOverviewSelect,
      take: 200, // Phase 2 safety cap
    });

    return mapToRiskOverviewData(povs);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch risk overview');
    throw error;
  }
}

export async function getSuccessRate() {
  try {
    const povs = await prisma.pOV.findMany({
      where: {
        status: {
          in: [POVStatus.IN_PROGRESS, POVStatus.WON],
        },
      },
      select: successRateSelect,
      take: 200, // Phase 2 safety cap
    });

    return mapToSuccessRateData(povs);
  } catch (error) {
    dashboardLogger.error({ err: error }, 'Failed to fetch success rate');
    throw error;
  }
}

// Retry configuration
const RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 5000,
};

// Helper function to implement exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && 
        error.message.includes('Too many database connections') &&
        retryCount < RETRY_OPTIONS.maxRetries) {
      const delay = Math.min(
        RETRY_OPTIONS.initialDelay * Math.pow(2, retryCount),
        RETRY_OPTIONS.maxDelay
      );
      dashboardLogger.warn({ delayMs: delay, attempt: retryCount + 1 }, 'Retrying after connection error');
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retryCount + 1);
    }
    throw error;
  }
}

export interface DashboardData {
  activePoVStats: Awaited<ReturnType<typeof getActivePoVStats>>;
  teamStatus: Awaited<ReturnType<typeof getTeamStatusData>>;
  milestones: Awaited<ReturnType<typeof getMilestones>>;
  resourceUsage: Awaited<ReturnType<typeof getResourceUsage>>;
  riskOverview: Awaited<ReturnType<typeof getRiskOverview>>;
  successRate: Awaited<ReturnType<typeof getSuccessRate>>;
}

// Batch fetch for dashboard with optimized querying and retry logic
export async function getDashboardData(): Promise<DashboardData> {
  return withRetry<DashboardData>(async () => {
    try {
      // Fetch data directly without transaction
      const povs = await prisma.pOV.findMany({
        where: {
          status: {
            in: [POVStatus.PROJECTED, POVStatus.IN_PROGRESS, POVStatus.WON],
          },
        },
        take: 200, // Phase 2 safety cap: batch fetch with deep includes
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
          metadata: true,
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
                take: 100, // Phase 2 safety cap: tasks per phase
                select: {
                  id: true,
                  title: true,
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
          team: {
            select: {
              members: {
                take: 50, // Phase 2 safety cap: members per team
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
        },
      });

      // Fetch team data
      const users = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
        },
        select: teamStatusSelect,
        take: 500, // Phase 2 safety cap: active users typically < 100
      });

      // Map data to respective formats
      return {
        activePoVStats: mapToActivePoVStats(povs),
        teamStatus: mapToTeamStatusData(users),
        milestones: mapToMilestones(povs),
        resourceUsage: mapToResourceUsageData(povs),
        riskOverview: mapToRiskOverviewData(povs),
        successRate: mapToSuccessRateData(povs),
      };
    } catch (error) {
      dashboardLogger.error({ err: error }, 'Failed in batch fetch');
      throw error;
    }
  });
}
