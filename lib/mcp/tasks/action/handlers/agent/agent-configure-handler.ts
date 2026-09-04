import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { Prisma } from '@prisma/client';
import { ensureObject } from '@/lib/utils/ensure-object';
import { validateMCPConfiguration } from '@/lib/services/mcpStorageMigration';
import { DEFAULT_MAX_TOKENS } from '@/lib/services/llm/types';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { logFieldChange, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { resolvePromptPlaceholders, buildContextSummary } from '@/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

const log = mcpLogger.child({ module: 'AgentConfigureHandler' });

/**
 * Handler for agent.configure action
 * Configures agent settings for a task including role, template, prompt, and model parameters
 *
 * @param parameters - Configuration parameters including taskId, agentRole, agentTemplateId, prompt, etc.
 * @param user - Authenticated user information
 * @param actionId - Unique action identifier for tracking
 * @returns Configuration result with updated task information
 */
export async function handleAgentConfigure(parameters: any, user: TokenPayload, actionId: string) {
  const {
    taskId,
    role,           // MCP uses 'role' instead of 'agentRole'
    agentRole,
    agentTemplateId,    // Agent template ID
    agent_template_id,  // Alternative parameter name (with underscore)
    agentTemplateName,  // Agent template name
    agent_template_name, // Alternative parameter name
    prompt,
    inputContext,
    maxRetries,
    timeout,
    mcpToolId,
    mcpWorkflowId,
    modelParameters,
    mcpTools,       // Handle MCP tools array
    workflow,       // Handle workflow configuration
    successMetrics, // Handle success metrics
    executionType   // Handle execution type
  } = parameters;

  // TASK 3.2: Add Configuration Validation
  const validationResult = await validateMCPConfiguration({
    taskId,
    agentRole: role || agentRole,
    agentTemplateId: agentTemplateId || agent_template_id,
    agentTemplateName: agentTemplateName || agent_template_name,
    prompt,
    inputContext,
    maxRetries,
    timeout,
    mcpTools,
    workflow,
    successMetrics,
    executionType,
    modelParameters
  });

  if (!validationResult.isValid) {
    log.error({ errors: validationResult.errors }, 'validation failed');
    throw new Error(`MCP Configuration validation failed: ${validationResult.errors.join(', ')}`);
  }

  if (validationResult.warnings.length > 0) {
    log.warn({ warnings: validationResult.warnings }, 'validation warnings');
  }

  if (!taskId) {
    throw new Error('Task ID is required for agent configuration');
  }

  // 🔒 SECURITY: Validate POV access before configuring agent
  const taskForAuth = await prisma.task.findUnique({
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

  if (!taskForAuth?.pov) {
    throw new Error(
      `Task not found: "${taskId}"\n\n` +
      `The task may not exist or you don't have access.\n\n` +
      `💡 Find tasks:\n` +
      `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
      `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
      `• search("task keywords") - Search across all tasks\n\n` +
      `Or verify the task ID is correct.`
    );
  }

  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Agent Configure'
  });

  // Handle agent template lookup
  let finalAgentTemplateId = agentTemplateId || agent_template_id || parameters.templateId;
  let finalAgentRole = role || agentRole;
  let agentTemplate = null;

  // FIXED: Template lookup logic - preserve direct agentTemplateId
  const templateName = agentTemplateName || agent_template_name;
  if (templateName && !finalAgentTemplateId) {
    log.info({ templateName }, 'looking up agent template by name');

    // Try exact match first
    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 template lookups → ~50% faster)
    // Run both search strategies in parallel, use best match
    // ============================================================================

    const [exactTemplateMatch, partialTemplateMatch] = await Promise.all([
      prisma.agentTemplate.findFirst({
        where: {
          name: { equals: templateName, mode: 'insensitive' }
        }
      }),
      prisma.agentTemplate.findFirst({
        where: {
          name: { contains: templateName, mode: 'insensitive' }
        }
      })
    ]);

    agentTemplate = exactTemplateMatch || partialTemplateMatch;

    if (agentTemplate) {
      finalAgentTemplateId = agentTemplate.id;
      // Use template's default role if no role specified
      if (!finalAgentRole) {
        finalAgentRole = agentTemplate.defaultRole || agentTemplate.name;
      }
      log.info({ templateName: agentTemplate.name, templateId: agentTemplate.id }, 'found agent template');
    } else {
      // Simple error message
      const allTemplates = await prisma.agentTemplate.findMany({
        select: { id: true, name: true, category: true },
        take: 50
      });
      const availableNames = allTemplates.map(t => t.name);

      throw new Error(`Agent template not found: "${templateName}". Available templates: ${availableNames.join(', ')}`);
    }
  }

  // If agentTemplateId is provided, fetch the template with full configuration
  if (finalAgentTemplateId && !agentTemplate) {
    agentTemplate = await prisma.agentTemplate.findUnique({
      where: { id: finalAgentTemplateId }
    });

    if (agentTemplate && !finalAgentRole) {
      finalAgentRole = agentTemplate.defaultRole || agentTemplate.name;
    }
  }

  // ENHANCED: Extract MCP Tools and Token Management from agent template
  let templateMcpTools: string[] = [];
  let templateTokenManagement: any = null;

  if (agentTemplate) {
    // Extract MCP tools from template metadata (handle both naming conventions)
    const metadata = agentTemplate.metadata as any;
    if (metadata && typeof metadata === 'object') {
      // Check for mcpToolConfiguration (new UI convention)
      if (metadata.mcpToolConfiguration && typeof metadata.mcpToolConfiguration === 'object') {
        if (metadata.mcpToolConfiguration.selectedTools && Array.isArray(metadata.mcpToolConfiguration.selectedTools)) {
          templateMcpTools = [...templateMcpTools, ...metadata.mcpToolConfiguration.selectedTools];
        }
      }

      // Also check for mcpConfiguration.mcpTools (alternate naming)
      if (metadata.mcpConfiguration && typeof metadata.mcpConfiguration === 'object') {
        if (metadata.mcpConfiguration.mcpTools && Array.isArray(metadata.mcpConfiguration.mcpTools)) {
          templateMcpTools = [...templateMcpTools, ...metadata.mcpConfiguration.mcpTools];
        }
      }
    }

    // Note: Removed capabilities.mcpTools check - metadata.mcpToolConfiguration is the single source of truth
    const capabilities = agentTemplate.capabilities as any;
    if (capabilities && typeof capabilities === 'object') {
      // Still check for other capability fields if needed, but NOT mcpTools
    }

    // Extract token management from template metadata (already declared above)
    if (metadata && typeof metadata === 'object' && metadata.tokenManagement) {
      templateTokenManagement = metadata.tokenManagement;
    }

    // Remove duplicates from template tools
    templateMcpTools = [...new Set(templateMcpTools)];
  }

  // Discover and validate available MCP tools
  let availableTools: { serverName: string; tools: string[] }[] = [];
  let validatedMcpTools: string[] = [];

  try {
    // Import MCP service and tool registry
    const { mcpService } = await import('@/lib/services/mcp/mcpService');
    const { mcpToolRegistry } = await import('@/lib/services/mcp/toolRegistry');

    // Get all available tools from all servers
    const allServerTools = mcpService.getAllTools();

    // Build list of available tools
    for (const [serverName, tools] of allServerTools) {
      const toolNames = tools.map(tool => tool.name);
      availableTools.push({ serverName, tools: toolNames });
    }

    // Also check the tool registry directly for all registered tools
    const registeredTools = mcpToolRegistry.searchTools({});

    // Group registered tools by server
    const toolsByServer = new Map<string, string[]>();
    for (const tool of registeredTools) {
      const serverName = tool.serverName || 'unknown';
      if (!toolsByServer.has(serverName)) {
        toolsByServer.set(serverName, []);
      }
      toolsByServer.get(serverName)!.push(tool.name);
    }

    // Add tools from registry that might not be in mcpService
    for (const [serverName, toolNames] of toolsByServer) {
      if (!availableTools.some(at => at.serverName === serverName)) {
        availableTools.push({ serverName, tools: toolNames });
      }
    }

    // Also check embedded server
    try {
      const { embeddedMCPServer } = await import('@/lib/mcp/embedded-server');
      if (embeddedMCPServer.isReady()) {
        const embeddedTools = await embeddedMCPServer.getTools();
        const embeddedToolNames = embeddedTools.map((tool: any) => tool.name);
        availableTools.push({ serverName: 'paichart-embedded-mcp', tools: embeddedToolNames });
      }
    } catch {
      // Embedded server not available - continue without it
    }

    // ENHANCED: Merge template tools with MCP command tools (template tools as defaults, MCP command tools take precedence)
    // Handle both string tool names and tool objects
    const normalizedTemplateMcpTools = templateMcpTools.map(tool => {
      if (typeof tool === 'string') {
        return tool;
      } else if (typeof tool === 'object' && tool !== null) {
        // Extract tool name from object (could be toolName, name, or toolId)
        const toolObj = tool as any;
        return toolObj.toolName || toolObj.name || (toolObj.toolId ? toolObj.toolId.split(':').pop() : null);
      }
      return null;
    }).filter(Boolean);

    const allRequestedTools = [...new Set([...normalizedTemplateMcpTools, ...(mcpTools || [])])];

    // Validate all requested tools against available tools
    if (allRequestedTools.length > 0) {
      const allAvailableToolNames = availableTools.flatMap(server => server.tools);

      for (const requestedTool of allRequestedTools) {
        if (allAvailableToolNames.includes(requestedTool)) {
          validatedMcpTools.push(requestedTool);
        } else {
          const source = normalizedTemplateMcpTools.includes(requestedTool) ? 'template' : 'mcp-command';
          log.warn({ tool: requestedTool, source }, 'tool not available');
        }
      }
    }

  } catch (error) {
    log.warn({ err: error }, 'error discovering MCP tools');
    // Continue without MCP tool validation
  }

  // Get task and POV context for input context generation
  const taskWithContext = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      pov: {
        select: {
          id: true,
          title: true,
          status: true, // Axis 3: buildContextSummary renders POV (status); parity with the exec paths
          description: true,
          customerName: true,
          solution: true,
          objective: true,
          priority: true,
          startDate: true,
          endDate: true
        }
      },
      phase: {
        select: {
          id: true,
          name: true,
          description: true,
          type: true
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  // SYSTEM PROMPT: Resolve template with ALL 4 placeholders
  // @see agent-prompt-assembly-pattern.md — backstory goes in system prompt only
  let finalSystemPrompt = '';

  if (agentTemplate?.promptTemplate && finalAgentRole) {
    const contextualInfo = taskWithContext
      ? buildContextSummary(taskWithContext)
      : 'Context will be provided during task execution.';
    finalSystemPrompt = resolvePromptPlaceholders(
      agentTemplate.promptTemplate,
      finalAgentRole,
      contextualInfo
    );
  }

  // USER PROMPT (directive): Explicit prompt from MCP caller takes priority.
  // When not provided, synthesize a role-aware directive — NEVER copy description.
  // @see agent-prompt-assembly-pattern.md — directive ≠ description
  let finalUserPrompt: string;

  if (prompt) {
    // MCP caller explicitly provided a prompt — use it as-is
    finalUserPrompt = prompt;
  } else if (taskWithContext && finalAgentRole) {
    // Synthesize directive from role + task title (CrewAI "goal" pattern)
    finalUserPrompt = `As a ${finalAgentRole}, complete the following task: "${taskWithContext.title}"`;
  } else if (taskWithContext) {
    finalUserPrompt = `Complete the following task: "${taskWithContext.title}"`;
  } else {
    finalUserPrompt = '';
  }

  // Input context: PASS-THROUGH (2026-06-10). The former auto-generated
  // task/pov/phase/mcpConfiguration snapshot was removed — it duplicated the
  // user prompt's §3 Task Context and §5 POV Context (description + objective
  // appeared twice in full), contradicted §7's tool list (snapshot froze
  // tools at configure time), and confused users by rendering as "Chained
  // Context" despite containing no predecessor output. Its only unique
  // content (POV customer + solution) moved to §5 in the shared prompt
  // builder. Real dependency-output chaining is handled at execution time by
  // the createAgentExecution chokepoint (context-chainer, commit 6c640337).
  //
  // Semantics: user-supplied inputContext is stored verbatim (including any
  // custom sections like task_sequence / enriched_task_context — no merge
  // gymnastics needed now that nothing competes with them). When the caller
  // sends no inputContext, the stored value is left untouched (undefined
  // skips the column in the update), so legacy rows decay only when a caller
  // explicitly rewrites their context.
  const finalInputContext = inputContext;

  // ENHANCED: Apply Template Configuration (Token Management + Model Parameters)
  let finalMaxRetries = maxRetries !== undefined ? maxRetries : 3;
  // 🐛 FIX 2026-05-15: MCP schema accepts timeout in SECONDS (30-3600 range);
  // task.timeout column stores MILLISECONDS. Convert at this boundary.
  // Default (300000 ms = 5 min) is already in ms — only the client-supplied
  // value needs the * 1000 conversion. The dynamic-timeout branch at line 533
  // already does the conversion correctly (`estimatedTime * 1000`).
  let finalTimeout = timeout !== undefined ? timeout * 1000 : 300000;
  let finalModelParameters = modelParameters || {};

  // Extract template model parameters if available
  if (agentTemplate) {
    // Extract model parameters from template metadata
    const templateMetadata = agentTemplate.metadata as any;
    const templateModelParams = templateMetadata?.modelParameters || {};

    // Apply template model parameters as defaults (MCP parameters take priority)
    finalModelParameters = {
      // Template defaults first
      ...templateModelParams,
      // MCP parameters override template
      ...finalModelParameters,
      // Specific parameter handling with priority: MCP > Template > Default
      temperature: finalModelParameters.temperature ?? templateModelParams.temperature ?? (parameters.temperature !== undefined ? parameters.temperature : 0.3),
      maxTokens: finalModelParameters.maxTokens ?? templateModelParams.maxTokens ?? DEFAULT_MAX_TOKENS,  // Standardized default
      // CRITICAL: Apply system prompt from template
      systemPrompt: finalSystemPrompt || templateModelParams.systemPrompt,
      useSystemPrompt: true // Always enable system prompt when template is applied
    };

    // Apply template token management if available
    if (templateTokenManagement) {
      try {
        const { tokenManager } = await import('@/lib/services/llm/tokenManager');

        // Calculate optimal token allocation
        const optimalTokens = tokenManager.calculateTokenAllocation({
          requestType: 'agent_execution',
          promptLength: finalUserPrompt?.length || 0,
          contextSize: JSON.stringify(finalInputContext || {}).length,
          complexity: templateTokenManagement.complexity || 'medium',
          tokenManagement: templateTokenManagement
        });

        // Apply token management settings (respect MCP overrides)
        if (!finalModelParameters.maxTokens || finalModelParameters.maxTokens === 2000) {
          finalModelParameters.maxTokens = templateTokenManagement.maxTokens || optimalTokens;
        }

        if (!finalModelParameters.temperature || finalModelParameters.temperature === 0.3) {
          finalModelParameters.temperature = templateTokenManagement.temperature || 0.3;
        }

        // Apply budget constraints if configured
        if (templateTokenManagement.budget) {
          const budgetCheck = tokenManager.checkBudget(
            finalModelParameters.maxTokens,
            user.userId,
            templateTokenManagement.budget
          );

          if (!budgetCheck.allowed) {
            finalModelParameters.maxTokens = Math.min(
              finalModelParameters.maxTokens,
              budgetCheck.remainingHourly || budgetCheck.remainingDaily || 1000
            );
          }
        }

        // Apply dynamic timeout
        if (templateTokenManagement.dynamicTimeout && !timeout) {
          const estimatedTime = Math.max(60, finalModelParameters.maxTokens * 0.1);
          finalTimeout = Math.min(estimatedTime * 1000, templateTokenManagement.maxTimeout || 1800000);
        }

      } catch {
        // Token management application failed - continue with defaults
      }
    }
  }

  // Apply MCP temperature parameter if explicitly provided (highest priority)
  if (parameters.temperature !== undefined) {
    finalModelParameters.temperature = parameters.temperature;
  }

  // Build the update data object - ENHANCED: Use template-optimized values
  const updateData: any = {
    agentRole: finalAgentRole,
    prompt: finalUserPrompt,
    inputContext: finalInputContext,
    maxRetries: finalMaxRetries,
    timeout: finalTimeout,
    // NOTE: Do NOT set executionStatus here — that's the job of executeAgentOnTask's CAS guard.
    // Setting it prematurely blocks execution because the CAS sees PENDING with no active execution.
    mcpToolId,
    mcpWorkflowId,
    updatedAt: new Date()
  };

  // UPDATED: Use unified MCP storage architecture with dedicated schema fields
  const unifiedMCPContext = {
    // Core configuration
    agentRole: finalAgentRole || 'general_agent',
    executionType: executionType || 'standard',
    sessionId: parameters.sessionId,
    preserveContext: parameters.preserveContext,

    // Tool configuration
    tools: validatedMcpTools.map((toolName, index) => ({
      id: `tool-${index}`,
      name: toolName,
      serverName: 'unknown' // Will be enhanced with actual server detection
    })),

    // Workflow configuration
    workflow: {
      phases: workflow || {},
      executionOrder: workflow ? Object.keys(workflow) : [],
      parallelExecution: false,
      errorHandling: 'continue'
    },

    // Success metrics
    successMetrics: successMetrics || [],

    // Metadata
    configuredVia: 'mcp',
    configuredAt: new Date().toISOString(),
    version: '1.0.0'
  };

  // Store MCP configuration in dedicated schema fields
  updateData.mcpContext = unifiedMCPContext;
  updateData.mcpToolId = validatedMcpTools.length === 1 ? validatedMcpTools[0] : undefined;
  updateData.mcpWorkflowId = parameters.mcpWorkflowId;
  updateData.mcpMetadata = {
    migrationSource: 'direct_mcp_configuration',
    configuredAt: new Date().toISOString(),
    actionId,
    originalParameters: {
      mcpTools: mcpTools,
      workflow: workflow,
      successMetrics: successMetrics,
      executionType: executionType
    },
    availableTools: availableTools.length > 0 ? availableTools : undefined,
    integrationStatus: 'active'
  };

  // Always assign agent template ID if we have one (even if agentTemplate object is null)
  if (finalAgentTemplateId) {
    updateData.agentTemplateId = finalAgentTemplateId;
  }

  // BC19 FIX: Atomic read-modify-write for metadata merge
  // Read existing metadata and update in a single transaction to prevent race conditions
  const task = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
    const existingTask = await tx.task.findUnique({
      where: { id: taskId },
      select: { metadata: true }
    });

    const existingMetadata = ensureObject(existingTask?.metadata, {}, 'Task metadata') as Record<string, any>;

    // CRITICAL: Store model parameters in metadata for UI access
    // OVERRIDE existing modelParameters completely with new template + MCP values
    updateData.metadata = {
      ...existingMetadata,
      modelParameters: finalModelParameters,
      mcpStorageVersion: '2.0.0',
      mcpStorageLocation: 'dedicated_fields'
    };

    return tx.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        agentTemplate: {
          select: { id: true, name: true, category: true }
        },
        assignee: {
          select: { id: true, name: true, email: true }
        }
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }), 'agent-configure-handler:configure');

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };
  logFieldChange(task.id, user.userId, {
    name: 'agentConfiguration',
    oldValue: null,
    newValue: {
      agentRole: finalAgentRole,
      agentTemplateId: finalAgentTemplateId,
      mcpTools: validatedMcpTools,
      executionType: executionType || 'standard',
    },
    action: TaskActivityAction.UPDATED,
  }, mcpMetadata);

  // Note: Real-time UI updates handled via React Query cache invalidation
  // WebSocket server was removed Jan 2026 - this query was previously for WS broadcast
  // Kept for potential future use with PostgreSQL NOTIFY/LISTEN

  return {
    actionId,
    action: 'agent.configure',
    status: 'completed',
    timestamp: new Date().toISOString(),
    result: {
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        agentRole: task.agentRole,
        agentTemplateId: task.agentTemplateId,
        prompt: task.prompt,
        executionStatus: task.executionStatus,
        modelParameters: modelParameters,
        mcpConfiguration: unifiedMCPContext
      },
      agentTemplate: task.agentTemplate,
      message: `Agent configured successfully via MCP${task.agentTemplate ? ` using template "${task.agentTemplate.name}"` : ''}`
    }
  };
}
