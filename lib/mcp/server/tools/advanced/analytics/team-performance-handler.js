/**
 * Team Performance Handler
 *
 * Main handler for analytics.team_performance action with orchestration of
 * analytics formatters and elicitation prompt generation.
 *
 * @module team-performance-handler
 * @version 1.0.0
 * @extracted Phase 3.5 Task 2B (Dec 2025) from sdk-native-advanced-tools.js
 *
 * @description Provides team performance analytics functionality:
 *   - Team performance analytics generation
 *   - Timeframe-based filtering (7d, 30d, 90d, 1y)
 *   - Smart error recovery with suggestions
 *   - Performance monitoring integration
 *   - Context enrichment for per-request user context
 */

const { featureFlags } = require('../../../config/feature-flags');
const { performanceMonitor } = require('../../../monitoring/performance-monitor');
const { smartErrorRecovery } = require('../../../utils/smart-error-recovery');
const { apiClient } = require('../../../utils/api-client');
const { responseFormatter } = require('../../../utils/formatters');
const { ContextEnricher } = require('../../../middleware/context-enricher');
const { AnalyticsHelpers } = require('./analytics-helpers');
const { buildTokenPayload } = require('../../../utils/build-token-payload');
const { sanitizeForResponse } = require('../../response-sanitizer');

// Direct router bridge — loads only in ts-node processes (paichart-web / embedded server).
let routeAction;
try {
  const bridge = require('../../../../tasks/action/router-bridge');
  routeAction = bridge.routeAction;
} catch (e) {
  // Expected in paichart-mcp (no ts-node). Authenticated HTTP fallback will be used.
}

/**
 * Team Performance Analytics Handler
 *
 * @class TeamPerformanceHandler
 * @description Handles team performance analysis with timeframe filtering and formatting.
 */
class TeamPerformanceHandler {
  /**
   * Creates Team Performance Handler
   *
   * @param {Object} toolsInstance - Parent tools instance (SDKNativeAdvancedTools)
   * @param {Object} toolsInstance.logger - Logger instance for debugging
   *
   * @description Initializes handler with reference to parent tools instance
   *   for shared dependencies (logger, formatters, etc.).
   */
  constructor(toolsInstance) {
    // Store reference to parent tools instance for shared dependencies
    this.toolsInstance = toolsInstance;
    this.logger = toolsInstance.logger;

    // Initialize helpers
    this.helpers = new AnalyticsHelpers(this.logger);
  }

  /**
   * Handle analytics.team_performance action execution
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.timeframe='30d'] - Analysis timeframe (7d, 30d, 90d, 1y)
   * @param {string} [args.teamId] - Team CUID to analyze
   * @param {string} [args.povId] - POV CUID to scope analysis
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} MCP response with team analytics
   * @returns {Array<Object>} returns.content - Formatted analytics text
   * @returns {boolean} returns.isError - Whether request failed
   * @returns {Object} returns._meta - Metadata (timeframe, filters, etc.)
   *
   * @description Generates team performance analytics via API, applies smart error
   *   recovery if enabled, and formats results for MCP response.
   *
   * @example
   * const result = await handler.handle(
   *   { timeframe: '30d', povId: 'clxy123' },
   *   { user: { id: 'user123' } }
   * );
   *
   * @throws {Error} If API request fails or user not authenticated
   */
  async handle(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_analytics_team_performance');

    try {
      this.logger.debug('Executing SDK-native analytics.team_performance');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Jan Marshal's Simple & Reliable Approach - Direct parameter usage
      // No complex normalization needed - direct parameter extraction
      const { timeframe = '30d', teamId, povId } = args;

      this.logger.debug(`Analyzing team performance for timeframe: ${timeframe}`);

      // Step 3: Convert timeframe to days
      const timeframeDays = this.helpers.convertTimeframeToDays(timeframe);

      // When scoped to a specific POV, show all-time task stats (not just recent).
      // The 30-day default is useful for cross-POV team analysis, but excludes
      // older tasks when drilling into a single POV — causing misleading 0% results.
      const apiParameters = {
        analysisType: 'performance',
        filters: {
          timeframeDays: povId ? undefined : timeframeDays,
          teamId: teamId,
          povId: povId
        }
      };

      // Three-tier dispatch: direct → authenticated HTTP → fail-closed
      let actionData;
      const actionId = `mcp-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (routeAction) {
        // TIER 1 — Direct call
        const tokenPayload = buildTokenPayload(enrichedContext);
        const result = await routeAction('analytics.generate', apiParameters, tokenPayload, actionId);
        actionData = { data: result };
      } else if (userContext?.userId) {
        // TIER 2 — Authenticated HTTP (U2 Phase D site #10, 2026-05-19:
        // condition switched from .token to .userId — token field dropped
        // post-Phase-D; api-client.js mints per-call. KEEP Tier 2 per
        // sec-ops Option a.)
        actionData = await apiClient.post('/api/mcp/tasks/action', {
          action: 'analytics.generate',
          parameters: apiParameters
        }, { userContext });
      } else {
        // TIER 3 — Fail closed
        throw new Error('Authentication required: No direct handler and no authenticated user available');
      }

      this.logger.info(`Generated team performance analytics for ${timeframe}`);

      // Step 5: Extract analytics data
      const analyticsData = actionData.data?.result?.data || {};

      // Step 6: Format response for SDK
      const formattedText = responseFormatter.formatTeamAnalytics(analyticsData);

      performanceMonitor.endTiming(timingId);

      // Dec 2025 UX Assessment Fix 4: Add context-aware nextSteps
      const nextSteps = [
        `Team performance analysis complete${povId ? ' (all-time, POV-scoped)' : ` for ${timeframe}`}`,
        povId
          ? `Get recommendations: analytics(action: 'recommendations.get', povId: '${povId}', type: 'RESOURCE_ALLOCATION')`
          : `Get recommendations: analytics(action: 'recommendations.get', type: 'RESOURCE_ALLOCATION')`,
        `View blocked tasks: project(action: 'task.list', status: 'BLOCKED')`,
        `Compare periods: analytics(action: 'team.performance', timeframe: '90d')`,
        teamId
          ? `View team tasks: project(action: 'task.list', teamId: '${teamId}')`
          : null
      ].filter(Boolean);

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'analytics',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          timeframe: timeframe,
          timeframeDays: timeframeDays,
          filters: { teamId, povId },
          nextSteps: nextSteps
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_analytics_team_performance', error);
      this.logger.error('analytics.team_performance failed:', error.message);

      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'analytics', args);
        if (recovery.canRecover) {
          const errorMessage = this.helpers.createEnhancedErrorMessage(error, recovery, 'analytics');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'analytics',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }

      return {
        // sec-ops MEDIUM-1 (2026-05-22): error.message may wrap user-supplied
        // param fragments via Zod messages or smart-error-recovery analyzer.
        // BC71 sweep continuation.
        content: [{ type: "text", text: `❌ Error in analytics: ${sanitizeForResponse(error.message)}` }],
        isError: true,
        _meta: {
          tool: 'analytics',
          timestamp: new Date().toISOString(),
          sdkNative: true
        }
      };
    }
  }
}

module.exports = { TeamPerformanceHandler };
