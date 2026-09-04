import { NextRequest, NextResponse } from 'next/server';
import { createHandler } from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { subDays, addDays, differenceInDays } from 'date-fns';
import { z } from 'zod';
import { OptionalCUIDStrict } from '@/lib/validation/id-validation';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import type { WorkflowStep } from '@/lib/services/mcp/recommendation-action-mapper';
import type { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { calculateKPIsFromContext, getCalculatorMeta } from '@/lib/pov/services/kpi-calculators';
// Analytics pilot Phase 3 sec-ops HIGH-3 (2026-05-22): write-time sanitize
// for KPI alert titles + POV-progress titles that persist user-controlled
// pov.title + kpi.name into MCPRecommendation rows. BUG-HUB-001 + Phase 2.4
// GAP-5 sibling pattern — stored-XSS via persistence layer.
import { escapeHtml } from '@/lib/utils/sanitize';

const log = mcpLogger.child({ module: 'RecommendationGenerator' });

const RecommendationQuerySchema = z.object({
  taskId: OptionalCUIDStrict('taskId').optional(),
  povId: OptionalCUIDStrict('povId').optional(),
});

type ApiHandler<T = unknown> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

const RECOMMENDATION_TOOL_ID = 'paichart-recommendation-engine';

// --- Types ---

interface GeneratedRecommendation {
  generatorKey: string;
  type: 'OPTIMIZATION' | 'AUTOMATION' | 'QUALITY_IMPROVEMENT' | 'RISK_MITIGATION' | 'PERFORMANCE_ENHANCEMENT';
  title: string;
  description: string;
  confidence: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  actions: (WorkflowStep & { description: string })[];
  povId?: string;
  expectedBenefits: string[];
  estimatedTimeSavings: number;
  estimatedCostSavings: number;
}

// --- Helpers ---

function buildWorkflowStep(
  action: string,
  params: Record<string, unknown>,
  description: string
): WorkflowStep & { description: string } {
  return {
    service: 'paichart',
    tool: 'execute_task_action',
    arguments: { action, ...params },
    description,
  };
}

// --- GET Handler ---

/**
 * GET /api/mcp/recommendations
 * Generates data-driven, executable recommendations based on user's actual task/POV data.
 * Uses createHandler for auth + rate limiting (writes to DB via persist-on-generate).
 */
const recommendationHandler: ApiHandler = async (
  req: NextRequest,
  _context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  // Validate query params (CUID format enforcement)
  const { searchParams } = new URL(req.url);
  const queryParams = {
    taskId: searchParams.get('taskId') || undefined,
    povId: searchParams.get('povId') || undefined,
  };
  const parsed = RecommendationQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return { error: { message: 'Invalid query parameters: IDs must be CUID format', code: 'VALIDATION_ERROR' } };
  }
  const { taskId, povId } = parsed.data;

  // POV access validation (if povId provided)
  if (povId) {
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true, ownerId: true, metadata: true,
        team: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!pov) {
      return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
    }
    const hasAccess = validatePOVAccess(user, pov, { throwOnDeny: false, logContext: 'Recommendations GET' });
    if (!hasAccess && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
    }
  }

  log.info({ userId: user.userId, povId, taskId }, 'Generating recommendations');

  // Generate data-driven recommendations (also returns KPI scores if povId provided).
  // Admins get cross-POV recs over ALL POVs they can access (the dropdown shows all POVs for
  // an admin, so scoping recs to owned/assigned-only left "All Projects" empty). Non-admins
  // keep the owned/assigned scope — the sec-ops anti-cross-tenant-leak floor (route.ts ~290).
  // Admin-gated, so no new exposure: admins already have full POV access via validatePOVAccess.
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const { recommendations: allRecommendations, kpiScores: evaluatedKPIs } =
    await generateIntelligentRecommendations(user.userId, taskId, povId, isAdmin);

  // Persist to DB (try/catch — failure must not break the response)
  const persisted = await persistRecommendations(allRecommendations, user.userId);

  // Build response: use persisted recs if available, otherwise generated recs
  const recommendations = persisted.length > 0
    ? persisted.map(rec => {
        const ctx = (rec.context as Record<string, unknown>) || {};
        return {
          id: rec.id,
          type: rec.type,
          title: rec.title,
          description: rec.description,
          confidence: rec.confidence,
          impact: rec.impact,
          effort: rec.effort,
          status: rec.status,
          povId: rec.povId,
          actions: rec.actions,
          expectedBenefits: (ctx.expectedBenefits as string[]) || [],
          estimatedTimeSavings: (ctx.estimatedTimeSavings as number) || 0,
          estimatedCostSavings: (ctx.estimatedCostSavings as number) || 0,
          source: 'data-driven' as const,
          createdAt: rec.createdAt,
        };
      })
    : allRecommendations.map(rec => ({
        ...rec,
        id: `gen-${rec.generatorKey}-${Date.now()}`,
        status: 'PENDING' as const,
        source: 'data-driven' as const,
        createdAt: new Date(),
      }));

  // Hide dismissed (REJECTED) recs so a thumbs-down sticks; PENDING + IMPLEMENTED (DONE
  // badge) still render. Cap at 20.
  const capped = recommendations.filter(r => r.status !== 'REJECTED').slice(0, 20);

  return {
    data: {
      recommendations: capped,
      total: capped.length,
      generated: new Date().toISOString(),
      kpiScores: evaluatedKPIs || [],
    },
  };
};

export const GET = createHandler(recommendationHandler, {
  requireAuth: true,
  rateLimit: 'write', // Persist-on-generate writes to DB
});

// --- Main orchestration ---

export async function generateIntelligentRecommendations(
  userId: string,
  taskId?: string | null,
  povId?: string | null,
  isAdmin = false
): Promise<{ recommendations: GeneratedRecommendation[]; kpiScores: KPIScore[] | null }> {
  try {
    // Phase A: Gather all context data (9 parallel queries)
    const contextData = await gatherContextualData(userId, taskId, povId, isAdmin);

    // ARCH-ANALYTICS-2 (2026-05-22): explicit logging when the call is in
    // cross-POV (un-scoped) mode. Converts an implicit-and-untested invariant
    // into a traceable audit event. Sec-ops CRITICAL-1 fix (680fb903) already
    // enforces userId scope at the read query, so this can't leak cross-tenant;
    // log is purely for visibility into the scope-pattern of analytics calls.
    if (!povId && !taskId) {
      log.info({
        event: 'analytics-cross-pov-call',
        userId,
        povCount: contextData.userPOVs.length,
        message: 'Recommendations call without povId/taskId — returning cross-POV union over user-accessible POVs',
      });
    }

    // Phase B: Run generator sub-queries in parallel (2 queries)
    const [workloadCounts, recentAnalytics] = await Promise.all([
      contextData.unassignedTasks.length > 0
        ? prisma.task.groupBy({
            by: ['assigneeId'],
            where: {
              status: 'IN_PROGRESS',
              povId: { in: [...new Set(contextData.unassignedTasks.map(t => t.povId).filter(Boolean))] as string[] },
            },
            _count: true,
          })
        : Promise.resolve([]),

      contextData.userPOVs.length > 0
        ? prisma.mCPWorkflowExecution.findMany({
            where: {
              workflowType: 'analytics',
              povId: { in: contextData.userPOVs.map(p => p.id) },
              startTime: { gt: subDays(new Date(), 7) },
            },
            select: { povId: true },
          })
        : Promise.resolve([]),
    ]);

    // Phase B.5: Evaluate KPIs from contextData (1 query to load POV KPIs, pure logic for scores)
    const kpiScores = povId ? await evaluateKPIsForPOV(povId, contextData) : null;

    // Phase C: Run all generators (pure logic, no DB calls)
    const recommendations = [
      ...generateStaleTasks(contextData),
      ...generateUnassignedTasks(contextData, workloadCounts),
      ...generateApproachingDeadlines(contextData),
      ...generatePOVProgressReports(contextData, recentAnalytics),
      // BUG-ANALYTICS-005 fix (2026-05-22): pass povId so KPI titles get
      // disambiguated when multiple POVs each emit a same-named KPI alert.
      // povId is guaranteed non-null here (kpiScores is null-gated on povId
      // at the call site of evaluateKPIsForPOV above).
      ...(kpiScores && povId ? generateKPIAlerts(kpiScores, povId) : []),
    ];

    // Phase C.5: Fire-and-forget KPI score persistence [fire-and-forget-activity-logging-pattern]
    if (kpiScores && kpiScores.length > 0) {
      Promise.all(kpiScores.map(kpi =>
        prisma.pOVKPI.update({
          where: { id: kpi.id },
          data: {
            current: { value: kpi.current, format: 'percentage', calculatedAt: new Date().toISOString() },
          },
        })
      )).catch(err => log.error({ err }, 'Failed to persist KPI scores'));
    }

    // Phase D: Apply confidence scoring
    const scored = calculateConfidenceScores(recommendations, contextData);

    return { recommendations: scored, kpiScores };
  } catch (error) {
    log.error({ err: error }, 'Error generating intelligent recommendations');
    return { recommendations: [], kpiScores: null };
  }
}

// --- Data gathering ---

async function gatherContextualData(userId: string, taskId?: string | null, povId?: string | null, isAdmin = false) {
  const [
    userTasks,
    userPOVs,
    taskActivities,
    agentExecutions,
    specificTask,
    specificPOV,
    staleTasks,
    unassignedTasks,
    approachingDeadlineTasks,
  ] = await Promise.all([
    // User's task patterns
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        ...(povId && { povId }),
      },
      select: {
        id: true, title: true, status: true, priority: true,
        type: true, createdAt: true, updatedAt: true,
        dueDate: true, povId: true, // Added for KPI calculators (on-time-rate, grouping by POV)
        maxRetries: true, timeout: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),

    // User's POV patterns
    prisma.pOV.findMany({
      where: povId
        ? { id: povId }
        // Admins: all POVs (matches the "All Projects" dropdown). Non-admins: owned/assigned
        // only (cross-tenant-leak floor — sec-ops).
        : isAdmin
          ? {}
          : { OR: [{ ownerId: userId }, { tasks: { some: { assigneeId: userId } } }] },
      select: {
        id: true, title: true, status: true, createdAt: true, updatedAt: true,
        _count: { select: { tasks: true, phases: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Recent task activities for pattern analysis
    prisma.taskActivity.findMany({
      where: povId
        ? { OR: [{ userId, task: { povId } }, { task: { assigneeId: userId, povId } }] }
        : { OR: [{ userId }, { task: { assigneeId: userId } }] },
      select: { action: true, timestamp: true, taskId: true },
      orderBy: { timestamp: 'desc' },
      take: 100,
    }),

    // Agent execution patterns
    prisma.agentExecution.findMany({
      where: {
        task: { assigneeId: userId, ...(povId && { povId }) },
      },
      select: { status: true, startTime: true, endTime: true, taskId: true, config: true },
      orderBy: { startTime: 'desc' },
      take: 30,
    }),

    // Specific task data if provided
    taskId
      ? prisma.task.findUnique({
          where: { id: taskId },
          include: {
            pov: { select: { id: true, title: true, status: true } },
            activities: { select: { action: true, timestamp: true }, orderBy: { timestamp: 'desc' }, take: 10 },
            executions: { select: { status: true, startTime: true, endTime: true }, orderBy: { startTime: 'desc' }, take: 5 },
          },
        })
      : null,

    // Specific POV data if provided
    povId
      ? prisma.pOV.findUnique({
          where: { id: povId },
          include: {
            tasks: { select: { id: true, title: true, status: true, priority: true, assigneeId: true }, take: 20 },
            phases: { select: { id: true, name: true, startDate: true, endDate: true } },
          },
        })
      : null,

    // --- Phase 1.5: New data-driven queries ---

    // Stale tasks: no update in 7+ days, not completed (uses idx_task_assignee_status_updated)
    prisma.task.findMany({
      where: {
        pov: { OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }] },
        status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
        updatedAt: { lt: subDays(new Date(), 7) },
        ...(povId && { povId }),
      },
      select: { id: true, title: true, status: true, assigneeId: true, updatedAt: true, povId: true },
      take: 50,
    }),

    // Unassigned tasks: created 3+ days ago, no assignee
    prisma.task.findMany({
      where: {
        assigneeId: null,
        status: { in: ['OPEN', 'BLOCKED'] },
        createdAt: { lt: subDays(new Date(), 3) },
        pov: { OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }] },
        ...(povId && { povId }),
      },
      select: { id: true, title: true, status: true, createdAt: true, povId: true },
      take: 50,
    }),

    // Tasks approaching deadline: due within 3 days, not started/completed (uses idx_task_status_duedate)
    prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'BLOCKED'] },
        dueDate: { lte: addDays(new Date(), 3), gte: new Date() },
        pov: { OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }] },
        ...(povId && { povId }),
      },
      select: { id: true, title: true, status: true, dueDate: true, assigneeId: true, povId: true },
      take: 50,
    }),
  ]);

  return {
    userTasks, userPOVs, taskActivities, agentExecutions,
    specificTask, specificPOV,
    staleTasks, unassignedTasks, approachingDeadlineTasks,
    userId,
  };
}

// --- Generators (pure logic, no DB calls) ---

function generateStaleTasks(contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never): GeneratedRecommendation[] {
  const { staleTasks } = contextData;
  if (staleTasks.length === 0) return [];

  const actions = staleTasks.map(task => {
    const daysSinceUpdate = differenceInDays(new Date(), new Date(task.updatedAt));
    // R3-5 (2026-05-23): task.title is user-controlled; sibling of the
    // pov.title fix at L524 (BUG-HUB-001 / Phase 2.4 GAP-5). Persists into
    // MCPRecommendation.actions[].description at L690 prisma.create — without
    // write-time escape, payloads like '-alert(1)-' (JS-string breakout)
    // ride the rec rows until any client/UI renders them as HTML/JS.
    const safeTitle = escapeHtml(task.title);
    return buildWorkflowStep(
      'task.comment',
      { taskId: task.id, comment: `⚠️ This task hasn't been updated in ${daysSinceUpdate} days. Please review and update status.` },
      `Add stale reminder to "${safeTitle}"`
    );
  });

  return [{
    generatorKey: 'stale-tasks',
    type: 'AUTOMATION',
    title: `${staleTasks.length} Stale Task${staleTasks.length === 1 ? '' : 's'} Need${staleTasks.length === 1 ? 's' : ''} Attention`,
    description: `${staleTasks.length} task${staleTasks.length === 1 ? ' has' : 's have'} not been updated in over 7 days. Add reminder comments to prompt owners to review.`,
    confidence: 80,
    impact: 'MEDIUM',
    effort: 'LOW',
    actions,
    expectedBenefits: [
      'Surface forgotten tasks before they become blockers',
      'Improve task hygiene across the team',
      'Non-destructive: only adds reminder comments',
    ],
    estimatedTimeSavings: staleTasks.length * 5,
    estimatedCostSavings: Math.min(staleTasks.length * 2, 30),
  }];
}

function generateUnassignedTasks(
  contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never,
  workloadCounts: { assigneeId: string | null; _count: number }[]
): GeneratedRecommendation[] {
  const { unassignedTasks } = contextData;
  if (unassignedTasks.length === 0) return [];

  // Find least-loaded team member
  const sorted = [...workloadCounts]
    .filter(w => w.assigneeId)
    .sort((a, b) => a._count - b._count);
  const leastLoaded = sorted[0];

  const actions = unassignedTasks.map(task => {
    // R3-5 (2026-05-23): task.title write-time escape (sibling of L401 + L483).
    const safeTitle = escapeHtml(task.title);
    return buildWorkflowStep(
      'task.assign',
      {
        taskId: task.id,
        ...(leastLoaded && { assigneeId: leastLoaded.assigneeId }),
      },
      `Assign "${safeTitle}"${leastLoaded ? ` to least-loaded team member` : ''}`
    );
  });

  return [{
    generatorKey: 'unassigned-tasks',
    type: 'QUALITY_IMPROVEMENT',
    title: `${unassignedTasks.length} Task${unassignedTasks.length === 1 ? '' : 's'} Awaiting Assignment`,
    description: `${unassignedTasks.length} task${unassignedTasks.length === 1 ? ' has' : 's have'} been unassigned for 3+ days. Suggest assigning to available team members.`,
    confidence: 75,
    impact: 'MEDIUM',
    effort: 'LOW',
    actions,
    expectedBenefits: [
      'Reduce task wait time',
      'Balance workload across team',
      'Prevent tasks from falling through the cracks',
    ],
    estimatedTimeSavings: unassignedTasks.length * 10,
    estimatedCostSavings: Math.min(unassignedTasks.length * 3, 25),
  }];
}

function generateApproachingDeadlines(
  contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never
): GeneratedRecommendation[] {
  const { approachingDeadlineTasks } = contextData;
  if (approachingDeadlineTasks.length === 0) return [];

  const actions = approachingDeadlineTasks.map(task => {
    const daysLeft = task.dueDate ? differenceInDays(new Date(task.dueDate), new Date()) : 0;
    // R3-5 (2026-05-23): task.title write-time escape (sibling of L401 + L444).
    const safeTitle = escapeHtml(task.title);
    return buildWorkflowStep(
      'task.comment',
      {
        taskId: task.id,
        comment: `⏰ Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — current status: ${task.status}. Please prioritize.`,
      },
      `Deadline warning for "${safeTitle}" (${daysLeft}d remaining)`
    );
  });

  return [{
    generatorKey: 'approaching-deadlines',
    type: 'RISK_MITIGATION',
    title: `${approachingDeadlineTasks.length} Task${approachingDeadlineTasks.length === 1 ? '' : 's'} Approaching Deadline`,
    description: `${approachingDeadlineTasks.length} task${approachingDeadlineTasks.length === 1 ? ' is' : 's are'} due within 3 days but not yet started. Add deadline warning comments.`,
    confidence: 85,
    impact: 'HIGH',
    effort: 'LOW',
    actions,
    expectedBenefits: [
      'Prevent missed deadlines',
      'Surface at-risk tasks early',
      'Non-destructive: only adds warning comments',
    ],
    estimatedTimeSavings: approachingDeadlineTasks.length * 15,
    estimatedCostSavings: Math.min(approachingDeadlineTasks.length * 5, 40),
  }];
}

function generatePOVProgressReports(
  contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never,
  recentAnalytics: { povId: string | null }[]
): GeneratedRecommendation[] {
  const { userPOVs } = contextData;
  if (userPOVs.length === 0) return [];

  const povsWithoutRecentAnalytics = userPOVs.filter(
    p => !recentAnalytics.some(a => a.povId === p.id)
  );

  if (povsWithoutRecentAnalytics.length === 0) return [];

  return povsWithoutRecentAnalytics.map(pov => {
    // sec-ops HIGH-3 (2026-05-22): pov.title is user-controlled; the title +
    // description below land in MCPRecommendation rows via prisma.create at
    // ~L690. Sanitize at WRITE so historical pollution can't replay through
    // every recommendations.get read. Pattern matches BUG-HUB-001 + Phase 2.4
    // GAP-5. Sanitize ONCE here; downstream formatRecommendations also
    // wraps for defense-in-depth.
    const safeTitle = escapeHtml(pov.title);
    return {
    generatorKey: `pov-progress-${pov.id}`,
    type: 'PERFORMANCE_ENHANCEMENT' as const,
    // BUG-ANALYTICS-006 fix (2026-05-22): POV-ID suffix disambiguates when
    // 2+ POVs share the same title.
    title: `Generate Progress Report for "${safeTitle}" (...${pov.id.slice(-8)})`,
    description: `No analytics report has been generated for "${safeTitle}" in the past 7 days. Generate a fresh progress report.`,
    confidence: 90,
    impact: 'LOW',
    effort: 'LOW',
    actions: [
      buildWorkflowStep(
        'analytics.generate',
        // analyticsType is REQUIRED by the handler (it throws on a missing/unknown type) — the
        // action previously sent only { povId }, so every Execute on this rec failed before
        // generating anything. 'performance' is the progress-report analytics.
        { povId: pov.id, analyticsType: 'performance' },
        `Generate analytics report for "${safeTitle}"`
      ),
    ],
    povId: pov.id,
    expectedBenefits: [
      'Up-to-date project visibility',
      'Data-driven decision making',
      'Read-only: no modifications to project data',
    ],
    estimatedTimeSavings: 30,
    estimatedCostSavings: 5,
    };
  });
}

// --- KPI evaluation + alerts ---

interface KPIScore {
  id: string;
  name: string;
  formulaId: string;
  current: number;
  target: number;
  weight: number;
  direction: string;
}

async function evaluateKPIsForPOV(
  povId: string,
  contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never
): Promise<KPIScore[] | null> {
  try {
    const povKpis = await prisma.pOVKPI.findMany({
      where: { povId },
      include: { template: true },
      take: 20,
    });
    if (povKpis.length === 0) return null;

    const scores = calculateKPIsFromContext(contextData, povId);

    return povKpis
      .filter(kpi => kpi.template?.calculation)
      .map(kpi => {
        const formulaId = kpi.template!.calculation!;
        const meta = getCalculatorMeta(formulaId);
        const current = scores.get(formulaId) ?? 0;
        const target = (kpi.target as Record<string, unknown>)?.value as number ?? 0;
        const direction = meta?.direction ?? 'higher_is_better';
        const weight = kpi.weight ?? meta?.defaultWeight ?? 0;
        return { id: kpi.id, name: kpi.name, formulaId, current, target, weight, direction };
      });
  } catch (error) {
    log.error({ err: error, povId }, 'KPI evaluation failed — skipping');
    return null;
  }
}

function generateKPIAlerts(kpiScores: KPIScore[], povId: string): GeneratedRecommendation[] {
  const alerts: GeneratedRecommendation[] = [];
  // BUG-ANALYTICS-005 fix (2026-05-22): suffix appended below disambiguates
  // KPI titles when multiple POVs each emit a same-named KPI alert
  // ('KPI Task Completion Rate is CRITICAL' × 2 — different POVs).
  const povSuffix = ` (...${povId.slice(-8)})`;
  // sec-ops HIGH-3 (2026-05-22): kpi.name is user-controlled (set when POVKPI
  // is created); titles + descriptions persist into MCPRecommendation rows
  // via prisma.create at ~L690. Write-time sanitize prevents stored-XSS
  // round-trip via every recommendations.get read. Pattern matches
  // BUG-HUB-001 + Phase 2.4 GAP-5.

  for (const kpi of kpiScores) {
    const meta = getCalculatorMeta(kpi.formulaId);
    if (!meta) continue;

    // Determine status using threshold + direction
    const target = { value: kpi.target, threshold: meta.defaultTarget.threshold };
    const direction = meta.direction;
    const isWarning = direction === 'lower_is_better'
      ? kpi.current > kpi.target
      : kpi.current < kpi.target;
    const isCritical = direction === 'lower_is_better'
      ? (meta.defaultTarget.threshold ? kpi.current >= meta.defaultTarget.threshold.critical : false)
      : (meta.defaultTarget.threshold ? kpi.current <= meta.defaultTarget.threshold.critical : false);

    if (!isWarning && !isCritical) continue;
    const status = isCritical ? 'critical' : 'warning';

    // Skip stale-task-ratio — already covered by stale tasks generator [ARCH: dedup]
    if (kpi.formulaId === 'stale-task-ratio') continue;

    const safeKpiName = escapeHtml(kpi.name);
    alerts.push({
      generatorKey: `kpi-alert-${kpi.formulaId}`,
      type: 'RISK_MITIGATION',
      title: `KPI "${safeKpiName}" is ${status.toUpperCase()} (${kpi.current}% vs ${kpi.target}% target)${povSuffix}`,
      description: `The ${safeKpiName} KPI is below target. ${isCritical ? 'Immediate action needed.' : 'Review recommended.'}`,
      confidence: isCritical ? 90 : 80,
      impact: isCritical ? 'HIGH' : 'MEDIUM',
      effort: 'LOW',
      actions: [], // KPI alerts are informational — corrective actions come from other generators
      expectedBenefits: [
        `Improve ${safeKpiName} from ${kpi.current}% toward ${kpi.target}% target`,
        'Early warning prevents further degradation',
      ],
      estimatedTimeSavings: 30,
      estimatedCostSavings: 10,
    });
  }

  return alerts;
}

// --- Confidence scoring ---

function calculateConfidenceScores(
  recommendations: GeneratedRecommendation[],
  contextData: ReturnType<typeof gatherContextualData> extends Promise<infer T> ? T : never
): GeneratedRecommendation[] {
  return recommendations.map(rec => {
    let confidence = rec.confidence;

    // Boost confidence based on data availability
    if (contextData.userTasks.length > 10) confidence += 3;
    if (contextData.userPOVs.length > 3) confidence += 2;

    // Boost based on action count (more specific data = higher confidence)
    if (rec.actions.length > 5) confidence += 5;
    if (rec.actions.length > 10) confidence += 5;

    // Clamp to 60-95 range
    confidence = Math.max(60, Math.min(95, Math.round(confidence)));

    return { ...rec, confidence };
  });
}

// --- Persistence ---

async function persistRecommendations(
  recommendations: GeneratedRecommendation[],
  userId: string
): Promise<Array<{
  id: string; type: string; title: string; description: string;
  confidence: number; impact: string; effort: string; status: string;
  povId: string | null; actions: unknown; context: unknown; createdAt: Date;
}>> {
  if (recommendations.length === 0) return [];

  try {
    // Safety cap: max 50 PENDING recs per user [pagination-safety-cap-pattern]
    const pendingCount = await prisma.mCPRecommendation.count({
      where: { userId, status: 'PENDING' },
    });
    if (pendingCount >= 50) {
      log.warn({ userId, pendingCount }, 'PENDING recommendation cap reached — skipping persist');
      return [];
    }

    return await prisma.$transaction(async (tx) => {
      const persisted = [];
      for (const rec of recommendations) {
        // Dedup by generatorKey + toolId + userId (stable key, not title). Match the LATEST
        // row of ANY status within a 7-day window — NOT just PENDING. Matching PENDING-only
        // meant an executed (IMPLEMENTED) or dismissed (REJECTED) rec was ignored and a fresh
        // PENDING duplicate was created on every load, so the "done" badge and dismissals never
        // stuck. Reusing the existing row preserves its status across reloads.
        const existing = await tx.mCPRecommendation.findFirst({
          where: {
            userId,
            toolId: RECOMMENDATION_TOOL_ID,
            context: { path: ['generatorKey'], equals: rec.generatorKey },
            createdAt: { gt: subDays(new Date(), 7) },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          // Refresh regenerable fields on a still-PENDING row so generator changes (e.g. a
          // corrected action payload) propagate to already-persisted recs — otherwise a rec
          // created before a fix keeps executing its stale action. Terminal rows
          // (IMPLEMENTED/REJECTED) are returned as-is to preserve their state.
          if (existing.status === 'PENDING') {
            const refreshed = await tx.mCPRecommendation.update({
              where: { id: existing.id },
              data: {
                title: rec.title,
                description: rec.description,
                confidence: rec.confidence,
                impact: rec.impact,
                effort: rec.effort,
                actions: JSON.parse(JSON.stringify(rec.actions)),
                context: {
                  generatorKey: rec.generatorKey,
                  expectedBenefits: rec.expectedBenefits,
                  estimatedTimeSavings: rec.estimatedTimeSavings,
                  estimatedCostSavings: rec.estimatedCostSavings,
                },
              },
            });
            persisted.push(refreshed);
          } else {
            persisted.push(existing);
          }
          continue;
        }

        const created = await tx.mCPRecommendation.create({
          data: {
            toolId: RECOMMENDATION_TOOL_ID,
            userId,
            povId: rec.povId || null,
            type: rec.type,
            title: rec.title,
            description: rec.description,
            confidence: rec.confidence,
            impact: rec.impact,
            effort: rec.effort,
            actions: JSON.parse(JSON.stringify(rec.actions)),
            parameters: {},
            context: {
              generatorKey: rec.generatorKey,
              expectedBenefits: rec.expectedBenefits,
              estimatedTimeSavings: rec.estimatedTimeSavings,
              estimatedCostSavings: rec.estimatedCostSavings,
            },
            status: 'PENDING',
          },
        });
        persisted.push(created);
      }
      return persisted;
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to persist recommendations — returning empty');
    return [];
  }
}
