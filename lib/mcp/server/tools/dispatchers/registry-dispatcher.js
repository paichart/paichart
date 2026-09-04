/**
 * Registry Dispatcher
 * Routes `registry` tool sub-actions to existing hub handlers.
 *
 * Sub-actions:
 *   register     -> HubToolsHandler.handleRegisterService
 *   list         -> HubToolsHandler.handleListMyServices
 *   update       -> HubToolsHandler.handleUpdateService
 *   delete       -> HubToolsHandler.handleDeleteService
 *   tools        -> HubToolsHandler.handleGetServiceTools
 *
 * @module RegistryDispatcher
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { validateCuidParam, normalizeCuidAliases } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize ${action} echoes in dispatch errors.
const { sanitizeForResponse } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'registry-dispatcher' }));

const VALID_ACTIONS = ['register', 'list', 'update', 'delete', 'tools'];

// GS12 — CUID parameters this tool accepts. Validated at dispatch boundary.
const CUID_PARAM_NAMES = ['serviceId', 'service_id'];

class RegistryDispatcher {
  /**
   * @param {Object} hubTools - HubToolsHandler instance
   */
  constructor(hubTools) {
    this.hubTools = hubTools;
  }

  async handle(args, context) {
    // GS14 enforced upstream by `wrapWithSchema('registry', ...)` at the
    // embedded-server.ts registration site (Phase 1.5, 2026-05-17). `args` is
    // already Zod-parsed; this handler doesn't need to re-validate.
    const { action, ...params } = args;

    if (!action) {
      return {
        content: [{ type: 'text', text: `Missing required parameter: action\nValid actions: ${VALID_ACTIONS.join(', ')}` }],
        isError: true,
      };
    }

    if (!VALID_ACTIONS.includes(action)) {
      return {
        content: [{ type: 'text', text: `Invalid action: "${sanitizeForResponse(action)}"\nValid actions: ${VALID_ACTIONS.join(', ')}` }],
        isError: true,
      };
    }

    // GS12 — validate every CUID parameter at the dispatch boundary
    for (const paramName of CUID_PARAM_NAMES) {
      const check = validateCuidParam(params[paramName], paramName, 'registry', action);
      if (!check.isValid) return check.errorResponse;
    }

    // SK-PARITY (2026-05-17): normalize snake_case → camelCase. See
    // services-dispatcher for the bug-class rationale.
    normalizeCuidAliases(params, CUID_PARAM_NAMES);

    log.debug({ action }, 'Dispatching registry action');

    switch (action) {
      case 'register':
        return this.hubTools.handleRegisterService(params, context);
      case 'list':
        return this.hubTools.handleListMyServices(params, context);
      case 'update':
        return this.hubTools.handleUpdateService(params, context);
      case 'delete':
        return this.hubTools.handleDeleteService(params, context);
      case 'tools':
        return this.hubTools.handleGetServiceTools(params, context);
      default:
        return {
          content: [{ type: 'text', text: `Unhandled action: "${sanitizeForResponse(action)}"` }],
          isError: true,
        };
    }
  }
}

module.exports = { RegistryDispatcher };
