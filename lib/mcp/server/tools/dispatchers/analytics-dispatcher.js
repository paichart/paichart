/**
 * Analytics Dispatcher
 * Routes `analytics` tool sub-actions to existing handlers.
 *
 * Sub-actions:
 *   recommendations.get  -> SDKNativeAdvancedTools.handleGetAIRecommendations
 *   team.performance     -> SDKNativeAdvancedTools.handleAnalyzeTeamPerformance
 *
 * @module AnalyticsDispatcher
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { validateCuidParam, normalizeCuidAliases } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize ${action} echoes in dispatch errors.
const { sanitizeForResponse } = require('../response-sanitizer');
// round 3 Probe B (2026-05-26): per-user throttle on the expensive analytics path
// (recommendations.get → 9-query generator). The MCP tool dispatch had no
// per-user limit; mirrors the writeOperationLimiter pattern in task-action-handler.
const { analyticsReadLimiter } = require('../../../../utils/rate-limiter');
const log = createAdapter(stderr.mcpLogger.child({ component: 'analytics-dispatcher' }));

const VALID_ACTIONS = ['recommendations.get', 'team.performance'];

// GS12 — CUID parameters this tool accepts. Validated at dispatch boundary
// so every analytics action gets the same prefix-strip recovery as project / perform.
const CUID_PARAM_NAMES = ['povId', 'pov_id', 'taskId', 'task_id', 'teamId', 'team_id'];

class AnalyticsDispatcher {
  /**
   * @param {Object} advancedTools - SDKNativeAdvancedTools instance
   */
  constructor(advancedTools) {
    this.advancedTools = advancedTools;
  }

  async handle(args, context) {
    // GS14 enforced upstream by `wrapWithSchema('analytics', ...)` at the
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

    // round 3 Probe B: per-user rate limit on the expensive analytics path.
    const userId = context?.user?.userId || context?.user?.id || context?.userId || 'anonymous';
    const allowed = await analyticsReadLimiter.checkLimit(`analytics:${userId}`);
    if (!allowed) {
      const resetTime = analyticsReadLimiter.getResetTime(`analytics:${userId}`);
      return {
        content: [{ type: 'text', text: `❌ Rate limit exceeded: analytics is limited to 30 requests/minute per user. Try again after ${resetTime.toISOString()}.` }],
        isError: true,
      };
    }

    // GS12 — validate every CUID parameter at the dispatch boundary
    for (const paramName of CUID_PARAM_NAMES) {
      const check = validateCuidParam(params[paramName], paramName, 'analytics', action);
      if (!check.isValid) return check.errorResponse;
    }

    // SK-PARITY (2026-05-17): normalize snake_case → camelCase. See
    // services-dispatcher for the bug-class rationale.
    normalizeCuidAliases(params, CUID_PARAM_NAMES);

    log.debug({ action }, 'Dispatching analytics action');

    switch (action) {
      case 'recommendations.get':
        return this.advancedTools.handleGetAIRecommendations(params, context);
      case 'team.performance':
        return this.advancedTools.handleAnalyzeTeamPerformance(params, context);
      default:
        return {
          content: [{ type: 'text', text: `❌ Unhandled action: "${sanitizeForResponse(action)}"` }],
          isError: true,
        };
    }
  }
}

module.exports = { AnalyticsDispatcher };
