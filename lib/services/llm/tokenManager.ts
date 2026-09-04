import { TokenUsageTracking, TokenManagementOptions, MCPTokenDefaults } from './types';
import { logger } from '@/lib/logger';

const tokenLogger = logger.child({ module: 'TokenManager' });

/**
 * Token management service for LLM requests
 * Provides dynamic token allocation, usage tracking, and budget management
 *
 * TIME BOMB PREVENTION (Jan 2026):
 * - budgetTracking Map has MAX size limit with LRU eviction
 * - Stale entries (no activity for 7 days) are cleaned up periodically
 * - Pattern: time-bomb-detection-pattern.md (Categories 1 & 4)
 */
export class TokenManager {
  private usageHistory: TokenUsageTracking[] = [];
  private budgetTracking: Map<string, { hourly: number; daily: number; lastReset: Date }> = new Map();

  // TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
  private readonly MAX_BUDGET_ENTRIES = 5000;
  private readonly STALE_ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private budgetEvictions = 0;

  // ============================================================================
  // TIME BOMB PREVENTION: LRU Eviction Helper (Category 1)
  // ============================================================================

  /**
   * Set budget tracking with LRU eviction if at capacity
   */
  private setBudgetTracking(userKey: string, tracking: { hourly: number; daily: number; lastReset: Date }): void {
    if (this.budgetTracking.size >= this.MAX_BUDGET_ENTRIES && !this.budgetTracking.has(userKey)) {
      // Evict oldest (first inserted) budget entry
      const oldestKey = this.budgetTracking.keys().next().value;
      if (oldestKey) {
        this.budgetTracking.delete(oldestKey);
        this.budgetEvictions++;
      }
    }
    this.budgetTracking.set(userKey, tracking);
  }

  /**
   * Cleanup stale budget entries (no activity for 7+ days)
   * Category 4: Session/State TTL
   */
  cleanupStaleBudgetEntries(): number {
    const now = Date.now();
    const staleKeys: string[] = [];

    for (const [key, tracking] of this.budgetTracking) {
      if (now - tracking.lastReset.getTime() > this.STALE_ENTRY_TTL_MS) {
        staleKeys.push(key);
      }
    }

    for (const key of staleKeys) {
      this.budgetTracking.delete(key);
    }

    if (staleKeys.length > 0) {
      tokenLogger.info({ cleanedEntries: staleKeys.length }, 'Cleaned up stale budget entries');
    }

    return staleKeys.length;
  }

  /**
   * Get token manager stats for monitoring
   */
  getTokenManagerStats(): {
    usageHistorySize: number;
    budgetTrackingSize: number;
    budgetEvictions: number;
    maxBudgetEntries: number;
  } {
    return {
      usageHistorySize: this.usageHistory.length,
      budgetTrackingSize: this.budgetTracking.size,
      budgetEvictions: this.budgetEvictions,
      maxBudgetEntries: this.MAX_BUDGET_ENTRIES
    };
  }

  /**
   * Calculate optimal token allocation for a request
   */
  calculateTokenAllocation(options: {
    requestType?: 'mcp_workflow' | 'template_analysis' | 'agent_execution' | 'general';
    promptLength?: number;
    contextSize?: number;
    complexity?: 'low' | 'medium' | 'high';
    tokenManagement?: TokenManagementOptions;
  }): number {
    const { requestType = 'general', promptLength = 0, contextSize = 0, complexity = 'medium', tokenManagement } = options;

    // Start with base allocation based on request type
    let baseTokens: number;
    switch (requestType) {
      case 'mcp_workflow':
        baseTokens = MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS;
        break;
      case 'template_analysis':
        baseTokens = MCPTokenDefaults.TEMPLATE_ANALYSIS_MAX_TOKENS;
        break;
      case 'agent_execution':
        baseTokens = MCPTokenDefaults.AGENT_EXECUTION_MAX_TOKENS;
        break;
      default:
        baseTokens = MCPTokenDefaults.GENERAL_MAX_TOKENS;
    }

    // Apply custom token management if provided
    if (tokenManagement?.maxTokens) {
      baseTokens = Math.min(baseTokens, tokenManagement.maxTokens);
    }

    // Apply dynamic allocation if enabled
    if (tokenManagement?.dynamicAllocation?.enabled) {
      const dynamicConfig = tokenManagement.dynamicAllocation;
      let dynamicTokens = dynamicConfig.baseTokens;

      // Adjust based on complexity
      const complexityMultiplier = complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1;
      dynamicTokens += dynamicConfig.complexityMultiplier * complexityMultiplier;

      // Adjust based on prompt and context size
      const sizeMultiplier = Math.ceil((promptLength + contextSize) / 1000);
      dynamicTokens += sizeMultiplier * 200;

      // Cap at maximum
      dynamicTokens = Math.min(dynamicTokens, dynamicConfig.maxDynamicTokens);

      baseTokens = Math.max(baseTokens, dynamicTokens);
    }

    // Apply budget constraints
    if (tokenManagement?.budget) {
      baseTokens = Math.min(baseTokens, tokenManagement.budget.maxPerRequest);
    }

    // Ensure minimum tokens are reserved
    const minTokens = tokenManagement?.minTokens || MCPTokenDefaults.MIN_RESPONSE_TOKENS;
    baseTokens = Math.max(baseTokens, minTokens);

    tokenLogger.debug({ tokens: baseTokens, requestType, complexity }, 'Calculated token allocation');
    
    return baseTokens;
  }

  /**
   * Check if a request is within budget limits
   */
  checkBudget(requestedTokens: number, userId?: string, budget?: TokenManagementOptions['budget']): {
    allowed: boolean;
    reason?: string;
    remainingHourly?: number;
    remainingDaily?: number;
  } {
    if (!budget) {
      return { allowed: true };
    }

    const userKey = userId || 'anonymous';
    const now = new Date();
    
    // Get or create budget tracking for user (uses LRU eviction if at capacity)
    let tracking = this.budgetTracking.get(userKey);
    if (!tracking) {
      tracking = { hourly: 0, daily: 0, lastReset: now };
      this.setBudgetTracking(userKey, tracking);
    }

    // Reset counters if needed
    const hoursSinceReset = (now.getTime() - tracking.lastReset.getTime()) / (1000 * 60 * 60);
    if (hoursSinceReset >= 24) {
      tracking.daily = 0;
      tracking.hourly = 0;
      tracking.lastReset = now;
    } else if (hoursSinceReset >= 1) {
      tracking.hourly = 0;
      tracking.lastReset = now; // Fix: update lastReset so hourly window slides correctly
    }

    // Check per-request limit
    if (requestedTokens > budget.maxPerRequest) {
      return {
        allowed: false,
        reason: `Request exceeds per-request limit (${requestedTokens} > ${budget.maxPerRequest})`
      };
    }

    // Check hourly limit
    if (budget.maxPerHour && tracking.hourly + requestedTokens > budget.maxPerHour) {
      return {
        allowed: false,
        reason: `Request would exceed hourly limit (${tracking.hourly + requestedTokens} > ${budget.maxPerHour})`,
        remainingHourly: Math.max(0, budget.maxPerHour - tracking.hourly)
      };
    }

    // Check daily limit
    if (budget.maxPerDay && tracking.daily + requestedTokens > budget.maxPerDay) {
      return {
        allowed: false,
        reason: `Request would exceed daily limit (${tracking.daily + requestedTokens} > ${budget.maxPerDay})`,
        remainingDaily: Math.max(0, budget.maxPerDay - tracking.daily)
      };
    }

    // Check if approaching limits (for warnings)
    const alertThreshold = budget.alertThreshold || 80;
    let warnings: string[] = [];

    if (budget.maxPerHour) {
      const hourlyUsagePercent = ((tracking.hourly + requestedTokens) / budget.maxPerHour) * 100;
      if (hourlyUsagePercent >= alertThreshold) {
        warnings.push(`Approaching hourly limit: ${hourlyUsagePercent.toFixed(1)}%`);
      }
    }

    if (budget.maxPerDay) {
      const dailyUsagePercent = ((tracking.daily + requestedTokens) / budget.maxPerDay) * 100;
      if (dailyUsagePercent >= alertThreshold) {
        warnings.push(`Approaching daily limit: ${dailyUsagePercent.toFixed(1)}%`);
      }
    }

    if (warnings.length > 0) {
      tokenLogger.warn({ userKey, warnings }, 'Budget warnings');
    }

    return {
      allowed: true,
      remainingHourly: budget.maxPerHour ? budget.maxPerHour - tracking.hourly : undefined,
      remainingDaily: budget.maxPerDay ? budget.maxPerDay - tracking.daily : undefined
    };
  }

  /**
   * Record token usage for tracking and budget management
   */
  recordUsage(usage: Omit<TokenUsageTracking, 'timestamp' | 'totalTokens'>, userId?: string): void {
    const totalTokens = usage.inputTokens + usage.outputTokens;
    const fullUsage: TokenUsageTracking = {
      ...usage,
      totalTokens,
      timestamp: new Date()
    };

    // Add to usage history
    this.usageHistory.push(fullUsage);

    // Update budget tracking
    if (userId) {
      const tracking = this.budgetTracking.get(userId);
      if (tracking) {
        tracking.hourly += totalTokens;
        tracking.daily += totalTokens;
      }
    }

    // Keep only recent history (last 1000 entries)
    if (this.usageHistory.length > 1000) {
      this.usageHistory = this.usageHistory.slice(-1000);
    }

    tokenLogger.debug({ totalTokens, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, 'Recorded token usage');
  }

  /**
   * Get usage statistics
   */
  getUsageStats(timeframe?: 'hour' | 'day' | 'week'): {
    totalRequests: number;
    totalTokens: number;
    averageTokensPerRequest: number;
    byRequestType: Record<string, { requests: number; tokens: number }>;
    estimatedCost: number;
  } {
    const now = new Date();
    let cutoffTime: Date;

    switch (timeframe) {
      case 'hour':
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(0); // All time
    }

    const relevantUsage = this.usageHistory.filter(usage => usage.timestamp >= cutoffTime);

    const totalRequests = relevantUsage.length;
    const totalTokens = relevantUsage.reduce((sum, usage) => sum + usage.totalTokens, 0);
    const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;

    const byRequestType: Record<string, { requests: number; tokens: number }> = {};
    relevantUsage.forEach(usage => {
      const type = usage.requestType || 'general';
      if (!byRequestType[type]) {
        byRequestType[type] = { requests: 0, tokens: 0 };
      }
      byRequestType[type].requests++;
      byRequestType[type].tokens += usage.totalTokens;
    });

    const estimatedCost = relevantUsage.reduce((sum, usage) => sum + (usage.estimatedCost || 0), 0);

    return {
      totalRequests,
      totalTokens,
      averageTokensPerRequest,
      byRequestType,
      estimatedCost
    };
  }

  /**
   * Optimize prompt to reduce token usage
   */
  optimizePrompt(prompt: string, options?: {
    maxLength?: number;
    preserveStructure?: boolean;
    removeExtraWhitespace?: boolean;
  }): string {
    let optimized = prompt;

    // Remove extra whitespace
    if (options?.removeExtraWhitespace !== false) {
      optimized = optimized.replace(/\s+/g, ' ').trim();
    }

    // Truncate if needed
    if (options?.maxLength && optimized.length > options.maxLength) {
      if (options.preserveStructure) {
        // Try to preserve structure by truncating from the middle
        const start = optimized.substring(0, options.maxLength * 0.3);
        const end = optimized.substring(optimized.length - options.maxLength * 0.3);
        optimized = start + '\n...[content truncated]...\n' + end;
      } else {
        optimized = optimized.substring(0, options.maxLength) + '...';
      }
    }

    const savedTokens = Math.ceil((prompt.length - optimized.length) / 4); // Rough estimate
    if (savedTokens > 0) {
      tokenLogger.debug({ savedTokens }, 'Optimized prompt');
    }

    return optimized;
  }

  /**
   * Get budget status for a user
   */
  getBudgetStatus(userId: string, budget?: TokenManagementOptions['budget']): {
    hourlyUsed: number;
    dailyUsed: number;
    hourlyRemaining?: number;
    dailyRemaining?: number;
    hourlyPercentUsed?: number;
    dailyPercentUsed?: number;
  } {
    const tracking = this.budgetTracking.get(userId);
    if (!tracking) {
      return { hourlyUsed: 0, dailyUsed: 0 };
    }

    const result = {
      hourlyUsed: tracking.hourly,
      dailyUsed: tracking.daily,
      hourlyRemaining: budget?.maxPerHour ? budget.maxPerHour - tracking.hourly : undefined,
      dailyRemaining: budget?.maxPerDay ? budget.maxPerDay - tracking.daily : undefined,
      hourlyPercentUsed: budget?.maxPerHour ? (tracking.hourly / budget.maxPerHour) * 100 : undefined,
      dailyPercentUsed: budget?.maxPerDay ? (tracking.daily / budget.maxPerDay) * 100 : undefined,
    };

    return result;
  }

  /**
   * Clear usage history (for testing or maintenance)
   */
  clearHistory(): void {
    this.usageHistory = [];
    this.budgetTracking.clear();
    tokenLogger.info('Usage history cleared');
  }
}

// Create singleton instance
export const tokenManager = new TokenManager();
