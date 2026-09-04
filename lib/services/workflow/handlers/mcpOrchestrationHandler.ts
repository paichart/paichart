/**
 * MCP Service Orchestration Handler
 *
 * The Hub-aligned workflow handler for multi-service orchestration.
 * Uses the shared OrchestrationEngine for execution logic while adding:
 * - POV access validation
 * - Zod schema validation
 * - Audit logging
 * - Connection pooling via orchestrationServiceCaller
 * - Full execution tracking
 *
 * @see lib/services/workflow/core/orchestration-engine.js (shared core)
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 */

import { logger } from '@/lib/logger';
import { WorkflowHandler, WorkflowConfig, WorkflowResult } from '../workflowEngine';

const orchLogger = logger.child({ module: 'MCPOrchestration' });
import {
  MCPOrchestrationParamsSchema,
  MCPOrchestrationParams,
  WorkflowStep,
  OrchestrationConfig,
} from '../types/orchestration-params';
import {
  OrchestrationContext,
  buildOrchestrationContext,
} from '../types/orchestration-context';
import { orchestrationServiceCaller, ServiceCallResult } from '../integrations/service-caller';
import { orchestrationTracker } from '../tracking/orchestration-tracker';
import { auditOrchestration } from '../security/orchestration-audit';
import { validateMCPPOVAccess } from '@/lib/auth/validate-pov-access';

// Import shared trust utilities for POV context checking
const { checkPOVRequirement } = require('../security/trust-level') as {
  checkPOVRequirement: (steps: Array<{ service: string }>, povId: string | undefined) => {
    warning?: string;
    hint?: string;
  };
};

// Import the shared JavaScript orchestration engine
// Using require for JS module compatibility
const { OrchestrationEngine } = require('../core/orchestration-engine') as {
  OrchestrationEngine: new (config?: { maxConcurrent?: number }) => {
    validate: (params: MCPOrchestrationParams) => { isValid: boolean; errors: string[]; warnings: string[] };
    execute: (
      params: MCPOrchestrationParams,
      callService: (step: WorkflowStep) => Promise<ServiceCallResult>,
      context: OrchestrationContext,
      options?: { onStepComplete?: (result: ServiceCallResult) => Promise<void> }
    ) => Promise<{ success: boolean; results: ServiceCallResult[]; error?: string; branch?: string }>;
  };
};

/**
 * MCP Service Orchestration Handler
 *
 * Orchestrates multi-service workflows via MCP Hub with:
 * - Sequential execution with variable chaining ({{step.N.output}})
 * - Parallel execution with dependency analysis
 * - Conditional branching (if step 0 succeeds → step 1, else → step 2)
 * - Connection pooling (100-200ms savings per call)
 * - Full execution tracking in MCPWorkflowExecution
 */
export class MCPServiceOrchestrationHandler implements WorkflowHandler {
  readonly handlerType = 'mcp_orchestration';
  readonly supportedWorkflowTypes = [
    'mcp_service_orchestration',
    'parallel_service_execution',
    'conditional_workflow',
  ];

  private engine: InstanceType<typeof OrchestrationEngine>;

  constructor() {
    this.engine = new OrchestrationEngine({ maxConcurrent: 5 });
  }

  /**
   * Execute an orchestration workflow
   *
   * @param config - Workflow configuration
   * @param userId - User ID who triggered the execution
   * @returns Workflow execution result
   */
  async execute(config: WorkflowConfig, userId: string): Promise<WorkflowResult> {
    // Build context with optional JWT token for internal service auth
    // U2 Phase D site #15 (2026-05-19): config.token dropped from
    // buildOrchestrationContext call. Per-call mint at downstream sites
    // replaces the Bearer-forward path.
    const context = await buildOrchestrationContext(userId, config.povId);

    // Validate POV access if scoped
    if (config.povId) {
      const hasAccess = await validateMCPPOVAccess(userId, config.povId, {
        logContext: 'MCPServiceOrchestration',
        requireWrite: true,  // 2026-05-26: workflow execution is a write — isDemo must not grant
      });
      if (!hasAccess) {
        return {
          success: false,
          workflowId: context.execution.workflowId,
          status: 'FAILED',
          error: { message: 'POV access denied', code: 'ACCESS_DENIED' },
        };
      }
    }

    // Validate parameters with Zod schema
    const parseResult = MCPOrchestrationParamsSchema.safeParse(config.parameters);
    if (!parseResult.success) {
      return {
        success: false,
        workflowId: context.execution.workflowId,
        status: 'FAILED',
        error: {
          message: parseResult.error.errors.map((e) => e.message).join('; '),
          code: 'VALIDATION_FAILED',
        },
      };
    }

    const params = parseResult.data;

    // Ensure steps are present (required after workflowName resolution)
    if (!params.steps || params.steps.length === 0) {
      return {
        success: false,
        workflowId: context.execution.workflowId,
        status: 'FAILED',
        error: {
          message: 'Workflow steps are required. Provide steps array or workflowName that resolves to steps.',
          code: 'VALIDATION_FAILED',
        },
      };
    }

    // Type-safe validated params with steps guaranteed to be present
    const validatedSteps = params.steps;

    // Build orchestration config for tracking
    // Use validated params with steps guaranteed to be present
    // Include workflowId for named workflow execution tracking (links to MCPWorkflow)
    const orchConfig: OrchestrationConfig = {
      workflowType: config.workflowType as OrchestrationConfig['workflowType'],
      povId: config.povId,
      workflowId: config.workflowId,  // Link to MCPWorkflow for named workflows
      parameters: { ...params, steps: validatedSteps },
    };

    // Start tracking BEFORE validation - ensures errors are visible in database
    const executionId = await orchestrationTracker.start(context, orchConfig);

    // SECURITY: Check POV context for trust level assignment (trust-level.js)
    // - Internal services always receive INTERNAL trust + token
    // - External services without povId: OWNER (if owned) or ANONYMOUS trust
    // - External services with povId: SCOPED trust
    const povCheck = checkPOVRequirement(validatedSteps, config.povId);

    if (povCheck.warning) {
      orchLogger.warn({ warning: povCheck.warning }, 'Security notice');
      // Continue execution but with reduced trust level
    }

    // Additional validation using shared engine
    const validation = this.engine.validate({ ...params, steps: validatedSteps });
    if (!validation.isValid) {
      const errorMessage = validation.errors.join('; ');

      // Mark execution as failed in database with error message
      await orchestrationTracker.complete(executionId, [], false, errorMessage);

      return {
        success: false,
        workflowId: context.execution.workflowId,
        status: 'FAILED',
        error: {
          message: errorMessage,
          code: 'VALIDATION_FAILED',
        },
        executionId, // Include executionId so user can find it in database
      };
    }

    // Audit start
    await auditOrchestration(context, 'start', {
      stepCount: validatedSteps.length,
      executionMode: params.executionMode,
      services: [...new Set(validatedSteps.map((s) => s.service))],
    });

    try {
      // Create service caller that uses connection pooling
      const callService = this.createServiceCaller(context, executionId);

      // Execute using shared engine
      const result = await this.engine.execute(
        {
          steps: validatedSteps,
          executionMode: params.executionMode,
          failureStrategy: params.failureStrategy,
          timeout: params.timeout,
          // F3 closure parallel (sec-ops Finding F3, JS-side closed in commit
          // d3caed19 for workflow-tools-handler.js, TS-side closed here
          // 2026-05-17). Pre-fix: hardcoded 10 silently dropped caller's
          // user-configurable retry budget. `params.maxTotalRetries` is
          // guaranteed by the Zod parse at L108 — MCPOrchestrationParamsSchema
          // declares `.min(0).max(20).default(10)` so the field always exists
          // with a sensible default if the caller doesn't provide one.
          maxTotalRetries: params.maxTotalRetries,
        },
        callService,
        context,
        {
          onStepComplete: async (stepResult: ServiceCallResult) => {
            // Record each step as it completes
            await orchestrationTracker.recordStep(executionId, stepResult);
          },
        }
      );

      const allSucceeded = result.success;
      const successCount = result.results.filter((r: ServiceCallResult) => r.success).length;

      // Complete tracking
      // BUG-HUB-001 fix (2026-05-22): forward aggregated error from engine to
      // tracker. Without this 4th arg, the tracker's complete() persists
      // error: null on FAILED rows (Path 2 of the bug — see Plan v2 Fix 2 in
      // cline_docs/reviews/bug-hub-001-workflow-error-context-2026-05-22/).
      await orchestrationTracker.complete(
        executionId,
        result.results,
        allSucceeded,
        allSucceeded ? undefined : result.error
      );

      // Audit completion
      await auditOrchestration(context, allSucceeded ? 'complete' : 'failed', {
        successCount,
        failureCount: result.results.length - successCount,
        totalExecutionTime: result.results.reduce(
          (sum: number, r: ServiceCallResult) => sum + r.executionTime,
          0
        ),
      });

      return {
        success: allSucceeded,
        workflowId: context.execution.workflowId,
        status: allSucceeded ? 'SUCCESS' : 'FAILED',
        data: {
          executionId,
          results: result.results,
          summary: {
            total: result.results.length,
            succeeded: successCount,
            failed: result.results.length - successCount,
            partialSuccess: !allSucceeded && successCount > 0,
            branch: result.branch, // For conditional workflows
          },
        },
        executionTime: result.results.reduce(
          (sum: number, r: ServiceCallResult) => sum + r.executionTime,
          0
        ),
      };
    } catch (error) {
      // Use fail() instead of complete() to preserve previously recorded step data
      const errorMsg = error instanceof Error ? error.message : String(error);
      await orchestrationTracker.fail(executionId, errorMsg);

      await auditOrchestration(context, 'failed', {
        error: errorMsg,
      });

      return {
        success: false,
        workflowId: context.execution.workflowId,
        status: 'FAILED',
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'ORCHESTRATION_FAILED',
        },
      };
    }
  }

  /**
   * Create a service caller function for the shared engine
   *
   * Uses orchestrationServiceCaller for connection pooling benefits.
   * The engine expects: async (step, context) => StepResult
   */
  private createServiceCaller(context: OrchestrationContext, executionId: string) {
    return async (step: WorkflowStep): Promise<ServiceCallResult> => {
      return orchestrationServiceCaller.callService(
        context,
        step.service,
        step.tool,
        step.arguments
      );
    };
  }

  // ============================================
  // Interface Methods
  // ============================================

  /**
   * Validate workflow configuration before execution
   */
  async validate(config: WorkflowConfig): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    // First validate with Zod schema
    const zodResult = MCPOrchestrationParamsSchema.safeParse(config.parameters);

    if (!zodResult.success) {
      return {
        isValid: false,
        errors: zodResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        warnings: [],
      };
    }

    // Then validate with shared engine
    const engineValidation = this.engine.validate(zodResult.data);

    return {
      isValid: engineValidation.isValid,
      errors: engineValidation.errors,
      warnings: engineValidation.warnings,
    };
  }

  /**
   * Get handler capabilities and metadata
   */
  getCapabilities(): {
    name: string;
    description: string;
    supportedTypes: string[];
    version: string;
    features: string[];
  } {
    return {
      name: 'MCP Service Orchestration Handler',
      description: 'Orchestrates multi-service workflows via MCP Hub with connection pooling',
      supportedTypes: this.supportedWorkflowTypes,
      version: '4.0.0', // Bumped for shared core refactor
      features: [
        'Sequential execution with variable chaining',
        'Parallel execution with dependency analysis',
        'Conditional branching',
        'Connection pooling (100-200ms savings per call)',
        'Full execution tracking',
        'POV-scoped workflows',
        'Shared core with MCP server handler',
      ],
    };
  }
}
