/**
 * Basic Tools Error Helpers
 * Standardized error message generators for POV and Task operations.
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
 * @module basic/error-helpers
 */

const { sanitizeForResponse } = require('../response-sanitizer');

/**
 * Generate POV not found error with fuzzy suggestions
 * @param {string} searchTerm - What the user searched for (ID or name)
 * @param {Array<Object>} suggestions - Similar POVs found [{name, id, score}]
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw povNotFoundError('CyberDef', [
 *   { name: 'CyberDefense Pro', id: 'cm3xyz...', score: 85 }
 * ]);
 */
function povNotFoundError(searchTerm, suggestions = []) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize searchTerm + every DB-sourced name
  // (suggestion names from POV.title can carry historical XSS pollution
  // pre-Phase-2.1 L1 input rejection).
  const safeSearch = sanitizeForResponse(searchTerm);
  const suggestionList = suggestions.slice(0, 5).map(s =>
    `  • "${sanitizeForResponse(s.name)}" (${s.score}% match) - ID: ...${s.id?.slice(-8) || 'unknown'}`
  ).join('\n');

  return new Error(
    `❌ POV NOT FOUND: "${safeSearch}"\n\n` +
    (suggestionList
      ? `💡 Did you mean:\n${suggestionList}\n\n`
      : '🔍 No similar POVs found.\n\n') +
    `🔧 Recovery options:\n` +
    `  • project(action: 'pov.list') - See all accessible POVs\n` +
    `  • project(action: 'pov.list', status: 'IN_PROGRESS') - Filter by status\n` +
    `  • project(action: 'pov.details', pov_name: 'exact name') - Use exact name`
  );
}

/**
 * Generate Task not found error with context-aware suggestions
 * @param {string} searchTerm - What the user searched for (ID or name)
 * @param {string} povContext - POV name/ID for context (optional)
 * @param {Array<Object>} suggestions - Similar tasks found [{title, id, status}]
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw taskNotFoundError('Setup Infra', 'CyberDefense Pro', [
 *   { title: 'Setup Infrastructure', id: 'cm3abc...', status: 'OPEN' }
 * ]);
 */
function taskNotFoundError(searchTerm, povContext, suggestions = []) {
  // BUG-BASIC-XSS-1 Phase 2.2: 3 user-input echoes (searchTerm, povContext, DB suggestion titles).
  const safeSearch = sanitizeForResponse(searchTerm);
  const safePovContext = sanitizeForResponse(povContext);
  const suggestionList = suggestions.slice(0, 5).map(s =>
    `  • "${sanitizeForResponse(s.title)}" [${s.status}] - ID: ...${s.id?.slice(-8) || 'unknown'}`
  ).join('\n');

  const povHint = povContext ? ` in POV "${safePovContext}"` : '';

  return new Error(
    `❌ TASK NOT FOUND: "${safeSearch}"${povHint}\n\n` +
    (suggestionList
      ? `💡 Similar tasks:\n${suggestionList}\n\n`
      : '🔍 No similar tasks found.\n\n') +
    `🔧 Recovery options:\n` +
    `  • project(action: 'task.list', povId: '...') - See all tasks in POV\n` +
    `  • project(action: 'task.list', status: 'OPEN') - Filter by status\n` +
    `  • project(action: 'task.context', task_name: 'exact title') - Use exact title`
  );
}

/**
 * Generate Phase/Stage not found error
 * @param {string} type - 'Phase' or 'Stage'
 * @param {string} searchTerm - What the user searched for
 * @param {Array<string>} available - Available phases/stages in POV
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw phaseNotFoundError('Phase', 'Setup', ['Planning', 'Execution', 'Review']);
 */
function phaseNotFoundError(type, searchTerm, available = []) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize searchTerm + DB phase/stage names.
  // `type` is internal ('Phase'/'Stage'), not user input — no sanitize needed.
  const safeSearch = sanitizeForResponse(searchTerm);
  const availableList = available.slice(0, 10).map(p =>
    `  • "${sanitizeForResponse(p)}"`
  ).join('\n');

  return new Error(
    `❌ ${type.toUpperCase()} NOT FOUND: "${safeSearch}"\n\n` +
    (availableList
      ? `🔍 Available ${type.toLowerCase()}s:\n${availableList}\n\n`
      : `🔍 No ${type.toLowerCase()}s found in this POV.\n\n`) +
    `🔧 Tip: Use project(action: 'pov.details', povId: '...') to see all phases and stages.`
  );
}

/**
 * Generate Team Member not found error
 * @param {string} searchTerm - What the user searched for (name or ID)
 * @param {Array<Object>} teamMembers - Available team members [{name, id, role}]
 * @returns {Error} Formatted not found error
 *
 * @example
 * throw teamMemberNotFoundError('John', [
 *   { name: 'John Smith', id: 'cm3user...', role: 'SE' }
 * ]);
 */
function teamMemberNotFoundError(searchTerm, teamMembers = []) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize searchTerm + DB User.name values.
  const safeSearch = sanitizeForResponse(searchTerm);
  const memberList = teamMembers.slice(0, 10).map(m =>
    `  • "${sanitizeForResponse(m.name)}" (${m.role || 'member'}) - ID: ...${m.id?.slice(-8) || 'unknown'}`
  ).join('\n');

  return new Error(
    `❌ TEAM MEMBER NOT FOUND: "${safeSearch}"\n\n` +
    (memberList
      ? `🔍 Available team members:\n${memberList}\n\n`
      : '🔍 No team members found.\n\n') +
    `🔧 Tip: Use project(action: 'pov.details', povId: '...') to see the full team roster with IDs.`
  );
}

/**
 * Generate empty results response with recovery suggestions
 * @param {string} resourceType - Type of resource (POVs, tasks, etc.)
 * @param {Object} filters - Filters that were applied
 * @returns {Object} Formatted empty response with suggestions
 *
 * @example
 * return emptyResultsResponse('tasks', { status: 'BLOCKED', priority: 'HIGH' });
 */
function emptyResultsResponse(resourceType, filters = {}) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize filter VALUES (keys are internal,
  // not user input). resourceType is internal ('POVs', 'tasks', etc.).
  const filterStr = Object.entries(filters)
    .map(([k, v]) => `${k}="${sanitizeForResponse(v)}"`)
    .join(', ');

  return {
    results: [],
    total: 0,
    message: `🔍 No ${resourceType} found${filterStr ? ` matching: ${filterStr}` : ''}`,
    suggestions: [
      `💡 Try broader filters (remove status or priority)`,
      `💡 Use project(action: 'pov.list') or project(action: 'task.list') without filters first`,
      `💡 Check that you have access to the requested resources`
    ],
    recovery: [
      `🔧 Remove filters and try again`,
      `🔧 Check access: project(action: 'pov.list') to see accessible POVs`
    ],
    appliedFilters: filters
  };
}

/**
 * Generate invalid status/priority enum error
 * @param {string} field - Field name (status, priority)
 * @param {string} provided - What the user provided
 * @param {Array<string>} valid - Valid values
 * @returns {Error} Formatted enum error
 *
 * @example
 * throw invalidEnumError('status', 'pending', ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']);
 */
function invalidEnumError(field, provided, valid) {
  // Check for common aliases
  const aliases = {
    'pending': 'OPEN',
    'todo': 'OPEN',
    'done': 'COMPLETED',
    'finished': 'COMPLETED',
    'stuck': 'BLOCKED',
    'wip': 'IN_PROGRESS',
    'urgent': 'HIGH',
    'normal': 'MEDIUM',
    'low': 'LOW'
  };

  const suggestion = aliases[provided?.toLowerCase()];

  // BUG-BASIC-XSS-1 Phase 2.2: sanitize `provided` (user-supplied value that
  // failed enum validation — exactly the XSS vector). `field`, `valid`, and
  // `suggestion` are internal/enum-constrained — no sanitize needed.
  const safeProvided = sanitizeForResponse(provided);

  return new Error(
    `❌ INVALID ${field.toUpperCase()}: "${safeProvided}"\n\n` +
    `🔍 Valid values: ${valid.join(', ')}\n\n` +
    (suggestion
      ? `💡 Did you mean: ${suggestion}?\n\n`
      : '') +
    `💡 Note: Values must be UPPERCASE (e.g., "OPEN" not "open")`
  );
}

/**
 * Generate access denied error with context
 * @param {string} resourceType - Type of resource (POV, task)
 * @param {string} resourceId - ID of the resource
 * @param {string} reason - Why access was denied
 * @returns {Error} Formatted access error
 *
 * @example
 * throw accessDeniedError('POV', 'cm3xyz...', 'not a team member');
 */
function accessDeniedError(resourceType, resourceId, reason) {
  // BUG-BASIC-XSS-1 Phase 2.2: defensive sanitize on reason. resourceType is
  // internal; resourceId.slice(-8) is already 8-char cap (partial mitigation).
  // reason MAY come from caller-supplied error context — wrap for consistency.
  const safeReason = sanitizeForResponse(reason);
  return new Error(
    `❌ ACCESS DENIED to ${resourceType}: ...${resourceId?.slice(-8) || 'unknown'}\n\n` +
    `🔍 Reason: ${safeReason}\n\n` +
    `🔧 You can access:\n` +
    `  • POVs you own\n` +
    `  • POVs where you're a team member\n` +
    `  • POVs shared with you (if enabled)\n\n` +
    `🔧 Use project(action: 'pov.list') to see POVs you have access to.`
  );
}

module.exports = {
  povNotFoundError,
  taskNotFoundError,
  phaseNotFoundError,
  teamMemberNotFoundError,
  emptyResultsResponse,
  invalidEnumError,
  accessDeniedError
};
