/**
 * Smart Error Recovery System for Enhanced MCP Server
 * Analyzes validation errors and provides intelligent suggestions for auto-correction
 * 
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 */

const { featureFlags } = require('../config/feature-flags');
const { performanceMonitor } = require('../monitoring/performance-monitor');
const { EnterpriseParameterIntelligence } = require('./enterprise-parameter-intelligence');
const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'smart-error-recovery' }));

// Jan Marshal's Simple & Reliable Approach
// "Complex caching is the enemy of reliability"
// No parameter normalizer needed - simple error recovery only

class SmartErrorRecovery {
  constructor() {
    this.errorPatterns = new Map();
    this.recoveryStrategies = new Map();
    this.statistics = {
      totalErrors: 0,
      recoveredErrors: 0,
      autoFixedErrors: 0,
      byErrorType: new Map(),
      byTool: new Map()
    };
    
    this.setupErrorPatterns();
    this.setupRecoveryStrategies();
    
    log.info('Initialized with intelligent error analysis');
  }

  /**
   * Setup error pattern recognition
   */
  setupErrorPatterns() {
    // Zod validation error patterns
    this.errorPatterns.set('invalid_type', {
      pattern: /Expected (\w+), received (\w+)/i,
      category: 'type_mismatch',
      severity: 'high',
      autoFixable: true
    });

    this.errorPatterns.set('invalid_enum_value', {
      pattern: /Invalid enum value\. Expected (.+), received (.+)/i,
      category: 'enum_mismatch',
      severity: 'high',
      autoFixable: true
    });

    this.errorPatterns.set('required_field', {
      pattern: /^Required$|"Required"|: Required|is required|are required/i,
      category: 'missing_parameter',
      severity: 'critical',
      autoFixable: false
    });

    this.errorPatterns.set('invalid_string', {
      pattern: /Expected string, received (\w+)/i,
      category: 'type_mismatch',
      severity: 'medium',
      autoFixable: true
    });

    this.errorPatterns.set('invalid_number', {
      pattern: /Expected number, received (\w+)/i,
      category: 'type_mismatch',
      severity: 'medium',
      autoFixable: true
    });

    this.errorPatterns.set('invalid_boolean', {
      pattern: /Expected boolean, received (\w+)/i,
      category: 'type_mismatch',
      severity: 'medium',
      autoFixable: true
    });

    // API-specific error patterns
    this.errorPatterns.set('not_found', {
      pattern: /404|not found|does not exist/i,
      category: 'resource_not_found',
      severity: 'medium',
      autoFixable: false
    });

    this.errorPatterns.set('bad_request', {
      pattern: /400|bad request|invalid request/i,
      category: 'invalid_request',
      severity: 'high',
      autoFixable: true
    });

    log.info('Setup error patterns for common validation errors');
  }

  /**
   * Setup recovery strategies for different error types
   */
  setupRecoveryStrategies() {
    // Type mismatch recovery
    this.recoveryStrategies.set('type_mismatch', {
      analyze: this.analyzeTypeMismatch.bind(this),
      suggest: this.suggestTypeCorrection.bind(this),
      autoFix: this.autoFixTypeMismatch.bind(this)
    });

    // Enum mismatch recovery
    this.recoveryStrategies.set('enum_mismatch', {
      analyze: this.analyzeEnumMismatch.bind(this),
      suggest: this.suggestEnumCorrection.bind(this),
      autoFix: this.autoFixEnumMismatch.bind(this)
    });

    // Missing parameter recovery
    this.recoveryStrategies.set('missing_parameter', {
      analyze: this.analyzeMissingParameter.bind(this),
      suggest: this.suggestParameterAddition.bind(this),
      autoFix: this.autoFixMissingParameter.bind(this)
    });

    // Resource not found recovery
    this.recoveryStrategies.set('resource_not_found', {
      analyze: this.analyzeResourceNotFound.bind(this),
      suggest: this.suggestResourceAlternatives.bind(this),
      autoFix: null // Cannot auto-fix missing resources
    });

    // Invalid request recovery
    this.recoveryStrategies.set('invalid_request', {
      analyze: this.analyzeInvalidRequest.bind(this),
      suggest: this.suggestRequestCorrection.bind(this),
      autoFix: this.autoFixInvalidRequest.bind(this)
    });

    log.info('Setup recovery strategies for 5 error categories');
  }

  /**
   * Analyze validation error and attempt recovery
   * @param {Error} error - The validation error
   * @param {string} toolName - Name of the tool that failed
   * @param {Object} originalParams - Original parameters that caused the error
   * @returns {Object} Recovery analysis and suggestions
   */
  async analyzeValidationError(error, toolName, originalParams) {
    if (!featureFlags.isEnabled('smartErrorRecovery')) {
      return { canRecover: false, suggestions: [], autoFix: null };
    }

    const timingId = performanceMonitor.startTiming(`error_recovery_${toolName}`);
    
    try {
      // Update statistics
      this.statistics.totalErrors++;
      if (!this.statistics.byTool.has(toolName)) {
        this.statistics.byTool.set(toolName, { total: 0, recovered: 0, autoFixed: 0 });
      }
      this.statistics.byTool.get(toolName).total++;

      // Identify error pattern
      const errorAnalysis = this.identifyErrorPattern(error);
      if (!errorAnalysis) {
        performanceMonitor.endTiming(timingId);
        return { canRecover: false, suggestions: [], autoFix: null };
      }

      // Update error type statistics
      if (!this.statistics.byErrorType.has(errorAnalysis.category)) {
        this.statistics.byErrorType.set(errorAnalysis.category, { total: 0, recovered: 0, autoFixed: 0 });
      }
      this.statistics.byErrorType.get(errorAnalysis.category).total++;

      // Get recovery strategy
      const strategy = this.recoveryStrategies.get(errorAnalysis.category);
      if (!strategy) {
        performanceMonitor.endTiming(timingId);
        return { canRecover: false, suggestions: [], autoFix: null };
      }

      // Analyze the specific error
      const analysis = await strategy.analyze(error, toolName, originalParams, errorAnalysis);
      
      // Generate suggestions
      const suggestions = await strategy.suggest(analysis, toolName, originalParams);
      
      // PHASE 2A: Enhance with parameter intelligence
      const enhancedSuggestions = await this.enhanceWithParameterIntelligence(
        suggestions, toolName, originalParams, analysis.userContext
      );
      
      // Attempt auto-fix if possible
      let autoFix = null;
      if (strategy.autoFix && errorAnalysis.autoFixable) {
        autoFix = await strategy.autoFix(analysis, toolName, originalParams);
        if (autoFix) {
          this.statistics.autoFixedErrors++;
          this.statistics.byTool.get(toolName).autoFixed++;
          this.statistics.byErrorType.get(errorAnalysis.category).autoFixed++;
        }
      }

      // Mark as recovered if we have suggestions or auto-fix
      if (suggestions.length > 0 || autoFix) {
        this.statistics.recoveredErrors++;
        this.statistics.byTool.get(toolName).recovered++;
        this.statistics.byErrorType.get(errorAnalysis.category).recovered++;
      }

      performanceMonitor.endTiming(timingId);

      return {
        canRecover: suggestions.length > 0 || autoFix !== null,
        errorType: errorAnalysis.category,
        severity: errorAnalysis.severity,
        suggestions,
        autoFix,
        analysis
      };

    } catch (recoveryError) {
      performanceMonitor.recordError(`error_recovery_${toolName}`, recoveryError);
      log.error({ toolName, err: recoveryError }, 'Recovery analysis failed');
      performanceMonitor.endTiming(timingId);
      return { canRecover: false, suggestions: [], autoFix: null };
    }
  }

  /**
   * Identify error pattern from error message
   * @param {Error} error - The error to analyze
   * @returns {Object|null} Error pattern analysis
   */
  identifyErrorPattern(error) {
    const message = error.message || error.toString();
    
    for (const [patternName, pattern] of this.errorPatterns) {
      if (pattern.pattern.test(message)) {
        const match = message.match(pattern.pattern);
        return {
          patternName,
          category: pattern.category,
          severity: pattern.severity,
          autoFixable: pattern.autoFixable,
          match: match || [],
          originalMessage: message
        };
      }
    }
    
    return null;
  }

  /**
   * Analyze type mismatch errors
   */
  async analyzeTypeMismatch(error, toolName, originalParams, errorAnalysis) {
    const match = errorAnalysis.match;
    const expectedType = match[1];
    const receivedType = match[2];
    
    // Find the parameter that caused the error
    const errorPath = this.extractErrorPath(error);
    const parameterName = errorPath ? errorPath.split('.').pop() : null;
    const parameterValue = parameterName ? originalParams[parameterName] : null;

    return {
      expectedType,
      receivedType,
      parameterName,
      parameterValue,
      errorPath,
      canCoerce: this.canCoerceType(parameterValue, expectedType)
    };
  }

  /**
   * Suggest type correction
   */
  async suggestTypeCorrection(analysis, toolName, originalParams) {
    const suggestions = [];
    
    if (analysis.canCoerce) {
      suggestions.push({
        type: 'type_coercion',
        description: `Convert ${analysis.parameterName} from ${analysis.receivedType} to ${analysis.expectedType}`,
        parameter: analysis.parameterName,
        currentValue: analysis.parameterValue,
        suggestedValue: this.coerceValue(analysis.parameterValue, analysis.expectedType),
        confidence: 'high'
      });
    }

    // Specific suggestions based on type
    if (analysis.expectedType === 'number' && analysis.receivedType === 'string') {
      suggestions.push({
        type: 'format_hint',
        description: `Use numbers without quotes (e.g., limit: 50 instead of limit: "50")`,
        parameter: analysis.parameterName,
        confidence: 'high'
      });
    }

    if (analysis.expectedType === 'boolean' && analysis.receivedType === 'string') {
      suggestions.push({
        type: 'format_hint',
        description: `Use boolean values (e.g., includeAnalytics: true instead of includeAnalytics: "true")`,
        parameter: analysis.parameterName,
        confidence: 'high'
      });
    }

    return suggestions;
  }

  /**
   * Auto-fix type mismatch
   */
  async autoFixTypeMismatch(analysis, toolName, originalParams) {
    if (!analysis.canCoerce) return null;

    const fixedParams = { ...originalParams };
    const coercedValue = this.coerceValue(analysis.parameterValue, analysis.expectedType);
    
    if (coercedValue !== null) {
      fixedParams[analysis.parameterName] = coercedValue;
      return {
        fixedParameters: fixedParams,
        changes: [{
          parameter: analysis.parameterName,
          from: analysis.parameterValue,
          to: coercedValue,
          type: 'type_coercion'
        }],
        confidence: 'high'
      };
    }

    return null;
  }

  /**
   * Analyze enum mismatch errors
   */
  async analyzeEnumMismatch(error, toolName, originalParams, errorAnalysis) {
    const match = errorAnalysis.match;
    const expectedValues = match[1] ? match[1].split(',').map(v => v.trim().replace(/['"]/g, '')) : [];
    const receivedValue = match[2] ? match[2].replace(/['"]/g, '') : '';
    
    const errorPath = this.extractErrorPath(error);
    const parameterName = errorPath ? errorPath.split('.').pop() : null;

    // Try to find the closest match
    const closestMatch = this.findClosestEnumMatch(receivedValue, expectedValues);

    return {
      expectedValues,
      receivedValue,
      parameterName,
      errorPath,
      closestMatch
    };
  }

  /**
   * Suggest enum correction
   */
  async suggestEnumCorrection(analysis, toolName, originalParams) {
    const suggestions = [];

    if (analysis.closestMatch) {
      suggestions.push({
        type: 'enum_correction',
        description: `Did you mean "${analysis.closestMatch}" instead of "${analysis.receivedValue}"?`,
        parameter: analysis.parameterName,
        currentValue: analysis.receivedValue,
        suggestedValue: analysis.closestMatch,
        confidence: 'high'
      });
    }

    // Show valid options in a more user-friendly way
    if (analysis.expectedValues && analysis.expectedValues.length > 0) {
      // For action parameter, show most common actions first
      if (analysis.parameterName === 'action') {
        const commonActions = ['task.assign', 'task.update', 'task.create', 'task.complete'];
        const availableCommonActions = commonActions.filter(action => 
          analysis.expectedValues.includes(action)
        );
        
        if (availableCommonActions.length > 0) {
          suggestions.push({
            type: 'common_actions',
            description: `Common actions: ${availableCommonActions.join(', ')}`,
            parameter: analysis.parameterName,
            validOptions: availableCommonActions,
            confidence: 'high'
          });
        }
      } else {
        // For other parameters, show first few options
        const displayOptions = analysis.expectedValues.slice(0, 5);
        const moreCount = analysis.expectedValues.length - displayOptions.length;
        const optionsText = displayOptions.join(', ') + 
          (moreCount > 0 ? ` (and ${moreCount} more)` : '');
        
        suggestions.push({
          type: 'valid_options',
          description: `Valid values: ${optionsText}`,
          parameter: analysis.parameterName,
          validOptions: analysis.expectedValues,
          confidence: 'medium'
        });
      }
    }

    return suggestions;
  }

  /**
   * Auto-fix enum mismatch
   */
  async autoFixEnumMismatch(analysis, toolName, originalParams) {
    if (!analysis.closestMatch) return null;

    const fixedParams = { ...originalParams };
    fixedParams[analysis.parameterName] = analysis.closestMatch;

    return {
      fixedParameters: fixedParams,
      changes: [{
        parameter: analysis.parameterName,
        from: analysis.receivedValue,
        to: analysis.closestMatch,
        type: 'enum_correction'
      }],
      confidence: 'high'
    };
  }

  /**
   * Analyze missing parameter errors
   */
  async analyzeMissingParameter(error, toolName, originalParams, errorAnalysis) {
    const errorPath = this.extractErrorPath(error);
    const missingParameter = errorPath ? errorPath.split('.').pop() : null;

    // If we can't identify the missing parameter, we can't provide useful suggestions
    if (!missingParameter) {
      return {
        missingParameter: null,
        errorPath: null,
        hasDefault: false,
        defaultValue: null
      };
    }

    // Check if we can suggest a default value
    const defaultValue = this.getDefaultValueForParameter(missingParameter, toolName);

    return {
      missingParameter,
      errorPath,
      hasDefault: defaultValue !== null,
      defaultValue
    };
  }

  /**
   * Suggest parameter addition
   */
  async suggestParameterAddition(analysis, toolName, originalParams) {
    const suggestions = [];

    // If we couldn't identify the missing parameter, skip suggestion
    if (!analysis.missingParameter) {
      return suggestions;
    }

    if (analysis.hasDefault) {
      suggestions.push({
        type: 'add_parameter',
        description: `Add missing required parameter: ${analysis.missingParameter}`,
        parameter: analysis.missingParameter,
        suggestedValue: analysis.defaultValue,
        confidence: 'medium'
      });
    } else {
      suggestions.push({
        type: 'missing_required',
        description: `Required parameter "${analysis.missingParameter}" is missing`,
        parameter: analysis.missingParameter,
        confidence: 'high'
      });
    }

    return suggestions;
  }

  /**
   * Auto-fix missing parameter (only if we have a reasonable default)
   */
  async autoFixMissingParameter(analysis, toolName, originalParams) {
    if (!analysis.hasDefault) return null;

    const fixedParams = { ...originalParams };
    fixedParams[analysis.missingParameter] = analysis.defaultValue;

    return {
      fixedParameters: fixedParams,
      changes: [{
        parameter: analysis.missingParameter,
        from: undefined,
        to: analysis.defaultValue,
        type: 'add_default'
      }],
      confidence: 'medium'
    };
  }

  /**
   * Analyze resource not found errors
   */
  async analyzeResourceNotFound(error, toolName, originalParams, errorAnalysis) {
    // Try to identify which resource was not found
    const resourceId = this.extractResourceId(error.message, originalParams);
    const resourceType = this.identifyResourceType(toolName, originalParams);

    return {
      resourceId,
      resourceType,
      originalParams
    };
  }

  /**
   * Suggest resource alternatives
   */
  async suggestResourceAlternatives(analysis, toolName, originalParams) {
    const suggestions = [];

    // BUG-BASIC-002 fix (2026-05-22): only emit the resource-not-found
    // suggestion when we actually know the resourceId. Previously this echoed
    // `Resource "unknown" was not found` whenever ID extraction failed — a
    // cosmetic leak that confused users. Other alternative-action suggestions
    // (pov.list / task.list pointers) still apply regardless.
    if (analysis.resourceId) {
      suggestions.push({
        type: 'resource_not_found',
        description: `${analysis.resourceType} "${analysis.resourceId}" was not found`,
        confidence: 'high'
      });
    }

    if (analysis.resourceType === 'POV') {
      suggestions.push({
        type: 'alternative_action',
        description: 'Try using project(action: "pov.list") first to see available projects',
        suggestedTool: 'project',
        confidence: 'high'
      });
    }

    if (analysis.resourceType === 'Task') {
      suggestions.push({
        type: 'alternative_action',
        description: 'Try using project(action: "task.list") first to see available tasks',
        suggestedTool: 'project',
        confidence: 'high'
      });
    }

    return suggestions;
  }

  /**
   * Analyze invalid request errors - Jan Marshal's Simple Approach
   */
  async analyzeInvalidRequest(error, toolName, originalParams, errorAnalysis) {
    // Jan Marshal's Simple & Reliable Approach - No complex normalization
    // Just analyze the error message for simple suggestions
    return {
      originalParams,
      hasNormalizations: false,
      errorMessage: error.message
    };
  }

  /**
   * Suggest request correction
   */
  async suggestRequestCorrection(analysis, toolName, originalParams) {
    const suggestions = [];

    if (analysis.hasNormalizations) {
      suggestions.push({
        type: 'parameter_normalization',
        description: 'Try with normalized parameters',
        suggestedParameters: analysis.normalizedParams,
        confidence: 'high'
      });
    }

    suggestions.push({
      type: 'general_guidance',
      description: 'Check parameter format and values',
      confidence: 'medium'
    });

    return suggestions;
  }

  /**
   * Auto-fix invalid request
   */
  async autoFixInvalidRequest(analysis, toolName, originalParams) {
    if (!analysis.hasNormalizations) return null;

    return {
      fixedParameters: analysis.normalizedParams,
      changes: this.getParameterChanges(originalParams, analysis.normalizedParams),
      confidence: 'high'
    };
  }

  /**
   * Helper methods
   */

  extractErrorPath(error) {
    // Try to extract the parameter path from Zod error
    if (error.path && Array.isArray(error.path)) {
      return error.path.join('.');
    }
    if (error.issues && error.issues[0] && error.issues[0].path) {
      return error.issues[0].path.join('.');
    }
    return null;
  }

  canCoerceType(value, targetType) {
    if (targetType === 'number' && typeof value === 'string') {
      return !isNaN(parseInt(value, 10));
    }
    if (targetType === 'boolean' && typeof value === 'string') {
      return ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase());
    }
    if (targetType === 'string') {
      return true; // Can always convert to string
    }
    return false;
  }

  coerceValue(value, targetType) {
    if (targetType === 'number' && typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? null : parsed;
    }
    if (targetType === 'boolean' && typeof value === 'string') {
      const lower = value.toLowerCase();
      if (['true', '1', 'yes'].includes(lower)) return true;
      if (['false', '0', 'no'].includes(lower)) return false;
      return null;
    }
    if (targetType === 'string') {
      return value.toString();
    }
    return null;
  }

  findClosestEnumMatch(value, validValues) {
    const lowerValue = value.toLowerCase();
    
    // Exact match (case insensitive)
    for (const valid of validValues) {
      if (valid.toLowerCase() === lowerValue) {
        return valid;
      }
    }
    
    // Partial match
    for (const valid of validValues) {
      if (valid.toLowerCase().includes(lowerValue) || lowerValue.includes(valid.toLowerCase())) {
        return valid;
      }
    }
    
    return null;
  }

  getDefaultValueForParameter(paramName, toolName) {
    const defaults = {
      limit: 10,
      includeAnalytics: false,
      includeHistory: false,
      includeRecommendations: false,
      contextDepth: 'standard'
    };
    
    return defaults[paramName] || null;
  }

  extractResourceId(message, params) {
    // Try to extract ID from error message or parameters
    if (params.povId) return params.povId;
    if (params.taskId) return params.taskId;
    if (params.phaseId) return params.phaseId;

    // Try to extract from error message
    const idMatch = message.match(/id[:\s]+([a-zA-Z0-9-]+)/i);
    // BUG-BASIC-002 fix (2026-05-22): return null (not the literal string
    // 'unknown') when extraction fails. The caller (suggestResourceAlternatives)
    // now skips the resource-not-found suggestion entirely when resourceId is
    // null — avoids the cosmetic leak `Resource "unknown" was not found`.
    return idMatch ? idMatch[1] : null;
  }

  identifyResourceType(toolName, params) {
    if (toolName.includes('pov') || params.povId) return 'POV';
    if (toolName.includes('task') || params.taskId) return 'Task';
    if (toolName.includes('phase') || params.phaseId) return 'Phase';
    return 'Resource';
  }

  getParameterChanges(original, normalized) {
    const changes = [];
    
    for (const [key, value] of Object.entries(normalized)) {
      if (original[key] !== value) {
        changes.push({
          parameter: key,
          from: original[key],
          to: value,
          type: 'normalization'
        });
      }
    }
    
    return changes;
  }

  /**
   * Get error recovery statistics
   */
  getStatistics() {
    const byErrorType = {};
    for (const [type, stats] of this.statistics.byErrorType) {
      byErrorType[type] = {
        total: stats.total,
        recovered: stats.recovered,
        autoFixed: stats.autoFixed,
        recoveryRate: stats.total > 0 ? Math.round((stats.recovered / stats.total) * 100) : 0,
        autoFixRate: stats.total > 0 ? Math.round((stats.autoFixed / stats.total) * 100) : 0
      };
    }

    const byTool = {};
    for (const [tool, stats] of this.statistics.byTool) {
      byTool[tool] = {
        total: stats.total,
        recovered: stats.recovered,
        autoFixed: stats.autoFixed,
        recoveryRate: stats.total > 0 ? Math.round((stats.recovered / stats.total) * 100) : 0,
        autoFixRate: stats.total > 0 ? Math.round((stats.autoFixed / stats.total) * 100) : 0
      };
    }

    return {
      total: this.statistics.totalErrors,
      recovered: this.statistics.recoveredErrors,
      autoFixed: this.statistics.autoFixedErrors,
      recoveryRate: this.statistics.totalErrors > 0 
        ? Math.round((this.statistics.recoveredErrors / this.statistics.totalErrors) * 100) 
        : 0,
      autoFixRate: this.statistics.totalErrors > 0 
        ? Math.round((this.statistics.autoFixedErrors / this.statistics.totalErrors) * 100) 
        : 0,
      byErrorType,
      byTool
    };
  }

  /**
   * Generate error recovery report
   */
  generateReport() {
    const stats = this.getStatistics();
    
    let report = '\n🔧 Smart Error Recovery Report\n';
    report += '================================\n\n';
    
    report += `📈 Overall Statistics:\n`;
    report += `• Total Errors: ${stats.total}\n`;
    report += `• Recovered: ${stats.recovered} (${stats.recoveryRate}%)\n`;
    report += `• Auto-Fixed: ${stats.autoFixed} (${stats.autoFixRate}%)\n\n`;
    
    if (Object.keys(stats.byErrorType).length > 0) {
      report += `🎯 By Error Type:\n`;
      for (const [type, typeStats] of Object.entries(stats.byErrorType)) {
        report += `\n• ${type}:\n`;
        report += `  - Total: ${typeStats.total}\n`;
        report += `  - Recovery Rate: ${typeStats.recoveryRate}%\n`;
        report += `  - Auto-Fix Rate: ${typeStats.autoFixRate}%\n`;
      }
    }
    
    return report;
  }

  /**
   * PHASE 2A: Enhance suggestions with parameter intelligence
   */
  async enhanceWithParameterIntelligence(suggestions, toolName, originalParams, userContext) {
    try {
      if (!featureFlags.isEnabled('parameterIntelligence')) {
        return suggestions;
      }

      const intelligence = new EnterpriseParameterIntelligence();
      const paramSuggestions = await intelligence.suggestParameters(toolName, originalParams, userContext);
      
      // Merge intelligence with existing suggestions
      const enhanced = [...suggestions];
      
      // Add contextual hints
      if (paramSuggestions.contextualHints?.roleBasedHints?.length > 0) {
        enhanced.push({
          type: 'contextual_hint',
          description: 'Contextual guidance for your role',
          hints: paramSuggestions.contextualHints.roleBasedHints,
          confidence: 'high'
        });
      }
      
      // Add smart defaults
      if (Object.keys(paramSuggestions.smartDefaults || {}).length > 0) {
        enhanced.push({
          type: 'smart_defaults',
          description: 'Recommended defaults for enterprise use',
          defaults: paramSuggestions.smartDefaults,
          confidence: 'medium'
        });
      }
      
      // Add historical patterns
      if (paramSuggestions.historicalPatterns?.patterns?.length > 0) {
        enhanced.push({
          type: 'historical_pattern',
          description: 'Based on your previous successful calls',
          patterns: paramSuggestions.historicalPatterns.patterns.slice(0, 3),
          confidence: paramSuggestions.historicalPatterns.confidence
        });
      }
      
      await intelligence.disconnect();
      return enhanced;
      
    } catch (error) {
      log.error({ err: error }, 'Parameter intelligence enhancement failed');
      return suggestions; // Return original suggestions if enhancement fails
    }
  }
}

// Create singleton instance
const smartErrorRecovery = new SmartErrorRecovery();

module.exports = { 
  SmartErrorRecovery, 
  smartErrorRecovery 
};
