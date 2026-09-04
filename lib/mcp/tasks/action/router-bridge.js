/**
 * Router Bridge — JS bridge for direct handler invocation.
 *
 * Eliminates HTTP round-trip through /api/mcp/tasks/action.
 * Includes audit logging (logMCPInteraction) that the API route provides.
 *
 * IMPORTANT: This module requires TS files (tasks-action-router.ts, mcp-logging.ts)
 * and only loads in processes with ts-node registered (paichart-web / embedded server).
 * In the standalone MCP server (paichart-mcp), require() will fail and callers
 * must fall back to authenticated HTTP. This is by design — see three-tier fallback.
 *
 * Polling actions (agent.status, agent.results) are intentionally excluded from
 * interaction logging. These are internal plumbing calls that generate 10-12x noise
 * per agent.execute invocation. Only user-initiated actions are logged. (mcp-hub NB-5)
 *
 * @module RouterBridge
 */

const { TasksActionRouter } = require('./tasks-action-router');
const { logMCPInteraction } = require('./utilities/mcp-logging');
// Relative path instead of @/lib/logger to avoid implicit tsconfig-paths dependency (R1)
const { mcpLogger } = require('../../../logger');

const log = mcpLogger.child({ module: 'RouterBridge' });
const router = new TasksActionRouter();

/**
 * Route an action directly to TasksActionRouter with audit logging.
 *
 * @param {string} action - Action name (e.g., 'task.create', 'agent.execute')
 * @param {Object} parameters - Normalized action parameters
 * @param {{ userId: string, email: string, role: string }} user - TokenPayload shape
 * @param {string} actionId - Unique action identifier for tracking
 * @param {{ skipLogging?: boolean }} [options] - Skip logging for polling calls
 * @returns {Promise<Object>} Action result from handler
 */
async function routeAction(action, parameters, user, actionId, options) {
  const result = await router.route(action, parameters, user, actionId, options);

  // Audit logging (skip for polling calls to avoid actionId uniqueness conflicts)
  if (!options?.skipLogging) {
    try {
      await logMCPInteraction(actionId, action, parameters, result, user.userId);
    } catch (logErr) {
      log.warn({ err: logErr, action, actionId }, 'Failed to log MCP interaction (non-blocking)');
    }
  }

  return result;
}

module.exports = { routeAction };
