import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { logFieldChange, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * POST /api/mcp/automations/[id]/pause
 * Pause an active automation
 */
const pauseAutomationHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { id } = context.params;
    mcpLogger.info({ automationId: id, userId: user.userId }, 'Pausing automation');

    // BC28 IDOR FIX: Verify ownership before modifying
    // Try agent execution first — ownership via task.povId
    const agentExecution = await prisma.agentExecution.findUnique({
      where: { id },
      select: { id: true, task: { select: { povId: true, assigneeId: true } } }
    });

    if (agentExecution) {
      // Verify user owns the execution (assignee, admin, or has POV access).
      // IDOR fix 2026-05-26: fail-closed. The prior `assigneeId !== userId &&
      // povId` skipped the check entirely when povId was null, leaving
      // unassigned/unscoped executions open to any authenticated user.
      const task = agentExecution.task;
      const isAssignee = !!task?.assigneeId && task.assigneeId === user.userId;
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      let hasAccess = isAssignee || isAdmin;
      if (!hasAccess && task?.povId) {
        const povAccess = await prisma.pOV.findFirst({
          where: { id: task.povId, team: { members: { some: { userId: user.userId } } } },
          select: { id: true }
        });
        hasAccess = !!povAccess;
      }
      if (!hasAccess) {
        return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
      }
      await prisma.agentExecution.update({
        where: { id },
        data: { status: 'PAUSED', updatedAt: new Date() }
      });
    } else {
      // Try workflow execution — ownership via userId
      const workflowExecution = await prisma.mCPWorkflowExecution.findUnique({
        where: { id },
        select: { userId: true }
      });
      if (!workflowExecution) {
        return { error: { message: 'Automation not found', code: 'NOT_FOUND' } };
      }
      if (workflowExecution.userId !== user.userId && user.role !== 'ADMIN') {
        return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
      }
      await prisma.mCPWorkflowExecution.update({
        where: { id },
        data: { status: 'CANCELLED', updatedAt: new Date() }
      });
    }

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    const metadata: ActivityMetadata = { source: 'API' };
    logFieldChange('system', user.userId, {
      name: 'automationStatus',
      oldValue: 'RUNNING',
      newValue: 'PAUSED',
      action: TaskActivityAction.STATUS_CHANGED,
    }, metadata);

    mcpLogger.debug({ automationId: id }, 'Rich activity logged for automation pause');

    return {
      data: {
        success: true,
        automationId: id,
        status: 'paused',
        message: 'Automation paused successfully',
        pausedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to pause automation');
    return {
      error: {
        message: 'Failed to pause automation',
        code: 'PAUSE_FAILED',
      },
    };
  }
};

export const POST = createHandler(pauseAutomationHandler, { requireAuth: true });
