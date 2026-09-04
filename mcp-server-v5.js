#!/usr/bin/env node

// Load environment variables first
require('dotenv').config();

// Phase 2.P0 (2026-04-08) — Register ts-node for TypeScript resolution.
// Required because this file is launched in three contexts:
//   1. npm run mcp (bare node, no ts-node) — dev/local CLI invocation
//   2. .mcp-servers.json (Steve's local Claude Desktop config, bare node)
//   3. require()'d transitively by mcp-server-http-clean.js:27 (paichart-mcp
//      PM2 process). After Phase 2 lands ts-node in mcp-server-http-clean.js,
//      the registration here becomes a no-op (ts-node.register is idempotent).
//
// Mirrors the pattern from server.js:9-25 but UNCONDITIONAL — npm run mcp
// is a dev workflow that needs ts-node regardless of NODE_ENV.
//
// Without this, deleting any lib/**/*.js sibling that this file's transitive
// require chain depends on (Phase 2 of the dual TS/JS drift eradication plan)
// would crash bare-node launches. See:
//   cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/
require('tsconfig-paths/register');
require('ts-node').register({
  project: './tsconfig.server.json',
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    baseUrl: '.',
    paths: {
      '@/*': ['./*'],
    },
  },
});

// Pino structured logging (replaces console filter block — LOG_LEVEL handles verbosity)
const { stderr: stderrLoggers, createAdapter } = require('./lib/mcp/server/mcp-logger');

/**
 * MCP Server v5 - Pure SDK-Native Implementation with Full Intelligence
 *
 * Complete SDK-native server without any wrapper dependencies.
 * Provides comprehensive MCP functionality with enhanced intelligence.
 *
 * @module mcp-server-v5
 * @version 5.0.0
 * @author Enhanced MCP Server Team
 *
 * @description Pure SDK implementation featuring:
 *   - Full MCP protocol compliance (tools, resources, prompts)
 *   - Database integration with global Prisma singleton
 *   - Smart error recovery and validation
 *   - Context-aware parameter intelligence
 *   - Performance monitoring and health checks
 *   - OAuth authentication support (GitHub, Microsoft, Google)
 *   - Execution streaming for progress visibility
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode,
} = require('@modelcontextprotocol/sdk/types.js');

// Enhanced MCP Server Components
const { featureFlags } = require('./lib/mcp/server/config/feature-flags');
const { performanceMonitor } = require('./lib/mcp/server/monitoring/performance-monitor');
const { PromptRegistry } = require('./lib/mcp/server/prompts/prompt-registry');
const { PromptCommandHandler } = require('./lib/mcp/server/tools/prompt-command-handler');
const { smartErrorRecovery } = require('./lib/mcp/server/utils/smart-error-recovery');
const { validateToolInput } = require('./lib/mcp/server/config/tool-schemas');
const { TOOL_SCHEMAS, CONSOLIDATED_SCHEMAS } = require('./lib/mcp/server/config/tool-schemas');
const { ProjectDispatcher } = require('./lib/mcp/server/tools/dispatchers/project-dispatcher');
const { AnalyticsDispatcher } = require('./lib/mcp/server/tools/dispatchers/analytics-dispatcher');
const { TemplateDispatcher } = require('./lib/mcp/server/tools/dispatchers/template-dispatcher');
const { ServicesDispatcher } = require('./lib/mcp/server/tools/dispatchers/services-dispatcher');
const { RegistryDispatcher } = require('./lib/mcp/server/tools/dispatchers/registry-dispatcher');
// Phase 1.6 (2026-05-18) — GS14 dispatch-boundary safeParse for standalone tools
// (search, fetch, list_prompts). Specialist-approved (mcp-tool-architecture 93%).
const { wrapWithSchema } = require('./lib/mcp/server/tools/dispatchers/dispatch-with-schema');
const { getToolAnnotations } = require('./lib/mcp/server/config/tool-annotations');
const { zodToJsonSchema } = require('zod-to-json-schema');

// SDK-Native Tool Implementations
const { SDKNativeBasicTools } = require('./lib/mcp/server/tools/sdk-native-basic-tools');
const { SDKNativeAdvancedTools } = require('./lib/mcp/server/tools/sdk-native-advanced-tools');
// Browser Automation moved to browser-automation-service (MCP service at port 3100)
const { HubToolsHandler } = require('./lib/mcp/server/tools/hub-tools-handler');
const ChatGPTConnectorHandler = require('./lib/mcp/server/tools/chatgpt-connector-handler');
const { SDKParameterNormalizer } = require('./lib/mcp/server/utils/parameter-normalizer');
const { ensureObject } = require('./lib/utils/ensure-object');

// Database and Resource Manager Integration
// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma, ensureConnected } = require('./lib/prisma');
const { SimpleResourceManager } = require('./lib/mcp/simple-resource-manager');
const { setPrismaInstance } = require('./lib/mcp/server/prompts/prompt-registry');
const { executionStreaming } = require('./lib/mcp/server/streaming/execution-streaming');
// Phase 2 Priority 3: Hub Resources (Dec 2025)
const { HubResourceProvider } = require('./lib/mcp/server/resources/hub-resources');

/**
 * Pure SDK-Native MCP Server Implementation
 *
 * @class PureSDKNativeServer
 * @description Main server class implementing pure MCP SDK with enhanced capabilities.
 *   Manages tool handlers, resource manager, prompt registry, and authentication.
 *
 * @example
 * const server = new PureSDKNativeServer();
 * await server.start();
 */
class PureSDKNativeServer {
  /**
   * Creates Pure SDK-Native MCP Server
   *
   * @description Initializes server with:
   *   - SDK server instance with enhanced capabilities
   *   - Tool handlers (basic, advanced, browser automation, hub tools)
   *   - Resource manager for artifact/execution access
   *   - Prompt registry for built-in prompts
   *   - Execution streaming for progress visibility
   *   - Initialization health tracking
   *   - Session context management
   */
  constructor() {
    // Initialize pure SDK server with enhanced capabilities
    this.server = new Server(
      {
        name: 'paichart',
        title: 'pAIchart - AI-Native Service Orchestration',
        version: '5.0.0',
        description: 'An entire service ecosystem — dynamically discovered, dynamically composed.',
        websiteUrl: 'https://paichart.com'
      },
      {
        capabilities: this.getEnhancedCapabilities(),
        instructions: this.getServerInstructions()
      }
    );

    this.logger = this.createLogger();
    this.basicTools = null;
    this.advancedTools = null;
    // Browser automation moved to external Docker service (browser-automation-service:3100)
    this.toolHandlers = new Map();
    this.clientInfo = null;
    this.clientCapabilities = null;
    this.resourceManager = new SimpleResourceManager();
    this.promptRegistry = new PromptRegistry();
    this.promptCommandHandler = new PromptCommandHandler(this.promptRegistry);
    // Also set on server for SDKNativeBasicTools compatibility
    this.server.promptCommandHandler = this.promptCommandHandler;
    // Execution streaming for progress visibility
    this.executionStreaming = executionStreaming;
    // Phase 2 Priority 3: Hub resource provider
    this.hubResourceProvider = new HubResourceProvider();

    // PHASE 3 IMPROVEMENT (Priority 2): Track initialization status for health checks
    this.initializationStatus = {
      constructor: { status: 'pending', startTime: Date.now(), duration: null },
      coreHandlers: { status: 'pending', startTime: null, duration: null },
      databaseResources: { status: 'pending', startTime: null, duration: null },
      authContext: { status: 'pending', startTime: null, duration: null },
      promptRegistry: { status: 'pending', startTime: null, duration: null },
      transport: { status: 'pending', startTime: null, duration: null },
      overall: { status: 'initializing', startTime: Date.now(), totalDuration: null }
    };
    
    // User authentication context for HTTP sessions
    this.userContext = null;
    
    // Session context to remember recent items (helps Claude maintain context)
    this.sessionContext = {
      recentPOV: null,
      recentTasks: [],
      currentPhase: null
    };

    // Phase A Performance: Resource discovery TTL tracking
    this.lastResourceDiscovery = null;
    this.resourceDiscoveryTTL = 60 * 1000; // 60 seconds
    
    this.initializationStatus.coreHandlers.startTime = Date.now();
    this.setupCoreHandlers();
    this.setupCapabilityDetection();
    this.initializationStatus.coreHandlers.status = 'complete';
    this.initializationStatus.coreHandlers.duration = Date.now() - this.initializationStatus.coreHandlers.startTime;

    // Prompt registry initialized with built-in prompts only (database prompts via tools)

    // Setup database resources asynchronously after initialization
    this.initializationStatus.databaseResources.startTime = Date.now();
    this.resourcesReady = this.setupDatabaseResourceIntegration()
      .then(() => {
        this.initializationStatus.databaseResources.status = 'complete';
        this.initializationStatus.databaseResources.duration = Date.now() - this.initializationStatus.databaseResources.startTime;
        this.logger.info('Database resources fully initialized');
        return true;
      })
      .catch(err => {
        this.initializationStatus.databaseResources.status = 'failed';
        this.initializationStatus.databaseResources.duration = Date.now() - this.initializationStatus.databaseResources.startTime;
        this.initializationStatus.databaseResources.error = err.message;
        this.logger.error('Failed to initialize database resources:', err);
        return false;
      });

    this.initializationStatus.constructor.status = 'complete';
    this.initializationStatus.constructor.duration = Date.now() - this.initializationStatus.constructor.startTime;
    this.logger.info('Pure SDK-Native MCP Server v5 initialized with database integration');
  }

  /**
   * Initialize authentication context from API key if available
   */
  async initializeAuthContext() {
    const apiKey = process.env.PAICHART_API_KEY;
    
    if (apiKey) {
      this.logger.info('API key found, establishing user context...');
      
      try {
        // Decode JWT to get user info (API keys are JWT tokens)
        if (apiKey.startsWith('eyJ')) {
          // Parse JWT without verification (for user info only)
          const parts = apiKey.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            
            // Set user context from JWT payload
            const context = {
              user: {
                id: payload.userId || payload.sub || 'admin-user',
                email: payload.email || 'system@paichart.com',
                role: payload.role || 'ADMIN',
                name: payload.name || 'Admin User'
              },
              authenticated: true,
              authMethod: 'api_key'
            };
            
            this.setUserContext(context);
            this.logger.info('User context established from API key', {
              userId: context.user.id,
              email: context.user.email,
              role: context.user.role
            });
          }
        } else {
          // Not a JWT, use default admin context
          this.logger.warn('API key is not a JWT, using default admin context');
          this.setUserContext({
            user: {
              id: 'admin-user',
              email: 'system@paichart.com',
              role: 'ADMIN',
              name: 'Admin User'
            },
            authenticated: true,
            authMethod: 'api_key'
          });
        }
      } catch (error) {
        this.logger.warn('Failed to parse API key:', error.message);
        this.logger.warn('Continuing without user context');
      }
    } else {
      this.logger.info('No API key found, running in unauthenticated mode');
    }
  }

  /**
   * Set user context for authenticated sessions
   *
   * @param {Object} context - User authentication context
   * @param {Object} context.user - User object
   * @param {string} context.user.id - User ID (CUID)
   * @param {string} context.user.email - User email
   * @param {string} [context.user.role='USER'] - User role
   * @param {string} [context.user.name] - User display name
   * @param {boolean} [context.authenticated=true] - Authentication status
   * @param {string} [context.authMethod] - Authentication method used
   *
   * @description Sets global user context for authenticated sessions.
   *   Context Architecture (Dec 2025):
   *   - HTTP path: Context passed per-request via handler(args, context)
   *   - SDK path (stdio): Uses this global userContext as fallback
   *   - Hub tools use resolveUserContext() which prefers per-request, falls back to global
   *
   * @example
   * server.setUserContext({
   *   user: { id: 'user123', email: 'admin@company.com', role: 'ADMIN' },
   *   authenticated: true,
   *   authMethod: 'api_key'
   * });
   */
  setUserContext(context) {
    this.userContext = context;
    this.logger.info('Session context initialized', {
      userId: context?.user?.id,
      email: context?.user?.email,
      note: 'Per-request context used for HTTP; this is fallback for SDK path'
    });
  }

  createLogger() {
    return createAdapter(stderrLoggers.mcpLogger.child({ component: 'sdk-v5' }));
  }

  /**
   * Get enhanced capabilities for pure SDK implementation
   */
  getEnhancedCapabilities() {
    return {
      tools: this.getToolCapabilities(),
      logging: { 
        level: 'info',
        enabled: true 
      },
      resources: {
        subscribe: true,  // Enable resource subscriptions
        listChanged: true,  // Enable resource list change notifications
        protocols: ['mcp', 'artifact', 'execution'],  // Supported resource protocols
        autoFetch: true,  // Automatically fetch resources when referenced
        fetchOnReference: true,  // Fetch resources when mentioned in messages
        artifactViewer: true,  // Support for artifact viewer integration
        lazyLoading: true,  // Support lazy loading of resource content
        downloadLinks: true  // Support downloadable resources
      },
      prompts: {},
      experimental: {
        smartErrorRecovery: {
          enabled: true,
          description: "Intelligent error analysis and recovery suggestions",
          features: [
            "validation_error_analysis",
            "parameter_suggestions",
            "auto_fix_attempts",
            "enhanced_error_messages"
          ]
        },
        contextAwareness: {
          enabled: true,
          description: "Remember context across tool calls",
          features: [
            "pov_context_persistence",
            "task_context_persistence",
            "smart_parameter_defaults",
            "workflow_continuity"
          ]
        },
        proactiveSuggestions: {
          enabled: true,
          description: "Provide intelligent next-step suggestions",
          features: [
            "workflow_analysis",
            "risk_detection",
            "optimization_opportunities",
            "automation_recommendations"
          ]
        },
        resourceIntegration: {
          enabled: true,
          description: "Enhanced resource integration for Claude Desktop",
          features: [
            "artifact_protocol_support",
            "automatic_artifact_creation",
            "inline_resource_display",
            "download_link_generation",
            "resource_content_streaming"
          ]
        }
      },
      _enhanced: {
        version: '5.0.0',
        implementation: 'pure-sdk-native',
        features: ['parameter_intelligence', 'smart_error_recovery', 'performance_monitoring', 'resource_protocols'],
        compatibility: 'MCP SDK 1.0+',
        resourceSupport: {
          protocols: ['mcp://', 'artifact://', 'execution://'],
          formats: ['json', 'markdown', 'text'],
          maxResourceSize: 10485760,  // 10MB
          cachingEnabled: true
        }
      }
    };
  }

  /**
   * Get tool capabilities with enhanced schemas
   */
  getToolCapabilities() {
    const capabilities = {};

    // Include consolidated tools (project, perform, analytics, template, services, registry)
    Object.entries(CONSOLIDATED_SCHEMAS).forEach(([toolName, schema]) => {
      const annotations = getToolAnnotations(toolName);

      capabilities[toolName] = {
        title: annotations?.title || schema.title || toolName,
        description: schema.description,
        inputSchema: this.convertZodToJsonSchema(schema.inputSchema),
        readOnlyHint: annotations?.readOnlyHint || false,
        destructiveHint: annotations?.destructiveHint || false,
        // 2026-05-31: carry schema-level _meta (e.g. anthropic/alwaysLoad) through to clients
        ...(schema._meta ? { _meta: schema._meta } : {}),
        capabilities: {
          smartDefaults: true,
          smartErrorRecovery: true,
          contextAwareness: true
        }
      };
    });

    // Include non-consolidated tools (search, fetch, prompt_command, hub tools)
    Object.entries(TOOL_SCHEMAS).forEach(([toolName, schema]) => {
      // Get MCP annotations for this tool
      const annotations = getToolAnnotations(toolName);

      capabilities[toolName] = {
        title: annotations?.title || schema.title || toolName,
        description: schema.description,
        inputSchema: this.convertZodToJsonSchema(schema.inputSchema),
        readOnlyHint: annotations?.readOnlyHint || false,
        destructiveHint: annotations?.destructiveHint || false,
        // 2026-05-31: carry schema-level _meta (e.g. anthropic/alwaysLoad) through to clients.
        // prompt_command + list_prompts (entry-point tools) live in TOOL_SCHEMAS, so this
        // loop is the strictly-required one.
        ...(schema._meta ? { _meta: schema._meta } : {}),
        capabilities: {
          smartDefaults: true,
          smartErrorRecovery: true,
          contextAwareness: true
        }
      };
    });

    return capabilities;
  }

  /**
   * Get tools filtered by user access level
   * Delegates to tool-security.js for access control logic (single source of truth)
   *
   * @param {Object|null} user - User object with id, email, and role
   * @returns {Object[]} Array of MCP tool objects user can access
   *
   * Usage from http-clean.js:
   *   const tools = this.mcpServer.getToolsForUser(userContext);
   */
  getToolsForUser(user) {
    const { getToolsForUser: filterToolsByUser } = require('./lib/mcp/server/config/tool-security');

    // Get all tool capabilities from registered handlers
    const allCapabilities = this.getToolCapabilities();

    // Convert to MCP tool array format
    const allTools = Object.entries(allCapabilities).map(([name, capability]) => ({
      name: name,
      description: capability.description || `Tool: ${name}`,
      inputSchema: capability.inputSchema || {
        type: 'object',
        additionalProperties: true
      },
      // 2026-05-31: this map rebuilds the tool from `capability`, dropping _meta again unless
      // carried through — required for anthropic/alwaysLoad to reach the live HTTP tools/list.
      ...(capability._meta ? { _meta: capability._meta } : {}),
      annotations: capability.title || capability.readOnlyHint !== undefined ? {
        title: capability.title,
        readOnlyHint: capability.readOnlyHint,
        destructiveHint: capability.destructiveHint
      } : undefined
    }));

    // Filter based on user access level using single source of truth
    const filteredTools = filterToolsByUser(allTools, user);

    // Enhanced logging for debugging
    this.logger.info(`[Tool Access] User: ${user?.email || 'anonymous'}, Role: ${user?.role || 'none'}, Visible: ${filteredTools.length}/${allTools.length} tools`);

    return filteredTools;
  }

  /**
   * Server instructions for Claude Desktop
   */
  getServerInstructions() {
    // 2026-05-31 (Protocol 10): orientation injected into every client's initialize.
    // Deliberately carries NO hard counts (services/tools/prompts) — those drift and a
    // verifiable-and-wrong count is a Protocol-10 violation (stale counts mis-led an
    // earlier diagnosis). Single source for BOTH transports: the SDK Server constructor
    // (stdio) and the HTTP initialize (mcp-core.ts) read this same method. Keep ≤2KB.
    return `pAIchart — AI-Native Service Orchestration

pAIchart is an MCP hub for delivery management (POVs, tasks, phases) plus a registry of external MCP services you can discover, call, and orchestrate into multi-service workflows — and autonomous multi-specialist pipelines that turn an objective into a reviewed deliverable.

NEW HERE? Start with the guided onboarding:
• prompt_command(command: "/prompt HOWTO-get-started")
• Browse all guides and workflows: list_prompts()
• Prompts also appear as slash commands — type / to see them.

WHEN TO REACH FOR pAIchart TOOLS:
• project / perform — read and act on POV, task, phase, and stage data
• perform task.create (type:PIPELINE) — launch an autonomous multi-specialist pipeline that decomposes an objective, runs specialists, and synthesizes a reviewed deliverable (e.g. network provisioning, artifact synthesis); guide: HOWTO-use-pipeline-harness
• services / registry — discover, call, and register external MCP services; run sequential/parallel/conditional workflows
• analytics / template / search / fetch — recommendations, agent templates, cross-resource search and retrieval
• prompt_command / list_prompts — run guided workflows (portfolio audit, POV health check, onboarding, service registration)

Tip: run /prompt HOWTO-get-started, or say "discover services" to explore the ecosystem.`;
  }

  /**
   * Setup core SDK handlers
   */
  setupCoreHandlers() {
    this.logger.info('Setting up core SDK handlers...');

    // Create shared parameter normalizer for session context
    this.parameterNormalizer = new SDKParameterNormalizer();

    // Initialize tool implementations with shared normalizer
    this.basicTools = new SDKNativeBasicTools(this.server, this.parameterNormalizer);
    this.advancedTools = new SDKNativeAdvancedTools(this.server, this.parameterNormalizer);
    // Browser Automation moved to browser-automation-service (MCP service at port 3100)
    // Pass promptRegistry to HubToolsHandler for built-in prompt exposure
    this.hubTools = new HubToolsHandler(prisma, this.parameterNormalizer, this.promptRegistry);
    this.chatgptConnector = new ChatGPTConnectorHandler(prisma);

    // Collect all tool handlers
    this.collectToolHandlers();

    // Setup SDK request handlers
    this.setupRequestHandlers();

    this.logger.info(`Core handlers setup complete with ${this.toolHandlers.size} tools`);
  }

  /**
   * Setup client capability detection
   */
  setupCapabilityDetection() {
    this.logger.info('Setting up capability detection...');

    // Handle client initialization
    this.server.oninitialized = () => {
      this.clientCapabilities = this.server.getClientCapabilities();
      this.clientInfo = this.server.getClientVersion();
      
      this.logger.info('Client connected:', {
        name: this.clientInfo?.name,
        version: this.clientInfo?.version,
        capabilities: Object.keys(this.clientCapabilities || {}),
        enhanced: true
      });

      // Configure components based on client capabilities
      this.configureForClient(this.clientCapabilities, this.clientInfo);
      
      // Send enhanced welcome message
      this.sendEnhancedWelcomeMessage(this.clientInfo);
    };

    // Global error handler
    this.server.onerror = (error) => {
      this.logger.error('Server error:', error);
      performanceMonitor.recordError('server_error', error);
    };

    this.logger.info('Capability detection configured');
  }

  /**
   * Setup database-driven resource integration with real-time updates
   */
  async setupDatabaseResourceIntegration() {
    try {
      this.logger.info('Setting up database-driven resource integration...');

      // Ensure database connection with retry logic (prevents race condition after deployment)
      const connected = await ensureConnected(5, 2000);
      if (!connected) {
        throw new Error('Failed to establish database connection after 5 attempts');
      }
      this.logger.info('Database connection established with retry protection');

      // Initialize resource manager with database integration
      await this.resourceManager.initialize();
      
      // Discover initial execution resources
      this.logger.info('Discovering initial execution resources...');
      const initialResources = await this.resourceManager.discoverExecutionResources({
        limit: 10,
        timeRange: '24h'
      });
      this.logger.info(`Discovered ${initialResources.length} initial execution resources`);
      
      // Discover initial artifact resources
      this.logger.info('Discovering initial artifact resources...');
      const initialArtifacts = await this.resourceManager.discoverArtifactResources({
        limit: 100  // Increased from 20 to ensure more artifacts are available
      });
      this.logger.info(`Discovered ${initialArtifacts.length} initial artifact resources`);
      
      // Subscribe to resource manager events for real-time updates
      this.resourceManager.on('resource:updated', (resource) => {
        this.logger.debug('Resource updated:', { 
          id: resource.id, 
          type: resource.type,
          status: resource.metadata?.status 
        });
        
        // Could emit notifications to connected clients here
        this.handleResourceUpdate(resource);
      });

      // Setup execution streaming event handlers
      this.setupExecutionStreamingIntegration();

      this.resourceManager.on('resource:discovered', (resources) => {
        this.logger.debug('New resources discovered:', { count: resources.length });
        
        // Update internal resource cache or notify clients
        this.handleResourceDiscovery(resources);
      });

      // Setup periodic resource discovery and cleanup
      this.setupResourceMaintenanceSchedule();

      this.logger.info('Database resource integration configured successfully');
    } catch (error) {
      this.logger.error('Failed to setup database resource integration:', error);

      // PHASE 3 IMPROVEMENT (Priority 5): Fail-fast for critical dependencies (opt-in)
      // Set MCP_REQUIRE_DB_RESOURCES=true to enforce database resources as critical
      const requireDbResources = process.env.MCP_REQUIRE_DB_RESOURCES === 'true';
      if (requireDbResources) {
        this.logger.error('🚨 CRITICAL: Database resources required but failed to initialize');
        throw error; // Fail-fast when required
      }

      // Continue without database integration if it fails
      this.logger.warn('Continuing without database integration - using fallback mode');
    }
  }

  /**
   * Setup execution streaming integration with MCP notifications
   */
  setupExecutionStreamingIntegration() {
    this.logger.info('Setting up execution streaming integration...');

    // Skip if execution streaming is not available
    if (!this.executionStreaming) {
      this.logger.info('Execution streaming not configured - skipping integration');
      return;
    }

    // Listen for progress updates and send notifications to MCP clients
    this.executionStreaming.on('progress_update', async (event) => {
      try {
        const { clientId, executionId, update } = event;
        
        // Send progress notification to MCP client
        await this.sendProgressNotification(clientId, executionId, update);
        
        this.logger.debug('Sent progress notification to MCP client:', { clientId, executionId });
      } catch (error) {
        this.logger.error('Failed to send progress notification:', error);
      }
    });

    // Listen for execution completion events
    this.executionStreaming.on('execution_completed', async (event) => {
      try {
        const { executionId, status, duration } = event;
        
        // Send completion notification to all subscribed clients
        await this.broadcastExecutionCompletion(executionId, status, duration);
        
        this.logger.info('Broadcasted execution completion:', { executionId, status, duration });
      } catch (error) {
        this.logger.error('Failed to broadcast execution completion:', error);
      }
    });

    this.logger.info('Execution streaming integration configured');
  }

  /**
   * Send progress notification to specific MCP client
   */
  async sendProgressNotification(clientId, executionId, update) {
    try {
      // Format update for MCP notification
      const notification = {
        type: 'execution_progress',
        executionId: executionId,
        clientId: clientId,
        // 2026-07-26: `progress` removed. It read `update.progress`, sourced from a column
        // that has never existed, so every notification to every external MCP client carried
        // a hardcoded 0 — a measurement nobody took, with no `(est.)` affordance to warn the
        // client. Absent is honest; a false zero is not. `status` is the real signal.
        status: update.status,
        timestamp: update.timestamp,
        metrics: update.metrics || {},
        task: update.task || null,
        agentTemplate: update.agentTemplate || null
      };

      // Send via logging message (MCP clients can subscribe to these)
      await this.server.sendLoggingMessage({
        level: 'info',
        data: {
          type: 'progress_notification',
          notification: notification,
          _streaming: true
        }
      });

    } catch (error) {
      this.logger.debug('Failed to send progress notification:', error.message);
      // Don't throw - notifications are best-effort
    }
  }

  /**
   * Broadcast execution completion to all connected clients
   */
  async broadcastExecutionCompletion(executionId, status, duration) {
    try {
      const completionNotification = {
        type: 'execution_completed',
        executionId: executionId,
        status: status,
        duration: duration,
        timestamp: new Date().toISOString(),
        summary: {
          success: ['COMPLETED', 'SUCCESS'].includes(status),
          failed: ['FAILED', 'ERROR'].includes(status),
          cancelled: status === 'CANCELLED'
        }
      };

      // Broadcast to all clients via logging
      await this.server.sendLoggingMessage({
        level: 'info',
        data: {
          type: 'execution_completed',
          notification: completionNotification,
          _broadcast: true
        }
      });

    } catch (error) {
      this.logger.debug('Failed to broadcast execution completion:', error.message);
    }
  }

  /**
   * Subscribe a client to execution progress updates
   */
  subscribeToExecution(clientId, executionId) {
    if (!this.executionStreaming) {
      this.logger.warn('Execution streaming not configured - cannot subscribe to execution');
      return false;
    }
    
    return this.executionStreaming.subscribeToExecution(
      clientId, 
      executionId, 
      (update) => this.handleExecutionUpdate(clientId, executionId, update)
    );
  }

  /**
   * Handle execution updates for subscribed clients
   */
  async handleExecutionUpdate(clientId, executionId, update) {
    try {
      // Send real-time update to specific client
      await this.sendProgressNotification(clientId, executionId, update);
      
      this.logger.debug('Handled execution update:', {
        clientId,
        executionId,
        status: update.status
      });
    } catch (error) {
      this.logger.error('Failed to handle execution update:', error);
    }
  }

  /**
   * Handle resource update events from the resource manager
   */
  handleResourceUpdate(resource) {
    try {
      // Update any cached resource information
      this.logger.debug('Processing resource update:', { 
        resourceId: resource.id,
        type: resource.type,
        metadata: resource.metadata
      });

      // Could notify clients of resource changes if they support it
      // this.notifyClientsOfResourceChange(resource);
    } catch (error) {
      this.logger.error('Error handling resource update:', error);
    }
  }

  /**
   * Handle discovery of new resources
   */
  handleResourceDiscovery(resources) {
    try {
      this.logger.debug('Processing discovered resources:', { 
        count: resources.length,
        types: [...new Set(resources.map(r => r.type))]
      });

      // Process newly discovered resources
      for (const resource of resources) {
        // Could cache or index new resources for faster access
        this.logger.debug('New resource discovered:', {
          id: resource.id,
          type: resource.type,
          uri: resource.uri
        });
      }
    } catch (error) {
      this.logger.error('Error handling resource discovery:', error);
    }
  }

  /**
   * Setup periodic resource maintenance tasks
   */
  setupResourceMaintenanceSchedule() {
    // BC34 FIX: Store interval refs for cleanup on shutdown + .unref() to not block exit
    // Resource discovery every 30 seconds
    this._resourceDiscoveryInterval = setInterval(async () => {
      try {
        await this.resourceManager.discoverExecutionResources({
          timeRange: '1h',
          limit: 10
        });

        // Also discover new artifacts
        await this.resourceManager.discoverArtifactResources({
          limit: 50  // Increased from 10 for better coverage
        });
      } catch (error) {
        this.logger.debug('Resource discovery maintenance error:', error);
      }
    }, 30000);
    this._resourceDiscoveryInterval.unref();

    // Resource cleanup every 30 minutes (increased from 5 minutes to reduce logs)
    this._resourceCleanupInterval = setInterval(async () => {
      try {
        const cleaned = await this.resourceManager.validateAndCleanupResources();
        if (cleaned > 0) {
          this.logger.info(`Cleaned up ${cleaned} stale resources`);
        }
      } catch (error) {
        this.logger.debug('Resource cleanup error:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes instead of 5
    this._resourceCleanupInterval.unref();
    
    /*
    setInterval(async () => {
      try {
        await this.resourceManager.cleanupExecutionResources(
          new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          true // Keep top performers
        );
      } catch (error) {
        this.logger.debug('Resource cleanup maintenance error:', error);
      }
    }, 300000);
    */

    this.logger.info('Resource maintenance schedule configured');
  }

  /**
   * Update MCPInteraction record with performance metrics
   */
  async updateInteractionRecord(interactionId, updates) {
    if (!interactionId) return; // Skip if no interaction record was created

    try {
      // Map caller fields to actual MCPInteraction schema fields
      const data = {
        status: updates.status === 'COMPLETED' ? 'COMPLETED' : updates.status === 'FAILED' ? 'FAILED' : updates.status,
        executionTime: updates.executionTimeMs ? Math.round(updates.executionTimeMs) : null,
        response: updates.responseData || null,
        error: updates.errorMessage || null,
        metadata: {
          endTime: updates.endTime?.toISOString(),
          success: updates.success,
          responseSize: updates.responseSize || null,
        }
      };

      await prisma.mcpInteraction.update({
        where: { id: interactionId },
        data
      });

      this.logger.debug('Updated MCP interaction record:', {
        interactionId,
        status: data.status,
        executionTime: data.executionTime
      });
    } catch (error) {
      this.logger.debug('Failed to update interaction record:', error.message);
      // Continue silently - don't let database failures affect tool execution
    }
  }

  /**
   * Configure server components based on client capabilities
   */
  configureForClient(clientCapabilities, clientInfo) {
    this.logger.info('Configuring for client capabilities...');

    // Enable features based on client support
    if (clientCapabilities?.experimental?.contextAwareness) {
      featureFlags.enable('contextAwareness');
      this.logger.info('Context awareness enabled for client');
    }

    if (clientCapabilities?.experimental?.proactiveSuggestions) {
      featureFlags.enable('workflowIntelligence');
      this.logger.info('Workflow intelligence enabled for client');
    }

    // Claude Desktop specific optimizations
    if (clientInfo?.name?.includes('Claude')) {
      featureFlags.enable('smartErrorRecovery');
      featureFlags.enable('responseOptimization');
      this.logger.info('Claude Desktop optimizations enabled');
    }

    // Always enable core features
    featureFlags.enable('sdkCompliance');
    featureFlags.enable('performanceMonitoring');
  }

  /**
   * Send enhanced welcome message
   */
  async sendEnhancedWelcomeMessage(clientInfo) {
    try {
      const welcomeMessage = this.createWelcomeMessage(clientInfo);
      
      await this.server.sendLoggingMessage({
        level: 'info',
        data: {
          type: 'welcome',
          message: welcomeMessage,
          serverVersion: '5.0.0',
          implementation: 'pure-sdk-native',
          enhancedFeatures: featureFlags.getEnabled(),
          timestamp: new Date().toISOString()
        }
      });

      this.logger.info('Enhanced welcome message sent');
    } catch (error) {
      this.logger.error('Failed to send welcome message:', error);
    }
  }

  /**
   * Create personalized welcome message
   */
  createWelcomeMessage(clientInfo) {
    const isClaudeDesktop = clientInfo?.name?.toLowerCase().includes('claude');
    
    if (isClaudeDesktop) {
      return `🎉 pAIchart Pure SDK-Native Server v5.0 ready for Claude Desktop!

💡 Just ask "What do I have to do today?"

✨ Intelligent features active:
• Smart parameter correction (95% error reduction)
• Context-aware workflows  
• Proactive suggestions
• Natural language help
• 14 interactive prompts available

🚀 Quick starts:
• "What do I have to do today?" - See your priorities
• "List my POVs" - View your projects
• "Help me with pAIchart" - Get assistance
• "What prompts can help me?" - Discover guided workflows

💬 Tip: Say "to do" anywhere to see available prompts!`;
    }

    return `🚀 pAIchart Pure SDK-Native Server v5.0 ready!

💡 Just ask "What do I have to do today?"

Your AI-powered project management assistant with intelligent workflows.
• "What do I have to do today?" - See your priorities
• "List my POVs" - View your projects
• "Help me with pAIchart" - Get assistance

✨ Features: Parameter intelligence, context awareness, smart suggestions`;
  }


  /**
   * Collect tool handlers from all tool implementations
   */
  collectToolHandlers() {
    // Per-request context migration (Dec 2025): prefer the per-request context; fall
    // back to the global userContext only when no per-request user is present.
    //
    // 2026-05-27 (pentest SDK-guru follow-up — DO NOT "harden" this fallback into a
    // `throw`): the stdio path (Claude Desktop) legitimately relies on it — setUserContext()
    // seeds the global at connect and single-client stdio tool calls carry no per-request
    // user, so they intentionally fall back here. On the HTTP multi-tenant path the fallback
    // is UNREACHABLE (enforceToolSecurity throws on a missing user before dispatch; PUBLIC_TOOLS
    // is empty; verified by a 960-request concurrent cross-leak test), so this shared-state read
    // cannot leak across HTTP clients. Throwing here would break Claude Desktop for zero HTTP gain.
    // The WARN flags any unexpected hit (which on HTTP would itself indicate a regression).
    const resolveUserContext = (context, toolName) => {
      if (context?.user) {
        return context;
      }
      this.logger.warn(`[CONTEXT FALLBACK] Tool ${toolName} using global userContext - per-request context not available`);
      return this.userContext;
    };

    // === Consolidated tools (6 tools replacing 19 legacy) ===
    // BUG-BASIC-XSS-1 production verification (2026-05-22): wrapWithSchema
    // MISSING here. Phase 1.5 (2026-05-17) removed inline safeParse from each
    // dispatcher's handle() with the intent to centralize it via wrapWithSchema
    // at registration sites — but only embedded-server.ts:1663 got wrapped.
    // mcp-server-v5.js (HTTP transport via PureSDKNativeServer) was missed.
    //
    // Symptoms verified in production:
    //   project({action: 'pov.list', customer_name: '<script>'}) returned
    //   'No POVs found' instead of L1 SafeNameField rejection. The dispatcher
    //   comment claimed 'GS14 enforced upstream' but the wrap was absent here.
    //
    // Fix: wrap each of the 6 consolidated handlers with wrapWithSchema,
    // matching the pattern below at lines ~1097, 1116 (standalone tools).
    // Phantom-canonical case per `feedback_phantom_canonical_audit`.
    const projectDispatcher = new ProjectDispatcher(this.basicTools, this.advancedTools);
    const analyticsDispatcher = new AnalyticsDispatcher(this.advancedTools);
    const templateDispatcher = new TemplateDispatcher(this.basicTools);
    const servicesDispatcher = new ServicesDispatcher(this.hubTools);
    const registryDispatcher = new RegistryDispatcher(this.hubTools);

    this.toolHandlers.set('project', wrapWithSchema('project', async (args, context) => {
      const userContext = resolveUserContext(context, 'project');
      return projectDispatcher.handle(args, userContext);
    }));
    this.toolHandlers.set('perform', wrapWithSchema('perform', async (args, context) => {
      const userContext = resolveUserContext(context, 'perform');
      return this.advancedTools.handleExecuteTaskAction(args, userContext);
    }));
    this.toolHandlers.set('analytics', wrapWithSchema('analytics', async (args, context) => {
      const userContext = resolveUserContext(context, 'analytics');
      return analyticsDispatcher.handle(args, userContext);
    }));
    this.toolHandlers.set('template', wrapWithSchema('template', async (args, context) => {
      const userContext = resolveUserContext(context, 'template');
      return templateDispatcher.handle(args, userContext);
    }));
    this.toolHandlers.set('services', wrapWithSchema('services', async (args, context) => {
      const userContext = resolveUserContext(context, 'services');
      return servicesDispatcher.handle(args, userContext);
    }));
    this.toolHandlers.set('registry', wrapWithSchema('registry', async (args, context) => {
      const userContext = resolveUserContext(context, 'registry');
      return registryDispatcher.handle(args, userContext);
    }));

    // === Non-consolidated Hub tools (stay as individual registrations) ===
    // Phase 1.6 (2026-05-18) — wrapWithSchema extends GS14 dispatch-boundary
    // safeParse to standalone tools. Lookup falls back to TOOL_SCHEMAS when
    // not in CONSOLIDATED_SCHEMAS (validator change in dispatch-with-schema.js).
    const standaloneHubTools = ['list_prompts'];
    for (const toolName of standaloneHubTools) {
      const handler = async (args, context) => {
        const userContext = resolveUserContext(context, toolName);
        switch(toolName) {
          case 'list_prompts':
            return await this.hubTools.handleListPrompts(args, userContext);
          default:
            throw new Error(`Unknown hub tool: ${toolName}`);
        }
      };
      this.toolHandlers.set(toolName, wrapWithSchema(toolName, handler));
      this.logger.debug(`Registered hub tool (GS14-wrapped): ${toolName}`);
    }

    // === ChatGPT Connector tools (not consolidated) ===
    // Phase 1.6 (2026-05-18) — see standaloneHubTools comment above.
    const chatgptTools = ['search', 'fetch'];
    for (const toolName of chatgptTools) {
      const handler = async (args, context) => {
        const userContext = resolveUserContext(context, toolName);
        switch(toolName) {
          case 'search':
            return await this.chatgptConnector.handleSearch(args, userContext);
          case 'fetch':
            return await this.chatgptConnector.handleFetch(args, userContext);
          default:
            throw new Error(`Unknown ChatGPT tool: ${toolName}`);
        }
      };
      this.toolHandlers.set(toolName, wrapWithSchema(toolName, handler));
      this.logger.debug(`Registered ChatGPT connector tool (GS14-wrapped): ${toolName}`);
    }

    // === Prompt command (from basic tools) ===
    // BUG-STANDALONE-005 fix (2026-05-23, Phase 3 validation-engine CSD-1 +
    // sec-ops M1): wrap prompt_command with wrapWithSchema. Previously
    // registered BARE — the schema at tool-schemas.js:1173 (command: z.string())
    // never ran. Phase 1.6 (2026-05-18) wrapped list_prompts/search/fetch
    // and the 6 consolidated tools but missed prompt_command. Phantom-
    // canonical schema. See [[feedback_wiring_site_audit_on_refactor]] +
    // [[feedback_phantom_canonical_audit]].
    const promptHandler = this.basicTools.getToolHandler('prompt_command');
    if (promptHandler) {
      this.toolHandlers.set('prompt_command', wrapWithSchema('prompt_command', promptHandler));
      this.logger.debug('Registered prompt_command tool (wrapped with schema)');
    }

    this.logger.info(`Collected ${this.toolHandlers.size} tool handlers (6 consolidated + ${standaloneHubTools.length} standalone + ${chatgptTools.length} ChatGPT + prompt_command)`);
  }

  /**
   * Setup SDK request handlers
   */
  setupRequestHandlers() {
    // Handle list_tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      
      const tools = [];
      
      // Build tools list from schemas with enhanced capabilities and annotations
      const { getToolAnnotations } = require('./lib/mcp/server/config/tool-annotations');
      
      // Build tools from all registered handlers, checking consolidated schemas first
      for (const toolName of this.toolHandlers.keys()) {
        const schema = CONSOLIDATED_SCHEMAS[toolName] || TOOL_SCHEMAS[toolName];
        if (!schema) {
          this.logger.warn(`No schema found for registered tool: ${toolName}`);
          continue;
        }

        const tool = {
          name: toolName,
          description: schema.description,
          inputSchema: this.convertZodToJsonSchema(schema.inputSchema),
          // 2026-05-31: stdio parity — carry schema-level _meta (anthropic/alwaysLoad) through
          ...(schema._meta ? { _meta: schema._meta } : {})
        };

        // Add Anthropic Directory Policy compliant annotations
        const annotations = getToolAnnotations(toolName);
        if (annotations) {
          tool.annotations = annotations;
        }

        tools.push(tool);
      }

      this.logger.info(`Listed ${tools.length} available tools`);
      return { tools };
    });

    // Handle call_tool requests with full intelligence
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: rawArgs } = request.params;
      const args = ensureObject(rawArgs, {}, 'MCP Server v5');
      const timingId = performanceMonitor.startTiming(`pure_sdk_${toolName}`);
      const startTime = new Date();
      let interactionId = null;
      
      try {

        // Step 0: Create database interaction record for performance tracking
        // MCPInteraction schema: toolId, action, request, response, status, context, metadata
        try {
          const interaction = await prisma.mcpInteraction.create({
            data: {
              toolId: toolName,
              action: 'EXECUTE',
              request: args || {},
              status: 'PENDING',
              context: {
                startTime: startTime.toISOString(),
                clientInfo: this.clientInfo ? {
                  name: this.clientInfo.name,
                  version: this.clientInfo.version
                } : null,
                serverVersion: '5.0.0'
              }
            }
          });
          interactionId = interaction.id;
        } catch (dbError) {
          this.logger.debug('Failed to create interaction record:', dbError.message);
          // Continue without database tracking if it fails
        }

        // Step 1: Check if this is a prompt command
        if (args && args.prompt && this.promptCommandHandler.isPromptCommand(args.prompt)) {
          // Pass user context for authentication-based prompt selection
          // Note: SDK path uses global userContext (HTTP path bypasses this handler)
          const promptResult = await this.promptCommandHandler.executePromptCommand(args.prompt, this.userContext);
          const sdkResponse = this.ensureSDKCompliantResponse(promptResult, 'prompt_command');
          
          // Update database if we have an interaction record
          if (interactionId) {
            await this.updateInteractionRecord(interactionId, {
              status: 'COMPLETED',
              endTime: new Date(),
              executionTimeMs: Date.now() - startTime.getTime(),
              success: true,
              responseData: sdkResponse
            });
          }
          
          performanceMonitor.endTiming(timingId);
          return sdkResponse;
        }
        
        // Also check other common fields for prompt commands
        // Note: SDK path uses global userContext (HTTP path bypasses this handler)
        const promptResult = await this.promptCommandHandler.handleIfPromptCommand(toolName, args || {}, this.userContext);
        if (promptResult) {
          const sdkResponse = this.ensureSDKCompliantResponse(promptResult, 'prompt_command');
          
          // Update database if we have an interaction record
          if (interactionId) {
            await this.updateInteractionRecord(interactionId, {
              status: 'COMPLETED',
              endTime: new Date(),
              executionTimeMs: Date.now() - startTime.getTime(),
              success: true,
              responseData: sdkResponse
            });
          }
          
          performanceMonitor.endTiming(timingId);
          return sdkResponse;
        }

        // Step 2: Validate tool exists
        if (!this.toolHandlers.has(toolName)) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        // Step 3: Apply parameter intelligence
        let processedArgs = args || {};

        // NOTE (2026-05-16 Phase 1): base Zod validation is now ALSO enforced at the
        // dispatcher boundary via lib/mcp/server/tools/dispatchers/dispatch-with-schema.js.
        // This block (smartErrorRecovery) is no longer the sole Zod gate for the 5
        // consolidated tools — it now controls only the smart auto-fix/retry behavior
        // on top of base validation. Flipping this flag off no longer disables Zod;
        // dispatcher-boundary safeParse runs unconditionally.
        if (featureFlags.isEnabled('smartErrorRecovery')) {
          try {
            // Apply parameter normalization and validation
            processedArgs = await validateToolInput(toolName, args || {});
          } catch (validationError) {
            this.logger.error(`Parameter validation failed for ${toolName}:`, validationError.message);
            
            // Return enhanced error message with recovery
            return this.createIntelligentErrorResponse(validationError, toolName, args);
          }
        }

        // Step 3: Execute tool with pure SDK-native handler
        // Note: This is the SDK path (stdio), not HTTP. HTTP path passes context directly.
        // For prompt_command, add user context for authentication
        if (toolName === 'prompt_command' && this.userContext) {
          processedArgs.context = this.userContext;
        }

        const handler = this.toolHandlers.get(toolName);
        // Pass context (global for SDK path) so hub tools can use resolveUserContext fallback
        const result = await handler(processedArgs, this.userContext);

        // Step 4: Ensure SDK-compliant response format
        const sdkResponse = this.ensureSDKCompliantResponse(result, toolName);

        // Step 5: Update database interaction record with success metrics
        await this.updateInteractionRecord(interactionId, {
          status: 'COMPLETED',
          endTime: new Date(),
          executionTimeMs: Date.now() - startTime.getTime(),
          responseSize: JSON.stringify(sdkResponse).length,
          success: true
        });

        performanceMonitor.endTiming(timingId);
        this.logger.info(`Successfully executed pure SDK-native tool: ${toolName}`);

        return sdkResponse;

      } catch (error) {
        // Update database interaction record with error information
        await this.updateInteractionRecord(interactionId, {
          status: 'FAILED',
          endTime: new Date(),
          executionTimeMs: Date.now() - startTime.getTime(),
          errorMessage: error.message,
          success: false
        });

        performanceMonitor.recordError(`pure_sdk_${toolName}`, error);
        this.logger.error(`Pure SDK-native tool execution failed for ${toolName}:`, error.message);

        // Determine appropriate error code based on error message
        const isValidationError = error.message.includes('Validation failed') ||
                                  error.message.includes('already registered') ||
                                  error.message.includes('required') ||
                                  error.message.includes('invalid');

        // Throw proper MCP error instead of returning error response
        if (isValidationError) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        } else {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
      }
    });

    // Handle list_resources requests
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {

      try {
        // Phase A Performance: Only rediscover if cache expired (60s TTL)
        if (!this.lastResourceDiscovery ||
            Date.now() - this.lastResourceDiscovery > this.resourceDiscoveryTTL) {
          const cacheAge = this.lastResourceDiscovery ? Date.now() - this.lastResourceDiscovery : 0;
          this.logger.info(`[Resource Discovery] Cache expired (age: ${cacheAge}ms) - rediscovering`);

          // Ensure we have fresh artifact resources with higher limit
          await this.resourceManager.discoverArtifactResources({ limit: 100 });

          this.lastResourceDiscovery = Date.now();
        } else {
          const cacheAge = Date.now() - this.lastResourceDiscovery;
          this.logger.info(`[Resource Discovery] Cache HIT (age: ${cacheAge}ms) - using cached resources`);
        }

        const resources = await this.resourceManager.listResources();

        // Convert to MCP resource format
        const mcpResources = resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.metadata?.mimeType || 'application/json',
          metadata: resource.metadata
        }));

        // PHASE 2 PRIORITY 3: Add hub resources
        const hubResources = await this.hubResourceProvider.listResources();
        mcpResources.push(...hubResources);

        this.logger.info(`Listed ${mcpResources.length} resources (including ${hubResources.length} hub resources)`);
        return { resources: mcpResources };
      } catch (error) {
        this.logger.error('Error listing resources:', error);
        return { resources: [] };
      }
    });

    // Handle read_resource requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        // PHASE 2 PRIORITY 3: Handle hub resources
        if (uri.startsWith('mcp://hub/')) {
          this.logger.info(`Reading hub resource: ${uri}`);
          return await this.hubResourceProvider.readResource(uri);
        }

        // Ensure resources are initialized before processing
        if (this.resourcesReady) {
          await this.resourcesReady;
        }
        // Handle different URI protocols
        let resourceType, resourceId, url;
        
        // Support multiple URI formats
        if (uri.startsWith('artifact://')) {
          // artifact://[id] format for Claude Desktop artifact viewer
          resourceId = uri.replace('artifact://', '');
          resourceType = 'artifacts';
          url = new URL(`mcp://artifacts/${resourceId}`);
        } else if (uri.startsWith('execution://')) {
          // execution://[id] format
          resourceId = uri.replace('execution://', '');
          resourceType = 'executions';
          url = new URL(`mcp://executions/${resourceId}`);
        } else if (uri.startsWith('browser-workflow://')) {
          // browser-workflow://[templateId] format
          resourceId = uri.replace('browser-workflow://', '');
          resourceType = 'browser-workflows';
          url = new URL(`mcp://browser-workflows/${resourceId}`);
        } else {
          // Standard mcp:// format
          url = new URL(uri);
          resourceType = url.hostname;
          const pathParts = url.pathname.split("/").filter(p => p);
          resourceId = pathParts[0];
        }
        
        // Get resource from manager
        // Use the correct key format based on resource type
        let resourceKey;
        if (resourceType === 'artifacts') {
          resourceKey = `artifact-${resourceId}`;
        } else if (resourceType === 'executions') {
          resourceKey = `execution-${resourceId}`;
        } else if (resourceType === 'browser-workflows') {
          resourceKey = `browser-workflow-${resourceId}`;
        } else {
          resourceKey = resourceId;
        }

        // For artifacts and browser workflows, always include content when reading
        const includeContent = resourceType === 'artifacts' || resourceType === 'browser-workflows';
        
        // Debug: Check what resources are cached
        const cachedIds = this.resourceManager.getCachedResourceIds();
        this.logger.debug(`Cached resource IDs (first 5): ${cachedIds.slice(0, 5).join(', ')}`);
        this.logger.debug(`Looking for resource: ${resourceKey}`);
        
        // Pre-discover artifacts to ensure cache is populated (temporary aggressive fix)
        if (resourceType === 'artifacts' && cachedIds.length === 0) {
          this.logger.debug(`Cache empty, pre-discovering artifacts...`);
          await this.resourceManager.discoverArtifactResources({ limit: 100 });
        }

        let resource = await this.resourceManager.getResource(resourceKey, includeContent);
        
        // If resource not found in cache and it's an artifact, try to discover it first
        if (!resource && resourceType === 'artifacts') {
          this.logger.debug(`Resource not in cache, attempting discovery for: ${resourceKey}`);
          // Discover artifacts to populate cache
          await this.resourceManager.discoverArtifactResources({ limit: 100 });
          // Try again after discovery
          resource = await this.resourceManager.getResource(resourceKey, includeContent);
        }
        
        if (!resource) {
          this.logger.warn(`Resource not found. Key: ${resourceKey}, Type: ${resourceType}, ID: ${resourceId}`);
          this.logger.debug(`Total cached resources: ${cachedIds.length}`);
          throw new Error(`Resource not found: ${uri}`);
        }
        
        // For execution resources, fetch full data from database
        let resourceData = resource.metadata || {};
        
        if (resourceType === 'executions' && resourceId) {
          try {
            const execution = await prisma.agentExecution.findUnique({
              where: { id: resourceId },
              include: {
                task: {
                  include: {
                    pov: true,
                    phase: true
                  }
                },
                agentTemplate: true
              }
            });
            
            if (execution) {
              resourceData = {
                ...resourceData,
                execution: {
                  id: execution.id,
                  status: execution.status,
                  createdAt: execution.createdAt,
                  completedAt: execution.completedAt,
                  result: execution.result,
                  error: execution.error,
                  task: execution.task,
                  template: execution.agentTemplate,
                  metrics: {
                    duration: execution.completedAt ? 
                      new Date(execution.completedAt) - new Date(execution.createdAt) : null,
                    tokens: execution.result?.tokensUsed || null
                  }
                }
              };
            }
          } catch (dbError) {
            this.logger.error('Error fetching execution data:', dbError);
          }
        }
        
        // Return resource content using unified resourceManager architecture
        let content;
        
        // For artifact resources, use resourceManager content (includes MIME type enforcement)
        if (resourceType === 'artifacts' && resource && resource.content) {
          // ResourceManager has already applied MCP_ARTIFACTS_FORCE_DOWNLOAD logic
          // Use the consistent MIME type from resource metadata
          const mimeType = resource.metadata?.mimeType || 'text/plain';
          
          content = {
            uri: resource.uri,
            mimeType: mimeType,
            text: resource.content  // Return actual content from resourceManager
          };
        } else if (resourceType === 'artifacts' && resource) {
          // If no content in cache, get it via resourceManager with content
          const resourceWithContent = await this.resourceManager.getResource(resourceKey, true);
          
          if (resourceWithContent && resourceWithContent.content) {
            const mimeType = resourceWithContent.metadata?.mimeType || 'text/plain';
            
            content = {
              uri: resourceWithContent.uri,
              mimeType: mimeType,
              text: resourceWithContent.content
            };
          } else {
            // Fallback: resource exists but no content available
            content = {
              uri: resource.uri,
              mimeType: resource.metadata?.mimeType || 'application/json',
              text: JSON.stringify({ 
                error: 'Content not available',
                resource: resource.metadata || {} 
              }, null, 2)
            };
          }
        } else {
          // For non-artifact resources or when content is not available, return JSON
          content = {
            uri: resource.uri,
            mimeType: resource.metadata?.mimeType || 'application/json',
            text: JSON.stringify(resource.metadata || {}, null, 2)
          };
        }

        return { contents: [content] };
      } catch (error) {
        const isNotFound = error.message?.includes('not found') || error.message?.includes('Unknown');
        if (isNotFound) {
          this.logger.warn('Resource not found:', error.message);
        } else {
          this.logger.error('Error reading resource:', error);
        }
        return {
          contents: [{
            uri: uri,
            mimeType: 'text/plain',
            text: `Error: ${error.message}`
          }]
        };
      }
    });

    // Handle list_prompts requests
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      
      try {
        const prompts = this.promptRegistry.listPrompts();
        
        // Format prompts for MCP protocol
        const mcpPrompts = prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || []
        }));
        
        this.logger.info(`Returning ${mcpPrompts.length} prompts`);
        return { prompts: mcpPrompts };
      } catch (error) {
        this.logger.error('Failed to list prompts:', error.message);
        return { prompts: [] };
      }
    });

    // Handle get_prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const prompt = this.promptRegistry.getPrompt(name);
        
        if (!prompt) {
          throw new Error(`Prompt not found: ${name}`);
        }
        
        // Get recent context for enhancement
        const context = {
          ...args,
          // Add any session context here
          clientInfo: this.clientInfo
        };
        
        // Get the prompt content
        const content = await prompt.content(context);
        
        // Return in MCP format
        return {
          description: prompt.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: content
              }
            }
          ]
        };
      } catch (error) {
        this.logger.error('Failed to get prompt:', error.message);
        throw error;
      }
    });

    this.logger.info('SDK request handlers configured with resource and prompt support');
  }

  /**
   * Create intelligent error response with recovery suggestions
   */
  async createIntelligentErrorResponse(error, toolName, originalArgs) {
    let errorMessage = `❌ **Error in ${toolName}**\n\n${error.message}\n\n`;
    
    // Apply smart error recovery if enabled
    if (featureFlags.isEnabled('smartErrorRecovery')) {
      try {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, toolName, originalArgs);
        if (recovery.canRecover && recovery.suggestions?.length > 0) {
          errorMessage += `💡 **Suggestions:**\n`;
          recovery.suggestions.forEach((suggestion, index) => {
            errorMessage += `${index + 1}. ${suggestion.description}\n`;
            if (suggestion.suggestedValue !== undefined) {
              errorMessage += `   Try: ${suggestion.parameter}: ${JSON.stringify(suggestion.suggestedValue)}\n`;
            }
          });
          errorMessage += '\n';
        }
      } catch (recoveryError) {
        this.logger.error(`Error recovery failed for ${toolName}:`, recoveryError.message);
      }
    }
    
    errorMessage += `🔧 **Pure SDK-Native**: This tool uses pure SDK implementation with enhanced error recovery\n`;
    
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
      _meta: {
        tool: toolName,
        timestamp: new Date().toISOString(),
        pureSDKNative: true,
        version: '5.0.0',
        parameterIntelligence: featureFlags.isEnabled('smartErrorRecovery'),
        errorRecovery: featureFlags.isEnabled('smartErrorRecovery')
      }
    };
  }

  /**
   * Ensure response is SDK-compliant
   */
  ensureSDKCompliantResponse(result, toolName) {
    // If result is already SDK-compliant, return as-is
    if (result && result.content && Array.isArray(result.content)) {
      return {
        ...result,
        _meta: {
          ...result._meta,
          tool: toolName,
          timestamp: new Date().toISOString(),
          pureSDKNative: true,
          version: '5.0.0'
        }
      };
    }

    // Convert non-compliant responses
    if (typeof result === 'string') {
      return {
        content: [{ type: "text", text: result }],
        isError: false,
        _meta: {
          tool: toolName,
          timestamp: new Date().toISOString(),
          pureSDKNative: true,
          version: '5.0.0',
          converted: true
        }
      };
    }

    // Handle object responses
    if (typeof result === 'object' && result !== null) {
      const text = JSON.stringify(result, null, 2);
      return {
        content: [{ type: "text", text: text }],
        isError: false,
        _meta: {
          tool: toolName,
          timestamp: new Date().toISOString(),
          pureSDKNative: true,
          version: '5.0.0',
          converted: true
        }
      };
    }

    // Fallback for unexpected response types
    return {
      content: [{ type: "text", text: `Tool ${toolName} completed successfully` }],
      isError: false,
      _meta: {
        tool: toolName,
        timestamp: new Date().toISOString(),
        pureSDKNative: true,
        version: '5.0.0',
        fallback: true
      }
    };
  }

  /**
   * Convert Zod schema to JSON Schema for MCP compatibility
   */
  convertZodToJsonSchema(zodSchema) {
    // Safe implementation with extensive error handling
    if (!zodSchema) {
      return {
        type: 'object',
        additionalProperties: true,
        description: 'No schema provided'
      };
    }

    try {
      // Ensure zodToJsonSchema is available
      if (typeof zodToJsonSchema !== 'function') {
        throw new Error('zodToJsonSchema function not available');
      }

      const jsonSchema = zodToJsonSchema(zodSchema, {
        target: "jsonSchema7",
        definitions: true,
        errorMessages: true,
        // markdownDescription: true,  // Removed - not standard JSON Schema, breaks Gemini CLI
        removeAdditionalStrategy: "strict"
      });
      
      // Validate result
      if (jsonSchema && typeof jsonSchema === 'object') {
        return jsonSchema;
      } else {
        throw new Error('Invalid schema conversion result');
      }
      
    } catch (conversionError) {
      // Safe error handling
      const errorMsg = conversionError && conversionError.message ? conversionError.message : 'Unknown conversion error';
      this.logger.error('Schema conversion failed:', errorMsg);
      
      // Return working fallback schema
      return {
        type: 'object',
        additionalProperties: true,
        description: `Schema conversion failed: ${errorMsg}`
      };
    }
  }

  /**
   * Get initialization health status
   *
   * @returns {Object} Initialization health status
   * @returns {Object} returns.overall - Overall initialization status
   * @returns {string} returns.overall.status - Overall status (initializing, complete, failed)
   * @returns {number} returns.overall.startTime - Overall start timestamp
   * @returns {number} [returns.overall.totalDuration] - Total initialization duration (ms)
   * @returns {boolean} returns.readyForTraffic - Whether server is ready to accept requests
   * @returns {Array<Object>} returns.steps - Individual initialization steps
   * @returns {Object} returns.summary - Summary statistics
   * @returns {number} returns.summary.total - Total steps
   * @returns {number} returns.summary.completed - Completed steps
   * @returns {number} returns.summary.failed - Failed steps
   * @returns {number} returns.summary.pending - Pending steps
   * @returns {number} returns.summary.completionPercentage - Completion percentage
   *
   * @description Provides detailed initialization health status for monitoring and debugging.
   *   Tracks 6 initialization steps: constructor, core handlers, database resources,
   *   auth context, prompt registry, and transport.
   *
   * @example
   * const health = server.getInitializationHealth();
   * if (health.readyForTraffic) {
   *   console.log(`Server ready: ${health.summary.completionPercentage}% complete`);
   * }
   */
  getInitializationHealth() {
    const allSteps = Object.entries(this.initializationStatus)
      .filter(([key]) => key !== 'overall')
      .map(([step, status]) => ({ step, ...status }));

    const completedSteps = allSteps.filter(s => s.status === 'complete').length;
    const failedSteps = allSteps.filter(s => s.status === 'failed').length;
    const pendingSteps = allSteps.filter(s => s.status === 'pending').length;

    return {
      overall: this.initializationStatus.overall,
      readyForTraffic: this.initializationStatus.overall.status === 'complete',
      steps: allSteps,
      summary: {
        total: allSteps.length,
        completed: completedSteps,
        failed: failedSteps,
        pending: pendingSteps,
        completionPercentage: Math.round((completedSteps / allSteps.length) * 100)
      }
    };
  }

  /**
   * Start the pure SDK-native MCP server
   *
   * @returns {Promise<void>} Resolves when server is fully started
   *
   * @description Starts MCP server with parallelized initialization:
   *   1. Set Prisma instance for prompt registry
   *   2. Parallelize auth context and prompt registry initialization (30-50% faster)
   *   3. Initialize tool handlers (basic, advanced, browser, hub, ChatGPT connector)
   *   4. Register all SDK-native tool handlers
   *   5. Set up request handlers (tools, resources, prompts)
   *   6. Start stdio transport and wait for connections
   *   7. Mark initialization complete
   *
   *   Tracks initialization health for monitoring and debugging.
   *
   * @example
   * const server = new PureSDKNativeServer();
   * await server.start();  // Server now accepting MCP requests
   *
   * @throws {Error} If initialization fails (auth, prompts, tools, or transport)
   */
  async start() {
    try {
      this.logger.info('Starting Pure SDK-Native MCP Server v5...');

      // Set Prisma instance for prompt registry
      setPrismaInstance(prisma);

      // PHASE 3 IMPROVEMENT (Priority 4): Parallelize independent initialization steps
      // Auth context and prompt registry don't depend on each other (30-50% faster)
      this.initializationStatus.authContext.startTime = Date.now();
      this.initializationStatus.promptRegistry.startTime = Date.now();

      const [authResult, promptResult] = await Promise.allSettled([
        // Step 1: Initialize user context from API key
        this.initializeAuthContext(),

        // Step 2: Initialize and load prompt registry
        (async () => {
          await this.promptRegistry.initialize();
          this.logger.info('Prompt registry initialized');

          // Load database prompts for /prompt command execution
          try {
            await this.promptRegistry.loadDatabasePrompts();
            this.logger.info(`✅ Loaded ${this.promptRegistry.dbPrompts.size} database prompts for chameleon platform`);

            // PHASE 3 IMPROVEMENT (Priority 5): Fail-fast for critical dependencies (opt-in)
            // Set MCP_REQUIRE_DB_PROMPTS=true to enforce database prompts as critical
            if (this.promptRegistry.dbPrompts.size === 0) {
              const requireDbPrompts = process.env.MCP_REQUIRE_DB_PROMPTS === 'true';
              if (requireDbPrompts) {
                throw new Error('Database prompts required but not loaded (MCP_REQUIRE_DB_PROMPTS=true)');
              }
              this.logger.warn('⚠️ No database prompts loaded - chameleon platform functionality limited');
            }
          } catch (error) {
            const requireDbPrompts = process.env.MCP_REQUIRE_DB_PROMPTS === 'true';
            this.logger.error('❌ Failed to load database prompts:', error.message);

            if (requireDbPrompts) {
              this.logger.error('🚨 CRITICAL: Database prompts required but failed to load');
              throw error; // Fail-fast when required
            }

            this.logger.error('🦎 Chameleon platform functionality will be limited to built-in prompts');
            // Continue without database prompts rather than failing completely
          }
        })()
      ]);

      // Track completion status
      if (authResult.status === 'fulfilled') {
        this.initializationStatus.authContext.status = 'complete';
        this.initializationStatus.authContext.duration = Date.now() - this.initializationStatus.authContext.startTime;
      } else {
        this.initializationStatus.authContext.status = 'failed';
        this.initializationStatus.authContext.duration = Date.now() - this.initializationStatus.authContext.startTime;
        this.initializationStatus.authContext.error = authResult.reason?.message;
        this.logger.warn('Auth context initialization had issues:', authResult.reason?.message);
      }

      if (promptResult.status === 'fulfilled') {
        this.initializationStatus.promptRegistry.status = 'complete';
        this.initializationStatus.promptRegistry.duration = Date.now() - this.initializationStatus.promptRegistry.startTime;
      } else {
        this.initializationStatus.promptRegistry.status = 'failed';
        this.initializationStatus.promptRegistry.duration = Date.now() - this.initializationStatus.promptRegistry.startTime;
        this.initializationStatus.promptRegistry.error = promptResult.reason?.message;
        this.logger.error('Prompt registry initialization failed:', promptResult.reason?.message);
      }

      // Enable core features by default
      featureFlags.enable('sdkCompliance');
      featureFlags.enable('smartErrorRecovery');
      featureFlags.enable('typeCoercion');
      featureFlags.enable('performanceMonitoring');

      this.logger.info('Enabled core intelligent features');

      // Create transport and connect
      this.initializationStatus.transport.startTime = Date.now();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.initializationStatus.transport.status = 'complete';
      this.initializationStatus.transport.duration = Date.now() - this.initializationStatus.transport.startTime;

      // Mark overall initialization as complete
      this.initializationStatus.overall.status = 'complete';
      this.initializationStatus.overall.totalDuration = Date.now() - this.initializationStatus.overall.startTime;

      this.logger.info('Pure SDK-Native MCP Server v5 started successfully');
      this.logger.info(`Available tools: ${Array.from(this.toolHandlers.keys()).join(', ')}`);
      this.logger.info(`Available prompts: ${this.promptRegistry.listPrompts().length}`);
      this.logger.info(`Initialization complete in ${this.initializationStatus.overall.totalDuration}ms`);
      this.logger.info('🚀 Ready for Claude Desktop with pure SDK-native implementation!');

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      this.logger.info('🔄 Shutting down Pure SDK-Native server...');

      // BC34 FIX: Clear resource maintenance intervals
      if (this._resourceDiscoveryInterval) clearInterval(this._resourceDiscoveryInterval);
      if (this._resourceCleanupInterval) clearInterval(this._resourceCleanupInterval);

      // Shutdown execution streaming
      if (this.executionStreaming && typeof this.executionStreaming.shutdown === 'function') {
        this.executionStreaming.shutdown();
        this.logger.info('Execution streaming shut down');
      }
      
      // Save performance metrics
      const summary = performanceMonitor.getSummary();
      this.logger.info('📊 Final performance summary:', summary);
      
      // Close database connections
      try {
        await prisma.$disconnect();
        this.logger.info('Database connections closed');
      } catch (dbError) {
        this.logger.debug('Database disconnect error:', dbError.message);
      }

      // Close ServiceConnectionPool connections (P0 fix - prevents connection leaks on restart)
      try {
        const { ServiceConnectionPool } = require('./lib/mcp/server/utils/service-connection-pool');
        const pool = ServiceConnectionPool.getInstance();
        await pool.closeAll();
        this.logger.info('ServiceConnectionPool connections closed');
      } catch (poolError) {
        this.logger.debug('ServiceConnectionPool cleanup error:', poolError.message);
      }

      // Close server connection
      await this.server.close();
      
      this.logger.info('✅ Pure SDK-Native server shutdown complete');
    } catch (error) {
      this.logger.error('❌ Error during shutdown:', error);
    }
  }

  /**
   * Get comprehensive server status
   */
  getServerStatus() {
    return {
      version: '5.0.0',
      implementation: 'Pure SDK-Native',
      toolCount: this.toolHandlers.size,
      tools: Array.from(this.toolHandlers.keys()),
      features: featureFlags.getEnabled(),
      performance: performanceMonitor.getSummary(),
      clientInfo: this.clientInfo,
      clientCapabilities: this.clientCapabilities,
      parameterIntelligence: {
        errorRecovery: smartErrorRecovery.getStatistics()
      },
      executionStreaming: this.executionStreaming && typeof this.executionStreaming.getStreamingStats === 'function' 
        ? this.executionStreaming.getStreamingStats() 
        : { enabled: false, message: 'Execution streaming not configured' }
    };
  }
}

// Main execution
async function main() {
  const server = new PureSDKNativeServer();
  
  // Handle graceful shutdown
  const shutdownLog = stderrLoggers.mcpLogger.child({ component: 'sdk-v5' });
  process.on('SIGINT', async () => {
    shutdownLog.info('Shutting down gracefully (SIGINT)');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    shutdownLog.info('Received SIGTERM, shutting down');
    await server.shutdown();
    process.exit(0);
  });

  // Start the server
  await server.start();
}

// Export for testing
module.exports = { PureSDKNativeServer };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    stderrLoggers.mcpLogger.fatal({ err: error, component: 'sdk-v5' }, 'Fatal error');
    process.exit(1);
  });
}
