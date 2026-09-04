/**
 * Workflow Engine - Core orchestration service for pAIchart
 * 
 * Provides plugin-based workflow orchestration that integrates with the 
 * triple-layer task service architecture. Supports browser automation,
 * data processing, notification workflows, and custom automation handlers.
 */

import { v4 as uuidv4 } from 'uuid';
import { EnhancedTaskService } from '@/lib/services/taskService';
import { logWorkflowExecution } from '@/lib/tasks/services/taskActivityService';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'WorkflowEngine' });

/**
 * Core Workflow Types
 */
export interface WorkflowConfig {
  workflowType: string;
  templateId?: string;
  taskId?: string;
  povId?: string;  // POV scoping for multi-tenant workflows
  // U2 Phase D site #16 (2026-05-19): `token?: string` field DROPPED.
  // Bearer-forward path eliminated — downstream service-caller mints per-call
  // tokens with per-service audience (RFC 8707 blast-radius isolation).
  workflowId?: string;  // Database workflow ID for named workflows (links execution tracking)
  executionConfig?: WorkflowExecutionConfig;
  parameters?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WorkflowExecutionConfig {
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
  parallelExecution?: boolean;
  maxConcurrentTasks?: number;
  autoRetry?: boolean;
  resourceLimits?: {
    cpuLimit?: number;
    memoryLimitMb?: number;
    executionTimeoutMinutes?: number;
  };
}

export interface WorkflowResult {
  success: boolean;
  workflowId: string;
  taskId?: string;
  executionId?: string;  // Database execution record ID (for tracking validation failures)
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  data?: any;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  executionTime?: number;
  metadata?: Record<string, any>;
}

export interface WorkflowHandler {
  /**
   * Handler identification
   */
  readonly handlerType: string;
  readonly supportedWorkflowTypes: string[];
  
  /**
   * Execute workflow with given configuration
   */
  execute(config: WorkflowConfig, userId: string): Promise<WorkflowResult>;
  
  /**
   * Validate workflow configuration
   */
  validate?(config: WorkflowConfig): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>;
  
  /**
   * Get handler capabilities and metadata
   */
  getCapabilities?(): {
    name: string;
    description: string;
    supportedTypes: string[];
    version: string;
  };
}

/**
 * Workflow Execution Context
 */
export interface WorkflowExecutionContext {
  workflowId: string;
  taskId?: string;
  userId: string;
  startTime: Date;
  config: WorkflowConfig;
  handler: WorkflowHandler;
  retryCount: number;
  isRetry: boolean;
}

/**
 * Main Workflow Engine
 * Orchestrates workflow execution using registered handlers
 */
export class WorkflowEngine {
  private static instance: WorkflowEngine;
  private handlers: Map<string, WorkflowHandler> = new Map();
  private activeWorkflows: Map<string, WorkflowExecutionContext> = new Map();

  // MEMORY SAFETY: Prevent unbounded Map growth (Category 1 time-bomb)
  private static readonly MAX_ACTIVE_WORKFLOWS = 100;
  
  private constructor() {
    log.info('Initializing workflow engine');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }
  
  /**
   * Register a workflow handler
   */
  public registerHandler(handler: WorkflowHandler): void {
    const handlerType = handler.handlerType;
    
    if (this.handlers.has(handlerType)) {
      log.warn({ handlerType }, 'Overriding existing handler');
    }

    this.handlers.set(handlerType, handler);

    log.info({ handlerType, supportedTypes: handler.supportedWorkflowTypes }, 'Registered handler');
  }
  
  /**
   * Unregister a workflow handler
   */
  public unregisterHandler(handlerType: string): boolean {
    const removed = this.handlers.delete(handlerType);
    if (removed) {
      log.info({ handlerType }, 'Unregistered handler');
    }
    return removed;
  }
  
  /**
   * Get available workflow handlers
   */
  public getAvailableHandlers(): Array<{
    handlerType: string;
    supportedWorkflowTypes: string[];
    capabilities?: any;
  }> {
    return Array.from(this.handlers.values()).map(handler => ({
      handlerType: handler.handlerType,
      supportedWorkflowTypes: handler.supportedWorkflowTypes,
      capabilities: handler.getCapabilities ? handler.getCapabilities() : undefined
    }));
  }
  
  /**
   * Find appropriate handler for workflow type
   */
  private findHandler(workflowType: string): WorkflowHandler | null {
    for (const handler of this.handlers.values()) {
      if (handler.supportedWorkflowTypes.includes(workflowType)) {
        return handler;
      }
    }
    return null;
  }
  
  /**
   * Execute workflow with orchestration and monitoring
   */
  public async executeWorkflow(
    config: WorkflowConfig,
    userId: string,
    options?: {
      synchronous?: boolean;
      notifyOnCompletion?: boolean;
    }
  ): Promise<WorkflowResult> {
    // Use database workflowId for named workflows, generate UUID for ad-hoc workflows
    const workflowId = config.workflowId || uuidv4();
    const startTime = new Date();
    
    log.info({ workflowId, workflowType: config.workflowType, taskId: config.taskId, isNamed: !!config.workflowId }, 'Starting workflow execution');

    // Find appropriate handler
    const handler = this.findHandler(config.workflowType);
    if (!handler) {
      const error = {
        message: `No handler found for workflow type: ${config.workflowType}`,
        code: 'HANDLER_NOT_FOUND',
        details: { availableTypes: Array.from(this.handlers.keys()) }
      };
      
      log.error({ workflowType: config.workflowType, availableTypes: Array.from(this.handlers.keys()) }, 'No handler found for workflow type');
      
      return {
        success: false,
        workflowId,
        taskId: config.taskId,
        status: 'FAILED',
        error,
        executionTime: Date.now() - startTime.getTime()
      };
    }
    
    // Create execution context
    const context: WorkflowExecutionContext = {
      workflowId,
      taskId: config.taskId,
      userId,
      startTime,
      config,
      handler,
      retryCount: 0,
      isRetry: false
    };
    
    // MEMORY SAFETY: Reject if at capacity to prevent unbounded growth
    if (this.activeWorkflows.size >= WorkflowEngine.MAX_ACTIVE_WORKFLOWS) {
      log.warn({ workflowId, activeCount: this.activeWorkflows.size }, 'Maximum active workflows reached');
      return {
        success: false,
        workflowId,
        taskId: config.taskId,
        status: 'FAILED',
        error: {
          message: `Maximum active workflows (${WorkflowEngine.MAX_ACTIVE_WORKFLOWS}) reached. Try again later.`,
          code: 'MAX_WORKFLOWS_EXCEEDED',
          details: { activeCount: this.activeWorkflows.size }
        },
        executionTime: Date.now() - startTime.getTime()
      };
    }

    // Store active workflow
    this.activeWorkflows.set(workflowId, context);

    try {
      // Validate configuration if handler supports it
      if (handler.validate) {
        const validation = await handler.validate(config);
        if (!validation.isValid) {
          const error = {
            message: 'Workflow configuration validation failed',
            code: 'VALIDATION_FAILED',
            details: { errors: validation.errors, warnings: validation.warnings }
          };
          
          log.error({ workflowId, errors: validation.errors }, 'Workflow configuration validation failed');

          // BC33 FIX: Clean up activeWorkflows on validation failure (was leaked)
          this.activeWorkflows.delete(workflowId);

          return {
            success: false,
            workflowId,
            taskId: config.taskId,
            status: 'FAILED',
            error,
            executionTime: Date.now() - startTime.getTime()
          };
        }
        
        if (validation.warnings.length > 0) {
          log.warn({ workflowId, warnings: validation.warnings }, 'Workflow configuration has warnings');
        }
      }
      
      // Update task status if task ID provided
      if (config.taskId) {
        await this.updateTaskStatus(config.taskId, 'RUNNING', userId);
      }
      
      // Execute workflow with retry logic
      const result = await this.executeWithRetries(context);
      
      // Update task with results
      if (config.taskId) {
        await this.updateTaskWithResults(config.taskId, result, userId);

        // Log workflow execution to task activity (fire-and-forget)
        logWorkflowExecution(config.taskId, userId, {
          workflowId,
          workflowType: config.workflowType,
          status: result.success ? 'SUCCESS' : (result.data?.summary?.partialSuccess ? 'PARTIAL' : 'FAILED'),
          stepCount: result.data?.summary?.total || result.data?.results?.length,
          executionTime: result.executionTime,
        });
      }

      // Cleanup
      this.activeWorkflows.delete(workflowId);

      log.info({ workflowId, status: result.status }, 'Workflow completed');
      return result;
      
    } catch (error) {
      // Cleanup on error
      this.activeWorkflows.delete(workflowId);
      
      const executionTime = Date.now() - startTime.getTime();
      const workflowError = {
        message: error instanceof Error ? error.message : String(error),
        code: 'EXECUTION_ERROR',
      };
      
      log.error({ err: error instanceof Error ? error : new Error(String(error)), workflowId }, 'Workflow execution failed');
      
      // Update task with error if task ID provided
      if (config.taskId) {
        await this.updateTaskStatus(config.taskId, 'FAILED', userId, workflowError.message);

        // Log failed workflow execution to task activity (fire-and-forget)
        logWorkflowExecution(config.taskId, userId, {
          workflowId,
          workflowType: config.workflowType,
          status: 'FAILED',
          executionTime,
        });
      }

      return {
        success: false,
        workflowId,
        taskId: config.taskId,
        status: 'FAILED',
        error: workflowError,
        executionTime
      };
    }
  }
  
  /**
   * Execute workflow with retry logic
   */
  private async executeWithRetries(context: WorkflowExecutionContext): Promise<WorkflowResult> {
    const { config, handler } = context;
    const maxRetries = config.executionConfig?.maxRetries ?? 3;
    const baseDelaySec = config.executionConfig?.retryDelaySeconds || 30;
    const maxDelaySec = baseDelaySec * 4; // Cap at 4x base (e.g., 120s for 30s base)
    const autoRetry = config.executionConfig?.autoRetry !== false;

    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        context.retryCount = attempt;
        context.isRetry = attempt > 0;

        if (attempt > 0) {
          // Exponential backoff with jitter to prevent thundering herd
          const exponentialDelay = Math.min(baseDelaySec * Math.pow(2, attempt - 1), maxDelaySec);
          const jitter = exponentialDelay * 0.2 * Math.random(); // ±20% jitter
          const delayMs = (exponentialDelay + jitter) * 1000;

          log.info({ workflowId: context.workflowId, attempt, maxRetries, delayMs: Math.round(delayMs) }, 'Retrying workflow with exponential backoff');

          if (autoRetry && baseDelaySec > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        
        // Execute with timeout. Prefer the workflow's OWN configured timeout — config.parameters.timeout
        // is already ms (RunWorkflowSchema + the DB store ms; WorkflowEditor saves seconds*1000). Before
        // 2026-07-01 this only read executionConfig.timeoutSeconds, which the GUI/TS path never populates,
        // so every GUI run silently capped at 300s regardless of the user's Timeout field — only the MCP
        // workflow.execute path honored it. Fall back to executionConfig.timeoutSeconds, then a 5-min default.
        const configuredTimeoutMs = config.parameters?.timeout as number | undefined;
        const timeoutMs = (configuredTimeoutMs && configuredTimeoutMs > 0)
          ? configuredTimeoutMs
          : (config.executionConfig?.timeoutSeconds || 300) * 1000;
        const executionPromise = handler.execute(config, context.userId);

        const result = await Promise.race([
          executionPromise,
          this.createTimeoutPromise(timeoutMs, context.workflowId)
        ]);

        // Success - return result
        if (result.success) {
          return {
            ...result,
            workflowId: context.workflowId,
            executionTime: Date.now() - context.startTime.getTime(),
            metadata: {
              ...result.metadata,
              retryCount: attempt,
              totalAttempts: attempt + 1
            }
          };
        }
        
        // Handler returned failure - store error for potential retry
        lastError = result.error;
        
        if (!autoRetry || attempt === maxRetries) {
          return {
            ...result,
            workflowId: context.workflowId,
            executionTime: Date.now() - context.startTime.getTime(),
            metadata: {
              ...result.metadata,
              retryCount: attempt,
              totalAttempts: attempt + 1,
              maxRetriesReached: attempt === maxRetries
            }
          };
        }
        
      } catch (error) {
        lastError = error;
        
        if (!autoRetry || attempt === maxRetries) {
          throw error;
        }
        
        log.warn({ err: error instanceof Error ? error : new Error(String(error)), workflowId: context.workflowId, attempt: attempt + 1 }, 'Workflow attempt failed, will retry');
      }
    }
    
    // Should not reach here, but handle just in case
    throw lastError || new Error('Max retries exceeded');
  }
  
  /**
   * Create timeout promise for workflow execution
   */
  private createTimeoutPromise(timeoutMs: number, workflowId: string): Promise<WorkflowResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow ${workflowId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
  
  /**
   * Update task status through enhanced task service
   */
  private async updateTaskStatus(
    taskId: string,
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED',
    userId: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const statusMap: Record<string, any> = {
        PENDING: { status: 'OPEN', executionStatus: 'PENDING' },
        RUNNING: { status: 'IN_PROGRESS', executionStatus: 'RUNNING' },
        SUCCESS: { status: 'COMPLETED', executionStatus: 'SUCCESS' },
        FAILED: { status: 'OPEN', executionStatus: 'FAILED' }
      };
      
      const updateData = statusMap[status];
      if (errorMessage && status === 'FAILED') {
        updateData.agentLog = errorMessage;
      }
      
      await EnhancedTaskService.updateTaskWithActivity(taskId, updateData, userId);
      
    } catch (error) {
      log.error({ err: error instanceof Error ? error : new Error(String(error)), taskId, status }, 'Failed to update task status');
      // Don't throw - task update failure shouldn't break workflow
    }
  }
  
  /**
   * Update task with workflow execution results
   */
  private async updateTaskWithResults(
    taskId: string,
    result: WorkflowResult,
    userId: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status: result.success ? 'COMPLETED' : 'OPEN',
        executionStatus: result.status
      };
      
      if (result.data) {
        updateData.outputArtifacts = JSON.stringify(result.data);
      }
      
      if (result.error) {
        updateData.agentLog = `Workflow execution ${result.success ? 'completed' : 'failed'}: ${result.error.message}`;
      } else {
        updateData.agentLog = 'Workflow execution completed successfully';
      }
      
      // Add workflow metadata to task — DELTA ONLY (bc R13 fix, 2026-08-19,
      // ts-review 93/100: cline_docs/reviews/workflow-engine-metadata-delta-2026-08-19/).
      // The old shape read task.metadata OUTSIDE any tx and resent it wholesale,
      // re-echoing stale sibling keys over concurrent writers (lost-update) and
      // misattributing PLATFORM_RUN_KEY_STALE_DROP warns to 'web-funnel'. The
      // funnel is already merge-safe on BOTH write paths: TaskService.updateTask
      // reads fresh INSIDE its RepeatableRead tx (task.ts:825/:836) and the C5
      // mergeJsonbField shallow-merge preserves sibling keys; the terminal path's
      // completion core re-reads in-tx too (task.ts:761-774). workflowResult
      // replaces wholesale as ONE key — this funnel write is its legitimate
      // writer (deliberately NOT in PLATFORM_RUN_KEYS; pinned at
      // test-platform-run-keys.ts). Do NOT reintroduce a caller-side pre-merge.
      if (result.metadata || result.executionTime) {
        updateData.metadata = {
          workflowResult: {
            workflowId: result.workflowId,
            executionTime: result.executionTime,
            status: result.status,
            ...result.metadata
          }
        };
      }
      
      await EnhancedTaskService.updateTaskWithActivity(taskId, updateData, userId);
      
    } catch (error) {
      log.error({ err: error instanceof Error ? error : new Error(String(error)), taskId }, 'Failed to update task with workflow results');
      // Don't throw - task update failure shouldn't break workflow
    }
  }
  
  /**
   * Get active workflows
   */
  public getActiveWorkflows(): Array<{
    workflowId: string;
    taskId?: string;
    workflowType: string;
    status: string;
    startTime: Date;
    executionTime: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeWorkflows.values()).map(context => ({
      workflowId: context.workflowId,
      taskId: context.taskId,
      workflowType: context.config.workflowType,
      status: 'RUNNING',
      startTime: context.startTime,
      executionTime: now - context.startTime.getTime()
    }));
  }
  
  /**
   * Cancel active workflow
   */
  public async cancelWorkflow(workflowId: string, userId: string): Promise<boolean> {
    const context = this.activeWorkflows.get(workflowId);
    if (!context) {
      log.warn({ workflowId }, 'Cannot cancel workflow: not found');
      return false;
    }
    
    log.info({ workflowId }, 'Cancelling workflow');
    
    // Remove from active workflows
    this.activeWorkflows.delete(workflowId);
    
    // Update task status if applicable
    if (context.taskId) {
      await this.updateTaskStatus(context.taskId, 'FAILED', userId, 'Workflow cancelled by user');
    }
    
    return true;
  }
  
  /**
   * Get workflow engine statistics
   */
  public getEngineStats(): {
    activeWorkflows: number;
    registeredHandlers: number;
    supportedWorkflowTypes: string[];
  } {
    const supportedTypes = new Set<string>();
    for (const handler of this.handlers.values()) {
      handler.supportedWorkflowTypes.forEach(type => supportedTypes.add(type));
    }
    
    return {
      activeWorkflows: this.activeWorkflows.size,
      registeredHandlers: this.handlers.size,
      supportedWorkflowTypes: Array.from(supportedTypes)
    };
  }
}

/**
 * Initialize and get workflow engine instance
 */
export function getWorkflowEngine(): WorkflowEngine {
  return WorkflowEngine.getInstance();
}

/**
 * Utility function to register a workflow handler
 */
export function registerWorkflowHandler(handler: WorkflowHandler): void {
  const engine = getWorkflowEngine();
  engine.registerHandler(handler);
}

/**
 * Utility function to execute a workflow
 */
export async function executeWorkflow(
  config: WorkflowConfig,
  userId: string,
  options?: {
    synchronous?: boolean;
    notifyOnCompletion?: boolean;
  }
): Promise<WorkflowResult> {
  const engine = getWorkflowEngine();
  return engine.executeWorkflow(config, userId, options);
}