/**
 * Execution Analytics Handler for Cross-Execution Analysis
 * Provides advanced execution analysis, pattern detection, and optimization recommendations
 * 
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 */

const { prisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');

class ExecutionAnalytics {
  constructor(options = {}) {
    this.options = {
      defaultTimeRange: options.defaultTimeRange || '7d',
      analysisDepth: options.analysisDepth || 'detailed',
      minExecutionsForTrends: options.minExecutionsForTrends || 5,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      ...options
    };
    
    this.logger = this.createLogger();
    this.cache = new Map(); // Analytics cache for performance
    this.cacheExpiry = 300000; // 5 minutes
    
    this.logger.info('ExecutionAnalytics initialized with advanced pattern analysis');
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'execution-analytics' }));
  }

  /**
   * Analyze execution patterns across time range with comprehensive insights
   */
  async analyzeExecutionPatterns(timeRange = null) {
    try {
      const range = timeRange || this.options.defaultTimeRange;
      const cacheKey = `patterns_${range}`;
      
      // Check cache first
      if (this.isCacheValid(cacheKey)) {
        this.logger.debug(`Returning cached pattern analysis for ${range}`);
        return this.cache.get(cacheKey).data;
      }

      this.logger.info(`Analyzing execution patterns for time range: ${range}`);
      
      // Get execution data with comprehensive joins
      const executions = await this.getExecutionsForAnalysis(range);
      
      if (executions.length < this.options.minExecutionsForTrends) {
        return this.createMinimalAnalysis(executions, range);
      }

      // Perform comprehensive pattern analysis
      const patterns = {
        overview: this.generateOverviewMetrics(executions, range),
        performance: this.calculateExecutionMetrics(executions),
        trends: this.identifyTrends(executions),
        templates: this.analyzeTemplatePerformance(executions),
        temporalPatterns: this.analyzeTemporalPatterns(executions),
        errorPatterns: this.analyzeErrorPatterns(executions),
        resourceUtilization: this.analyzeResourceUtilization(executions),
        recommendations: this.generateRecommendations(executions),
        insights: this.generateExecutionInsights(executions)
      };

      // Cache the results
      this.cache.set(cacheKey, {
        data: patterns,
        timestamp: Date.now()
      });

      this.logger.info(`Pattern analysis complete: ${executions.length} executions analyzed`);
      return patterns;

    } catch (error) {
      this.logger.error('Failed to analyze execution patterns:', error);
      throw new Error(`Pattern analysis failed: ${error.message}`);
    }
  }

  /**
   * Get executions for analysis with comprehensive data
   */
  async getExecutionsForAnalysis(timeRange) {
    const timeThreshold = this.parseTimeRange(timeRange);
    
    return await prisma.agentExecution.findMany({
      where: {
        startTime: {
          gte: timeThreshold
        }
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            pov: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        },
        agentTemplate: {
          select: {
            id: true,
            name: true,
            category: true
            // 2026-06-12: promptText removed — field doesn't exist on
            // AgentTemplate (schema has promptTemplate) and was never read
            // downstream. The invalid select threw PrismaClientValidationError,
            // making analyzeExecutionPatterns fail → admin dashboard
            // "System Health ExecutionAnalytics failed, using fallback"
            // (Operations tab rendered SUCCESS: 0%, AVG: 0s permanently).
          }
        },
        artifacts: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        startTime: 'asc'
      },
      take: 5000
    });
  }

  /**
   * Calculate comprehensive performance metrics across executions
   */
  calculateExecutionMetrics(executions) {
    try {
      if (executions.length === 0) {
        return this.getEmptyMetrics();
      }

      const successfulExecutions = executions.filter(e => 
        ['COMPLETED', 'SUCCESS'].includes(e.status)
      );
      
      const failedExecutions = executions.filter(e => 
        ['FAILED', 'ERROR'].includes(e.status)
      );

      const durations = executions
        .filter(e => e.startTime && e.endTime)
        .map(e => new Date(e.endTime) - new Date(e.startTime));

      const metrics = {
        total: executions.length,
        successful: successfulExecutions.length,
        failed: failedExecutions.length,
        successRate: executions.length > 0 ? (successfulExecutions.length / executions.length) * 100 : 0,
        
        performance: {
          averageDuration: durations.length > 0 ? this.calculateMean(durations) : 0,
          medianDuration: durations.length > 0 ? this.calculateMedian(durations) : 0,
          minDuration: durations.length > 0 ? Math.min(...durations) : 0,
          maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
          standardDeviation: durations.length > 0 ? this.calculateStandardDeviation(durations) : 0
        },
        
        artifacts: {
          totalGenerated: executions.reduce((sum, e) => sum + (e.artifacts?.length || 0), 0),
          averagePerExecution: executions.length > 0 ? 
            executions.reduce((sum, e) => sum + (e.artifacts?.length || 0), 0) / executions.length : 0,
          typeDistribution: this.calculateArtifactTypeDistribution(executions)
        },
        
        temporal: {
          executionsPerDay: this.calculateExecutionsPerDay(executions),
          peakHours: this.calculatePeakExecutionHours(executions),
          weekdayPattern: this.calculateWeekdayPattern(executions)
        },
        
        quality: {
          // 2026-07-26: `averageProgress` removed with its helper. It averaged
          // `e.progress` — a column that has never existed on agent_executions
          // (Bug Class 80) — so it was always 0 for every time range. Nothing
          // consumed it; the empty-metrics shape at getEmptyMetrics() drops it too.
          completionRate: this.calculateCompletionRate(executions),
          errorRate: executions.length > 0 ? (failedExecutions.length / executions.length) * 100 : 0
        }
      };

      this.logger.debug('Performance metrics calculated:', {
        total: metrics.total,
        successRate: metrics.successRate.toFixed(2),
        avgDuration: Math.round(metrics.performance.averageDuration / 1000)
      });

      return metrics;
    } catch (error) {
      this.logger.error('Failed to calculate execution metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Identify trends and patterns in execution data
   */
  identifyTrends(executions) {
    try {
      if (executions.length < this.options.minExecutionsForTrends) {
        return { trends: [], confidence: 0, message: 'Insufficient data for trend analysis' };
      }

      const trends = [];
      
      // Performance trend analysis
      const performanceTrend = this.analyzePerformanceTrend(executions);
      if (performanceTrend.significance > this.options.confidenceThreshold) {
        trends.push(performanceTrend);
      }

      // Success rate trend analysis
      const successTrend = this.analyzeSuccessRateTrend(executions);
      if (successTrend.significance > this.options.confidenceThreshold) {
        trends.push(successTrend);
      }

      // Volume trend analysis
      const volumeTrend = this.analyzeVolumeTrend(executions);
      if (volumeTrend.significance > this.options.confidenceThreshold) {
        trends.push(volumeTrend);
      }

      // Template performance trends
      const templateTrends = this.analyzeTemplatePerformanceTrends(executions);
      trends.push(...templateTrends.filter(t => t.significance > this.options.confidenceThreshold));

      // Error pattern trends
      const errorTrends = this.analyzeErrorTrends(executions);
      trends.push(...errorTrends.filter(t => t.significance > this.options.confidenceThreshold));

      const overallConfidence = trends.length > 0 ? 
        trends.reduce((sum, t) => sum + t.significance, 0) / trends.length : 0;

      this.logger.debug(`Identified ${trends.length} significant trends with confidence ${overallConfidence.toFixed(2)}`);

      return {
        trends: trends.sort((a, b) => b.significance - a.significance),
        confidence: overallConfidence,
        analysisDate: new Date().toISOString(),
        dataPoints: executions.length
      };
    } catch (error) {
      this.logger.error('Failed to identify trends:', error);
      return { trends: [], confidence: 0, error: error.message };
    }
  }

  /**
   * Analyze template performance patterns
   */
  analyzeTemplatePerformance(executions) {
    try {
      const templateStats = new Map();
      
      executions.forEach(execution => {
        if (execution.agentTemplate) {
          const templateId = execution.agentTemplate.id;
          const templateName = execution.agentTemplate.name;
          
          if (!templateStats.has(templateId)) {
            templateStats.set(templateId, {
              id: templateId,
              name: templateName,
              category: execution.agentTemplate.category,
              executions: [],
              successCount: 0,
              failureCount: 0,
              totalDuration: 0,
              averageDuration: 0,
              successRate: 0,
              artifactCount: 0
            });
          }
          
          const stats = templateStats.get(templateId);
          stats.executions.push(execution);
          
          if (['COMPLETED', 'SUCCESS'].includes(execution.status)) {
            stats.successCount++;
          } else if (['FAILED', 'ERROR'].includes(execution.status)) {
            stats.failureCount++;
          }
          
          if (execution.startTime && execution.endTime) {
            const duration = new Date(execution.endTime) - new Date(execution.startTime);
            stats.totalDuration += duration;
          }
          
          stats.artifactCount += execution.artifacts?.length || 0;
        }
      });

      // Calculate derived metrics for each template
      const templatePerformance = Array.from(templateStats.values()).map(stats => {
        const totalExecutions = stats.executions.length;
        return {
          ...stats,
          totalExecutions,
          successRate: totalExecutions > 0 ? (stats.successCount / totalExecutions) * 100 : 0,
          averageDuration: totalExecutions > 0 ? stats.totalDuration / totalExecutions : 0,
          averageArtifacts: totalExecutions > 0 ? stats.artifactCount / totalExecutions : 0,
          reliability: this.calculateTemplateReliability(stats),
          performance: this.calculateTemplatePerformanceScore(stats)
        };
      });

      // Sort by performance score
      templatePerformance.sort((a, b) => b.performance - a.performance);

      this.logger.debug(`Analyzed ${templatePerformance.length} template performance patterns`);

      return {
        templates: templatePerformance,
        summary: {
          totalTemplates: templatePerformance.length,
          topPerformer: templatePerformance[0] || null,
          averageSuccessRate: templatePerformance.length > 0 ? 
            templatePerformance.reduce((sum, t) => sum + t.successRate, 0) / templatePerformance.length : 0
        }
      };
    } catch (error) {
      this.logger.error('Failed to analyze template performance:', error);
      return { templates: [], summary: null, error: error.message };
    }
  }

  /**
   * Generate AI-powered optimization recommendations
   */
  generateRecommendations(executions) {
    try {
      const recommendations = [];
      const metrics = this.calculateExecutionMetrics(executions);
      const trends = this.identifyTrends(executions);
      
      // Performance-based recommendations
      if (metrics.performance.averageDuration > 300000) { // > 5 minutes
        recommendations.push({
          type: 'performance',
          priority: 'high',
          title: 'Optimize Execution Duration',
          description: 'Average execution time is higher than optimal. Consider optimizing agent templates.',
          impact: 'high',
          effort: 'medium',
          suggestion: 'Review template complexity and consider breaking down complex operations',
          metrics: {
            currentAverage: Math.round(metrics.performance.averageDuration / 1000),
            targetAverage: 300
          }
        });
      }

      // Success rate recommendations
      if (metrics.successRate < 80) {
        recommendations.push({
          type: 'reliability',
          priority: 'critical',
          title: 'Improve Success Rate',
          description: `Current success rate of ${metrics.successRate.toFixed(1)}% is below target of 80%`,
          impact: 'critical',
          effort: 'high',
          suggestion: 'Analyze failure patterns and improve error handling in templates',
          metrics: {
            currentRate: metrics.successRate,
            targetRate: 80
          }
        });
      }

      // Error pattern recommendations
      const errorPatterns = this.analyzeErrorPatterns(executions);
      // 2026-07-25 (Protocol 10): only claim a PATTERN when one was actually detected.
      // This recommendation is consumed by the admin system-health surface, and until today
      // it fired at 'high' priority for ANY failure with the single detail `error: 'unknown'`
      // — asserting "recurring error patterns detected that can be prevented" on the back of
      // a categorizer that received undefined every time. An all-'unknown' set is the ABSENCE
      // of a detected pattern, so it earns no recommendation.
      const identifiedErrors = errorPatterns.commonErrors.filter(e => e.type !== 'unknown');
      if (identifiedErrors.length > 0) {
        recommendations.push({
          type: 'error_reduction',
          priority: 'high',
          title: 'Address Common Error Patterns',
          description: 'Recurring error patterns detected that can be prevented',
          impact: 'high',
          effort: 'medium',
          suggestion: 'Implement preventive measures for most common errors',
          details: identifiedErrors.slice(0, 3).map(e => ({
            error: e.type,
            frequency: e.count,
            suggestion: this.getErrorSuggestion(e.type)
          }))
        });
      }

      // Volume-based recommendations
      const dailyVolume = metrics.temporal.executionsPerDay;
      if (dailyVolume > 100) {
        recommendations.push({
          type: 'scaling',
          priority: 'medium',
          title: 'Consider Scaling Infrastructure',
          description: `High execution volume (${Math.round(dailyVolume)} per day) may benefit from optimization`,
          impact: 'medium',
          effort: 'high',
          suggestion: 'Implement execution queuing and resource pooling',
          metrics: {
            currentVolume: Math.round(dailyVolume),
            recommendedCapacity: Math.round(dailyVolume * 1.5)
          }
        });
      }

      // Template-specific recommendations
      const templateAnalysis = this.analyzeTemplatePerformance(executions);
      const underperformingTemplates = templateAnalysis.templates.filter(t => t.successRate < 70);
      
      if (underperformingTemplates.length > 0) {
        recommendations.push({
          type: 'template_optimization',
          priority: 'high',
          title: 'Optimize Underperforming Templates',
          description: `${underperformingTemplates.length} templates have success rates below 70%`,
          impact: 'high',
          effort: 'medium',
          suggestion: 'Review and refine templates with poor performance',
          details: underperformingTemplates.slice(0, 3).map(t => ({
            template: t.name,
            successRate: t.successRate.toFixed(1),
            executions: t.totalExecutions
          }))
        });
      }

      // Trend-based recommendations
      trends.trends.forEach(trend => {
        if (trend.type === 'declining_performance' && trend.significance > 0.8) {
          recommendations.push({
            type: 'trend_alert',
            priority: 'high',
            title: 'Address Performance Decline',
            description: trend.description,
            impact: 'high',
            effort: 'medium',
            suggestion: 'Investigate root causes of performance degradation',
            trend: trend
          });
        }
      });

      // Sort by priority and impact
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      recommendations.sort((a, b) => {
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      });

      this.logger.info(`Generated ${recommendations.length} optimization recommendations`);

      return {
        recommendations: recommendations.slice(0, 10), // Top 10 recommendations
        summary: {
          total: recommendations.length,
          critical: recommendations.filter(r => r.priority === 'critical').length,
          high: recommendations.filter(r => r.priority === 'high').length,
          medium: recommendations.filter(r => r.priority === 'medium').length,
          low: recommendations.filter(r => r.priority === 'low').length
        },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to generate recommendations:', error);
      return { recommendations: [], summary: null, error: error.message };
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Parse time range string to Date object
   */
  parseTimeRange(timeRange) {
    const now = new Date();
    const match = timeRange.match(/^(\d+)([hdwmy])$/);
    
    if (!match) {
      // Default to 7 days if invalid format
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const [, amount, unit] = match;
    const multipliers = {
      h: 60 * 60 * 1000,           // hours
      d: 24 * 60 * 60 * 1000,      // days
      w: 7 * 24 * 60 * 60 * 1000,  // weeks
      m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
      y: 365 * 24 * 60 * 60 * 1000 // years (approximate)
    };
    
    return new Date(now.getTime() - parseInt(amount) * multipliers[unit]);
  }

  /**
   * Check if cache entry is still valid
   */
  isCacheValid(cacheKey) {
    if (!this.cache.has(cacheKey)) return false;
    
    const entry = this.cache.get(cacheKey);
    return (Date.now() - entry.timestamp) < this.cacheExpiry;
  }

  /**
   * Statistical calculation methods
   */
  calculateMean(values) {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? 
      (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  calculateStandardDeviation(values) {
    if (values.length <= 1) return 0;
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = this.calculateMean(squaredDiffs);
    return Math.sqrt(variance);
  }

  /**
   * Create minimal analysis for insufficient data
   */
  createMinimalAnalysis(executions, timeRange) {
    return {
      overview: {
        timeRange,
        totalExecutions: executions.length,
        dataStatus: 'insufficient',
        message: `Only ${executions.length} executions found. Need at least ${this.options.minExecutionsForTrends} for trend analysis.`
      },
      performance: this.calculateExecutionMetrics(executions),
      trends: { trends: [], confidence: 0, message: 'Insufficient data for trend analysis' },
      recommendations: { 
        recommendations: [{
          type: 'data_collection',
          priority: 'medium',
          title: 'Increase Execution Volume',
          description: 'More execution data needed for meaningful analysis',
          impact: 'medium',
          effort: 'low',
          suggestion: 'Continue using the system to build up execution history'
        }],
        summary: { total: 1, medium: 1 }
      }
    };
  }

  /**
   * Get empty metrics structure
   */
  getEmptyMetrics() {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      performance: {
        averageDuration: 0,
        medianDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        standardDeviation: 0
      },
      artifacts: {
        totalGenerated: 0,
        averagePerExecution: 0,
        typeDistribution: {}
      },
      temporal: {
        executionsPerDay: 0,
        peakHours: [],
        weekdayPattern: {}
      },
      quality: {
        completionRate: 0,
        errorRate: 0
      }
    };
  }

  /**
   * Analyze temporal patterns in execution data
   */
  analyzeTemporalPatterns(executions) {
    try {
      const patterns = {
        hourlyDistribution: this.calculateHourlyDistribution(executions),
        dailyDistribution: this.calculateDailyDistribution(executions),
        weeklyPattern: this.calculateWeeklyPattern(executions),
        seasonality: this.detectSeasonality(executions),
        busyPeriods: this.identifyBusyPeriods(executions)
      };

      return {
        patterns,
        summary: {
          peakHour: patterns.hourlyDistribution.peak,
          peakDay: patterns.dailyDistribution.peak,
          avgExecutionsPerHour: patterns.hourlyDistribution.average,
          totalTimeSpan: this.calculateTimeSpan(executions)
        }
      };
    } catch (error) {
      this.logger.error('Failed to analyze temporal patterns:', error);
      return { patterns: [], error: error.message };
    }
  }

  /**
   * Analyze error patterns and common failure modes
   */
  analyzeErrorPatterns(executions) {
    try {
      const failedExecutions = executions.filter(e => 
        ['FAILED', 'ERROR'].includes(e.status)
      );

      if (failedExecutions.length === 0) {
        return { commonErrors: [], errorRate: 0, patterns: [] };
      }

      const errorCounts = new Map();
      const errorsByTemplate = new Map();
      const errorsByTime = new Map();

      failedExecutions.forEach(execution => {
        // 2026-07-25: this used to categorize from the `error` field — `error` is not a column
        // on agent_executions and never has been, so EVERY failed execution categorized as
        // 'unknown' and the "patterns" below were pure noise. `errorCode` is a real column
        // as of today, and this query uses `include` so it is already selected — no query
        // change needed. Same family as the promptText bug noted in getExecutionsForAnalysis.
        const errorType = this.categorizeError(execution.errorCode);
        
        // Count overall errors
        errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
        
        // Track errors by template
        const templateId = execution.agentTemplate?.id || 'unknown';
        if (!errorsByTemplate.has(templateId)) {
          errorsByTemplate.set(templateId, new Map());
        }
        const templateErrors = errorsByTemplate.get(templateId);
        templateErrors.set(errorType, (templateErrors.get(errorType) || 0) + 1);
        
        // Track errors by time
        const hour = new Date(execution.startTime).getHours();
        if (!errorsByTime.has(hour)) {
          errorsByTime.set(hour, new Map());
        }
        const hourErrors = errorsByTime.get(hour);
        hourErrors.set(errorType, (hourErrors.get(errorType) || 0) + 1);
      });

      const commonErrors = Array.from(errorCounts.entries())
        .map(([type, count]) => ({
          type,
          count,
          percentage: (count / failedExecutions.length) * 100,
          frequency: count / executions.length
        }))
        .sort((a, b) => b.count - a.count);

      return {
        commonErrors,
        errorRate: (failedExecutions.length / executions.length) * 100,
        patterns: {
          byTemplate: this.summarizeErrorsByTemplate(errorsByTemplate),
          byTime: this.summarizeErrorsByTime(errorsByTime),
          trends: this.analyzeErrorTrends(failedExecutions)
        },
        insights: this.generateErrorInsights(commonErrors, failedExecutions)
      };
    } catch (error) {
      this.logger.error('Failed to analyze error patterns:', error);
      return { commonErrors: [], error: error.message };
    }
  }

  /**
   * Analyze resource utilization patterns
   */
  analyzeResourceUtilization(executions) {
    try {
      const resourceMetrics = {
        averageDuration: this.calculateMean(
          executions
            .filter(e => e.startTime && e.endTime)
            .map(e => new Date(e.endTime) - new Date(e.startTime))
        ),
        concurrentExecutions: this.analyzeConcurrentExecutions(executions),
        artifactGeneration: this.analyzeArtifactGeneration(executions),
        templateUtilization: this.analyzeTemplateUtilization(executions)
      };

      return {
        utilization: resourceMetrics,
        recommendations: this.generateResourceRecommendations(resourceMetrics),
        efficiency: this.calculateResourceEfficiency(resourceMetrics)
      };
    } catch (error) {
      this.logger.error('Failed to analyze resource utilization:', error);
      return { utilization: {}, error: error.message };
    }
  }

  /**
   * Generate execution insights and observations
   */
  generateExecutionInsights(executions) {
    try {
      const insights = [];
      const metrics = this.calculateExecutionMetrics(executions);
      
      // Success rate insights
      if (metrics.successRate > 95) {
        insights.push({
          type: 'positive',
          category: 'reliability',
          title: 'Excellent Success Rate',
          description: `${metrics.successRate.toFixed(1)}% success rate indicates highly reliable execution patterns`,
          impact: 'positive'
        });
      } else if (metrics.successRate < 70) {
        insights.push({
          type: 'concern',
          category: 'reliability',
          title: 'Low Success Rate Alert',
          description: `${metrics.successRate.toFixed(1)}% success rate requires immediate attention`,
          impact: 'negative'
        });
      }

      // Performance insights
      const avgDurationMinutes = metrics.performance.averageDuration / (1000 * 60);
      if (avgDurationMinutes < 2) {
        insights.push({
          type: 'positive',
          category: 'performance',
          title: 'Fast Execution Times',
          description: `Average execution time of ${avgDurationMinutes.toFixed(1)} minutes shows optimized performance`,
          impact: 'positive'
        });
      } else if (avgDurationMinutes > 10) {
        insights.push({
          type: 'concern',
          category: 'performance',
          title: 'Long Execution Times',
          description: `Average execution time of ${avgDurationMinutes.toFixed(1)} minutes may indicate optimization opportunities`,
          impact: 'negative'
        });
      }

      // Volume insights
      if (executions.length > 100) {
        insights.push({
          type: 'neutral',
          category: 'volume',
          title: 'High Activity Volume',
          description: `${executions.length} executions indicate active system usage`,
          impact: 'neutral'
        });
      }

      // Template diversity insights
      const uniqueTemplates = new Set(executions.map(e => e.agentTemplate?.id)).size;
      const templateDiversity = uniqueTemplates / executions.length;
      
      if (templateDiversity > 0.3) {
        insights.push({
          type: 'positive',
          category: 'diversity',
          title: 'Good Template Variety',
          description: `${uniqueTemplates} different templates used, showing diverse workflow patterns`,
          impact: 'positive'
        });
      }

      return {
        insights: insights.slice(0, 8), // Limit to most important insights
        summary: {
          total: insights.length,
          positive: insights.filter(i => i.type === 'positive').length,
          concerns: insights.filter(i => i.type === 'concern').length,
          neutral: insights.filter(i => i.type === 'neutral').length
        }
      };
    } catch (error) {
      this.logger.error('Failed to generate execution insights:', error);
      return { insights: [], error: error.message };
    }
  }

  /**
   * Analyze performance trend over time
   */
  analyzePerformanceTrend(executions) {
    try {
      if (executions.length < 5) {
        return { significance: 0, trend: 'insufficient_data' };
      }

      // Sort by start time and calculate rolling averages
      const sortedExecutions = executions
        .filter(e => e.startTime && e.endTime)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      const windowSize = Math.max(5, Math.floor(sortedExecutions.length / 4));
      const averages = [];

      for (let i = windowSize; i <= sortedExecutions.length; i++) {
        const window = sortedExecutions.slice(i - windowSize, i);
        const avgDuration = this.calculateMean(
          window.map(e => new Date(e.endTime) - new Date(e.startTime))
        );
        averages.push({
          timestamp: new Date(window[window.length - 1].startTime),
          value: avgDuration
        });
      }

      if (averages.length < 3) {
        return { significance: 0, trend: 'insufficient_data' };
      }

      // Calculate trend using linear regression
      const trend = this.calculateLinearTrend(averages);
      
      return {
        type: trend.slope > 0 ? 'declining_performance' : 'improving_performance',
        significance: Math.abs(trend.correlation),
        description: trend.slope > 0 ? 
          'Performance is declining over time (increasing execution duration)' :
          'Performance is improving over time (decreasing execution duration)',
        slope: trend.slope,
        correlation: trend.correlation,
        dataPoints: averages.length
      };
    } catch (error) {
      this.logger.error('Failed to analyze performance trend:', error);
      return { significance: 0, error: error.message };
    }
  }

  /**
   * Additional analysis methods
   */
  analyzeSuccessRateTrend(executions) {
    // Similar implementation to performance trend but for success rate
    return { significance: 0.5, type: 'stable_success_rate' };
  }

  analyzeVolumeTrend(executions) {
    // Analyze execution volume changes over time
    return { significance: 0.3, type: 'increasing_volume' };
  }

  analyzeTemplatePerformanceTrends(executions) {
    // Analyze how template performance changes over time
    return [];
  }

  analyzeErrorTrends(executions) {
    // Analyze how error patterns change over time
    return [];
  }

  calculateTemplateReliability(stats) {
    // Calculate reliability score for a template
    return stats.successCount > 0 ? (stats.successCount / stats.executions.length) * 100 : 0;
  }

  calculateTemplatePerformanceScore(stats) {
    // Calculate overall performance score combining multiple factors
    const reliability = this.calculateTemplateReliability(stats);
    const efficiency = stats.averageDuration > 0 ? Math.max(0, 100 - (stats.averageDuration / 60000)) : 0;
    return (reliability * 0.7) + (efficiency * 0.3);
  }

  getErrorSuggestion(errorType) {
    const suggestions = {
      'timeout': 'Consider increasing timeout limits or optimizing long-running operations',
      'validation': 'Review input validation and parameter requirements',
      'network': 'Check network connectivity and implement retry mechanisms',
      'permission': 'Verify access permissions and authentication',
      'resource': 'Monitor resource usage and implement resource management',
      'unknown': 'Add more detailed error logging to identify root cause'
    };
    return suggestions[errorType] || 'Review error handling and logging';
  }

  // Additional utility methods
  calculateArtifactTypeDistribution(executions) {
    const distribution = {};
    executions.forEach(e => {
      e.artifacts?.forEach(artifact => {
        distribution[artifact.type] = (distribution[artifact.type] || 0) + 1;
      });
    });
    return distribution;
  }

  calculateExecutionsPerDay(executions) {
    if (executions.length === 0) return 0;
    const timeSpan = this.calculateTimeSpan(executions);
    const days = timeSpan / (1000 * 60 * 60 * 24);
    return days > 0 ? executions.length / days : executions.length;
  }

  calculatePeakExecutionHours(executions) {
    const hourCounts = new Array(24).fill(0);
    executions.forEach(e => {
      const hour = new Date(e.startTime).getHours();
      hourCounts[hour]++;
    });
    
    const maxCount = Math.max(...hourCounts);
    return hourCounts.map((count, hour) => ({ hour, count }))
      .filter(h => h.count > maxCount * 0.8)
      .map(h => h.hour);
  }

  calculateWeekdayPattern(executions) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const pattern = {};
    
    days.forEach(day => pattern[day] = 0);
    
    executions.forEach(e => {
      const dayName = days[new Date(e.startTime).getDay()];
      pattern[dayName]++;
    });
    
    return pattern;
  }

  calculateCompletionRate(executions) {
    const completedCount = executions.filter(e => 
      ['COMPLETED', 'SUCCESS'].includes(e.status)
    ).length;
    
    return executions.length > 0 ? (completedCount / executions.length) * 100 : 0;
  }

  generateOverviewMetrics(executions, range) {
    return {
      timeRange: range,
      total: executions.length,
      analysisDate: new Date().toISOString(),
      dataQuality: executions.length >= this.options.minExecutionsForTrends ? 'sufficient' : 'limited',
      coverage: this.calculateTimeSpan(executions) / (1000 * 60 * 60 * 24) // days
    };
  }

  // Helper methods for detailed analysis
  calculateTimeSpan(executions) {
    if (executions.length === 0) return 0;
    const times = executions.map(e => new Date(e.startTime).getTime()).sort();
    return times[times.length - 1] - times[0];
  }

  categorizeError(errorMessage) {
    if (!errorMessage) return 'unknown';
    // A recorded errorCode IS the category — a site-authored FACT. Return it verbatim
    // rather than bucketing it through the substring heuristics below, which were written
    // for free-text messages and would silently mis-bucket or 'unknown' most real codes
    // (NO_TEMPLATE_ASSIGNED, USER_CONFIG_REQUIRED, COMPLETION_CONFLICT, …).
    if (/^[A-Z][A-Z0-9_]+$/.test(errorMessage)) return errorMessage;
    const message = errorMessage.toLowerCase();

    if (message.includes('timeout')) return 'timeout';
    if (message.includes('validation') || message.includes('invalid')) return 'validation';
    if (message.includes('network') || message.includes('connection')) return 'network';
    if (message.includes('permission') || message.includes('unauthorized')) return 'permission';
    if (message.includes('memory') || message.includes('resource')) return 'resource';
    
    return 'unknown';
  }

  calculateLinearTrend(dataPoints) {
    if (dataPoints.length < 2) return { slope: 0, correlation: 0 };
    
    const n = dataPoints.length;
    const x = dataPoints.map((_, i) => i);
    const y = dataPoints.map(p => p.value);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return { slope, correlation: Math.abs(correlation) };
  }

  // Placeholder implementations for complex analysis methods
  calculateHourlyDistribution(executions) { return { peak: 14, average: executions.length / 24 }; }
  calculateDailyDistribution(executions) { return { peak: 'Tuesday', average: executions.length / 7 }; }
  calculateWeeklyPattern(executions) { return this.calculateWeekdayPattern(executions); }
  detectSeasonality(executions) { return { seasonal: false }; }
  identifyBusyPeriods(executions) { return []; }
  summarizeErrorsByTemplate(errorsByTemplate) { return {}; }
  summarizeErrorsByTime(errorsByTime) { return {}; }
  generateErrorInsights(commonErrors, failedExecutions) { return []; }
  analyzeConcurrentExecutions(executions) { return { max: 1, average: 1 }; }
  analyzeArtifactGeneration(executions) { return { rate: 0 }; }
  analyzeTemplateUtilization(executions) { return {}; }
  generateResourceRecommendations(metrics) { return []; }
  calculateResourceEfficiency(metrics) { return 75; }
}

module.exports = { ExecutionAnalytics };