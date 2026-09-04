/**
 * Feature Flag System for Enhanced MCP Server
 *
 * Flags fall into two categories:
 *   1. Active production flags — checked via isEnabled() in tool handlers
 *   2. SDK/Compliance flags — enabled at startup to maintain capability posture
 *      with Claude Desktop and Anthropic SDK. These may not have isEnabled()
 *      consumers today but are advertised in server capabilities and could be
 *      checked by future SDK updates.
 *
 * @version 2.1.0
 * @author Enhanced MCP Server Team
 */

const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'feature-flags' }));

class FeatureFlags {
  constructor() {
    this.flags = {
      // ── Active production flags (checked via isEnabled) ──────────────
      // Parameter Intelligence
      parameterNormalization: true,  // Enable parameter normalization (3 uses)
      parameterIntelligence: true,   // Enhanced parameter intelligence (2 uses)

      // Error Handling
      smartErrorRecovery: true,      // Smart error analysis and suggestions (15+ uses)

      // ── SDK / Compliance flags (enabled at startup) ──────────────────
      // These are advertised in server capabilities and enabled by
      // mcp-server-v5.js during initialization and client configuration.
      // They maintain compliance posture with Claude Desktop / Anthropic SDK.
      sdkCompliance: false,          // Enabled at startup by mcp-server-v5.js
      typeCoercion: false,           // Enabled at startup by mcp-server-v5.js
      performanceMonitoring: false,  // Enabled at startup by mcp-server-v5.js
      contextAwareness: false,       // Enabled when client advertises experimental.contextAwareness
      workflowIntelligence: false,   // Enabled when client advertises experimental.proactiveSuggestions
      responseOptimization: false,   // Enabled for Claude Desktop clients

      // ── Deprecated ───────────────────────────────────────────────────
      verboseLogging: false          // @deprecated — pino LOG_LEVEL replaces this (no remaining consumers)
    };

    // Load from environment variables if available
    this.loadFromEnvironment();

    // Track feature usage for analytics
    this.usageStats = new Map();

    log.info({ count: Object.keys(this.flags).length }, 'Initialized flags');
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Name of the feature to check
   * @returns {boolean} True if feature is enabled
   */
  isEnabled(featureName) {
    const enabled = this.flags[featureName] === true;

    // Track usage for analytics
    if (enabled) {
      this.trackUsage(featureName);
    }

    return enabled;
  }

  /**
   * Enable a feature
   * @param {string} featureName - Name of the feature to enable
   * @returns {boolean} True if successfully enabled
   */
  enable(featureName) {
    if (featureName in this.flags) {
      const wasEnabled = this.flags[featureName];
      this.flags[featureName] = true;

      if (!wasEnabled) {
        log.info({ featureName }, 'Enabled feature');
      }

      return true;
    } else {
      log.warn({ featureName }, 'Unknown feature — ignoring enable()');
      return false;
    }
  }

  /**
   * Disable a feature
   * @param {string} featureName - Name of the feature to disable
   * @returns {boolean} True if successfully disabled
   */
  disable(featureName) {
    if (featureName in this.flags) {
      const wasEnabled = this.flags[featureName];
      this.flags[featureName] = false;

      if (wasEnabled) {
        log.info({ featureName }, 'Disabled feature');
      }

      return true;
    } else {
      log.warn({ featureName }, 'Unknown feature — ignoring disable()');
      return false;
    }
  }

  /**
   * Toggle a feature on/off
   * @param {string} featureName - Name of the feature to toggle
   * @returns {boolean} New state of the feature
   */
  toggle(featureName) {
    if (this.isEnabled(featureName)) {
      this.disable(featureName);
      return false;
    } else {
      this.enable(featureName);
      return true;
    }
  }

  /**
   * Load feature flags from environment variables
   * Environment variables should be in format: MCP_FEATURE_FEATURE_NAME=true/false
   */
  loadFromEnvironment() {
    let loadedCount = 0;

    Object.keys(this.flags).forEach(flag => {
      const envVar = `MCP_FEATURE_${flag.toUpperCase()}`;
      if (process.env[envVar] !== undefined) {
        const envValue = process.env[envVar].toLowerCase();
        this.flags[flag] = envValue === 'true' || envValue === '1' || envValue === 'yes';
        log.info({ flag, value: this.flags[flag] }, 'Loaded from env');
        loadedCount++;
      }
    });

    if (loadedCount > 0) {
      log.info({ loadedCount }, 'Loaded flags from environment');
    }
  }

  /**
   * Get all feature flags and their current state
   * @returns {Object} Copy of all feature flags
   */
  getAll() {
    return { ...this.flags };
  }

  /**
   * Get only enabled features
   * @returns {Array<string>} Array of enabled feature names
   */
  getEnabled() {
    return Object.entries(this.flags)
      .filter(([name, enabled]) => enabled)
      .map(([name]) => name);
  }

  /**
   * Get only disabled features
   * @returns {Array<string>} Array of disabled feature names
   */
  getDisabled() {
    return Object.entries(this.flags)
      .filter(([name, enabled]) => !enabled)
      .map(([name]) => name);
  }

  /**
   * Get feature flag status summary for logging/debugging
   * @returns {Object} Summary of feature flag status
   */
  getStatusSummary() {
    const enabled = this.getEnabled();
    const disabled = this.getDisabled();

    return {
      total: Object.keys(this.flags).length,
      enabled: enabled.length,
      disabled: disabled.length,
      enabledFeatures: enabled,
      disabledFeatures: disabled,
      usageStats: Object.fromEntries(this.usageStats)
    };
  }

  /**
   * Track feature usage for analytics
   * @private
   * @param {string} featureName - Name of the feature being used
   */
  trackUsage(featureName) {
    const current = this.usageStats.get(featureName) || 0;
    this.usageStats.set(featureName, current + 1);
  }

  /**
   * Reset all flags to default state
   */
  reset() {
    log.info('Resetting to defaults');

    this.flags = {
      // Active production flags
      parameterNormalization: true,
      parameterIntelligence: true,
      smartErrorRecovery: true,
      // SDK / Compliance flags (re-enabled at startup)
      sdkCompliance: false,
      typeCoercion: false,
      performanceMonitoring: false,
      contextAwareness: false,
      workflowIntelligence: false,
      responseOptimization: false,
      // Deprecated
      verboseLogging: false
    };

    this.usageStats.clear();
    this.loadFromEnvironment();

    log.info('Reset complete');
  }
}

// Create singleton instance
const featureFlags = new FeatureFlags();

// Export both class and singleton for flexibility
module.exports = {
  FeatureFlags,
  featureFlags
};
