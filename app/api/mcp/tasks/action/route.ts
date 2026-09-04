import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { validateMCPActionRequest } from '@/lib/validation/mcp-action-validation';
import { logMCPInteraction } from '@/lib/mcp/tasks/action/utilities/mcp-logging';
import { TasksActionRouter } from '@/lib/mcp/tasks/action/tasks-action-router';
import { taskListCache } from '@/lib/tasks/handlers/get';

import { mcpLogger } from '@/lib/logger';
import { AppError, PipelineStageMismatchError } from '@/lib/errors';
// F6 (2026-07-25): MCP actions that mutate a task row and therefore invalidate cached task-list
// reads. Derived from the router's action set: task.assign/comment/complete/create/update change
// the row itself; agent.configure/execute change agent fields ON the task (the list surfaces
// agentRole/executionStatus). agent.results/agent.status are pure reads. Keep in sync with
// tasks-action-router.ts — a new task-mutating action added there belongs here.
const TASK_MUTATING_MCP_ACTIONS = new Set([
  'task.create', 'task.update', 'task.complete', 'task.assign', 'task.comment',
  'agent.assign', 'agent.configure', 'agent.execute',
]);

/**
 * Pre-normalize parameters BEFORE validation
 * Fixes execution order issue where validation rejected before normalization could run
 */
function preNormalizeParameters(body: any): any {
  if (!body?.parameters) return body;

  const params = body.parameters;

  // Normalize SAFE_NAME fields (phaseName, stageName, name) - remove & and special chars
  const safeNameFields = ['phaseName', 'stageName', 'name', 'phase_name', 'stage_name'];
  safeNameFields.forEach(field => {
    if (typeof params[field] === 'string') {
      params[field] = params[field]
        .replace(/\s*&\s*/g, ' and ')  // & → "and"
        .replace(/['"]/g, '')           // Remove quotes
        .replace(/[()]/g, '')           // Remove parentheses
        .replace(/[:;,]/g, '')          // Remove punctuation
        .replace(/[!?@#$%*+=[\]{}|\\/<>]/g, '')  // Remove special chars
        .replace(/\s+/g, ' ')           // Clean multiple spaces
        .trim();
    }
  });

  // Normalize priority - map URGENT to HIGH (TaskPriority enum has no URGENT)
  const priorityMap: Record<string, string> = {
    'urgent': 'HIGH',
    'URGENT': 'HIGH',
    'Urgent': 'HIGH',
    'critical': 'HIGH',
    'CRITICAL': 'HIGH',
    'Critical': 'HIGH'
  };

  // Normalize in parameters object
  if (params.priority && typeof params.priority === 'string' && priorityMap[params.priority]) {
    params.priority = priorityMap[params.priority];
  }

  // Also normalize at top level (flat parameter support)
  if (body.priority && typeof body.priority === 'string' && priorityMap[body.priority]) {
    body.priority = priorityMap[body.priority];
  }

  return body;
}

// Jan Marshal's Simple & Reliable Approach
// Pre-normalization added to fix execution order (normalize before validate)

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * Compute diff between before and after task states
 * Returns array of changed fields with from/to values
 */
// POST /api/mcp/tasks/action - Action-oriented task operations for MCP
const mcpTaskActionHandler: ApiHandler = async (
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

  // SECURITY FIX: Parse and validate request body ONCE to prevent "body used already" error
  let action: string | undefined;
  let parameters: any;
  let taskId: string | undefined;
  let metadata: any;
  let assigneeId: string | undefined;
  let priority: string | undefined;
  
  try {
    // Step 1: Single body read
    const rawBody = await req.json();

    // Step 2: Pre-normalize parameters BEFORE validation (fixes execution order issue)
    const normalizedBody = preNormalizeParameters(rawBody);

    // Step 3: Apply comprehensive input validation on normalized parameters
    const validation = validateMCPActionRequest(normalizedBody);
    
    if (!validation.success) {
      // BC42 FIX: Truncate raw user input + strip security details from log to prevent log injection
      mcpLogger.warn({ action: typeof rawBody.action === 'string' ? rawBody.action.substring(0, 50) : '[invalid]' }, 'mcp action validation failed');

      // Include validation errors (excluding security issues) so LLMs can self-correct
      const safeErrors = (validation.errors || [])
        .filter(e => !validation.securityIssues?.includes(e))
        .slice(0, 5);  // Cap at 5 errors to prevent response bloat

      return {
        error: {
          message: 'MCP request validation failed',
          code: 'INVALID_INPUT',
          details: safeErrors.length > 0 ? safeErrors : undefined,
        }
      };
    }
    
    // Step 3: Use ONLY validated data for all subsequent processing
    const body = validation.validatedData!;
    ({ action, parameters, metadata, taskId, assigneeId, priority } = body);
    
    mcpLogger.debug({ action }, 'mcp action validated');

    // Jan Marshal's Fix: Extract parameters from top-level body (Claude Desktop bug workaround)
    const { 
      agentTemplateId: topLevelAgentTemplateId, 
      agentTemplateName: topLevelAgentTemplateName,
      agent_template_id: topLevelAgentTemplateIdUnderscore,
      prompt: topLevelPrompt,
      role: topLevelRole,
      agentRole: topLevelAgentRole,
      inputContext: topLevelInputContext,  // CRITICAL FIX: Extract inputContext
      // Task creation parameters
      title: topLevelTitle,
      description: topLevelDescription,
      povId: topLevelPovId,
      phaseId: topLevelPhaseId,
      phaseName: topLevelPhaseName,
      teamId: topLevelTeamId,
      assigneeId: topLevelAssigneeId,
      assignee: topLevelAssignee,
      type: topLevelType,
      dueDate: topLevelDueDate,
      comment: topLevelComment,
      // Task update parameters - CRITICAL FIX: Extract task name parameters
      taskName: topLevelTaskName,
      task_name: topLevelTaskNameUnderscore,
      pov_id: topLevelPovIdUnderscore,
      priority: topLevelPriority,
      status: topLevelStatus,
      // Stage creation parameters
      stageName: topLevelStageName,
      name: topLevelName,
      position: topLevelPosition
    } = body;

    if (!action) {
      return {
        error: {
          message: 'Action is required',
          code: 'VALIDATION_ERROR',
        },
      };
    }

    // Handle Claude Desktop parameter format issues
    // Case 1: parameters is a stringified JSON (Claude Desktop bug)
    if (typeof parameters === 'string') {
      try {
        const parsedParams = JSON.parse(parameters);
        parameters = parsedParams;
      } catch (parseError) {
        mcpLogger.warn({ err: parseError, action }, 'mcp action: failed to parse parameters string');
        const errorMessage = parseError instanceof Error ? parseError.message : 'Invalid JSON format';
        
        // Enhanced error message with Claude Desktop workaround suggestions
        const enhancedMessage = `❌ **JSON Parsing Error**

${errorMessage}

💡 **Claude Desktop Workaround Suggestions:**

**Option 1: Use Top-Level Parameters (Recommended)**
Instead of:
\`\`\`json
{
  "action": "${action}",
  "parameters": "{\\"taskId\\": \\"value\\", ...}"
}
\`\`\`

Use:
\`\`\`json
{
  "action": "${action}",
  "taskId": "cmczpamn8000rcjj8xztlbdpu",
  "agentTemplateName": "Enhanced QA Test Engineer",
  "agentRole": "mcp_tool_testing_specialist",
  "prompt": "Your prompt here..."
}
\`\`\`

**Option 2: Fix JSON Object Structure**
\`\`\`json
{
  "action": "${action}",
  "parameters": {
    "taskId": "cmczpamn8000rcjj8xztlbdpu",
    "agentTemplateName": "Enhanced QA Test Engineer",
    "agentRole": "mcp_tool_testing_specialist",
    "prompt": "Your prompt here..."
  }
}
\`\`\`

💡 **Tip**: This API supports both parameter formats for Claude Desktop compatibility.`;

        return {
          error: {
            message: enhancedMessage,
            code: 'PARAMETER_PARSE_ERROR',
            suggestions: [
              {
                type: 'claude_desktop_workaround',
                description: 'Use top-level parameters instead of nested parameters object',
                example: {
                  action: action,
                  taskId: 'your-task-id',
                  agentTemplateName: 'your-template-name',
                  prompt: 'your-prompt'
                }
              },
              {
                type: 'json_structure_fix',
                description: 'Convert parameters string to proper JSON object',
                note: 'Remove escaped quotes and use proper JSON object syntax'
              }
            ]
          },
        };
      }
    }

    // Case 2: taskId and other params are at top level (Claude Desktop format)
    if (!parameters && (taskId || assigneeId || priority)) {
      parameters = {
        taskId,
        assigneeId,
        priority,
        assignee: assigneeId // Also map assigneeId to assignee for compatibility
      };
    }

    // Case 3: Extract taskId from parameters if it's there (Claude Desktop sometimes puts it inside)
    if (parameters && parameters.taskId && !taskId) {
      taskId = parameters.taskId;
    }

    // Case 4: Merge top-level taskId with existing parameters (Claude Desktop format 2)
    if (taskId && parameters && !parameters.taskId) {
      parameters.taskId = taskId;
    }

    // Case 5: Handle top-level task update parameters (Claude Desktop sends these at top level)
    const topLevelTaskParams = {
      taskName: body.taskName,
      task_name: body.task_name,
      povId: body.povId,
      pov_id: body.pov_id,
      description: body.description,
      priority: body.priority,
      status: body.status,
      title: body.title
    };

    // Case 6: Ensure parameters is an object
    if (!parameters) {
      parameters = {};
    }

    // Case 7: Merge top-level task parameters into parameters object
    Object.entries(topLevelTaskParams).forEach(([key, value]) => {
      if (value !== undefined && parameters[key] === undefined) {
        parameters[key] = value;

      }
    });

    // Jan Marshal's Fix: Merge top-level parameters into parameters object (Claude Desktop bug workaround)
    if (topLevelAgentTemplateId && !parameters.agentTemplateId) {
      parameters.agentTemplateId = topLevelAgentTemplateId;

    }
    if (topLevelAgentTemplateIdUnderscore && !parameters.agent_template_id) {
      parameters.agent_template_id = topLevelAgentTemplateIdUnderscore;
    }
    if (topLevelAgentTemplateName && !parameters.agentTemplateName) {
      parameters.agentTemplateName = topLevelAgentTemplateName;
    }
    if (topLevelPrompt && !parameters.prompt) {
      parameters.prompt = topLevelPrompt;
    }
    if (topLevelRole && !parameters.role) {
      parameters.role = topLevelRole;
    }
    if (topLevelAgentRole && !parameters.agentRole) {
      parameters.agentRole = topLevelAgentRole;
    }
    if (topLevelInputContext && !parameters.inputContext) {
      parameters.inputContext = topLevelInputContext;
    }

    // Task creation parameters
    if (topLevelTitle && !parameters.title) {
      parameters.title = topLevelTitle;
    }
    if (topLevelDescription && !parameters.description) {
      parameters.description = topLevelDescription;
    }
    if (topLevelPovId && !parameters.povId) {
      parameters.povId = topLevelPovId;
    }
    if (topLevelPhaseId && !parameters.phaseId) {
      parameters.phaseId = topLevelPhaseId;
    }
    if (topLevelTeamId && !parameters.teamId) {
      parameters.teamId = topLevelTeamId;
    }
    if (topLevelAssigneeId && !parameters.assigneeId) {
      parameters.assigneeId = topLevelAssigneeId;
    }
    if (topLevelAssignee && !parameters.assignee) {
      parameters.assignee = topLevelAssignee;
    }
    if (topLevelType && !parameters.type) {
      parameters.type = topLevelType;
    }
    if (topLevelDueDate && !parameters.dueDate) {
      parameters.dueDate = topLevelDueDate;
    }
    if (topLevelComment && !parameters.comment) {
      parameters.comment = topLevelComment;
    }

    // Stage creation parameters
    if (topLevelStageName && !parameters.stageName) {
      parameters.stageName = topLevelStageName;
    }
    if (topLevelName && !parameters.name) {
      parameters.name = topLevelName;
    }
    if (topLevelPosition && !parameters.position) {
      parameters.position = topLevelPosition;
    }

    // Jan Marshal's Simple & Reliable Approach - Direct parameter usage
    // No complex normalization needed - handle parameters as they come
    if (parameters) {
      // Simple type coercion for common parameters
      if (parameters.maxRetries && typeof parameters.maxRetries === 'string') {
        parameters.maxRetries = parseInt(parameters.maxRetries, 10) || 3;
      }
      if (parameters.timeout && typeof parameters.timeout === 'string') {
        parameters.timeout = parseInt(parameters.timeout, 10) || 30000;
      }
      
      // Simple parameter mapping for common cases
      if (parameters.assigneeEmail && !parameters.assignee) {
        parameters.assignee = parameters.assigneeEmail;
      }
    }

    // Generate action ID for tracking
    const actionId = `mcp-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Delegate to router - all handlers are coordinated through TasksActionRouter
    const router = new TasksActionRouter();
    let result: any;

    try {
      result = await router.route(action, parameters, user, actionId);
    } catch (routerError) {
      // Handle unsupported actions from router
      if (routerError instanceof Error && routerError.message.startsWith('Unsupported action:')) {
        return {
          error: {
            message: routerError.message,
            code: 'UNSUPPORTED_ACTION',
          },
        };
      }
      // Re-throw for main error handler
      throw routerError;
    }

    // F6 (2026-07-25): bust the web task-list cache after a task-mutating MCP action.
    //
    // The web write handlers invalidate it (lib/tasks/handlers/task.ts, lib/pov/handlers/put.ts)
    // but the MCP path never did, so a PM refreshing the board after an agent completed a task saw
    // stale rows until the 30s TTL expired.
    //
    // WHY HERE and not in the shared handlers: the cache is a module-level LRU, i.e. PER-PROCESS.
    // This route runs inside paichart-web — the same process that serves the cached reads — so a
    // bust here actually lands. The shared MCP handlers are also loaded by the separate
    // paichart-mcp (stdio) process, where busting would hit a different instance and do nothing
    // for the web, while adding the GET-handler module to that process's load chain. This route is
    // handler-layer and outside that chain, so it is both the effective and the cheap place.
    //
    // KNOWN LIMIT (documented, not fixed): task mutations arriving over the stdio MCP transport
    // still leave the web cache stale for up to the 30s TTL. Closing that needs cross-process
    // invalidation (a NOTIFY listener), which is not worth it for a 30-second read cache.
    if (TASK_MUTATING_MCP_ACTIONS.has(action)) {
      taskListCache.invalidatePattern('tasks');
    }

    // Log MCP interaction
    await logMCPInteraction(actionId, action, parameters, result, user.userId);

    return {
      data: result
    };
  } catch (error) {
    // ITEM 3g.1 (2026-04-25): preserve typed-error discriminators across
    // the MCP boundary. Without this check, all AppError subclasses
    // (DuplicateActiveExecutionError, PipelineStageMismatchError,
    // NoTemplateAssignedError, etc.) get flattened to INTERNAL_ERROR —
    // invisible to MCP clients that need .code for discriminator-based
    // handling.
    // Pattern reference: app/api/tasks/[taskId]/agent/execute/route.ts:228
    // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
    if (error instanceof AppError) {
      // Option A polish (boundary-contract): tag the boundary warn with
      // securityEvent: true when the error is a security-class mismatch,
      // so log-query parity is preserved between the inner pre-throw warn
      // (at 3b.1/3b.2) and the boundary catch warn here. Without this,
      // grep'ing for `securityEvent: true` would miss boundary emits for
      // the same incident.
      const isSecurityEvent = error instanceof PipelineStageMismatchError;
      mcpLogger.warn(
        {
          err: error,
          action,
          code: error.code,
          ...(isSecurityEvent ? { securityEvent: true } : {}),
        },
        'mcp typed error (preserved across boundary)'
      );
      return {
        error: {
          message: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
          action: action || 'unknown',
        },
      };
    }

    mcpLogger.error({ err: error, action }, 'mcp action error');

    // Pass through the original error message — handlers already produce
    // user-friendly messages with available users/teams listed.
    // Only sanitize truly unexpected errors (no Error instance or empty message).
    const errorMessage = error instanceof Error && error.message
      ? error.message
      : 'MCP action failed';

    return {
      error: {
        message: `Failed to execute MCP action: ${errorMessage}`,
        code: 'INTERNAL_ERROR',
        action: action || 'unknown',
      },
    };
  }
};

// BC44 FIX: Add rate limiting — this is the primary MCP mutation endpoint
export const POST = createHandler(mcpTaskActionHandler, { requireAuth: true, rateLimit: 'write' });
