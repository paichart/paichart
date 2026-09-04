import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/agent/executions - List agent executions with filtering
const getExecutionsHandler: ApiHandler = async (
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
    const { searchParams } = new URL(req.url);
    
    // Parse query parameters
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status');
    const povId = searchParams.get('povId');
    const phaseId = searchParams.get('phaseId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200); // BC41 FIX: cap limit
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    // BC49 FIX: Validate sortBy/sortOrder against allowlists (prevent dynamic key injection)
    const VALID_SORT_FIELDS = ['createdAt', 'updatedAt', 'status', 'duration'];
    const rawSortBy = searchParams.get('sortBy') || 'createdAt';
    const sortBy = VALID_SORT_FIELDS.includes(rawSortBy) ? rawSortBy : 'createdAt';
    const rawSortOrder = searchParams.get('sortOrder') || 'desc';
    const sortOrder = ['asc', 'desc'].includes(rawSortOrder) ? rawSortOrder : 'desc';

    // Build where clause
    const where: any = {};
    
    if (taskId) where.taskId = taskId;
    if (status) where.status = status;
    
    // Date filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Task-level filtering with POV access validation
    if (povId || phaseId) {
      where.task = {};
      if (povId) {
        // Validate user has access to this POV before filtering
        const pov = await prisma.pOV.findUnique({
          where: { id: povId },
          include: {
            team: {
              include: {
                members: {
                  select: { id: true, userId: true, role: true }
                }
              }
            }
          }
        });
        if (!pov) {
          return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
        }
        const hasAccess = validatePOVAccess(user, pov, {
          throwOnDeny: false,
          logContext: 'GET /api/tasks/agent/executions'
        });
        if (!hasAccess) {
          return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
        }
        where.task.povId = povId;
      }
      if (phaseId) where.task.phaseId = phaseId;
    }

    // Cross-tenant fix (2026-05-26 round 2): the POV-access check above only ran
    // when povId/phaseId was supplied — a bare ?taskId=<foreign> or no filter at
    // all returned other tenants' executions. Scope every non-admin query to the
    // caller's accessible POVs (foreign taskId / unfiltered → empty result).
    const execIsAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    if (!execIsAdmin) {
      where.task = { ...(where.task || {}), pov: buildPOVAccessFilter(user) };
    }

    // Get executions with related data
    const executions = await prisma.agentExecution.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            type: true,
            assignee: {
              select: { id: true, name: true, email: true }
            },
            phase: {
              select: { id: true, name: true, type: true }
            },
            pov: {
              select: { id: true, title: true, status: true }
            }
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: offset,
      take: limit
    });

    // Get total count for pagination
    const totalCount = await prisma.agentExecution.count({ where });

    // Calculate execution statistics
    const stats = await prisma.agentExecution.groupBy({
      by: ['status'],
      where,
      _count: {
        id: true
      }
    });

    const statusStats = stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count.id;
      return acc;
    }, {} as Record<string, number>);

    // Calculate average execution time for completed executions
    const completedExecutions = await prisma.agentExecution.findMany({
      where: {
        ...where,
        status: 'SUCCESS',
        startTime: { not: null },
        endTime: { not: null }
      },
      select: {
        startTime: true,
        endTime: true
      }
    });

    const executionTimes = completedExecutions
      .filter(exec => exec.startTime && exec.endTime)
      .map(exec => exec.endTime!.getTime() - exec.startTime!.getTime());

    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      : 0;

    // Format executions for response
    const formattedExecutions = executions.map(execution => ({
      id: execution.id,
      taskId: execution.taskId,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
      config: execution.config,
      context: execution.context,
      logs: execution.logs,
      
      // Task information
      task: execution.task,
      
      // Calculated fields
      duration: execution.startTime && execution.endTime 
        ? execution.endTime.getTime() - execution.startTime.getTime()
        : null,
      
      // Execution summary
      summary: {
        isCompleted: execution.status === 'SUCCESS',
        isFailed: execution.status === 'FAILED',
        isRunning: execution.status === 'RUNNING',
        hasLogs: Array.isArray(execution.logs) && execution.logs.length > 0
      }
    }));

    return {
      data: {
        executions: formattedExecutions,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        },
        statistics: {
          total: totalCount,
          byStatus: statusStats,
          averageExecutionTime: Math.round(averageExecutionTime / 1000), // Convert to seconds
          successRate: statusStats.SUCCESS && totalCount > 0 
            ? Math.round((statusStats.SUCCESS / totalCount) * 100 * 100) / 100
            : 0
        },
        filters: {
          taskId,
          status,
          povId,
          phaseId,
          startDate,
          endDate,
          sortBy,
          sortOrder
        }
      }
    };
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/agent/executions' }, 'Failed to retrieve agent executions');
    return {
      error: {
        message: 'Failed to retrieve agent executions',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getExecutionsHandler, { requireAuth: true });
