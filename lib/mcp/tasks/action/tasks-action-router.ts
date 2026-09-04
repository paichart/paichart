import { TokenPayload } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';
import { MCPParameterSchemas, applySemanticMapping, type MCPAction } from '@/lib/validation/mcp-action-validation';
import { handleTaskComplete } from './handlers/task/task-complete-handler';

const log = mcpLogger.child({ module: 'TasksActionRouter' });
import { handleAnalyticsGenerate } from './handlers/analytics/analytics-generate-handler';
import { handleTaskComment } from './handlers/task/task-comment-handler';
import { handleTaskAssign } from './handlers/task/task-assign-handler';
import { handleAgentAssign } from './handlers/agent/agent-assign-handler';
import { handleAgentExecute } from './handlers/agent/agent-execute-handler';
import { handleAgentStatus } from './handlers/agent/agent-status-handler';
import { handleAgentResults } from './handlers/agent/agent-results-handler';
import { handleTaskUpdate } from './handlers/task/task-update-handler';
import { handleStageCreate } from './handlers/stage/stage-create-handler';
import { handleTaskCreate } from './handlers/task/task-create-handler';
import { handleAgentConfigure } from './handlers/agent/agent-configure-handler';
import { handlePOVCreate } from './handlers/pov/pov-create-handler';
import { handlePOVUpdate } from './handlers/pov/pov-update-handler';

/**
 * TasksActionRouter - Facade pattern for routing MCP task actions to specialized handlers
 *
 * Implements the facade extraction pattern to reduce route.ts complexity:
 * - Single delegation point for all 14 task action handlers (includes pov.create)
 * - Clean separation of routing logic from handler implementation
 * - Maintains Jan Marshal's "Simple & Reliable" approach
 *
 * Pattern:
 * - Router instantiated with all handlers
 * - route() method delegates based on action string
 * - Returns consistent action result format
 *
 * @created 2025-12-17 - Facade extraction completion
 */
export class TasksActionRouter {
  /**
   * Route an MCP action to the appropriate handler
   *
   * @param action - Action name (e.g., 'task.create', 'agent.execute')
   * @param parameters - Action parameters (already validated and normalized)
   * @param user - Authenticated user context
   * @param actionId - Unique action identifier for tracking
   * @returns Action result with status, timestamp, and handler-specific data
   * @throws Error with descriptive message for unsupported actions
   */
  async route(
    action: string,
    parameters: any,
    user: TokenPayload,
    actionId: string,
    /** Server-side routing extras (NOT client parameters — never validated as such).
     *  callingExecutionId: retry provenance for agent.execute (keep-best 2026-07-04). */
    routeOpts?: { callingExecutionId?: string }
  ): Promise<any> {
    // ── SECURITY: enforce MCPParameterSchemas at the router boundary ──
    //
    // Discovered 2026-05-15 smoke test (handlePOVUpdate): the MCP transport
    // path (Claude Desktop / ChatGPT → paichart-mcp → task-action-handler.js
    // → this router) does NOT route through validateMCPActionRequest. That
    // function is only called by the Next.js REST API at
    // `app/api/mcp/tasks/action/route.ts`. Without the safeParse below,
    // MCP-transport callers bypass every Zod guard (.strict(), .refine(),
    // .transform(), InjectionSafeOptional refines, DoS caps).
    //
    // Confirmation: `perform({action:'pov.update', parameters:{povId:'X',
    // title:'<script>alert(1)</script>'}})` was ACCEPTED during the deploy
    // smoke before this fix.
    //
    // This block enforces the schema for EVERY action that has one. Closes
    // the gap for all 14 actions in one place (not just pov.update).
    //
    // Double-validation note: the REST path runs validateMCPActionRequest
    // upstream, so REST traffic gets two-passes through the same schema.
    // All schema transforms (normalizeAliases, null→undefined, stripDangerousKeys)
    // are idempotent — re-running on transformed data is safe.
    // CC7 double-nest rescue (F11/F12, 2026-07-15, mcp-tool-architecture review): the
    // harness LLM occasionally wraps a structured param one level too deep —
    // parameters.parameters.interfaceContract — induced by the pov-program protocol's
    // perform(…, parameters:{…interfaceContract}) example (the model re-wraps `parameters`
    // inside itself). This is the ONLY schema layer the embedded harness path passes
    // through, and the default-strip safeParse below removes the unknown `parameters`
    // key, silently dropping the contract (child born with neither inputContext.interfaceContract
    // NOR the requiresInterfaceContract flag — observed live, program cmrlqfu610003yx1xk5ys7oyz).
    // Hoist it up BEFORE safeParse so the value survives AND still gets the schema's deep
    // dangerous-key strip + 64KB cap. No-clobber: never overwrite a correctly-placed value.
    if (
      parameters && typeof parameters === 'object' &&
      typeof (parameters as any).parameters === 'object' && (parameters as any).parameters !== null
    ) {
      const inner = (parameters as any).parameters;
      if (inner.interfaceContract !== undefined && (parameters as any).interfaceContract === undefined) {
        parameters = { ...(parameters as any), interfaceContract: inner.interfaceContract };
        log.info({ actionId, action }, 'CC7: hoisted double-nested interfaceContract before schema validation (F11)');
      }
    }

    const schema = MCPParameterSchemas[action as MCPAction];
    if (schema) {
      // BC75 sibling-drift fix (2026-07-25, found by the pov-task-lifecycle smoke test): normalize
      // user-friendly enum aliases (URGENT→HIGH, TODO→OPEN, …) BEFORE schema validation.
      //
      // The consolidated tool schema advertises URGENT as a valid priority, and two layers already
      // normalized it — the HTTP route's preNormalizeParameters and validateMCPActionRequest's
      // applySemanticMapping. Neither is on the path to THIS boundary for callers that reach the
      // router directly, so the same input was accepted by task.list and 400'd by task.update:
      // "the gate accepts URGENT and the handler rejects it", which is precisely the BC75 shape.
      // Applying it here covers EVERY action and EVERY transport, because every dispatch crosses
      // this line. Re-normalizing an already-normalized value is a no-op, so the pre-existing
      // layers stay harmless.
      if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
        const normalized: Record<string, unknown> = { ...(parameters as Record<string, unknown>) };
        for (const key of Object.keys(normalized)) {
          normalized[key] = applySemanticMapping(key, normalized[key]);
        }
        parameters = normalized;
      }
      const parsed = schema.safeParse(parameters);
      if (!parsed.success) {
        const errorDetails = parsed.error.errors
          .map(e => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
          .join('; ');
        log.warn(
          { actionId, action, userId: user.userId, errors: parsed.error.errors },
          'MCP action parameter validation failed at router boundary'
        );
        throw new Error(`${action} validation failed: ${errorDetails}`);
      }
      // Use validated/transformed data for handler dispatch.
      parameters = parsed.data;
    } else {
      // Unknown action — no schema to enforce. Let the switch hit `default`
      // which throws "Unsupported action".
      log.warn({ actionId, action }, 'no MCPParameterSchemas entry — schema enforcement skipped');
    }

    // Delegate to specialized handlers based on action
    let result;
    switch (action) {
      case 'pov.create':
        result = await handlePOVCreate(parameters, user, actionId);
        break;

      case 'pov.update':
        result = await handlePOVUpdate(parameters, user, actionId);
        break;

      case 'task.create':
        result = await handleTaskCreate(parameters, user, actionId);
        break;

      case 'task.update':
        result = await handleTaskUpdate(parameters, user, actionId);
        break;

      case 'task.assign':
        result = await handleTaskAssign(parameters, user, actionId);
        break;

      case 'task.complete':
        result = await handleTaskComplete(parameters, user, actionId);
        break;

      case 'task.comment':
        result = await handleTaskComment(parameters, user, actionId);
        break;

      case 'stage.create':
        log.info({ action: 'stage.create', parameterKeys: Object.keys(parameters || {}) }, 'routing stage.create');
        result = await handleStageCreate(parameters, user, actionId);
        break;

      case 'agent.configure':
        result = await handleAgentConfigure(parameters, user, actionId);
        break;

      case 'agent.assign':
        result = await handleAgentAssign(parameters, user, actionId);
        break;

      case 'agent.execute':
        result = await handleAgentExecute(parameters, user, actionId, routeOpts);
        break;

      case 'agent.status':
        result = await handleAgentStatus(parameters, user, actionId);
        break;

      case 'agent.results':
        result = await handleAgentResults(parameters, user, actionId);
        break;

      case 'analytics.generate':
        result = await handleAnalyticsGenerate(parameters, user, actionId);
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    // Ensure timestamp is always present (centralized, not per-handler)
    if (!result.timestamp) {
      result.timestamp = new Date().toISOString();
    }

    return result;
  }
}
