/**
 * MCP Logging Utility
 *
 * Handles logging of MCP interactions for analytics and monitoring.
 * Creates MCPInteraction records linked to registered internal services.
 *
 * NOTE: Auto-registration (Method 4) was removed as it never worked correctly.
 * Internal services are now registered as a unified service:
 * - paichart-project-service (consolidated from paichart-pov-service + paichart-task-service, Mar 2026)
 *
 * See: MCP-HUB-SERVICE-REGISTRATION-METHODS.md for registration patterns.
 */

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'MCPLogging' });

/**
 * Maps action strings to their corresponding internal service ID
 */
const ACTION_TO_SERVICE: Record<string, string> = {
  'task.create': 'paichart-project-service',
  'task.update': 'paichart-project-service',
  'task.assign': 'paichart-project-service',
  'task.complete': 'paichart-project-service',
  'task.comment': 'paichart-project-service',
  'agent.configure': 'paichart-project-service',
  'agent.execute': 'paichart-project-service',
  'analytics.generate': 'paichart-project-service',
  'pov.create': 'paichart-project-service',
  'pov.update': 'paichart-project-service',
  'stage.create': 'paichart-project-service',
  'agent.assign': 'paichart-project-service',
  'agent.status': 'paichart-project-service',
  'agent.results': 'paichart-project-service'
};

/**
 * Logs an MCP interaction for analytics and monitoring
 *
 * Maps action strings to valid MCPAction enum values and creates interaction records.
 * Interaction logging is non-critical - failures are caught and logged but don't affect
 * the main operation.
 *
 * @param actionId - Unique ID for this interaction
 * @param action - Action type (e.g., 'task.create', 'agent.execute')
 * @param parameters - Action parameters
 * @param result - Action result
 * @param userId - User who triggered the action
 */
export async function logMCPInteraction(
  actionId: string,
  action: string,
  parameters: any,
  result: any,
  userId: string
) {
  try {
    // Map action strings to valid MCPAction enum values
    const actionMapping: Record<string, string> = {
      'task.create': 'CREATE_TASK',
      'task.update': 'UPDATE_TASK',
      'task.assign': 'UPDATE_TASK',
      'task.complete': 'UPDATE_TASK',
      'task.comment': 'UPDATE_TASK',
      'agent.configure': 'AUTOMATE_PROCESS',
      'agent.execute': 'EXECUTE_WORKFLOW',
      'analytics.generate': 'GENERATE_REPORT',
      'pov.create': 'CREATE_TASK',
      'pov.update': 'UPDATE_TASK', // Verb mapping precedent (D7 v3); pov.create maps to CREATE_TASK for the same reason. Future cleanup: introduce UPDATE_POV + CREATE_POV in a logging-taxonomy batch migration.
      'stage.create': 'CREATE_TASK',
      'agent.assign': 'UPDATE_TASK',
      'agent.status': 'GET_CONTEXT',
      'agent.results': 'GET_CONTEXT'
    };

    const mcpAction = actionMapping[action] || 'AUTOMATE_PROCESS';
    const toolId = ACTION_TO_SERVICE[action] || 'paichart-project-service';

    // Check if the service exists before logging interaction
    const serviceExists = await prisma.mCPTool.findUnique({
      where: { id: toolId },
      select: { id: true }
    });

    if (!serviceExists) {
      // Service not yet registered - skip interaction logging
      // This is expected until internal services are properly registered
      return;
    }

    // Create the interaction record
    await prisma.mCPInteraction.create({
      data: {
        id: actionId,
        toolId: toolId,
        action: mcpAction as any,
        request: parameters,
        response: result,
        // Internal action handlers return { status: 'completed' } on success (not 'success',
        // and no `.success` field) — the old check only matched 'success'/`success===true`, so
        // every successful internal action was logged PENDING (root cause of the PENDING backlog
        // that read as a false ~87% error rate). Recognize 'completed'; mark explicit failures
        // FAILED; only genuinely-unknown results stay PENDING.
        status:
          result?.success === true || result?.status === 'success' || result?.status === 'completed'
            ? 'COMPLETED'
            : result?.success === false || result?.status === 'failed' || result?.status === 'error'
              ? 'FAILED'
              : 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    log.error({ err: error }, 'failed to log MCP interaction');
    // Don't throw error as this is non-critical
  }
}
