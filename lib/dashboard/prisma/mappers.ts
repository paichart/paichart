import { ensureObject } from '@/lib/utils/ensure-object';
import { logger } from '@/lib/logger';
import { CategoryMap, POVStatus, Priority } from '../types/enums';

const mapperLogger = logger.child({ module: 'DashboardMappers' });
import {
  ActivePoVResult,
  TeamStatusResult,
  MilestonesPoVResult,
  ResourceUsagePoVResult,
  RiskOverviewPoVResult,
  SuccessRatePoVResult,
} from './select';
import {
  ActivePoVStats,
  TeamStatusData,
  Milestone,
  ResourceUsageData,
  RiskOverviewData,
  SuccessRateData,
  TeamActivity,
} from '../types/index';
// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
import { prisma } from '@/lib/prisma';
import { phaseProgressService } from '@/lib/pov/services/phaseProgressService';

interface Activity {
  id: string;
  type: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
}

interface AssigneeInfo {
  id: string;
  name: string;
}

interface TaskWithStatus {
  status: string;
  id: string;
  priority: string;
}

interface PrismaPhase {
  id: string;
  name: string;
  description: string;
  type: 'PLANNING' | 'EXECUTION' | 'REVIEW';
  startDate: Date;
  endDate: Date;
  order: number;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee: AssigneeInfo | null;
  }>;
}

interface TeamMember {
  user: {
    id: string;
  };
}

interface PhaseWithTasks {
  tasks: Array<{
    id: string;
    status: string;
    assignee: AssigneeInfo | null;
  }>;
  startDate?: Date;
  endDate?: Date;
  type?: 'PLANNING' | 'EXECUTION' | 'REVIEW';
}

// ActivePoVs Mapper
export function mapToActivePoVStats(povs: ActivePoVResult[]): ActivePoVStats {
  const stats = {
    total: povs.length,
    active: 0,
    completed: 0,
    pending: 0,
    byStatus: {} as Record<string, number>,
  };

  povs.forEach(pov => {
    // Count by status
    stats.byStatus[pov.status] = (stats.byStatus[pov.status] || 0) + 1;

    // Update main counters
    switch (pov.status) {
      case POVStatus.IN_PROGRESS:
      case POVStatus.VALIDATION:
        stats.active++;
        break;
      case POVStatus.WON:
        stats.completed++;
        break;
      case POVStatus.PROJECTED:
        stats.pending++;
        break;
      case POVStatus.STALLED:
      case POVStatus.LOST:
        // These statuses don't affect our main counters
        break;
    }
  });

  return stats;
}

// TeamStatus Mapper
export function mapToTeamStatusData(users: TeamStatusResult[]): TeamStatusData {
  return {
    members: users.map(user => ({
      userId: user.id,
      userName: user.name,
      activityCount: user.activities.length,
      lastActive: user.lastLogin || new Date(0),
      currentTasks: user.assignedTasks.filter((t: TaskWithStatus) => t.status !== 'COMPLETED').length,
      completedTasks: user.assignedTasks.filter((t: TaskWithStatus) => t.status === 'COMPLETED').length,
    })),
    recentActivities: users.flatMap(user =>
      user.activities.map((activity: Activity) => {
        const metadata = activity.metadata ? ensureObject(activity.metadata, {}, 'Activity metadata') as Record<string, any> : null;
        // For job roles, prefer customRole name if available
        const jobRole = user.customRole?.name || null;
        // For system roles, only show if no custom role and user is admin/super_admin
        const systemRole = !jobRole && user.role !== 'USER' ? formatRole(user.role) : null;
        
        return {
          id: activity.id,
          type: activity.type as 'USER_ROLE' | 'PoV_ACTION',
          action: activity.action,
          userId: user.id,
          userName: user.name,
          timestamp: activity.createdAt,
          details: String(metadata?.details || ''),
          role: jobRole || systemRole || 'Team Member',
          poVName: String(metadata?.poVTitle || '')
        } as TeamActivity;
      })
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10),
  };
}

// Milestones Mapper
export function mapToMilestones(povs: MilestonesPoVResult[]): Milestone[] {
  const milestones = povs.flatMap(pov => {
    if (!pov.phases) {
      mapperLogger.warn({ povId: pov.id }, 'No phases found for PoV');
      return [];
    }

    return pov.phases.map((phase: PrismaPhase) => {
      if (!phase) {
        mapperLogger.warn({ povId: pov.id }, 'Invalid phase found in PoV');
        return null;
      }

      const assignees = phase.tasks
        .filter((task: { assignee: AssigneeInfo | null }) => task && task.assignee)
        .map((task: { assignee: AssigneeInfo | null }) => task.assignee!)
        .filter((assignee: AssigneeInfo, index: number, self: AssigneeInfo[]) => 
          index === self.findIndex((a: AssigneeInfo) => a.id === assignee.id)
        );

      return {
        id: phase.id,
        povId: pov.id,
        title: phase.name,
        dueDate: phase.endDate,
        status: getPhaseStatus(phase),
        progress: calculatePhaseProgress(phase),
        assignees,
      };
    }).filter((milestone: Milestone | null): milestone is Milestone => milestone !== null);
  });

  return milestones;
}

// ResourceUsage Mapper
export function mapToResourceUsageData(povs: ResourceUsagePoVResult[]): ResourceUsageData {
  const data: ResourceUsageData = {
    team: calculateTeamAllocation(povs),
    tasks: calculateTaskAllocation(povs),
    timeline: calculateTimelineAllocation(povs),
  };
  return data;
}

// RiskOverview Mapper
export function mapToRiskOverviewData(povs: RiskOverviewPoVResult[]): RiskOverviewData {
  const data: RiskOverviewData = {
    overall: calculateOverallRisk(povs),
    byCategory: calculateRiskByCategory(povs),
  };
  return data;
}

// SuccessRate Mapper
export function mapToSuccessRateData(povs: SuccessRatePoVResult[]): SuccessRateData {
  const data: SuccessRateData = {
    current: calculateCurrentSuccessRate(povs),
    historical: calculateHistoricalSuccessRate(povs),
    byCategory: calculateSuccessByCategory(povs),
  };
  return data;
}

// Helper Functions
function formatRole(role: string): string {
  return role.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

function getPhaseStatus(phase: PrismaPhase): Milestone['status'] {
  const now = new Date();
  const hasCompletedTasks = phase.tasks.every((t: { status: string }) => t.status === 'COMPLETED');
  const hasStartedTasks = phase.tasks.some((t: { status: string }) => t.status === 'IN_PROGRESS');
  
  if (hasCompletedTasks) return 'COMPLETED';
  if (now > phase.endDate) return 'OVERDUE';
  if (hasStartedTasks) return 'IN_PROGRESS';
  return 'PENDING';
}

// OPTIMIZED: Use phaseProgressService for better performance
function calculatePhaseProgress(phase: PrismaPhase): number {
  if (!phase.tasks.length) return 0;
  const completed = phase.tasks.filter((t: { status: string }) => t.status === 'COMPLETED').length;
  return Math.round((completed / phase.tasks.length) * 100);
}

// OPTIMIZED VERSION: Async method using optimized service
async function calculatePhaseProgressOptimized(povId: string, phaseId: string): Promise<number> {
  try {
    const phaseMetrics = await phaseProgressService.calculatePhaseProgress(povId);
    const phaseProgress = phaseMetrics.find(p => p.phaseId === phaseId);
    return phaseProgress?.percentage || 0;
  } catch (error) {
    mapperLogger.error({ err: error, povId, phaseId }, 'Optimized phase progress calculation failed, using fallback');
    // Fallback to synchronous calculation - would need phase data
    return 0;
  }
}

// Export optimized function for use in other modules
export { calculatePhaseProgressOptimized };

function calculateTeamAllocation(povs: ResourceUsagePoVResult[]): ResourceUsageData['team'] {
  const totalMembers = new Set(povs.flatMap(pov => 
    pov.team?.members.map((m: TeamMember) => m.user.id) ?? []
  )).size;

  const assignedMembers = new Set(povs.flatMap(pov =>
    pov.phases.flatMap((phase: PhaseWithTasks) =>
      phase.tasks
        .filter((task: { assignee: AssigneeInfo | null }) => task.assignee)
        .map((task: { assignee: AssigneeInfo | null }) => task.assignee!.id)
    )
  )).size;

  return {
    resourceType: 'Team Members',
    allocated: assignedMembers,
    available: totalMembers - assignedMembers,
    total: totalMembers,
  };
}

function calculateTaskAllocation(povs: ResourceUsagePoVResult[]): ResourceUsageData['tasks'] {
  const totalTasks = povs.reduce((sum: number, pov) =>
    sum + pov.phases.reduce((phaseSum: number, phase: PhaseWithTasks) =>
      phaseSum + phase.tasks.length, 0), 0);

  const assignedTasks = povs.reduce((sum: number, pov) =>
    sum + pov.phases.reduce((phaseSum: number, phase: PhaseWithTasks) =>
      phaseSum + phase.tasks.filter((task: { assignee: AssigneeInfo | null }) => task.assignee).length, 0), 0);

  return {
    resourceType: 'Tasks',
    allocated: assignedTasks,
    available: totalTasks - assignedTasks,
    total: totalTasks,
  };
}

function calculateTimelineAllocation(povs: ResourceUsagePoVResult[]): ResourceUsageData['timeline'] {
  const now = new Date();
  const totalPhases = povs.reduce((sum: number, pov) => sum + pov.phases.length, 0);
  const activePhases = povs.reduce((sum: number, pov) =>
    sum + pov.phases.filter((phase: PhaseWithTasks) =>
      phase.startDate && phase.endDate && now >= phase.startDate && now <= phase.endDate
    ).length, 0);

  return {
    resourceType: 'Timeline',
    allocated: activePhases,
    available: totalPhases - activePhases,
    total: totalPhases,
  };
}

function calculateOverallRisk(povs: RiskOverviewPoVResult[]): RiskOverviewData['overall'] {
  const riskCounts = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  povs.forEach(pov => {
    const priority = pov.priority;
    if (priority === Priority.LOW) riskCounts.LOW++;
    else if (priority === Priority.MEDIUM) riskCounts.MEDIUM++;
    else if (priority === Priority.HIGH) riskCounts.HIGH++;
  });

  const total = povs.length;
  return Object.entries(riskCounts).map(([level, count]) => ({
    level: level as 'LOW' | 'MEDIUM' | 'HIGH',
    count,
    percentage: total ? Math.round((count / total) * 100) : 0,
    trend: 'STABLE', // Would need historical data for actual trend
  }));
}

function calculateRiskByCategory(povs: RiskOverviewPoVResult[]): RiskOverviewData['byCategory'] {
  const categories = {
    PLANNING: povs.filter(pov => 
      pov.phases.some((phase: PhaseWithTasks) => phase.type && phase.type === 'PLANNING')
    ),
    EXECUTION: povs.filter(pov => 
      pov.phases.some((phase: PhaseWithTasks) => phase.type && phase.type === 'EXECUTION')
    ),
    REVIEW: povs.filter(pov => 
      pov.phases.some((phase: PhaseWithTasks) => phase.type && phase.type === 'REVIEW')
    ),
  } as const;

  return Object.entries(categories).reduce((acc, [category, categoryPovs]) => {
    acc[category as keyof typeof categories] = calculateOverallRisk(categoryPovs);
    return acc;
  }, {} as RiskOverviewData['byCategory']);
}

function calculateCurrentSuccessRate(povs: SuccessRatePoVResult[]): number {
  const wonPovs = povs.filter(pov => pov.status === POVStatus.WON);
  if (!wonPovs.length) return 0;

  const successfulPovs = wonPovs.filter(pov => {
    const completedTasks = pov.phases.reduce((sum: number, phase: PhaseWithTasks): number =>
      sum + phase.tasks.filter((task: { status: string }) => task.status === 'COMPLETED').length, 0 as number);
    const totalTasks = pov.phases.reduce((sum: number, phase: PhaseWithTasks): number =>
      sum + phase.tasks.length, 0 as number);
    return totalTasks > 0 && (completedTasks / totalTasks) >= 0.8; // 80% completion threshold
  });

  return Math.round((successfulPovs.length / wonPovs.length) * 100);
}

function calculateHistoricalSuccessRate(povs: SuccessRatePoVResult[]): SuccessRateData['historical'] {
  // Group PoVs by month
  type MonthlyPovs = Record<string, SuccessRatePoVResult[]>;
  const monthlyPovs = povs.reduce<MonthlyPovs>((acc, pov) => {
    const month = pov.createdAt.toISOString().slice(0, 7); // YYYY-MM
    if (!acc[month]) acc[month] = [];
    acc[month].push(pov);
    return acc;
  }, {} as Record<string, typeof povs>);

  return Object.entries(monthlyPovs).map(([period, periodPovs]) => {
    const total = periodPovs.length;
    const successful = periodPovs.filter(pov => pov.status === POVStatus.WON).length;
    return {
      period,
      rate: total ? Math.round((successful / total) * 100) : 0,
      total,
      successful,
      factors: [], // Would need additional data for success factors
    };
  });
}

function calculateSuccessByCategory(povs: SuccessRatePoVResult[]): SuccessRateData['byCategory'] {
  const categories = povs.reduce((acc: CategoryMap, pov) => {
    pov.phases.forEach((phase: PhaseWithTasks) => {
      if (phase.type && phase.type in acc) {
        acc[phase.type].total++;
        if (phase.tasks.every((task: { status: string }) => task.status === 'COMPLETED')) {
          acc[phase.type].completed++;
        }
      }
    });
    return acc;
  }, {
    PLANNING: { total: 0, completed: 0 },
    EXECUTION: { total: 0, completed: 0 },
    REVIEW: { total: 0, completed: 0 }
  } as CategoryMap);

  return Object.entries(categories).reduce<Record<string, number>>((acc, [category, stats]) => {
    const typedStats = stats as { total: number; completed: number };
    const categoryKey = category as string;
    acc[categoryKey] = typedStats.total ? Math.round((typedStats.completed / typedStats.total) * 100) : 0;
    return acc;
  }, {});
}
