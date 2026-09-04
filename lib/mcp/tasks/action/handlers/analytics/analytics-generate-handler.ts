/**
 * Analytics Generate Handler
 *
 * Handles analytics generation action via MCP.
 * Supports analytics types: performance, insights.
 * Validates POV access before generating analytics.
 *
 * @class AnalyticsGenerateHandler
 * @description Generates analytics reports with POV access validation and multi-tenant protection.
 *   Supports multiple analytics types and flexible filtering.
 *
 *   Key Features:
 *   - Analytics types: performance, insights
 *   - POV access validation for multi-tenant security
 *   - Flexible filtering by POV, phase, date range
 *   - Format support (JSON, CSV, etc.)
 *   - Computed metrics and aggregations
 *
 * @param {Object} parameters - Analytics generation parameters
 * @param {string} [parameters.analyticsType] - Analytics type (performance/insights)
 * @param {string} [parameters.analysisType] - Analysis type alias
 * @param {Object} [parameters.filters] - Filtering criteria
 * @param {string} [parameters.filters.povId] - Filter by POV ID (validates access)
 * @param {string} [parameters.filters.phaseId] - Filter by phase ID
 * @param {string} [parameters.filters.startDate] - Filter start date (ISO format)
 * @param {string} [parameters.filters.endDate] - Filter end date (ISO format)
 * @param {string} [parameters.format] - Output format (json/csv/etc.)
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Analytics generation result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (analytics.generate)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Analytics result
 * @returns {string} returns.result.analyticsType - Type of analytics generated
 * @returns {Object} returns.result.data - Generated analytics data
 * @returns {Object} returns.result.metadata - Analytics metadata (filters, date range, etc.)
 * @returns {string} returns.result.message - Success message
 *
 * @throws {Error} If POV access validation fails (when filters.povId provided)
 * @throws {Error} If POV not found (when filters.povId provided)
 * @throws {Error} If invalid analytics type provided
 *
 * @example
 * // Generate performance analytics for POV
 * const result = await handleAnalyticsGenerate({
 *   analyticsType: 'performance',
 *   filters: { povId: 'cm123abc' }
 * }, user, 'action-456');
 *
 * @example
 * // Generate insights with date range filter
 * const result = await handleAnalyticsGenerate({
 *   analyticsType: 'insights',
 *   filters: {
 *     povId: 'cm123abc',
 *     startDate: '2025-01-01T00:00:00Z',
 *     endDate: '2025-12-31T23:59:59Z'
 *   },
 *   format: 'json'
 * }, user, 'action-789');
 *
 * @note For agent execution data, use agent.status or agent.results actions instead.
 *
 * @security
 *   - POV access validation via validatePOVAccess (when filters.povId provided)
 *   - Multi-tenant data isolation
 *   - Scoped analytics to user's accessible POVs
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @extracted 2025-12-18 from app/api/mcp/tasks/action/route.ts (lines 3255-3366)
 */

import { TokenPayload, UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'AnalyticsGenerateHandler' });

export async function handleAnalyticsGenerate(
  parameters: any,
  user: TokenPayload,
  actionId: string
) {
  const { analyticsType, analysisType, format, povId: topLevelPovId } = parameters;
  // Support povId at top level (from MCP tool schema) or nested in filters
  const filters = parameters.filters
    ? { ...parameters.filters }
    : {};
  if (topLevelPovId && !filters.povId) {
    filters.povId = topLevelPovId;
  }

  // SECURITY: Validate POV access before calculating analytics (multi-tenancy protection)
  if (filters?.povId) {
    const pov = await prisma.pOV.findUnique({
      where: { id: filters.povId },
      select: {
        id: true,
        ownerId: true,
        metadata: true,
        team: {
          select: {
            members: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!pov) {
      throw new Error('POV not found');
    }

    // DEMO_USER: Check additive access (owned + team + demo)
    if (user.role === 'DEMO_USER') {
      const isOwner = pov.ownerId === user.userId;
      const isTeamMember = pov.team?.members.some(m => m.userId === user.userId) ?? false;
      const isDemo = pov.metadata &&
        typeof pov.metadata === 'object' &&
        'isDemo' in pov.metadata &&
        pov.metadata.isDemo === true;

      if (!isOwner && !isTeamMember && !isDemo) {
        throw new Error('Access denied - you do not have access to this POV');
      }

      log.info({ userId: user.userId, povId: filters.povId, isOwner, isTeamMember, isDemo }, 'DEMO_USER validated access to POV');
    }

    // Regular user: Check ownership/team membership
    if (!['ADMIN', 'SUPER_ADMIN', 'DEMO_USER'].includes(user.role)) {
      const isOwner = pov.ownerId === user.userId;
      const isTeamMember = pov.team?.members.some(m => m.userId === user.userId) ?? false;

      if (!isOwner && !isTeamMember) {
        throw new Error('Access denied - you do not have access to this POV');
      }
    }
  }

  // 🔒 SECURITY: When no povId filter, scope analytics to user's accessible POVs
  // Admins see all; regular users only see owned + team member POVs
  let scopedFilters = filters || {};

  if (!scopedFilters.povId) {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isAdmin) {
      // Find all POV IDs the user can access (owner OR team member)
      const accessiblePOVs = await prisma.pOV.findMany({
        where: {
          OR: [
            { ownerId: user.userId },
            { team: { members: { some: { userId: user.userId } } } },
            ...(user.role === 'DEMO_USER' ? [{ metadata: { path: ['isDemo'], equals: true } }] : [])
          ]
        },
        select: { id: true }
      });

      const accessiblePOVIds = accessiblePOVs.map(p => p.id);

      if (accessiblePOVIds.length === 0) {
        return {
          actionId,
          action: 'analytics.generate',
          status: 'completed',
          result: {
            analyticsType,
            data: { totalTasks: 0, completedTasks: 0, completionRate: 0, averageCompletionTime: 0, onTimeRate: 0, overdueTasks: 0 },
            format: format || 'json',
            generatedAt: new Date().toISOString(),
            message: 'No accessible POVs found for analytics'
          }
        };
      }

      // Inject POV scoping into filters
      scopedFilters = { ...scopedFilters, povIds: accessiblePOVIds };
      log.info({ userId: user.userId, accessiblePOVCount: accessiblePOVIds.length }, 'scoped analytics to user-accessible POVs');
    }
  }

  // Handle both analyticsType and analysisType parameters (Claude Desktop compatibility)
  const finalAnalyticsType = analyticsType || analysisType;

  let result: any = {};

  const { TaskAnalyticsService } = await import('@/lib/services/taskAnalyticsService');

  // F-D: the only path reaching here without povId/povIds is an admin (non-admins are scoped above
  // or early-returned at zero accessible POVs). Pass the GLOBAL_ADMIN sentinel so the service's
  // fail-closed floor permits the intentional admin-global query.
  const analyticsOpts = (!scopedFilters.povId && !scopedFilters.povIds)
    ? { scope: 'GLOBAL_ADMIN' as const }
    : undefined;

  switch (finalAnalyticsType) {
    case 'performance':
      result = await TaskAnalyticsService.getTaskPerformance(scopedFilters, analyticsOpts);
      break;

    case 'insights':
      result = await TaskAnalyticsService.getTaskInsights(scopedFilters, analyticsOpts);
      break;

    default:
      // Provide more helpful error message
      // Note: For agent execution data, use agent.status or agent.results actions instead
      const supportedTypes = ['performance', 'insights'];
      throw new Error(
        `Unsupported analytics type: "${finalAnalyticsType}". Supported types: ${supportedTypes.join(', ')}.\n\n` +
        `For agent execution data, use:\n` +
        `• perform(action: 'agent.status', parameters: { taskId: '...' })\n` +
        `• perform(action: 'agent.results', parameters: { taskId: '...' })`
      );
  }

  // Record an 'analytics' workflow execution so downstream consumers can see a report was
  // generated for this POV — notably the recommendation engine's "7d no analytics" trigger
  // (app/api/mcp/recommendations/route.ts), so a "Generate Progress Report" rec resolves once
  // executed instead of regenerating forever. Fire-and-forget: the report is the deliverable,
  // a failed bookkeeping write must not fail the response.
  if (filters?.povId) {
    const now = new Date();
    prisma.mCPWorkflowExecution.create({
      data: {
        userId: user.userId,
        povId: filters.povId,
        executionMode: 'AD_HOC',
        workflowType: 'analytics',
        status: 'COMPLETED',
        startTime: now,
        endTime: now,
        duration: 0,
        input: { analyticsType: finalAnalyticsType, source: 'analytics.generate' },
        output: {},
        steps: [],
        metadata: { source: 'analytics.generate', actionId },
      },
    }).catch(err => log.warn({ err, povId: filters.povId }, 'Failed to record analytics workflow execution'));
  }

  // Build a readable summary so the result is actually visible (the formatter renders these
  // lines). Previously only "Analytics generated successfully" was shown and the computed
  // metrics were discarded. `format: 'raw'` additionally surfaces the full data block.
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const d = (result || {}) as Record<string, unknown>;
  let summary: string[] = [];
  if (finalAnalyticsType === 'performance') {
    summary = [
      `Tasks completed: ${num(d.completedTasks)}/${num(d.totalTasks)} (${num(d.completionRate)}%)`,
      `On-time rate: ${num(d.onTimeRate)}%`,
      `Avg completion time: ${num(d.averageCompletionTime)}d`,
      `Overdue tasks: ${num(d.overdueTasks)}`,
    ];
  } else if (finalAnalyticsType === 'insights') {
    const trend = num(d.productivityTrend);
    summary = [
      `Tasks at risk: ${num(d.tasksAtRisk)}`,
      `Blocked tasks: ${num(d.blockedTasks)}`,
      `Productivity trend: ${trend >= 0 ? '+' : ''}${trend}%`,
    ];
  }

  return {
    actionId,
    action: 'analytics.generate',
    status: 'completed',
    result: {
      analyticsType: finalAnalyticsType,
      data: result,
      summary,
      format: format || 'summary',
      generatedAt: new Date().toISOString(),
      message: `${finalAnalyticsType === 'insights' ? 'Insights' : 'Performance'} analytics for this POV`
    }
  };
}
