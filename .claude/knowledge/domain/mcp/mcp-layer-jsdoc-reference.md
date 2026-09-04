# MCP Layer JSDoc API Reference

**Type**: Domain Knowledge - MCP Layer Public API Documentation
**Purpose**: Complete reference of all JSDoc-documented APIs in the MCP layer
**Created**: December 15, 2025 (Phase 3.5 Task 3)
**Coverage**: 100% of public APIs (93 methods across 49 files) 🎯
**Last Updated**: December 18, 2025 (100% Coverage Milestone Achieved)

---

## 📚 What This Document Covers

**This is domain knowledge about documented MCP APIs**:
- All public classes with JSDoc
- All public methods with complete parameter documentation
- Return value structures
- Usage examples
- Error conditions

**Use This When**:
- Looking up MCP API signatures
- Understanding what parameters a method accepts
- Finding usage examples for MCP tools
- Onboarding new developers to MCP layer
- Checking return value structures

---

## 🎯 Coverage Summary

| Category | Files | APIs Documented | Coverage |
|----------|-------|----------------|----------|
| **Core Server** | 1 | 5 | 100% |
| **Basic Tools** | 1 | 6 | 100% |
| **Advanced Tools** | 1 + 8 modules | 22 | 100% |
| **Hub Tools** | 1 + 11 modules | 23 | 100% |
| **Task Actions** | 1 + 19 modules | 19 | 100% |
| **Browser Automation** | 1 | 4 | 100% |
| **ChatGPT Connector** | 1 | 2 | 100% 🎯 NEW |
| **Prompt Commands** | 1 | 1 | 100% 🎯 NEW |
| **Security Utilities** | 1 | 1 | 100% 🎯 NEW |
| **Support Files** | 3 | 10 | 100% |
| **Total** | 49 files | 93 APIs | 100% 🎉 |

---

## 📖 Core Server APIs (mcp-server-v5.js)

### Module Documentation
```javascript
/**
 * MCP Server v5 - Pure SDK-Native Implementation with Full Intelligence
 *
 * @module mcp-server-v5
 * @version 5.0.0
 * @description Pure SDK implementation featuring:
 *   - Full MCP protocol compliance (tools, resources, prompts)
 *   - Database integration with global Prisma singleton
 *   - Smart error recovery and validation
 *   - Context-aware parameter intelligence
 *   - Performance monitoring and health checks
 *   - OAuth authentication support (GitHub, Microsoft, Google)
 *   - Execution streaming for progress visibility
 */
```

### Class: PureSDKNativeServer

**1. Constructor**
```javascript
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
constructor()
```

**2. start()**
```javascript
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
 * @throws {Error} If initialization fails (auth, prompts, tools, or transport)
 */
async start()
```

**3. setUserContext(context)**
```javascript
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
 */
setUserContext(context)
```

**4. getInitializationHealth()**
```javascript
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
 * @returns {number} returns.summary.completionPercentage - Completion percentage
 *
 * @description Provides detailed initialization health status for monitoring and debugging.
 *   Tracks 6 initialization steps: constructor, core handlers, database resources,
 *   auth context, prompt registry, and transport.
 */
getInitializationHealth()
```

---

## 🔧 Basic Tools APIs

### Class: SDKNativeBasicTools (sdk-native-basic-tools.js)

**File**: `/lib/mcp/server/tools/sdk-native-basic-tools.js` (901 lines)

**Class Documentation**:
```javascript
/**
 * SDK-Native Basic Tools Handler
 *
 * @class SDKNativeBasicTools
 * @description Pure SDK implementation without wrapper dependencies. Includes:
 *   - POV listing with geographical and status filtering
 *   - Task listing with fuzzy search and hierarchical display
 *   - POV details with context enrichment and fallback handling
 *   - Agent template listing and details (Phase 5a)
 *   - Prompt command execution for Claude Desktop
 */
```

**1. constructor(server, sharedNormalizer)**
```javascript
/**
 * Creates SDK-Native Basic Tools handler
 *
 * @param {Object} [server=null] - MCP SDK server instance (optional for standalone use)
 * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Optional shared parameter normalizer
 * @description Initializes tool handlers (6 tools), parameter normalizer, and logger.
 *   Registers: project(action: "pov.list"), project(action: "task.list"), project(action: "pov.details"), template(action: "list"),
 *   template(action: "details"), prompt_command.
 */
```

**2. handleListPOVs(args, context)**
```javascript
/**
 * Handle project(action: "pov.list") tool - Lists POVs with geographical and status filtering
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.status] - POV status filter
 * @param {string} [args.customer_name] - Customer name filter
 * @param {string} [args.owner_name] - Owner name filter
 * @param {string} [args.country_name] - Country name filter
 * @param {string} [args.region_name] - Region name filter
 * @param {string} [args.theatre_name] - Sales theatre filter
 * @param {number} [args.limit=100] - Maximum POVs to return
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with POV list
 * @description Retrieves POVs with geographical filtering. Updates session context
 *   with first POV for parameter intelligence. Includes pagination metadata.
 */
```

**3. handleListTasks(args, context)**
```javascript
/**
 * Handle project(action: "task.list") tool - Lists tasks with fuzzy search and hierarchical display
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.povId] - POV CUID filter
 * @param {string} [args.pov_name] - POV name for fuzzy search
 * @param {string} [args.phaseId] - Phase CUID filter
 * @param {string} [args.phase_name] - Phase name for lookup
 * @param {string} [args.stageId] - Stage CUID filter
 * @param {string} [args.stage_name] - Stage name for lookup
 * @param {string} [args.status] - Task status filter
 * @param {string} [args.assigneeId] - Assignee user CUID filter
 * @param {string} [args.assignee_name] - Assignee name for lookup
 * @param {string} [args.teamId] - Team CUID filter
 * @param {string} [args.team_name] - Team name for lookup
 * @param {string} [args.priority] - Priority filter
 * @param {number} [args.limit=100] - Maximum tasks to return
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with task list
 * @description Retrieves tasks with fuzzy search support. Automatically includes
 *   phase and stage data for hierarchical display when filtering by POV.
 */
```

**4. handleGetPOVDetails(args, context)**
```javascript
/**
 * Handle project(action: "pov.details") tool - Retrieves comprehensive POV details
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.povId] - POV CUID (exact lookup)
 * @param {string} [args.pov_title] - POV title for fuzzy search
 * @param {string} [args.pov_name] - POV name for fuzzy search
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with POV details
 * @description Retrieves comprehensive POV details with team, phases, stages, tasks.
 *   Supports fuzzy search with intelligent fallbacks and scored suggestions.
 *   Updates session context for parameter intelligence.
 */
```

**5. handleListAgentTemplates(args, context)**
```javascript
/**
 * Handle template(action: "list") tool - Lists agent templates (Phase 5a)
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.agent_template_name] - Template name filter
 * @param {string} [args.agent_category] - Category filter
 * @param {string} [args.status] - Status filter
 * @param {number} [args.limit=50] - Maximum templates to return
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with agent template list
 * @description Retrieves agent templates with category filtering. Updates session
 *   context for parameter intelligence.
 */
```

**6. handleGetAgentTemplateDetails(args, context)**
```javascript
/**
 * Handle template(action: "details") tool - Retrieves template details (Phase 5a)
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.templateId] - Template CUID
 * @param {string} [args.agent_template_name] - Template name for fuzzy search
 * @param {string} [args.agent_category] - Category to find first template
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with template details
 * @description Retrieves comprehensive template details including configuration,
 *   capabilities, performance metrics. Supports fuzzy search and parameter intelligence.
 */
```

**7. handlePromptCommand(args, context)**
```javascript
/**
 * Handle prompt_command tool - Executes prompt commands for Claude Desktop
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.command] - Prompt command name
 * @param {string} [args.prompt_name] - Alternative field
 * @param {string} [args.prompt] - Alternative field
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with prompt execution result
 * @description Executes prompt commands with authentication-aware prompt selection.
 *   Handles multiple field name variations for Claude Desktop compatibility.
 */
```

---

## 🎯 ChatGPT Connector APIs

### Class: ChatGPTConnectorHandler (chatgpt-connector-handler.js)

**File**: `/lib/mcp/server/tools/chatgpt-connector-handler.js` (770 lines)

**Class Documentation**:
```javascript
/**
 * ChatGPT Connector Handler
 *
 * Implements OpenAI MCP connector specification for ChatGPT integration with pAIchart.
 * Provides search and fetch tools with PostgreSQL full-text search optimization.
 *
 * @class ChatGPTConnectorHandler
 * @version 1.0.0
 * @description Core features:
 *   - Search across POVs, tasks, executions, and agent templates
 *   - PostgreSQL GIN indices for 10-50x performance improvement
 *   - Direct JSON response format per OpenAI MCP specification
 *   - Parallel searches with Promise.all optimization
 *   - Resource fetch with robust ID parsing and validation
 *   - Transaction isolation for consistency
 *   - Global Prisma singleton for connection pooling
 */
```

**1. constructor(prisma)**
```javascript
/**
 * Creates ChatGPT Connector Handler
 *
 * @param {Object} [prisma=null] - Prisma client (uses global singleton if not provided)
 *
 * @description Dependency injection pattern - accepts Prisma client or falls back to
 *   global singleton. Never creates new Prisma instances to prevent connection pool exhaustion.
 */
```

**2. handleSearch(args, context)**
```javascript
/**
 * Handle search tool - Search across POVs, tasks, executions, templates
 *
 * @param {Object} args - Search arguments
 * @param {string} args.query - Search query string (case-insensitive)
 * @param {Object} [context] - User authentication context (optional)
 *
 * @returns {Promise<Object>} MCP response with search results
 * @description Searches across 4 resource types in parallel using PostgreSQL GIN indices.
 *   Returns direct JSON format per OpenAI MCP specification: {results: [...]}.
 *
 *   Search Coverage:
 *   - POVs: title, description, objective (20 results max)
 *   - Tasks: title, description (25 results max)
 *   - Agent Executions: via task title (15 results max)
 *   - Agent Templates: name, description (10 results max)
 *
 * @performance
 *   - PostgreSQL GIN indices: 10-50x faster than LIKE queries
 *   - Parallel searches: 4 queries via Promise.all (not sequential)
 *   - Transaction isolation: ReadCommitted (5s maxWait, 10s timeout)
 */
```

**3. handleFetch(args, context)**
```javascript
/**
 * Handle fetch tool - Fetch detailed resource by ID
 *
 * @param {Object} args - Fetch arguments
 * @param {string} args.id - Resource ID with format: type-id (e.g., "pov-clxy123")
 * @param {Object} [context] - User authentication context (optional)
 *
 * @returns {Promise<Object>} MCP response with resource details
 * @description Fetches comprehensive resource details by ID with robust validation.
 *   Returns direct object format per OpenAI MCP specification (not wrapped).
 *
 *   Supported ID Formats:
 *   - POV: "pov-{cuid}" → Full POV with phases, stages, task samples
 *   - Task: "task-{cuid}" → Task with execution history and artifacts
 *   - Execution: "execution-{cuid}" → Execution with logs and artifacts
 *   - Template: "template-{cuid}" → Agent template with usage stats
 *
 * @security
 *   - ID validation: Regex pattern /^(pov|task|execution|template)-(.+)$/
 *   - Content size limits: 50KB max per resource (truncated if exceeded)
 *   - Authentication-aware (context optional for public resources)
 */
```

---

## 📝 Prompt Command APIs

### Class: PromptCommandHandler (prompt-command-handler.js)

**File**: `/lib/mcp/server/tools/prompt-command-handler.js` (265 lines)

**Class Documentation**:
```javascript
/**
 * Prompt Command Handler for MCP
 *
 * Enables /prompt command execution in Claude Desktop through natural language processing.
 * Makes MCP prompts accessible via tool responses for enhanced AI workflow integration.
 *
 * @class PromptCommandHandler
 * @version 1.0.0
 * @description Core features:
 *   - /prompt command parsing and execution
 *   - Natural language argument processing (key=value pairs)
 *   - Authentication-aware prompt selection
 *   - Built-in and database prompt support
 *   - Command suggestions on typos
 *   - List and help commands
 *   - Graceful error handling
 */
```

**1. constructor(promptRegistry)**
```javascript
/**
 * Creates Prompt Command Handler
 *
 * @param {PromptRegistry} promptRegistry - Prompt registry instance for prompt lookup
 *
 * @description Initializes command parser with regex pattern and logger.
 *   Command pattern: /^\/prompt\s+(\S+)(?:\s+(.*))?$/i (case-insensitive)
 */
```

**2. handleIfPromptCommand(toolName, args, context)**
```javascript
/**
 * Integration helper - Check and handle prompt commands in tool input
 *
 * @param {string} toolName - Name of the tool being called
 * @param {Object} args - Tool arguments to check for prompt commands
 * @param {Object} [context=null] - User authentication context (optional)
 *
 * @returns {Promise<Object|null>} MCP response if prompt command detected, null otherwise
 * @description Scans tool arguments for /prompt commands and executes them.
 *   Checks common command fields: query, prompt, message, input, command.
 *   Returns null if no prompt command detected (normal tool processing continues).
 *
 * @integration Pattern for tool handlers:
 *   const promptResult = await promptHandler.handleIfPromptCommand(toolName, args, context);
 *   if (promptResult) return promptResult; // Prompt command handled
 *   // Continue with normal tool logic
 */
```

---

## 🔒 Security Utility APIs

### Module: PublicDiscoveryFilter (public-discovery-filter.js)

**File**: `/lib/mcp/server/tools/public-discovery-filter.js` (90 lines)

**Module Documentation**:
```javascript
/**
 * Public Discovery Data Filter
 *
 * Security utility for authentication-aware data filtering in MCP Hub discovery endpoints.
 * Part of Plan 8: MCP-First Security Architecture.
 *
 * @module PublicDiscoveryFilter
 * @version 1.0.0
 * @description Core security functions:
 *   - Authentication-aware service data filtering
 *   - Sensitive field exclusion for public users
 *   - Enticing discovery responses to encourage registration
 *   - Pagination metadata integration (MCP Exposure Fix)
 *   - Prompt data filtering
 */
```

**1. filterPublicServiceData(service, isAuthenticated)**
```javascript
/**
 * Filter service data based on authentication status
 *
 * @param {Object} service - Raw service data from database
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 *
 * @returns {Object} Filtered service data
 * @description Authentication-based filtering:
 *   - Authenticated: Returns full service object (no filtering)
 *   - Public: Returns limited data with enticing metadata
 *
 *   Public users DO NOT see:
 *   - endpoint (service URL)
 *   - configuration (except category)
 *   - ownerId, ownerEmail
 *   - apiKeys, authType
 *   - createdAt, updatedAt
 */
```

---

## 🤖 Browser Automation Tools APIs

### Class: SDKNativeBrowserAutomationTools (sdk-native-browser-automation-tools.js)

**File**: `/lib/mcp/server/tools/sdk-native-browser-automation-tools.js` (545 lines)

**Class Documentation**:
```javascript
/**
 * SDK-Native Browser Automation Tools Handler
 *
 * @class SDKNativeBrowserAutomationTools
 * @description Cost-optimized browser automation with on-demand process lifecycle.
 *   Eliminates $200-400/month persistent server costs. Includes:
 *   - Browser workflow template listing and details
 *   - Parameter validation against template schemas
 *   - Browser automation task creation with immediate execution option
 *   - Cost-optimized process lifecycle management
 */
```

**1. constructor(server)**
```javascript
/**
 * Creates SDK-Native Browser Automation Tools handler
 *
 * @param {Object} [server=null] - MCP SDK server instance (optional for standalone use)
 * @description Initializes tool handlers (4 tools) and logger. Registers:
 *   list_browser_templates, get_browser_template_details,
 *   validate_browser_template_parameters, create_browser_automation_task.
 */
```

**2. handleListBrowserTemplates(args, context)**
```javascript
/**
 * Handle list_browser_templates tool - Lists browser workflow templates
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.category] - Template category filter (WEB_SCRAPING, UI_INTERACTION, FORM_SUBMISSION, BROWSER_AUTOMATION)
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with browser template list
 * @description Retrieves browser workflow templates with category filtering.
 *   Updates session context for parameter intelligence. Includes pagination metadata.
 *
 *   Template Types:
 *   - WEB_SCRAPING: Web data extraction
 *   - UI_INTERACTION: User interface automation
 *   - FORM_SUBMISSION: Form filling workflows
 *   - BROWSER_AUTOMATION: General automation
 */
```

**3. handleGetBrowserTemplateDetails(args, context)**
```javascript
/**
 * Handle get_browser_template_details tool - Retrieves template configuration
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.templateId] - Template ID
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with template details
 * @description Retrieves comprehensive template details including workflow,
 *   browser, execution, and notification configuration. Full parameter schema
 *   with validation rules. Supports parameter intelligence inference.
 */
```

**4. handleValidateBrowserTemplateParameters(args, context)**
```javascript
/**
 * Handle validate_browser_template_parameters tool - Validates parameters
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.templateId - Template ID (REQUIRED)
 * @param {Object|string} args.parameters - Parameters to validate
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with validation results
 * @description Validates workflow parameters against template schema.
 *   Returns isValid, errors array, and warnings array. Automatically
 *   parses JSON string parameters.
 */
```

**5. handleCreateBrowserAutomationTask(args, context)**
```javascript
/**
 * Handle create_browser_automation_task tool - Creates browser task
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.title - Task title (REQUIRED)
 * @param {string} args.workflowType - Workflow type (REQUIRED)
 * @param {string} [args.description] - Task description
 * @param {string} [args.templateId] - Template ID
 * @param {Object|string} [args.parameters] - Template-specific parameters
 * @param {string} [args.povId] - POV ID
 * @param {string} [args.phaseId] - Phase ID
 * @param {string} [args.stageId] - Stage ID
 * @param {string} [args.priority='MEDIUM'] - Task priority
 * @param {string} [args.dueDate] - Due date
 * @param {string} [args.assigneeId] - Assignee user ID
 * @param {boolean|string} [args.executeImmediately=false] - Start immediately
 * @param {Object} [args.browserConfig] - Browser configuration override
 * @param {Object} [args.executionConfig] - Execution configuration override
 * @param {Object} [args.notificationConfig] - Notification settings override
 * @param {Object} context - User authentication context (REQUIRED)
 *
 * @returns {Promise<Object>} MCP response with task creation result
 * @description Creates browser automation task with cost-optimized on-demand
 *   browser process. Validates workflow type and parameters. Supports
 *   immediate execution. Eliminates $200-400/month persistent server costs.
 *
 *   Workflow Types: web_scraping, ui_interaction, form_submission, browser_automation
 */
```

---

## 🛠️ Advanced Tools APIs

### Class: SDKNativeAdvancedTools (sdk-native-advanced-tools.js)

**File**: `/lib/mcp/server/tools/sdk-native-advanced-tools.js` (452 lines - facade)

**Class Documentation**:
```javascript
/**
 * SDK-Native Advanced Tools Handler
 *
 * @class SDKNativeAdvancedTools
 * @description Pure SDK implementation without wrapper dependencies. Includes:
 *   - Task context and action execution
 *   - Agent results and analytics
 *   - AI-powered recommendations
 *   - Team performance analysis with intelligent prompts
 */
```

**1. constructor(server, sharedNormalizer)**
```javascript
/**
 * Creates SDK-Native Advanced Tools handler
 *
 * @param {Object} [server=null] - MCP SDK server instance (optional for standalone use)
 * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Optional shared parameter normalizer
 * @description Initializes tool handlers, analytics modules, and parameter normalization.
 *   If server not provided, tools can still be used in standalone mode (e.g., for analytics).
 */
```

**2. handleGetTaskContext(args, context)**
```javascript
/**
 * Handle project(action: "task.context") tool - Retrieves comprehensive task context
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.taskId] - Task CUID (optional if task_name provided)
 * @param {string} [args.task_name] - Task name for lookup (optional if taskId provided)
 * @param {string} [args.povId] - POV CUID to scope search (optional)
 * @param {Object} context - User authentication context
 * @param {Object} [context.user] - Authenticated user object
 * @param {string} [context.user.id] - User ID
 *
 * @returns {Promise<Object>} MCP response with task context
 * @returns {Array<Object>} returns.content - Response content array
 * @returns {boolean} returns.isError - Whether response is an error
 * @returns {Object} returns._meta - Metadata (tool name, timestamp)
 *
 * @description Fetches task details including description, status, assignees, dependencies,
 *   and execution history. Enriches with execution data when available.
 */
```

**3. handleExecuteTaskAction(args, context)**
```javascript
/**
 * Handle perform(action: "execute") tool - Executes actions on tasks
 *
 * @param {Object} args - Tool arguments
 * @param {string} args.taskId - Task CUID to act upon
 * @param {string} args.action - Action to execute (update_status, assign, add_dependency, etc.)
 * @param {Object} [args.parameters] - Action-specific parameters
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with action result
 * @returns {Array<Object>} returns.content - Response content with action confirmation
 * @returns {boolean} returns.isError - Whether action failed
 *
 * @description Executes various task actions via API client. Enriches results with
 *   resource context when available. Supports smart error recovery.
 */
```

**4. handleAgentResults(args, context)**
```javascript
/**
 * Handle perform(action: "agent_results") tool - Retrieves agent execution results
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.executionId] - Specific execution CUID
 * @param {string} [args.taskId] - Task CUID to get executions for
 * @param {string} [args.agentTemplate] - Filter by agent template
 * @param {number} [args.limit=10] - Maximum results to return
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with agent results
 * @returns {Array<Object>} returns.content - Formatted execution results
 * @returns {boolean} returns.isError - Whether request failed
 *
 * @description Dedicated tool for retrieving agent execution results and artifacts.
 *   Includes Phase 5 enhancements: structured output, resource links, elicitation prompts.
 */
```

**5. handleGetAIRecommendations(args, context)**
```javascript
/**
 * Handle analytics(action: "recommendations.get") tool - Generates AI-powered recommendations
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.taskId] - Task CUID to get recommendations for
 * @param {string} [args.povId] - POV CUID to scope recommendations
 * @param {string} [args.type] - Recommendation type filter (OPTIMIZATION, RISK, etc.)
 * @param {number} [args.limit=50] - Maximum number of recommendations to return
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with AI recommendations
 * @returns {Array<Object>} returns.content - Formatted recommendation list
 * @returns {boolean} returns.isError - Whether request failed
 *
 * @throws {Error} If API request fails or user not authenticated
 */
```

**6. handleAnalyzeTeamPerformance(args, context)**
```javascript
/**
 * Handle analytics(action: "team.performance") tool - Analyzes team performance metrics
 *
 * @param {Object} args - Tool arguments
 * @param {string} [args.timeframe='30d'] - Analysis timeframe (7d, 30d, 90d, all)
 * @param {string} [args.povId] - POV CUID to scope analysis
 * @param {string} [args.teamId] - Team CUID to analyze
 * @param {boolean} [args.includeIndividual=false] - Include individual member stats
 * @param {boolean} [args.includeTrends=true] - Include performance trends
 * @param {Object} context - User authentication context
 *
 * @returns {Promise<Object>} MCP response with team performance analysis
 * @returns {Array<Object>} returns.content - Formatted performance metrics
 * @returns {boolean} returns.isError - Whether analysis failed
 *
 * @description Analyzes team performance with velocity, completion rate, quality scores,
 *   and trend analysis. Delegates to TeamPerformanceHandler (extracted module).
 */
```

---

## 🏢 Hub Tools APIs

### Class: HubToolsHandler (hub-tools-handler.js)

**File**: `/lib/mcp/server/tools/hub-tools-handler.js` (611 lines - facade)

**Class Documentation**:
```javascript
/**
 * MCP Hub Tools Handler
 *
 * @class HubToolsHandler
 * @version 1.0.0
 * @description Provides MCP Hub functionality including:
 *   - Service registration with Anthropic compliance checks
 *   - Service discovery with authentication-based filtering
 *   - Service health monitoring
 *   - Cross-service communication with security validation
 *   - Company trial management
 */
```

**1. constructor(prisma, sharedNormalizer, promptRegistry)**
```javascript
/**
 * Creates MCP Hub Tools Handler
 *
 * @param {Object} [prisma=null] - Prisma client instance (uses global singleton if not provided)
 * @param {SDKParameterNormalizer} [sharedNormalizer=null] - Shared parameter normalizer
 * @param {PromptRegistry} [promptRegistry=null] - Prompt registry for built-in prompts
 *
 * @description Initializes Hub Tools with dependency injection pattern.
 *   Uses global Prisma singleton to prevent connection pool exhaustion.
 *   Creates specialized handlers for all hub operations.
 */
```

**2-12. All Handler Methods** (Delegations documented):
- `handleRegisterService(args, context)` - Register new MCP service
- `handleDiscoverServices(args, context)` - Discover services by capability
- `handleGetServiceHealth(args, context)` - Get service health status
- `handleCallService(args, context)` - Call another service through hub
- `handleUpdateService(args, context)` - Update existing service
- `handleListMyServices(args, context)` - List user's services
- `handleGetHubInfo(args, context)` - Get comprehensive hub information
- `handleRequestCompanyTrial(args, context)` - Request company trial
- `handleGetTrialStatus(args, context)` - Get trial status
- `handleListPrompts(args, context)` - List available prompts

Each delegation method documented with:
- Purpose and delegation target
- Parameter requirements
- Authentication requirements (if any)

---

## 📊 Extracted Analytics Modules

### Location: `/lib/mcp/server/tools/advanced/analytics/`

**Created**: Phase 3.5 Task 2 (December 15, 2025)
**Purpose**: Modular analytics functionality extracted from monolithic file

### 1. TeamPerformanceHandler

**File**: `team-performance-handler.js` (130 lines)

```javascript
/**
 * Team Performance Analytics Handler
 *
 * @class TeamPerformanceHandler
 * @description Analyzes team performance with velocity, completion rates, quality scores.
 *   Delegates to specialized analytics modules for prompts and formatting.
 */

/**
 * @method handle(args, context)
 * @param {Object} args - Analysis arguments (timeframe, povId, teamId, etc.)
 * @param {Object} context - User authentication context
 * @returns {Promise<Object>} Formatted team performance analysis
 */
```

### 2. ElicitationPromptsGenerator

**File**: `elicitation-prompts-generator.js` (647 lines)

```javascript
/**
 * Elicitation Prompts Generator
 *
 * @class ElicitationPromptsGenerator
 * @description Generates intelligent prompts for:
 *   - Performance improvement suggestions
 *   - Category comparative analysis
 *   - Database context recommendations
 *   - Artifact-specific insights
 */

// Main Methods:
/**
 * @method generatePerformanceElicitationPrompts(executions)
 * @param {Array} executions - Agent execution history
 * @returns {Promise<Array<Object>>} Performance-based prompts
 */

/**
 * @method generateCategoryComparativePrompts(executions)
 * @param {Array} executions - Agent execution history
 * @returns {Promise<Array<Object>>} Category comparison prompts
 */

/**
 * @method generateDatabaseContextSuggestions(executions)
 * @param {Array} executions - Agent execution history
 * @returns {Promise<Array<Object>>} Context-aware suggestions
 */

/**
 * @method generateArtifactTypePrompts(artifacts)
 * @param {Array} artifacts - Artifact collection
 * @returns {Array<Object>} Artifact-specific prompts
 */
```

### 3. AnalyticsFormatters

**File**: `analytics-formatters.js` (192 lines)

```javascript
/**
 * Analytics Result Formatters
 *
 * @class AnalyticsFormatters
 * @description Formats agent results with Phase 5 enhancements:
 *   - Structured output generation
 *   - Resource link creation
 *   - Enhancement combination
 */

// Main Methods:
/**
 * @method formatPhase5AgentResults(baseText, data, options)
 * @param {string} baseText - Base response text
 * @param {Object} data - Agent execution data
 * @param {Object} options - Formatting options
 * @returns {string} Enhanced formatted result
 */

/**
 * @method generateStructuredOutput(data, format)
 * @param {Object} data - Data to structure
 * @param {string} format - Output format
 * @returns {Object} Structured output object
 */

/**
 * @method generateResourceLinks(data, resourceType)
 * @param {Object} data - Execution data
 * @param {string} resourceType - Type of resources to link
 * @returns {Array<Object>} Resource link array
 */

/**
 * @method combinePhase5Enhancements(baseText, enhancements)
 * @param {string} baseText - Original response
 * @param {Object} enhancements - Enhancement objects
 * @returns {string} Combined enhanced response
 */
```

### 4. AnalyticsHelpers

**File**: `analytics-helpers.js` (141 lines)

```javascript
/**
 * Analytics Utility Functions
 *
 * @class AnalyticsHelpers
 * @description Utility methods for analytics operations
 */

/**
 * @method convertTimeframeToDays(timeframe)
 * @param {string} timeframe - Timeframe string (7d, 30d, 90d, 1y)
 * @returns {number} Number of days
 */

/**
 * @method createEnhancedErrorMessage(error, recovery, toolName)
 * @param {Error} error - Original error
 * @param {Object} recovery - Smart error recovery suggestions
 * @param {string} toolName - Name of tool that errored
 * @returns {string} Enhanced, user-friendly error message
 */

/**
 * @method getToolSpecificGuidance(toolName)
 * @param {string} toolName - Name of the tool
 * @returns {string} Tool-specific usage guidance
 */
```

---

## 🔧 Extracted Advanced Tool Handlers

### Location: `/lib/mcp/server/tools/advanced/`

### 1. TaskContextHandler

**File**: `task-context-handler.js` (233 lines)

```javascript
/**
 * Task Context Handler
 *
 * @class TaskContextHandler
 * @description Handles project(action: "task.context") tool for retrieving comprehensive task information
 *
 * @method handle(args, context)
 * @param {Object} args - Tool arguments (taskId or task_name, optional povId)
 * @param {Object} context - User authentication context
 * @returns {Promise<Object>} Task context with enriched execution data
 */
```

### 2. TaskActionHandler

**File**: `task-action-handler.js` (311 lines)

```javascript
/**
 * Task Action Handler
 *
 * @class TaskActionHandler
 * @description Handles perform(action: "execute") tool for performing task operations
 *
 * @method handle(args, context)
 * @param {Object} args - Action arguments (taskId, action, parameters)
 * @param {Object} context - User authentication context
 * @returns {Promise<Object>} Action result with resource context enrichment
 */
```

### 3. AgentResultsHandler

**File**: `agent-results-handler.js` (471 lines)

```javascript
/**
 * Agent Results Handler
 *
 * @class AgentResultsHandler
 * @description Handles perform(action: "agent_results") tool for retrieving agent execution results
 *
 * @method handle(args, context)
 * @param {Object} args - Query arguments (executionId, taskId, agentTemplate, limit)
 * @param {Object} context - User authentication context
 * @returns {Promise<Object>} Agent execution results with Phase 5 enhancements
 */
```

### 4. AIRecommendationsHandler

**File**: `ai-recommendations-handler.js` (144 lines)

```javascript
/**
 * AI Recommendations Handler
 *
 * @class AIRecommendationsHandler
 * @description Handles analytics(action: "recommendations.get") tool for generating AI-powered insights
 *
 * @method handle(args, context)
 * @param {Object} args - Recommendation query (taskId, povId, type, impact, limit)
 * @param {Object} context - User authentication context
 * @returns {Promise<Object>} AI-generated recommendations
 */
```

---

## 🌐 Extracted Hub Tool Handlers

### Location: `/lib/mcp/server/tools/hub/`

### 1. ServiceRegistrationHandler

**File**: `service-registration-handler.js` (293 lines)

```javascript
/**
 * Service Registration Handler
 *
 * @class ServiceRegistrationHandler
 * @description Handles service registration with validation, permissions, and compliance
 *
 * @method handle(args, context)
 * @param {Object} args - Service registration arguments
 * @param {string} args.name - Service name (must be unique)
 * @param {string} args.description - Service description
 * @param {string} args.endpoint - Service endpoint URL
 * @param {Array<string>} [args.capabilities] - Service capabilities
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Registration result with serviceId
 * @throws {Error} If authentication missing, validation fails, or name exists
 */
```

### 2. ServiceDiscoveryHandler

**File**: `service-discovery-handler.js` (211 lines)

```javascript
/**
 * Service Discovery Handler
 *
 * @class ServiceDiscoveryHandler
 * @description Handles service discovery by capability, category, or criteria
 *
 * @method handle(args, context)
 * @param {Object} args - Discovery criteria
 * @param {string} [args.capability] - Capability to search for
 * @param {string} [args.category] - Service category filter
 * @param {string} [args.status='ACTIVE'] - Service status filter
 * @param {Object} [context] - Optional user context
 * @returns {Promise<Object>} Discovery results with services and metadata
 */
```

### 3. ServiceHealthHandler

**File**: `service-health-handler.js` (264 lines)

```javascript
/**
 * Service Health Handler
 *
 * @class ServiceHealthHandler
 * @description Handles service health checks with real-time endpoint pings (Phase 2 Priority 2)
 *
 * @method handle(args, context)
 * @param {Object} args - Health check arguments
 * @param {string} [args.serviceId] - Service CUID
 * @param {string} [args.service_name] - Service name for lookup
 * @param {boolean} [args.includeDiagnostics=false] - Include detailed diagnostics
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Health status with realtime ping results
 *
 * @description Performs real-time HTTP health ping with:
 *   - Actual endpoint ping (5-second timeout)
 *   - Real latency measurement
 *   - HTTP status code capture
 *   - Combined stored metrics + realtime check
 */
```

### 4. ServiceCallHandler

**File**: `service-call-handler.js` (339 lines)

```javascript
/**
 * Service Call Handler
 *
 * @class ServiceCallHandler
 * @description Handles cross-service communication with real MCP client (Phase 2 Priority 1)
 *
 * @method handle(args, context)
 * @param {Object} args - Service call arguments
 * @param {string} args.targetService - Target service ID or name
 * @param {string} args.tool - Tool name to call on target service
 * @param {Object} [args.arguments] - Arguments to pass to tool
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Service call result
 *
 * @description Performs real MCP client connection to target service:
 *   - Creates MCP Client with SDK
 *   - Supports HTTP/HTTPS (SSE) and WebSocket transports
 *   - Connection lifecycle: connect → callTool → close
 *   - Real execution time tracking
 *   - Proper error handling with client cleanup
 */
```

### 5. ServiceUpdateHandler

**File**: `service-update-handler.js` (217 lines)

```javascript
/**
 * Service Update Handler
 *
 * @class ServiceUpdateHandler
 * @description Handles service updates with ownership validation
 *
 * @method handle(args, context)
 * @param {Object} args - Update arguments
 * @param {string} [args.serviceId] - Service CUID
 * @param {string} [args.service_name] - Service name for lookup
 * @param {Object} args.updates - Fields to update
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Update result
 * @throws {Error} If user not owner or lacks permission
 */
```

### 6. UserServicesHandler

**File**: `user-services-handler.js` (102 lines)

```javascript
/**
 * User Services Handler
 *
 * @class UserServicesHandler
 * @description Handles listing services owned by authenticated user
 *
 * @method handle(args, context)
 * @param {Object} args - Query arguments
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} User's services list
 */
```

### 7. ServiceDeleteHandler

**File**: `service-delete-handler.js`

```javascript
/**
 * Service Delete Handler
 *
 * @class ServiceDeleteHandler
 * @description GDPR Right to Erasure - owners can delete their own services
 *
 * @method handle(args, context)
 * @param {Object} args - Delete request arguments
 * @param {string} args.serviceId - Service ID to delete
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Deletion confirmation
 *
 * @description Uses hub-shared-middleware for auth, service resolution, ownership validation
 */
```

### 8. ServiceToolsHandler

**File**: `service-tools-handler.js`

```javascript
/**
 * Service Tools Handler
 *
 * @class ServiceToolsHandler
 * @description Discovers tool schemas and parameters for a service
 *
 * @method handle(args, context)
 * @param {Object} args - Tool discovery arguments
 * @param {string} args.serviceId - Service ID
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Service tool definitions
 */
```

### 9. WorkflowToolsHandler

**File**: `workflow-tools-handler.js`

```javascript
/**
 * Workflow Tools Handler
 *
 * @class WorkflowToolsHandler
 * @description Multi-service workflow orchestration (execute, status, cancel, list)
 *
 * @method handle(args, context)
 * @param {Object} args - Workflow arguments
 * @param {Object} context - User authentication context (REQUIRED)
 * @returns {Promise<Object>} Trial status information
 */
```

### 10. PromptListHandler

**File**: `prompt-list-handler.js` (268 lines)

```javascript
/**
 * Prompt List Handler
 *
 * @class PromptListHandler
 * @description Lists available prompts with natural language and POV context support
 *
 * @method handle(args, context)
 * @param {Object} args - Prompt query arguments
 * @param {string} [args.query] - Natural language search query
 * @param {string} [args.category] - Category filter
 * @param {string} [args.povId] - POV context for filtering
 * @param {Object} [context] - User authentication context
 * @returns {Promise<Object>} Filtered prompt list
 */
```

### 11. HubUtilities

**File**: `hub-utilities.js` (264 lines)

```javascript
/**
 * Hub Shared Utilities
 *
 * @class HubUtilities
 * @description Shared utility functions used across all hub handlers
 */

// Key Methods:
/**
 * @method checkPermission(userId, resourceType, action)
 * @param {string} userId - User CUID
 * @param {string} resourceType - Resource type (e.g., 'mcp-service')
 * @param {string} action - Action to check (e.g., 'create', 'view')
 * @returns {Promise<boolean>} Whether user has permission
 */

/**
 * @method checkServiceAccess(userId, service)
 * @param {string} userId - User CUID
 * @param {Object} service - Service object with metadata
 * @returns {Promise<boolean>} Whether user can access service
 */

/**
 * @method trackServiceInteraction(serviceId, tool, result, context)
 * @param {string} serviceId - Service CUID
 * @param {string} tool - Tool name called
 * @param {Object} result - Call result
 * @param {Object} context - User context
 * @returns {Promise<void>} Tracks interaction in database
 */
```

---

## 🎯 Task Action APIs

### Router: TasksActionRouter (tasks-action-router.ts)

**File**: `/lib/mcp/tasks/action/tasks-action-router.ts` (94 lines - facade)

**Class Documentation**:
```typescript
/**
 * Task Action Router - Facade pattern for task action handlers
 *
 * @class TasksActionRouter
 * @version 1.0.0
 * @description Delegates task action requests to specialized handlers.
 *   Extracted December 17-18, 2025 (90% reduction: 4,441 → 449 lines)
 *
 *   Supported Actions:
 *   - task.create, task.update, task.assign, task.complete, task.comment
 *   - agent.configure, agent.assign, agent.execute, agent.status, agent.results
 *   - stage.create
 *   - workflow.trigger
 *   - analytics.generate
 */
```

**Main Method**:
```typescript
/**
 * @method route(request)
 * @param {NextRequest} request - Next.js request with action in body
 * @returns {Promise<ApiResponse>} Handler result
 * @description Routes action to appropriate handler based on action type
 */
```

### API Route: POST /api/mcp/tasks/action

**File**: `/app/api/mcp/tasks/action/route.ts` (449 lines - thin API layer)

**Route Documentation**:
```typescript
/**
 * MCP Task Action API Endpoint
 *
 * @route POST /api/mcp/tasks/action
 * @description Action-oriented task operations for MCP clients (ChatGPT, Claude Desktop, Gemini)
 *
 * @param {NextRequest} request - Request with { action, parameters } in body
 * @returns {Promise<NextResponse>} Action result
 *
 * @extracted 2025-12-17/18 - Facade extraction pattern (90% reduction)
 * @delegates TasksActionRouter for all action handling
 */
```

---

## 📋 Extracted Task Action Handlers

### Location: `/lib/mcp/tasks/action/handlers/`

**Created**: December 17-18, 2025 (Facade extraction sprint)
**Pattern**: facade-handler-extraction-pattern.md (98% confidence)
**Result**: 4,441 → 449 lines (90% reduction), 19 focused modules

### Task Domain Handlers (5 modules)

#### 1. TaskCreateHandler

**File**: `task/task-create-handler.ts` (484 lines)

```typescript
/**
 * Task Creation Handler for MCP Tasks Action API
 *
 * @class TaskCreateHandler
 * @description Comprehensive task creation with POV team inheritance, smart phase/stage
 *   resolution, duplicate prevention, and intelligent ordering.
 *
 * @method handleTaskCreate(parameters, user, actionId)
 * @param {Object} parameters - Task creation parameters
 * @param {string} parameters.title - Task title (REQUIRED)
 * @param {string} parameters.povId - POV ID (REQUIRED)
 * @param {string} [parameters.description] - Task description
 * @param {string} [parameters.phaseId] - Phase ID
 * @param {string} [parameters.phaseName] - Phase name for lookup
 * @param {string} [parameters.stageName] - Stage name for resolution
 * @param {string} [parameters.priority] - Task priority (HIGH/MEDIUM/LOW)
 * @param {string} [parameters.assigneeId] - Assignee user ID
 * @param {string} [parameters.teamId] - Team ID
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Unique action tracking ID
 *
 * @returns {Promise<Object>} Task creation result with created task
 * @throws {Error} If title or povId missing
 * @throws {Error} If POV access denied
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Phase resolution: 2 queries → 1 Promise.all (50% faster)
 *   - Duplicate checks: Already parallelized during extraction
 *
 * @security POV access validation, duplicate prevention, activity logging
 */
```

#### 2. TaskUpdateHandler

**File**: `task/task-update-handler.ts` (419 lines)

```typescript
/**
 * Task Update Handler
 *
 * @class TaskUpdateHandler
 * @description Complex update logic with diff calculation, template assignment,
 *   and conditional field updates.
 *
 * @method handleTaskUpdate(parameters, user, actionId)
 * @param {Object} parameters - Update parameters
 * @param {string} [parameters.taskId] - Task ID
 * @param {string} [parameters.taskName] - Task name for lookup
 * @param {Object} [parameters.updates] - Fields to update
 * @param {string} [parameters.agentTemplateId] - Template ID to assign
 * @param {string} [parameters.agentTemplateName] - Template name for lookup
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Update result with task diff
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Template lookups: 2 queries → 1 Promise.all (50% faster)
 */
```

#### 3. TaskAssignHandler

**File**: `task/task-assign-handler.ts` (270 lines)

```typescript
/**
 * Task Assignment Handler
 *
 * @class TaskAssignHandler
 * @description Task assignment with intelligent user/team lookup and POV validation
 *
 * @method handleTaskAssign(parameters, user, actionId)
 * @param {Object} parameters - Assignment parameters
 * @param {string} [parameters.taskId] - Task ID
 * @param {string} [parameters.taskTitle] - Task title for lookup
 * @param {string} [parameters.assigneeId] - User ID to assign
 * @param {string} [parameters.assignee] - User name/email for lookup
 * @param {string} [parameters.teamId] - Team ID
 * @param {string} [parameters.teamName] - Team name for lookup
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Assignment result
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - User lookups: 3 queries → 1 Promise.all (45% faster)
 *   - Team lookups: 2 queries → 1 Promise.all (50% faster)
 *   - Total improvement: 40-45% faster for assignments
 */
```

#### 4. TaskCompleteHandler

**File**: `task/task-complete-handler.ts` (98 lines)

```typescript
/**
 * Task Complete Handler
 *
 * @class TaskCompleteHandler
 * @description Simple task completion with POV validation and activity logging
 *
 * @method handleTaskComplete(parameters, user, actionId)
 * @param {Object} parameters - Completion parameters
 * @param {string} parameters.taskId - Task ID (REQUIRED)
 * @param {string} [parameters.completionNotes] - Optional completion notes
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Completion result
 */
```

#### 5. TaskCommentHandler

**File**: `task/task-comment-handler.ts` (208 lines)

```typescript
/**
 * Task Comment Handler
 *
 * @class TaskCommentHandler
 * @description Task comment creation with intelligent task lookup and text sanitization
 *
 * @method handleTaskComment(parameters, user, actionId)
 * @param {Object} parameters - Comment parameters
 * @param {string} [parameters.taskId] - Task ID
 * @param {string} [parameters.taskTitle] - Task title for fuzzy lookup
 * @param {string} parameters.comment - Comment text (REQUIRED)
 * @param {string} [parameters.povId] - POV ID for context
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Comment creation result
 * @security Comment sanitization, POV validation, atomic transaction
 */
```

### Agent Domain Handlers (5 modules)

#### 1. AgentConfigureHandler

**File**: `agent/agent-configure-handler.ts` (853 lines - largest handler)

```typescript
/**
 * Agent Configuration Handler
 *
 * @class AgentConfigureHandler
 * @description Configures agent settings including role, template, prompt, model parameters
 *
 * @method handleAgentConfigure(parameters, user, actionId)
 * @param {Object} parameters - Configuration parameters
 * @param {string} parameters.taskId - Task ID (REQUIRED)
 * @param {string} [parameters.agentRole] - Agent role
 * @param {string} [parameters.agentTemplateId] - Template ID
 * @param {string} [parameters.agentTemplateName] - Template name for lookup
 * @param {string} [parameters.prompt] - Agent prompt/instructions
 * @param {Object} [parameters.modelParameters] - Model configuration
 * @param {Array} [parameters.mcpTools] - MCP tools array
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Configuration result
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Template lookups: 2 queries → 1 Promise.all (50% faster)
 *   - MCP tool discovery: 2 queries → 1 Promise.all (50% faster)
 */
```

#### 2. AgentAssignHandler

**File**: `agent/agent-assign-handler.ts` (140 lines)

```typescript
/**
 * Agent Assignment Handler
 *
 * @class AgentAssignHandler
 * @description Assigns agent template to task with template lookup
 *
 * @method handleAgentAssign(parameters, user, actionId)
 * @param {Object} parameters - Assignment parameters
 * @param {string} parameters.taskId - Task ID (REQUIRED)
 * @param {string} [parameters.agentTemplateId] - Template ID
 * @param {string} [parameters.agentTemplateName] - Template name for lookup
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Assignment result
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Template lookups: 2 queries → 1 Promise.all (50% faster)
 */
```

#### 3. AgentExecuteHandler

**File**: `agent/agent-execute-handler.ts` (128 lines)

```typescript
/**
 * Agent Execute Handler
 *
 * @class AgentExecuteHandler
 * @description Agent execution orchestration with POV validation
 *
 * @method handleAgentExecute(parameters, user, actionId)
 * @param {Object} parameters - Execution parameters
 * @param {string} parameters.taskId - Task ID (REQUIRED)
 * @param {Object} [parameters.overrideConfig] - Override agent configuration
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Execution start result with execution ID
 */
```

#### 4. AgentStatusHandler

**File**: `agent/agent-status-handler.ts` (129 lines)

```typescript
/**
 * Agent Status Handler
 *
 * @class AgentStatusHandler
 * @description Retrieves agent execution status and summary
 *
 * @method handleAgentStatus(parameters, user, actionId)
 * @param {Object} parameters - Status query parameters
 * @param {string} [parameters.taskId] - Task ID
 * @param {string} [parameters.executionId] - Execution ID
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Execution status with summary
 */
```

#### 5. AgentResultsHandler

**File**: `agent/agent-results-handler.ts` (492 lines)

```typescript
/**
 * Agent Results Handler
 *
 * @class AgentResultsHandler
 * @description Retrieves agent execution results with artifacts and outputs
 *
 * @method handleAgentResults(parameters, user, actionId)
 * @param {Object} parameters - Results query parameters
 * @param {string} [parameters.executionId] - Specific execution ID
 * @param {string} [parameters.taskId] - Task ID for all executions
 * @param {number} [parameters.limit=10] - Maximum results
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Execution results with artifacts
 */
```

### Stage Domain Handler (1 module)

#### StageCreateHandler

**File**: `stage/stage-create-handler.ts` (372 lines)

```typescript
/**
 * Stage Creation Handler
 *
 * @class StageCreateHandler
 * @description Creates stages with phase resolution and intelligent ordering
 *
 * @method handleStageCreate(parameters, user, actionId)
 * @param {Object} parameters - Stage creation parameters
 * @param {string} [parameters.povId] - POV ID
 * @param {string} [parameters.phaseId] - Phase ID
 * @param {string} [parameters.phaseName] - Phase name for lookup
 * @param {string} parameters.name - Stage name (REQUIRED)
 * @param {string} [parameters.description] - Stage description
 * @param {number} [parameters.order] - Explicit order
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Stage creation result
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Phase lookups: 2 queries → 1 Promise.all (50% faster)
 *
 * @events Emits stage.created event for real-time updates
 */
```

### Workflow Domain Handler (1 module)

#### WorkflowTriggerHandler

**File**: `workflow/workflow-trigger-handler.ts` (202 lines)

```typescript
/**
 * Workflow Trigger Handler
 *
 * @class WorkflowTriggerHandler
 * @description Triggers MCP workflows with access validation and service integration
 *
 * @method handleWorkflowTrigger(parameters, user, actionId)
 * @param {Object} parameters - Workflow parameters
 * @param {string} parameters.workflowType - Workflow type (REQUIRED)
 * @param {string} [parameters.targetId] - Target task/POV ID
 * @param {Object} [parameters.workflowConfig] - Workflow configuration
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Workflow trigger result
 *
 * @fallback Returns fallback result when MCP service unavailable
 */
```

### Analytics Domain Handler (1 module)

#### AnalyticsGenerateHandler

**File**: `analytics/analytics-generate-handler.ts` (138 lines)

```typescript
/**
 * Analytics Generate Handler
 *
 * @class AnalyticsGenerateHandler
 * @description Generates analytics with POV access validation
 *
 * @method handleAnalyticsGenerate(parameters, user, actionId)
 * @param {Object} parameters - Analytics parameters
 * @param {string} parameters.analyticsType - Type (performance/insights/agent_execution_status/summary)
 * @param {Object} [parameters.filters] - Filtering criteria
 * @param {string} [parameters.filters.povId] - Filter by POV
 * @param {string} [parameters.format='json'] - Output format
 * @param {TokenPayload} user - Authenticated user
 * @param {string} actionId - Action tracking ID
 *
 * @returns {Promise<Object>} Generated analytics
 *
 * @security Multi-tenant POV access validation, DEMO_USER additive access pattern
 */
```

### Utilities (4 modules)

#### 1. task-diff.ts

**File**: `utilities/task-diff.ts` (44 lines)

```typescript
/**
 * Task Diff Utility
 *
 * @function computeTaskDiff(before, after, fields)
 * @param {Object} before - Previous task state
 * @param {Object} after - New task state
 * @param {Array<string>} fields - Fields to compare
 * @returns {Array<Object>} Changed fields with from/to values
 * @description Compares task states for activity logging
 */
```

#### 2. order-utils.ts

**File**: `utilities/order-utils.ts` (48 lines)

```typescript
/**
 * Order Utility Functions
 *
 * @function getNextStageOrder(phaseId)
 * @param {string} phaseId - Phase ID
 * @returns {Promise<number>} Next order number
 *
 * @function getNextTaskOrder(stageId)
 * @param {string} stageId - Stage ID
 * @returns {Promise<number>} Next order number (1000 increment pattern)
 */
```

#### 3. stage-resolver.ts

**File**: `utilities/stage-resolver.ts` (268 lines)

```typescript
/**
 * Stage Resolution Utility
 *
 * @function resolveStageForTask(params)
 * @param {Object} params - Resolution parameters
 * @param {string} [params.stageId] - Direct stage ID
 * @param {string} [params.stageName] - Stage name for lookup
 * @param {string} [params.phaseId] - Phase ID
 * @param {string} [params.phaseName] - Phase name
 * @param {string} [params.povId] - POV ID
 * @param {string} [params.title] - Task title (for stage creation)
 * @returns {Promise<Object>} Resolved stageId and phaseId
 * @throws {Error} If stage cannot be resolved
 *
 * @description 7-priority fallback strategy for stage resolution:
 *   1. Direct stageId lookup
 *   2. stageName + phaseId
 *   3. stageName + phaseName + povId
 *   4. Auto-detect stageName in POV (with partial match)
 *   5. Create new stage if stageName provided
 *   6. Fallback to planning phase stage
 *   7. Create default stage in planning phase
 */
```

#### 4. mcp-logging.ts

**File**: `utilities/mcp-logging.ts` (105 lines)

```typescript
/**
 * MCP Logging Utility
 *
 * @function logMCPInteraction(actionId, action, parameters, result, userId)
 * @param {string} actionId - Unique interaction ID
 * @param {string} action - Action type (task.create, agent.execute, etc.)
 * @param {Object} parameters - Action parameters
 * @param {Object} result - Action result
 * @param {string} userId - User ID
 * @returns {Promise<void>} Logs interaction asynchronously
 *
 * @description Maps action strings to MCPAction enum, ensures MCPTool exists,
 *   creates MCPInteraction records for analytics
 */
```

---

## 📁 Module Organization

### Directory Structure

```
lib/mcp/server/tools/
├── sdk-native-basic-tools.js             (901 lines) ✅ Documented (Dec 18)
├── sdk-native-advanced-tools.js          (452 lines) ✅ Facade (Dec 15)
├── sdk-native-browser-automation-tools.js (545 lines) ✅ Documented (Dec 18)
├── hub-tools-handler.js                  (611 lines) ✅ Facade (Dec 15)
│
├── advanced/                              (8 modules - Dec 15)
│   ├── analytics/
│   │   ├── elicitation-prompts-generator.js    (647 lines)
│   │   ├── analytics-formatters.js              (192 lines)
│   │   ├── analytics-helpers.js                 (141 lines)
│   │   └── team-performance-handler.js          (130 lines)
│   ├── ai-recommendations-handler.js           (144 lines)
│   ├── agent-results-handler.js                (471 lines)
│   ├── task-action-handler.js                  (311 lines)
│   └── task-context-handler.js                 (233 lines)
│
└── hub/                                   (10 handlers + 4 shared - Feb 2026)
    ├── service-registration-handler.js
    ├── service-discovery-handler.js
    ├── service-health-handler.js
    ├── service-call-handler.js
    ├── service-update-handler.js
    ├── service-delete-handler.js
    ├── user-services-handler.js
    ├── service-tools-handler.js
    ├── prompt-list-handler.js
    ├── workflow-tools-handler.js
    ├── hub-shared-middleware.js          (Feb 2026 - auth, resolution, ownership, cache)
    ├── hub-utilities.js
    ├── hub-audit-service.js
    └── error-helpers.js

app/api/mcp/tasks/action/
├── route.ts                               (449 lines) ✅ API facade (Dec 17-18)
│
lib/mcp/tasks/action/
├── tasks-action-router.ts                 (94 lines) ✅ Router facade (Dec 17-18)
│
├── handlers/                              (15 modules - Dec 17-18)
│   ├── task/
│   │   ├── task-create-handler.ts              (484 lines) ⭐ Optimized
│   │   ├── task-update-handler.ts              (419 lines) ⭐ Optimized
│   │   ├── task-assign-handler.ts              (270 lines) ⭐ Optimized
│   │   ├── task-complete-handler.ts            (98 lines)
│   │   └── task-comment-handler.ts             (208 lines)
│   ├── agent/
│   │   ├── agent-configure-handler.ts          (853 lines - largest) ⭐ Optimized
│   │   ├── agent-assign-handler.ts             (140 lines) ⭐ Optimized
│   │   ├── agent-execute-handler.ts            (128 lines)
│   │   ├── agent-status-handler.ts             (129 lines)
│   │   └── agent-results-handler.ts            (492 lines)
│   ├── stage/
│   │   └── stage-create-handler.ts             (372 lines) ⭐ Optimized
│   ├── workflow/
│   │   └── workflow-trigger-handler.ts         (202 lines)
│   └── analytics/
│       └── analytics-generate-handler.ts       (138 lines)
│
└── utilities/                             (4 modules - Dec 17-18)
    ├── task-diff.ts                            (44 lines)
    ├── order-utils.ts                          (48 lines)
    ├── stage-resolver.ts                       (268 lines)
    └── mcp-logging.ts                          (105 lines)
```

**Total**: 40 modular handler files
- Basic tools: 1 file - 6 handlers (Dec 18, 2025) ⭐ NEW
- Advanced tools: 8 modules (Dec 15, 2025)
- Hub tools: 11 modules (Dec 15, 2025)
- Task actions: 19 modules (Dec 17-18, 2025)
  - 15 handlers + 4 utilities
  - 6 handlers with Phase 3 query optimizations ⭐
- Browser automation: 1 file - 4 handlers (Dec 18, 2025) ⭐ NEW

---

## 🎯 JSDoc Quality Standards

### All Documentation Includes:

**1. Class-Level Documentation**:
- Purpose and responsibility
- Key features
- Version/creation information

**2. Method Documentation**:
- Complete parameter list with types
- Optional vs required parameters
- Return value structure
- Error conditions (@throws)
- Usage examples (@example)
- Description of behavior

**3. Consistent Format**:
```javascript
/**
 * Brief description
 *
 * @param {Type} paramName - Description
 * @param {Object} complexParam - Object description
 * @param {string} complexParam.field - Field description
 * @param {string} [complexParam.optional] - Optional field
 *
 * @returns {Promise<Type>} Return description
 * @returns {SubType} returns.field - Specific field
 *
 * @description Detailed behavior explanation
 *
 * @example
 * const result = await method(args, context);
 *
 * @throws {ErrorType} Error condition
 */
```

---

## 📊 Coverage Statistics

### By Category

**Core Infrastructure**: 100%
- MCP Server class and lifecycle methods
- Initialization and health tracking

**Advanced Tools**: 100%
- All 5 tool handlers
- All 4 analytics modules
- All extracted handlers

**Hub Tools**: 100%
- All 10+ tool handlers
- All extracted hub handlers
- Hub utilities

**Overall**: **95%+** (exceeded 80% target)

---

## 🔍 Finding Documentation

### By Tool Name

**Basic Tools**:
- `project(action: "pov.list")` → SDKNativeBasicTools.handleListPOVs
- `project(action: "task.list")` → SDKNativeBasicTools.handleListTasks
- `project(action: "pov.details")` → SDKNativeBasicTools.handleGetPOVDetails
- `template(action: "list")` → SDKNativeBasicTools.handleListAgentTemplates
- `template(action: "details")` → SDKNativeBasicTools.handleGetAgentTemplateDetails
- `prompt_command` → SDKNativeBasicTools.handlePromptCommand

**ChatGPT Connector**:
- `search` → ChatGPTConnectorHandler.handleSearch
- `fetch` → ChatGPTConnectorHandler.handleFetch

**Task Management**:
- `project(action: "task.context")` → TaskContextHandler
- `perform(action: "execute")` → TaskActionHandler

**Agent Analytics**:
- `perform(action: "agent_results")` → AgentResultsHandler
- `analytics(action: "recommendations.get")` → AIRecommendationsHandler
- `analytics(action: "team.performance")` → TeamPerformanceHandler + analytics modules

**Browser Automation**:
- `list_browser_templates` → SDKNativeBrowserAutomationTools.handleListBrowserTemplates
- `get_browser_template_details` → SDKNativeBrowserAutomationTools.handleGetBrowserTemplateDetails
- `validate_browser_template_parameters` → SDKNativeBrowserAutomationTools.handleValidateBrowserTemplateParameters
- `create_browser_automation_task` → SDKNativeBrowserAutomationTools.handleCreateBrowserAutomationTask

**MCP Hub**:
- `registry(action: "register")` → ServiceRegistrationHandler
- `services(action: "discover")` → ServiceDiscoveryHandler
- `services(action: "health")` → ServiceHealthHandler
- `services(action: "call")` → ServiceCallHandler
- `registry(action: "update")` → ServiceUpdateHandler
- `registry(action: "list")` → UserServicesHandler
- `registry(action: "delete")` → ServiceDeleteHandler
- `list_prompts` → PromptListHandler

**Task Actions** (via POST /api/mcp/tasks/action):
- `task.create` → TaskCreateHandler
- `task.update` → TaskUpdateHandler
- `task.assign` → TaskAssignHandler
- `task.complete` → TaskCompleteHandler
- `task.comment` → TaskCommentHandler
- `agent.configure` → AgentConfigureHandler
- `agent.assign` → AgentAssignHandler
- `agent.execute` → AgentExecuteHandler
- `agent.status` → AgentStatusHandler
- `agent.results` → AgentResultsHandler
- `stage.create` → StageCreateHandler
- `workflow.trigger` → WorkflowTriggerHandler
- `analytics.generate` → AnalyticsGenerateHandler

### By Use Case

**Want to understand initialization?** → `mcp-server-v5.js` PureSDKNativeServer
**Want to call a tool?** → Check handler class for that tool
**Want to understand analytics?** → analytics/ modules
**Want to understand hub operations?** → hub/ handlers
**Want to perform task actions?** → lib/mcp/tasks/action/handlers/ (by domain)
**Want to create tasks via MCP?** → TaskCreateHandler
**Want to configure agents?** → AgentConfigureHandler

---

## 🎓 Usage Examples

### Reading JSDoc

**In VS Code/IDE**:
1. Hover over any method → See full JSDoc
2. Type method name → Get IntelliSense with parameter info
3. CMD/CTRL + Click → Jump to definition with docs

**In Code**:
```javascript
// JSDoc provides inline documentation
const tools = new SDKNativeAdvancedTools(server);

// Hover shows:
// handleGetTaskContext(args, context): Promise<Object>
// - args.taskId: string (optional)
// - args.task_name: string (optional)
// - context.user: Object (optional)
// Returns: MCP response with task context
await tools.handleGetTaskContext({ taskId: 'xyz' }, context);
```

---

## 📝 Maintenance Notes

### When Adding New Tools

1. **Add JSDoc to handler method** in main file
2. **If creating new handler module**, document:
   - Class with @class
   - Constructor with @param
   - handle() method with full documentation
3. **Follow the template** in this document
4. **Include example** for complex methods

### When Modifying Existing Tools

1. **Update JSDoc** if signature changes
2. **Update examples** if behavior changes
3. **Keep @throws current** if error conditions change

---

## 🔗 Related Documentation

**Testing Architecture**:
- `/.claude/knowledge/domain/testing/validation-testing-architecture.md` - Test system

**MCP Discoveries**:
- Look for MCP-related discoveries in `/.claude/knowledge/discoveries/`

**Specialist Agents**:
- `mcp-integration-specialist` - References this JSDoc
- `architectural-review-specialist` - Uses for refactoring decisions

---

## 🎊 Achievement Metrics

**Created**: December 15, 2025 (Phase 3.5 Task 3)
**Updated**: December 18, 2025 (100% Coverage Achieved 🎉)

**JSDoc Documentation**:
- December 15: 279 lines of JSDoc (Advanced + Hub tools)
- December 18 (AM): +720 lines of JSDoc (Task Action handlers)
- December 18 (PM-1): +340 lines of JSDoc (Basic + Browser Automation tools)
- December 18 (PM-2): +280 lines of JSDoc (ChatGPT Connector + Prompt Commands + Security) 🎯 NEW
- **Total**: 1,619 lines of comprehensive JSDoc

**APIs Documented**:
- December 15: 60-70 public methods
- December 18 (AM): +19 task action APIs
- December 18 (PM-1): +10 basic/browser automation APIs
- December 18 (PM-2): +4 final APIs (2 ChatGPT connector, 1 prompt command, 1 security utility) 🎯 NEW
- **Total**: 93 public APIs (93 APIs in codebase = 100% coverage 🎉)

**Files Enhanced**:
- December 15: 24 files
- December 18 (AM): +20 files (19 handlers + 1 reference doc)
- December 18 (PM-1): +2 files (2 tool files)
- December 18 (PM-2): +3 files (3 final tool/utility files) 🎯 NEW
- **Total**: 49 files with comprehensive documentation

**Coverage**:
- Core Server: 100%
- Basic Tools: 100% (6 handlers)
- Advanced Tools: 100% (8 modules)
- Hub Tools: 100% (11 modules)
- Task Actions: 100% (19 modules)
- Browser Automation: 100% (4 handlers)
- ChatGPT Connector: 100% (2 handlers) 🎯 NEW
- Prompt Commands: 100% (1 handler) 🎯 NEW
- Security Utilities: 100% (1 utility function) 🎯 NEW
- Support Files: 100%
- **Overall**: 100% 🎉 (MILESTONE ACHIEVED - Complete coverage of all MCP layer APIs)

**Quality Achievements**:
- Professional-grade JSDoc (19+ tags per handler)
- IDE-integrated with autocomplete
- 50+ realistic usage examples (15 new examples added)
- Performance notes for optimized handlers (8 handlers including ChatGPT connector)
- Security notes for all handlers (POV validation, authentication-aware filtering)
- Cost optimization notes (browser automation: $200-400/month savings)
- Protocol compliance notes (OpenAI MCP specification for ChatGPT connector)
- Fallback/event notes where applicable
- Fuzzy search patterns documented (POV/task/template lookups)
- Parameter intelligence patterns documented
- PostgreSQL optimization notes (GIN indices: 10-50x performance)

**Extraction Success**:
- December 15: 2 facades, 19 modules (77% avg reduction)
- December 17-18: 1 facade, 19 modules (90% reduction - LARGEST file)
- **Combined**: 32/32 successful extractions (100% success rate)

**Performance Impact**:
- 8 handlers optimized with parallel queries (including ChatGPT connector)
- 19 queries parallelized (20-30% avg speedup)
- 40-50% gain on lookup-heavy handlers
- Browser automation: On-demand process lifecycle (70-80% cost savings)
- ChatGPT connector: PostgreSQL GIN indices (10-50x faster than LIKE queries)

**Coverage Progress**:
- December 15: 79 APIs (85% coverage)
- December 18 (AM): 79 APIs (85% coverage - task action documentation)
- December 18 (PM-1): 89 APIs (96% coverage - basic + browser automation)
- December 18 (PM-2): 93 APIs (100% coverage - ChatGPT connector + prompt commands + security) 🎯 MILESTONE

**Result**: Complete self-documenting MCP layer with 100% API coverage across 49 files, spanning 3 major facade extractions and 9 tool categories

---

**File Location**: `/.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md`
**Status**: Production-ready API documentation ✅
**Last Updated**: December 18, 2025
