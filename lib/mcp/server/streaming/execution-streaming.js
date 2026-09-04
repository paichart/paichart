/**
 * Execution Streaming for MCP Server v5
 * Provides real-time progress updates for agent executions
 */

const { EventEmitter } = require('events');
// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');

// TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
const MAX_ACTIVE_STREAMS = 500;
const MAX_EXECUTION_CACHE = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

class ExecutionStreaming extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map(); // executionId -> Set of clientIds
    this.executionCache = new Map(); // executionId -> { status, timestamp }
    this.pollInterval = null;
    this.cacheCleanupInterval = null;
    this.logger = this.createLogger();

    this.startPolling();
    this.startCacheCleanup();
    this.logger.info('Execution streaming initialized');
  }

  /**
   * TIME BOMB PREVENTION: Periodic cache cleanup (Category 2)
   */
  startCacheCleanup() {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.executionCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          this.executionCache.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.cacheCleanupInterval.unref();
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'execution-streaming-v5' }));
  }

  /**
   * Subscribe a client to execution updates
   */
  subscribeToExecution(clientId, executionId, callback) {
    this.logger.debug(`Client ${clientId} subscribing to execution ${executionId}`);

    // Initialize stream tracking
    if (!this.activeStreams.has(executionId)) {
      // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
      if (this.activeStreams.size >= MAX_ACTIVE_STREAMS) {
        const oldestKey = this.activeStreams.keys().next().value;
        if (oldestKey) {
          this.activeStreams.delete(oldestKey);
          this.removeAllListeners(`execution:${oldestKey}`);
        }
      }
      this.activeStreams.set(executionId, new Set());
    }

    this.activeStreams.get(executionId).add(clientId);
    
    // Send initial status if available
    if (this.executionCache.has(executionId)) {
      const cachedStatus = this.executionCache.get(executionId);
      callback(cachedStatus);
    }
    
    // Register callback for updates
    this.on(`execution:${executionId}`, callback);
    
    return true;
  }

  /**
   * Unsubscribe a client from execution updates
   */
  unsubscribeFromExecution(clientId, executionId) {
    this.logger.debug(`Client ${clientId} unsubscribing from execution ${executionId}`);
    
    const subscribers = this.activeStreams.get(executionId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.activeStreams.delete(executionId);
      }
    }
    
    // Remove all listeners for this execution
    this.removeAllListeners(`execution:${executionId}`);
  }

  /**
   * Start polling for execution updates
   */
  startPolling() {
    // Poll every 2 seconds for updates
    this.pollInterval = setInterval(() => {
      this.checkExecutionUpdates();
    }, 2000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.pollInterval.unref();

    this.logger.info('Started polling for execution updates');
  }

  /**
   * Check for execution updates
   */
  async checkExecutionUpdates() {
    if (this.activeStreams.size === 0) {
      return; // No active subscriptions
    }
    
    try {
      const executionIds = Array.from(this.activeStreams.keys());
      
      // Batch query for all active executions
      const executions = await prisma.agentExecution.findMany({
        where: {
          id: { in: executionIds }
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          agentTemplate: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        },
        take: 200
      });
      
      // Process updates
      for (const execution of executions) {
        const executionId = execution.id;
        const cachedStatus = this.executionCache.get(executionId);
        
        // Create status update
        // 2026-07-26 (Bug Class 80 + Protocol 10). This payload reaches EXTERNAL MCP clients
        // via sendProgressNotification -> sendLoggingMessage, and three of its fields read
        // columns that have never existed on agent_executions:
        //   progress  -> `execution.progress || 0`      = 0 on EVERY notification, forever
        //   outputSize-> `execution.responseLength || 0` = a claim of zero bytes
        //   executionTime -> `execution.executionTimeMs` = undefined (dropped silently)
        // A false ZERO is worse than an absent field: the client has no `(est.)` affordance
        // to warn it, so it renders a measurement nobody took. Facts only now — status and
        // the timestamps are real; executionTime is DERIVED from them.
        // `progress` is deliberately NOT replaced with the elapsed-time estimate the GUI
        // shows: that estimate is a VERDICT (assumes a 30-min run, caps at 90) and is only
        // safe where it is labelled. Earning a real one means children-terminal/total for
        // PIPELINE tasks — a measured fraction, tracked as a separate decision.
        const executionTimeMs = execution.endTime && execution.startTime
          ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()
          : null;
        const statusUpdate = {
          executionId: execution.id,
          status: execution.status,
          timestamp: new Date().toISOString(),
          task: execution.task,
          agentTemplate: execution.agentTemplate,
          metrics: {
            startTime: execution.startTime,
            endTime: execution.endTime,
            executionTime: executionTimeMs
          }
        };
        
        // Check if status changed or progress updated
        // The `cachedStatus.progress !== execution.progress` clause that stood here compared
        // undefined to undefined on every call — it could never contribute. Status is the
        // real change signal.
        const hasChanged = !cachedStatus ||
                         cachedStatus.status !== execution.status;
        
        if (hasChanged) {
          this.logger.debug(`Execution ${executionId} updated: ${execution.status}`);

          // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
          if (this.executionCache.size >= MAX_EXECUTION_CACHE && !this.executionCache.has(executionId)) {
            const oldestKey = this.executionCache.keys().next().value;
            if (oldestKey) {
              this.executionCache.delete(oldestKey);
            }
          }

          // Update cache with timestamp for TTL cleanup
          this.executionCache.set(executionId, {
            ...statusUpdate,
            timestamp: Date.now()
          });

          // Emit update event
          this.emit(`execution:${executionId}`, statusUpdate);
          
          // If execution completed, emit completion event
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status)) {
            this.handleExecutionCompletion(execution);
          }
        }
      }
      
      // Clean up completed executions after 5 minutes
      this.cleanupCompletedExecutions();
      
    } catch (error) {
      this.logger.error('Failed to check execution updates:', error);
    }
  }

  /**
   * Handle execution completion
   */
  handleExecutionCompletion(execution) {
    // 2026-07-26: the `execution.executionTimeMs ||` first arm read a column that has never
    // existed, so it was ALWAYS undefined and the timestamp derivation below was always the
    // one that ran. Dead first arm removed — same value, one fewer phantom. (Found by the
    // Bug Class 80 pin, not by the sweep: this site sits outside the payload builder.)
    const duration = execution.endTime && execution.startTime
      ? new Date(execution.endTime) - new Date(execution.startTime)
      : 0;
    
    this.emit('execution_completed', {
      executionId: execution.id,
      status: execution.status,
      duration: duration,
      taskId: execution.taskId,
      taskTitle: execution.task?.title
    });
    
    // Schedule cleanup after 5 minutes
    setTimeout(() => {
      this.activeStreams.delete(execution.id);
      this.executionCache.delete(execution.id);
      this.removeAllListeners(`execution:${execution.id}`);
      this.logger.debug(`Cleaned up completed execution: ${execution.id}`);
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up old completed executions
   */
  cleanupCompletedExecutions() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [executionId, status] of this.executionCache.entries()) {
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.status)) {
        const completionTime = new Date(status.timestamp).getTime();
        if (completionTime < fiveMinutesAgo) {
          this.activeStreams.delete(executionId);
          this.executionCache.delete(executionId);
          this.removeAllListeners(`execution:${executionId}`);
          this.logger.debug(`Cleaned up old execution: ${executionId}`);
        }
      }
    }
  }

  /**
   * Get streaming statistics
   */
  getStreamingStats() {
    return {
      enabled: true,
      activeStreams: this.activeStreams.size,
      cachedExecutions: this.executionCache.size,
      subscribers: Array.from(this.activeStreams.entries()).map(([execId, clients]) => ({
        executionId: execId,
        clientCount: clients.size
      }))
    };
  }

  /**
   * Create a progress update for an execution
   */
  async createProgressUpdate(executionId, progress, message) {
    try {
      // Update database
      await prisma.agentExecution.update({
        where: { id: executionId },
        data: { 
          progress: progress,
          lastProgressUpdate: new Date()
        }
      });
      
      // Create log entry
      await prisma.agentExecutionLog.create({
        data: {
          executionId: executionId,
          timestamp: new Date(),
          level: 'INFO',
          message: message || `Progress: ${progress}%`,
          metadata: {
            progress: progress,
            type: 'progress_update'
          }
        }
      });
      
      this.logger.debug(`Created progress update for ${executionId}: ${progress}%`);
      
      // Force immediate check for this execution
      await this.checkExecutionUpdates();
      
    } catch (error) {
      this.logger.error('Failed to create progress update:', error);
    }
  }

  /**
   * Shutdown streaming
   */
  shutdown() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    this.removeAllListeners();
    this.activeStreams.clear();
    this.executionCache.clear();
    
    this.logger.info('Execution streaming shut down');
  }
}

// Create singleton instance
const executionStreaming = new ExecutionStreaming();

module.exports = { ExecutionStreaming, executionStreaming };