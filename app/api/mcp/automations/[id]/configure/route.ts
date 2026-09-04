import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logFieldChange, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { AutomationConfigUpdateSchema } from '@/lib/validation/mcp-automations-validation';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * GET /api/mcp/automations/[id]/configure
 * Get automation configuration details
 */
const getAutomationConfigHandler: ApiHandler = async (
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
    mcpLogger.info({ automationId: id }, 'Getting automation config');

    // Try to get agent execution first
    let automation = null;
    let type = 'agent';

    automation = await prisma.agentExecution.findUnique({
      where: { id },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            maxRetries: true,
            timeout: true,
            povId: true,
            assigneeId: true
          }
        },
        agentTemplate: {
          select: {
            id: true,
            name: true,
            category: true,
            capabilities: true,
            constraints: true,
            maxRetries: true,
            timeout: true
          }
        }
      }
    });

    if (!automation) {
      // Try workflow execution
      automation = await prisma.mCPWorkflowExecution.findUnique({
        where: { id },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
              description: true,
              steps: true,
              triggers: true,
              schedule: true
            }
          }
        }
      });
      type = 'workflow';
    }

    if (!automation) {
      return {
        error: {
          message: 'Automation not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // BC28 IDOR FIX: Verify ownership
    if (type === 'agent') {
      // IDOR fix 2026-05-26: fail-closed (see pause/resume) — prior check
      // skipped entirely when povId was null.
      const task = (automation as any).task;
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
    } else {
      if ((automation as any).userId !== user.userId && user.role !== 'ADMIN') {
        return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
      }
    }

    // Build configuration response based on type
    let config = {};
    
    if (type === 'agent') {
      const agentAutomation = automation as any; // Type assertion for agent execution
      config = {
        type: 'agent_execution',
        id: agentAutomation.id,
        name: `${agentAutomation.agentTemplate?.name || 'Agent'}: ${agentAutomation.task?.title || 'Task'}`,
        status: agentAutomation.status,
        
        // Execution Configuration
        execution: {
          maxRetries: agentAutomation.task?.maxRetries ?? agentAutomation.agentTemplate?.maxRetries ?? 3,
          timeout: agentAutomation.task?.timeout ?? agentAutomation.agentTemplate?.timeout ?? 300,
          priority: agentAutomation.task?.priority || 'MEDIUM'
        },
        
        // Agent Configuration
        agent: {
          templateId: agentAutomation.agentTemplate?.id,
          templateName: agentAutomation.agentTemplate?.name,
          category: agentAutomation.agentTemplate?.category,
          capabilities: agentAutomation.agentTemplate?.capabilities || {},
          constraints: agentAutomation.agentTemplate?.constraints || {}
        },
        
        // Task Configuration
        task: {
          id: agentAutomation.task?.id,
          title: agentAutomation.task?.title,
          description: agentAutomation.task?.description,
          priority: agentAutomation.task?.priority
        },
        
        // Performance Settings
        performance: {
          memoryLimit: '512MB',
          cpuLimit: '1 core',
          diskLimit: '1GB'
        },
        
        // Notification Settings
        notifications: {
          onSuccess: true,
          onFailure: true,
          onTimeout: true,
          recipients: [user.email]
        }
      };
    } else {
      const workflowAutomation = automation as any; // Type assertion for workflow execution
      config = {
        type: 'workflow_execution',
        id: workflowAutomation.id,
        name: `Workflow: ${workflowAutomation.workflowId}`,
        status: workflowAutomation.status,
        
        // Workflow Configuration
        workflow: {
          steps: workflowAutomation.workflow?.steps || [],
          triggers: workflowAutomation.workflow?.triggers || {},
          schedule: workflowAutomation.workflow?.schedule || {}
        },
        
        // Execution Configuration
        execution: {
          maxRetries: 3,
          timeout: 1800, // 30 minutes
          priority: 'MEDIUM'
        }
      };
    }

    return {
      data: config
    };

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to get automation config');
    return {
      error: {
        message: 'Failed to get automation configuration',
        code: 'CONFIG_FETCH_FAILED',
      },
    };
  }
};

/**
 * POST /api/mcp/automations/[id]/configure
 * Update automation configuration
 */
const updateAutomationConfigHandler: ApiHandler = async (
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
    const rawBody = await req.json();

    // BC30 FIX: Validate request body with Zod schema (was completely unvalidated)
    const parseResult = AutomationConfigUpdateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return {
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: parseResult.error.errors,
        },
      };
    }
    const updates = parseResult.data;

    mcpLogger.info({ automationId: id, updateFields: Object.keys(updates) }, 'Updating automation config');

    // BC28 IDOR FIX: Verify ownership before modifying
    const agentExecution = await prisma.agentExecution.findUnique({
      where: { id },
      select: { id: true, taskId: true, task: { select: { povId: true, assigneeId: true } } }
    });

    if (agentExecution) {
      // IDOR fix 2026-05-26: fail-closed (see pause/resume) — prior check skipped when povId was null.
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

      // BC2 P0 FIX (2026-04-25): shallow-merge config inside tx instead of
      // whole-replace. The validator marks fields optional; partial PUT used
      // to clobber unsupplied keys. Sister fix to phase.ts:updateStage and
      // agent-templates/[templateId]/route.ts (commit 705415ce). Marked
      // lower-risk in the original sweep because AgentExecution.config is
      // reset between executions, so the bug class manifests less, but the
      // pattern is identical and worth fixing for consistency.
      // See: bug-class-registry.md BC2 Phase 4 + cline_docs/reviews/harness-clobber-detection-2026-04-25/sweep-results.md
      await prisma.$transaction(async (tx) => {
        const existing = await tx.agentExecution.findUnique({
          where: { id },
          select: { config: true },
        });
        const existingConfig = (existing?.config as Record<string, unknown> | null) || {};

        await tx.agentExecution.update({
          where: { id },
          data: {
            config: JSON.parse(JSON.stringify({
              ...existingConfig,
              ...updates,
              updatedBy: user.userId,
              updatedAt: new Date().toISOString(),
            })),
            updatedAt: new Date(),
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

      if (updates.execution && agentExecution.taskId) {
        await prisma.task.update({
          where: { id: agentExecution.taskId },
          data: {
            maxRetries: updates.execution.maxRetries,
            timeout: updates.execution.timeout,
            priority: updates.execution.priority,
            updatedAt: new Date()
          }
        });
      }
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
        data: {
          input: {
            ...updates,
            updatedBy: user.userId,
            updatedAt: new Date().toISOString()
          },
          updatedAt: new Date()
        }
      });
    }

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    // Note: Uses 'system' taskId for automation-level activities
    const metadata: ActivityMetadata = { source: 'API' };
    logFieldChange('system', user.userId, {
      name: 'automationConfig',
      oldValue: null,
      newValue: { automationId: id, configured: true },
      action: TaskActivityAction.UPDATED,
    }, metadata);

    mcpLogger.debug({ automationId: id }, 'Rich activity logged for automation configuration');

    return {
      data: {
        success: true,
        automationId: id,
        updates,
        message: 'Automation configuration updated successfully',
        updatedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to update automation config');
    return {
      error: {
        message: 'Failed to update automation configuration',
        code: 'CONFIG_UPDATE_FAILED',
      },
    };
  }
};

export const GET = createHandler(getAutomationConfigHandler, { requireAuth: true });
export const POST = createHandler(updateAutomationConfigHandler, { requireAuth: true });
