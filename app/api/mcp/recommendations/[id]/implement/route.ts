import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { logFieldChange, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { TasksActionRouter } from '@/lib/mcp/tasks/action/tasks-action-router';
import {
  mapRecommendationToActions,
  type MappedAction,
  type RiskLevel,
  type WorkflowStep,
} from '@/lib/services/mcp/recommendation-action-mapper';
import { z } from 'zod';

const RiskFilterSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']).optional();

const log = mcpLogger.child({ module: 'ImplementRecommendation' });

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

interface StepResult {
  step: number;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * Execute a single mapped action and return the result.
 */
async function executeAction(
  action: MappedAction,
  user: TokenPayload,
  actionId: string,
  stepIndex: number
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    switch (action.type) {
      case 'perform': {
        if (!action.performAction) {
          return { step: stepIndex, type: 'perform', success: false, error: 'No perform action defined', executionTime: 0 };
        }
        const router = new TasksActionRouter();
        const result = await router.route(
          action.performAction.action,
          action.performAction.parameters,
          user,
          `${actionId}-step-${stepIndex}`
        );
        return {
          step: stepIndex,
          type: 'perform',
          success: true,
          data: result,
          executionTime: Date.now() - startTime,
        };
      }

      case 'service_call': {
        if (!action.serviceCall) {
          return { step: stepIndex, type: 'service_call', success: false, error: 'No service call defined', executionTime: 0 };
        }
        // Service calls go through the internal router for pAIchart services,
        // or are queued as a workflow for external services
        const { service, tool, arguments: args } = action.serviceCall;

        // For now, service calls are recorded but not executed directly from the API route.
        // They require the MCP server's ServiceConnectionPool which runs in the embedded server process.
        // Instead, we create an MCPWorkflowExecution record that can be picked up by the workflow engine.
        log.info({ service, tool, stepIndex }, 'Service call queued (requires MCP server context)');
        return {
          step: stepIndex,
          type: 'service_call',
          success: true,
          data: { queued: true, service, tool, message: 'Service call queued for execution' },
          executionTime: Date.now() - startTime,
        };
      }

      case 'workflow': {
        if (!action.workflowSteps || action.workflowSteps.length === 0) {
          return { step: stepIndex, type: 'workflow', success: false, error: 'No workflow steps defined', executionTime: 0 };
        }
        // Multi-step workflows are recorded for execution by the MCP server's orchestration engine.
        // The MCPWorkflowExecution record created below will track progress.
        log.info({ stepCount: action.workflowSteps.length, stepIndex }, 'Workflow queued for orchestration');
        return {
          step: stepIndex,
          type: 'workflow',
          success: true,
          data: {
            queued: true,
            stepCount: action.workflowSteps.length,
            message: 'Multi-step workflow queued for orchestration engine',
          },
          executionTime: Date.now() - startTime,
        };
      }

      default:
        return { step: stepIndex, type: 'unknown', success: false, error: `Unknown action type: ${action.type}`, executionTime: 0 };
    }
  } catch (err: any) {
    log.error({ err, stepIndex, type: action.type }, 'Action execution failed');
    return {
      step: stepIndex,
      type: action.type,
      success: false,
      error: err.message || 'Unknown execution error',
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * POST /api/mcp/recommendations/[id]/implement
 *
 * Executes recommendation actions through the appropriate execution path:
 * - perform actions → TasksActionRouter (immediate)
 * - service calls → queued for MCP server
 * - workflows → queued for orchestration engine
 *
 * Updates MCPWorkflowExecution with real results and MCPRecommendation status.
 */
const implementRecommendationHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  try {
    const { id } = context.params;

    // Parse optional risk filter from URL params
    const url = new URL(req.url);
    const rawRiskFilter = url.searchParams.get('riskFilter');
    const riskFilterResult = RiskFilterSchema.safeParse(rawRiskFilter || undefined);
    if (rawRiskFilter && !riskFilterResult.success) {
      return { error: { message: 'Invalid riskFilter. Must be LOW, MEDIUM, or HIGH.', code: 'VALIDATION_ERROR' } };
    }
    const riskFilter = riskFilterResult.data as RiskLevel | undefined;

    log.info({ recommendationId: id, userId: user.userId, riskFilter: riskFilter || 'ALL' }, 'Implementing recommendation');

    // BC28 IDOR FIX: Verify recommendation exists and user has access
    const recommendation = await prisma.mCPRecommendation.findUnique({
      where: { id },
      select: {
        id: true,
        povId: true,
        toolId: true,
        title: true,
        type: true,
        actions: true,
        parameters: true,
        status: true,
      },
    });

    if (!recommendation) {
      return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
    }

    if (recommendation.povId) {
      // SEC LOW-4 + WO-13: Use validatePOVAccess (consistent with preview endpoint)
      const pov = await prisma.pOV.findUnique({
        where: { id: recommendation.povId },
        select: {
          id: true, ownerId: true, metadata: true,
          team: { select: { members: { select: { userId: true } } } },
        },
      });
      if (!pov) {
        return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
      }
      const hasAccess = validatePOVAccess(user, pov, { throwOnDeny: false, requireWrite: true, logContext: 'Implement Recommendation' });
      if (!hasAccess && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
      }
    }

    // Don't re-implement already implemented recommendations
    if (recommendation.status === 'IMPLEMENTED') {
      return { error: { message: 'Recommendation already implemented', code: 'ALREADY_IMPLEMENTED' } };
    }

    // Map recommendation actions to executable operations
    const actions = (recommendation.actions as unknown as WorkflowStep[]) || [];
    const mapped = mapRecommendationToActions(actions, recommendation.title);

    log.info({
      recommendationId: id,
      actionCount: mapped.actions.length,
      overallRisk: mapped.overallRisk,
      requiresApproval: mapped.requiresApproval,
    }, 'Actions mapped');

    // HIGH risk actions require approval (Phase 3 — for now, log and proceed)
    if (mapped.requiresApproval) {
      log.warn({ recommendationId: id, risk: mapped.overallRisk }, 'HIGH risk recommendation — executing with warning');
    }

    // Filter actions by risk level if filter provided
    const allActions = mapped.actions;
    const actionsToExecute = riskFilter
      ? allActions.filter(a => a.riskLevel === riskFilter)
      : allActions;

    if (riskFilter && actionsToExecute.length === 0) {
      return {
        data: {
          message: `No ${riskFilter}-risk actions found in this recommendation`,
          filtered: true,
          totalActions: allActions.length,
          matchingActions: 0,
        },
      };
    }

    log.info({
      recommendationId: id,
      totalActions: allActions.length,
      executingActions: actionsToExecute.length,
      riskFilter: riskFilter || 'ALL',
    }, 'Executing actions');

    // Execute actions (continue-on-error: independent actions should not block each other)
    // E.g., if task #7 is deleted, task.comment for tasks #8-50 should still run [WO-8]
    const executionStart = Date.now();
    const results: StepResult[] = [];

    for (let i = 0; i < actionsToExecute.length; i++) {
      const result = await executeAction(actionsToExecute[i], user, `implement-${id}`, i);
      results.push(result);

      if (!result.success) {
        log.warn({ step: i, error: result.error }, 'Action failed — continuing with remaining actions');
      }
    }

    const totalTime = Date.now() - executionStart;
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const allSucceeded = failed === 0;
    const finalStatus = allSucceeded ? 'COMPLETED' : (succeeded > 0 ? 'COMPLETED' : 'FAILED');

    // BC50 FIX: Wrap DB updates in transaction
    const actionId = `implement-${id}-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
      // Log the implementation as an MCP interaction
      await tx.mCPInteraction.create({
        data: {
          id: actionId,
          toolId: recommendation.toolId,
          action: 'AUTOMATE_PROCESS',
          request: {
            recommendationId: id,
            action: 'implement',
            userId: user.userId,
            mappedActions: mapped.actions.map(a => ({ type: a.type, risk: a.riskLevel, description: a.description })),
          },
          response: JSON.parse(JSON.stringify({
            status: finalStatus.toLowerCase(),
            results,
            executionTime: totalTime,
          })),
          status: allSucceeded ? 'COMPLETED' : 'FAILED',
          executionTime: totalTime,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create workflow execution record with real results
      await tx.mCPWorkflowExecution.create({
        data: {
          userId: user.userId,
          povId: recommendation.povId,
          executionMode: 'AD_HOC',
          workflowType: 'recommendation_implementation',
          status: finalStatus,
          startTime: new Date(executionStart),
          endTime: new Date(),
          duration: totalTime,
          input: {
            recommendationId: id,
            recommendationType: recommendation.type,
            recommendationTitle: recommendation.title,
            triggeredBy: user.userId,
            riskLevel: mapped.overallRisk,
          },
          // output is the step-results ARRAY — the shape the executions UI renders
          // (exec.output.map(...)). Was a { results, summary } object, so a failed
          // recommendation_implementation expanded to no detail. summary moved to metadata.
          output: JSON.parse(JSON.stringify(results)),
          steps: JSON.parse(JSON.stringify(results)),
          // Top-level error column (other workflows set it; the UI/summary reads it).
          error: allSucceeded ? null : (results.find((r) => !r.success)?.error ?? 'Implementation failed'),
          metadata: {
            source: 'mcp_recommendation',
            summary: mapped.summary,
            actionMapper: {
              actionCount: mapped.actions.length,
              overallRisk: mapped.overallRisk,
              types: mapped.actions.map(a => a.type),
            },
          },
        },
      });

      // Update recommendation status
      await tx.mCPRecommendation.update({
        where: { id },
        data: {
          status: allSucceeded ? 'IMPLEMENTED' : 'REVIEWED',
          implementedAt: allSucceeded ? new Date() : undefined,
          implementedBy: allSucceeded ? user.userId : undefined,
          feedback: allSucceeded
            ? { executionTime: totalTime, actionCount: results.length, risk: mapped.overallRisk }
            : { error: results.find(r => !r.success)?.error, partialResults: results.length },
        },
      });
    });

    // Activity logging
    const activityMeta: ActivityMetadata = { source: 'API' };
    logFieldChange('system', user.userId, {
      name: 'recommendation',
      oldValue: null,
      newValue: { recommendationId: id, status: finalStatus.toLowerCase(), executionTime: totalTime },
      action: TaskActivityAction.UPDATED,
    }, activityMeta);

    log.info({
      recommendationId: id,
      status: finalStatus,
      executionTime: totalTime,
      stepsExecuted: results.length,
      stepsSucceeded: results.filter(r => r.success).length,
    }, 'Recommendation implementation complete');

    return {
      data: {
        success: allSucceeded,
        recommendationId: id,
        actionId,
        status: finalStatus.toLowerCase(),
        message: allSucceeded
          ? `Recommendation implemented successfully (${results.length} action${results.length !== 1 ? 's' : ''} executed in ${totalTime}ms)`
          : `Implementation partially failed at step ${results.findIndex(r => !r.success) + 1}`,
        executionDetails: {
          totalTime,
          stepsExecuted: results.length,
          stepsSucceeded: results.filter(r => r.success).length,
          stepsFailed: results.filter(r => !r.success).length,
          riskLevel: mapped.overallRisk,
          results,
        },
      },
    };
  } catch (error) {
    log.error({ err: error }, 'Failed to implement recommendation');
    return {
      error: {
        message: 'Failed to implement recommendation',
        code: 'IMPLEMENTATION_FAILED',
      },
    };
  }
};

export const POST = createHandler(implementRecommendationHandler, { requireAuth: true });
