import { TokenPayload } from '@/lib/types/auth';
import { UnifiedAnalyticsQuery } from '@/lib/validation/task-validation';
import { prisma } from '@/lib/prisma';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

/**
 * Overview Domain Handler
 * Moved from: /app/api/analytics/overview/route.ts
 *
 * Provides high-level metrics:
 * - POV count
 * - Task completion rate
 * - Agent success rate
 * - Hours saved (ROI)
 */
export async function handleOverviewDomain(
  params: UnifiedAnalyticsQuery,
  user: TokenPayload
) {
  const { povId, timeRange = '30d' } = params;

  // Calculate date range
  const days = parseInt(timeRange.replace('d', '').replace('y', '365'), 10) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Scope to POVs the user can access (admin sees all)
  const { filter: accessFilter, isAdmin } = buildPOVAccessFilterWithRole(user);
  const povWhere = {
    ...(!isAdmin ? accessFilter : {}),
    ...(povId && { id: povId })
  };
  const hasPovScope = Object.keys(povWhere).length > 0;

  // Fetch metrics in parallel
  const taskScope = hasPovScope ? { pov: povWhere } : {};
  const [povCount, totalTasks, completedTasks, agentExecutions] = await Promise.all([
    prisma.pOV.count({ where: hasPovScope ? povWhere : undefined }),

    // Completion is a STATE — count ALL the POV's tasks (UN-WINDOWED). Windowing by createdAt
    // showed 0% for projects whose tasks predate the window (and 0% for any finished project under
    // a date window). The createdAt window now applies only to the trend comparison below.
    prisma.task.count({ where: taskScope }),
    prisma.task.count({ where: { ...taskScope, status: 'COMPLETED' } }),

    // Agent success + hours-saved stay period-scoped (activity/flow). BC24: take cap.
    prisma.agentExecution.findMany({
      where: {
        ...(hasPovScope && { task: { pov: povWhere } }),
        startTime: { gte: startDate },
      },
      take: 10000,
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    }),
  ]);

  // Calculate metrics — completion rate over ALL the POV's tasks (current state)
  const taskCompletionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const totalExecutions = agentExecutions.length;
  // ExecutionStatus enum is SUCCESS/FAILED — there is NO 'COMPLETED' (was always 0 → AI Success 0%).
  const successfulExecutions = agentExecutions.filter(e => e.status === 'SUCCESS').length;
  const agentSuccessRate = totalExecutions > 0
    ? Math.round((successfulExecutions / totalExecutions) * 100)
    : 0;

  // Calculate hours saved (execution time × automation factor)
  const totalExecutionTime = agentExecutions
    .filter(e => e.startTime && e.endTime)
    .reduce((sum, e) => {
      const duration = e.endTime!.getTime() - e.startTime!.getTime();
      return sum + duration;
    }, 0);

  const hoursSaved = Math.round((totalExecutionTime / 1000 / 60 / 60) * 10) / 10;

  // Calculate trends (compare to previous period)
  const previousStartDate = new Date(startDate);
  previousStartDate.setDate(previousStartDate.getDate() - days);

  // Trend = current period vs previous period (a flow) — keyed on createdAt of completed tasks.
  // Kept windowed even though the headline rate above is not.
  const [currentCompleted, previousTasks, previousExecutions] = await Promise.all([
    prisma.task.count({
      where: {
        ...(hasPovScope && { pov: povWhere }),
        createdAt: { gte: startDate },
        status: 'COMPLETED',
      },
    }),
    prisma.task.count({
      where: {
        ...(hasPovScope && { pov: povWhere }),
        createdAt: { gte: previousStartDate, lt: startDate },
        status: 'COMPLETED',
      },
    }),
    prisma.agentExecution.count({
      where: {
        ...(hasPovScope && { task: { pov: povWhere } }),
        startTime: { gte: previousStartDate, lt: startDate },
        status: 'SUCCESS', // ExecutionStatus is SUCCESS/FAILED, not COMPLETED
      },
    }),
  ]);

  const povTrend = 0; // POV count doesn't have a trend
  const taskTrend = previousTasks > 0
    ? Math.round(((currentCompleted - previousTasks) / previousTasks) * 100)
    : currentCompleted > 0 ? 100 : 0;
  const agentTrend = previousExecutions > 0
    ? Math.round(((successfulExecutions - previousExecutions) / previousExecutions) * 100)
    : successfulExecutions > 0 ? 100 : 0;
  const roiTrend = taskTrend; // ROI trend follows task trend

  // Per-POV portfolio breakdown — only for the all-projects view (a single-POV overview doesn't
  // need it). Scoped to accessible POVs (admin = all). Two groupBys avoid an N+1.
  let projects: Array<{
    id: string; title: string; status: string; theatre: string | null;
    owner: string | null; totalTasks: number; completedTasks: number; completionRate: number;
  }> = [];
  if (!povId) {
    const povList = await prisma.pOV.findMany({
      where: hasPovScope ? povWhere : undefined,
      select: {
        id: true, title: true, status: true, salesTheatre: true,
        owner: { select: { name: true, email: true } },
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
    const ids = povList.map(p => p.id);
    const [totals, completed] = await Promise.all([
      prisma.task.groupBy({ by: ['povId'], where: { povId: { in: ids } }, _count: { id: true } }),
      prisma.task.groupBy({ by: ['povId'], where: { povId: { in: ids }, status: 'COMPLETED' }, _count: { id: true } }),
    ]);
    const totalMap = new Map(totals.map(t => [t.povId, t._count.id]));
    const doneMap = new Map(completed.map(t => [t.povId, t._count.id]));
    projects = povList.map(p => {
      const total = totalMap.get(p.id) || 0;
      const done = doneMap.get(p.id) || 0;
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        theatre: p.salesTheatre || null,
        owner: p.owner?.name || p.owner?.email || null,
        totalTasks: total,
        completedTasks: done,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });
  }

  return {
    data: {
      povCount,
      taskCompletionRate,
      agentSuccessRate,
      hoursSaved,
      povTrend,
      taskTrend,
      agentTrend,
      roiTrend,
      projects,
    },
  };
}
