/**
 * Agent Results Handler
 * Handles perform.agent_results action for retrieving agent execution results and artifacts
 *
 * Extracted from sdk-native-advanced-tools.js (Phase 3.5 Task 2C - Dec 2025)
 *
 * @module AgentResultsHandler
 */

const { performanceMonitor } = require('../../monitoring/performance-monitor');
const { featureFlags } = require('../../config/feature-flags');
const { smartErrorRecovery } = require('../../utils/smart-error-recovery');
const { apiClient } = require('../../utils/api-client');
const { capText } = require('../cap-text');
const { ContextEnricher } = require('../../middleware/context-enricher');
// BUG-BASIC-XSS-1 Phase 2.7 (sec-ops I1): AMBIGUOUS SEARCH echoes task_name + DB Task.title
const { sanitizeForResponse } = require('../response-sanitizer');
const { findBestMatch, getScoredSuggestions, calculateMatchScore } = require('../../utils/fuzzy-search-helper');
const { buildTokenPayload } = require('../../utils/build-token-payload');
const { leanFactsLine, appendFactsLine } = require('./lean-card-facts');

// Direct router bridge — loads only in ts-node processes (paichart-web / embedded server).
let routeAction;
try {
  const bridge = require('../../../tasks/action/router-bridge');
  routeAction = bridge.routeAction;
} catch (e) {
  // Expected in paichart-mcp (no ts-node). Authenticated HTTP fallback will be used.
}

// Error helpers for consistent, user-friendly error messages
const { agentExecutionNotFoundError } = require('./error-helpers');
const { taskNotFoundError } = require('../basic/error-helpers');

/**
 * Agent Results Handler
 * Retrieves agent execution results with Phase 5 enhancements
 */
class AgentResultsHandler {
  /**
   * Create Agent Results Handler
   * @param {Object} parent - Parent SDKNativeAdvancedTools instance
   */
  constructor(parent) {
    this.parent = parent;
    this.logger = parent.logger;
    this.parameterNormalizer = parent.parameterNormalizer;
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
   *
   * @example
   * const result = await handler.handle(
   *   { taskId: 'clxy123', limit: 5 },
   *   { user: { id: 'user123' } }
   * );
   */
  async handle(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_perform_agent_results');

    try {
      this.logger.debug('Executing SDK-native perform.agent_results with database integration');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Use parameter normalizer to handle variations
      const normalizedArgs = this.parameterNormalizer.normalizeForTool('perform.agent_results', args);
      this.logger.debug('Normalized args:', normalizedArgs);

      // Enhanced parameter handling with new options
      const {
        taskId,
        task_name,
        povId,
        executionId,
        includeOutput = true,
        includeMetrics = true,
        includeAll = false,
        includeArtifacts = true,
        includeTemplateAnalysis = true,
        includePerformanceComparison = false,
        timeRange = '7d',
        format = 'summary', // 'summary' (default, safe for all clients), 'detailed', 'raw'
        verbose = false,     // true = bypass size cap and return full output inline
        limit = 1
      } = normalizedArgs;

      let finalTaskId = taskId;

      // If task_name is provided, look up the task by name (same pattern as project.task_context)
      if (!finalTaskId && task_name) {
        this.logger.debug(`Looking up task by name: "${task_name}"`);

        // Build query for task lookup with higher limit for better search coverage
        const taskQuery = { limit: '200' };
        if (povId) taskQuery.pov_id = povId;

        // Get tasks and search for matching name
        const taskData = await apiClient.get('/api/tasks', taskQuery, { userContext });
        const tasks = taskData.data || [];

        // Threshold 100: require at least a substring match (prevents cross-POV garbage matches)
        const foundTask = findBestMatch(
          tasks,
          task_name,
          'title',
          {
            logger: this.logger,
            ambiguityThreshold: 0.1,
            threshold: 100
          }
        );

        if (foundTask) {
          // Cross-POV disambiguation (same pattern as project.task_context)
          if (!povId) {
            const allScored = tasks
              .map(t => ({ id: t.id, title: t.title, povId: t.povId, score: calculateMatchScore(t.title, task_name) }))
              .filter(t => t.score >= 100)
              .sort((a, b) => b.score - a.score);

            const topScore = allScored[0]?.score || 0;
            const closeMatches = allScored.filter(t => t.score >= topScore * 0.9);
            const uniquePovIds = [...new Set(closeMatches.map(t => t.povId).filter(Boolean))];

            if (uniquePovIds.length > 1) {
              // BUG-BASIC-XSS-1 Phase 2.7: sanitize task_name + DB Task.title
              const safeName = sanitizeForResponse(task_name);
              const disambigList = closeMatches.slice(0, 5).map(t =>
                `  \u2022 "${sanitizeForResponse(t.title)}" \u2014 POV: ...${(t.povId || '').slice(-8)} \u2014 ID: ${t.id}`
              );
              throw new Error(
                `\u26a0\ufe0f AMBIGUOUS TASK SEARCH: "${safeName}"\n\n` +
                `Found similar tasks in ${uniquePovIds.length} POVs:\n` +
                `${disambigList.join('\n')}\n\n` +
                `\ud83d\udca1 Provide povId to scope the search:\n` +
                `  \u2022 perform(action: 'agent.results', task_name: "${safeName}", povId: "...") \u2014 Scope to specific POV\n` +
                `  \u2022 perform(action: 'agent.results', taskId: "...") \u2014 Use exact task ID`
              );
            }
          }

          finalTaskId = foundTask.id;
          this.logger.info(`Found task: "${foundTask.title}" (${foundTask.id}) for search: "${task_name}"`);
        } else {
          // POV-scoped fallback: target task may not be in first 200 global results
          if (!povId) {
            this.logger.debug(`No strong match in global search for "${task_name}", trying POV-scoped fallback`);
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
                const povMatch = findBestMatch(povTasks, task_name, 'title', { threshold: 100 });
                if (povMatch) {
                  finalTaskId = povMatch.id;
                  this.logger.info(`Found task in POV "${pov.title}": "${povMatch.title}" (${povMatch.id})`);
                  break;
                }
              }
            } catch (fallbackError) {
              this.logger.debug(`POV-scoped fallback failed: ${fallbackError.message}`);
            }
          }

          if (!finalTaskId) {
            // Get scored suggestions for helpful error using reusable helper
            const suggestions = getScoredSuggestions(tasks, task_name, 'title', 3)
              .map(s => ({ title: s.title, id: s.id, status: s.status || 'UNKNOWN' }));
            throw taskNotFoundError(task_name, null, suggestions);
          }
        }
      }

      if (!finalTaskId) {
        throw new Error('Either taskId, task_id, or task_name is required');
      }

      this.logger.debug(`Retrieving enhanced agent results for task: ${finalTaskId}`, {
        includeOutput,
        includeAll,
        limit
      });

      // Three-tier dispatch: direct → authenticated HTTP → fail-closed
      const resultsParams = {
        taskId: finalTaskId,
        executionId,
        includeOutput: includeOutput,
        includeMetrics: true,
        includeAll: includeAll,
        limit: limit || 1
      };
      let actionData;
      const actionId = `mcp-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (routeAction) {
        // TIER 1 — Direct call
        const tokenPayload = buildTokenPayload(enrichedContext);
        const result = await routeAction('agent.results', resultsParams, tokenPayload, actionId);
        actionData = { data: result };
      } else if (userContext?.userId) {
        // TIER 2 — Authenticated HTTP (U2 Phase D site #9, 2026-05-19:
        // condition switched from .token to .userId — token field dropped
        // post-Phase-D; api-client.js mints per-call instead of forwarding
        // a Bearer. KEEP Tier 2 per sec-ops Option a — removing would break
        // standalone paichart-mcp process where ts-node bridge can't load.)
        actionData = await apiClient.post('/api/mcp/tasks/action', {
          action: 'agent.results',
          parameters: resultsParams
        }, { userContext });
      } else {
        // TIER 3 — Fail closed
        throw new Error('Authentication required: No direct handler and no authenticated user available');
      }

      this.logger.info(`Successfully retrieved Phase 5 enhanced agent results for task: ${finalTaskId}`);

      // Phase 5 Enhanced response processing with all features
      // Hoist resultData so it's accessible for the lean summary fallback below
      const resultData = actionData.data.result || actionData.data;
      if (!resultData.taskId && finalTaskId) resultData.taskId = finalTaskId;

      let enhancedResults;
      try {
        this.logger.debug(`Agent results data structure:`, {
          hasResult: !!actionData.data.result,
          hasExecutions: !!(resultData.executions),
          executionCount: resultData.executions?.length || 0
        });

        // Use parent's formatPhase5AgentResults via analytics formatters
        enhancedResults = await this.parent.formatPhase5AgentResults(resultData, format, {
          taskId: finalTaskId,
          executionId,
          timeRange,
          includeStructuredOutput: true,
          includeResourceLinks: true,
          includeElicitationPrompts: true
        });
      } catch (formatError) {
        this.logger.debug('Phase 5 formatting failed, falling back to enhanced formatting:', formatError.message);
        enhancedResults = this.formatEnhancedAgentResults(resultData, format);
      }

      // SIZE CAP GUARD — protect Claude Desktop and other clients from oversized responses.
      // 3000 chars is safe for all MCP clients; verbose=true returns full inline output but is now BOUNDED
      // at VERBOSE_MAX_CHARS (V1 2026-06-09 — was unbounded, allowing ~67K-token dumps).
      //
      // NOTE: This guard is reached by the STDIO server (paichart-mcp, mcp-server-v5.js).
      // HTTP/Claude-Desktop calls to perform(action:"agent.results") go through
      // task-action-handler.js, which has its own SIZE CAP GUARD. The verbose CEILING is the shared
      // capText() helper (cap-text.js) so that part can't drift; the lean-summary builders are still
      // separate and must stay in sync if thresholds or lean-summary format changes.
      const MAX_RESPONSE_CHARS = 3000;
      const VERBOSE_MAX_CHARS = 100000;  // V1 (2026-06-09): hard ceiling even for verbose=true — matches the
                                         // connector artifact cap. Prevents 270K-char / ~67K-token dumps that
                                         // blow the client context (verbose was previously UNBOUNDED).
      let truncation = null;
      if (!verbose && enhancedResults.formattedText.length > MAX_RESPONSE_CHARS) {
        this.logger.debug(`Response too large (${enhancedResults.formattedText.length} chars), switching to lean summary`);
        enhancedResults.formattedText = this.buildLeanSummary(resultData, enhancedResults, finalTaskId);
      } else if (verbose) {
        // verbose returns full inline output, but bounded — capText emits an honest {returnedChars,totalChars}
        // fact (Protocol 10) so an oversized artifact is paged via its mcp:// resource link, not dumped whole.
        const capped = capText(enhancedResults.formattedText, VERBOSE_MAX_CHARS);
        enhancedResults.formattedText = capped.text;
        truncation = capped.truncation;
      }

      // A5 (2026-08-03, boundary-contract F6): the containment fact must reach the gate on EVERY
      // path, not only when the lean summary happens to fire. Before this, a sub-3000-char response
      // and any verbose:true call both returned no **Facts:** line, while pov-program SYNTHESIZE
      // Step 2 tells the gate to read the fact off exactly that line. No-op when the lean summary
      // already embedded it.
      enhancedResults.formattedText = appendFactsLine(
        enhancedResults.formattedText, (resultData.executions || [])[0]);

      performanceMonitor.endTiming(timingId);

      return {
        content: [{
          type: "text",
          text: enhancedResults.formattedText
        }],
        isError: false,
        _meta: {
          tool: 'perform',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          enhancedMode: true,
          phase5Features: true,
          truncation,   // V1: {truncated,returnedChars,totalChars} when verbose output hit the ceiling, else null
          dataSource: 'database_models',
          artifactCount: enhancedResults.artifactCount,
          executionCount: enhancedResults.executionCount,
          format: format,
          performanceScore: enhancedResults.performanceScore,
          taskId: finalTaskId,
          executionId: executionId || 'latest',

          // Phase 5 Feature Status
          phase5Status: {
            structuredOutput: true,
            resourceLinks: true,
            elicitationPrompts: true,
            crossExecutionAnalytics: true,
            realTimeStreaming: false,
            executionHistory: true,
            resourceContext: true,
            performanceMetrics: true
          },

          // Enhanced capabilities
          capabilities: {
            patternAnalysis: true,
            recommendationGeneration: true,
            performanceComparison: true,
            insightGeneration: true,
            contextAwareness: true
          },

          includeFlags: {
            output: includeOutput,
            metrics: includeMetrics,
            artifacts: includeArtifacts,
            templateAnalysis: includeTemplateAnalysis,
            performanceComparison: includePerformanceComparison
          }
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_perform_agent_results', error);
      this.logger.error('perform.agent_results failed:', error.message);

      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'perform', args);
        if (recovery.canRecover) {
          const errorMessage = this.parent.createEnhancedErrorMessage(error, recovery, 'perform');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'perform',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }

      return {
        content: [{ type: "text", text: `❌ Error in perform: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'perform',
          timestamp: new Date().toISOString(),
          sdkNative: true
        }
      };
    }
  }

  /**
   * Build a lean summary response safe for all MCP clients (Claude Desktop, ChatGPT, etc.)
   * Called when the full formatted output exceeds MAX_RESPONSE_CHARS.
   *
   * Returns ~500-1000 chars: execution metadata, artifact list with MCP URIs,
   * output preview, and instructions to fetch full content via artifact URIs.
   *
   * @param {Object} resultData - Raw API result data
   * @param {Object} enhancedResults - Already-formatted results (for metadata)
   * @param {string} taskId - Task ID for context
   * @returns {string} Lean summary text
   */
  buildLeanSummary(resultData, enhancedResults, taskId) {
    const executions = resultData.executions || [];
    const artifacts = executions.flatMap(e => e.artifacts || []).concat(resultData.artifacts || []);
    const exec = executions[0];

    const lines = [];

    // Execution status line
    if (exec) {
      const statusEmoji = exec.status === 'SUCCESS' ? '✅' : exec.status === 'FAILED' ? '❌' : '⏳';
      const durationSec = exec.executionTime ? `${Math.round(exec.executionTime / 1000)}s` : 'unknown';
      lines.push(`${statusEmoji} **${exec.status}** — ${exec.id?.slice(-8) || '...'} (${durationSec})`);
      if (exec.agentTemplate) {
        lines.push(`Template: ${exec.agentTemplate.name} | Role: ${exec.agentTemplate.defaultRole}`);
      }
      // Facts line — shared single source (run-8 GAP-1; dedup 2026-07-18).
      const factsLine = leanFactsLine(exec);
      if (factsLine) lines.push(factsLine);
    } else {
      lines.push(`✅ Execution completed`);
    }
    lines.push('');

    // Artifact list with MCP resource URIs
    if (artifacts.length > 0) {
      lines.push(`**Artifacts (${artifacts.length}):**`);
      artifacts.forEach(a => {
        const size = a.content?.length ? ` (${a.content.length.toLocaleString()} chars)` : '';
        const uri = `mcp://artifacts/${a.id}`;
        lines.push(`  • ${a.name || a.type}${size} → \`${uri}\``);
      });
      lines.push('');
    }

    // Output preview — extract from report artifact or first execution output
    const reportArtifact = artifacts.find(a => a.name?.endsWith('.md') || a.type === 'report');
    const previewSource = reportArtifact?.content || exec?.output || '';
    if (previewSource) {
      const preview = previewSource.replace(/```[\s\S]*?```/g, '[code block]').trim().slice(0, 400);
      lines.push('**Output preview:**');
      lines.push(preview + (previewSource.length > 400 ? '…' : ''));
      lines.push('');
    }

    // How to read full content
    if (artifacts.length > 0) {
      const primaryArtifact = reportArtifact || artifacts[0];
      lines.push(`📖 **Read full report:**`);
      lines.push(`  \`fetch(url: "mcp://artifacts/${primaryArtifact.id}")\``);
      lines.push('');
    }

    lines.push(`💡 Full inline output: \`perform(action: "agent.results", taskId: "${taskId}", verbose: true)\``);

    return lines.join('\n');
  }

  /**
   * Format enhanced agent results (fallback when Phase 5 formatting fails)
   *
   * @param {Object} rawData - Raw agent results data
   * @param {string} format - Format type ('summary', 'detailed', 'raw')
   * @returns {Object} Formatted results with metadata
   */
  formatEnhancedAgentResults(rawData, format = 'summary') {
    try {
      const data = rawData || {};
      const executions = data.executions || [];
      // Extract artifacts from executions since they're nested
      let artifacts = data.artifacts || [];
      if (artifacts.length === 0 && executions.length > 0) {
        // Collect all artifacts from all executions
        artifacts = executions.flatMap(exec => exec.artifacts || []);
      }
      const templateAnalysis = data.templateAnalysis || {};
      const performanceComparison = data.performanceComparison || {};

      let formattedSections = [];
      let artifactCount = artifacts.length;
      let executionCount = executions.length;
      let performanceScore = performanceComparison.overallScore || 0;

      // Header section with enhanced metadata
      formattedSections.push('# 🤖 Enhanced Agent Execution Results');
      formattedSections.push('');
      formattedSections.push(`**Task ID:** ${data.taskId || 'unknown'}`);
      formattedSections.push(`**Generated:** ${new Date().toISOString()}`);
      formattedSections.push(`**Data Source:** AgentExecution & AgentArtifact models`);
      formattedSections.push(`**Format:** ${format}`);
      formattedSections.push('');

      // Executive Summary
      if (format !== 'raw') {
        formattedSections.push('## 📊 Executive Summary');
        formattedSections.push(`- **Executions Found:** ${executionCount}`);
        formattedSections.push(`- **Artifacts Generated:** ${artifactCount}`);
        formattedSections.push(`- **Performance Score:** ${performanceScore}%`);

        if (templateAnalysis.template) {
          formattedSections.push(`- **Template Used:** ${templateAnalysis.template.name} (${templateAnalysis.template.category})`);
          formattedSections.push(`- **Template Success Rate:** ${templateAnalysis.template.successRate || 0}%`);
        }
        formattedSections.push('');
      }

      // Execution Details
      if (executions.length > 0) {
        formattedSections.push('## 🔄 Agent Executions');

        executions.forEach((execution, index) => {
          formattedSections.push(`### Execution ${index + 1}: ${execution.id}`);
          formattedSections.push(`- **Status:** ${execution.status}`);
          formattedSections.push(`- **Started:** ${execution.startTime ? new Date(execution.startTime).toLocaleString() : 'unknown'}`);
          formattedSections.push(`- **Duration:** ${execution.executionTime || 'unknown'}ms`);

          if (execution.agentTemplate) {
            formattedSections.push(`- **Template:** ${execution.agentTemplate.name}`);
            formattedSections.push(`- **Role:** ${execution.agentTemplate.defaultRole}`);
          }

          if (execution.logs && execution.logs.length > 0) {
            formattedSections.push(`- **Log Entries:** ${execution.logs.length}`);
            if (format === 'detailed') {
              formattedSections.push('  **Recent Logs:**');
              execution.logs.slice(-3).forEach(log => {
                formattedSections.push(`  - ${log}`);
              });
            }
          }
          formattedSections.push('');
        });
      }

      // Artifact Details
      if (artifacts.length > 0) {
        formattedSections.push('## 📦 Generated Artifacts');

        artifacts.forEach((artifact, index) => {
          formattedSections.push(`### Artifact ${index + 1}: ${artifact.name || `Artifact ${artifact.id}`}`);
          formattedSections.push(`- **Type:** ${artifact.type}`);
          formattedSections.push(`- **Size:** ${artifact.content?.length || 0} characters`);
          formattedSections.push(`- **Created:** ${artifact.createdAt ? new Date(artifact.createdAt).toLocaleString() : 'unknown'}`);

          if (artifact.metadata) {
            formattedSections.push(`- **Metadata:**`);
            Object.entries(artifact.metadata).forEach(([key, value]) => {
              formattedSections.push(`  - ${key}: ${value}`);
            });
          }

          if (artifact.content) {
            // Never dump full content inline — always show a preview + MCP URI.
            // Full content is available via fetch(url: "mcp://artifacts/{id}").
            const preview = artifact.content.substring(0, 300);
            formattedSections.push(`- **Content Preview:**`);
            formattedSections.push('```');
            formattedSections.push(preview + (artifact.content.length > 300 ? '…' : ''));
            formattedSections.push('```');
            formattedSections.push(`- **Full content:** \`fetch(url: "mcp://artifacts/${artifact.id}")\``);
          }
          formattedSections.push('');
        });
      }

      // Template Analysis
      if (templateAnalysis.template && format !== 'summary') {
        formattedSections.push('## 🎯 Template Performance Analysis');
        const template = templateAnalysis.template;

        formattedSections.push(`**Template:** ${template.name}`);
        formattedSections.push(`**Category:** ${template.category}`);
        formattedSections.push(`**Success Rate:** ${template.successRate || 0}%`);
        formattedSections.push(`**Usage Count:** ${template.usageCount || 0}`);
        formattedSections.push(`**Average Execution Time:** ${template.averageTime || 0}ms`);

        if (template.capabilities) {
          formattedSections.push(`**Capabilities:** ${Object.keys(template.capabilities).length} defined`);
        }

        if (templateAnalysis.insights && templateAnalysis.insights.length > 0) {
          formattedSections.push(`**Key Insights:**`);
          templateAnalysis.insights.forEach(insight => {
            formattedSections.push(`- ${insight}`);
          });
        }
        formattedSections.push('');
      }

      // Performance Comparison
      if (performanceComparison.overallScore && format === 'detailed') {
        formattedSections.push('## 📈 Performance Comparison');
        formattedSections.push(`**Overall Score:** ${performanceComparison.overallScore}%`);

        if (performanceComparison.metrics) {
          Object.entries(performanceComparison.metrics).forEach(([metric, value]) => {
            formattedSections.push(`- **${metric}:** ${value}`);
          });
        }

        if (performanceComparison.recommendations) {
          formattedSections.push(`**Recommendations:**`);
          performanceComparison.recommendations.forEach(rec => {
            formattedSections.push(`- ${rec}`);
          });
        }
        formattedSections.push('');
      }

      // Resource Links (Phase 5 feature)
      if (data.resourceLinks && data.resourceLinks.length > 0) {
        formattedSections.push('## 🔗 Related Resources');
        data.resourceLinks.forEach(link => {
          formattedSections.push(`- **${link.name}:** [${link.type}](${link.uri}) - ${link.description || 'No description'}`);
        });
        formattedSections.push('');
      }

      // Interactive Prompts (Phase 5 elicitation feature)
      if (data.elicitationPrompts && data.elicitationPrompts.length > 0) {
        formattedSections.push('## 💭 Suggested Next Steps');
        data.elicitationPrompts.forEach((prompt, index) => {
          formattedSections.push(`${index + 1}. ${prompt.text}`);
          if (prompt.context) {
            formattedSections.push(`   *Context: ${prompt.context}*`);
          }
        });
        formattedSections.push('');
      }

      // Footer with enhanced metadata
      formattedSections.push('---');
      formattedSections.push(`*Enhanced by MCP Server v5 | Database-driven results | Generated at ${new Date().toLocaleString()}*`);

      return {
        formattedText: formattedSections.join('\n'),
        artifactCount,
        executionCount,
        performanceScore,
        hasTemplate: !!templateAnalysis.template,
        hasPerformanceData: !!performanceComparison.overallScore
      };

    } catch (error) {
      this.logger.error('Failed to format enhanced agent results:', error);
      return {
        formattedText: `# ❌ Enhanced Agent Results - Formatting Error\n\nError: ${error.message}\n\nRaw data available but formatting failed. Please check logs for details.`,
        artifactCount: 0,
        executionCount: 0,
        performanceScore: 0,
        hasTemplate: false,
        hasPerformanceData: false
      };
    }
  }
}

module.exports = { AgentResultsHandler };
