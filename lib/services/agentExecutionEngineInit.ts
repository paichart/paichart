import { agentExecutionEngine } from './agentExecutionEngine';
import { logger } from '@/lib/logger';

const engineLogger = logger.child({ module: 'AgentExecutionEngineInit' });

/**
 * Initialize the agent execution engine
 * This should be called during server startup
 */
export async function initializeAgentExecutionEngine(): Promise<void> {
  try {
    engineLogger.info('Starting agent execution engine');
    await agentExecutionEngine.start();
    engineLogger.info('Agent execution engine started successfully');
  } catch (error) {
    engineLogger.error({ err: error }, 'Failed to start agent execution engine');
    // Don't throw - let the server start without the execution engine if needed
  }
}

/**
 * Shutdown the agent execution engine
 * This should be called during server shutdown
 */
export function shutdownAgentExecutionEngine(): void {
  try {
    engineLogger.info('Stopping agent execution engine');
    agentExecutionEngine.stop();
    engineLogger.info('Agent execution engine stopped');
  } catch (error) {
    engineLogger.error({ err: error }, 'Error stopping agent execution engine');
  }
}

// Export the engine instance for direct access
export { agentExecutionEngine };
