import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';

/**
 * SEC-I1 fail-closed scope floor for the unified analytics methods. The service is user-agnostic
 * (it never learns who the caller is) — so it cannot enforce ACCESS, but it CAN refuse to run an
 * accidentally-unscoped query that would aggregate all tenants. Callers must pass one of:
 *   - filters.povId            (single POV)
 *   - filters.povIds           (cross-POV; [] is a valid scope → { in: [] } → zero rows)
 *   - opts.scope='GLOBAL_ADMIN'(intentional admin-global)
 * An empty povIds array IS a scope, so the trigger is "absent", not "empty". This converts a
 * forgotten scope from a silent cross-tenant leak into a loud error. (Guarded by the CI invariant
 * in scripts/test-security-invariants.ts.)
 */
export function assertAnalyticsScoped(
  filters: { povId?: string; povIds?: string[] },
  opts?: { scope?: 'GLOBAL_ADMIN' }
): void {
  const scoped = filters.povId !== undefined || filters.povIds !== undefined || opts?.scope === 'GLOBAL_ADMIN';
  if (!scoped) {
    throw new Error(
      "TaskAnalyticsService: refusing unscoped analytics query — pass povId, povIds (incl. [] for fail-closed), or { scope: 'GLOBAL_ADMIN' } for an intentional admin-global query (SEC-I1)."
    );
  }
}

export interface TaskPerformanceMetrics {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageCompletionTime: number;
  onTimeRate: number;
  overdueTasks: number;
}

export interface TaskInsights {
  tasksAtRisk: number;
  blockedTasks: number;
  productivityTrend: number;
  averageWorkload: number;
}

export interface TeamPerformanceMetrics {
  teamId: string;
  teamName: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageCompletionTime: number;
  members: {
    userId: string;
    userName: string;
    activeTasks: number;
    completedTasks: number;
  }[];
}

export class TaskAnalyticsService {
  /**
   * Calculate task performance metrics
   */
  static async getTaskPerformance(filters: {
    povId?: string;
    povIds?: string[];
    phaseId?: string;
    assigneeId?: string;
    teamId?: string;
    startDate?: Date;
    endDate?: Date;
    timeframeDays?: number;
  }, opts?: { include?: Array<'distribution' | 'trends' | 'topPerformers'>; scope?: 'GLOBAL_ADMIN' }): Promise<any> {
    try {
      // SEC-I1 fail-closed floor: refuse an unscoped (no povId/povIds) non-admin query rather
      // than silently aggregating all tenants. Empty povIds:[] IS a scope → {in:[]} → zero rows.
      assertAnalyticsScoped(filters, opts);

      // Scoping (POV/phase/assignee/team) — single source for GUI /api/analytics + MCP analytics.generate.
      const scopeWhere: any = {};
      if (filters.povId) scopeWhere.povId = filters.povId;
      else if (filters.povIds) scopeWhere.povId = { in: filters.povIds }; // SEC-C2: empty [] → {in:[]} → zero rows (fail-closed)
      if (filters.phaseId) scopeWhere.phaseId = filters.phaseId;
      if (filters.assigneeId) scopeWhere.assigneeId = filters.assigneeId;
      if (filters.teamId) scopeWhere.teamId = filters.teamId;

      // `where` adds the createdAt window — used ONLY for the activity blocks below
      // (distribution/trends/topPerformers), which are period-of-activity views.
      const where: any = { ...scopeWhere };
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      } else if (filters.timeframeDays) {
        where.createdAt = { gte: new Date(Date.now() - filters.timeframeDays * 24 * 60 * 60 * 1000) };
      }

      // Core scalar queries — parallel (F-F: was sequential awaits).
      // Completion is a STATE, not a flow: these use `scopeWhere` (UN-WINDOWED) so the rate/counts
      // reflect the project's full picture. Windowing by createdAt showed 0% for projects whose
      // tasks predate the window (and a finished project would show 0% under any date window).
      // F-G: completedTasks cap 10000. averageCompletionTime/onTimeRate use the real `completedAt`
      // (set at the status→COMPLETED transition by taskCompletedAtExtension), falling back to
      // `updatedAt` for rows not yet backfilled.
      const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
        prisma.task.count({ where: scopeWhere }),
        prisma.task.findMany({
          where: { ...scopeWhere, status: 'COMPLETED' },
          select: { id: true, createdAt: true, updatedAt: true, completedAt: true, dueDate: true },
          take: 10000,
        }),
        prisma.task.count({ where: { ...scopeWhere, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } }),
      ]);

      const completionRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;
      const completedAtOf = (t: { completedAt: Date | null; updatedAt: Date }) => t.completedAt ?? t.updatedAt;
      const completionTimes = completedTasks.map(t => (completedAtOf(t).getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const averageCompletionTime = completionTimes.length > 0
        ? completionTimes.reduce((s, t) => s + t, 0) / completionTimes.length : 0;
      const onTimeCompletions = completedTasks.filter(t => !t.dueDate || completedAtOf(t) <= t.dueDate).length;
      const onTimeRate = completedTasks.length > 0 ? (onTimeCompletions / completedTasks.length) * 100 : 0;

      const summary = {
        totalTasks,
        completedTasks: completedTasks.length,
        completionRate: Math.round(completionRate * 100) / 100,
        averageCompletionTime: Math.round(averageCompletionTime * 100) / 100,
        onTimeRate: Math.round(onTimeRate * 100) / 100,
        overdueTasks,
      };

      // MCP default path: flat scalars, no extra queries (exact Object.keys per BC-I1).
      if (!opts?.include?.length) return summary;

      // Rich blocks (GUI) — ported verbatim from the former domains/tasks/performance.ts (F-E:
      // do NOT merge/reorder queries; the source recorded a 196% regression from consolidation).
      const [tasksByStatus, tasksByPriority, tasksByType, matchingTasks, topPerformers] = await Promise.all([
        prisma.task.groupBy({ by: ['status'], where, _count: { id: true } }),
        prisma.task.groupBy({ by: ['priority'], where, _count: { id: true } }),
        prisma.task.groupBy({ by: ['type'], where, _count: { id: true } }),
        prisma.task.findMany({ where, select: { id: true }, take: 10000 }),
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: { ...where, status: 'COMPLETED', assigneeId: { not: null } },
          _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5,
        }),
      ]);

      const taskIds = matchingTasks.map(t => t.id);
      const performerIds = topPerformers.map(p => p.assigneeId).filter((id): id is string => id !== null);
      const [activityTrends, performers] = await Promise.all([
        taskIds.length > 0 ? prisma.taskActivity.groupBy({
          by: ['action'],
          where: { timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, taskId: { in: taskIds } },
          _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10,
        }) : Promise.resolve([]),
        prisma.user.findMany({ where: { id: { in: performerIds } }, select: { id: true, name: true, email: true } }),
      ]);

      return {
        ...summary,
        distribution: {
          byStatus: tasksByStatus.map(i => ({ status: i.status, count: i._count.id })),
          byPriority: tasksByPriority.map(i => ({ priority: i.priority, count: i._count.id })),
          byType: tasksByType.map(i => ({ type: i.type, count: i._count.id })),
        },
        trends: { activityTrends: activityTrends.map(t => ({ action: t.action, count: t._count.id })) },
        topPerformers: topPerformers.map(p => ({
          assigneeId: p.assigneeId,
          user: performers.find(u => u.id === p.assigneeId) ?? null, // F-B: .find()→undefined; schema .nullable() rejects undefined
          completedTasks: p._count.id,
        })),
      };
    } catch (error) {
      taskLogger.error({ err: error }, 'getTaskPerformance failed');
      throw error;
    }
  }

  /**
   * Generate AI insights for tasks
   */
  static async getTaskInsights(filters: {
    povId?: string;
    povIds?: string[];
    phaseId?: string;
    teamId?: string;
  }, opts?: { include?: Array<'risks' | 'workload' | 'bottlenecks' | 'recommendations'>; scope?: 'GLOBAL_ADMIN' }): Promise<any> {
    try {
      assertAnalyticsScoped(filters, opts); // SEC-I1 fail-closed floor

      const where: any = {};
      if (filters.povId) where.povId = filters.povId;
      else if (filters.povIds) where.povId = { in: filters.povIds }; // SEC-C2: empty [] → {in:[]} → zero rows (fail-closed)
      if (filters.phaseId) where.phaseId = filters.phaseId;
      if (filters.teamId) where.teamId = filters.teamId;

      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Shared where-clauses so the scalar count() and the detail findMany agree exactly (up to cap).
      const atRiskWhere = { ...where, status: { not: 'COMPLETED' }, OR: [{ dueDate: { lt: now } }, { dueDate: { gte: now, lte: threeDaysFromNow } }] };
      const blockedWhere = { ...where, status: { not: 'COMPLETED' }, dependencies: { some: { dependsOn: { status: { not: 'COMPLETED' } } } } };
      const workloadWhere = { ...where, status: { not: 'COMPLETED' }, assigneeId: { not: null } };

      // Scalars — exact count() (F-K), per-item .catch() fault isolation. Parallel.
      const [tasksAtRiskCount, blockedTasksCount, recentCompletions, previousCompletions, workloadData] = await Promise.all([
        prisma.task.count({ where: atRiskWhere }).catch(err => { taskLogger.warn({ err }, 'Tasks at risk count failed — defaulting to 0'); return 0; }),
        prisma.task.count({ where: blockedWhere }).catch(err => { taskLogger.warn({ err }, 'Blocked tasks count failed — defaulting to 0'); return 0; }),
        prisma.task.count({ where: { ...where, status: 'COMPLETED', updatedAt: { gte: thirtyDaysAgo } } }).catch(err => { taskLogger.warn({ err }, 'Recent completions count failed — defaulting to 0'); return 0; }),
        prisma.task.count({ where: { ...where, status: 'COMPLETED', updatedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }).catch(err => { taskLogger.warn({ err }, 'Previous completions count failed — defaulting to 0'); return 0; }),
        prisma.task.groupBy({ by: ['assigneeId'], where: workloadWhere, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }).catch(err => { taskLogger.warn({ err }, 'Workload groupBy failed — defaulting to empty'); return []; }),
      ]);

      const productivityTrend = previousCompletions > 0
        ? ((recentCompletions - previousCompletions) / previousCompletions) * 100
        : recentCompletions > 0 ? 100 : 0;
      const averageWorkload = workloadData.length > 0
        ? workloadData.reduce((sum, w) => sum + w._count.id, 0) / workloadData.length : 0;

      const scalars = {
        tasksAtRisk: tasksAtRiskCount,
        blockedTasks: blockedTasksCount,
        productivityTrend: Math.round(productivityTrend * 100) / 100,
        averageWorkload: Math.round(averageWorkload * 100) / 100, // F-M: derived from the same groupBy the workload block uses
      };

      // MCP default path: flat scalars only (exact Object.keys per BC-I1).
      if (!opts?.include?.length) return scalars;

      // Rich blocks (GUI) — ported verbatim from the former domains/tasks/insights.ts (F-E:
      // preserve the parallel batching; the source recorded a 196% regression from consolidation).
      const [atRiskList, blockedList, phaseBottlenecks] = await Promise.all([
        prisma.task.findMany({ where: atRiskWhere, take: 1000, include: { assignee: { select: { id: true, name: true, email: true } }, phase: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' } }),
        prisma.task.findMany({ where: blockedWhere, take: 1000, include: { assignee: { select: { id: true, name: true, email: true } }, dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } } } }),
        prisma.task.groupBy({ by: ['phaseId'], where: { ...where, status: { not: 'COMPLETED' }, phaseId: { not: null } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 }),
      ]);

      const assigneeIds = workloadData.map(w => w.assigneeId).filter((id): id is string => id !== null);
      const phaseIds = phaseBottlenecks.map(p => p.phaseId).filter((id): id is string => id !== null);
      const [assignees, phases] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } }),
        prisma.phase.findMany({ where: { id: { in: phaseIds } }, select: { id: true, name: true, type: true } }),
      ]);

      const workloadWithDetails = workloadData.map(w => ({ assignee: assignees.find(a => a.id === w.assigneeId) ?? null, activeTasks: w._count.id })); // F-B
      const bottlenecksWithDetails = phaseBottlenecks.map(b => ({ phase: phases.find(p => p.id === b.phaseId) ?? null, incompleteTasks: b._count.id })); // F-B

      const avgWorkload = averageWorkload;
      const maxWorkload = workloadWithDetails.length > 0 ? Math.max(...workloadWithDetails.map(w => w.activeTasks)) : 0; // F-N: guard empty → no -Infinity

      const recommendations: any[] = [];
      if (tasksAtRiskCount > 0) { // F-K: exact count, not capped list length
        recommendations.push({ type: 'RISK_MITIGATION', priority: 'HIGH', title: `${tasksAtRiskCount} tasks at risk`, description: `You have ${tasksAtRiskCount} tasks that are overdue or due soon. Consider reassigning or extending deadlines.`, actionItems: ['Review overdue tasks and update priorities', 'Contact assignees for status updates', 'Consider deadline extensions where appropriate'] });
      }
      if (maxWorkload > avgWorkload * 1.5) {
        const overloadedUser = workloadWithDetails.find(w => w.activeTasks === maxWorkload);
        recommendations.push({ type: 'WORKLOAD_BALANCING', priority: 'MEDIUM', title: 'Uneven workload distribution detected', description: `${overloadedUser?.assignee?.name} has ${maxWorkload} active tasks, significantly above average (${Math.round(avgWorkload)}).`, actionItems: ['Redistribute tasks from overloaded team members', 'Review task complexity and effort estimates', 'Consider additional resources for high-workload areas'] });
      }
      if (productivityTrend < -20) {
        recommendations.push({ type: 'PRODUCTIVITY_IMPROVEMENT', priority: 'MEDIUM', title: 'Declining productivity trend', description: `Task completion rate has decreased by ${Math.abs(Math.round(productivityTrend))}% compared to the previous period.`, actionItems: ['Analyze blockers and impediments', 'Review team capacity and availability', 'Consider process improvements or training'] });
      }
      if (bottlenecksWithDetails.length > 0) {
        const topBottleneck = bottlenecksWithDetails[0];
        recommendations.push({ type: 'BOTTLENECK_RESOLUTION', priority: 'MEDIUM', title: `Bottleneck detected in ${topBottleneck.phase?.name}`, description: `${topBottleneck.phase?.name} phase has ${topBottleneck.incompleteTasks} incomplete tasks, more than other phases.`, actionItems: ['Review phase requirements and dependencies', 'Allocate additional resources to bottleneck phase', 'Consider parallel execution where possible'] });
      }

      return {
        ...scalars,
        risks: {
          tasksAtRisk: atRiskList.map(task => ({ id: task.id, title: task.title, dueDate: task.dueDate, assignee: task.assignee, phase: task.phase, daysOverdue: task.dueDate ? Math.ceil((now.getTime() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0 })),
          blockedTasks: blockedList.map(task => ({ id: task.id, title: task.title, assignee: task.assignee, blockingDependencies: task.dependencies.map(dep => dep.dependsOn) })),
        },
        workload: { distribution: workloadWithDetails, imbalanceScore: maxWorkload > 0 ? Math.round((maxWorkload / avgWorkload) * 100) / 100 : 0 },
        bottlenecks: bottlenecksWithDetails,
        recommendations,
      };
    } catch (error) {
      taskLogger.error({ err: error }, 'getTaskInsights failed');
      throw error;
    }
  }

  /**
   * Get team-level performance metrics
   */
  static async getTeamPerformance(teamId: string, timeframeDays: number = 30): Promise<TeamPerformanceMetrics> {
    try {
      const where = {
        teamId,
        createdAt: {
          gte: new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000)
        }
      };

      // Get team details
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { name: true }
      });

      if (!team) {
        throw new Error('Team not found');
      }

      // Parallel query optimization (Dec 2025 - 3 independent queries → ~67% faster)
      // FAULT ISOLATION: Per-item .catch() prevents one count failure from hiding team metrics
      const [totalTasks, completedTasks, completedTasksWithTimes] = await Promise.all([
        // Get total team tasks
        prisma.task.count({ where })
          .catch(err => { taskLogger.warn({ err }, 'Total tasks count failed — defaulting to 0'); return 0; }),
        // Get completed team tasks count
        prisma.task.count({
          where: { ...where, status: 'COMPLETED' }
        }).catch(err => { taskLogger.warn({ err }, 'Completed tasks count failed — defaulting to 0'); return 0; }),
        // Get completed tasks with times for average calculation
        prisma.task.findMany({
          where: { ...where, status: 'COMPLETED' },
          select: {
            createdAt: true,
            updatedAt: true,
            completedAt: true
          },
          take: 5000,
        }).catch(err => { taskLogger.warn({ err }, 'Completion times query failed — defaulting to empty'); return []; })
      ]);

      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      const completionTimes = completedTasksWithTimes.map(task => {
        // Real completion time via completedAt; updatedAt fallback for not-yet-backfilled rows.
        const completionTime = (task.completedAt ?? task.updatedAt).getTime() - task.createdAt.getTime();
        return completionTime / (1000 * 60 * 60 * 24); // Convert to days
      });

      const averageCompletionTime = completionTimes.length > 0 
        ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length 
        : 0;

      // Parallel query optimization (Dec 2025 - 3 independent member queries → ~67% faster)
      // FAULT ISOLATION: Per-item .catch() prevents one member query from hiding team performance
      const [memberTasks, memberCompletedTasks, memberActiveTasks] = await Promise.all([
        // Get member total tasks
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            teamId,
            assigneeId: { not: null },
            createdAt: {
              gte: new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000)
            }
          },
          _count: {
            id: true
          }
        }).catch(err => { taskLogger.warn({ err }, 'Member tasks groupBy failed — defaulting to empty'); return []; }),
        // Get member completed tasks
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            teamId,
            assigneeId: { not: null },
            status: 'COMPLETED',
            createdAt: {
              gte: new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000)
            }
          },
          _count: {
            id: true
          }
        }).catch(err => { taskLogger.warn({ err }, 'Member completed groupBy failed — defaulting to empty'); return []; }),
        // Get active tasks per member
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            teamId,
            assigneeId: { not: null },
            status: { not: 'COMPLETED' }
          },
          _count: {
            id: true
          }
        }).catch(err => { taskLogger.warn({ err }, 'Member active groupBy failed — defaulting to empty'); return []; })
      ]);

      // Get user details
      const memberIds = [...new Set([
        ...memberTasks.map(m => m.assigneeId),
        ...memberCompletedTasks.map(m => m.assigneeId),
        ...memberActiveTasks.map(m => m.assigneeId)
      ])].filter((id): id is string => id !== null);

      const users = await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, name: true },
        take: 200,
      });

      const members = memberIds.map(memberId => {
        const user = users.find(u => u.id === memberId);
        const activeTasks = memberActiveTasks.find(m => m.assigneeId === memberId)?._count.id || 0;
        const completedTasksCount = memberCompletedTasks.find(m => m.assigneeId === memberId)?._count.id || 0;

        return {
          userId: memberId,
          userName: user?.name || 'Unknown',
          activeTasks,
          completedTasks: completedTasksCount
        };
      });

      return {
        teamId,
        teamName: team.name,
        totalTasks,
        completedTasks,
        completionRate: Math.round(completionRate * 100) / 100,
        averageCompletionTime: Math.round(averageCompletionTime * 100) / 100,
        members
      };
    } catch (error) {
      taskLogger.error({ err: error, teamId }, 'getTeamPerformance failed');
      throw error;
    }
  }

  /**
   * Get task distribution by various dimensions
   */
  static async getTaskDistribution(filters: {
    povId?: string;
    povIds?: string[];
    phaseId?: string;
    teamId?: string;
    timeframeDays?: number;
  }) {
    try {
      const where: any = {};

      if (filters.povId) where.povId = filters.povId;
      else if (filters.povIds) where.povId = { in: filters.povIds }; // SEC-C2: empty [] → {in:[]} → zero rows (fail-closed), not a dropped filter
      if (filters.phaseId) where.phaseId = filters.phaseId;
      if (filters.teamId) where.teamId = filters.teamId;
      
      if (filters.timeframeDays) {
        where.createdAt = {
          gte: new Date(Date.now() - filters.timeframeDays * 24 * 60 * 60 * 1000)
        };
      }

      // Parallel query optimization (Dec 2025 - 4 independent groupBy queries → ~75% faster)
      // FAULT ISOLATION: Per-item .catch() prevents one distribution query from hiding other breakdowns
      const [byStatus, byPriority, byType, byAssignee] = await Promise.all([
        // Get distribution by status
        prisma.task.groupBy({
          by: ['status'],
          where,
          _count: { id: true }
        }).catch(err => { taskLogger.warn({ err }, 'Status distribution failed — defaulting to empty'); return []; }),
        // Get distribution by priority
        prisma.task.groupBy({
          by: ['priority'],
          where,
          _count: { id: true }
        }).catch(err => { taskLogger.warn({ err }, 'Priority distribution failed — defaulting to empty'); return []; }),
        // Get distribution by type
        prisma.task.groupBy({
          by: ['type'],
          where,
          _count: { id: true }
        }).catch(err => { taskLogger.warn({ err }, 'Type distribution failed — defaulting to empty'); return []; }),
        // Get distribution by assignee
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            ...where,
            assigneeId: { not: null }
          },
          _count: { id: true },
          orderBy: {
            _count: { id: 'desc' }
          },
          take: 10
        }).catch(err => { taskLogger.warn({ err }, 'Assignee distribution failed — defaulting to empty'); return []; })
      ]);

      return {
        byStatus: byStatus.map(item => ({
          status: item.status,
          count: item._count.id
        })),
        byPriority: byPriority.map(item => ({
          priority: item.priority,
          count: item._count.id
        })),
        byType: byType.map(item => ({
          type: item.type,
          count: item._count.id
        })),
        byAssignee: byAssignee.map(item => ({
          assigneeId: item.assigneeId,
          count: item._count.id
        }))
      };
    } catch (error) {
      taskLogger.error({ err: error }, 'getTaskDistribution failed');
      throw error;
    }
  }
}
