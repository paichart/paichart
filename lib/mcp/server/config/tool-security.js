/**
 * MCP Tool Security Configuration
 * Defines public vs authenticated tool boundaries
 * Part of Plan 8: MCP-First Security Architecture
 */

const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'tool-security' }));

// PUBLIC_TOOLS: tools callable with NO authentication. Intentionally EMPTY since
// Phase 3 (Jan 31, 2026) — EVERY tool requires auth, and enforceToolSecurity throws
// on a missing user. This empty allowlist is load-bearing (the pentest's central
// hypothesis + the resolveUserContext fallback safety both depend on it): an unauth
// tool call can never reach a handler. Keep it empty unless you truly intend a
// no-auth tool — and update the security-invariants gate if you do.
const PUBLIC_TOOLS = [];

// Tools requiring authentication
// After OAuth: DEMO_USER has same access as USER (register, call, workflows, etc.)
// Agent tools (templates) require ADMIN role
const AUTHENTICATED_TOOLS = [
  // === Consolidated tools (Mar 2026: 14 -> 6) ===
  'project',              // pov.list, pov.details, task.list, task.context
  'perform',              // 14 sub-actions (task/agent/pov/stage/analytics ops; pov.update added 2026-05-15)
  'analytics',            // recommendations.get, team.performance
  'services',             // discover, call, health, workflow.execute/status/cancel/list
  'registry',             // register, list, update, delete, tools

  // === Non-consolidated tools ===
  'list_prompts',
  'prompt_command',
  'search',               // ChatGPT connector
  'fetch',                // ChatGPT connector
];

// Tools requiring admin privileges
// Phase 3 Cleanup (Jan 31, 2026): Removed placeholder tools (manage_users, system_config)
const ADMIN_TOOLS = [
  'template',             // list, details (agent template management)
  // Additional authorization via action handlers (handler-level authorization):
  // - perform(action: 'pov.create') - RolePermission-TABLE governed since 2026-05-25
  //   (ed74e8ce: ADMIN+USER allowed, DEMO blocked — NOT hardcoded-ADMIN anymore)
  //   Security: lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts:284 (checkPermission)
  // - perform(action: 'pov.update') - ADMIN-only POV mutation (2026-05)
  //   Security: lib/mcp/tasks/action/handlers/pov/pov-update-handler.ts:63
];

/**
 * Tool security configuration export
 */
const TOOL_SECURITY_CONFIG = {
  PUBLIC_TOOLS,
  AUTHENTICATED_TOOLS,
  ADMIN_TOOLS,
};

/**
 * Middleware to enforce tool security
 * @param {string} toolName - Name of the tool being called
 * @param {object} context - Request context with user info
 * @returns {boolean} - Whether access is allowed
 */
function enforceToolSecurity(toolName, context) {
  // Check if tool is public
  if (PUBLIC_TOOLS.includes(toolName)) {
    log.info({ toolName }, 'Tool is public - allowing access');
    return true;
  }

  // Check if user is authenticated
  // Phase 3b: Improved auth messaging (clear onboarding guidance)
  if (!context?.user?.id) {
    log.warn({ toolName }, 'Authentication required for tool');
    throw new Error(`🔐 Authentication Required for MCP Hub Features

✨ How to Authenticate:
1. OAuth (Recommended): GitHub, Microsoft, or Google SSO
   - One-click authentication in ChatGPT/Claude Desktop settings
   - Secure, no password needed

2. API Key: Generate from https://paichart.app/settings/api-keys
   - For programmatic access
   - Full control over permissions

3. JWT Token: For advanced integrations
   - Contact support@paichart.app

Note: After authentication, you'll have DEMO_USER access with full Hub capabilities (register services, execute workflows, call services).`);
  }

  // Check if tool requires admin privileges
  if (ADMIN_TOOLS.includes(toolName)) {
    if (context.user.role !== 'ADMIN' && context.user.role !== 'SUPER_ADMIN') {
      log.warn({ toolName }, 'Admin privileges required for tool');
      throw new Error(`Admin privileges required for tool: ${toolName}`);
    }
  }

  // Tool is authenticated and user has access
  log.info({ toolName, userId: context.user.id }, 'Tool access granted');
  return true;
}

/**
 * Check if a tool is public
 * @param {string} toolName - Name of the tool
 * @returns {boolean} - Whether the tool is public
 */
function isPublicTool(toolName) {
  return PUBLIC_TOOLS.includes(toolName);
}

/**
 * Get tool security level
 * @param {string} toolName - Name of the tool
 * @returns {string} - 'public', 'authenticated', or 'admin'
 */
function getToolSecurityLevel(toolName) {
  if (PUBLIC_TOOLS.includes(toolName)) return 'public';
  if (ADMIN_TOOLS.includes(toolName)) return 'admin';
  if (AUTHENTICATED_TOOLS.includes(toolName)) return 'authenticated';
  return 'unknown';
}

/**
 * Filter tools based on user authentication and role
 * Single source of truth for tool access control
 *
 * @param {Object[]} allTools - Array of tool objects with 'name' property
 * @param {Object|null} user - User object with 'id' and 'role' properties
 * @returns {Object[]} Filtered tools the user can access
 *
 * Expected counts (Mar 2026 - post consolidation):
 * - Unauthenticated: 0 (PUBLIC_TOOLS empty - all tools require auth)
 * - Authenticated (DEMO_USER/USER): 9 (5 consolidated + 4 non-consolidated)
 * - Admin: 10 (9 authenticated + 1 admin: template)
 *
 * Note: Additional admin capabilities via action handlers:
 * - ADMIN can execute: perform(action: 'pov.create')
 * - DEMO_USER blocked by: pov-create-handler.ts role check
 */
function getToolsForUser(allTools, user) {
  const isAuthenticated = user && user.id;
  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');

  let allowedToolNames;
  if (!isAuthenticated) {
    allowedToolNames = PUBLIC_TOOLS;
  } else if (isAdmin) {
    allowedToolNames = [...PUBLIC_TOOLS, ...AUTHENTICATED_TOOLS, ...ADMIN_TOOLS];
  } else {
    allowedToolNames = [...PUBLIC_TOOLS, ...AUTHENTICATED_TOOLS];
  }

  const filteredTools = allTools.filter(tool => allowedToolNames.includes(tool.name));

  // Log filtering for debugging
  log.info({ email: user?.email || 'anonymous', role: user?.role || 'none', toolCount: filteredTools.length, totalTools: allTools.length }, 'Filtered tools for user');

  return filteredTools;
}

module.exports = {
  TOOL_SECURITY_CONFIG,
  enforceToolSecurity,
  isPublicTool,
  getToolSecurityLevel,
  getToolsForUser,
  PUBLIC_TOOLS,
  AUTHENTICATED_TOOLS,
  ADMIN_TOOLS,
};