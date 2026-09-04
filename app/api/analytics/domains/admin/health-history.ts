import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';

/**
 * Health History API
 * Returns historical health scores for timeline visualization
 *
 * Calculates metrics by analyzing task_activities for completion events
 * and reconstructing health state at each time point.
 */

interface HealthDataPoint {
  date: string; // ISO date string
  healthScore: number;
  completionRate: number;
  overduePercent: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalPOVs: number;
  activePOVs: number; // IN_PROGRESS, STALLED, VALIDATION
  atRiskPOVs: number; // Active POVs with overdue tasks
  agentExecutions: number; // Total executions
  agentSuccessRate: number; // Success rate %
}

interface HealthHistoryResult {
  dataPoints: HealthDataPoint[];
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
}

/**
 * Calculate health score — DELIBERATELY DIFFERENT from portfolio-health.ts
 * (comment previously claimed "same formula"; corrected 2026-06-12).
 *
 * portfolio-health.ts calculatePOVHealthScore: completion 0.40 + overdue 0.35
 *   + timeline 0.25 (3-factor — drives the dashboard header "HEALTH: N")
 * This (history chart "HEALTH SCORE"): completion 0.55 + overdue 0.45
 *   (2-factor — historical snapshots lack timeline context)
 *
 * The two numbers can legitimately diverge (e.g. 61 vs 75 when stalled demo
 * POVs tank the timeline factor). Different metrics BY DESIGN — verified
 * 2026-06-12 dashboard audit; do not "fix" one to match the other.
 */
function calculateHealthScore(
  completionRate: number,
  overdueRatio: number
): number {
  // Simplified formula without timeline component (historical data)
  const completionWeight = 0.55;
  const overdueWeight = 0.45;

  const completionScore = completionRate;
  const overdueScore = Math.max(0, 100 - (overdueRatio * 100));

  return Math.round(
    (completionScore * completionWeight) +
    (overdueScore * overdueWeight)
  );
}

/**
 * Get start of week (Monday) for a date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Generate date range for the requested period
 */
function generateDateRange(startDate: Date, endDate: Date, period: 'daily' | 'weekly' | 'monthly'): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));

    if (period === 'daily') {
      current.setDate(current.getDate() + 1);
    } else if (period === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}

export async function handleHealthHistory(
  params: { months?: number; period?: 'daily' | 'weekly' | 'monthly' },
  user: TokenPayload
): Promise<{ data: HealthHistoryResult }> {
  const months = params.months || 6;
  const period = params.period || 'weekly';

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  // Adjust start date to week boundary if weekly
  const adjustedStartDate = period === 'weekly' ? getWeekStart(startDate) : startDate;

  // Fetch tasks from ACTIVE POVs only (IN_PROGRESS, STALLED, VALIDATION)
  // Health score is calculated on active POVs, not completed/projected ones
  const tasks = await prisma.task.findMany({
    where: {
      createdAt: { lte: endDate },
      pov: {
        status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] }
      }
    },
    take: 10000, // Phase 2 safety cap: historical analysis needs breadth
    select: {
      id: true,
      createdAt: true,
      dueDate: true,
      status: true,
      povId: true,
    }
  });

  // Fetch completion events from task_activities
  const completionActivities = await prisma.taskActivity.findMany({
    where: {
      timestamp: { gte: adjustedStartDate, lte: endDate },
      OR: [
        { action: { contains: 'completed' } },
        { action: { contains: 'Completed' } },
      ]
    },
    take: 10000, // Phase 2 safety cap: date-ranged but could span months
    select: {
      taskId: true,
      timestamp: true,
      action: true,
    },
    orderBy: { timestamp: 'asc' }
  });

  // Build a map of task completion dates
  const taskCompletionDates = new Map<string, Date>();
  for (const activity of completionActivities) {
    if (!taskCompletionDates.has(activity.taskId)) {
      taskCompletionDates.set(activity.taskId, new Date(activity.timestamp));
    }
  }

  // Also check current status for tasks completed before our tracking started
  for (const task of tasks) {
    if (task.status === 'COMPLETED' && !taskCompletionDates.has(task.id)) {
      // Estimate completion as creation date + average completion time, or use createdAt
      // For simplicity, we'll mark these as completed at start of our range
      taskCompletionDates.set(task.id, adjustedStartDate);
    }
  }

  // Fetch POV data for active POV counts over time
  const povs = await prisma.pOV.findMany({
    where: {
      createdAt: { lte: endDate }
    },
    take: 1000, // Phase 2 safety cap: all POVs ever created
    select: {
      id: true,
      createdAt: true,
      status: true,
    }
  });

  // Fetch agent execution data for success rate tracking
  const agentExecutions = await prisma.agentExecution.findMany({
    where: {
      startTime: { gte: adjustedStartDate, lte: endDate }
    },
    take: 10000, // Phase 2 safety cap: executions can span 6+ months
    select: {
      id: true,
      startTime: true,
      status: true, // SUCCESS, FAILED, RUNNING, etc.
    },
    orderBy: { startTime: 'asc' }
  });

  // Generate date points
  const datePoints = generateDateRange(adjustedStartDate, endDate, period);

  // Calculate metrics for each date point
  const dataPoints: HealthDataPoint[] = datePoints.map(pointDate => {
    // Tasks that existed at this point
    const existingTasks = tasks.filter(t => new Date(t.createdAt) <= pointDate);

    // Tasks completed by this point
    const completedAtPoint = existingTasks.filter(t => {
      const completionDate = taskCompletionDates.get(t.id);
      return completionDate && completionDate <= pointDate;
    });

    // Tasks overdue at this point (had due date before point, not completed by point)
    const overdueAtPoint = existingTasks.filter(t => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      if (dueDate >= pointDate) return false; // Not yet due

      const completionDate = taskCompletionDates.get(t.id);
      if (completionDate && completionDate <= pointDate) return false; // Already completed

      return true; // Was overdue at this point
    });

    // Total POVs at this point (created by this date, not WON/LOST)
    const totalPOVsAtPoint = povs.filter(p => {
      const created = new Date(p.createdAt);
      return created <= pointDate && !['WON', 'LOST'].includes(p.status);
    });

    // Active POVs at this point (IN_PROGRESS, STALLED, VALIDATION)
    const activePOVsAtPoint = povs.filter(p => {
      const created = new Date(p.createdAt);
      return created <= pointDate && ['IN_PROGRESS', 'STALLED', 'VALIDATION'].includes(p.status);
    });

    // At Risk POVs - POVs with overdue tasks
    const atRiskPOVsAtPoint = activePOVsAtPoint.filter(p => {
      const povTasks = existingTasks.filter(t => t.povId === p.id);
      const povOverdue = povTasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        if (dueDate >= pointDate) return false;
        const completionDate = taskCompletionDates.get(t.id);
        return !completionDate || completionDate > pointDate;
      });
      return povOverdue.length > 0;
    });

    const totalTasks = existingTasks.length;
    const completedTasks = completedAtPoint.length;
    const overdueTasks = overdueAtPoint.length;

    const completionRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
    const overduePercent = totalTasks > 0
      ? Math.round((overdueTasks / totalTasks) * 100)
      : 0;
    const overdueRatio = totalTasks > 0 ? overdueTasks / totalTasks : 0;

    const healthScore = calculateHealthScore(completionRate, overdueRatio);

    // Agent executions at this point (completed by this date)
    const executionsAtPoint = agentExecutions.filter(e => {
      if (!e.startTime) return false; // Filter out null startTime
      const execDate = new Date(e.startTime);
      return execDate <= pointDate;
    });
    const successfulExecutions = executionsAtPoint.filter(e => e.status === 'SUCCESS').length;
    const agentSuccessRate = executionsAtPoint.length > 0
      ? Math.round((successfulExecutions / executionsAtPoint.length) * 100)
      : 0;

    return {
      date: pointDate.toISOString().split('T')[0],
      healthScore,
      completionRate,
      overduePercent,
      totalTasks,
      completedTasks,
      overdueTasks,
      totalPOVs: totalPOVsAtPoint.length,
      activePOVs: activePOVsAtPoint.length,
      atRiskPOVs: atRiskPOVsAtPoint.length,
      agentExecutions: executionsAtPoint.length,
      agentSuccessRate,
    };
  });

  return {
    data: {
      dataPoints,
      period,
      startDate: adjustedStartDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }
  };
}
