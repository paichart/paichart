/**
 * Analytics Helpers
 *
 * Utility functions for analytics operations including timeframe conversion,
 * error message formatting, and tool-specific guidance.
 *
 * @module analytics-helpers
 * @version 1.0.0
 * @extracted Phase 3.5 Task 2B (Dec 2025) from sdk-native-advanced-tools.js
 *
 * @description Provides utility methods for:
 *   - Timeframe string conversion to day counts
 *   - Enhanced error message formatting with recovery suggestions
 *   - Tool-specific usage guidance generation
 */

/**
 * Analytics Helper Utilities
 *
 * @class AnalyticsHelpers
 * @description Provides utility functions for analytics operations.
 */
class AnalyticsHelpers {
  /**
   * Creates Analytics Helpers instance
   *
   * @param {Object} logger - Logger instance for debugging
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Convert timeframe string to days
   *
   * @param {string} timeframe - Timeframe string (7d, 30d, 90d, 1y)
   * @returns {number} Number of days (defaults to 30 if invalid)
   *
   * @description Converts human-readable timeframe strings to day counts
   *   for API filtering. Supports: 7d (7 days), 30d (30 days), 90d (90 days), 1y (365 days).
   *
   * @example
   * const days = helpers.convertTimeframeToDays('30d');  // Returns: 30
   * const defaultDays = helpers.convertTimeframeToDays('invalid');  // Returns: 30
   */
  convertTimeframeToDays(timeframe) {
    const timeframeMap = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };

    return timeframeMap[timeframe] || 30;
  }

  /**
   * Create enhanced error message with recovery suggestions
   *
   * @param {Error|Object|string} error - Error object, error data, or error string
   * @param {Object} recovery - Smart recovery suggestions
   * @param {boolean} recovery.canRecover - Whether error is recoverable
   * @param {Array<string>} [recovery.suggestions] - Recovery suggestions
   * @param {string} toolName - Tool name that generated the error
   *
   * @returns {string} Formatted error message with recovery guidance
   *
   * @description Creates detailed error messages by:
   *   - Parsing complex error objects (nested errors, API errors)
   *   - Extracting actual error messages from various formats
   *   - Adding recovery suggestions if available
   *   - Providing tool-specific guidance
   *
   * @example
   * const errorMsg = helpers.createEnhancedErrorMessage(
   *   new Error('Task not found'),
   *   { canRecover: true, suggestions: ['Check task ID', 'Verify POV access'] },
   *   'project'
   * );
   */
  createEnhancedErrorMessage(error, recovery, toolName) {
    let message = `❌ **Error in ${toolName}**\n\n`;

    // Parse error message properly - handle [object Object] issue
    let errorMessage = '';

    if (error && typeof error === 'object') {
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error) {
        // Handle nested error objects
        if (typeof error.error === 'string') {
          errorMessage = error.error;
        } else if (error.error.message) {
          errorMessage = error.error.message;
        } else {
          errorMessage = JSON.stringify(error.error);
        }
      } else {
        // Fallback: stringify the entire error object
        try {
          errorMessage = JSON.stringify(error, null, 2);
        } catch (stringifyError) {
          errorMessage = error.toString();
        }
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = 'Unknown error occurred';
    }

    // Additional parsing for API errors
    if (errorMessage.includes('API request failed:')) {
      // Extract the actual API error
      const parts = errorMessage.split(' - ');
      if (parts.length > 1) {
        errorMessage = parts[parts.length - 1];

        // Try to parse JSON error if it looks like JSON
        if (errorMessage.startsWith('{') || errorMessage.startsWith('[')) {
          try {
            const parsed = JSON.parse(errorMessage);
            if (parsed.message) {
              errorMessage = parsed.message;
            } else if (parsed.error) {
              if (typeof parsed.error === 'string') {
                errorMessage = parsed.error;
              } else if (parsed.error.message) {
                errorMessage = parsed.error.message;
              } else {
                errorMessage = JSON.stringify(parsed.error);
              }
            } else if (Array.isArray(parsed) && parsed.length > 0) {
              // Handle Zod validation errors array
              errorMessage = parsed.map(err => {
                if (typeof err === 'string') return err;
                if (err.message) return err.message;
                return JSON.stringify(err);
              }).join(', ');
            }
          } catch (parseError) {
            // Keep original error message if parsing fails
          }
        }
      }
    }

    message += `${errorMessage}\n\n`;

    if (recovery.suggestions && recovery.suggestions.length > 0) {
      message += `💡 **Suggestions:**\n`;
      recovery.suggestions.forEach((suggestion, index) => {
        message += `${index + 1}. ${suggestion.description}\n`;
        if (suggestion.suggestedValue !== undefined) {
          message += `   Try: ${suggestion.parameter}: ${JSON.stringify(suggestion.suggestedValue)}\n`;
        }
      });
      message += '\n';
    }

    // Add tool-specific guidance
    const guidance = this.getToolSpecificGuidance(toolName);
    message += guidance;

    return message;
  }

  /**
   * Get tool-specific guidance for errors
   */
  getToolSpecificGuidance(toolName) {
    const guidance = {
      'project': '💡 **Tip**: Use boolean values (true/false) for include options and contextDepth like "minimal", "standard", "full"',
      'perform': '💡 **Tip**: Valid actions include "task.create", "task.update", "task.assign", "task.complete", "task.comment", "stage.create", "agent.assign", "agent.configure", "agent.execute", "agent.status", "agent.results", "analytics.generate"',
      'analytics': '💡 **Tip**: Use type values like "OPTIMIZATION", "AUTOMATION" and impact like "HIGH", "MEDIUM", "LOW". Timeframes: "7d", "30d", "90d", "1y"'
    };

    return guidance[toolName] || '💡 **Tip**: Check parameter values and try again';
  }
}

module.exports = { AnalyticsHelpers };
