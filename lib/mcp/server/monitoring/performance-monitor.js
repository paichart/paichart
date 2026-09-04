/**
 * Performance Monitoring System for Enhanced MCP Server
 * Tracks performance impact of enhancements with baseline comparison
 * 
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 */

const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.monitorLogger.child({ component: 'performance-monitor' }));

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.baselines = new Map();
    this.enabled = true;
    this.maxSamples = 100; // Keep last 100 samples per tool

    // Map size limits (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
    this.MAX_BASELINES = 200;        // Max unique tools to track
    this.MAX_METRICS = 1000;         // Max concurrent timing operations
    this.METRICS_TTL_MS = 5 * 60 * 1000; // 5 min TTL for orphaned metrics
    this.mapEvictionStats = { baselines: 0, metrics: 0 };

    this.alertThresholds = {
      slowResponseMultiplier: 2.0,    // Alert if response is 2x average
      memoryIncreaseThreshold: 50,    // Alert if memory increases by 50MB
      errorRateThreshold: 0.05        // Alert if error rate > 5%
    };

    // Setup periodic cleanup for orphaned metrics
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphanedMetrics();
    }, 60000); // Every 1 minute
    this.cleanupInterval.unref(); // Don't block process exit

    log.info('Initialized with monitoring enabled');
  }

  /**
   * Bounded baseline registration with LRU eviction
   * (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
   */
  setBaseline(toolName, baselineData) {
    if (this.baselines.size >= this.MAX_BASELINES && !this.baselines.has(toolName)) {
      // Find baseline with oldest last update (LRU)
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [key, baseline] of this.baselines.entries()) {
        const lastSample = baseline.samples[baseline.samples.length - 1];
        const lastTime = lastSample ? new Date(lastSample.timestamp).getTime() : 0;
        if (lastTime < oldestTime) {
          oldestTime = lastTime;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.baselines.delete(oldestKey);
        this.mapEvictionStats.baselines++;
        log.debug({ evictedKey: oldestKey }, '[LRU] Evicted oldest baseline');
      }
    }
    this.baselines.set(toolName, baselineData);
  }

  /**
   * Bounded metrics registration with LRU eviction
   * (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
   */
  setMetric(timingId, metricData) {
    if (this.metrics.size >= this.MAX_METRICS) {
      // Evict oldest metric (LRU by insertion order)
      const oldestKey = this.metrics.keys().next().value;
      if (oldestKey) {
        this.metrics.delete(oldestKey);
        this.mapEvictionStats.metrics++;
        log.debug({ evictedKey: oldestKey.substring(0, 30) }, '[LRU] Evicted oldest metric');
      }
    }
    this.metrics.set(timingId, metricData);
  }

  /**
   * Cleanup orphaned metrics (startTiming called but endTiming never called)
   * (time-bomb-detection-pattern.md - Category 4: Session TTL)
   */
  cleanupOrphanedMetrics() {
    const now = Date.now();
    const toRemove = [];

    for (const [timingId, metric] of this.metrics.entries()) {
      const metricTime = new Date(metric.timestamp).getTime();
      if (now - metricTime > this.METRICS_TTL_MS) {
        toRemove.push(timingId);
      }
    }

    toRemove.forEach(key => {
      this.metrics.delete(key);
      this.mapEvictionStats.metrics++;
    });

    if (toRemove.length > 0) {
      log.info({ orphanedCount: toRemove.length }, 'Cleaned up orphaned metrics (TTL expired)');
    }
  }

  /**
   * Start monitoring a tool call
   * @param {string} toolName - Name of the tool being called
   * @param {string} sessionId - Session identifier
   * @returns {string|null} Timing ID for ending the measurement
   */
  startTiming(toolName, sessionId = 'default') {
    if (!this.enabled) return null;

    const timingId = `${toolName}_${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = process.hrtime.bigint();
    const memoryStart = process.memoryUsage();

    // Use bounded setMetric helper
    this.setMetric(timingId, {
      toolName,
      sessionId,
      startTime,
      memoryStart,
      timestamp: new Date().toISOString()
    });

    return timingId;
  }

  /**
   * End monitoring and record metrics
   * @param {string|null} timingId - Timing ID from startTiming
   * @returns {Object|null} Performance metrics for this call
   */
  endTiming(timingId) {
    if (!this.enabled || !timingId) return null;
    
    const metric = this.metrics.get(timingId);
    if (!metric) {
      log.warn({ timingId }, '⚠️ Timing ID not found');
      return null;
    }
    
    const endTime = process.hrtime.bigint();
    const memoryEnd = process.memoryUsage();
    
    const result = {
      toolName: metric.toolName,
      sessionId: metric.sessionId,
      duration: Number(endTime - metric.startTime) / 1000000, // Convert to milliseconds
      memoryDelta: {
        rss: memoryEnd.rss - metric.memoryStart.rss,
        heapUsed: memoryEnd.heapUsed - metric.memoryStart.heapUsed,
        heapTotal: memoryEnd.heapTotal - metric.memoryStart.heapTotal,
        external: memoryEnd.external - metric.memoryStart.external
      },
      memoryEnd: memoryEnd,
      timestamp: metric.timestamp,
      endTimestamp: new Date().toISOString()
    };
    
    // Record the metric and check for alerts
    this.recordMetric(result);
    this.checkAlerts(result);
    
    // Clean up
    this.metrics.delete(timingId);
    
    return result;
  }

  /**
   * Record performance metric and update baselines
   * @param {Object} metric - Performance metric to record
   */
  recordMetric(metric) {
    const key = metric.toolName;

    if (!this.baselines.has(key)) {
      // Use bounded setBaseline helper for new entries
      this.setBaseline(key, {
        toolName: key,
        samples: [],
        stats: {
          avgDuration: 0,
          maxDuration: 0,
          minDuration: Infinity,
          p95Duration: 0,
          p99Duration: 0,
          avgMemoryDelta: 0,
          maxMemoryDelta: 0,
          errorCount: 0,
          totalCalls: 0
        }
      });
    }

    const baseline = this.baselines.get(key);
    baseline.samples.push(metric);

    // Keep only last N samples
    if (baseline.samples.length > this.maxSamples) {
      baseline.samples = baseline.samples.slice(-this.maxSamples);
    }

    // Update statistics
    this.updateStatistics(baseline);
  }

  /**
   * Update statistical calculations for a tool
   * @private
   * @param {Object} baseline - Baseline data for a tool
   */
  updateStatistics(baseline) {
    const samples = baseline.samples;
    const durations = samples.map(s => s.duration);
    const memoryDeltas = samples.map(s => s.memoryDelta.heapUsed);
    
    // Duration statistics
    baseline.stats.avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    baseline.stats.maxDuration = Math.max(...durations);
    baseline.stats.minDuration = Math.min(...durations);
    baseline.stats.totalCalls = samples.length;
    
    // Percentile calculations
    const sortedDurations = [...durations].sort((a, b) => a - b);
    baseline.stats.p95Duration = this.calculatePercentile(sortedDurations, 95);
    baseline.stats.p99Duration = this.calculatePercentile(sortedDurations, 99);
    
    // Memory statistics
    baseline.stats.avgMemoryDelta = memoryDeltas.reduce((a, b) => a + b, 0) / memoryDeltas.length;
    baseline.stats.maxMemoryDelta = Math.max(...memoryDeltas);
    
    // Error rate (would be updated elsewhere when errors occur)
    const errorSamples = samples.filter(s => s.error);
    baseline.stats.errorCount = errorSamples.length;
  }

  /**
   * Calculate percentile from sorted array
   * @private
   * @param {Array<number>} sortedArray - Sorted array of values
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} Percentile value
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Check for performance alerts
   * @private
   * @param {Object} metric - Current metric to check
   */
  checkAlerts(metric) {
    const baseline = this.baselines.get(metric.toolName);
    if (!baseline || baseline.samples.length < 5) return; // Need some samples for comparison
    
    const stats = baseline.stats;
    
    // Slow response alert
    if (metric.duration > stats.avgDuration * this.alertThresholds.slowResponseMultiplier) {
      log.warn({ toolName: metric.toolName, durationMs: metric.duration.toFixed(2), avgMs: stats.avgDuration.toFixed(2) }, '🐌 Slow response detected');
    }
    
    // Memory increase alert
    const memoryIncreaseMB = metric.memoryDelta.heapUsed / (1024 * 1024);
    if (memoryIncreaseMB > this.alertThresholds.memoryIncreaseThreshold) {
      log.warn({ toolName: metric.toolName, memoryIncreaseMB: memoryIncreaseMB.toFixed(2) }, '🧠 High memory usage detected');
    }
    
    // Error rate alert
    const errorRate = stats.errorCount / stats.totalCalls;
    if (errorRate > this.alertThresholds.errorRateThreshold) {
      log.warn({ toolName: metric.toolName, errorRatePercent: (errorRate * 100).toFixed(1) }, '❌ High error rate detected');
    }
  }

  /**
   * Record an error for a tool
   * @param {string} toolName - Name of the tool that errored
   * @param {Error} error - Error that occurred
   * @param {number} duration - Duration before error occurred
   */
  recordError(toolName, error, duration = 0) {
    const errorMetric = {
      toolName,
      duration,
      error: true,
      errorMessage: error.message,
      errorCode: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
      memoryDelta: { heapUsed: 0, rss: 0, heapTotal: 0, external: 0 }
    };
    
    this.recordMetric(errorMetric);
    log.warn({ toolName, err: error }, 'Error recorded');
  }

  /**
   * Get performance summary for all tools
   * @returns {Object} Performance summary
   */
  getSummary() {
    const summary = {
      totalTools: this.baselines.size,
      overallStats: {
        totalCalls: 0,
        totalErrors: 0,
        avgResponseTime: 0,
        slowestTool: null,
        fastestTool: null
      },
      toolStats: {}
    };
    
    let totalDuration = 0;
    let totalCalls = 0;
    let maxAvgDuration = 0;
    let minAvgDuration = Infinity;
    
    for (const [toolName, baseline] of this.baselines) {
      const stats = baseline.stats;
      
      summary.toolStats[toolName] = {
        avgDuration: Math.round(stats.avgDuration * 100) / 100,
        maxDuration: Math.round(stats.maxDuration * 100) / 100,
        minDuration: Math.round(stats.minDuration * 100) / 100,
        p95Duration: Math.round(stats.p95Duration * 100) / 100,
        p99Duration: Math.round(stats.p99Duration * 100) / 100,
        avgMemoryDelta: Math.round(stats.avgMemoryDelta / 1024), // Convert to KB
        maxMemoryDelta: Math.round(stats.maxMemoryDelta / 1024), // Convert to KB
        totalCalls: stats.totalCalls,
        errorCount: stats.errorCount,
        errorRate: stats.totalCalls > 0 ? Math.round((stats.errorCount / stats.totalCalls) * 10000) / 100 : 0
      };
      
      // Update overall stats
      totalDuration += stats.avgDuration * stats.totalCalls;
      totalCalls += stats.totalCalls;
      summary.overallStats.totalErrors += stats.errorCount;
      
      if (stats.avgDuration > maxAvgDuration) {
        maxAvgDuration = stats.avgDuration;
        summary.overallStats.slowestTool = toolName;
      }
      
      if (stats.avgDuration < minAvgDuration && stats.totalCalls > 0) {
        minAvgDuration = stats.avgDuration;
        summary.overallStats.fastestTool = toolName;
      }
    }
    
    summary.overallStats.totalCalls = totalCalls;
    summary.overallStats.avgResponseTime = totalCalls > 0 ? Math.round((totalDuration / totalCalls) * 100) / 100 : 0;
    summary.overallStats.errorRate = totalCalls > 0 ? Math.round((summary.overallStats.totalErrors / totalCalls) * 10000) / 100 : 0;
    
    return summary;
  }

  /**
   * Compare current performance to baseline
   * @param {string} toolName - Tool to compare
   * @param {number} currentDuration - Current response duration
   * @returns {Object|null} Comparison results
   */
  compareToBaseline(toolName, currentDuration) {
    const baseline = this.baselines.get(toolName);
    if (!baseline || baseline.stats.totalCalls === 0) return null;
    
    const baselineAvg = baseline.stats.avgDuration;
    const percentChange = ((currentDuration - baselineAvg) / baselineAvg) * 100;
    
    return {
      current: Math.round(currentDuration * 100) / 100,
      baseline: Math.round(baselineAvg * 100) / 100,
      percentChange: Math.round(percentChange * 100) / 100,
      status: percentChange > 20 ? 'degraded' : percentChange < -20 ? 'improved' : 'stable',
      samples: baseline.stats.totalCalls
    };
  }

  /**
   * Get detailed metrics for a specific tool
   * @param {string} toolName - Tool name to get metrics for
   * @returns {Object|null} Detailed metrics
   */
  getToolMetrics(toolName) {
    const baseline = this.baselines.get(toolName);
    if (!baseline) return null;
    
    return {
      toolName,
      stats: { ...baseline.stats },
      recentSamples: baseline.samples.slice(-10).map(sample => ({
        duration: Math.round(sample.duration * 100) / 100,
        memoryDelta: Math.round(sample.memoryDelta.heapUsed / 1024), // KB
        timestamp: sample.timestamp,
        error: sample.error || false
      }))
    };
  }

  /**
   * Reset all metrics (useful for testing or baseline reset)
   */
  reset() {
    log.info('🔄 Resetting all metrics');
    this.metrics.clear();
    this.baselines.clear();
    this.mapEvictionStats = { baselines: 0, metrics: 0 };
  }

  /**
   * Shutdown the performance monitor
   * (time-bomb-detection-pattern.md - Category 3: Proper shutdown handler)
   */
  shutdown() {
    log.info('Shutting down...');

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all data
    this.metrics.clear();
    this.baselines.clear();

    log.info('Shutdown complete - all resources released');
  }

  /**
   * Get monitor statistics including eviction data
   * (time-bomb-detection-pattern.md - Expose stats for monitoring)
   */
  getMonitorStats() {
    return {
      enabled: this.enabled,
      metrics: {
        active: this.metrics.size,
        max: this.MAX_METRICS,
        ttlMs: this.METRICS_TTL_MS
      },
      baselines: {
        count: this.baselines.size,
        max: this.MAX_BASELINES,
        maxSamplesPerTool: this.maxSamples
      },
      evictions: this.mapEvictionStats,
      alertThresholds: this.alertThresholds
    };
  }

  /**
   * Enable/disable monitoring
   * @param {boolean} enabled - Whether to enable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    log.info({ enabled }, enabled ? '✅ Monitoring enabled' : '❌ Monitoring disabled');
  }

  /**
   * Update alert thresholds
   * @param {Object} thresholds - New threshold values
   */
  updateThresholds(thresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    log.info({ thresholds: this.alertThresholds }, '🔧 Updated alert thresholds');
  }

  /**
   * Export metrics for external analysis
   * @returns {Object} Exportable metrics data
   */
  exportMetrics() {
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: this.getSummary(),
      rawData: {}
    };
    
    for (const [toolName, baseline] of this.baselines) {
      exportData.rawData[toolName] = {
        stats: baseline.stats,
        samples: baseline.samples
      };
    }
    
    return exportData;
  }

  /**
   * Generate performance report
   * @returns {string} Formatted performance report
   */
  generateReport() {
    const summary = this.getSummary();
    
    let report = '\n📊 Performance Monitor Report\n';
    report += '================================\n\n';
    
    report += `📈 Overall Statistics:\n`;
    report += `• Total Tools Monitored: ${summary.totalTools}\n`;
    report += `• Total Calls: ${summary.overallStats.totalCalls}\n`;
    report += `• Average Response Time: ${summary.overallStats.avgResponseTime}ms\n`;
    report += `• Total Errors: ${summary.overallStats.totalErrors} (${summary.overallStats.errorRate}%)\n`;
    report += `• Fastest Tool: ${summary.overallStats.fastestTool || 'N/A'}\n`;
    report += `• Slowest Tool: ${summary.overallStats.slowestTool || 'N/A'}\n\n`;
    
    report += `🔧 Tool Performance:\n`;
    for (const [toolName, stats] of Object.entries(summary.toolStats)) {
      report += `\n• ${toolName}:\n`;
      report += `  - Avg: ${stats.avgDuration}ms | Max: ${stats.maxDuration}ms | Min: ${stats.minDuration}ms\n`;
      report += `  - P95: ${stats.p95Duration}ms | P99: ${stats.p99Duration}ms\n`;
      report += `  - Memory: ${stats.avgMemoryDelta}KB avg, ${stats.maxMemoryDelta}KB max\n`;
      report += `  - Calls: ${stats.totalCalls} | Errors: ${stats.errorCount} (${stats.errorRate}%)\n`;
    }
    
    return report;
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Export both class and singleton
module.exports = { 
  PerformanceMonitor, 
  performanceMonitor 
};
