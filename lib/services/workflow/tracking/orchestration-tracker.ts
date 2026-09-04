/**
 * Orchestration Tracker - Database execution tracking for orchestration workflows
 *
 * Tracks workflow executions in MCPWorkflowExecution table.
 * Supports incremental step recording and completion tracking.
 *
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 */

import { prisma } from '@/lib/prisma';
import { ensureObject } from '@/lib/utils/ensure-object';
import { MCPExecutionMode } from '@prisma/client';
import { OrchestrationContext } from '../types/orchestration-context';
import { OrchestrationConfig } from '../types/orchestration-params';
import { ServiceCallResult } from '../integrations/service-caller';

/**
 * Orchestration Tracker
 *
 * Manages database tracking of orchestration workflow executions.
 * Records execution start, step completion, and final results.
 */
export class OrchestrationTracker {
  /**
   * Start tracking a new orchestration execution
   *
   * Creates a new MCPWorkflowExecution record in RUNNING status.
   *
   * @param context - Orchestration execution context
   * @param config - Orchestration configuration
   * @returns Execution ID (CUID)
   * @throws Error if user ID is not provided
   */
  async start(
    context: OrchestrationContext,
    config: OrchestrationConfig
  ): Promise<string> {
    // Guard against undefined userId (P1 boundary fix)
    if (!context.user?.id) {
      throw new Error('Cannot start orchestration: user ID required');
    }

    // Execution mode indicates source: PREDEFINED = GUI, AD_HOC = MCP
    // This tracker is only used by GUI handler (lib/workflows/handlers.ts)
    const executionMode = MCPExecutionMode.PREDEFINED;  // GUI execution

    const execution = await prisma.mCPWorkflowExecution.create({
      data: {
        // Link to named workflow if provided (for execution tracking)
        ...(config.workflowId && { workflowId: config.workflowId }),
        userId: context.user.id,
        executionMode,
        workflowType: config.workflowType,
        status: 'RUNNING',
        startTime: context.execution.startedAt,
        input: config as unknown as object,
        ...(config.povId && { povId: config.povId }),
        metadata: {
          requestId: context.execution.requestId,
          generatedWorkflowId: context.execution.workflowId,
          namedWorkflowId: config.workflowId || null,
        },
      },
    });

    return execution.id;
  }

  /**
   * Complete an orchestration execution
   *
   * Updates the execution record with final results and status.
   *
   * @param executionId - Execution ID to complete
   * @param results - Array of service call results
   * @param success - Whether execution succeeded overall
   * @param errorMessage - Optional error message if validation failed before execution
   */
  async complete(
    executionId: string,
    results: ServiceCallResult[],
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // BC19 (2026-06-08): lock this execution row so a concurrent recordStep/complete
      // serializes — its `metadata` merge is a read-modify-write. FOR UPDATE WAITS (does not
      // abort), so complete() never throws on contention while writing terminal status.
      await tx.$executeRaw`SELECT id FROM mcp_workflow_executions WHERE id = ${executionId} FOR UPDATE`;
      const execution = await tx.mCPWorkflowExecution.findUnique({
        where: { id: executionId },
        select: { startTime: true, metadata: true, workflowId: true },
      });

      const startTime = execution?.startTime || new Date();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const existingMetadata = ensureObject(execution?.metadata, {}, 'WorkflowExecution metadata');

      await tx.mCPWorkflowExecution.update({
        where: { id: executionId },
        data: {
          status: success ? 'COMPLETED' : 'FAILED',
          endTime,
          duration,
          output: results as unknown as object,
          steps: results.map((r, i) => ({
            stepIndex: i,
            service: r.service,
            tool: r.tool,
            success: r.success,
            executionTime: r.executionTime,
            error: r.error,
            errorType: (r as any).errorType,
            retryable: (r as any).retryable,
            attempts: (r as any).attempts,
          })),
          // BUG-HUB-001 fix (2026-05-22): always write error column when status=FAILED.
          // The previous conditional-spread pattern `...(errorMessage && { error })`
          // SKIPPED the column when errorMessage was undefined, leaving the value at
          // whatever start() set (null). Belt-and-suspenders: even if a future regression
          // removes engine-level aggregation (orchestration-engine.js post-Plan-v2 fix),
          // this fallback ensures no future row ever has status='FAILED' + error=null.
          // See Plan v2 Fix 3 in cline_docs/reviews/bug-hub-001-workflow-error-context-2026-05-22/
          error: success ? null : (errorMessage || 'Workflow failed without diagnostic context (no error propagated from engine)'),
          metadata: {
            ...existingMetadata,
            stepsCompleted: results.filter(r => r.success).length,
            totalSteps: results.length,
            totalExecutionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
          },
        },
      });

      // Update MCPWorkflow execution stats if this is a named workflow
      if (execution?.workflowId) {
        // BC19: lock the workflow row — executionCount/successRate is a running-average RMW.
        await tx.$executeRaw`SELECT id FROM mcp_workflows WHERE id = ${execution.workflowId} FOR UPDATE`;
        const workflow = await tx.mCPWorkflow.findUnique({
          where: { id: execution.workflowId },
          select: { executionCount: true, successRate: true },
        });

        if (workflow) {
          const newCount = workflow.executionCount + 1;
          const currentSuccessRate = workflow.successRate || 0;
          const newSuccessRate = ((currentSuccessRate * workflow.executionCount) + (success ? 100 : 0)) / newCount;

          await tx.mCPWorkflow.update({
            where: { id: execution.workflowId },
            data: {
              executionCount: newCount,
              successRate: Math.round(newSuccessRate * 100) / 100,
              lastExecution: endTime,
              averageTime: duration,
            },
          });
        }
      }
    });
  }

  /**
   * Record a single step completion
   *
   * Appends step result to execution metadata for incremental tracking.
   *
   * @param executionId - Execution ID
   * @param result - Service call result for the step
   */
  async recordStep(
    executionId: string,
    result: ServiceCallResult
  ): Promise<void> {
    // BC19 (2026-06-08): atomic jsonb_set append of ONE step. Was a plain-$transaction
    // findUnique → spread → write — which genuinely LOSES steps under PARALLEL execution
    // (a plain $transaction does NOT prevent lost-update). High-contention path, so RR would
    // abort-storm; instead the step is appended to metadata.steps IN-SQL (other metadata keys
    // preserved) for true concurrency. See BC19 / transaction-atomicity-pattern.md.
    const step = {
      service: result.service,
      tool: result.tool,
      success: result.success,
      executionTime: result.executionTime,
      error: result.error,
      errorType: (result as any).errorType,
      retryable: (result as any).retryable,
      attempts: (result as any).attempts,
      completedAt: new Date().toISOString(),
    };
    await prisma.$executeRaw`
      UPDATE mcp_workflow_executions
         SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{steps}',
               COALESCE(metadata->'steps', '[]'::jsonb) || ${JSON.stringify(step)}::jsonb
             )
       WHERE id = ${executionId}`;
  }

  /**
   * Mark an execution as failed with error details
   *
   * @param executionId - Execution ID
   * @param error - Error message
   * @param failedStep - Optional step that failed
   */
  async fail(
    executionId: string,
    error: string,
    failedStep?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // BC19 (2026-06-08): lock this execution row — the `metadata` merge below is a
      // read-modify-write. FOR UPDATE waits (no abort) so fail() reliably writes its status.
      await tx.$executeRaw`SELECT id FROM mcp_workflow_executions WHERE id = ${executionId} FOR UPDATE`;
      const execution = await tx.mCPWorkflowExecution.findUnique({
        where: { id: executionId },
        select: { startTime: true, metadata: true },
      });

      const startTime = execution?.startTime || new Date();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Preserve previously recorded step data in metadata
      const existingMetadata = ensureObject(execution?.metadata, {}, 'WorkflowExecution metadata');

      await tx.mCPWorkflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          endTime,
          duration,
          error,
          failedStep,
          metadata: {
            ...existingMetadata,
            failedAt: endTime.toISOString(),
          },
        },
      });
    });
  }
}

/** Singleton instance of the orchestration tracker */
export const orchestrationTracker = new OrchestrationTracker();
