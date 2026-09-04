/**
 * SDK-Native Basic Tools Implementation
 * Pure SDK implementation without wrapper dependencies
 *
 * Provides core MCP tools for POV listing, task management, agent templates,
 * and prompt command execution. Supports parameter normalization, fuzzy search,
 * and intelligent context inference.
 *
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 * @created October 2025
 * @updated December 2025 (Phase 5a: Agent template tools)
 */

const { stderr, createAdapter } = require('../mcp-logger');
const { featureFlags } = require('../config/feature-flags');
const { AGENT_CATEGORIES, AGENT_TEMPLATE_STATUSES } = require('../config/tool-schemas');
const { POVStatus } = require('@prisma/client');
const { performanceMonitor } = require('../monitoring/performance-monitor');
const { smartErrorRecovery } = require('../utils/smart-error-recovery');
const { apiClient } = require('../utils/api-client');
const { responseFormatter } = require('../utils/formatters');
const { findBestMatch, getScoredSuggestions, calculateMatchScore } = require('../utils/fuzzy-search-helper');
const { validateCuidParam } = require('../../../utils/cuid-validation');
// BUG-BASIC-XSS-1 Phase 2.6 (GAP-2): 4 inline throws + 3 _meta echo sites
// echo user input directly into MCP responses. _meta fields (searchTerm,
// povTitle) flow into client-side render contexts; future HTML-rendering
// clients would be vulnerable per sec-ops I2.
const { sanitizeForResponse } = require('./response-sanitizer');

// Error helpers for consistent, user-friendly error messages
const { povNotFoundError, taskNotFoundError, emptyResultsResponse } = require('./basic/error-helpers');

// Enhanced with Parameter Normalizer for robust parameter handling
const { SDKParameterNormalizer } = require('../utils/parameter-normalizer');

// P0-2 FIX: Context Enricher for per-request user context
const { ContextEnricher } = require('../middleware/context-enricher');

// MCP Exposure Fix: Metadata Enhancer for pagination & performance pass-through
const { MetadataEnhancer } = require('../utils/metadata-enhancer');

/**
 * SDK-Native Basic Tools Handler
 *
 * Provides core MCP tools for POV management, task listing, agent templates,
 * and prompt command execution. Features intelligent parameter inference,
 * fuzzy search for POV/task/template lookup, and metadata exposure for pagination.
 *
 * @class SDKNativeBasicTools
 * @description Pure SDK implementation without wrapper dependencies. Includes:
 *   - POV listing with geographical and status filtering
 *   - Task listing with fuzzy search and hierarchical display
 *   - POV details with context enrichment and fallback handling
 *   - Agent template listing and details (Phase 5a)
 *   - Prompt command execution for Claude Desktop
 *
 * @example
 * const tools = new SDKNativeBasicTools(server, normalizer);
 * await tools.handleListPOVs({ status: 'IN_PROGRESS', limit: 50 }, context);
 */
class SDKNativeBasicTools {
  /**
   * Creates SDK-Native Basic Tools handler
   *
   * @param {Object} [server=null] - MCP SDK server instance (optional for standalone use)
   * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Optional shared parameter normalizer
   * @description Initializes tool handlers (6 tools), parameter normalizer, and logger.
   *   If sharedNormalizer not provided, creates its own instance.
   *   Registers: project.pov_list, project.task_list, project.pov_details, template.list,
   *   template.details, prompt_command.
   */
  constructor(server, sharedNormalizer = null) {
    this.server = server;
    this.logger = this.createLogger();
    this.toolHandlers = new Map();
    // Use shared normalizer if provided, otherwise create own instance
    this.parameterNormalizer = sharedNormalizer || new SDKParameterNormalizer();

    this.setupToolHandlers();
    this.logger.info('Initialized with pure SDK implementation');
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'sdk-native-basic' }));
  }

  /**
   * Setup SDK-native tool handlers
   */
  setupToolHandlers() {
    // Consolidated tool handlers (Mar 2026: legacy names → consolidated tool.action)
    this.toolHandlers.set('project.pov_list', this.handleListPOVs.bind(this));
    this.toolHandlers.set('project.task_list', this.handleListTasks.bind(this));
    this.toolHandlers.set('project.pov_details', this.handleGetPOVDetails.bind(this));

    // Template tool handlers
    this.toolHandlers.set('template.list', this.handleListAgentTemplates.bind(this));
    this.toolHandlers.set('template.details', this.handleGetAgentTemplateDetails.bind(this));

    // Prompt Command Handler (standalone tool - not consolidated)
    this.toolHandlers.set('prompt_command', this.handlePromptCommand.bind(this));

    this.logger.info('Setup SDK-native handlers for 6 basic tools (3 project, 2 template, 1 prompt)');
  }

  /**
   * Register tools with SDK server
   * @param {Object} server - SDK server instance
   */
  registerTools(server) {
    this.server = server;
    
    // Register each tool handler
    for (const [toolName, handler] of this.toolHandlers) {
      this.logger.debug(`Registering SDK-native tool: ${toolName}`);
    }
    
    this.logger.info('Registered 3 SDK-native basic tools');
  }

  /**
   * Handle project.pov_list action - Lists POVs with geographical and status filtering
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.status] - POV status filter (PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST)
   * @param {string} [args.customer_name] - Customer name filter (partial matching, case-insensitive)
   * @param {string} [args.owner_name] - Owner name filter (partial matching)
   * @param {string} [args.country_name] - Country name filter (partial matching, case-insensitive)
   * @param {string} [args.region_name] - Region name filter (partial matching, case-insensitive)
   * @param {string} [args.theatre_name] - Sales theatre filter (APJ, EMEA, NORTH_AMERICA, LAC)
   * @param {number} [args.limit=100] - Maximum POVs to return
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with POV list
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata with pagination info
   * @returns {Object} returns._meta.pagination - Pagination metadata (completeness, hasMore, total)
   *
   * @description Retrieves POVs with optional filtering by geographical location, status,
   *   customer, or owner. Updates session context with first POV for parameter intelligence.
   *   Includes enhanced metadata for pagination and completeness tracking (MCP Exposure Fix).
   *
   * @example
   * // List all in-progress POVs
   * await tools.handleListPOVs({ status: 'IN_PROGRESS', limit: 50 }, context);
   *
   * @throws {Error} If API request fails or validation error occurs
   */
  async handleListPOVs(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_project_pov_list');
    
    try {
      this.logger.debug('Executing SDK-native project.pov_list');
      
      // Jan Marshal's Simple & Reliable Approach - Direct parameter usage
      // No complex normalization needed - APIs handle natural language directly
      const {
        status,
        customer_name,
        owner_name,
        country_name,
        region_name,
        theatre_name,
        limit = 100,  // 🔧 FIX: Increase default limit to capture all BlackEye tasks (59)
        includeAccessReason = false  // NEW: Show access reason and permissions
      } = args;

      // BUG-003 FIX: Early enum validation to prevent timeouts from invalid values.
      // Phase 5 boy-scout (2026-05-17) — pulled from Prisma's POVStatus enum so
      // any future schema change (add 'PAUSED' etc.) is picked up automatically.
      // Per synthesis row 5/18 — closes hardcoded-enum drift class.
      const validPovStatuses = Object.values(POVStatus);

      if (status && !validPovStatuses.includes(status.toUpperCase())) {
        performanceMonitor.endTiming(timingId);
        return {
          content: [{ type: "text", text: `❌ Invalid status value: "${status}"\n\nValid values: ${validPovStatuses.join(', ')}` }],
          isError: true,
          _meta: {
            tool: 'project',
            timestamp: new Date().toISOString(),
            sdkNative: true,
            nextSteps: [
              `Use valid status: ${validPovStatuses.join(', ')}`,
              "Example: project(action: 'pov.list', status: 'IN_PROGRESS')",
              'Or omit status to get all POVs'
            ]
          }
        };
      }

      // Step 3: Make API call
      const queryParams = { limit: limit.toString() };
      if (status) queryParams.status = status;
      if (customer_name) queryParams.customer_name = customer_name;
      if (owner_name) queryParams.owner_name = owner_name;
      if (country_name) queryParams.country_name = country_name;
      if (region_name) queryParams.region_name = region_name;
      if (theatre_name) queryParams.theatre_name = theatre_name;

      // P0-2 FIX: Enrich context and forward user context to API
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      const povData = await apiClient.get('/api/pov', queryParams, { userContext });

      this.logger.info(`Retrieved ${povData.data?.length || 0} POVs`);

      // Update session context with first POV if available
      if (povData.data && povData.data.length > 0) {
        this.parameterNormalizer.setPOVContext(povData.data[0]);
      }

      // NEW: Enhance with access metadata if requested
      let povs = povData.data || [];
      if (includeAccessReason && userContext?.user?.id) {
        povs = povs.map(pov => {
          // Determine access reason
          let accessReason = 'unknown';
          let teamRole = null;
          let permissions = [];

          // Check if owner
          if (pov.ownerId === userContext.user.id) {
            accessReason = 'owner';
            permissions = ['read', 'write', 'delete', 'manage_team', 'manage_phases'];
          }
          // Check if admin
          else if (userContext.user.role === 'ADMIN' || userContext.user.role === 'SUPER_ADMIN') {
            accessReason = 'admin';
            permissions = ['read', 'write', 'delete', 'manage_team', 'manage_phases'];
          }
          // Check if team member (team is object with members array, not array itself!)
          else if (pov.team?.members && Array.isArray(pov.team.members)) {
            const teamMember = pov.team.members.find(tm => tm.userId === userContext.user.id);
            if (teamMember) {
              accessReason = 'team';
              teamRole = teamMember.role;
              permissions = teamMember.role === 'PROJECT_MANAGER'
                ? ['read', 'write', 'manage_tasks']
                : ['read'];
            }
          }

          return {
            ...pov,
            _access: { accessReason, teamRole, permissions }
          };
        });
      }

      // MCP Exposure Fix: Create enhanced metadata with pagination
      const enhancedMeta = MetadataEnhancer.createEnhancedMeta({
        tool: 'project',
        apiResponse: povData,
        filters: queryParams
      });

      // Add access summary to metadata if includeAccessReason
      if (includeAccessReason && userContext?.user?.id) {
        enhancedMeta.accessSummary = {
          owner: povs.filter(p => p._access?.accessReason === 'owner').length,
          admin: povs.filter(p => p._access?.accessReason === 'admin').length,
          team: povs.filter(p => p._access?.accessReason === 'team').length
        };
      }

      // Step 4: Format response for SDK with metadata
      const formattedText = responseFormatter.formatPOVList(
        povs,
        enhancedMeta,  // Pass metadata to formatter for completeness info
        includeAccessReason  // NEW: Pass flag to show access badges
      );

      performanceMonitor.endTiming(timingId);

      // P2: Add POV selection nextSteps
      const firstPov = povs[0];
      const nextStepsGuidance = povs.length > 0
        ? [
            `Found ${povs.length} POV${povs.length === 1 ? '' : 's'}`,
            firstPov ? `Get details: project(action: 'pov.details', povId: '${firstPov.id}')` : null,
            firstPov ? `List tasks: project(action: 'task.list', povId: '${firstPov.id}')` : null,
            "Get team member IDs and phase IDs for task creation"
          ].filter(Boolean)
        : [
            "No POVs found matching filters",
            "Create POV: perform(action: 'pov.create', parameters: { title: '...', ... }) (ADMIN or USER; DEMO blocked)",
            "Or: Adjust filters to broaden search"
          ];

      enhancedMeta.nextSteps = nextStepsGuidance;

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: enhancedMeta
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_project_pov_list', error);
      this.logger.error('project.pov_list failed:', error.message);
      
      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'project', args);
        if (recovery.canRecover) {
          const errorMessage = this.createEnhancedErrorMessage(error, recovery, 'project');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'project',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }
      
      // Dec 2025 UX Assessment: Add nextSteps for error recovery guidance
      return {
        content: [{ type: "text", text: `❌ Error in project: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: [
            "Try: project(action: 'pov.list') without filters",
            'Check: status values are PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST',
            'Alternative: search("pov name") for natural language search'
          ]
        }
      };
    }
  }

  /**
   * Handle project.task_list action - Lists tasks with fuzzy search and hierarchical display
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.povId] - POV CUID filter (normalized from povId or pov_id)
   * @param {string} [args.pov_name] - POV name for lookup (fuzzy search)
   * @param {string} [args.phaseId] - Phase CUID filter
   * @param {string} [args.phase_name] - Phase name for lookup
   * @param {string} [args.stageId] - Stage CUID filter
   * @param {string} [args.stage_name] - Stage name for lookup
   * @param {string} [args.status] - Task status filter (OPEN, IN_PROGRESS, COMPLETED, BLOCKED)
   * @param {string} [args.assigneeId] - Assignee user CUID filter
   * @param {string} [args.assignee_name] - Assignee name for lookup
   * @param {string} [args.teamId] - Team CUID filter
   * @param {string} [args.team_name] - Team name for lookup
   * @param {string} [args.priority] - Priority filter (HIGH, MEDIUM, LOW)
   * @param {number} [args.limit=100] - Maximum tasks to return
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with task list
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata with pagination info
   * @returns {Object} returns._meta.pagination - Pagination metadata (completeness, hasMore, total)
   *
   * @description Retrieves tasks with optional filtering by POV, phase, stage, status, assignee,
   *   team, or priority. Supports fuzzy search for POV/phase/stage name lookups. Automatically
   *   includes phase and stage data for hierarchical display when filtering by POV. Updates
   *   session context with retrieved tasks for parameter intelligence.
   *
   * @example
   * // List all open tasks for a specific POV
   * await tools.handleListTasks({ pov_name: 'BlackEye', status: 'OPEN' }, context);
   *
   * @throws {Error} If API request fails or validation error occurs
   */
  async handleListTasks(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_project_task_list');
    
    try {
      this.logger.debug('Executing SDK-native project.task_list');
      
      // Use parameter normalizer to handle variations
      const normalizedArgs = this.parameterNormalizer.normalizeForTool('project.task_list', args);
      this.logger.debug('Normalized args:', normalizedArgs);
      
      const {
        povId,
        pov_name,
        phaseId,
        phase_name,
        stageId,
        stage_name,
        status,
        assigneeId,
        assignee_name,
        teamId,
        team_name,
        priority,
        limit = 100
      } = normalizedArgs;

      // CUID format validation — extracted to lib/utils/cuid-validation.js so
      // the same logic is shared across every handler that takes ID parameters.
      // GS3 (Error Categorisation) + GS12 (Parameter Normalisation at Transport
      // Boundary). Detects right-type prefix (pov- on povId), wrong-type prefix
      // (task- on povId), and genuinely malformed CUIDs.
      const povIdCheck = validateCuidParam(povId, 'povId', 'project', 'task.list');
      if (!povIdCheck.isValid) {
        performanceMonitor.endTiming(timingId);
        return povIdCheck.errorResponse;
      }

      // BUG-003 FIX: Early enum validation to prevent timeouts from invalid values
      const validStatuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
      const validPriorities = ['HIGH', 'MEDIUM', 'LOW'];
      // BC75 Sibling-Drift fix (2026-05-31): the consolidated-tool gate
      // (prioritySchema) deliberately accepts URGENT (Wave C CSD-1, Priority-
      // aligned — eliminates call-shape-dependent rejection). perform
      // task.create/update normalise URGENT→HIGH via a PRIORITY_ALIASES map;
      // this task.list FILTER must normalise the SAME way, else the gate accepts
      // URGENT then this handler rejects it — the lone inconsistent sibling.
      const PRIORITY_ALIASES = { URGENT: 'HIGH', CRITICAL: 'HIGH', NORMAL: 'MEDIUM', MINOR: 'LOW', TRIVIAL: 'LOW' };
      const priorityFilter = priority
        ? (PRIORITY_ALIASES[String(priority).toUpperCase()] || String(priority).toUpperCase())
        : priority;

      if (status && !validStatuses.includes(status.toUpperCase())) {
        performanceMonitor.endTiming(timingId);
        return {
          content: [{ type: "text", text: `❌ Invalid status value: "${status}"\n\nValid values: ${validStatuses.join(', ')}` }],
          isError: true,
          _meta: {
            tool: 'project',
            timestamp: new Date().toISOString(),
            sdkNative: true,
            nextSteps: [
              `Use valid status: ${validStatuses.join(', ')}`,
              "Example: project(action: 'task.list', status: 'OPEN')",
              'Or omit status to get all tasks'
            ]
          }
        };
      }

      if (priorityFilter && !validPriorities.includes(priorityFilter)) {
        performanceMonitor.endTiming(timingId);
        return {
          content: [{ type: "text", text: `❌ Invalid priority value: "${priority}"\n\nValid values: ${validPriorities.join(', ')} (aliases: URGENT/CRITICAL→HIGH, NORMAL→MEDIUM, MINOR/TRIVIAL→LOW)` }],
          isError: true,
          _meta: {
            tool: 'project',
            timestamp: new Date().toISOString(),
            sdkNative: true,
            nextSteps: [
              `Use valid priority: ${validPriorities.join(', ')}`,
              "Example: project(action: 'task.list', priority: 'HIGH')",
              'Or omit priority to get all tasks'
            ]
          }
        };
      }

      const finalPovId = povId;
      
      // Debug: Log extracted parameters
      this.logger.debug('Normalized parameters:', { povId, pov_name, finalPovId, phaseId, phase_name, status, priority, limit });
      
      // Step 3: Build query parameters
      const queryParams = { limit: limit.toString() };
      // 🔧 FIX: Use finalPovId (which supports both povId and pov_id) and send as pov_id to API
      if (finalPovId) queryParams.pov_id = finalPovId;
      if (pov_name) queryParams.pov_name = pov_name;
      if (phaseId) queryParams.phaseId = phaseId;
      if (phase_name) queryParams.phase_name = phase_name;
      if (stageId) queryParams.stageId = stageId;
      if (stage_name) queryParams.stage_name = stage_name;
      if (status) queryParams.status = status;
      if (assigneeId) queryParams.assigneeId = assigneeId;
      if (assignee_name) queryParams.assignee_name = assignee_name;
      if (teamId) queryParams.teamId = teamId;
      if (team_name) queryParams.team_name = team_name;
      if (priorityFilter) queryParams.priority = priorityFilter;
      
      // When querying for a specific POV, always include phase and stage data for hierarchical display
      if (finalPovId || pov_name) {
        queryParams.include = 'phase,stage';
      }
      
      // Debug: Log final query parameters being sent to API
      this.logger.debug('Final query params for API:', queryParams);

      // P0-2 FIX: Enrich context and forward user context to API
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Step 4: Make API call
      const taskData = await apiClient.get('/api/tasks', queryParams, { userContext });

      this.logger.info(`Retrieved ${taskData.data?.length || 0} tasks`);
      
      // Track retrieved tasks in session context
      if (taskData.data && taskData.data.length > 0) {
        this.parameterNormalizer.setTaskListContext(taskData.data);
      }

      // Step 5: Create enhanced metadata (MCP Exposure Fix)
      const enhancedMeta = MetadataEnhancer.createEnhancedMeta({
        tool: 'project',
        apiResponse: taskData,
        filters: queryParams
      });

      // Step 6: Format response for SDK with formatting context and metadata
      const formattingContext = {
        povId: finalPovId
      };
      const formattedText = responseFormatter.formatTaskList(
        taskData.data || [],
        formattingContext,
        enhancedMeta  // Pass metadata to formatter for completeness info
      );

      performanceMonitor.endTiming(timingId);

      // P2: Add task selection nextSteps
      const tasks = taskData.data || [];
      const firstTask = tasks[0];

      const nextStepsGuidance = tasks.length > 0
        ? [
            `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
            firstTask ? `Get details: project(action: 'task.context', taskId: '${firstTask.id}')` : null,
            firstTask ? `Update task: perform(action: 'task.update', parameters: { taskId: '${firstTask.id}', ... })` : null,
            "Or: Select task ID from list above for other actions"
          ].filter(Boolean)
        : [
            "No tasks found matching filters",
            finalPovId ? `Create task: perform(action: 'task.create', parameters: { povId: '${finalPovId}', title: '...' })` : "Create task: First get POV details for IDs",
            "Or: Adjust filters to broaden search"
          ];

      enhancedMeta.nextSteps = nextStepsGuidance;

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: enhancedMeta
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_project_task_list', error);
      this.logger.error('project.task_list failed:', error.message);
      
      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'project', args);
        if (recovery.canRecover) {
          const errorMessage = this.createEnhancedErrorMessage(error, recovery, 'project');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'project',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }
      
      // Dec 2025 UX Assessment: Add nextSteps for error recovery guidance
      return {
        content: [{ type: "text", text: `❌ Error in project: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: [
            "Try: project(action: 'task.list') without filters",
            "Verify: povId exists with project(action: 'pov.details')",
            'Check: status values are OPEN, IN_PROGRESS, COMPLETED, BLOCKED',
            'Alternative: search("task name") for natural language search'
          ]
        }
      };
    }
  }

  /**
   * Handle project.pov_details action - Retrieves comprehensive POV details with context enrichment
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.povId] - POV CUID (exact lookup)
   * @param {string} [args.pov_title] - POV title for fuzzy search
   * @param {string} [args.pov_name] - POV name for fuzzy search
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with POV details
   * @returns {Array<Object>} returns.content - Response content array with formatted POV details
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata (tool name, timestamp, povId, povTitle, searchTerm)
   *
   * @description Retrieves comprehensive POV details including team members, phases, stages,
   *   tasks, and analytics. Supports fuzzy search by title or name with intelligent fallbacks:
   *   - If povId provided: Direct lookup
   *   - If pov_title/pov_name provided: Fuzzy search with scored suggestions on failure
   *   - If no identifier: Auto-selects only POV, or provides helpful error with available POVs
   *
   *   Updates session context with retrieved POV for parameter intelligence. Enriches response
   *   with additional context data from /api/mcp/tasks/context endpoint (optional, non-critical).
   *
   * @example
   * // Get POV by fuzzy title search
   * await tools.handleGetPOVDetails({ pov_title: 'BlackEye' }, context);
   *
   * // Get POV by exact ID
   * await tools.handleGetPOVDetails({ povId: 'cm3xyz123' }, context);
   *
   * @throws {Error} If POV not found, or multiple POVs exist without identifier
   * @throws {Error} If API request fails
   *
   * @security POV access validated via user context
   */
  async handleGetPOVDetails(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_project_pov_details');

    try {
      this.logger.debug('Executing SDK-native project.pov_details');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Use parameter normalizer to handle variations and maintain context
      const normalizedArgs = this.parameterNormalizer.normalizeForTool('project.pov_details', args);
      this.logger.debug('Normalized args:', normalizedArgs);

      const { povId, pov_title, pov_name } = normalizedArgs;

      // GS12 — validate CUID format before any lookup. povId is optional here
      // (pov_name / pov_title are alternatives), but if it IS supplied it must
      // be a bare CUID, not a fetch-style "pov-CUID" form.
      const povIdCheck = validateCuidParam(povId, 'povId', 'project', 'pov.details');
      if (!povIdCheck.isValid) {
        performanceMonitor.endTiming(timingId);
        return povIdCheck.errorResponse;
      }

      let finalPovId = povId;

      // If no povId provided, try to find POV by title or name
      if (!finalPovId && (pov_title || pov_name)) {
        const searchTerm = pov_title || pov_name;
        this.logger.debug(`Looking up POV by title/name: "${searchTerm}"`);

        // Get all POVs and search for matching title. MUST pass a high limit:
        // /api/pov defaults to 50 (route.ts:19 DEFAULT_LIMIT), so an empty query
        // silently truncates the fuzzy-search candidate set to the first 50 — a POV
        // past #50 is then unfindable by name even on an exact match. Same bug class
        // as the agent-template-details fetch below (2026-06-19 fetch-to-search sweep).
        const allPovs = await apiClient.get('/api/pov', { limit: 200 }, { userContext });
        const povs = allPovs.data || allPovs || [];
        
        // Use centralized fuzzy search helper (default threshold: 50 since Apr 2026)
        const foundPov = findBestMatch(
          povs,
          searchTerm,
          'title',
          {
            logger: this.logger,
            ambiguityThreshold: 0.1 // Log warning if top 2 scores within 10%
          }
        );

        if (foundPov) {
          // Check match quality — if Tier 4 (word-based, score < 100), ask for
          // clarification instead of silently auto-matching. Tier 1-3 (exact,
          // starts-with, contains) auto-match with high confidence.
          const matchScore = calculateMatchScore(foundPov.title, searchTerm);
          if (matchScore < 100) {
            // Weak match — present as "Did you mean?" with suggestions
            const suggestions = getScoredSuggestions(povs, searchTerm, 'title', 3);
            const suggestionLines = suggestions
              .map(s => `  • "${sanitizeForResponse(s.title)}" (ID: ${s.id}, score: ${s.score})`)
              .join('\n');
            throw new Error(
              `No exact match for "${sanitizeForResponse(searchTerm)}". Did you mean:\n${suggestionLines}\n\n` +
              `💡 Use the full name or ID for an exact match:\n` +
              `  • project(action: 'pov.details', povId: '${suggestions[0]?.id || '...'}')\n` +
              `  • project(action: 'pov.details', pov_name: '${sanitizeForResponse(suggestions[0]?.title) || '...'}')`
            );
          }
          finalPovId = foundPov.id;
          this.logger.info(`Found POV: "${foundPov.title}" (${foundPov.id}) for search: "${searchTerm}"`);
        } else {
          // Get scored suggestions for helpful error using reusable helper
          const suggestions = getScoredSuggestions(povs, searchTerm, 'title', 3)
            .map(s => ({ name: s.title, id: s.id, score: s.score }));
          throw povNotFoundError(searchTerm, suggestions);
        }
      }

      if (!finalPovId) {
        // Try to be helpful: If no ID provided, get the most recent POV or provide context
        this.logger.debug('No POV identifier provided, attempting to find context');
        
        // Try to get all POVs and suggest the most recent one
        try {
          const allPovs = await apiClient.get('/api/pov', { limit: 5, sortBy: 'updatedAt', order: 'desc' }, { userContext });
          const povs = allPovs.data || allPovs || [];
          
          if (povs.length === 1) {
            // If there's only one POV, use it
            finalPovId = povs[0].id;
            this.logger.info(`Using the only available POV: ${povs[0].title} (${povs[0].id})`);
          } else if (povs.length > 0) {
            // Multiple POVs exist - provide helpful error with context
            const povList = povs.slice(0, 5).map(p => `"${sanitizeForResponse(p.title)}" (id: ${p.id})`).join(', ');
            throw new Error(`Please specify which POV to get details for. Available POVs: ${povList}. You can use either the POV ID or title.`);
          } else {
            throw new Error('No POVs found. Please create a POV first.');
          }
        } catch (apiError) {
          // If we can't get POVs, throw the original error
          if (apiError.message && apiError.message.includes('Please specify')) {
            throw apiError;
          }
          throw new Error('Either povId, pov_title, or pov_name is required');
        }
      }
      
      // Step 3: Make API calls with error handling
      const povData = await apiClient.get(`/api/pov/${finalPovId}`, {}, { userContext });
      this.logger.info(`Retrieved POV details for: ${povData.title || finalPovId}`);
      
      // Update session context with retrieved POV
      this.parameterNormalizer.setPOVContext(povData);
      
      // Get additional context if available (with error handling)
      let contextData = null;
      try {
        contextData = await apiClient.get('/api/mcp/tasks/context', {
          povId: finalPovId,
          includeAnalytics: 'true'
        }, { userContext });
        this.logger.debug('Retrieved additional context data');
      } catch (contextError) {
        this.logger.debug('Context data unavailable, continuing without it:', contextError.message);
        // Continue without context data - not critical
      }

      // Step 4: Format response for SDK
      const formattedText = responseFormatter.formatPOVDetails(povData, contextData?.data);

      performanceMonitor.endTiming(timingId);

      // P2: Generate executable nextSteps using actual IDs from POV data
      const firstTeamMember = povData.team?.members?.[0];
      const firstPhase = povData.phases?.[0];
      const firstStage = firstPhase?.stages?.[0];

      const nextSteps = [];
      if (firstTeamMember && firstPhase) {
        nextSteps.push(
          "💡 Ready to create tasks with these IDs:",
          `perform(action: 'task.create', parameters: {`,
          `  povId: '${povData.id}',`,
          `  phaseId: '${firstPhase.id}',`,
          firstStage ? `  stageId: '${firstStage.id}',` : null,
          `  assigneeId: '${firstTeamMember.userId || firstTeamMember.id}',`,
          `  title: 'Your task title'`,
          `})`,
          "",
          `Or list tasks: project(action: 'task.list', povId: '${povData.id}')`
        );
      } else {
        nextSteps.push(
          `View tasks: project(action: 'task.list', povId: '${povData.id}')`,
          "Create tasks: Use perform with action: 'task.create'"
        );
      }

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          povId: finalPovId,
          // BUG-BASIC-XSS-1 Phase 2.6 (sec-ops I2): _meta fields reach
          // HTML-rendering clients; sanitize DB-sourced povTitle + user-
          // supplied searchTerm.
          povTitle: sanitizeForResponse(povData.title),
          searchTerm: sanitizeForResponse(pov_title || pov_name || null) || null,
          nextSteps: nextSteps.filter(s => s !== null)
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_project_pov_details', error);
      this.logger.error('project.pov_details failed:', error.message);
      
      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'project', args);
        if (recovery.canRecover) {
          const errorMessage = this.createEnhancedErrorMessage(error, recovery, 'project');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'project',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }
      
      return {
        content: [{ type: "text", text: `❌ Error in project: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'project',
          timestamp: new Date().toISOString(),
          sdkNative: true
        }
      };
    }
  }

  /**
   * Handle template(action: "list") - Lists agent templates with category filtering
   *
   * Phase 5a: Agent Parameters - Jan Marshal's Simple Approach
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.agent_template_name] - Template name filter (partial matching, case-insensitive)
   * @param {string} [args.agent_category] - Category filter (GENERAL, DEVELOPMENT, TESTING, DOCUMENTATION, ANALYSIS, AUTOMATION, REVIEW, DEPLOYMENT, MONITORING, SECURITY)
   * @param {string} [args.status] - Status filter (ACTIVE, INACTIVE, DEPRECATED, DRAFT)
   * @param {number} [args.limit=50] - Maximum templates to return
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with agent template list
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata with pagination info
   * @returns {Object} returns._meta.pagination - Pagination metadata (completeness, hasMore, total)
   *
   * @description Retrieves agent templates with optional filtering by name, category, or status.
   *   Supports partial name matching for easy discovery. Updates session context with retrieved
   *   templates for parameter intelligence in subsequent tool calls.
   *
   *   Response includes template ID, name, description, category, capabilities, and performance
   *   metrics for each template.
   *
   * @example
   * // List all development templates
   * await tools.handleListAgentTemplates({ agent_category: 'DEVELOPMENT' }, context);
   *
   * // Search by template name
   * await tools.handleListAgentTemplates({ agent_template_name: 'Senior Developer' }, context);
   *
   * @throws {Error} If API request fails
   */
  async handleListAgentTemplates(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_template_list');

    try {
      this.logger.debug('Executing SDK-native template.list');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // BUG-TEMPLATE-011 fix (2026-05-23, Phase 3 validation-engine #3+#4):
      // dropped `limit = 50` default — limitSchema.default(100) at the schema
      // boundary populates args.limit. Dropped BUG-003 enum re-validation
      // (~38 LOC) — schema's z.enum(AGENT_CATEGORIES) + z.enum(AGENT_TEMPLATE_STATUSES)
      // rejects invalid values at the dispatch boundary via wrapWithSchema.
      // Phantom defense-in-depth: schema is the load-bearing gate, handler
      // duplication was unreachable code. Per [[feedback_defend_vs_delete_dead_code]].
      const { agent_template_name, agent_category, status, limit } = args;

      // Build query parameters
      const queryParams = { limit: limit.toString() };
      if (agent_template_name) queryParams.agent_template_name = agent_template_name;
      if (agent_category) queryParams.agent_category = agent_category;
      if (status) queryParams.status = status;

      // Make API call to agent templates endpoint
      const templateData = await apiClient.get('/api/agent-templates', queryParams, { userContext });

      // Handle API response structure (data.data.templates vs data.templates vs data)
      const templates = templateData.data?.data?.templates || templateData.data?.templates || templateData.data || [];

      this.logger.info(`Retrieved ${templates.length || 0} agent templates`);

      // BUG-TEMPLATE-010 fix (2026-05-23, Phase 3 sec-ops M2):
      // Removed setAgentTemplateContext call — the BUG-TEMPLATE-002 fix
      // at 56b16673 dropped the context-inference fallback in
      // handleGetAgentTemplateDetails (now throws explicit missing-identifier
      // error). With no reader, this writer became dead AND latently
      // cross-tenant (process-global cache). Per
      // [[feedback_defend_vs_delete_dead_code]]: setter + getter + field
      // all dropped (see parameter-normalizer.js same commit).

      // MCP Exposure Fix: Create enhanced metadata with pagination
      const enhancedMeta = MetadataEnhancer.createEnhancedMeta({
        tool: 'template',
        apiResponse: templateData,
        filters: queryParams
      });

      // Use the dedicated agent template formatter with metadata
      const formattedText = responseFormatter.formatAgentTemplateList(
        templates,
        enhancedMeta  // Pass metadata to formatter for completeness info
      );

      performanceMonitor.endTiming(timingId);

      // P2: Add agent workflow nextSteps
      const firstTemplate = templates[0];
      const nextStepsGuidance = templates.length > 0
        ? [
            `Found ${templates.length} agent template${templates.length === 1 ? '' : 's'}`,
            firstTemplate ? `Assign to task: perform(action: 'agent.assign', parameters: { taskId: '...', agentTemplateId: '${firstTemplate.id}' })` : null,
            "Then execute: perform(action: 'agent.execute', parameters: { taskId: '...' })",
            "Monitor: perform(action: 'agent.status'), Get results: perform(action: 'agent.results')"
          ].filter(Boolean)
        : [
            "No agent templates found matching filters",
            "Adjust filters: Try different category or remove status filter",
            "Or: Contact admin to create agent templates"
          ];

      enhancedMeta.nextSteps = nextStepsGuidance;

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: enhancedMeta
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_template_list', error);
      this.logger.error('template.list failed:', error.message);
      
      // Dec 2025 UX Assessment: Add nextSteps for error recovery guidance
      return {
        content: [{ type: "text", text: `❌ Error in template: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'template',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: [
            "Try: template(action: 'list') without filters",
            'Check: Valid categories are GENERAL, DEVELOPMENT, TESTING, DOCUMENTATION, ANALYSIS, AUTOMATION, REVIEW, DEPLOYMENT, MONITORING, SECURITY',
            "Alternative: template(action: 'details', agent_template_name: '...') for specific template"
          ]
        }
      };
    }
  }

  /**
   * Handle template(action: "details") - Retrieves comprehensive agent template details
   *
   * Phase 5a: Agent Parameters - Jan Marshal's Simple Approach
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.templateId] - Template CUID (exact lookup)
   * @param {string} [args.agent_template_name] - Template name for fuzzy search
   * @param {string} [args.agent_category] - Category to find first template (alternative lookup)
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   *
   * @returns {Promise<Object>} MCP response with template details
   * @returns {Array<Object>} returns.content - Response content array with formatted template details
   * @returns {boolean} returns.isError - Whether response is an error
   * @returns {Object} returns._meta - Metadata (tool name, timestamp, templateId, templateName, searchTerm)
   *
   * @description Retrieves comprehensive agent template details including role, capabilities,
   *   constraints, input/output schemas, performance metrics, and version information.
   *
   *   Supports multiple lookup strategies:
   *   - If templateId provided: Direct lookup
   *   - If agent_template_name provided: Fuzzy search with scored suggestions on failure
   *   - If agent_category provided: Returns first template in category
   *   - If no identifier: Infers from recent template(action: "list") context (Parameter Intelligence)
   *
   *   Response includes template configuration, MCP tools, capabilities, performance metrics
   *   (success rate, usage count, avg time), and version/status information.
   *
   * @example
   * // Get template by fuzzy name search
   * await tools.handleGetAgentTemplateDetails({ agent_template_name: 'Senior Developer' }, context);
   *
   * // Get template by exact ID
   * await tools.handleGetAgentTemplateDetails({ templateId: 'cm3xyz123' }, context);
   *
   * // Get first template in category
   * await tools.handleGetAgentTemplateDetails({ agent_category: 'DEVELOPMENT' }, context);
   *
   * @throws {Error} If template not found or no identifier provided
   * @throws {Error} If API request fails
   */
  async handleGetAgentTemplateDetails(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_template_details');

    try {
      this.logger.debug('Executing SDK-native template.details');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Direct parameter usage — support both schema name (template_name) and legacy name (agent_template_name)
      const { templateId, template_id, template_name, agent_template_name, agent_category } = args;
      let finalTemplateId = templateId || template_id;
      const searchName = template_name || agent_template_name;

      // BUG-TEMPLATE-002 fix (2026-05-23): if NO identifier provided at ALL,
      // refuse with a clear error instead of silently falling back to the
      // first context-cached template. Previously the handler would lookup
      // parameterNormalizer.getAgentTemplateContext() and use templateContext[0],
      // returning an arbitrary template (typically the first one alphabetically
      // visited in the session). User had no signal that they got an inferred
      // result rather than the one they meant.
      //
      // Sibling of BUG-REGISTRY-003 — same root: "missing-identifier"
      // dispatch action needs an explicit error, not a silent fallback.
      if (!finalTemplateId && !searchName && !agent_category) {
        throw new Error(
          'template(action: "details") requires an identifier. Pass one of:\n' +
          '  • templateId: "cm..." (exact CUID — preferred)\n' +
          '  • template_name: "Senior Developer" (fuzzy name match)\n' +
          '  • agent_category: "DEVELOPMENT" (returns first match in category)\n\n' +
          '💡 Use template(action: "list") to see all available templates first.'
        );
      }

      // If no templateId yet, try to find template by name or category
      if (!finalTemplateId && (searchName || agent_category)) {
        this.logger.debug(`Looking up agent template by name/category: "${searchName || agent_category}"`);

        // Get all templates and search for matching name. MUST pass a high limit:
        // /api/agent-templates defaults to limit=20 (route.ts:47, capped at 200), so
        // an empty query silently truncates to the first 20 (alphabetical) — making
        // any template past #20 (e.g. "Senior Software Developer", #21) unfindable by
        // name even on an exact match (the fuzzy search never sees it). 200 = route cap;
        // mirrors agent-assign-handler's findMany({ take: 50 }). (smoke-test finding 2026-06-18)
        const allTemplates = await apiClient.get('/api/agent-templates', { limit: 200 }, { userContext });
        const templates = allTemplates.data?.data?.templates || allTemplates.data?.templates || allTemplates.data || [];

        let foundTemplate = null;

        if (searchName) {
          // Use centralized fuzzy search helper
          foundTemplate = findBestMatch(
            templates,
            searchName,
            'name', // Agent templates use 'name' field (not 'title')
            {
              logger: this.logger,
              ambiguityThreshold: 0.1
            }
          );
        } else if (agent_category) {
          // Find first template in the specified category
          foundTemplate = templates.find(template =>
            template.category === agent_category
          );
        }

        if (foundTemplate) {
          finalTemplateId = foundTemplate.id;
          this.logger.info(`Found agent template: "${foundTemplate.name}" (${foundTemplate.id})`);
        } else {
          // Get scored suggestions for helpful error
          const searchTerm = searchName || agent_category;
          const suggestions = getScoredSuggestions(templates, searchTerm, 'name', 3);
          if (suggestions.length > 0) {
            // Dec 2025 UX Assessment Fix 1: Use s.name (agent templates have 'name' not 'title')
            const suggestionText = suggestions.map(s => `"${s.name}" (score: ${s.score})`).join(', ');
            throw new Error(`Agent template not found: "${sanitizeForResponse(searchTerm)}". Did you mean: ${sanitizeForResponse(suggestionText)}?`);
          } else {
            const availableNames = templates.map(t => t.name).filter(Boolean);
            throw new Error(`Agent template not found: "${sanitizeForResponse(searchTerm)}". Available templates: ${availableNames.slice(0, 5).map(n => sanitizeForResponse(n)).join(', ')}${availableNames.length > 5 ? '...' : ''}`);
          }
        }
      }

      if (!finalTemplateId) {
        throw new Error('Either templateId, template_name, or agent_category is required');
      }

      // Make API call to get template details
      const templateData = await apiClient.get(`/api/agent-templates/${finalTemplateId}`, {}, { userContext });
      this.logger.info(`Retrieved agent template details for: ${templateData.name || finalTemplateId}`);
      
      // Debug: Log the actual data structure
      this.logger.debug('Raw templateData:', templateData);
      this.logger.debug('templateData.capabilities:', templateData.capabilities);
      
      // Use the dedicated agent template details formatter
      const formattedText = responseFormatter.formatAgentTemplateDetails(templateData);
      
      performanceMonitor.endTiming(timingId);
      
      // Dec 2025 UX Assessment Fix 2: Add nextSteps for workflow guidance
      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'template',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          templateId: finalTemplateId,
          templateName: templateData.name,
          searchTerm: searchName || agent_category || null,
          nextSteps: [
            `Template "${templateData.name}" retrieved successfully`,
            `Assign to task: perform(action: 'agent.assign', parameters: { taskId: '...', agentTemplateId: '${finalTemplateId}' })`,
            `Then execute: perform(action: 'agent.execute', parameters: { taskId: '...' })`,
            `Or: project(action: 'task.list') to find task IDs for assignment`
          ]
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_template_details', error);
      this.logger.error('template.details failed:', error.message);
      
      // Dec 2025 UX Assessment: Add nextSteps for error recovery guidance
      return {
        content: [{ type: "text", text: `❌ Error in template: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'template',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: [
            "Try: template(action: 'list') to see available templates",
            'Check: Template name spelling',
            "Use: template(action: 'details', agent_category: 'DEVELOPMENT') for category search"
          ]
        }
      };
    }
  }

  /**
   * Create enhanced error message with recovery suggestions
   */
  createEnhancedErrorMessage(error, recovery, toolName) {
    let message = `❌ **Error in ${toolName}**\n\n`;
    
    // Parse error message properly - handle [object Object] issue
    let errorMessage = '';
    
    if (error && typeof error === 'object') {
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error) {
        // Handle nested error objects
        if (typeof error.error === 'string') {
          errorMessage = error.error;
        } else if (error.error.message) {
          errorMessage = error.error.message;
        } else {
          errorMessage = JSON.stringify(error.error);
        }
      } else {
        // Fallback: stringify the entire error object
        try {
          errorMessage = JSON.stringify(error, null, 2);
        } catch (stringifyError) {
          errorMessage = error.toString();
        }
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = 'Unknown error occurred';
    }
    
    message += `${errorMessage}\n\n`;
    
    if (recovery.suggestions && recovery.suggestions.length > 0) {
      message += `💡 **Suggestions:**\n`;
      recovery.suggestions.forEach((suggestion, index) => {
        message += `${index + 1}. ${suggestion.description}\n`;
        if (suggestion.suggestedValue !== undefined) {
          message += `   Try: ${suggestion.parameter}: ${JSON.stringify(suggestion.suggestedValue)}\n`;
        }
      });
      message += '\n';
    }
    
    // Add tool-specific guidance
    const guidance = this.getToolSpecificGuidance(toolName);
    message += guidance;
    
    return message;
  }

  /**
   * Get tool-specific guidance for errors
   */
  getToolSpecificGuidance(toolName) {
    const guidance = {
      'project': '💡 **Tip**: POV statuses: "PROJECTED", "IN_PROGRESS", "STALLED", "VALIDATION", "WON", "LOST". Task statuses: "OPEN", "IN_PROGRESS", "COMPLETED", "BLOCKED"',
      'perform': '💡 **Tip**: Use action parameter to specify operation (e.g., task.complete, agent.assign)',
      'analytics': '💡 **Tip**: Use action "recommendations.get" for AI suggestions or "team.performance" for metrics',
      'template': '💡 **Tip**: Use action "list" to browse templates or "details" with templateId for full config',
      'services': '💡 **Tip**: Use action "discover" to find services, "call" to invoke them, "health" to check status',
      'registry': '💡 **Tip**: Use action "register" to add a service, "list" to see yours, "update"/"delete" to manage',
      'search': '💡 **Tip**: Provide a query string to search across POVs, tasks, and phases',
      'fetch': '💡 **Tip**: Provide a valid URL to fetch content from external sources',
      'prompt_command': '💡 **Tip**: Use format "/prompt [name] [arg=value]" or just the prompt name',
      'list_prompts': '💡 **Tip**: Filter by query, domain, or category. Use mcpOnly=false for non-MCP prompts'
    };

    return guidance[toolName] || '💡 **Tip**: Check parameter values and try again';
  }

  /**
   * Get tool handler for a specific tool
   */
  getToolHandler(toolName) {
    return this.toolHandlers.get(toolName);
  }

  /**
   * Get performance metrics for SDK-native tools
   */
  getPerformanceMetrics() {
    return performanceMonitor.getSummary();
  }

  /**
   * Handle prompt_command tool - Executes prompt commands for Claude Desktop
   *
   * Enables /prompt commands in Claude Desktop with authentication-aware prompt selection
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.command] - Prompt command name (preferred field)
   * @param {string} [args.prompt_name] - Prompt name (alternative field for Claude Desktop)
   * @param {string} [args.prompt] - Prompt name (alternative field)
   * @param {Object} context - User authentication context
   * @param {Object} [context.user] - Authenticated user object
   * @param {string} [context.user.id] - User ID
   * @param {string} [context.user.email] - User email
   * @param {boolean} [context.authenticated] - Authentication status
   *
   * @returns {Promise<Object>} MCP response with prompt execution result
   * @returns {Array<Object>} returns.content - Response content from prompt execution
   * @returns {boolean} returns.isError - Whether execution failed
   * @returns {Object} returns._meta - Metadata (tool name, timestamp, error if applicable)
   *
   * @description Executes prompt commands by delegating to PromptCommandHandler. Handles
   *   multiple field name variations that Claude Desktop might use (command, prompt_name, prompt).
   *   Passes authentication context through for authentication-based prompt selection.
   *
   *   Fallback behavior:
   *   - Searches for promptCommandHandler on this.server
   *   - Falls back to this.server.parent.promptCommandHandler if not found
   *   - Returns error if handler not initialized
   *
   * @example
   * // Execute a prompt command
   * await tools.handlePromptCommand({ command: '/prompt select_pov' }, context);
   *
   * @throws {Error} If prompt command handler not initialized
   * @throws {Error} If command execution fails
   */
  async handlePromptCommand(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_prompt_command');
    
    try {
      // Handle multiple field names that Claude Desktop might use
      const command = args.command || args.prompt_name || args.prompt;
      
      // Context is now passed as the second parameter from HTTP server
      // args.context is deprecated but kept for backward compatibility
      context = context || args.context;
      
      // Debug logging
      if (!command) {
        this.logger.debug('No command found in args:', args);
      }

      // Debug context to understand authentication flow
      this.logger.debug('Context received:', {
        hasContext: !!context,
        hasUser: !!context?.user,
        authenticated: context?.authenticated,
        userId: context?.user?.id,
        email: context?.user?.email
      });
      
      // Try to get prompt command handler from multiple places
      let promptCommandHandler = this.server?.promptCommandHandler;
      
      // Fallback: Try to get from parent server instance if available
      if (!promptCommandHandler && this.server?.parent?.promptCommandHandler) {
        promptCommandHandler = this.server.parent.promptCommandHandler;
      }
      
      // Debug logging to understand what's happening
      if (!promptCommandHandler) {
        this.logger.debug('handlePromptCommand called with:', { command });
        this.logger.debug('this.server exists:', !!this.server);
        this.logger.debug('this.server.promptCommandHandler exists:', !!this.server?.promptCommandHandler);

        return {
          content: [{ type: "text", text: "❌ Prompt command handler not initialized. Please ensure the server is properly configured." }],
          isError: true
        };
      }
      
      if (!command) {
        this.logger.debug('Command is empty. Args received:', args);
        return {
          content: [{ 
            type: "text", 
            text: "❌ No prompt name provided. Expected format: `/prompt [name]` or provide 'command', 'prompt_name', or 'prompt' field.\n\nReceived args: " + JSON.stringify(args)
          }],
          isError: true
        };
      }
      
      // Pass context through to executePromptCommand for authentication-based prompt selection
      const result = await promptCommandHandler.executePromptCommand(command, context);

      performanceMonitor.endTiming(timingId);

      // P2: Add prompt execution nextSteps
      if (result && !result.isError && result._meta) {
        result._meta.nextSteps = [
          `✅ Prompt '${command}' executed successfully`,
          "Review the output above for results",
          "Execute again: prompt_command(promptName: '" + command + "')",
          "Or: list_prompts() to discover other prompts"
        ];
      }

      return result;
      
    } catch (error) {
      performanceMonitor.recordError('sdk_native_prompt_command', error);
      this.logger.error('prompt_command failed:', error.message);
      
      // Dec 2025 UX Assessment: Add nextSteps for error recovery guidance
      return {
        content: [{ type: "text", text: `❌ Error in prompt_command: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'prompt_command',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          error: error.message,
          nextSteps: [
            'Try: /prompt list to see available prompts',
            'Try: /prompt help for usage guide',
            'Alternative: list_prompts() for searchable prompt discovery'
          ]
        }
      };
    }
  }
}

module.exports = { SDKNativeBasicTools };
