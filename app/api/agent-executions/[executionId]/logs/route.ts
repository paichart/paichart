import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getPOVFromExecution } from '@/lib/utils/pov-helpers';
import { agentOperationsLimiter } from '@/lib/middleware/rate-limit';
import { z } from 'zod';
import { logger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/agent-executions/[executionId]/logs - Download execution logs
const getExecutionLogsHandler: ApiHandler = async (
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
    // ✅ Rate limiting: 50 operations per minute
    const rateLimitResponse = agentOperationsLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { executionId } = context.params;

    if (!executionId) {
      return {
        error: {
          message: 'Execution ID is required',
          code: 'INVALID_REQUEST',
        },
      };
    }

    // P2 FIX: Validate executionId is CUID format (Issue #9)
    const idValidation = z.object({
      executionId: z.string()
        .cuid('Invalid execution ID format - must be a valid CUID')
    }).safeParse({ executionId });

    if (!idValidation.success) {
      return {
        error: {
          message: 'Invalid execution ID format',
          code: 'INVALID_REQUEST',
          details: idValidation.error.flatten()
        }
      };
    }

    // ✅ REFACTORED: Use getPOVFromExecution helper (P1 consistency - Nov 2025)
    const pov = await getPOVFromExecution(executionId);

    if (!pov) {
      // Use NOT_FOUND instead of FORBIDDEN to prevent execution enumeration
      return {
        error: {
          message: 'Execution not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // ✅ REFACTORED: Validate POV access (consistent with other agent endpoints)
    try {
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        logContext: 'Execution Logs Download'
      });
    } catch (error) {
      // Use NOT_FOUND instead of FORBIDDEN to prevent execution enumeration
      return {
        error: {
          message: 'Execution not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // ✅ Now fetch full execution for log generation
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    });

    // If execution not found in database, check if it's a mock execution ID
    if (!execution) {
      // For mock data, generate sample logs
      if (executionId.startsWith('exec-') || executionId.startsWith('cmc')) {
        const mockLogs = {
          executionId,
          timestamp: new Date().toISOString(),
          logs: [
            {
              timestamp: new Date(Date.now() - 300000).toISOString(),
              level: 'INFO',
              message: 'Agent execution started',
              context: {
                agentType: 'developer',
                taskId: 'task-1'
              }
            },
            {
              timestamp: new Date(Date.now() - 250000).toISOString(),
              level: 'DEBUG',
              message: 'Initializing agent configuration',
              context: {
                config: {
                  maxTokens: 4000,
                  temperature: 0.7
                }
              }
            },
            {
              timestamp: new Date(Date.now() - 200000).toISOString(),
              level: 'INFO',
              message: 'Processing task requirements',
              context: {
                requirements: ['code review', 'documentation', 'testing']
              }
            },
            {
              timestamp: new Date(Date.now() - 150000).toISOString(),
              level: 'DEBUG',
              message: 'Executing agent workflow',
              context: {
                step: 1,
                action: 'analyze_code'
              }
            },
            {
              timestamp: new Date(Date.now() - 100000).toISOString(),
              level: 'INFO',
              message: 'Generated code analysis report',
              context: {
                linesAnalyzed: 1247,
                issuesFound: 3,
                suggestions: 8
              }
            },
            {
              timestamp: new Date(Date.now() - 50000).toISOString(),
              level: 'DEBUG',
              message: 'Finalizing execution results',
              context: {
                outputSize: '2.4KB',
                artifacts: 2
              }
            },
            {
              timestamp: new Date(Date.now() - 10000).toISOString(),
              level: 'INFO',
              message: 'Agent execution completed successfully',
              context: {
                duration: '4m 50s',
                tokensUsed: 3247,
                status: 'COMPLETED'
              }
            }
          ],
          metadata: {
            agentType: 'developer',
            taskId: 'task-1',
            startTime: new Date(Date.now() - 300000).toISOString(),
            endTime: new Date(Date.now() - 10000).toISOString(),
            duration: 290000,
            status: 'COMPLETED'
          }
        };

        // Return logs as downloadable JSON file
        const logsJson = JSON.stringify(mockLogs, null, 2);
        
        return new Response(logsJson, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="agent-logs-${executionId}.json"`,
            'Content-Length': logsJson.length.toString()
          }
        });
      }

      return {
        error: {
          message: 'Execution not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Process real execution logs
    const logs = {
      executionId: execution.id,
      timestamp: new Date().toISOString(),
      logs: execution.logs || [],
      metadata: {
        agentTemplateId: execution.agentTemplateId,
        taskId: execution.taskId,
        startTime: execution.startTime?.toISOString(),
        endTime: execution.endTime?.toISOString(),
        duration: execution.startTime && execution.endTime 
          ? execution.endTime.getTime() - execution.startTime.getTime()
          : null,
        status: execution.status,
        task: execution.task
      }
    };

    // Return logs as downloadable JSON file
    const logsJson = JSON.stringify(logs, null, 2);
    
    return new Response(logsJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="agent-logs-${executionId}.json"`,
        'Content-Length': logsJson.length.toString()
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'GET /api/agent-executions/[executionId]/logs failed');
    return {
      error: {
        message: 'Failed to retrieve execution logs',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getExecutionLogsHandler, { requireAuth: true });
