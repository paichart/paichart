/**
 * Template Dispatcher
 * Routes `template` tool sub-actions to existing handlers.
 *
 * Sub-actions:
 *   list     -> SDKNativeBasicTools.handleListAgentTemplates
 *   details  -> SDKNativeBasicTools.handleGetAgentTemplateDetails
 *
 * @module TemplateDispatcher
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { validateCuidParam, normalizeCuidAliases } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize ${action} echoes in dispatch errors.
const { sanitizeForResponse } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'template-dispatcher' }));

const VALID_ACTIONS = ['list', 'details'];

// GS12 — CUID parameters this tool accepts. Validated at dispatch boundary.
const CUID_PARAM_NAMES = ['templateId', 'template_id', 'agentTemplateId', 'agent_template_id'];

class TemplateDispatcher {
  /**
   * @param {Object} basicTools - SDKNativeBasicTools instance
   */
  constructor(basicTools) {
    this.basicTools = basicTools;
  }

  async handle(args, context) {
    // GS14 enforced upstream by `wrapWithSchema('template', ...)` at the
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
      const check = validateCuidParam(params[paramName], paramName, 'template', action);
      if (!check.isValid) return check.errorResponse;
    }

    // SK-PARITY (2026-05-17): normalize snake_case → camelCase. See
    // services-dispatcher for the bug-class rationale.
    normalizeCuidAliases(params, CUID_PARAM_NAMES);

    log.debug({ action }, 'Dispatching template action');

    switch (action) {
      case 'list':
        return this.basicTools.handleListAgentTemplates(params, context);
      case 'details':
        return this.basicTools.handleGetAgentTemplateDetails(params, context);
      default:
        return {
          content: [{ type: 'text', text: `❌ Unhandled action: "${sanitizeForResponse(action)}"` }],
          isError: true,
        };
    }
  }
}

module.exports = { TemplateDispatcher };
