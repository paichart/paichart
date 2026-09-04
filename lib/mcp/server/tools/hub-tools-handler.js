/**
 * MCP Hub Tools Handler
 *
 * Handles service registration, discovery, and management for the MCP Hub.
 * Enhanced with unified Zod validation framework for enterprise security.
 *
 * @class HubToolsHandler
 * @description Provides MCP Hub functionality including:
 *   - Service registration with Anthropic compliance checks
 *   - Service discovery with authentication-based filtering
 *   - Service health monitoring
 *   - Cross-service communication with security validation
 *   - Company trial management
 *
 * @version 1.0.0
 * @author pAIchart MCP Hub Team
 */

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma: globalPrisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-tools-handler' }));
const { SDKParameterNormalizer } = require('../utils/parameter-normalizer');
const { findBestMatch, getScoredSuggestions } = require('../utils/fuzzy-search-helper');
const { MetadataEnhancer } = require('../utils/metadata-enhancer');
const { PromptListHandler } = require('./hub/prompt-list-handler');
const { UserServicesHandler } = require('./hub/user-services-handler');
const { ServiceUpdateHandler } = require('./hub/service-update-handler');
const { ServiceDeleteHandler } = require('./hub/service-delete-handler');
const { ServiceHealthHandler } = require('./hub/service-health-handler');
const { ServiceCallHandler } = require('./hub/service-call-handler');
const { ServiceDiscoveryHandler } = require('./hub/service-discovery-handler');
const { ServiceRegistrationHandler } = require('./hub/service-registration-handler');
const { HubUtilities } = require('./hub/hub-utilities');
const { ServiceToolsHandler } = require('./hub/service-tools-handler');
const { WorkflowToolsHandler } = require('./hub/workflow-tools-handler');
class HubToolsHandler {
  /**
   * Creates MCP Hub Tools Handler
   *
   * @param {Object} [prisma=null] - Prisma client instance (uses global singleton if not provided)
   * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Shared parameter normalizer
   * @param {PromptRegistry} [promptRegistry=null] - Prompt registry for built-in prompts
   *
   * @description Initializes Hub Tools with dependency injection pattern.
   *   Uses global Prisma singleton to prevent connection pool exhaustion.
   *   Creates specialized handlers for prompt management.
   */
  constructor(prisma, sharedNormalizer = null, promptRegistry = null) {
    // DI pattern: Use injected prisma or fall back to global singleton (never create new)
    this.prisma = prisma || globalPrisma;
    // Use shared normalizer if provided, otherwise create own instance
    this.parameterNormalizer = sharedNormalizer || new SDKParameterNormalizer();
    // Optional: PromptRegistry for exposing built-in prompts
    this.promptRegistry = promptRegistry;
    // Initialize utilities (used by multiple handlers)
    this.utilities = new HubUtilities(this.prisma);
    // Initialize specialized handlers
    this.promptListHandler = new PromptListHandler(this.prisma, this.promptRegistry);
    this.userServicesHandler = new UserServicesHandler(this.prisma);
    this.serviceUpdateHandler = new ServiceUpdateHandler(this.prisma, this.utilities, this);
    this.serviceDeleteHandler = new ServiceDeleteHandler(this.prisma, this.utilities, this);
    this.serviceHealthHandler = new ServiceHealthHandler(this.prisma, this.utilities, this.parameterNormalizer);
    this.serviceCallHandler = new ServiceCallHandler(this.prisma, this.utilities, this.parameterNormalizer);
    this.serviceDiscoveryHandler = new ServiceDiscoveryHandler(this.prisma, this.utilities, this.parameterNormalizer);
    this.serviceRegistrationHandler = new ServiceRegistrationHandler(this.prisma, this.utilities, this.parameterNormalizer, this);
    this.serviceToolsHandler = new ServiceToolsHandler(this.prisma);
    // v4.2: Workflow tools for multi-service orchestration
    this.workflowToolsHandler = new WorkflowToolsHandler(this.prisma);

    // Recover stale workflow executions on startup (fire-and-forget)
    this.workflowToolsHandler.recoverStaleExecutions().catch(err => {
      log.error({ err }, 'Failed to recover stale executions on startup');
    });

    // Start background health checks (every 5 minutes) so services(action: "discover")
    // always shows fresh metrics even for services that aren't actively called.
    this.utilities.startBackgroundHealthChecks();
  }

  /**
   * Bug Class 30 defense: Wrap handler delegation in MCP content error boundary.
   * Thrown errors become JSON-RPC errors that Claude mobile hides.
   * This catch converts them to {content, isError: true} which all clients display.
   * Matches the pattern used by basic tools (sdk-native-basic-tools.js) and
   * advanced tools (task-action-handler.js, etc.) at their handler boundaries.
   *
   * @param {string} toolName - Tool name for _meta (e.g., 'registry', 'services')
   * @param {Function} handlerFn - Async handler function to call
   * @returns {Promise<Object>} Handler result or MCP content error
   * @private
   */
  async _safeDelegate(toolName, handlerFn) {
    try {
      return await handlerFn();
    } catch (error) {
      log.error({ err: error, tool: toolName }, 'Hub handler error');
      return {
        content: [{ type: 'text', text: `❌ ${error.message}` }],
        isError: true,
        _meta: {
          tool: toolName,
          timestamp: new Date().toISOString(),
          sdkNative: true
        }
      };
    }
  }

  /**
   * registry(action: "register") - Register a new MCP service with the hub
   * Delegates to ServiceRegistrationHandler
   */
  async handleRegisterService(args, context) {
    return this._safeDelegate('registry', () => this.serviceRegistrationHandler.handle(args, context));
  }

  /**
   * services(action: "discover") - Discover MCP services by capability or criteria
   * Delegates to ServiceDiscoveryHandler
   */
  async handleDiscoverServices(args, context) {
    return this._safeDelegate('services', () => this.serviceDiscoveryHandler.handle(args, context));
  }

  /**
   * services(action: "health") - Get health status of a specific service
   * Delegates to ServiceHealthHandler
   */
  async handleGetServiceHealth(args, context) {
    return this._safeDelegate('services', () => this.serviceHealthHandler.handle(args, context));
  }

  /**
   * services(action: "call") - Call another service through the hub
   * Delegates to ServiceCallHandler
   * Requires: context?.user?.id (Authentication Required)
   */
  async handleCallService(args, context) {
    return this._safeDelegate('services', () => this.serviceCallHandler.handle(args, context));
  }

  /**
   * registry(action: "update") - Update an existing MCP service (preserves service ID and history)
   * Delegates to ServiceUpdateHandler
   */
  async handleUpdateService(args, context) {
    return this._safeDelegate('registry', () => this.serviceUpdateHandler.handle(args, context));
  }

  /**
   * registry(action: "delete") - Permanently delete an MCP service (GDPR Right to Erasure)
   * Delegates to ServiceDeleteHandler
   */
  async handleDeleteService(args, context) {
    return this._safeDelegate('registry', () => this.serviceDeleteHandler.handle(args, context));
  }

  /**
   * registry(action: "list") - List services owned by the authenticated user
   * Delegates to UserServicesHandler
   * Requires: context?.user?.id (Authentication Required)
   */
  async handleListMyServices(args, context) {
    return this._safeDelegate('registry', () => this.userServicesHandler.handle(args, context));
  }

  /**
   * registry(action: "tools") - Get detailed tool definitions for a service
   * Delegates to ServiceToolsHandler
   * Public tool - no authentication required
   */
  async handleGetServiceTools(args, context) {
    return this._safeDelegate('registry', () => this.serviceToolsHandler.handle(args, context));
  }

  // --- WORKFLOW TOOLS (v4.2) ---

  /**
   * services(action: "workflow.execute") - Execute a multi-service workflow
   * Delegates to WorkflowToolsHandler
   * Requires: context?.user?.id (Authentication Required)
   */
  async handleExecuteWorkflow(args, context) {
    return this._safeDelegate('services', () => this.workflowToolsHandler.handleExecuteWorkflow(args, context));
  }

  /**
   * services(action: "workflow.status") - Check workflow execution status
   * Delegates to WorkflowToolsHandler
   */
  async handleGetWorkflowStatus(args, context) {
    return this._safeDelegate('services', () => this.workflowToolsHandler.handleGetWorkflowStatus(args, context));
  }

  /**
   * services(action: "workflow.cancel") - Cancel a running workflow
   * Delegates to WorkflowToolsHandler
   */
  async handleCancelWorkflow(args, context) {
    return this._safeDelegate('services', () => this.workflowToolsHandler.handleCancelWorkflow(args, context));
  }

  /**
   * services(action: "workflow.list") - List workflow execution history
   * Delegates to WorkflowToolsHandler
   */
  async handleListWorkflowExecutions(args, context) {
    return this._safeDelegate('services', () => this.workflowToolsHandler.handleListWorkflowExecutions(args, context));
  }

  /**
   * Helper: Get count of active services
   */
  async getActiveServiceCount() {
    try {
      const count = await this.prisma.mCPTool.count({
        where: {
          status: 'ACTIVE',
          configuration: {
            path: ['category'],
            not: 'TRIAL_REQUEST'
          }
        }
      });
      return count;
    } catch (error) {
      log.warn('Failed to get active service count', { err: error });
      return 0;
    }
  }


  // Helper methods

  // Utility method delegations (extracted to HubUtilities)
  async checkPermission(userId, resourceType, action) {
    return this.utilities.checkPermission(userId, resourceType, action);
  }

  fallbackPermissionCheck(user, resourceType, action) {
    return this.utilities.fallbackPermissionCheck(user, resourceType, action);
  }

  async isUserAdmin(userId) {
    return this.utilities.isUserAdmin(userId);
  }

  async isNewUser(userId) {
    return this.utilities.isNewUser(userId);
  }

  async checkServiceAccess(userId, service) {
    return this.utilities.checkServiceAccess(userId, service);
  }

  async getServiceInteractionCount(serviceId) {
    return this.utilities.getServiceInteractionCount(serviceId);
  }

  calculateUptimePercent(service) {
    return this.utilities.calculateUptimePercent(service);
  }

  async trackServiceInteraction(serviceId, tool, result, context, action = 'SERVICE_CALL') {
    return this.utilities.trackServiceInteraction(serviceId, tool, result, context, action);
  }

  /**
   * List available prompts with natural language and POV context support
   */
  /**
   * List available prompts with natural language and POV context support
   *
   * @param {Object} args - Prompt listing arguments
   * @param {string} [args.category] - Filter by category (orchestration, discovery, etc.)
   * @param {string} [args.search] - Search term for prompt names/descriptions
   * @param {boolean} [args.includeBuiltIn=true] - Include built-in prompts
   * @param {boolean} [args.includeDatabase=true] - Include database prompts
   * @param {Object} [context] - User authentication context (optional)
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} Prompt listing result
   * @returns {Array<Object>} returns.prompts - Available prompts
   * @returns {number} returns.total - Total prompt count
   *
   * @description Delegates to PromptListHandler for specialized prompt management.
   *   Combines built-in prompts from registry with database prompts.
   *   Supports fuzzy search and category filtering.
   *
   * @example
   * const prompts = await handler.handleListPrompts({
   *   category: 'orchestration',
   *   includeBuiltIn: true
   * }, { user: { id: 'user123' } });
   */
  async handleListPrompts(args, context) {
    return this._safeDelegate('list_prompts', () => this.promptListHandler.handle(args, context));
  }
}

module.exports = { HubToolsHandler };