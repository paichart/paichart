import type { Server as HttpServer } from 'http';
import { initializeAgentExecutionEngine, shutdownAgentExecutionEngine } from './services/agentExecutionEngineInit';
import type { MCPServerConfig } from './services/llm/mcp-integration';
import { config } from './config';
import { initializeWorkflowEngineOnStartup } from './services/workflow/init';
import { tokenRefreshService } from './auth/oauth/token-refresh-service';
import { initializePromptRegistryEvents } from './events/prompt-registry-events';
import { initializeExecutionEvents } from './events/execution-events';
import { getPhaseStageEventEmitter } from './events/phase-stage-events';
import { logger } from './logger';

export async function initializeServer(server: HttpServer) {
  // ⚠️ CROSS-PROCESS INVARIANT (2026-06-21): this runs in paichart-web ONLY.
  // The paichart-mcp process (mcp-server-http-clean.js) calls initializeMCPServices()
  // directly and does NOT call initializeServer() — so everything below the MCP-services
  // line (agent-execution poller + zombie cleanup, workflow engine, token refresh,
  // notification health, task-subscription cleanup, event pre-warms, compliance monitor)
  // runs ONLY here. The MCP process RELIES on this process for the background
  // agent-execution poller/cleanup backstop (it executes inline but has no poller).
  // ⇒ If you ADD a service here, DECIDE whether paichart-mcp needs it too and wire it
  //    in mcp-server-http-clean.js — silent divergence caused the 2026-06-20 phase-stage
  //    dropped-events bug. (Matching note lives at the MCP init site.)
  //
  // Initialize MCP services (server param unused — kept in initializeServer for
  // callers that have an HttpServer handy; not forwarded further)
  await initializeMCPServices();

  // Initialize Agent Execution Engine
  await initializeAgentExecutionEngine();

  // Initialize Workflow Engine
  await initializeWorkflowEngineOnStartup();

  // Initialize Token Refresh Service (OAuth v2.2)
  tokenRefreshService.start();

  // Initialize Notification Health Check (Fix 4.1)
  const { startNotificationHealthCheck } = await import('./notifications/handlers/get');
  startNotificationHealthCheck();

  // Initialize Task Subscription periodic cleanup (Fix 4.2)
  const { TaskSubscriptionServiceClass } = await import('./services/taskSubscriptionService');
  TaskSubscriptionServiceClass.startPeriodicCleanup();

  // Initialize Event Systems (Nov 26, 2025 - SCRAM auth fix)
  logger.info({ phase: 'init' }, 'Initializing event systems');
  const promptEventsReady = await initializePromptRegistryEvents();
  const executionEventsReady = await initializeExecutionEvents();
  // Finding C (2026-06-14): BaseEventEmitter is now lazy-init (eager constructor
  // connect removed). phase-stage-events is its sole live subclass — pre-warm it
  // here so phase/stage UI live-updates fire from the first request instead of a
  // cold-connect on first emit. initialize() returns false (never throws) on
  // failure; surface it loud (degraded live-updates, not fatal — non-auth path).
  const phaseStageEventsReady = await getPhaseStageEventEmitter().initialize();
  if (!phaseStageEventsReady) {
    logger.error({ phase: 'init' }, 'phase-stage event system FAILED to pre-warm — phase/stage live-updates will be degraded until a lazy reconnect succeeds');
  }
  logger.info({ phase: 'init', promptEventsReady, executionEventsReady, phaseStageEventsReady }, 'Event systems initialized');

  // Initialize Compliance Monitor Cleanup (Jan 2026 - TIME BOMB FIX)
  // Pattern: time-bomb-detection-pattern.md (Category 2: Missing Cleanup Schedulers)
  try {
    const { ComplianceMonitor } = await import('./mcp/server/security/compliance-monitor');
    // Use singleton to prevent double cleanup scheduling (getInstance() calls scheduleCleanup internally)
    const complianceMonitor = ComplianceMonitor.getInstance();
    logger.info({ phase: 'init' }, 'Compliance Monitor cleanup scheduler started');

    // Store reference for shutdown
    (global as any).__complianceMonitor = complianceMonitor;
  } catch (complianceError) {
    logger.error({ err: complianceError, phase: 'init' }, 'Failed to start Compliance Monitor');
  }

  // Log server initialization summary
  logger.info({
    phase: 'init',
    services: {
      mcp: true,
      agentExecutionEngine: true,
      workflowEngine: true,
      oauthTokenRefresh: true,
      promptRegistryEvents: promptEventsReady,
      executionEvents: executionEventsReady,
    },
  }, 'Server initialization complete');

  // Handle server shutdown
  const cleanup = async () => {
    logger.info({ phase: 'shutdown' }, 'Shutting down server');

    try {
      // Stop token refresh service
      tokenRefreshService.stop();

      // Stop notification health check (Fix 4.1)
      const { stopNotificationHealthCheck } = await import('./notifications/handlers/get');
      stopNotificationHealthCheck();

      // Stop task subscription cleanup (Fix 4.2)
      const { TaskSubscriptionServiceClass } = await import('./services/taskSubscriptionService');
      TaskSubscriptionServiceClass.stopPeriodicCleanup();

      // Shutdown shared database connection pool (Fix 1.11)
      const { getSharedEventConnectionPool } = await import('./events/shared-connection-pool');
      const connectionPool = getSharedEventConnectionPool();
      await connectionPool.gracefulDisconnect();
      logger.info({ phase: 'shutdown' }, 'Database connection pool shutdown complete');

      // Stop Compliance Monitor cleanup scheduler (Jan 2026 - TIME BOMB FIX)
      if ((global as any).__complianceMonitor) {
        (global as any).__complianceMonitor.stopCleanup();
        logger.info({ phase: 'shutdown' }, 'Compliance Monitor cleanup stopped');
      }

      // Shutdown MCP services
      await shutdownMCPServices();

      // Shutdown agent execution engine
      shutdownAgentExecutionEngine();

      logger.info({ phase: 'shutdown' }, 'All services shutdown successfully');
    } catch (error) {
      logger.error({ err: error, phase: 'shutdown' }, 'Error during cleanup');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// Global reference to embedded MCP server
let embeddedMCPServer: any = null;

/**
 * Initialize MCP services: embedded MCP server, tool registry, resource manager.
 *
 * Exported so non-HTTP entrypoints (paichart-mcp via mcp-server-http-clean.js)
 * can populate `mcpToolRegistry` in their own process. Without this bootstrap,
 * in-process agent executions inside that worker call
 * `mcpServerManager.getToolDefinitions(...)` against an empty registry, the
 * LLM is invoked with no tools, and Sonnet hallucinates tool calls as XML text
 * instead of using the native tool_use mechanism.
 *
 * Reproduced Apr 10 2026 on Meridian Health Systems test POV. See:
 * - agentExecutionEngine.ts around line 602 (hard-fail guard)
 * - cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md
 */
export async function initializeMCPServices() {
  try {
    logger.info({ phase: 'init' }, 'Initializing MCP services');

    // Import MCP services
    const { mcpServerManager } = await import('./services/mcp/serverManager');
    const { mcpToolRegistry } = await import('./services/mcp/toolRegistry');
    const { mcpResourceManager } = await import('./services/mcp/resourceManager');

    // Initialize server manager
    if (!mcpServerManager.isReady()) {
      await mcpServerManager.initialize();
    }
    logger.debug({ phase: 'init' }, 'MCP server manager initialized');

    // Initialize resource manager
    await mcpResourceManager.initialize();
    logger.debug({ phase: 'init' }, 'MCP resource manager initialized');

    // Debug: Check initial state
    const initialStats = mcpToolRegistry.getStatistics();
    logger.debug({ phase: 'init', toolRegistryStats: initialStats }, 'Initial tool registry state');

    try {
      // Start embedded MCP server
      logger.debug({ phase: 'init' }, 'Starting embedded MCP server');
      const { embeddedMCPServer: embeddedServer } = await import('./mcp/embedded-server');
      embeddedMCPServer = embeddedServer;

      await embeddedMCPServer.start();
      logger.info({ phase: 'init' }, 'Embedded MCP server started');

      // CRITICAL FIX: Register embedded server tools directly with the tool registry
      const embeddedTools = await embeddedMCPServer.getTools();
      logger.debug({ phase: 'init', toolCount: embeddedTools.length }, 'Registering embedded MCP server tools');

      for (const tool of embeddedTools) {
        try {
          const toolMetadata = {
            name: tool.name,
            serverName: 'paichart-embedded-mcp',
            description: tool.description,
            category: 'core', // Default category for embedded tools
            tags: ['embedded', 'core', 'paichart'],
            inputSchema: tool.inputSchema,
            performance: {
              averageExecutionTime: 0,
              successRate: 100,
              totalExecutions: 0,
              tokenUsage: {
                averageInputTokens: 0,
                averageOutputTokens: 0,
                totalTokens: 0
              }
            },
            reliability: {
              uptime: 100,
              errorRate: 0,
              healthScore: 100
            },
            lastUpdated: new Date(),
            version: '3.0.0',
            deprecated: false
          };

          await mcpToolRegistry.registerTool(toolMetadata);
          logger.debug({ phase: 'init', toolName: tool.name }, 'Registered embedded tool');
        } catch (toolError) {
          logger.error({ err: toolError, phase: 'init', toolName: tool.name }, 'Failed to register embedded tool');
        }
      }

      logger.debug({ phase: 'init', toolCount: embeddedTools.length }, 'Embedded MCP server tools registration complete');

      // CRITICAL: Add embedded server to server manager for UI visibility
      try {
        // Import the server manager
        const { MCPServerStatus } = await import('./services/mcp/serverManager');

        // Create server info for the embedded server
        const embeddedServerInfo = {
          name: 'paichart-embedded-mcp',
          config: {
            name: 'paichart-embedded-mcp',
            description: '🏠 Built-in MCP server providing core pAIchart tools and capabilities',
            version: '3.0.0',
            transport: {
              type: 'embedded' as const,
              url: 'internal://embedded'
            },
            capabilities: {
              tools: true,
              resources: true,
              prompts: true
            },
            authentication: {
              type: 'none' as const
            }
          },
          status: MCPServerStatus.CONNECTED,
          connectedAt: new Date(),
          lastActivity: new Date(),
          errorCount: 0,
          toolCount: embeddedTools.length,
          version: '3.0.0',
          capabilities: ['tools', 'resources', 'prompts'],
          metadata: {
            type: 'embedded',
            implementation: 'native'
          }
        };

        // Directly add to server manager's servers map
        mcpServerManager['servers'].set('paichart-embedded-mcp', embeddedServerInfo);
        logger.debug({ phase: 'init' }, 'Embedded server added to server manager');

        // Trigger resource discovery for the embedded server
        try {
          await mcpResourceManager.discoverServerResources('paichart-embedded-mcp');
          logger.debug({ phase: 'init' }, 'Resource discovery completed for embedded server');
        } catch (resourceError) {
          logger.error({ err: resourceError, phase: 'init' }, 'Failed to discover resources from embedded server');
        }

      } catch (managerError) {
        logger.error({ err: managerError, phase: 'init' }, 'Failed to add embedded server to manager');
      }

    } catch (embeddedError) {
      logger.error({ err: embeddedError, phase: 'init' }, 'Failed to start or register embedded MCP server');
      // Application can continue without the embedded server, but with reduced functionality
    }

    // Check final state
    const finalStats = mcpToolRegistry.getStatistics();
    logger.info({ phase: 'init', toolRegistryStats: finalStats }, 'MCP services initialization completed');

  } catch (error) {
    logger.error({ err: error, phase: 'init' }, 'Failed to initialize MCP services');
    // Don't throw - let the app continue without MCP services
  }
}

export async function shutdownMCPServices() {
  try {
    logger.info({ phase: 'shutdown' }, 'Shutting down MCP services');

    // Stop embedded MCP server first
    if (embeddedMCPServer) {
      logger.debug({ phase: 'shutdown' }, 'Stopping embedded MCP server');
      await embeddedMCPServer.stop();
      embeddedMCPServer = null;
    }

    const { mcpServerManager } = await import('./services/mcp/serverManager');
    const { mcpToolRegistry } = await import('./services/mcp/toolRegistry');

    if (mcpServerManager.isReady()) {
      await mcpServerManager.shutdown();
    }
    mcpToolRegistry.destroy();

    logger.info({ phase: 'shutdown' }, 'MCP services shutdown completed');
  } catch (error) {
    logger.error({ err: error, phase: 'shutdown' }, 'Error shutting down MCP services');
  }
}
