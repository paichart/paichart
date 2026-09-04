/**
 * Task Context Handler
 * Handles project.task_context action for retrieving comprehensive task information
 *
 * Extracted from sdk-native-advanced-tools.js (Phase 3.5 Task 2C - Dec 2025)
 *
 * @module TaskContextHandler
 */

const { performanceMonitor } = require('../../monitoring/performance-monitor');
const { featureFlags } = require('../../config/feature-flags');
const { smartErrorRecovery } = require('../../utils/smart-error-recovery');
const { apiClient } = require('../../utils/api-client');
const { responseFormatter } = require('../../utils/formatters');
const { ContextEnricher } = require('../../middleware/context-enricher');
const { findBestMatch, getScoredSuggestions, calculateMatchScore } = require('../../utils/fuzzy-search-helper');
const { validateCuidParam } = require('../../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.7 (sec-ops I1): AMBIGUOUS SEARCH echoes user
// taskSearchName + DB Task.title.
const { sanitizeForResponse } = require('../response-sanitizer');

// Error helpers for consistent, user-friendly error messages
const { taskNotFoundError } = require('../basic/error-helpers');

/**
 * Task Context Handler
 * Retrieves comprehensive task context including execution history
 */
class TaskContextHandler {
  /**
   * Create Task Context Handler
   * @param {Object} parent - Parent SDKNativeAdvancedTools instance
   */
  constructor(parent) {
    this.parent = parent;
    this.logger = parent.logger;
    this.parameterNormalizer = parent.parameterNormalizer;
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
   *
   * @example
   * const result = await handler.handle(
   *   { taskId: 'clxy123' },
   *   { user: { id: 'user123' } }
   * );
   */
  async handle(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_project_task_context');

    try {
      this.logger.debug('Executing SDK-native project.task_context');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Use parameter normalizer to handle variations
      const normalizedArgs = this.parameterNormalizer.normalizeForTool('project.task_context', args);
      this.logger.debug('Normalized args:', normalizedArgs);

      const {
        taskId,
        task_name,
        task_title,
        povId,
        phaseId,
        includeHistory = false,
        includeAnalytics = false,
        includeRecommendations = false,
        contextDepth = 'standard'
      } = normalizedArgs;

      // GS12 — validate every CUID parameter that was supplied. taskId is the
      // primary lookup key but povId/phaseId can also narrow the search; all
      // need to be bare CUIDs (not fetch-style "task-CUID" / "pov-CUID").
      for (const [name, value] of [['taskId', taskId], ['povId', povId], ['phaseId', phaseId]]) {
        const check = validateCuidParam(value, name, 'project', 'task.context');
        if (!check.isValid) {
          performanceMonitor.endTiming(timingId);
          return check.errorResponse;
        }
      }

      // Support both task_name and task_title as synonyms for name-based lookup
      const taskSearchName = task_name || task_title;

      let finalTaskId = taskId;

      // If task name/title is provided, look up the task by name
      if (!finalTaskId && taskSearchName) {
        this.logger.debug(`Looking up task by name: "${taskSearchName}"`);

        // Build query for task lookup with higher limit for better search coverage
        const taskQuery = { limit: '200' };
        if (povId) taskQuery.pov_id = povId;

        // Get tasks and search for matching name
        const taskData = await apiClient.get('/api/tasks', taskQuery, { userContext });
        const tasks = taskData.data || [];

        // Layer 1: Fuzzy search with minimum threshold of 100
        // This prevents garbage word-level matches (10-40 points) from winning.
        // Score 100+ means at least a substring match was found.
        const foundTask = findBestMatch(
          tasks,
          taskSearchName,
          'title',
          {
            logger: this.logger,
            ambiguityThreshold: 0.1,
            threshold: 100
          }
        );

        if (foundTask) {
          // Layer 2: Cross-POV disambiguation
          // If no povId was specified, check whether close-scoring matches exist in different POVs.
          // If so, ask the user to disambiguate rather than silently picking one.
          if (!povId) {
            const allScored = tasks
              .map(t => ({ id: t.id, title: t.title, status: t.status, povId: t.povId, score: calculateMatchScore(t.title, taskSearchName) }))
              .filter(t => t.score >= 100)
              .sort((a, b) => b.score - a.score);

            const topScore = allScored[0]?.score || 0;
            const closeMatches = allScored.filter(t => t.score >= topScore * 0.9);
            const uniquePovIds = [...new Set(closeMatches.map(t => t.povId).filter(Boolean))];

            if (uniquePovIds.length > 1) {
              // BUG-BASIC-XSS-1 Phase 2.7: sanitize taskSearchName + DB Task.title
              const safeSearch = sanitizeForResponse(taskSearchName);
              // Multiple POVs have similar-scoring matches — return disambiguation
              const disambigList = closeMatches.slice(0, 5).map(t =>
                `  \u2022 "${sanitizeForResponse(t.title)}" [${t.status || 'UNKNOWN'}] \u2014 POV: ...${(t.povId || '').slice(-8)} \u2014 ID: ${t.id}`
              );
              throw new Error(
                `\u26a0\ufe0f AMBIGUOUS TASK SEARCH: "${safeSearch}"\n\n` +
                `Found similar tasks in ${uniquePovIds.length} different POVs:\n` +
                `${disambigList.join('\n')}\n\n` +
                `\ud83d\udca1 To resolve, provide the POV context:\n` +
                `  \u2022 project(action: 'task.context', task_name: "${safeSearch}", povId: "...") \u2014 Scope to specific POV\n` +
                `  \u2022 project(action: 'task.context', taskId: "...") \u2014 Use exact task ID\n` +
                `  \u2022 project(action: 'pov.list') \u2014 Find POV IDs first`
              );
            }
          }

          finalTaskId = foundTask.id;
          this.logger.info(`Found task: "${foundTask.title}" (${foundTask.id}) for search: "${taskSearchName}"`);
        } else {
          // Layer 3: POV-scoped fallback
          // The target task may not be in the first 200 global results.
          // Search each accessible POV individually to find it.
          if (!povId) {
            this.logger.debug(`No strong match in global search for "${taskSearchName}", trying POV-scoped fallback`);

            try {
              // INTENTIONAL cost bound (NOT the fetch-to-search truncation bug — see
              // parameter-normalizer-discovery tripwire): this is a SECONDARY fallback, only
              // reached after the primary 200-task global search above misses. It does a nested
              // N×M scan (per-POV task fetches), so the POV iteration is deliberately capped at
              // 20 to bound fetch count; raising it would trigger up to 20→200 extra task fetches.
              // Edge case it doesn't cover: >200 tasks AND target in POV #21+ (rare; accepted).
              const povsData = await apiClient.get('/api/pov', { limit: '20' }, { userContext });
              const povs = povsData.data || [];

              for (const pov of povs) {
                const povTaskData = await apiClient.get('/api/tasks', { pov_id: pov.id, limit: '100' }, { userContext });
                const povTasks = povTaskData.data || [];

                const povMatch = findBestMatch(povTasks, taskSearchName, 'title', {
                  threshold: 100
                });

                if (povMatch) {
                  finalTaskId = povMatch.id;
                  this.logger.info(`Found task in POV "${pov.title}": "${povMatch.title}" (${povMatch.id})`);
                  break;
                }
              }
            } catch (fallbackError) {
              this.logger.debug(`POV-scoped fallback failed: ${fallbackError.message}`);
              // Continue to error handling below
            }
          }

          if (!finalTaskId) {
            // Get scored suggestions for helpful error using reusable helper
            const suggestions = getScoredSuggestions(tasks, taskSearchName, 'title', 3)
              .map(s => ({ title: s.title, id: s.id, status: s.status || 'UNKNOWN' }));
            throw taskNotFoundError(taskSearchName, null, suggestions);
          }
        }
      }

      // Validate that at least one ID is provided
      if (!finalTaskId && !povId && !phaseId) {
        throw new Error('At least one of taskId, task_name, povId, or phaseId must be provided');
      }

      // Step 3: Build enhanced query parameters with execution awareness
      const params = {};
      if (finalTaskId) params.taskId = finalTaskId;
      if (povId) params.povId = povId;
      if (phaseId) params.phaseId = phaseId;
      if (includeHistory) params.includeHistory = 'true';
      if (includeAnalytics) params.includeAnalytics = 'true';
      if (includeRecommendations) params.includeRecommendations = 'true';
      if (contextDepth) params.contextDepth = contextDepth;

      // Enhanced context parameters for richer data
      params.includeExecutionHistory = 'true';
      params.includeResourceContext = 'true';
      params.includePerformanceMetrics = 'true';
      params.includeRelatedResources = 'true';

      this.logger.debug('Enhanced API request params:', params);

      // Step 4: Make API call with enhanced context
      const data = await apiClient.get('/api/mcp/tasks/context', params, { userContext });

      this.logger.info('Retrieved comprehensive task context with execution history');

      // Step 5: Enhanced context processing with resource integration
      let enhancedContext = data.data;

      // Add execution-aware context enrichment
      if (enhancedContext && typeof enhancedContext === 'object') {
        try {
          enhancedContext = await this.parent.enrichTaskContextWithExecutionData(
            enhancedContext,
            finalTaskId,
            povId,
            phaseId
          );
        } catch (enrichmentError) {
          this.logger.debug('Failed to enrich task context:', enrichmentError.message);
          // Continue with original context if enrichment fails
        }
      }

      // Step 6: Format enhanced response for SDK
      const formattedText = responseFormatter.formatTaskContext(enhancedContext);

      performanceMonitor.endTiming(timingId);

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          executionAware: true,
          resourceContext: true,
          performanceMetrics: true,
          enhancement: {
            version: '2.0',
            features: ['execution_history', 'resource_context', 'performance_metrics', 'related_resources']
          },
          contextDepth: contextDepth,
          includeFlags: {
            history: includeHistory,
            analytics: includeAnalytics,
            recommendations: includeRecommendations
          },
          nextSteps: [
            "📊 Task context retrieved with analysis",
            finalTaskId ? `Update task: perform(action: 'task.update', parameters: { taskId: '${finalTaskId}', ... })` : null,
            finalTaskId ? `Assign agent: perform(action: 'agent.assign', parameters: { taskId: '${finalTaskId}', agentTemplateId: '...' })` : null,
            "Review: Dependencies, blockers, execution history above",
            "Apply insights to task modifications"
          ].filter(Boolean)
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_project_task_context', error);
      this.logger.error('project.task_context failed:', error.message);

      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'project', args);
        if (recovery.canRecover) {
          const errorMessage = this.parent.createEnhancedErrorMessage(error, recovery, 'project');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'project',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }

      return {
        content: [{ type: "text", text: `❌ Error in project: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true
        }
      };
    }
  }
}

module.exports = { TaskContextHandler };
