import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { tokenManager } from '../llm/tokenManager';
import { MCPTokenDefaults } from '../llm/types';
import { mcpLogger } from '@/lib/logger';

/**
 * MCP Context Structure
 */
export interface MCPContext {
  sessionId: string;
  userId?: string;
  conversationHistory: MCPMessage[];
  toolExecutions: MCPToolExecution[];
  metadata: MCPContextMetadata;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MCP Message in Context
 */
export interface MCPMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  tokenCount?: number;
  metadata?: Record<string, any>;
}

/**
 * MCP Tool Execution Record
 */
export interface MCPToolExecution {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, any>;
  result: any;
  timestamp: Date;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  executionTime: number;
  success: boolean;
  error?: string;
}

/**
 * MCP Context Metadata
 */
export interface MCPContextMetadata {
  totalTokens: number;
  totalToolExecutions: number;
  lastActivity: Date;
  contextSize: number;
  optimizationLevel: 'none' | 'basic' | 'aggressive';
  preservationStrategy: 'full' | 'summarized' | 'selective';
  tags: string[];
  priority: 'low' | 'medium' | 'high';
}

/**
 * Context Optimization Options
 */
export interface ContextOptimizationOptions {
  maxTokens: number;
  preserveRecent: number; // Number of recent messages to always preserve
  preserveImportant: boolean; // Preserve messages marked as important
  summarizeOld: boolean; // Summarize old messages instead of removing
  compressToolResults: boolean; // Compress tool execution results
  removeRedundant: boolean; // Remove redundant information
}

/**
 * Context Preservation Strategy
 */
export interface ContextPreservationStrategy {
  name: string;
  description: string;
  maxContextSize: number;
  optimizationOptions: ContextOptimizationOptions;
  retentionPolicy: {
    maxAge: number; // Maximum age in milliseconds
    maxMessages: number; // Maximum number of messages
    maxToolExecutions: number; // Maximum number of tool executions
  };
}

/**
 * MCP Context Manager
 * Manages context preservation across MCP tool calls and conversations
 *
 * TIME BOMB PREVENTION (Jan 2026):
 * - contexts Map has MAX size limit with LRU eviction
 * - cleanup timer uses .unref() to prevent blocking process exit
 * - Pattern: time-bomb-detection-pattern.md (Categories 1 & 5)
 */
export class MCPContextManager {
  private contexts: Map<string, MCPContext> = new Map();
  private strategies: Map<string, ContextPreservationStrategy> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
  private readonly MAX_CONTEXTS = 1000;
  private contextEvictions = 0;

  constructor() {
    this.initializeStrategies();
    this.startCleanupScheduler();
  }

  // ============================================================================
  // TIME BOMB PREVENTION: LRU Eviction Helper (Category 1)
  // ============================================================================

  /**
   * Set context with LRU eviction if at capacity
   */
  private setContext(sessionId: string, context: MCPContext): void {
    if (this.contexts.size >= this.MAX_CONTEXTS && !this.contexts.has(sessionId)) {
      // Evict oldest (first inserted) context
      const oldestSessionId = this.contexts.keys().next().value;
      if (oldestSessionId) {
        this.contexts.delete(oldestSessionId);
        this.contextEvictions++;
        mcpLogger.debug({ evictedSession: oldestSessionId, evictionCount: this.contextEvictions }, 'LRU eviction: removed context');
      }
    }
    this.contexts.set(sessionId, context);
  }

  /**
   * Get context manager stats for monitoring
   */
  getContextManagerStats(): {
    contexts: number;
    strategies: number;
    evictions: number;
    maxContexts: number;
  } {
    return {
      contexts: this.contexts.size,
      strategies: this.strategies.size,
      evictions: this.contextEvictions,
      maxContexts: this.MAX_CONTEXTS
    };
  }

  /**
   * Build execution context with database integration - N+1 OPTIMIZED VERSION
   * 🔧 PERFORMANCE FIX: Task 8 - buildExecutionContext N+1 elimination
   * Expected improvement: 350ms → 100ms (71% reduction)
   *
   * ⚠ Hand-rolled select (no canonical import). If fields appear missing from
   * the MCPContext response, audit this method first — the optimization may
   * have stripped a field a caller now depends on. Pattern: phantom-canonical
   * variant of Bug Class 75 in bug-class-registry.md. Equivalent fix shipped
   * for lib/pov/services/pov.ts.get() in commit 8d256992.
   */
  async buildExecutionContext(
    executionId: string,
    sessionId?: string,
    options?: {
      includePOVContext?: boolean;
      includeTaskContext?: boolean;
      includeTemplateContext?: boolean;
      maxHistoryItems?: number;
    }
  ): Promise<MCPContext | null> {
    const startTime = Date.now();
    mcpLogger.debug({ executionId }, 'Building execution context (N+1 optimized)');

    try {
      // OLD CODE (commented for rollback):
      // This would have done separate queries for execution, task, POV, phase, template, etc.
      // causing N+1 queries: 1 for execution + N for each related entity

      // NEW: Single comprehensive query with strategic selects
      // Step 1: Get execution with all related data in one query
      const execution = await prisma.agentExecution.findUnique({
        where: { id: executionId },
        select: {
          id: true,
          taskId: true,
          agentTemplateId: true,
          status: true,
          startTime: true,
          endTime: true,
          createdAt: true,
          updatedAt: true,
          // Task context (avoid N+1)
          task: options?.includeTaskContext !== false ? {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              type: true,
              povId: true,
              phaseId: true,
              stageId: true,
              assigneeId: true,
              inputContext: true,
              outputArtifacts: true,
              mcpContext: true,
              // POV context (avoid N+1)
              pov: options?.includePOVContext !== false ? {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  customerName: true,
                  status: true,
                  ownerId: true,
                  owner: { select: { id: true, name: true, email: true } }
                }
              } : false,
              // Phase context (avoid N+1)
              phase: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  type: true,
                  order: true
                }
              },
              // Stage context (avoid N+1)
              stage: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  order: true
                }
              },
              // Assignee context (avoid N+1)
              assignee: {
                select: { id: true, name: true, email: true, role: true }
              }
            }
          } : false,
          // Agent template context (avoid N+1)
          agentTemplate: options?.includeTemplateContext !== false ? {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              defaultRole: true,
              promptTemplate: true,
              capabilities: true,
              constraints: true,
              maxRetries: true,
              timeout: true,
              priority: true
            }
          } : false,
          // Related artifacts (avoid N+1)
          artifacts: {
            select: {
              id: true,
              name: true,
              type: true,
              createdAt: true,
              // Truncated content for context preview
              content: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5 // Limit for performance
          }
        }
      });

      if (!execution) {
        mcpLogger.warn({ executionId }, 'Execution not found');
        return null;
      }

      // Step 2: Get existing session context if sessionId provided (single query)
      let existingContext: MCPContext | null = null;
      if (sessionId) {
        existingContext = await this.restoreContext(sessionId);
      }

      // Step 3: Build comprehensive context with all related data
      const executionContext: MCPContext = {
        sessionId: sessionId || `execution-${executionId}`,
        userId: execution.task?.assigneeId || undefined,
        conversationHistory: [
          ...(existingContext?.conversationHistory || []),
          // Add execution start message
          {
            id: `exec-start-${execution.id}`,
            role: 'system' as const,
            content: `Agent execution started: ${execution.agentTemplate?.name || 'Unknown Template'} for task "${execution.task?.title || 'Unknown Task'}"`,
            timestamp: execution.startTime || execution.createdAt,
            metadata: {
              type: 'execution_start',
              executionId: execution.id,
              templateName: execution.agentTemplate?.name,
              taskTitle: execution.task?.title
            }
          },
          // Add execution result message if completed
          ...(execution.status === 'SUCCESS' || execution.status === 'FAILED' ? [{
            id: `exec-end-${execution.id}`,
            role: 'assistant' as const,
            content: execution.status === 'SUCCESS' ? 
              `Execution completed successfully. ${execution.artifacts.length} artifacts generated.` :
              `Execution failed: Unknown error`,
            timestamp: execution.endTime || execution.updatedAt,
            metadata: {
              type: 'execution_result',
              executionId: execution.id,
              status: execution.status,
              artifactCount: execution.artifacts.length,
              error: null,
              result: null
            }
          }] : [])
        ].slice(-(options?.maxHistoryItems || 50)), // Limit history for performance
        toolExecutions: [
          ...(existingContext?.toolExecutions || []),
          // Add this execution as tool execution
          {
            id: `exec-${execution.id}`,
            serverName: 'paichart-agent-execution',
            toolName: execution.agentTemplate?.name || 'unknown-template',
            arguments: (typeof execution.task?.inputContext === 'object' && execution.task?.inputContext !== null ? execution.task.inputContext : {}) as Record<string, any>,
            result: null,
            timestamp: execution.startTime || execution.createdAt,
            executionTime: execution.startTime && execution.endTime ? 
              execution.endTime.getTime() - execution.startTime.getTime() : 0,
            success: execution.status === 'SUCCESS',
            error: undefined
          }
        ].slice(-20), // Limit tool executions for performance
        metadata: {
          optimizationLevel: 'basic' as const,
          preservationStrategy: 'selective' as const,
          tags: [
            'execution-context',
            execution.status.toLowerCase(),
            execution.agentTemplate?.category?.toLowerCase() || 'unknown',
            execution.task?.type?.toLowerCase() || 'unknown'
          ],
          priority: 'high' as const,
          lastActivity: execution.updatedAt,
          totalTokens: 0, // Will be calculated
          totalToolExecutions: 1,
          contextSize: 0 // Will be calculated
        },
        createdAt: existingContext?.createdAt || new Date(),
        updatedAt: new Date()
      };

      // Calculate token counts and context size
      executionContext.metadata.totalTokens = this.calculateTotalTokens(executionContext.conversationHistory);
      executionContext.metadata.contextSize = this.calculateContextSize(
        executionContext.conversationHistory,
        executionContext.toolExecutions
      );

      const queryTime = Date.now() - startTime;
      mcpLogger.debug({ executionId, queryTimeMs: queryTime, messages: executionContext.conversationHistory.length, toolExecutions: executionContext.toolExecutions.length, totalTokens: executionContext.metadata.totalTokens }, 'Execution context built');

      return executionContext;

    } catch (error) {
      mcpLogger.error({ err: error, executionId }, 'Failed to build execution context');
      throw error;
    }
  }

  /**
   * Preserve context for a session
   */
  async preserveContext(sessionId: string, context: Partial<MCPContext>): Promise<void> {
    mcpLogger.debug({ sessionId }, 'Preserving context');

    try {
      const existingContext = this.contexts.get(sessionId);
      const now = new Date();

      const updatedContext: MCPContext = {
        sessionId,
        userId: context.userId || existingContext?.userId,
        conversationHistory: [
          ...(existingContext?.conversationHistory || []),
          ...(context.conversationHistory || [])
        ],
        toolExecutions: [
          ...(existingContext?.toolExecutions || []),
          ...(context.toolExecutions || [])
        ],
        metadata: {
          optimizationLevel: 'none' as const,
          preservationStrategy: 'full' as const,
          tags: [],
          priority: 'medium' as const,
          ...existingContext?.metadata,
          ...context.metadata,
          lastActivity: now,
          totalTokens: this.calculateTotalTokens(context.conversationHistory || []),
          totalToolExecutions: (existingContext?.toolExecutions?.length || 0) + (context.toolExecutions?.length || 0),
          contextSize: this.calculateContextSize(context.conversationHistory || [], context.toolExecutions || [])
        },
        createdAt: existingContext?.createdAt || now,
        updatedAt: now
      };

      // Optimize context if it exceeds limits
      const optimizedContext = await this.optimizeContext(updatedContext);

      // Uses LRU eviction if at capacity
      this.setContext(sessionId, optimizedContext);

      mcpLogger.debug({ sessionId, messages: optimizedContext.conversationHistory.length, toolExecutions: optimizedContext.toolExecutions.length, totalTokens: optimizedContext.metadata.totalTokens }, 'Context preserved');
    } catch (error) {
      mcpLogger.error({ err: error, sessionId }, 'Failed to preserve context');
      throw error;
    }
  }

  /**
   * Restore context for a session
   */
  async restoreContext(sessionId: string): Promise<MCPContext | null> {
    mcpLogger.debug({ sessionId }, 'Restoring context');

    try {
      const context = this.contexts.get(sessionId);

      if (!context) {
        mcpLogger.debug({ sessionId }, 'No context found for session');
        return null;
      }

      // Update last activity (existing context, no eviction needed)
      context.metadata.lastActivity = new Date();
      this.setContext(sessionId, context);

      mcpLogger.debug({ sessionId, messages: context.conversationHistory.length, toolExecutions: context.toolExecutions.length, totalTokens: context.metadata.totalTokens }, 'Context restored');

      return context;
    } catch (error) {
      mcpLogger.error({ err: error, sessionId }, 'Failed to restore context');
      throw error;
    }
  }

  /**
   * Clear context for a session
   */
  async clearContext(sessionId: string): Promise<void> {
    mcpLogger.debug({ sessionId }, 'Clearing context');

    try {
      const context = this.contexts.get(sessionId);
      
      if (context) {
        this.contexts.delete(sessionId);
        mcpLogger.debug({ sessionId }, 'Context cleared');
      } else {
        mcpLogger.debug({ sessionId }, 'No context to clear');
      }
    } catch (error) {
      mcpLogger.error({ err: error, sessionId }, 'Failed to clear context');
      throw error;
    }
  }

  /**
   * Optimize context to fit within token limits
   */
  async optimizeContext(
    context: MCPContext,
    maxTokens?: number,
    strategy?: string
  ): Promise<MCPContext> {
    const targetTokens = maxTokens || MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS;
    const strategyName = strategy || 'default';
    const preservationStrategy = this.strategies.get(strategyName) || this.strategies.get('default')!;

    mcpLogger.debug({ sessionId: context.sessionId, currentTokens: context.metadata.totalTokens, targetTokens, strategy: strategyName }, 'Optimizing context');

    if (context.metadata.totalTokens <= targetTokens) {
      mcpLogger.debug({ sessionId: context.sessionId }, 'Context within limits, no optimization needed');
      return context;
    }

    const optimizedContext = { ...context };
    const options = preservationStrategy.optimizationOptions;

    // Step 1: Remove old messages beyond retention policy
    if (preservationStrategy.retentionPolicy.maxMessages > 0) {
      optimizedContext.conversationHistory = optimizedContext.conversationHistory
        .slice(-preservationStrategy.retentionPolicy.maxMessages);
    }

    // Step 2: Remove old tool executions
    if (preservationStrategy.retentionPolicy.maxToolExecutions > 0) {
      optimizedContext.toolExecutions = optimizedContext.toolExecutions
        .slice(-preservationStrategy.retentionPolicy.maxToolExecutions);
    }

    // Step 3: Compress tool results if enabled
    if (options.compressToolResults) {
      optimizedContext.toolExecutions = optimizedContext.toolExecutions.map(execution => ({
        ...execution,
        result: this.compressToolResult(execution.result)
      }));
    }

    // Step 4: Summarize old messages if enabled
    if (options.summarizeOld && optimizedContext.conversationHistory.length > options.preserveRecent) {
      const recentMessages = optimizedContext.conversationHistory.slice(-options.preserveRecent);
      const oldMessages = optimizedContext.conversationHistory.slice(0, -options.preserveRecent);
      
      if (oldMessages.length > 0) {
        const summary = await this.summarizeMessages(oldMessages);
        optimizedContext.conversationHistory = [summary, ...recentMessages];
      }
    }

    // Step 5: Remove redundant information if enabled
    if (options.removeRedundant) {
      optimizedContext.conversationHistory = this.removeRedundantMessages(optimizedContext.conversationHistory);
    }

    // Recalculate metadata
    optimizedContext.metadata = {
      ...optimizedContext.metadata,
      totalTokens: this.calculateTotalTokens(optimizedContext.conversationHistory),
      contextSize: this.calculateContextSize(optimizedContext.conversationHistory, optimizedContext.toolExecutions),
      optimizationLevel: this.determineOptimizationLevel(context, optimizedContext)
    };
    
    // Update the context's updatedAt timestamp
    optimizedContext.updatedAt = new Date();

    mcpLogger.debug({ sessionId: context.sessionId, originalTokens: context.metadata.totalTokens, optimizedTokens: optimizedContext.metadata.totalTokens, reduction: context.metadata.totalTokens - optimizedContext.metadata.totalTokens, optimizationLevel: optimizedContext.metadata.optimizationLevel }, 'Context optimization completed');

    return optimizedContext;
  }

  /**
   * Add message to context
   */
  async addMessage(sessionId: string, message: Omit<MCPMessage, 'id'>): Promise<void> {
    const messageWithId: MCPMessage = {
      ...message,
      id: this.generateId(),
      tokenCount: this.estimateTokenCount(message.content)
    };

    await this.preserveContext(sessionId, {
      conversationHistory: [messageWithId]
    });
  }

  /**
   * Get context summary
   */
  getContextSummary(sessionId: string): {
    exists: boolean;
    messageCount: number;
    toolExecutionCount: number;
    totalTokens: number;
    lastActivity: Date | null;
    age: number;
  } {
    const context = this.contexts.get(sessionId);

    if (!context) {
      return {
        exists: false,
        messageCount: 0,
        toolExecutionCount: 0,
        totalTokens: 0,
        lastActivity: null,
        age: 0
      };
    }

    return {
      exists: true,
      messageCount: context.conversationHistory.length,
      toolExecutionCount: context.toolExecutions.length,
      totalTokens: context.metadata.totalTokens,
      lastActivity: context.metadata.lastActivity,
      age: Date.now() - context.createdAt.getTime()
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Cleanup expired contexts
   */
  async cleanupExpiredContexts(): Promise<void> {
    mcpLogger.debug({}, 'Running context cleanup');

    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, context] of this.contexts) {
      const age = now - context.metadata.lastActivity.getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours default

      if (age > maxAge) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.clearContext(sessionId);
    }

    mcpLogger.info({ removedCount: expiredSessions.length }, 'Context cleanup completed');
  }

  // Private helper methods

  private initializeStrategies(): void {
    // Default strategy
    this.strategies.set('default', {
      name: 'default',
      description: 'Balanced context preservation with moderate optimization',
      maxContextSize: MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS,
      optimizationOptions: {
        maxTokens: MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS,
        preserveRecent: 10,
        preserveImportant: true,
        summarizeOld: true,
        compressToolResults: true,
        removeRedundant: true
      },
      retentionPolicy: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        maxMessages: 50,
        maxToolExecutions: 20
      }
    });

    // Aggressive optimization strategy
    this.strategies.set('aggressive', {
      name: 'aggressive',
      description: 'Aggressive optimization for token efficiency',
      maxContextSize: MCPTokenDefaults.GENERAL_MAX_TOKENS,
      optimizationOptions: {
        maxTokens: MCPTokenDefaults.GENERAL_MAX_TOKENS,
        preserveRecent: 5,
        preserveImportant: true,
        summarizeOld: true,
        compressToolResults: true,
        removeRedundant: true
      },
      retentionPolicy: {
        maxAge: 12 * 60 * 60 * 1000, // 12 hours
        maxMessages: 20,
        maxToolExecutions: 10
      }
    });

    // Full preservation strategy
    this.strategies.set('full', {
      name: 'full',
      description: 'Full context preservation with minimal optimization',
      maxContextSize: MCPTokenDefaults.DYNAMIC_ALLOCATION.MAX_DYNAMIC_TOKENS,
      optimizationOptions: {
        maxTokens: MCPTokenDefaults.DYNAMIC_ALLOCATION.MAX_DYNAMIC_TOKENS,
        preserveRecent: 100,
        preserveImportant: true,
        summarizeOld: false,
        compressToolResults: false,
        removeRedundant: false
      },
      retentionPolicy: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxMessages: 200,
        maxToolExecutions: 100
      }
    });
  }

  private startCleanupScheduler(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts().catch(error => {
        mcpLogger.error({ err: error }, 'Error during scheduled cleanup');
      });
    }, 60 * 60 * 1000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.cleanupInterval.unref();
  }

  private calculateTotalTokens(messages: MCPMessage[]): number {
    return messages.reduce((total, message) => {
      return total + (message.tokenCount || this.estimateTokenCount(message.content));
    }, 0);
  }

  private calculateContextSize(messages: MCPMessage[], toolExecutions: MCPToolExecution[]): number {
    const messageSize = messages.reduce((total, message) => total + message.content.length, 0);
    const toolSize = toolExecutions.reduce((total, execution) => {
      return total + JSON.stringify(execution.arguments).length + JSON.stringify(execution.result).length;
    }, 0);
    
    return messageSize + toolSize;
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  // BC32 FIX: crypto.randomUUID() replaces predictable Math.random()
  private generateId(): string {
    return `mcp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }

  // Context COMPRESSION (head+tail, '...[truncated]...') — deliberately DISTINCT from the Tier-1
  // LLM-view cap (agentic-tool-loop.ts truncateForLlm, head-only '... [truncated]') and the display
  // previews; do NOT merge (harvest-truncation-safety.md §1: tiers are intentionally not unified).
  private compressToolResult(result: any): any {
    if (typeof result === 'string' && result.length > 1000) {
      return result.substring(0, 500) + '...[truncated]...' + result.substring(result.length - 500);
    }
    
    if (typeof result === 'object' && result !== null) {
      const compressed: any = {};
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && value.length > 500) {
          compressed[key] = value.substring(0, 250) + '...[truncated]';
        } else {
          compressed[key] = value;
        }
      }
      return compressed;
    }
    
    return result;
  }

  private async summarizeMessages(messages: MCPMessage[]): Promise<MCPMessage> {
    // Create a summary of old messages
    const messageCount = messages.length;
    const timeSpan = messages.length > 0 ? 
      messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime() : 0;
    
    const summaryContent = `[Context Summary: ${messageCount} messages over ${Math.round(timeSpan / (1000 * 60))} minutes]`;
    
    return {
      id: this.generateId(),
      role: 'system',
      content: summaryContent,
      timestamp: new Date(),
      tokenCount: this.estimateTokenCount(summaryContent),
      metadata: {
        type: 'summary',
        originalMessageCount: messageCount,
        timeSpan
      }
    };
  }

  private removeRedundantMessages(messages: MCPMessage[]): MCPMessage[] {
    // Simple redundancy removal - remove consecutive messages with identical content
    const filtered: MCPMessage[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const previous = filtered[filtered.length - 1];
      
      if (!previous || current.content !== previous.content || current.role !== previous.role) {
        filtered.push(current);
      }
    }
    
    return filtered;
  }

  private determineOptimizationLevel(original: MCPContext, optimized: MCPContext): 'none' | 'basic' | 'aggressive' {
    const reduction = original.metadata.totalTokens - optimized.metadata.totalTokens;
    const reductionPercentage = (reduction / original.metadata.totalTokens) * 100;
    
    if (reductionPercentage === 0) return 'none';
    if (reductionPercentage < 25) return 'basic';
    return 'aggressive';
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.contexts.clear();
  }
}

// Create singleton instance
export const mcpContextManager = new MCPContextManager();
