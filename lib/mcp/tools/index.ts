/**
 * MCP Tools Index
 *
 * NOTE: The TypeScript tool implementations that were here have been removed.
 *
 * They were dead code - never actually called. The real MCP tool implementations are:
 *
 * 1. JavaScript tools in `lib/mcp/server/tools/`:
 *    - sdk-native-basic-tools.js (project tool: pov.list, task.list, pov.details, etc.)
 *    - sdk-native-advanced-tools.js (perform tool: task actions, agent results, etc.)
 *    - sdk-native-browser-automation-tools.js (browser automation)
 *
 * 2. These are used by:
 *    - Embedded MCP Server (lib/mcp/embedded-server.ts)
 *    - HTTP MCP Server (mcp-server-http-clean.js)
 *
 * 3. Task operations (create, update, etc.) go through:
 *    - perform tool -> /api/mcp/tasks/action route
 *    - Security (validatePOVAccess) is enforced in the API route
 *
 * The mcpToolRegistry is still used for tool metadata/discovery but doesn't
 * execute tools directly.
 *
 * Removed files (Dec 2025):
 * - taskManagementTool.ts
 * - taskWorkflowTools.ts
 * - advancedTaskTools.ts
 * - povAnalyticsTools.ts
 * - phaseManagementTools.ts
 */

export {};
