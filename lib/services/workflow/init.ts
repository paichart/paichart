/**
 * Workflow Engine Initialization
 * 
 * Handles the initialization of the workflow engine during server startup.
 * Ensures all handlers are registered and the engine is ready for use.
 */

import { initializeWorkflowEngine } from './index';
import { logger } from '@/lib/logger';

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize workflow engine on server startup
 * Safe to call multiple times - will only initialize once
 */
export async function initializeWorkflowEngineOnStartup(): Promise<void> {
  if (isInitialized) {
    logger.debug('workflow engine already initialized');
    return;
  }
  
  if (initializationPromise) {
    logger.debug('workflow engine initialization in progress, waiting');
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    try {
      logger.info('starting workflow engine initialization');

      // Initialize workflow engine with all handlers
      const engine = initializeWorkflowEngine();

      // Verify initialization
      const stats = engine.getEngineStats();
      logger.info({ registeredHandlers: stats.registeredHandlers, workflowTypeCount: stats.supportedWorkflowTypes.length, workflowTypes: stats.supportedWorkflowTypes }, 'workflow engine initialized');
      
      isInitialized = true;
      
    } catch (error) {
      logger.error({ err: error }, 'failed to initialize workflow engine');
      initializationPromise = null;
      throw error;
    }
  })();
  
  return initializationPromise;
}

/**
 * Check if workflow engine is initialized
 */
export function isWorkflowEngineInitialized(): boolean {
  return isInitialized;
}

/**
 * Force re-initialization of workflow engine
 * Use with caution - this will reset all registered handlers
 */
export async function reinitializeWorkflowEngine(): Promise<void> {
  logger.warn('force re-initializing workflow engine');
  isInitialized = false;
  initializationPromise = null;
  return initializeWorkflowEngineOnStartup();
}