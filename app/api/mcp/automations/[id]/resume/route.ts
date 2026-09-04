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
 * POST /api/mcp/automations/[id]/resume
 * Resume a paused automation
 */
const resumeAutomationHandler: ApiHandler = async (
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
    mcpLogger.info({ automationId: id, userId: user.userId }, 'Resuming automation');

    // BC28 IDOR FIX: Verify ownership before modifying
    const agentExecution = await prisma.agentExecution.findUnique({
      where: { id },
      select: { id: true, task: { select: { povId: true, assigneeId: true } } }
    });

    if (agentExecution) {
      // IDOR fix 2026-05-26: fail-closed (see pause). Prior check skipped when povId was null.
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
        data: { status: 'RUNNING', updatedAt: new Date() }
      });
    } else {
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
        data: { status: 'RUNNING', updatedAt: new Date() }
      });
    }

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    const metadata: ActivityMetadata = { source: 'API' };
    logFieldChange('system', user.userId, {
      name: 'automationStatus',
      oldValue: 'PAUSED',
      newValue: 'RUNNING',
      action: TaskActivityAction.STATUS_CHANGED,
    }, metadata);

    mcpLogger.debug({ automationId: id }, 'Rich activity logged for automation resume');

    return {
      data: {
        success: true,
        automationId: id,
        status: 'running',
        message: 'Automation resumed successfully',
        resumedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to resume automation');
    return {
      error: {
        message: 'Failed to resume automation',
        code: 'RESUME_FAILED',
      },
    };
  }
};

export const POST = createHandler(resumeAutomationHandler, { requireAuth: true });
