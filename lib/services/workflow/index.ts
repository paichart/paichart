/**
 * Workflow Services - Main entry point
 *
 * Provides centralized access to workflow engine and handlers.
 *
 * ARCHITECTURE NOTE (Jan 2026):
 * Hub has ONE handler (MCPServiceOrchestrationHandler) that orchestrates services.
 * Browser automation is now a standalone MCP service at services/browser-automation-service/
 * called via orchestration, not a registered Hub handler.
 */

import { WorkflowEngine, getWorkflowEngine, registerWorkflowHandler, executeWorkflow } from './workflowEngine';
import { MCPServiceOrchestrationHandler } from './handlers/mcpOrchestrationHandler';
import { logger } from '@/lib/logger';

const workflowLogger = logger.child({ module: 'WorkflowServices' });

// Export core workflow types and functions
export {
  WorkflowEngine,
  getWorkflowEngine,
  registerWorkflowHandler,
  executeWorkflow
} from './workflowEngine';

export type {
  WorkflowConfig,
  WorkflowResult,
  WorkflowHandler,
  WorkflowExecutionConfig,
  WorkflowExecutionContext
} from './workflowEngine';

// Export workflow handlers
export { MCPServiceOrchestrationHandler } from './handlers/mcpOrchestrationHandler';

// Export orchestration types
export * from './types/orchestration-params';
export * from './types/orchestration-context';

/**
 * Initialize workflow engine with the Hub's orchestration handler
 * Call this during application startup
 */
export function initializeWorkflowEngine(): WorkflowEngine {
  workflowLogger.info('Initializing workflow engine');

  const engine = getWorkflowEngine();

  // Register MCP Service Orchestration handler
  const orchestrationHandler = new MCPServiceOrchestrationHandler();
  engine.registerHandler(orchestrationHandler);

  const stats = engine.getEngineStats();
  workflowLogger.info({ registeredHandlers: stats.registeredHandlers, supportedWorkflowTypes: stats.supportedWorkflowTypes }, 'Workflow engine initialized successfully');

  return engine;
}

/**
 * Get initialized workflow engine instance
 * Automatically initializes if not already done
 */
export function getInitializedWorkflowEngine(): WorkflowEngine {
  const engine = getWorkflowEngine();
  
  // Check if handlers are registered
  if (engine.getEngineStats().registeredHandlers === 0) {
    workflowLogger.info('No handlers registered, initializing');
    return initializeWorkflowEngine();
  }
  
  return engine;
}

/**
 * Utility function to execute browser automation workflow
 *
 * @deprecated Use executeOrchestrationWorkflow with browser-automation-service instead.
 * This function now routes to the orchestration handler.
 *
 * @example
 * // New recommended approach:
 * await executeOrchestrationWorkflow(
 *   'mcp_service_orchestration',
 *   {
 *     steps: [{
 *       service: 'browser-automation-service',
 *       tool: 'scrape_page',
 *       arguments: { url: 'https://example.com', selectors: { title: 'h1' } }
 *     }]
 *   },
 *   userId
 * );
 */
export async function executeBrowserWorkflow(
  workflowType: 'web_scraping' | 'ui_interaction' | 'form_submission' | 'browser_automation',
  parameters: Record<string, any>,
  userId: string,
  options?: {
    templateId?: string;
    taskId?: string;
    executionConfig?: Record<string, any>;
    synchronous?: boolean;
  }
) {
  workflowLogger.warn('executeBrowserWorkflow is DEPRECATED: Use executeOrchestrationWorkflow with browser-automation-service');

  // Map old workflow types to browser-automation-service tools
  const toolMapping: Record<string, string> = {
    web_scraping: 'scrape_page',
    ui_interaction: 'click_element',
    form_submission: 'fill_form',
    browser_automation: 'run_script'
  };

  const tool = toolMapping[workflowType] || 'scrape_page';

  // Route through orchestration
  return executeOrchestrationWorkflow(
    'mcp_service_orchestration',
    {
      steps: [{
        service: 'browser-automation-service',
        tool,
        arguments: parameters
      }]
    },
    userId,
    { synchronous: options?.synchronous }
  );
}

/**
 * Utility function to execute MCP service orchestration workflow
 *
 * @example
 * // Sequential execution
 * await executeOrchestrationWorkflow(
 *   'mcp_service_orchestration',
 *   {
 *     steps: [
 *       { service: 'sentry', tool: 'list_issues', arguments: { limit: 5 } },
 *       { service: 'slack', tool: 'send_message', arguments: { channel: '#alerts', text: '{{step.0.output.count}} issues' } }
 *     ],
 *     executionMode: 'sequential'
 *   },
 *   userId,
 *   { povId: 'clxxxx123' }
 * );
 */
export async function executeOrchestrationWorkflow(
  workflowType: 'mcp_service_orchestration' | 'parallel_service_execution' | 'conditional_workflow',
  parameters: {
    steps: Array<{
      service: string;
      tool: string;
      arguments: Record<string, unknown>;
      dependsOn?: number[];
      timeout?: number;
    }>;
    executionMode?: 'sequential' | 'parallel' | 'conditional';
    failureStrategy?: 'stop' | 'continue' | 'rollback';
    timeout?: number;
  },
  userId: string,
  options?: {
    povId?: string;
    synchronous?: boolean;
    /** Named workflow ID (links execution to MCPWorkflow for tracking) */
    workflowId?: string;
  }
) {
  // U2 Phase D site #14 (2026-05-19): `token` removed from options + config.
  // Bearer-forward path eliminated — downstream service-caller mints per-call
  // tokens with per-service audience (RFC 8707).
  const engine = getInitializedWorkflowEngine();

  const config = {
    workflowType,
    povId: options?.povId,
    workflowId: options?.workflowId,  // Link to named workflow for execution tracking
    parameters
  };

  return engine.executeWorkflow(config, userId, {
    synchronous: options?.synchronous
  });
}

/**
 * Get workflow engine statistics and health info
 */
export function getWorkflowEngineInfo() {
  const engine = getWorkflowEngine();
  const stats = engine.getEngineStats();
  const handlers = engine.getAvailableHandlers();
  const activeWorkflows = engine.getActiveWorkflows();
  
  return {
    stats,
    handlers,
    activeWorkflows,
    health: {
      status: stats.registeredHandlers > 0 ? 'healthy' : 'no-handlers',
      activeWorkflowCount: stats.activeWorkflows,
      totalCapabilities: stats.supportedWorkflowTypes.length
    }
  };
}