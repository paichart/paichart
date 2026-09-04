import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { prisma } from '@/lib/prisma';

/**
 * Portfolio Health Handler
 * Phase 2 of Admin Intelligence Implementation
 *
 * Provides cross-POV aggregation metrics for administrators:
 * - Portfolio health score (0-100)
 * - At-risk POVs (overdue tasks)
 * - Phase bottlenecks (system-wide)
 * - Geographic distribution
 * - Completion rates
 *
 * Admin-only: Bypasses POV access control to see all POVs
 */

interface AtRiskPOV {
  id: string;
  title: string;
  status: string;
  priority: string;
  overdueTaskCount: number;
  totalTaskCount: number;
  completionRate: number;
  daysStuck: number;
  ownerEmail?: string;
  salesTheatre: string;
}

// A POV with incomplete tasks older than this is at-risk even with no
// overdue due-dates and a passable health score. 2026-06-12 UX fix: the
// dashboard showed AT-RISK: 0 while Phase Bottlenecks showed POVs stuck
// 240-290 days — stuck-ness wasn't part of the at-risk definition at all
// (demo/real tasks often have no dueDate, so `overdueTasks > 0` never fired).
const STUCK_AT_RISK_DAYS = 30;

interface PhaseBottleneck {
  phaseName: string;
  phaseType: string;
  incompleteTasks: number;
  povCount: number;
  avgDaysStuck: number;
  // 2026-06-12 UX: worst-stuck POVs for the drill-down dialog (was a static
  // "view the table above" message with no actual POVs)
  affectedPOVs: Array<{ id: string; title: string; daysStuck: number }>;
}

interface GeographicDistribution {
  theatre: string;
  povCount: number;
  avgHealthScore: number;
  atRiskCount: number;
}

interface PortfolioHealthResult {
  summary: {
    totalPOVs: number;
    activePOVs: number;
    atRiskPOVs: number;
    healthScore: number;
    avgCompletionRate: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  atRiskPOVs: AtRiskPOV[];
  phaseBottlenecks: PhaseBottleneck[];
  geographicDistribution: GeographicDistribution[];
  statusBreakdown: {
    status: string;
    count: number;
    percentage: number;
  }[];
  priorityBreakdown: {
    priority: string;
    count: number;
    percentage: number;
  }[];
}

/**
 * Calculate health score for a POV based on multiple factors
 */
function calculatePOVHealthScore(
  completionRate: number,
  overdueRatio: number,
  daysToDeadline: number
): number {
  // Weight factors
  const completionWeight = 0.4;
  const overdueWeight = 0.35;
  const timelineWeight = 0.25;

  // Completion score (0-100)
  const completionScore = completionRate;

  // Overdue score (100 = no overdue, 0 = all overdue)
  const overdueScore = Math.max(0, 100 - (overdueRatio * 100));

  // Timeline score (based on days to deadline)
  let timelineScore = 100;
  if (daysToDeadline < 0) {
    timelineScore = Math.max(0, 50 + daysToDeadline * 2); // Reduce by 2 points per overdue day
  } else if (daysToDeadline < 7) {
    timelineScore = 70 + (daysToDeadline * 4); // 70-98 for last week
  } else if (daysToDeadline < 30) {
    timelineScore = 90 + (Math.min(daysToDeadline - 7, 10)); // 90-100
  }

  return Math.round(
    (completionScore * completionWeight) +
    (overdueScore * overdueWeight) +
    (timelineScore * timelineWeight)
  );
}

export async function handlePortfolioHealth(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
): Promise<{ data: PortfolioHealthResult }> {
  const now = new Date();

  // Fetch all ACTIVE POVs with tasks and phases
  // Active POVs = IN_PROGRESS, STALLED, VALIDATION (excludes PROJECTED, WON, LOST)
  // This ensures At-Risk POVs, Phase Bottlenecks, and health metrics
  // are calculated on POVs that are actively being worked
  const allPOVs = await prisma.pOV.findMany({
    where: {
      status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] }
    },
    take: 200, // Phase 2 safety cap: active POVs with deep hierarchy
    include: {
      phases: {
        include: {
          tasks: {
            take: 200, // Phase 2 safety cap: tasks per phase
            select: {
              id: true,
              status: true,
              dueDate: true,
              createdAt: true,
            }
          }
        }
      },
      owner: {
        select: {
          email: true,
          name: true,
        }
      },
      team: {
        include: {
          members: {
            take: 50, // Phase 2 safety cap: members per team
            select: { userId: true }
          }
        }
      }
    }
  });

  // Also get total POV count (including completed)
  const totalPOVCount = await prisma.pOV.count();

  // Calculate per-POV metrics
  const povMetrics = allPOVs.map(pov => {
    const allTasks = pov.phases.flatMap(p => p.tasks);
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
    const overdueTasks = allTasks.filter(t =>
      t.dueDate &&
      new Date(t.dueDate) < now &&
      t.status !== 'COMPLETED'
    ).length;

    const completionRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
    const overdueRatio = totalTasks > 0 ? overdueTasks / totalTasks : 0;
    const daysToDeadline = Math.ceil((new Date(pov.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const healthScore = calculatePOVHealthScore(completionRate, overdueRatio, daysToDeadline);

    // Stuck signal: age of the oldest incomplete task (days). Catches POVs
    // that are parked even when no task carries a (past-due) dueDate.
    const oldestIncomplete = allTasks
      .filter(t => t.status !== 'COMPLETED')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    const daysStuck = oldestIncomplete
      ? Math.ceil((now.getTime() - new Date(oldestIncomplete.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      pov,
      totalTasks,
      completedTasks,
      overdueTasks,
      completionRate,
      healthScore,
      daysStuck,
      isAtRisk: overdueTasks > 0 || healthScore < 50 || daysStuck > STUCK_AT_RISK_DAYS,
    };
  });

  // Calculate summary metrics
  const activePOVs = allPOVs.length;
  const atRiskPOVs = povMetrics.filter(p => p.isAtRisk).length;
  const avgHealthScore = activePOVs > 0
    ? Math.round(povMetrics.reduce((sum, p) => sum + p.healthScore, 0) / activePOVs)
    : 100;
  const avgCompletionRate = activePOVs > 0
    ? Math.round(povMetrics.reduce((sum, p) => sum + p.completionRate, 0) / activePOVs)
    : 0;
  const totalTasks = povMetrics.reduce((sum, p) => sum + p.totalTasks, 0);
  const completedTasks = povMetrics.reduce((sum, p) => sum + p.completedTasks, 0);
  const overdueTasks = povMetrics.reduce((sum, p) => sum + p.overdueTasks, 0);

  // Top 10 at-risk POVs
  const atRiskPOVsList: AtRiskPOV[] = povMetrics
    .filter(p => p.isAtRisk)
    .sort((a, b) => b.overdueTasks - a.overdueTasks || b.daysStuck - a.daysStuck || a.healthScore - b.healthScore)
    .slice(0, 10)
    .map(p => ({
      id: p.pov.id,
      title: p.pov.title,
      status: p.pov.status,
      priority: p.pov.priority,
      overdueTaskCount: p.overdueTasks,
      totalTaskCount: p.totalTasks,
      completionRate: p.completionRate,
      daysStuck: p.daysStuck,
      ownerEmail: p.pov.owner?.email,
      salesTheatre: p.pov.salesTheatre,
    }));

  // Phase bottlenecks (aggregate across all POVs)
  const phaseMap = new Map<string, {
    incompleteTasks: number;
    povIds: Set<string>;
    totalDaysStuck: number;
    affected: Array<{ id: string; title: string; daysStuck: number }>;
  }>();

  for (const pov of allPOVs) {
    for (const phase of pov.phases) {
      const incompleteTasks = phase.tasks.filter(t => t.status !== 'COMPLETED').length;
      if (incompleteTasks > 0) {
        const key = phase.name;
        const existing = phaseMap.get(key) || {
          incompleteTasks: 0,
          povIds: new Set<string>(),
          totalDaysStuck: 0,
          affected: []
        };
        existing.incompleteTasks += incompleteTasks;
        existing.povIds.add(pov.id);

        // Calculate average days stuck (oldest incomplete task)
        const oldestIncomplete = phase.tasks
          .filter(t => t.status !== 'COMPLETED')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        if (oldestIncomplete) {
          const daysStuck = Math.ceil((now.getTime() - new Date(oldestIncomplete.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          existing.totalDaysStuck += daysStuck;
          existing.affected.push({ id: pov.id, title: pov.title, daysStuck });
        }

        phaseMap.set(key, existing);
      }
    }
  }

  const phaseBottlenecks: PhaseBottleneck[] = Array.from(phaseMap.entries())
    .map(([phaseName, data]) => ({
      phaseName,
      phaseType: 'STANDARD', // Could be enhanced to track phase type
      incompleteTasks: data.incompleteTasks,
      povCount: data.povIds.size,
      avgDaysStuck: data.povIds.size > 0
        ? Math.round(data.totalDaysStuck / data.povIds.size)
        : 0,
      // Worst-stuck first, capped for the drill-down dialog
      affectedPOVs: data.affected
        .sort((a, b) => b.daysStuck - a.daysStuck)
        .slice(0, 5),
    }))
    .sort((a, b) => b.incompleteTasks - a.incompleteTasks)
    .slice(0, 10);

  // Geographic distribution
  const theatreMap = new Map<string, {
    povCount: number;
    totalHealth: number;
    atRiskCount: number;
  }>();

  for (const pm of povMetrics) {
    const theatre = pm.pov.salesTheatre || 'UNKNOWN';
    const existing = theatreMap.get(theatre) || { povCount: 0, totalHealth: 0, atRiskCount: 0 };
    existing.povCount++;
    existing.totalHealth += pm.healthScore;
    if (pm.isAtRisk) existing.atRiskCount++;
    theatreMap.set(theatre, existing);
  }

  const geographicDistribution: GeographicDistribution[] = Array.from(theatreMap.entries())
    .map(([theatre, data]) => ({
      theatre,
      povCount: data.povCount,
      avgHealthScore: data.povCount > 0 ? Math.round(data.totalHealth / data.povCount) : 0,
      atRiskCount: data.atRiskCount,
    }))
    .sort((a, b) => b.povCount - a.povCount);

  // Status breakdown
  const statusCounts = new Map<string, number>();
  for (const pov of allPOVs) {
    statusCounts.set(pov.status, (statusCounts.get(pov.status) || 0) + 1);
  }
  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,
      count,
      percentage: activePOVs > 0 ? Math.round((count / activePOVs) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Priority breakdown
  const priorityCounts = new Map<string, number>();
  for (const pov of allPOVs) {
    priorityCounts.set(pov.priority, (priorityCounts.get(pov.priority) || 0) + 1);
  }
  const priorityBreakdown = Array.from(priorityCounts.entries())
    .map(([priority, count]) => ({
      priority,
      count,
      percentage: activePOVs > 0 ? Math.round((count / activePOVs) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    data: {
      summary: {
        totalPOVs: totalPOVCount,
        activePOVs,
        atRiskPOVs,
        healthScore: avgHealthScore,
        avgCompletionRate,
        totalTasks,
        completedTasks,
        overdueTasks,
      },
      atRiskPOVs: atRiskPOVsList,
      phaseBottlenecks,
      geographicDistribution,
      statusBreakdown,
      priorityBreakdown,
    },
  };
}
