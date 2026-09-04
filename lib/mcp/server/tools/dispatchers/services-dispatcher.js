/**
 * Services Dispatcher
 * Routes `services` tool sub-actions to existing handlers.
 *
 * Sub-actions:
 *   discover           -> HubToolsHandler.handleDiscoverServices
 *   call               -> HubToolsHandler.handleCallService
 *   health             -> HubToolsHandler.handleGetServiceHealth
 *   workflow.execute   -> HubToolsHandler.handleExecuteWorkflow
 *   workflow.status    -> HubToolsHandler.handleGetWorkflowStatus
 *   workflow.cancel    -> HubToolsHandler.handleCancelWorkflow
 *   workflow.list      -> HubToolsHandler.handleListWorkflowExecutions
 *
 * @module ServicesDispatcher
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { validateCuidParam, normalizeCuidAliases } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize ${action} echoes in dispatch errors.
const { sanitizeForResponse } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'services-dispatcher' }));

const VALID_ACTIONS = ['discover', 'call', 'health', 'workflow.execute', 'workflow.status', 'workflow.cancel', 'workflow.list'];

// GS12 — CUID parameters this tool accepts. Validated at dispatch boundary.
// `taskId` is included for `workflow.execute` calls that target a specific task.
// `povId` added 2026-05-16 (W2 from workflow chunk review — convergent validation-engine + workflow-orchestration finding).
// services tool actions (workflow.execute, workflow.status, workflow.list) accept povId; analytics-dispatcher already
// includes it (inconsistency was a sibling-class drift hazard).
const CUID_PARAM_NAMES = ['serviceId', 'service_id', 'executionId', 'execution_id', 'taskId', 'task_id', 'povId', 'pov_id'];

class ServicesDispatcher {
  /**
   * @param {Object} hubTools - HubToolsHandler instance
   */
  constructor(hubTools) {
    this.hubTools = hubTools;
  }

  async handle(args, context) {
    // GS14 enforced upstream by `wrapWithSchema('services', ...)` at the
    // embedded-server.ts registration site (Phase 1.5, 2026-05-17). `args` is
    // already Zod-parsed; this handler doesn't need to re-validate.
    const { action, ...params } = args;

    if (!action) {
      return {
        content: [{ type: 'text', text: `❌ Missing required parameter: action\nValid actions: ${VALID_ACTIONS.join(', ')}` }],
        isError: true,
      };
    }

    if (!VALID_ACTIONS.includes(action)) {
      return {
        content: [{ type: 'text', text: `❌ Invalid action: "${sanitizeForResponse(action)}"\nValid actions: ${VALID_ACTIONS.join(', ')}` }],
        isError: true,
      };
    }

    // GS12 — validate every CUID parameter at the dispatch boundary
    for (const paramName of CUID_PARAM_NAMES) {
      const check = validateCuidParam(params[paramName], paramName, 'services', action);
      if (!check.isValid) return check.errorResponse;
    }

    // SK-PARITY (2026-05-17): normalize snake_case → camelCase so downstream
    // handlers reading only camelCase see snake-form callers' values. Closes
    // BUG-REPORT-mcp-handler-snake-case-alias-parity-sweep — the sibling-class
    // fix for C8 from the workflows bundle, applied at dispatcher layer so all
    // current and future handlers benefit without per-handler surgery.
    normalizeCuidAliases(params, CUID_PARAM_NAMES);

    log.debug({ action }, 'Dispatching services action');

    switch (action) {
      case 'discover':
        return this.hubTools.handleDiscoverServices(params, context);
      case 'call':
        return this.hubTools.handleCallService(params, context);
      case 'health':
        return this.hubTools.handleGetServiceHealth(params, context);
      case 'workflow.execute':
        return this.hubTools.handleExecuteWorkflow(params, context);
      case 'workflow.status':
        return this.hubTools.handleGetWorkflowStatus(params, context);
      case 'workflow.cancel':
        return this.hubTools.handleCancelWorkflow(params, context);
      case 'workflow.list':
        return this.hubTools.handleListWorkflowExecutions(params, context);
      default:
        return {
          content: [{ type: 'text', text: `❌ Unhandled action: "${sanitizeForResponse(action)}"` }],
          isError: true,
        };
    }
  }
}

module.exports = { ServicesDispatcher };
