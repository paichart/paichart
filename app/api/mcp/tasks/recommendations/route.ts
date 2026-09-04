import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { CreateRecommendationSchema } from '@/lib/validation/mcp-automations-validation';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { MCPRecommendationType, MCPImpact } from '@prisma/client';
import { parseEnumParam } from '@/lib/utils/parse-enum-param';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/tasks/recommendations - AI-powered task recommendations for MCP
const getMCPRecommendationsHandler: ApiHandler = async (
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
    const povId = searchParams.get('povId');
    const phaseId = searchParams.get('phaseId');
    // 2026-05-27 (pentest M-2 sibling): validate enum params before where.type/.impact (bad value → 500)
    const type = parseEnumParam(searchParams.get('type'), MCPRecommendationType); // OPTIMIZATION, AUTOMATION, etc.
    const impact = parseEnumParam(searchParams.get('impact'), MCPImpact); // LOW, MEDIUM, HIGH, CRITICAL
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 200); // BC41 FIX: cap limit
    const includeImplemented = searchParams.get('includeImplemented') === 'true';

    // 🔒 SECURITY: Validate POV access when povId is provided
    if (povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
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
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND',
          },
        };
      }

      const hasAccess = validatePOVAccess(user, pov, {
        logContext: 'MCP Recommendations GET'
      });

      if (!hasAccess) {
        return {
          error: {
            message: 'POV not found',
            code: 'NOT_FOUND',
          },
        };
      }
    }

    // 🔒 SECURITY: Validate POV access when taskId is provided (via task's parent POV)
    if (taskId && !povId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          pov: {
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
          }
        }
      });

      if (!task?.pov) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      const hasAccess = validatePOVAccess(user, task.pov, {
        logContext: 'MCP Recommendations GET (via task)'
      });

      if (!hasAccess) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }
    }

    // 🚨 SECURITY (2026-05-22, sec-ops Analytics pilot Phase 3 CRITICAL-1):
    // Cross-tenant IDOR fix — when neither povId nor taskId was provided, this
    // route returned EVERY user's recommendations across the platform.
    // MCPRecommendation has a userId column; the query just wasn't using it.
    //
    // Now scoped to current user always (admin/super-admin bypass for ops).
    // The earlier per-povId / per-taskId validatePOVAccess gate at lines
    // 43-126 still runs first when those params ARE provided — this is the
    // belt-and-braces fallback for the un-scoped call shape.
    const where: any = {};

    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      where.userId = user.userId;
    }

    if (taskId) where.taskId = taskId;
    if (povId) where.povId = povId;
    if (type) where.type = type;
    if (impact) where.impact = impact;

    if (!includeImplemented) {
      where.status = {
        not: 'IMPLEMENTED'
      };
    }

    // Get existing recommendations from database
    const existingRecommendations = await prisma.mCPRecommendation.findMany({
      where,
      include: {
        tool: {
          select: { id: true, name: true, description: true }
        },
        task: {
          select: { 
            id: true, 
            title: true, 
            status: true, 
            priority: true,
            type: true,
            assigneeId: true
          }
        },
        pov: {
          select: { 
            id: true, 
            title: true, 
            status: true 
          }
        }
      },
      orderBy: [
        { confidence: 'desc' },
        { impact: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });

    // Generate new AI-powered recommendations
    const aiRecommendations = await generateAIRecommendations({
      taskId: taskId || undefined,
      povId: povId || undefined,
      phaseId: phaseId || undefined,
      userId: user.userId,
      limit: Math.max(5, limit - existingRecommendations.length)
    });

    // Combine and deduplicate recommendations
    const allRecommendations = [
      ...existingRecommendations.map(rec => ({
        id: rec.id,
        type: rec.type,
        title: rec.title,
        description: rec.description,
        confidence: rec.confidence,
        impact: rec.impact,
        effort: rec.effort,
        actions: rec.actions,
        parameters: rec.parameters,
        context: rec.context,
        status: rec.status,
        tool: rec.tool,
        task: rec.task,
        pov: rec.pov,
        source: 'database',
        createdAt: rec.createdAt,
        implementedAt: rec.implementedAt
      })),
      ...aiRecommendations.map(rec => ({
        ...rec,
        source: 'ai_generated'
      }))
    ];

    // Apply type/impact filters to combined results (DB results already filtered, AI results need filtering)
    const filteredRecommendations = allRecommendations.filter(rec => {
      if (type && rec.type !== type) return false;
      if (impact && rec.impact !== impact) return false;
      return true;
    });

    // Sort by priority score (confidence * impact weight)
    const prioritizedRecommendations = filteredRecommendations
      .map(rec => ({
        ...rec,
        priorityScore: calculatePriorityScore(rec.confidence, rec.impact, rec.effort)
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);

    // Generate summary statistics
    const summary = {
      total: prioritizedRecommendations.length,
      byType: groupBy(prioritizedRecommendations, 'type'),
      byImpact: groupBy(prioritizedRecommendations, 'impact'),
      byStatus: groupBy(prioritizedRecommendations, 'status'),
      averageConfidence: prioritizedRecommendations.reduce((sum, rec) => sum + rec.confidence, 0) / prioritizedRecommendations.length || 0,
      highImpactCount: prioritizedRecommendations.filter(rec => rec.impact === 'HIGH' || rec.impact === 'CRITICAL').length
    };

    return {
      data: {
        recommendations: prioritizedRecommendations,
        summary,
        metadata: {
          requestId: `mcp-rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          filters: { taskId, povId, phaseId, type, impact },
          user: {
            id: user.userId,
            email: user.email
          }
        }
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to retrieve MCP task recommendations');
    return {
      error: {
        message: 'Failed to retrieve MCP recommendations',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// POST /api/mcp/tasks/recommendations - Create or update recommendations
const createMCPRecommendationHandler: ApiHandler = async (
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
    const rawBody = await req.json();

    // BC30 FIX: Validate with Zod schema (was manual validation + unvalidated JSON fields)
    const parseResult = CreateRecommendationSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return {
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.errors,
        },
      };
    }

    const {
      type,
      title,
      description,
      confidence,
      impact,
      effort,
      actions,
      parameters,
      context: recContext,
      taskId,
      povId,
      toolId
    } = parseResult.data;

    // 2026-05-14 P1 (sec-ops F-03): mirror the GET handler's POV-access
    // pattern (lines 43-126) on POST. Without this, an authenticated
    // caller could create recommendations against any povId/taskId they
    // could enumerate (cross-tenant IDOR). The GET endpoint already does
    // this check; POST needed the same.
    if (povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
        select: {
          id: true,
          ownerId: true,
          metadata: true,
          team: { select: { members: { select: { userId: true } } } }
        }
      });
      if (!pov) {
        return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
      }
      const hasAccess = validatePOVAccess(user, pov, { logContext: 'MCP Recommendations POST' });
      if (!hasAccess) {
        return { error: { message: 'POV not found', code: 'NOT_FOUND' } };
      }
    }
    if (taskId && !povId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          pov: {
            select: {
              id: true,
              ownerId: true,
              metadata: true,
              team: { select: { members: { select: { userId: true } } } }
            }
          }
        }
      });
      if (!task?.pov) {
        return { error: { message: 'Task not found', code: 'NOT_FOUND' } };
      }
      const hasAccess = validatePOVAccess(user, task.pov, { logContext: 'MCP Recommendations POST (via task)' });
      if (!hasAccess) {
        return { error: { message: 'Task not found', code: 'NOT_FOUND' } };
      }
    }

    // Create recommendation
    const recommendation = await prisma.mCPRecommendation.create({
      data: {
        type: type as any,
        title,
        description,
        confidence,
        impact,
        effort,
        actions: actions as any,
        parameters: parameters as any,
        context: recContext as any,
        status: 'PENDING',
        taskId,
        povId,
        toolId: toolId || 'mcp-ai-recommender',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      include: {
        tool: {
          select: { id: true, name: true, description: true }
        },
        task: {
          select: { 
            id: true, 
            title: true, 
            status: true, 
            priority: true 
          }
        },
        pov: {
          select: { 
            id: true, 
            title: true, 
            status: true 
          }
        }
      }
    });

    return {
      data: {
        recommendation,
        message: 'Recommendation created successfully'
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to create MCP recommendation');
    return {
      error: {
        message: 'Failed to create MCP recommendation',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// Helper function to generate AI-powered recommendations
async function generateAIRecommendations(params: {
  taskId?: string;
  povId?: string;
  phaseId?: string;
  userId: string;
  limit: number;
}) {
  const recommendations = [];
  
  try {
    // Get context data for AI analysis
    let contextData: any = {};
    
    if (params.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: params.taskId },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          phase: { select: { id: true, name: true, type: true } },
          pov: { select: { id: true, title: true, status: true } },
          activities: {
            orderBy: { timestamp: 'desc' },
            take: 10,
            select: { action: true, timestamp: true }
          }
        }
      });
      
      if (task) {
        contextData.task = task;
        
        // Analyze task patterns and generate recommendations
        const taskRecommendations = await analyzeTaskForRecommendations(task);
        recommendations.push(...taskRecommendations);
      }
    }
    
    if (params.povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: params.povId },
        select: {
          id: true,
          title: true,
          status: true,
          ownerId: true,
          metadata: true,
          team: {
            select: {
              members: {
                select: { userId: true }
              }
            }
          },
          phases: {
            include: {
              tasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  dueDate: true,
                  assigneeId: true
                }
              }
            }
          }
        }
      });

      if (pov) {
        // SECURITY: Validate POV access for DEMO_USER before generating recommendations
        if (params.userId) {
          // Get user role to check access
          const user = await prisma.user.findUnique({
            where: { id: params.userId },
            select: { role: true }
          });

          if (user?.role === 'DEMO_USER') {
            const isOwner = pov.ownerId === params.userId;
            const isTeamMember = pov.team?.members.some(m => m.userId === params.userId) ?? false;
            const isDemo = (pov.metadata as any)?.isDemo === true;

            if (!isOwner && !isTeamMember && !isDemo) {
              // Skip this POV - no access
              return recommendations;
            }
          }
        }

        contextData.pov = pov;

        // Analyze POV patterns and generate recommendations
        const povRecommendations = await analyzePovForRecommendations(pov);
        recommendations.push(...povRecommendations);
      }
    }
    
    // Generate general workflow optimization recommendations
    const workflowRecommendations = await generateWorkflowRecommendations(contextData);
    recommendations.push(...workflowRecommendations);
    
  } catch (error) {
    mcpLogger.error({ err: error }, 'Error generating AI recommendations');
  }
  
  return recommendations.slice(0, params.limit);
}

// Analyze task for specific recommendations
async function analyzeTaskForRecommendations(task: any) {
  const recommendations = [];
  
  // Agent automation recommendation
  if (!task.agentRole && !task.prompt) {
    recommendations.push({
      id: `ai-rec-${Date.now()}-agent-${task.id}`,
      type: 'AUTOMATION',
      title: 'Configure AI Agent for Task Automation',
      description: `Task "${task.title}" could benefit from AI agent automation to improve efficiency and consistency.`,
      confidence: 0.8,
      impact: 'HIGH',
      effort: 'MEDIUM',
      actions: {
        primary: 'agent.configure',
        secondary: ['task.analyze', 'workflow.optimize']
      },
      parameters: {
        taskId: task.id,
        suggestedRole: inferAgentRole(task.type, task.title),
        automationPotential: 'high'
      },
      context: {
        taskType: task.type,
        currentStatus: task.status,
        hasAssignee: !!task.assigneeId
      }
    });
  }
  
  // Overdue task recommendation
  if (task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED') {
    recommendations.push({
      id: `ai-rec-${Date.now()}-overdue-${task.id}`,
      type: 'RISK_MITIGATION',
      title: 'Address Overdue Task',
      description: `Task "${task.title}" is overdue and requires immediate attention to prevent project delays.`,
      confidence: 0.95,
      impact: 'CRITICAL',
      effort: 'LOW',
      actions: {
        primary: 'task.prioritize',
        secondary: ['task.reassign', 'deadline.extend', 'escalate']
      },
      parameters: {
        taskId: task.id,
        daysOverdue: Math.ceil((new Date().getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
        urgency: 'high'
      },
      context: {
        originalDueDate: task.dueDate,
        currentStatus: task.status
      }
    });
  }
  
  // Task optimization based on activity patterns
  if (task.activities && task.activities.length > 5) {
    const recentUpdates = task.activities.filter((activity: any) => 
      new Date(activity.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    
    if (recentUpdates.length > 10) {
      recommendations.push({
        id: `ai-rec-${Date.now()}-optimize-${task.id}`,
        type: 'OPTIMIZATION',
        title: 'Optimize High-Activity Task',
        description: `Task "${task.title}" has high activity levels. Consider breaking it down or streamlining the workflow.`,
        confidence: 0.7,
        impact: 'MEDIUM',
        effort: 'MEDIUM',
        actions: {
          primary: 'task.breakdown',
          secondary: ['workflow.streamline', 'process.optimize']
        },
        parameters: {
          taskId: task.id,
          activityCount: recentUpdates.length,
          optimizationType: 'breakdown'
        },
        context: {
          recentActivityLevel: 'high',
          weeklyUpdates: recentUpdates.length
        }
      });
    }
  }
  
  return recommendations;
}

// Analyze POV for recommendations
async function analyzePovForRecommendations(pov: any) {
  const recommendations = [];
  
  // Calculate POV completion metrics
  const totalTasks = pov.phases.reduce((sum: number, phase: any) => sum + phase.tasks.length, 0);
  const completedTasks = pov.phases.reduce((sum: number, phase: any) => 
    sum + phase.tasks.filter((t: any) => t.status === 'COMPLETED').length, 0
  );
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  
  // Low completion rate recommendation
  if (completionRate < 0.3 && totalTasks > 5) {
    recommendations.push({
      id: `ai-rec-${Date.now()}-completion-${pov.id}`,
      type: 'PERFORMANCE_ENHANCEMENT',
      title: 'Improve POV Completion Rate',
      description: `POV "${pov.title}" has a low completion rate (${Math.round(completionRate * 100)}%). Consider workflow optimization.`,
      confidence: 0.85,
      impact: 'HIGH',
      effort: 'MEDIUM',
      actions: {
        primary: 'workflow.optimize',
        secondary: ['task.prioritize', 'resource.allocate', 'bottleneck.identify']
      },
      parameters: {
        povId: pov.id,
        completionRate,
        totalTasks,
        completedTasks
      },
      context: {
        currentStatus: pov.status,
        phaseCount: pov.phases.length
      }
    });
  }
  
  // Phase balancing recommendation
  const phaseTaskCounts = pov.phases.map((phase: any) => phase.tasks.length);
  const maxTasks = Math.max(...phaseTaskCounts);
  const minTasks = Math.min(...phaseTaskCounts);
  
  if (maxTasks > minTasks * 3 && pov.phases.length > 2) {
    recommendations.push({
      id: `ai-rec-${Date.now()}-balance-${pov.id}`,
      type: 'WORKFLOW_IMPROVEMENT',
      title: 'Balance Phase Workloads',
      description: `POV "${pov.title}" has unbalanced phase workloads. Consider redistributing tasks for better flow.`,
      confidence: 0.7,
      impact: 'MEDIUM',
      effort: 'MEDIUM',
      actions: {
        primary: 'phase.rebalance',
        secondary: ['task.redistribute', 'workflow.optimize']
      },
      parameters: {
        povId: pov.id,
        maxTasksPerPhase: maxTasks,
        minTasksPerPhase: minTasks,
        imbalanceRatio: maxTasks / minTasks
      },
      context: {
        phaseDistribution: phaseTaskCounts
      }
    });
  }
  
  return recommendations;
}

// Generate general workflow recommendations
async function generateWorkflowRecommendations(contextData: any) {
  const recommendations = [];
  
  // Resource optimization recommendation
  recommendations.push({
    id: `ai-rec-${Date.now()}-resource-opt`,
    type: 'RESOURCE_ALLOCATION',
    title: 'Optimize Resource Allocation',
    description: 'Analyze current resource allocation patterns and suggest optimizations for better efficiency.',
    confidence: 0.6,
    impact: 'MEDIUM',
    effort: 'LOW',
    actions: {
      primary: 'resource.analyze',
      secondary: ['allocation.optimize', 'capacity.plan']
    },
    parameters: {
      analysisType: 'resource_optimization',
      scope: 'workflow'
    },
    context: contextData
  });
  
  return recommendations;
}

// Helper functions
function calculatePriorityScore(confidence: number, impact: string, effort: string): number {
  const impactWeights = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const effortWeights = { LOW: 3, MEDIUM: 2, HIGH: 1 }; // Lower effort = higher score
  
  const impactScore = impactWeights[impact as keyof typeof impactWeights] || 2;
  const effortScore = effortWeights[effort as keyof typeof effortWeights] || 2;
  
  return confidence * impactScore * effortScore;
}

function groupBy(array: any[], key: string) {
  return array.reduce((groups, item) => {
    const value = item[key];
    groups[value] = (groups[value] || 0) + 1;
    return groups;
  }, {});
}

function inferAgentRole(taskType: string, taskTitle: string): string {
  const title = taskTitle.toLowerCase();
  const type = taskType.toLowerCase();

  if (title.includes('code') || title.includes('develop') || type.includes('development')) {
    return 'software_developer';
  } else if (title.includes('design') || title.includes('ui') || title.includes('ux')) {
    return 'designer';
  } else if (title.includes('test') || title.includes('qa')) {
    return 'qa_engineer';
  } else if (title.includes('analyze') || title.includes('research')) {
    return 'analyst';
  } else if (title.includes('write') || title.includes('document')) {
    return 'technical_writer';
  } else {
    return 'general_assistant';
  }
}

export const GET = createHandler(getMCPRecommendationsHandler, { requireAuth: true });
export const POST = createHandler(createMCPRecommendationHandler, { requireAuth: true });
