/**
 * Analytics Formatters
 *
 * Provides Phase 5 enhanced formatting for agent results with structured output,
 * resource links, elicitation prompts, and cross-execution analytics.
 *
 * @module analytics-formatters
 * @version 1.0.0
 * @extracted Phase 3.5 Task 2B (Dec 2025) from sdk-native-advanced-tools.js
 *
 * @description Provides Phase 5 formatting features:
 *   - Main Phase 5 formatting orchestration
 *   - Structured metadata generation for results
 *   - MCP resource URI generation for related data
 *   - Interactive follow-up prompt creation
 *   - Cross-execution analytics and insights
 *   - Enhancement combination and text merging
 */

// BUG-BASIC-XSS-1 Phase 2.9 (sec-ops I3): markdown link interpolation at
// line ~213 had no URL scheme validation. A user-controlled `link.uri` like
// `javascript:alert(1)` rendered as a clickable URL in Claude Desktop's
// markdown view = HIGH-severity XSS vector (Claude Desktop DOES render
// markdown). Fix: URL scheme allowlist (http, https, mcp, paichart) — reject
// or sanitize anything else. Also wrap name/type/description with
// sanitizeForResponse for defense-in-depth.
const { sanitizeForResponse } = require('../../response-sanitizer');

/**
 * Allowlist of URL schemes safe to interpolate into markdown links.
 * Anything else (javascript:, data:, vbscript:, file:, etc.) is replaced
 * with '#' + a warning logged. Matches lib/utils/sanitize.ts:sanitizeRichContent
 * allowedSchemes convention (http, https, mailto + project-specific mcp/paichart).
 */
const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mcp:', 'paichart:']);

function sanitizeLinkUri(uri) {
  if (!uri || typeof uri !== 'string') return '#';
  try {
    const url = new URL(uri);
    if (!ALLOWED_LINK_SCHEMES.has(url.protocol)) {
      return '#'; // safe fallback; raw uri NEVER reaches output
    }
    return uri;
  } catch {
    return '#'; // malformed URL = no clickable link
  }
}

/**
 * Analytics Formatting Engine
 *
 * @class AnalyticsFormatters
 * @description Orchestrates Phase 5 analytics formatting with advanced features.
 */
class AnalyticsFormatters {
  /**
   * Creates Analytics Formatters instance
   *
   * @param {Object} baseFormatter - Base formatter instance from parent tools
   * @param {Object} logger - Logger instance for debugging
   */
  constructor(baseFormatter, logger) {
    this.baseFormatter = baseFormatter;
    this.logger = logger;
  }

  /**
   * Format Phase 5 agent results with all advanced features
   *
   * @param {Object} data - Raw agent execution data
   * @param {Array<Object>} data.executions - Agent execution records
   * @param {Array<Object>} data.artifacts - Generated artifacts
   * @param {string} format - Output format (detailed, summary, raw)
   * @param {Object} options - Formatting options
   * @param {string} [options.taskId] - Task CUID for context
   * @param {string} [options.timeRange] - Time range for analytics
   * @param {boolean} [options.includeStructuredOutput=true] - Include structured metadata
   * @param {boolean} [options.includeResourceLinks=true] - Include resource URIs
   * @param {boolean} [options.includeElicitationPrompts=true] - Include interactive prompts
   *
   * @returns {Promise<Object>} Enhanced formatted results
   * @returns {string} returns.formattedText - Complete formatted text with enhancements
   * @returns {number} returns.artifactCount - Number of artifacts
   * @returns {number} returns.executionCount - Number of executions
   * @returns {number} returns.performanceScore - Performance score (0-100)
   *
   * @description Main Phase 5 formatting orchestrator combining base formatting
   *   with structured output, resource links, elicitation prompts, and cross-execution analytics.
   *
   * @example
   * const formatted = await formatters.formatPhase5AgentResults(
   *   { executions: [...], artifacts: [...] },
   *   'detailed',
   *   { taskId: 'clxy123', includeStructuredOutput: true }
   * );
   */
  async formatPhase5AgentResults(data, format, options) {
    try {
      this.logger.debug('Formatting Phase 5 agent results with advanced features');

      // Inject taskId into data so the base formatter can display it
      if (!data.taskId && options.taskId) {
        data.taskId = options.taskId;
      }

      // Start with enhanced formatting
      const baseResults = this.baseFormatter.formatEnhancedAgentResults(data, format);

      // Add Phase 5 specific enhancements
      const phase5Enhancements = {
        structuredOutput: await this.generateStructuredOutput(data, options),
        resourceLinks: await this.generateResourceLinks(data, options),
        elicitationPrompts: await this.generateElicitationPrompts(data, options),
        crossExecutionAnalytics: await this.generateCrossExecutionAnalytics(data, options)
      };

      // Combine base results with Phase 5 enhancements
      const enhancedText = this.combinePhase5Enhancements(baseResults.formattedText, phase5Enhancements);

      return {
        ...baseResults,
        formattedText: enhancedText,
        phase5Enhancements,
        enhancementVersion: '5.0'
      };
    } catch (error) {
      this.logger.debug('Failed to format Phase 5 results, falling back:', error.message);
      return this.baseFormatter.formatEnhancedAgentResults(data, format);
    }
  }

  /**
   * Generate structured output for Phase 5
   */
  async generateStructuredOutput(data, options) {
    return {
      type: 'structured_agent_results',
      version: '5.0',
      timestamp: new Date().toISOString(),
      taskId: options.taskId,
      executionId: options.executionId,
      structure: {
        sections: ['summary', 'artifacts', 'performance', 'recommendations'],
        format: 'enhanced_markdown',
        interactivity: true
      }
    };
  }

  /**
   * Generate resource links for Phase 5
   */
  async generateResourceLinks(data, options) {
    const links = [];

    if (options.taskId) {
      links.push({
        name: 'Task Database Resource',
        type: 'database_resource',
        uri: `mcp://database/task-database?taskId=${options.taskId}`,
        description: 'Enhanced task data with execution context'
      });
    }

    links.push({
      name: 'Agent Templates Resource',
      type: 'template_resource',
      uri: 'mcp://database/agent-templates?sortBy=performance',
      description: 'Performance-optimized agent templates'
    });

    return links;
  }

  /**
   * Generate elicitation prompts for Phase 5
   */
  async generateElicitationPrompts(data, options) {
    const prompts = [];

    // Smart prompts based on execution results
    if (data.success) {
      prompts.push({
        text: "Would you like to analyze similar successful executions for patterns?",
        context: "This execution completed successfully",
        type: "pattern_analysis",
        priority: "medium"
      });
    } else {
      prompts.push({
        text: "Would you like to investigate potential causes for this execution issue?",
        context: "This execution had problems",
        type: "troubleshooting",
        priority: "high"
      });
    }

    prompts.push({
      text: "Explore related resources for this task?",
      context: "Available in enhanced resource system",
      type: "resource_exploration",
      priority: "low"
    });

    return prompts;
  }

  /**
   * Generate cross-execution analytics for Phase 5
   */
  async generateCrossExecutionAnalytics(data, options) {
    return {
      analysisType: 'cross_execution',
      timeRange: options.timeRange || '7d',
      metrics: {
        averageExecutionTime: 0,
        successRate: 0,
        compareToBaseline: 'unavailable'
      },
      insights: ['Cross-execution analytics require multiple executions for meaningful analysis'],
      recommendations: ['Continue using the system to build execution history']
    };
  }

  /**
   * Combine Phase 5 enhancements with base results
   */
  combinePhase5Enhancements(baseText, enhancements) {
    let enhanced = baseText;

    // Add structured output section
    if (enhancements.structuredOutput) {
      enhanced += '\n\n## 🏗️ Structured Output\n';
      enhanced += `**Format:** ${enhancements.structuredOutput.structure?.format || 'enhanced'}\n`;
      enhanced += `**Version:** ${enhancements.structuredOutput.version}\n`;
    }

    // Add resource links
    if (enhancements.resourceLinks && enhancements.resourceLinks.length > 0) {
      enhanced += '\n\n## 🔗 Related Resources\n';
      enhancements.resourceLinks.forEach(link => {
        // BUG-BASIC-XSS-1 Phase 2.9: sanitize name/type (HTML escape) +
        // URL scheme allowlist for uri (markdown link injection prevention).
        enhanced += `- **${sanitizeForResponse(link.name)}:** [${sanitizeForResponse(link.type)}](${sanitizeLinkUri(link.uri)})\n`;
        enhanced += `  ${sanitizeForResponse(link.description)}\n`;
      });
    }

    // Add elicitation prompts
    if (enhancements.elicitationPrompts && enhancements.elicitationPrompts.length > 0) {
      enhanced += '\n\n## 💭 Suggested Next Steps\n';
      enhancements.elicitationPrompts.forEach((prompt, index) => {
        enhanced += `${index + 1}. ${prompt.text}\n`;
        if (prompt.context) {
          enhanced += `   *${prompt.context}*\n`;
        }
      });
    }

    // Add Phase 5 footer
    enhanced += '\n\n---\n';
    enhanced += '*Enhanced with Phase 5 MCP Features: Structured Output, Resource Links, Elicitation Prompts, Cross-Execution Analytics*\n';
    enhanced += `*Generated at ${new Date().toLocaleString()}*`;

    return enhanced;
  }
}

module.exports = { AnalyticsFormatters };
