/**
 * AI Recommendations Handler
 * Handles analytics.recommendations action for generating AI-powered task recommendations
 *
 * Extracted from sdk-native-advanced-tools.js (Phase 3.5 Task 2C - Dec 2025)
 *
 * @module AIRecommendationsHandler
 */

const { performanceMonitor } = require('../../monitoring/performance-monitor');
const { featureFlags } = require('../../config/feature-flags');
const { smartErrorRecovery } = require('../../utils/smart-error-recovery');
const { apiClient } = require('../../utils/api-client');
const { responseFormatter } = require('../../utils/formatters');
const { ContextEnricher } = require('../../middleware/context-enricher');
const { sanitizeForResponse } = require('../response-sanitizer');

/**
 * AI Recommendations Handler
 * Generates AI-powered recommendations for tasks, POVs, and phases
 */
class AIRecommendationsHandler {
  /**
   * Create AI Recommendations Handler
   * @param {Object} parent - Parent SDKNativeAdvancedTools instance
   */
  constructor(parent) {
    this.parent = parent;
    this.logger = parent.logger;
  }

  /**
   * Handle analytics.recommendations action - Generates AI-powered recommendations
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.taskId] - Task CUID to get recommendations for
   * @param {string} [args.povId] - POV CUID to scope recommendations
   * @param {string} [args.phaseId] - Phase CUID to scope recommendations
   * @param {string} [args.type] - Recommendation type (OPTIMIZATION, RISK, EFFICIENCY, etc.)
   * @param {string} [args.impact] - Impact level filter (HIGH, MEDIUM, LOW)
   * @param {number} [args.limit=50] - Maximum number of recommendations
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} MCP response with AI recommendations
   * @returns {Array<Object>} returns.content - Formatted recommendations
   * @returns {boolean} returns.isError - Whether request failed
   * @returns {Object} returns._meta - Metadata (tool name, filters, count)
   *
   * @description Generates AI-powered recommendations for optimization, risk mitigation,
   *   efficiency improvements, and workflow enhancements. Uses API client for backend analysis.
   *
   * @example
   * const result = await handler.handle(
   *   { povId: 'clxy123', type: 'OPTIMIZATION', limit: 10 },
   *   { user: { id: 'user123' } }
   * );
   *
   * @throws {Error} If API request fails or user not authenticated
   */
  async handle(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_analytics_recommendations');

    try {
      this.logger.debug('Executing SDK-native analytics.recommendations');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Jan Marshal's Simple & Reliable Approach - Direct parameter usage
      // No complex normalization needed - direct parameter extraction
      // 2026-05-23 SEC-LOW-1 (task #206): dispatch-boundary type-coerce on
      // limit. Pre-fix: `limit.toString()` at L84 happily produces
      // "[object Object]" for objects, "abc" for strings, etc., then ships
      // to REST. Coerce + clamp to a sane integer range here.
      const { taskId, povId, phaseId, type, impact } = args;
      const rawLimit = args.limit;
      const limitNum = Number(rawLimit);
      const limit = Number.isFinite(limitNum) && limitNum > 0 && limitNum <= 200
        ? Math.floor(limitNum)
        : 50;

      this.logger.debug('Generating AI recommendations');

      // Step 3: Build query parameters
      const params = {};
      if (taskId) params.taskId = taskId;
      if (povId) params.povId = povId;
      if (phaseId) params.phaseId = phaseId;
      if (type) params.type = type;
      if (impact) params.impact = impact;
      if (limit) params.limit = limit.toString();

      this.logger.debug('API request params:', params);

      // Step 4: Make API call
      const data = await apiClient.get('/api/mcp/tasks/recommendations', params, { userContext });

      this.logger.info(`Generated ${data.data?.recommendations?.length || 0} AI recommendations`);

      // Step 5: Format response for SDK
      const formattedText = responseFormatter.formatRecommendations(data.data);

      performanceMonitor.endTiming(timingId);

      // P2: Add action-oriented nextSteps
      const recommendationCount = data.data?.recommendations?.length || 0;
      const nextStepsGuidance = recommendationCount > 0
        ? [
            `Found ${recommendationCount} AI recommendation${recommendationCount === 1 ? '' : 's'}`,
            "Apply recommendations using perform",
            "Example: perform(action: 'task.update', parameters: { taskId: '...', ...recommendation })",
            "Or: Get more detailed task analysis with project(action: 'task.context')"
          ]
        : [
            "No recommendations found for current filters",
            "Try: Broaden search (remove type/impact filters)",
            "Or: Check different POV/task scope"
          ];

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'analytics',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          recommendationCount,
          filters: { type, impact, limit },
          nextSteps: nextStepsGuidance
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_analytics_recommendations', error);
      this.logger.error('analytics.recommendations failed:', error.message);

      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'analytics', args);
        if (recovery.canRecover) {
          const errorMessage = this.parent.createEnhancedErrorMessage(error, recovery, 'analytics');
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
        // sec-ops MEDIUM-1 (2026-05-22): same pattern as team-performance-handler.js
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

module.exports = { AIRecommendationsHandler };
