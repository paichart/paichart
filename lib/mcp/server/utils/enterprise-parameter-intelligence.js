/**
 * Enterprise Parameter Intelligence
 * Provides contextual hints, historical patterns, and smart defaults
 * Part of Plan 8 Phase 2A: Enhanced Parameter Intelligence
 */

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma: globalPrisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');

class EnterpriseParameterIntelligence {
  constructor(prisma) {
    // DI pattern: Use injected prisma or fall back to global singleton (never create new)
    this.prisma = prisma || globalPrisma;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    // TIME BOMB FIX (Jan 2026): Add size limit to prevent unbounded growth
    // Pattern: time-bomb-detection-pattern.md (Category 1: Unbounded Caches)
    // Cache key = toolName + userId, so limit based on expected user count
    this.maxCacheSize = 1000;
    
    // Create logger for debugging
    this.logger = createAdapter(stderr.mcpLogger.child({ component: 'parameter-intelligence' }));
  }

  /**
   * Get comprehensive parameter suggestions for enterprise users
   * @param {string} toolName - Name of the tool being used
   * @param {object} partialParams - Partially filled parameters
   * @param {object} userContext - User context with ID, role, history
   * @returns {object} Parameter suggestions and intelligence
   */
  async suggestParameters(toolName, partialParams = {}, userContext = {}) {
    try {
      const cacheKey = `suggestions_${toolName}_${userContext.userId}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return { ...cached.data, cached: true };
        }
      }

      const suggestions = {
        contextualHints: await this.getContextualSuggestions(toolName, userContext),
        historicalPatterns: await this.getHistoricalPatterns(toolName, userContext.userId),
        validationTips: await this.getValidationHints(toolName, partialParams),
        smartDefaults: await this.getEnterpriseDefaults(toolName, userContext.role),
        completionSuggestions: await this.getParameterCompletion(toolName, partialParams),
        confidence: this.calculateConfidence(toolName, userContext)
      };

      // Cache the result with LRU eviction
      // TIME BOMB FIX: Prevent unbounded cache growth
      if (this.cache.size >= this.maxCacheSize) {
        // LRU eviction: remove oldest entry (first key in Map iteration order)
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
      this.cache.set(cacheKey, {
        data: suggestions,
        timestamp: Date.now()
      });

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to generate suggestions:', error);
      return this.getFallbackSuggestions(toolName, partialParams);
    }
  }

  /**
   * Get contextual hints based on user role and current context
   */
  async getContextualSuggestions(toolName, userContext) {
    const suggestions = {
      roleBasedHints: [],
      contextualDefaults: {},
      usagePatterns: []
    };

    try {
      // Role-based suggestions
      if (userContext.role === 'ADMIN') {
        suggestions.roleBasedHints = this.getAdminHints(toolName);
      } else {
        suggestions.roleBasedHints = this.getStandardUserHints(toolName);
      }

      // Context-aware defaults
      if (toolName === 'registry') {
        suggestions.contextualDefaults = await this.getServiceRegistrationDefaults(userContext);
      } else if (toolName === 'services') {
        suggestions.contextualDefaults = await this.getDiscoveryDefaults(userContext);
      }

      // Usage patterns from successful interactions
      suggestions.usagePatterns = await this.getSuccessfulPatterns(toolName, userContext);

    } catch (error) {
      this.logger.error('Contextual suggestions failed:', error);
    }

    return suggestions;
  }

  /**
   * Get historical patterns for this user
   */
  async getHistoricalPatterns(toolName, userId) {
    if (!userId) return { patterns: [], confidence: 'low' };

    try {
      // Check if AuditLog table exists, if not use fallback patterns
      if (!this.prisma.auditLog) {
        return this.getFallbackHistoricalPatterns(toolName);
      }

      // Get user's successful tool calls from audit log
      const recentCalls = await this.prisma.auditLog.findMany({
        where: {
          userId,
          eventType: 'TOOL_EXECUTION',
          metadata: {
            path: ['toolName'],
            equals: toolName
          },
          timestamp: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 10
      });

      if (recentCalls.length === 0) {
        return this.getFallbackHistoricalPatterns(toolName);
      }

      // Analyze patterns in successful calls
      const patterns = this.analyzeParameterPatterns(recentCalls);
      
      return {
        patterns,
        confidence: recentCalls.length > 5 ? 'high' : 'medium',
        sampleSize: recentCalls.length
      };

    } catch (error) {
      this.logger.error('Historical patterns failed, using fallback:', error.message);
      return this.getFallbackHistoricalPatterns(toolName);
    }
  }

  /**
   * Get validation hints for current partial parameters
   */
  async getValidationHints(toolName, partialParams) {
    try {
      const toolSchemas = require('../config/tool-schemas');
      const schema = toolSchemas.CONSOLIDATED_SCHEMAS[toolName] || toolSchemas.TOOL_SCHEMAS[toolName];
      
      if (!schema) {
        return { hints: [], missing: [], optional: [] };
      }

      const hints = {
        missing: [],
        optional: [],
        suggestions: [],
        examples: {}
      };

      // Analyze schema to find missing required parameters
      const schemaShape = schema.inputSchema?._def?.shape;
      
      // Safety check for null/undefined schema
      if (!schemaShape || typeof schemaShape !== 'object') {
        this.logger.debug(`No schema shape found for tool ${toolName}`);
        return hints;
      }
      
      for (const [paramName, paramSchema] of Object.entries(schemaShape)) {
        if (!partialParams.hasOwnProperty(paramName)) {
          const isOptional = paramSchema._def.typeName === 'ZodOptional' || 
                           paramSchema._def.defaultValue !== undefined;
          
          if (isOptional) {
            hints.optional.push({
              name: paramName,
              description: paramSchema.description,
              suggestion: this.getParameterSuggestion(toolName, paramName)
            });
          } else {
            hints.missing.push({
              name: paramName,
              description: paramSchema.description,
              required: true,
              example: this.getParameterExample(toolName, paramName)
            });
          }
        }
      }

      // Add tool-specific suggestions
      hints.suggestions = this.getToolSpecificSuggestions(toolName, partialParams);

      return hints;
    } catch (error) {
      this.logger.error('Validation hints failed:', error);
      return { hints: [], missing: [], optional: [] };
    }
  }

  /**
   * Get enterprise-appropriate defaults
   */
  async getEnterpriseDefaults(toolName, userRole) {
    const defaults = {};

    try {
      switch (toolName) {
        case 'registry':
          defaults.version = '1.0.0';
          defaults.category = userRole === 'ADMIN' ? 'system' : 'ai-intelligence';
          defaults.authType = 'API_KEY';
          break;
          
        case 'services':
          defaults.status = 'ACTIVE';
          defaults.limit = userRole === 'ADMIN' ? 50 : 20;
          defaults.timeout = 30000; // 30 seconds for service calls
          break;
          
      }

      return defaults;
    } catch (error) {
      this.logger.error('Enterprise defaults failed:', error);
      return {};
    }
  }

  /**
   * Get parameter completion suggestions
   */
  async getParameterCompletion(toolName, partialParams) {
    const completions = [];

    try {
      // Tool-specific parameter completion
      if (toolName === 'registry' && partialParams.name) {
        // Suggest description based on service name
        const description = this.generateServiceDescription(partialParams.name);
        if (description) {
          completions.push({
            parameter: 'description',
            suggestion: description,
            confidence: 'medium'
          });
        }
      }

      if (toolName === 'services' && partialParams.capability) {
        // Suggest related categories
        const categories = this.getSuggestedCategories(partialParams.capability);
        if (categories.length > 0) {
          completions.push({
            parameter: 'category',
            suggestions: categories,
            confidence: 'high'
          });
        }
      }

      return completions;
    } catch (error) {
      this.logger.error('Parameter completion failed:', error);
      return [];
    }
  }

  // Helper Methods

  getAdminHints(toolName) {
    const adminHints = {
      'registry': [
        'You can register services in any category including system and admin',
        'Consider setting publicAccess=true for widely useful services',
        'Use authType=NONE for public services that don\'t need authentication'
      ],
      'services': [
        'As admin, you can call any service via services(action: "call")',
        'Monitor service health via services(action: "health")',
        'Use timeout parameter for long-running operations'
      ]
    };
    
    return adminHints[toolName] || [];
  }

  getStandardUserHints(toolName) {
    const standardHints = {
      'registry': [
        'Choose a descriptive, unique service name',
        'Provide a clear description of what your service does',
        'Start with category \'ai-intelligence\' for AI services'
      ],
      'services': [
        'Use services(action: "discover") with capability filter to find services',
        'Try category filter to browse by service type',
        'Use status=ACTIVE to see only operational services'
      ]
    };
    
    return standardHints[toolName] || [];
  }

  async getServiceRegistrationDefaults(userContext) {
    return {
      authType: 'API_KEY',
      category: 'ai-intelligence',
      version: '1.0.0'
    };
  }

  async getDiscoveryDefaults(userContext) {
    return {
      status: 'ACTIVE',
      limit: 20
    };
  }

  async getServiceCallDefaults(userContext) {
    return {
      timeout: 30000
    };
  }

  async getSuccessfulPatterns(toolName, userContext) {
    // This would analyze successful parameter combinations
    // For now, return common patterns
    const patterns = {
      'registry': [
        { name: 'AI Service Pattern', example: { action: 'register', category: 'ai-intelligence', authType: 'API_KEY' } },
        { name: 'Data Service Pattern', example: { action: 'register', category: 'data-services', authType: 'BEARER_TOKEN' } }
      ],
      'services': [
        { name: 'Capability Search', example: { action: 'discover', capability: 'weather' } },
        { name: 'Category Browse', example: { action: 'discover', category: 'ai-intelligence' } }
      ]
    };

    return patterns[toolName] || [];
  }

  analyzeParameterPatterns(auditLogs) {
    // Analyze audit logs to find common parameter patterns
    const patterns = [];
    
    try {
      for (const log of auditLogs) {
        if (log.metadata && log.metadata.parameters) {
          patterns.push({
            parameters: log.metadata.parameters,
            success: log.metadata.success,
            timestamp: log.timestamp
          });
        }
      }
    } catch (error) {
      this.logger.error('Pattern analysis failed:', error);
    }

    return patterns;
  }

  getParameterSuggestion(toolName, paramName) {
    const suggestions = {
      'registry': {
        'action': 'Choose: register, list, update, delete, tools',
        'name': 'Use lowercase with hyphens (e.g., my-ai-service)',
        'description': 'Clearly describe what your service does',
        'endpoint': 'Use HTTPS endpoints for security',
        'category': 'Choose the most appropriate category for discoverability'
      },
      'services': {
        'action': 'Choose: discover, call, health, workflow.execute, workflow.status, workflow.cancel, workflow.list',
        'capability': 'Describe what you need (e.g., weather, translation)',
        'category': 'Browse by type (ai-intelligence, data-services, automation)',
        'limit': 'Use 20 for normal browsing, 50 for comprehensive search'
      }
    };

    return suggestions[toolName]?.[paramName] || 'Refer to tool documentation for guidance';
  }

  getParameterExample(toolName, paramName) {
    const examples = {
      'registry': {
        'action': 'register',
        'name': 'weather-forecast-api',
        'description': 'Provides weather forecasts and current conditions',
        'endpoint': 'https://api.myweather.com/mcp',
        'category': 'data-services'
      },
      'services': {
        'action': 'discover',
        'capability': 'weather',
        'category': 'data-services',
        'limit': 20
      }
    };

    return examples[toolName]?.[paramName] || null;
  }

  getToolSpecificSuggestions(toolName, partialParams) {
    const suggestions = [];

    try {
      if (toolName === 'registry') {
        if (partialParams.name && !partialParams.description) {
          suggestions.push({
            type: 'completion',
            message: 'Consider adding a description that explains what your service does',
            priority: 'high'
          });
        }
        
        if (partialParams.endpoint && !partialParams.endpoint.startsWith('https://')) {
          suggestions.push({
            type: 'security',
            message: 'HTTPS endpoints are recommended for security',
            priority: 'medium'
          });
        }
      }

      if (toolName === 'services') {
        if (partialParams.targetService && !partialParams.tool) {
          suggestions.push({
            type: 'completion',
            message: 'Specify which tool you want to call on this service',
            priority: 'high'
          });
        }
      }

    } catch (error) {
      this.logger.error('Tool suggestions failed:', error);
    }

    return suggestions;
  }

  generateServiceDescription(serviceName) {
    // Simple description generation based on service name
    const patterns = {
      'weather': 'Provides weather information and forecasts',
      'translate': 'Text translation service',
      'sentiment': 'Sentiment analysis for text content',
      'notification': 'Notification and alerting service',
      'data': 'Data processing and analysis service',
      'ai': 'AI-powered intelligence service',
      'automation': 'Workflow automation service'
    };

    for (const [keyword, description] of Object.entries(patterns)) {
      if (serviceName.toLowerCase().includes(keyword)) {
        return description;
      }
    }

    return null;
  }

  getSuggestedCategories(capability) {
    const categoryMappings = {
      'weather': ['data-services'],
      'translate': ['ai-intelligence'],
      'sentiment': ['ai-intelligence'],
      'notification': ['communication'],
      'monitoring': ['monitoring'],
      'automation': ['automation'],
      'data': ['data-services'],
      'ai': ['ai-intelligence']
    };

    return categoryMappings[capability] || [];
  }

  calculateConfidence(toolName, userContext) {
    let confidence = 50; // Base confidence

    // Increase confidence based on user context
    if (userContext.userId) confidence += 20;
    if (userContext.role === 'ADMIN') confidence += 10;
    if (userContext.previousCalls > 5) confidence += 15;
    if (userContext.previousCalls > 20) confidence += 5;

    // Tool-specific confidence adjustments
    if (['registry', 'services'].includes(toolName)) {
      confidence += 10; // These tools have excellent patterns
    }

    return Math.min(confidence, 95); // Cap at 95%
  }

  getFallbackSuggestions(toolName, partialParams) {
    return {
      contextualHints: { roleBasedHints: ['Refer to tool documentation for guidance'] },
      historicalPatterns: { patterns: [], confidence: 'none' },
      validationTips: { hints: [], missing: [], optional: [] },
      smartDefaults: {},
      completionSuggestions: [],
      confidence: 25,
      fallback: true
    };
  }

  /**
   * Get fallback historical patterns when database is unavailable
   */
  getFallbackHistoricalPatterns(toolName) {
    const fallbackPatterns = {
      'registry': [
        { name: 'AI Service Pattern', confidence: 'medium', usage: 'Common for AI/ML services' },
        { name: 'Data API Pattern', confidence: 'medium', usage: 'Common for data services' }
      ],
      'services': [
        { name: 'Capability Search', confidence: 'high', usage: 'Most effective discovery method' },
        { name: 'Category Browse', confidence: 'medium', usage: 'Good for exploration' },
        { name: 'Service Call Pattern', confidence: 'high', usage: 'Basic service interaction' }
      ]
    };

    return {
      patterns: fallbackPatterns[toolName] || [],
      confidence: 'fallback',
      sampleSize: 0,
      note: 'Using default patterns - no user history available'
    };
  }

  /**
   * Clear cache (for testing or maintenance)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect() {
    try {
      if (this.prisma) {
        await this.prisma.$disconnect();
      }
    } catch (error) {
      this.logger.error('Disconnect failed:', error);
    }
  }
}

module.exports = { EnterpriseParameterIntelligence };