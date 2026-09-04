/**
 * SDK-Native Advanced Tools Implementation
 * Pure SDK implementation for advanced tools without wrapper dependencies
 * 
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 */

const { stderr, createAdapter } = require('../mcp-logger');
const { featureFlags } = require('../config/feature-flags');
const { performanceMonitor } = require('../monitoring/performance-monitor');
const { smartErrorRecovery } = require('../utils/smart-error-recovery');
const { apiClient } = require('../utils/api-client');
const { responseFormatter } = require('../utils/formatters');
const { findBestMatch, getScoredSuggestions } = require('../utils/fuzzy-search-helper');

// Database integration for elicitation
// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma } = require('../../../prisma');

// Enhanced with Parameter Normalizer for robust parameter handling
const { SDKParameterNormalizer } = require('../utils/parameter-normalizer');

// P0-2 FIX: Context Enricher for per-request user context
const { ContextEnricher } = require('../middleware/context-enricher');

// Analytics modules (extracted Phase 3.5 Task 2B - Dec 2025)
const { TeamPerformanceHandler } = require('./advanced/analytics/team-performance-handler');
const { AnalyticsHelpers } = require('./advanced/analytics/analytics-helpers');
const { ElicitationPromptsGenerator } = require('./advanced/analytics/elicitation-prompts-generator');
const { AnalyticsFormatters } = require('./advanced/analytics/analytics-formatters');

// Handler modules (extracted Phase 3.5 Task 2C - Dec 2025)
const { AIRecommendationsHandler } = require('./advanced/ai-recommendations-handler');
const { TaskContextHandler } = require('./advanced/task-context-handler');
const { AgentResultsHandler } = require('./advanced/agent-results-handler');
const { TaskActionHandler } = require('./advanced/task-action-handler');

/**
 * SDK-Native Advanced Tools Handler
 *
 * Provides advanced MCP tools for task management, agent analytics, AI recommendations,
 * and team performance analysis. Uses modular architecture with extracted analytics.
 *
 * @class SDKNativeAdvancedTools
 * @description Pure SDK implementation without wrapper dependencies. Includes:
 *   - Task context and action execution
 *   - Agent results and analytics
 *   - AI-powered recommendations
 *   - Team performance analysis with intelligent prompts
 *
 * @example
 * const tools = new SDKNativeAdvancedTools(server, normalizer);
 * await tools.handleGetTaskContext({ taskId: 'cuid123' }, context);
 */
class SDKNativeAdvancedTools {
  /**
   * Creates SDK-Native Advanced Tools handler
   *
   * @param {Object} [server=null] - MCP SDK server instance (optional for standalone use)
   * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Optional shared parameter normalizer
   * @description Initializes tool handlers, analytics modules, and parameter normalization.
   *   If server not provided, tools can still be used in standalone mode (e.g., for analytics).
   *   If sharedNormalizer not provided, creates its own instance.
   */
  constructor(server = null, sharedNormalizer = null) {
    this.server = server;
    this.logger = this.createLogger();
    this.toolHandlers = new Map();
    // Use shared normalizer if provided, otherwise create own instance
    this.parameterNormalizer = sharedNormalizer || new SDKParameterNormalizer();

    // Initialize analytics modules (Phase 3.5 Task 2B - Dec 2025)
    this.analyticsHelpers = new AnalyticsHelpers(this.logger);
    this.elicitationPromptsGenerator = new ElicitationPromptsGenerator(this.logger);
    this.analyticsFormatters = new AnalyticsFormatters(this, this.logger);
    this.teamPerformanceHandler = new TeamPerformanceHandler(this);

    // Initialize handler modules (Phase 3.5 Task 2C - Dec 2025)
    this.aiRecommendationsHandler = new AIRecommendationsHandler(this);
    this.taskContextHandler = new TaskContextHandler(this);
    this.agentResultsHandler = new AgentResultsHandler(this);
    this.taskActionHandler = new TaskActionHandler(this);

    this.setupToolHandlers();
    this.logger.info('Initialized with pure SDK implementation');
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'sdk-native-advanced' }));
  }

  /**
   * Setup SDK-native tool handlers
   */
  setupToolHandlers() {
    // Consolidated tool handlers (Mar 2026: legacy names → consolidated tool.action)
    this.toolHandlers.set('project.task_context', this.handleGetTaskContext.bind(this));
    this.toolHandlers.set('perform', this.handleExecuteTaskAction.bind(this));
    this.toolHandlers.set('perform.agent_results', this.handleAgentResults.bind(this));
    // ARCH-ANALYTICS-4 deletion (2026-05-22): the 'analytics.recommendations'
    // + 'analytics.team_performance' Map entries used a legacy naming
    // convention that diverged from the dispatcher's canonical
    // 'recommendations.get' / 'team.performance'. Verified zero get()
    // consumers — analytics-dispatcher calls handleGetAIRecommendations +
    // handleAnalyzeTeamPerformance DIRECTLY via this.advancedTools.* (NOT
    // through the Map). Per [[feedback_defend_vs_delete_dead_code]]:
    // delete > defend when zero callers.

    this.logger.info('Setup SDK-native handlers for 3 advanced tools (project, perform)');
  }

  /**
   * Register tools with SDK server
   * @param {Object} server - SDK server instance
   */
  registerTools(server) {
    this.server = server;
    
    // Register each tool handler
    for (const [toolName, handler] of this.toolHandlers) {
      this.logger.debug(`Registering SDK-native advanced tool: ${toolName}`);
    }
    
    this.logger.info('Registered 5 SDK-native advanced tools');
  }

  /**
   * Handle project.task_context action - Retrieves comprehensive task context
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.taskId] - Task CUID (optional if task_name provided)
   * @param {string} [args.task_name] - Task name for lookup (optional if taskId provided)
   * @param {string} [args.povId] - POV CUID to scope search (optional)
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with task context
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata (tool name, timestamp)
   *
   * @description Fetches task details including description, status, assignees, dependencies,
   *   and execution history. Enriches with execution data when available.
   *   Delegates to TaskContextHandler (extracted module).
   *
   * @example
   * const result = await tools.handleGetTaskContext(
   *   { taskId: 'clxy123' },
   *   { user: { id: 'user123' } }
   * );
   */
  async handleGetTaskContext(args, context) {
    return this.taskContextHandler.handle(args, context);
  }

  /**
   * Handle perform tool - Executes actions on tasks
   *
   * @param {Object} args - Tool arguments
   * @param {string} args.taskId - Task CUID to act upon
   * @param {string} args.action - Action to execute (update_status, assign, add_dependency, etc.)
   * @param {Object} [args.parameters] - Action-specific parameters
   * @param {Object} context - User authentication context
   *
   * @returns {Promise<Object>} MCP response with action result
   * @returns {Array<Object>} returns.content - Response content with action confirmation
   * @returns {boolean} returns.isError - Whether action failed
   *
   * @description Executes various task actions via API client. Enriches results with
   *   resource context when available. Supports smart error recovery.
   *   Delegates to TaskActionHandler (extracted module).
   */
  async handleExecuteTaskAction(args, context) {
    return this.taskActionHandler.handle(args, context);
  }

  /**
   * Handle perform.agent_results action - Retrieves agent execution results
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.executionId] - Specific execution CUID
   * @param {string} [args.taskId] - Task CUID to get executions for
   * @param {string} [args.agentTemplate] - Filter by agent template
   * @param {number} [args.limit=10] - Maximum results to return
   * @param {Object} context - User authentication context
   *
   * @returns {Promise<Object>} MCP response with agent results
   * @returns {Array<Object>} returns.content - Formatted execution results
   * @returns {boolean} returns.isError - Whether request failed
   *
   * @description Dedicated tool for retrieving agent execution results and artifacts.
   *   Includes Phase 5 enhancements: structured output, resource links, elicitation prompts.
   *   Delegates to AgentResultsHandler (extracted module).
   *
   * @example
   * const result = await tools.handleAgentResults(
   *   { taskId: 'clxy123', limit: 5 },
   *   { user: { id: 'user123' } }
   * );
   */
  async handleAgentResults(args, context) {
    return this.agentResultsHandler.handle(args, context);
  }

  /**
   * Handle analytics.recommendations action - Generates AI-powered recommendations
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.taskId] - Task CUID to get recommendations for
   * @param {string} [args.povId] - POV CUID to scope recommendations
   * @param {string} [args.phaseId] - Phase CUID to scope recommendations
   * @param {string} [args.type] - Recommendation type filter (OPTIMIZATION, RISK, etc.)
   * @param {string} [args.impact] - Impact level filter (HIGH, MEDIUM, LOW)
   * @param {number} [args.limit=50] - Maximum number of recommendations to return
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} MCP response with AI recommendations
   * @returns {Array<Object>} returns.content - Formatted recommendation list
   * @returns {boolean} returns.isError - Whether request failed
   * @returns {Object} returns._meta - Metadata (tool name, count, filters)
   *
   * @description Generates actionable AI recommendations for tasks, POVs, or phases.
   *   Supports filtering by type (optimization, risk, improvement) and impact level.
   *   Delegates to AIRecommendationsHandler (extracted module).
   *
   * @example
   * const result = await tools.handleGetAIRecommendations(
   *   { povId: 'clxy123', type: 'OPTIMIZATION', limit: 10 },
   *   { user: { id: 'user123' } }
   * );
   *
   * @throws {Error} If API request fails or user not authenticated
   */
  async handleGetAIRecommendations(args, context) {
    return this.aiRecommendationsHandler.handle(args, context);
  }

  /**
   * Handle analytics.team_performance action - Analyzes team performance metrics
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.timeframe='30d'] - Analysis timeframe (7d, 30d, 90d, all)
   * @param {string} [args.povId] - POV CUID to scope analysis
   * @param {string} [args.teamId] - Team CUID to analyze
   * @param {boolean} [args.includeIndividual=false] - Include individual member stats
   * @param {boolean} [args.includeTrends=true] - Include performance trends
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} MCP response with team performance analysis
   * @returns {Array<Object>} returns.content - Formatted performance metrics
   * @returns {boolean} returns.isError - Whether analysis failed
   * @returns {Object} returns._meta - Metadata (tool name, timeframe, metrics)
   *
   * @description Analyzes team performance with velocity, completion rate, quality scores,
   *   and trend analysis. Delegates to TeamPerformanceHandler (extracted module).
   *
   * @example
   * const result = await tools.handleAnalyzeTeamPerformance(
   *   { timeframe: '30d', povId: 'clxy123', includeTrends: true },
   *   { user: { id: 'user123' } }
   * );
   */
  async handleAnalyzeTeamPerformance(args, context) {
    return this.teamPerformanceHandler.handle(args, context);
  }

  /**
   * Helper method delegations (extracted Phase 3.5 Task 2B - Dec 2025)
   */
  convertTimeframeToDays(timeframe) {
    return this.analyticsHelpers.convertTimeframeToDays(timeframe);
  }

  createEnhancedErrorMessage(error, recovery, toolName) {
    return this.analyticsHelpers.createEnhancedErrorMessage(error, recovery, toolName);
  }

  getToolSpecificGuidance(toolName) {
    return this.analyticsHelpers.getToolSpecificGuidance(toolName);
  }

  /**
   * Get tool handler for a specific tool
   */
  getToolHandler(toolName) {
    return this.toolHandlers.get(toolName);
  }

  /**
   * Get performance metrics for SDK-native advanced tools
   */
  getPerformanceMetrics() {
    return performanceMonitor.getSummary();
  }


  /**
   * Analytics method delegations (extracted Phase 3.5 Task 2B - Dec 2025)
   */

  // Elicitation Prompts Generator delegations
  async generatePerformanceElicitationPrompts(executions) {
    return this.elicitationPromptsGenerator.generatePerformanceElicitationPrompts(executions);
  }

  async generateCategoryComparativePrompts(executions) {
    return this.elicitationPromptsGenerator.generateCategoryComparativePrompts(executions);
  }

  /**
   * Artifact-aware elicitation prompts (Apr 2026)
   *
   * Replaces the previous placeholder stub. Delegates to the
   * ElicitationPromptsGenerator which inspects each execution's result.json
   * for confidence score and artifact size, then emits prompts that point at
   * bounded-confidence investigation, escalation diagnostics, or large-
   * deliverable summarisation.
   *
   * @param {Array<Object>} executions - Agent execution records (raw shape)
   */
  async generateArtifactElicitationPrompts(executions) {
    return this.elicitationPromptsGenerator.generateArtifactElicitationPrompts(executions);
  }

  async generateDatabaseContextSuggestions(executions) {
    return this.elicitationPromptsGenerator.generateDatabaseContextSuggestions(executions);
  }

  // Analytics Formatters delegations
  async formatPhase5AgentResults(data, format, options) {
    return this.analyticsFormatters.formatPhase5AgentResults(data, format, options);
  }

  async generateStructuredOutput(data, options) {
    return this.analyticsFormatters.generateStructuredOutput(data, options);
  }

  async generateResourceLinks(data, options) {
    return this.analyticsFormatters.generateResourceLinks(data, options);
  }

  async generateElicitationPrompts(data, options) {
    return this.analyticsFormatters.generateElicitationPrompts(data, options);
  }

  async generateCrossExecutionAnalytics(data, options) {
    return this.analyticsFormatters.generateCrossExecutionAnalytics(data, options);
  }

  combinePhase5Enhancements(baseText, enhancements) {
    return this.analyticsFormatters.combinePhase5Enhancements(baseText, enhancements);
  }

  // Phase 5 Enhancement delegations (placeholder methods kept)
  async enhanceActionResultWithResourceContext(result, action, parameters) {
    // Placeholder - not yet extracted to module
    return result;
  }

  async enrichTaskContextWithExecutionData(context, taskId, povId, phaseId) {
    // Placeholder - not yet extracted to module
    return context;
  }

  // Placeholder helper block deleted 2026-07-17 (advertised-vs-enforced sweep follow-up):
  // 9 zero-caller stubs returning fabricated metrics ({averageTime:0, successRate:0},
  // {trend:'stable'}, ...) — dead code, and a false-fact landmine had anything ever
  // consumed them. The two no-op pass-throughs above KEEP their live callers
  // (task-action-handler.js:491, task-context-handler.js:248).
}

module.exports = { SDKNativeAdvancedTools };
