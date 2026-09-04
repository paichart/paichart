import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/mcp/tasks/context - Context-rich task data for MCP tools
const getMCPTaskContextHandler: ApiHandler = async (
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
    // 🔧 FIX: Handle both povId and pov_id (Claude Desktop compatibility)
    const povId = searchParams.get('povId') || searchParams.get('pov_id');
    const phaseId = searchParams.get('phaseId');
    // Handle Claude Desktop boolean string conversion
    const includeHistoryParam = searchParams.get('includeHistory');
    const includeAnalyticsParam = searchParams.get('includeAnalytics');
    const includeRecommendationsParam = searchParams.get('includeRecommendations');
    
    const includeHistory = includeHistoryParam === 'true';
    const includeAnalytics = includeAnalyticsParam === 'true';
    const includeRecommendations = includeRecommendationsParam === 'true';
    const contextDepth = searchParams.get('contextDepth') || 'standard'; // minimal, standard, full

    // Build context based on request
    let mcpContext: any = {
      requestId: `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      contextDepth,
      user: {
        id: user.userId,
        email: user.email,
        role: user.role
      }
    };

    // Single task context
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, role: true }
          },
          team: {
            select: { 
              id: true, 
              name: true,
              members: {
                select: {
                  user: {
                    select: { id: true, name: true, email: true, role: true }
                  }
                }
              }
            }
          },
          phase: {
            select: { 
              id: true, 
              name: true, 
              type: true, 
              order: true,
              description: true
            }
          },
          stage: {
            select: {
              id: true,
              name: true,
              order: true,
              description: true
            }
          },
          pov: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              objective: true,
              customerName: true,
              ownerId: true,
              metadata: true,
              team: {
                select: { id: true, members: { select: { userId: true } } }
              }
            }
          },
          dependencies: {
            include: {
              dependsOn: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  assigneeId: true
                }
              }
            }
          },
          dependents: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  assigneeId: true
                }
              }
            }
          }
        }
      });

      if (!task) {
        return {
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        };
      }

      // SECURITY: cross-tenant IDOR fix (Wave A C1, Phase 3 sec-ops, 2026-05-23).
      // Previously: any authenticated user could read ANY task via taskId.
      // Now: must be owner / team member / admin / DEMO via isDemo flag.
      if (!task.pov) {
        // Tasks without a POV are orphaned/system tasks — refuse for non-admins.
        const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
        if (!isAdmin) {
          return {
            error: { message: 'Access denied', code: 'FORBIDDEN' },
          };
        }
      } else {
        validatePOVAccess(user, task.pov, {
          throwOnDeny: true,
          logContext: '/api/mcp/tasks/context taskId path'
        });
      }

      // ============================================================================
      // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 3 independent queries → ~67% faster)
      // Agent context, activities, and comments queries run concurrently
      // Note: Queries are UNCHANGED, just run concurrently instead of sequentially
      // ============================================================================

      const [agentContext, activities, comments] = await Promise.all([
        // Build enhanced agent context
        buildEnhancedAgentContext(task),
        // Add recent activities (always include for collaboration context)
        prisma.taskActivity.findMany({
          where: { taskId },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { timestamp: 'desc' },
          take: includeHistory ? (contextDepth === 'full' ? 100 : contextDepth === 'standard' ? 20 : 5) : 10
        }),
        // Add comments (always include for collaboration context)
        prisma.comment.findMany({
          where: { taskId },
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, status: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        })
      ]);

      mcpContext.task = {
        core: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          dueDate: task.dueDate,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          // Include metadata so MCP agents can read orchestration state they
          // wrote earlier in the same pipeline lifecycle (e.g., the Pipeline
          // Harness reads metadata.pipelineStageId for mode detection — see
          // scripts/seed-protocol-prompts.ts pipeline-orchestrator-protocol).
          // Without this field surfaced through the MCP response, the agent
          // has no way to read its own state and falls into guess loops.
          metadata: task.metadata,
          executionStatus: task.executionStatus,
        },
        context: {
          assignee: task.assignee,
          team: task.team,
          phase: task.phase,
          stage: task.stage,
          pov: task.pov
        },
        relationships: {
          dependencies: task.dependencies.map(dep => dep.dependsOn),
          dependents: task.dependents.map(dep => dep.task),
          blockedBy: task.dependencies.filter(dep => dep.dependsOn.status !== 'COMPLETED').map(dep => dep.dependsOn),
          blocking: task.dependents.filter(dep => dep.task.status !== 'COMPLETED').map(dep => dep.task)
        },
        agent: agentContext
      };

      // Process activities results
      if (activities.length > 0) {
        mcpContext.task.activities = activities.map(activity => ({
          id: activity.id,
          action: activity.action,
          timestamp: activity.timestamp,
          user: activity.user
        }));
      }

      // Process comments results
      if (comments.length > 0) {
        mcpContext.task.comments = comments.map(comment => ({
          id: comment.id,
          text: comment.text,
          createdAt: comment.createdAt,
          user: comment.user
        }));
      }

      // Add analytics if requested.
      // 🔒 SECURITY (SEC-C2, 2026-06-23): scope to THIS task's POV — the call previously passed
      // no povId, computing platform-wide (cross-tenant) aggregates on a single-task response.
      // The user already passed the per-task IDOR check (validatePOVAccess on task.pov above).
      if (includeAnalytics && task.povId) {
        const { TaskAnalyticsService } = await import('@/lib/services/taskAnalyticsService');
        const performance = await TaskAnalyticsService.getTaskPerformance({
          povId: task.povId,
          timeframeDays: 30
        });

        mcpContext.task.analytics = performance;
      }
    }

    // POV context
    else if (povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: povId },
        include: {
          phases: {
            include: {
              tasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  type: true,
                  assigneeId: true,
                  dueDate: true
                }
              }
            },
            orderBy: { order: 'asc' }
          },
          team: {
            include: {
              members: {
                include: {
                  user: {
                    select: { id: true, name: true, email: true, role: true }
                  }
                }
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

      // SECURITY: cross-tenant IDOR fix (Wave A C1, Phase 3 sec-ops, 2026-05-23).
      // Team include shape gives `member.user.id` (no flat userId), which
      // validatePOVAccess explicitly supports via its BC fallback at L111.
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        logContext: '/api/mcp/tasks/context povId path'
      });

      mcpContext.pov = {
        core: {
          id: pov.id,
          title: pov.title,
          description: pov.description,
          status: pov.status,
          objective: pov.objective,
          customerName: pov.customerName,
          createdAt: pov.createdAt,
          updatedAt: pov.updatedAt
        },
        structure: {
          phases: pov.phases.map((phase: any) => ({
            id: phase.id,
            name: phase.name,
            type: phase.type,
            order: phase.order,
            description: phase.description,
            taskCount: phase.tasks.length,
            completedTasks: phase.tasks.filter((t: any) => t.status === 'COMPLETED').length,
            tasks: contextDepth === 'full' ? phase.tasks : phase.tasks.slice(0, 5)
          }))
        },
        team: pov.team ? {
          id: pov.team.id,
          name: pov.team.name,
          members: pov.team.members.map((member: any) => member.user)
        } : null
      };

      // Add POV analytics if requested
      if (includeAnalytics) {
        const totalTasks = pov.phases.reduce((sum: number, phase: any) => sum + phase.tasks.length, 0);
        const completedTasks = pov.phases.reduce((sum: number, phase: any) => 
          sum + phase.tasks.filter((t: any) => t.status === 'COMPLETED').length, 0
        );
        const overdueTasks = pov.phases.reduce((sum: number, phase: any) => 
          sum + phase.tasks.filter((t: any) => t.dueDate && t.dueDate < new Date() && t.status !== 'COMPLETED').length, 0
        );

        mcpContext.pov.analytics = {
          totalTasks,
          completedTasks,
          completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
          overdueTasks,
          phaseProgress: pov.phases.map((phase: any) => ({
            phaseId: phase.id,
            phaseName: phase.name,
            progress: phase.tasks.length > 0 
              ? (phase.tasks.filter((t: any) => t.status === 'COMPLETED').length / phase.tasks.length) * 100 
              : 0
          }))
        };
      }
    }

    // Phase context
    else if (phaseId) {
      const phase = await prisma.phase.findUnique({
        where: { id: phaseId },
        include: {
          tasks: {
            include: {
              assignee: {
                select: { id: true, name: true, email: true }
              }
            }
          },
          pov: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              objective: true,
              ownerId: true,
              metadata: true,
              team: {
                select: { id: true, members: { select: { userId: true } } }
              }
            }
          }
        }
      });

      if (!phase) {
        return {
          error: {
            message: 'Phase not found',
            code: 'NOT_FOUND',
          },
        };
      }

      // SECURITY: cross-tenant IDOR fix (Wave A C1, Phase 3 sec-ops, 2026-05-23).
      if (!phase.pov) {
        const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
        if (!isAdmin) {
          return {
            error: { message: 'Access denied', code: 'FORBIDDEN' },
          };
        }
      } else {
        validatePOVAccess(user, phase.pov, {
          throwOnDeny: true,
          logContext: '/api/mcp/tasks/context phaseId path'
        });
      }

      mcpContext.phase = {
        core: {
          id: phase.id,
          name: phase.name,
          type: phase.type,
          order: phase.order,
          description: phase.description
        },
        pov: phase.pov,
        tasks: phase.tasks.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          assignee: task.assignee,
          dueDate: task.dueDate,
          agentRole: task.agentRole,
          executionStatus: task.executionStatus
        }))
      };
    }

    // Add MCP-specific recommendations if requested
    if (includeRecommendations) {
      const recommendations = await generateMCPRecommendations(mcpContext, user.userId);
      mcpContext.recommendations = recommendations;
    }

    // Add MCP tool compatibility information
    mcpContext.mcpCompatibility = {
      supportedActions: [
        'task.create',
        'task.update',
        'task.assign',
        'task.complete',
        'agent.configure',
        'agent.execute',
        'analytics.generate'
      ],
      availableTools: await getAvailableMCPTools(),
      contextVersion: '1.0',
      apiVersion: '2025.1'
    };

    return {
      data: mcpContext
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to retrieve MCP task context');
    return {
      error: {
        message: 'Failed to retrieve MCP task context',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// Helper function to generate MCP-specific recommendations
async function generateMCPRecommendations(context: any, userId: string) {
  const recommendations = [];

  // Task-specific recommendations
  if (context.task) {
    const task = context.task;
    
    // Agent configuration recommendations
    if (!task.agent.role && !task.agent.prompt) {
      recommendations.push({
        type: 'AGENT_CONFIGURATION',
        priority: 'HIGH',
        title: 'Configure AI Agent',
        description: 'This task could benefit from AI agent automation',
        action: 'agent.configure',
        parameters: {
          taskId: task.core.id,
          suggestedRole: inferAgentRole(task.core.type, task.core.title),
          suggestedPrompt: generatePromptSuggestion(task.core)
        }
      });
    }

    // Dependency recommendations
    if (task.relationships.blockedBy.length > 0) {
      recommendations.push({
        type: 'DEPENDENCY_RESOLUTION',
        priority: 'MEDIUM',
        title: 'Resolve blocking dependencies',
        description: `Task is blocked by ${task.relationships.blockedBy.length} incomplete dependencies`,
        action: 'task.resolve_dependencies',
        parameters: {
          taskId: task.core.id,
          blockingTasks: task.relationships.blockedBy.map((t: any) => t.id)
        }
      });
    }

    // Overdue task recommendations
    if (task.core.dueDate && new Date(task.core.dueDate) < new Date() && task.core.status !== 'COMPLETED') {
      recommendations.push({
        type: 'OVERDUE_TASK',
        priority: 'HIGH',
        title: 'Address overdue task',
        description: 'Task is past due date and requires attention',
        action: 'task.prioritize',
        parameters: {
          taskId: task.core.id,
          suggestedActions: ['extend_deadline', 'reassign', 'escalate']
        }
      });
    }
  }

  // POV-specific recommendations
  if (context.pov) {
    const pov = context.pov;
    
    // Phase optimization recommendations
    const stuckPhases = pov.structure.phases.filter((phase: any) => 
      phase.taskCount > 0 && (phase.completedTasks / phase.taskCount) < 0.5
    );

    if (stuckPhases.length > 0) {
      recommendations.push({
        type: 'PHASE_OPTIMIZATION',
        priority: 'MEDIUM',
        title: 'Optimize stuck phases',
        description: `${stuckPhases.length} phases have low completion rates`,
        action: 'workflow.optimize_phases',
        parameters: {
          povId: pov.core.id,
          stuckPhases: stuckPhases.map((p: any) => p.id)
        }
      });
    }
  }

  return recommendations;
}

// Helper function to get available MCP tools
async function getAvailableMCPTools() {
  try {
    const { mcpToolRegistry } = await import('@/lib/services/mcp/toolRegistry');
    const tools = mcpToolRegistry.searchTools({
      includeDeprecated: false
    });
    
    return tools.map(tool => ({
      id: `${tool.serverName}:${tool.name}`,
      name: tool.name,
      description: tool.description,
      actions: tool.tags || [],
      serverName: tool.serverName,
      category: tool.category,
      performance: {
        averageResponseTime: tool.performance.averageExecutionTime,
        successRate: tool.performance.successRate,
        totalExecutions: tool.performance.totalExecutions
      },
      reliability: tool.reliability.healthScore > 90 ? 'HIGH' : tool.reliability.healthScore > 70 ? 'MEDIUM' : 'LOW',
      version: tool.version,
      lastUpdated: tool.lastUpdated
    }));
  } catch (error) {
    mcpLogger.error({ err: error }, 'Error fetching MCP tools for context');
    // Fallback to static tools if registry is not available
    return [
      {
        id: 'task-manager',
        name: 'Task Management Tool',
        description: 'Create, update, and manage tasks',
        actions: ['create', 'update', 'assign', 'complete'],
        serverName: 'builtin',
        category: 'task-management',
        performance: { averageResponseTime: 100, successRate: 99.5, totalExecutions: 1000 },
        reliability: 'HIGH',
        version: '1.0.0',
        lastUpdated: new Date()
      },
      {
        id: 'agent-orchestrator',
        name: 'Agent Orchestration Tool',
        description: 'Configure and execute AI agents',
        actions: ['configure', 'execute', 'monitor'],
        serverName: 'builtin',
        category: 'automation',
        performance: { averageResponseTime: 250, successRate: 98.2, totalExecutions: 500 },
        reliability: 'HIGH',
        version: '1.0.0',
        lastUpdated: new Date()
      },
      {
        id: 'analytics-generator',
        name: 'Analytics Generator',
        description: 'Generate insights and analytics',
        actions: ['performance', 'insights', 'predictions'],
        serverName: 'builtin',
        category: 'analysis',
        performance: { averageResponseTime: 500, successRate: 97.8, totalExecutions: 200 },
        reliability: 'MEDIUM',
        version: '1.0.0',
        lastUpdated: new Date()
      }
    ];
  }
}

// Helper functions for recommendations
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

function generatePromptSuggestion(task: any): string {
  const role = inferAgentRole(task.type, task.title);
  
  return `You are a ${role.replace('_', ' ')} working on: ${task.title}

Task Description: ${task.description || 'No description provided'}

Your goal is to complete this task efficiently and effectively. Please:
1. Analyze the task requirements
2. Break down the work into manageable steps
3. Execute each step systematically
4. Provide clear progress updates
5. Deliver high-quality results

Focus on best practices and maintain clear communication throughout the process.`;
}

// Enhanced agent context builder with comprehensive validation indicators
async function buildEnhancedAgentContext(task: any) {
  const agentContext: any = {
    // Basic agent configuration
    role: task.agentRole,
    prompt: task.prompt, // This is the AGENT PROMPT (user instructions)
    executionStatus: task.executionStatus,
    
    // Template information
    templateId: task.agentTemplateId,
    template: null,
    
    // Model parameters and system prompt
    modelParameters: null,
    systemPrompt: null,
    
    // MCP configuration
    mcpToolId: task.mcpToolId,
    mcpWorkflowId: task.mcpWorkflowId,
    mcpContext: task.mcpContext,
    mcpMetadata: task.mcpMetadata,
    
    // Validation indicators for Claude Desktop
    validation: {
      isConfigured: false,
      hasTemplate: false,
      hasAgentPrompt: false,
      hasSystemPrompt: false,
      configurationScore: 0,
      issues: [],
      suggestions: []
    },
    
    // Essential metrics only
    metrics: {
      agentPromptWords: 0,
      systemPromptWords: 0
    }
  };

  // Extract model parameters from metadata
  if (task.metadata && task.metadata.modelParameters) {
    agentContext.modelParameters = task.metadata.modelParameters;
    agentContext.systemPrompt = task.metadata.modelParameters.systemPrompt;
    agentContext.validation.hasModelParameters = true;
    
    // Calculate system prompt metrics
    if (agentContext.systemPrompt) {
      agentContext.metrics.systemPromptWords = agentContext.systemPrompt.trim().split(/\s+/).length;
      agentContext.validation.hasSystemPrompt = true;
    }
  }

  // Calculate agent prompt metrics
  if (task.prompt) {
    agentContext.metrics.agentPromptWords = task.prompt.trim().split(/\s+/).length;
    agentContext.validation.hasAgentPrompt = true;
  }

  // Fetch template details if templateId exists
  if (task.agentTemplateId) {
    try {
      const template = await prisma.agentTemplate.findUnique({
        where: { id: task.agentTemplateId },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          defaultRole: true,
          promptTemplate: true,
          capabilities: true,
          constraints: true,
          isDefault: true,
          tags: true
        }
      });

      if (template) {
        agentContext.template = {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          role: template.defaultRole,
          capabilities: template.capabilities,
          constraints: template.constraints,
          isBuiltIn: template.isDefault,
          tags: template.tags
        };
        agentContext.validation.hasTemplate = true;
      }
    } catch (error) {
      mcpLogger.error({ err: error }, 'Error fetching agent template');
      agentContext.validation.issues.push('Failed to load template details');
    }
  }

  // If template has a promptTemplate, count as having system prompt (late-binding at execution)
  if (!agentContext.validation.hasSystemPrompt && agentContext.validation.hasTemplate) {
    // Check if the assigned template has a promptTemplate (used by buildSystemPrompt at execution)
    try {
      const templateWithPrompt = await prisma.agentTemplate.findUnique({
        where: { id: task.agentTemplateId! },
        select: { promptTemplate: true }
      });
      if (templateWithPrompt?.promptTemplate) {
        agentContext.validation.hasSystemPrompt = true;
        agentContext.systemPrompt = '(from template — resolved at execution time)';
      }
    } catch { /* non-critical */ }
  }

  // Calculate configuration score and validation.
  // Protocol-10 correction (2026-08-19, morning-list #4): a TEMPLATE supplies both prompt
  // sources AT RUNTIME (the engine resolves promptTemplate fresh and synthesizes the directive
  // from the task itself), so template-backed tasks earn the prompt points via the template —
  // the old heuristic scored every healthy harness task 55/100 with two false 'issues', a
  // verdict-shaped advisory that read as a problem in demos while nothing was wrong.
  let score = 0;
  if (agentContext.validation.hasTemplate) score += 30;
  if (agentContext.validation.hasAgentPrompt || agentContext.validation.hasTemplate) score += 25;
  if (agentContext.validation.hasSystemPrompt || agentContext.validation.hasTemplate) score += 25;
  if (agentContext.validation.hasModelParameters) score += 20;
  
  agentContext.validation.configurationScore = score;
  agentContext.validation.isConfigured = score >= 50;

  // Generate validation issues and suggestions
  if (!agentContext.validation.hasTemplate) {
    agentContext.validation.issues.push('No agent template assigned');
    agentContext.validation.suggestions.push({
      action: 'agent.configure',
      parameter: 'agentTemplateId',
      description: 'Assign an agent template using agentTemplateId parameter'
    });
  }

  // A missing stored prompt is an ISSUE only when there is no template to synthesize from —
  // with a template, the engine builds the directive from the task (title/description) by design.
  if (!agentContext.validation.hasAgentPrompt && !agentContext.validation.hasTemplate) {
    agentContext.validation.issues.push('No agent prompt configured');
    agentContext.validation.suggestions.push({
      action: 'agent.configure',
      parameter: 'prompt',
      description: 'Provide agent instructions using prompt parameter'
    });
  }

  if (!agentContext.validation.hasSystemPrompt && !agentContext.validation.hasTemplate) {
    agentContext.validation.issues.push('No system prompt configured');
    agentContext.validation.suggestions.push({
      action: 'agent.configure',
      // UX FIX: If template already assigned, guide user to run agent.configure to activate
      // the system prompt. If no template, guide to assign one first.
      parameter: agentContext.validation.hasTemplate ? 'prompt' : 'agentTemplateId',
      description: agentContext.validation.hasTemplate
        ? 'Run agent.configure to activate the system prompt from the assigned template'
        : 'System prompt comes from agent template - ensure template is properly assigned'
    });
  }

  // The stored-snapshot word count is advisory ONLY for templateless tasks: beside a template,
  // the stored copy is a non-authoritative snapshot (the runtime prompt is resolved fresh from
  // the template) and its length says nothing about the prompt the agent will actually get.
  if (agentContext.validation.hasSystemPrompt && !agentContext.validation.hasTemplate &&
      agentContext.metrics.systemPromptWords < 200) {
    agentContext.validation.issues.push('System prompt appears incomplete (< 200 words)');
    agentContext.validation.suggestions.push({
      action: 'agent.configure',
      parameter: 'agentTemplateId',
      description: 'Verify template assignment - pAIchart Universal templates should be 1000+ words'
    });
  }

  return agentContext;
}

export const GET = createHandler(getMCPTaskContextHandler, { requireAuth: true });
