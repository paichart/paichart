/**
 * Advanced Tools Error Helpers
 * Standardized error message generators for agent lifecycle and analytics.
 *
 * Created: Dec 2025 (Error Helper Reusability)
 * Updated: Dec 2025 (4-Emoji Format Upgrade)
 * Updated: 2026-05-22 (BUG-BASIC-XSS-1 Phase 2.2 — sanitizeForResponse wrap)
 * Pattern: Follows Hub error-helpers gold standard
 *
 * 4-Emoji Format:
 *   ❌ - Error indicator (start of error message)
 *   🔍 - Available options / what was searched
 *   💡 - Suggestions / did you mean
 *   🔧 - Recovery options / next steps
 *
 * @module advanced/error-helpers
 */

const { sanitizeForResponse } = require('../response-sanitizer');

const AGENT_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];
// Used for "did you mean" fuzzy-match suggestions in invalidActionError().
// Keep aligned with the canonical allowlist at
// lib/mcp/server/tools/advanced/task-action-handler.js:validActions. See
// BC75 §Task-Action Handler Sibling Drift for the 10-site inventory.
const TASK_ACTIONS = [
  'task.create', 'task.update', 'task.assign', 'task.complete', 'task.comment',
  'agent.assign', 'agent.configure', 'agent.execute', 'agent.status', 'agent.results',
  'stage.create', 'pov.create', 'pov.update', 'analytics.generate'
];
const RECOMMENDATION_TYPES = ['AUTOMATION', 'OPTIMIZATION', 'RISK_MITIGATION', 'WORKFLOW_IMPROVEMENT', 'RESOURCE_ALLOCATION'];

/**
 * Generate agent not assigned error
 * @param {string} taskId - Task ID that has no agent
 * @param {string} taskTitle - Task title for context
 * @returns {Error} Formatted prerequisite error
 *
 * @example
 * throw agentNotAssignedError('cm3task...', 'Setup Infrastructure');
 */
function agentNotAssignedError(taskId, taskTitle) {
  // BUG-BASIC-XSS-1 Phase 2.2: taskTitle is DB-sourced (Task.title) — sanitize
  // for historical-pollution safety (pre-Phase-2.1 input rejection).
  const safeTitle = taskTitle ? sanitizeForResponse(taskTitle) : '...';
  return new Error(
    `❌ NO AGENT ASSIGNED to task: "${safeTitle}"\n\n` +
    `🔍 Error Type: PREREQUISITE\n` +
    `Task ID: ...${taskId?.slice(-8) || 'unknown'}\n\n` +
    `🔧 Agent lifecycle:\n` +
    `  1. agent.assign - Attach template to task ← YOU ARE HERE\n` +
    `  2. agent.configure - (Optional) Customize role/prompt\n` +
    `  3. agent.execute - Run the agent\n` +
    `  4. agent.status - Monitor progress\n` +
    `  5. agent.results - Get output\n\n` +
    `🔧 Next step:\n` +
    `  perform({\n` +
    `    action: 'agent.assign',\n` +
    `    taskId: '${taskId}',\n` +
    `    agentTemplateId: '[template-id]'\n` +
    `  })\n\n` +
    `💡 Use template(action: 'list') to find available templates.`
  );
}

/**
 * Generate agent already running error
 * @param {string} taskId - Task ID
 * @param {string} status - Current agent status
 * @param {string} startedAt - When execution started
 * @returns {Error} Formatted conflict error
 *
 * @example
 * throw agentAlreadyRunningError('cm3task...', 'RUNNING', '2025-12-20T10:00:00Z');
 */
function agentAlreadyRunningError(taskId, status, startedAt) {
  return new Error(
    `❌ AGENT ALREADY ${status.toUpperCase()} for this task\n\n` +
    `🔍 Error Type: CONFLICT\n` +
    `Task ID: ...${taskId?.slice(-8) || 'unknown'}\n` +
    `Started: ${startedAt || 'unknown'}\n\n` +
    `🔧 Options:\n` +
    `  • agent.status - Check current progress\n` +
    `  • agent.results - Get output when complete\n` +
    `  • Wait for completion before re-executing\n\n` +
    `🔧 Check status:\n` +
    `  perform({ action: 'agent.status', taskId: '${taskId}' })`
  );
}

/**
 * Generate agent execution not found error
 * @param {string} taskId - Task ID
 * @param {string} executionId - Execution ID that wasn't found (optional)
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw agentExecutionNotFoundError('cm3task...', 'cm3exec...');
 */
function agentExecutionNotFoundError(taskId, executionId) {
  return new Error(
    `❌ EXECUTION NOT FOUND${executionId ? `: ...${executionId.slice(-8)}` : ''}\n\n` +
    `🔍 Error Type: NOT_FOUND\n` +
    `Task ID: ...${taskId?.slice(-8) || 'unknown'}\n\n` +
    `💡 Possible reasons:\n` +
    `  • Agent hasn't been executed yet\n` +
    `  • Execution was cleared/expired\n` +
    `  • Wrong task ID\n\n` +
    `🔧 Recovery:\n` +
    `  • project(action: 'task.context', taskId: '${taskId}', includeHistory: true) - Check execution history\n` +
    `  • agent.execute - Start a new execution`
  );
}

/**
 * Generate agent template not found error
 * @param {string} searchTerm - Template ID or name searched
 * @param {Array<Object>} suggestions - Similar templates [{name, id, category}]
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw agentTemplateNotFoundError('Developer', [
 *   { name: 'Senior Developer', id: 'cm3tpl...', category: 'DEVELOPMENT' }
 * ]);
 */
function agentTemplateNotFoundError(searchTerm, suggestions = []) {
  // BUG-BASIC-XSS-1 Phase 2.2: searchTerm + DB-sourced AgentTemplate.name +
  // category (also DB-sourced).
  const safeSearch = sanitizeForResponse(searchTerm);
  const suggestionList = suggestions.slice(0, 5).map(t =>
    `  • "${sanitizeForResponse(t.name)}" (${sanitizeForResponse(t.category)}) - ID: ...${t.id?.slice(-8) || 'unknown'}`
  ).join('\n');

  return new Error(
    `❌ AGENT TEMPLATE NOT FOUND: "${safeSearch}"\n\n` +
    `🔍 Error Type: NOT_FOUND\n\n` +
    (suggestionList
      ? `💡 Similar templates:\n${suggestionList}\n\n`
      : '🔍 No similar templates found.\n\n') +
    `🔧 Recovery:\n` +
    `  • template(action: 'list') - See all available templates\n` +
    `  • template(action: 'list', agent_category: 'DEVELOPMENT') - Filter by category\n` +
    `  • template(action: 'details', agent_template_name: 'exact name') - Use exact name`
  );
}

/**
 * Generate invalid action error with decision tree
 * @param {string} provided - Action that was provided
 * @returns {Error} Formatted action error with guidance
 *
 * @example
 * throw invalidActionError('create_task');
 */
function invalidActionError(provided) {
  // Common aliases
  const aliases = {
    'create_task': 'task.create',
    'update_task': 'task.update',
    'assign_task': 'task.assign',
    'complete_task': 'task.complete',
    'run_agent': 'agent.execute',
    'start_agent': 'agent.execute',
    'check_agent': 'agent.status',
    'get_results': 'agent.results'
  };

  const suggestion = aliases[provided?.toLowerCase()?.replace(/[^a-z_]/g, '_')];

  // BUG-BASIC-XSS-1 Phase 2.2: `provided` is exactly the rejected user input —
  // primary XSS vector. `suggestion` is internal enum match — safe.
  const safeProvided = sanitizeForResponse(provided);
  return new Error(
    `❌ INVALID ACTION: "${safeProvided}"\n\n` +
    `🔍 Error Type: VALIDATION\n\n` +
    (suggestion
      ? `💡 Did you mean: "${suggestion}"?\n\n`
      : '') +
    `💡 [WHICH ACTION DO I USE?]\n\n` +
    `CREATE something?\n` +
    `  • task.create - New task (povId required)\n` +
    `  • stage.create - New stage in phase\n` +
    `  • pov.create - New POV (ADMIN or USER; DEMO blocked)\n\n` +
    `MODIFY a task?\n` +
    `  • task.update - Change any field\n` +
    `  • task.assign - Change assignee\n` +
    `  • task.complete - Mark done\n` +
    `  • task.comment - Add comment\n\n` +
    `MODIFY a POV? (ADMIN only)\n` +
    `  • pov.update - Update top-level fields (status, team, dates, etc.)\n\n` +
    `Use AGENTS?\n` +
    `  • agent.assign - Attach template (required first)\n` +
    `  • agent.configure - Optional: customize role/prompt\n` +
    `  • agent.execute - Run agent\n` +
    `  • agent.status - Check progress\n` +
    `  • agent.results - Get output`
  );
}

/**
 * Generate recommendation type error
 * @param {string} provided - Type that was provided
 * @returns {Error} Formatted type error
 *
 * @example
 * throw invalidRecommendationTypeError('performance');
 */
function invalidRecommendationTypeError(provided) {
  const aliases = {
    'performance': 'OPTIMIZATION',
    'optimize': 'OPTIMIZATION',
    'risk': 'RISK_MITIGATION',
    'risks': 'RISK_MITIGATION',
    'automate': 'AUTOMATION',
    'auto': 'AUTOMATION',
    'workflow': 'WORKFLOW_IMPROVEMENT',
    'process': 'WORKFLOW_IMPROVEMENT',
    'resource': 'RESOURCE_ALLOCATION',
    'team': 'RESOURCE_ALLOCATION'
  };

  const suggestion = aliases[provided?.toLowerCase()];

  // BUG-BASIC-XSS-1 Phase 2.2: same pattern as invalidActionError.
  const safeProvided = sanitizeForResponse(provided);
  return new Error(
    `❌ INVALID RECOMMENDATION TYPE: "${safeProvided}"\n\n` +
    `🔍 Valid types:\n` +
    RECOMMENDATION_TYPES.map(t => `  • ${t}`).join('\n') + '\n\n' +
    (suggestion
      ? `💡 Did you mean: "${suggestion}"?\n\n`
      : '') +
    `🔧 Example:\n` +
    `  analytics({\n` +
    `    action: 'recommendations.get',\n` +
    `    povId: '[pov-id]',\n` +
    `    type: 'RISK_MITIGATION'\n` +
    `  })`
  );
}

/**
 * Generate empty recommendations response
 * @param {Object} filters - Filters that were applied
 * @returns {Object} Formatted empty response
 *
 * @example
 * return emptyRecommendationsResponse({ type: 'AUTOMATION', impact: 'CRITICAL' });
 */
function emptyRecommendationsResponse(filters = {}) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize filter values (keys are internal).
  const filterStr = Object.entries(filters)
    .map(([k, v]) => `${k}="${sanitizeForResponse(v)}"`)
    .join(', ');

  return {
    recommendations: [],
    total: 0,
    message: `🔍 No recommendations found${filterStr ? ` for: ${filterStr}` : ''}`,
    interpretation: [
      `💡 POV may be well-optimized already`,
      `💡 Filters may be too restrictive`,
      `💡 Try different recommendation type`
    ],
    suggestions: [
      `🔧 analytics(action: 'recommendations.get') - Get all types`,
      `🔧 analytics(action: 'recommendations.get', impact: "HIGH") - Focus on high-impact`,
      `🔧 analytics(action: 'team.performance') - Get team-level insights instead`
    ]
  };
}

/**
 * Generate missing POV context error for actions requiring it
 * @param {string} action - Action being attempted
 * @returns {Error} Formatted context error
 *
 * @example
 * throw missingPOVContextError('task.create');
 */
function missingPOVContextError(action) {
  return new Error(
    `❌ ACTION "${action}" REQUIRES POV CONTEXT\n\n` +
    `🔍 Error Type: VALIDATION\n\n` +
    `💡 The povId parameter is REQUIRED to:\n` +
    `  • Ensure task appears in POV lists\n` +
    `  • Apply correct access permissions\n` +
    `  • Associate with proper phase/stage\n\n` +
    `🔧 Get POV ID:\n` +
    `  1. project(action: 'pov.list') - Find your POV\n` +
    `  2. project(action: 'pov.details', pov_name: 'MyPOV') - Get full details with IDs\n` +
    `  3. Copy povId from response\n\n` +
    `🔧 Example:\n` +
    `  perform({\n` +
    `    action: '${action}',\n` +
    `    povId: 'cm3xyz...',  // ← Required\n` +
    `    title: 'New Task'\n` +
    `  })`
  );
}

module.exports = {
  agentNotAssignedError,
  agentAlreadyRunningError,
  agentExecutionNotFoundError,
  agentTemplateNotFoundError,
  invalidActionError,
  invalidRecommendationTypeError,
  emptyRecommendationsResponse,
  missingPOVContextError,
  AGENT_STATUSES,
  TASK_ACTIONS,
  RECOMMENDATION_TYPES
};
