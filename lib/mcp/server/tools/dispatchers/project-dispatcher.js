/**
 * Project Dispatcher
 * Routes `project` tool sub-actions to existing handlers.
 *
 * Sub-actions:
 *   pov.list      -> SDKNativeBasicTools.handleListPOVs
 *   pov.details   -> SDKNativeBasicTools.handleGetPOVDetails
 *   task.list     -> SDKNativeBasicTools.handleListTasks
 *   task.context  -> SDKNativeAdvancedTools.handleGetTaskContext
 *
 * @module ProjectDispatcher
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { normalizeCuidAliases } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize ${action} echoes in invalid-action +
// unhandled-action error responses.
const { sanitizeForResponse } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'project-dispatcher' }));

const VALID_ACTIONS = ['pov.list', 'pov.details', 'task.list', 'task.context'];

// SK-PARITY (2026-05-17, audit Finding #4): project-dispatcher intentionally uses
// per-handler CUID format validation rather than dispatcher-boundary validation —
// each handler validates only the CUIDs it accepts (see GS12 comments in
// sdk-native-basic-tools.handleListTasks/handleGetPOVDetails and
// task-context-handler.handle). BUT the snake_case → camelCase alias rename must
// still happen at the dispatcher boundary, otherwise callers passing pov_id /
// task_id silently lose the value when handlers destructure camelCase.
const CUID_PARAM_NAMES = ['povId', 'pov_id', 'taskId', 'task_id', 'phaseId', 'phase_id'];

class ProjectDispatcher {
  /**
   * @param {Object} basicTools - SDKNativeBasicTools instance
   * @param {Object} advancedTools - SDKNativeAdvancedTools instance
   */
  constructor(basicTools, advancedTools) {
    this.basicTools = basicTools;
    this.advancedTools = advancedTools;
  }

  async handle(args, context) {
    // GS14 enforced upstream by `wrapWithSchema('project', ...)` at the
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

    // SK-PARITY (2026-05-17): normalize snake_case → camelCase. CUID format
    // validation stays per-handler (deliberate; see CUID_PARAM_NAMES comment).
    normalizeCuidAliases(params, CUID_PARAM_NAMES);

    log.debug({ action }, 'Dispatching project action');

    switch (action) {
      case 'pov.list':
        return this.basicTools.handleListPOVs(params, context);
      case 'pov.details':
        return this.basicTools.handleGetPOVDetails(params, context);
      case 'task.list':
        return this.basicTools.handleListTasks(params, context);
      case 'task.context':
        return this.advancedTools.handleGetTaskContext(params, context);
      default:
        return {
          content: [{ type: 'text', text: `❌ Unhandled action: "${sanitizeForResponse(action)}"` }],
          isError: true,
        };
    }
  }
}

module.exports = { ProjectDispatcher };
