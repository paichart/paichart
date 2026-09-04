/**
 * Hub Error Helpers
 * Standardized error message generators for consistent UX across Hub tools.
 *
 * Created: Phase 3, P3-1 (Error Message Enhancements)
 * Updated: 2026-05-22 (BUG-BASIC-XSS-1 Phase 2.2 — sanitizeForResponse wrap)
 * Pattern: Follows gold standard error format (10/10 errors)
 *
 * @module error-helpers
 */

const { sanitizeForResponse } = require('../response-sanitizer');

const AUTH_METHODS = [
  '• API Key: X-API-Key header',
  '• OAuth: Sign in with Microsoft/Google/GitHub',
  '• JWT Bearer: Authorization header',
  '• Claude Desktop: Authenticated MCP connection'
];

/**
 * Generate standardized authentication error
 * @param {string} action - What the user was trying to do
 * @returns {Error} Formatted authentication error
 *
 * @example
 * throw authRequiredError('Service registration');
 * // "🔒 Authentication Required: Service registration requires authentication..."
 */
function authRequiredError(action) {
  return new Error(
    `🔒 Authentication Required: ${action} requires authentication.\n\n` +
    `Please authenticate using:\n${AUTH_METHODS.join('\n')}\n\n` +
    `OAuth endpoints:\n` +
    `• Microsoft: /api/auth/oauth/microsoft\n` +
    `• Google: /api/auth/oauth/google\n` +
    `• GitHub: /api/auth/oauth/github`
  );
}

/**
 * Generate "not found" error with optional fuzzy suggestions
 *
 * Enhanced Dec 2025: Now supports fuzzy suggestions with match scores for
 * better UX when users misspell or partially type resource names.
 *
 * @param {string} resourceType - Type of resource (service, prompt, template, etc.)
 * @param {string} searchTerm - What the user searched for
 * @param {Array<string>} available - List of available options (fallback if no fuzzy)
 * @param {string} exampleParam - Example parameter name for guidance
 * @param {Array<Object>} [fuzzySuggestions] - Optional fuzzy matches from getScoredSuggestions()
 *   Each object should have { title: string, score: number }
 * @returns {Error} Formatted not found error with suggestions
 *
 * @example Basic usage (no fuzzy):
 * throw notFoundError('Service', 'weather', ['weather-api', 'sentry-mcp'], 'service_name');
 * // "Service not found: "weather". Available services: weather-api, sentry-mcp..."
 *
 * @example With fuzzy suggestions (preferred for name lookups):
 * const suggestions = getScoredSuggestions(services, searchTerm, 'name', 3);
 * throw notFoundError('Service', 'weathr', availableNames, 'service_name', suggestions);
 * // "Service not found: "weathr". Did you mean: "weather-api" (92%), "weather-v2" (85%)?"
 */
function notFoundError(resourceType, searchTerm, available, exampleParam, fuzzySuggestions = null) {
  // BUG-BASIC-XSS-1 Phase 2.2: sanitize searchTerm + DB-sourced suggestion
  // titles + DB-sourced available list entries. resourceType + exampleParam
  // are internal (caller-controlled, not end-user input).
  const safeSearch = sanitizeForResponse(searchTerm);

  // If fuzzy suggestions provided with scores, show them prominently
  if (fuzzySuggestions && fuzzySuggestions.length > 0) {
    const suggestionText = fuzzySuggestions
      .map(s => `"${sanitizeForResponse(s.title)}" (${Math.round(s.score * 100)}%)`)
      .join(', ');

    return new Error(
      `${resourceType} not found: "${safeSearch}"\n\n` +
      `🔍 Did you mean: ${suggestionText}?\n\n` +
      `💡 Example: ${exampleParam}: "${sanitizeForResponse(fuzzySuggestions[0].title)}"\n\n` +
      `🔧 Use services(action: "discover") to see all available ${resourceType.toLowerCase()}s.`
    );
  }

  // Fallback: show available list without scores
  const availableList = available.slice(0, 5).map(a => sanitizeForResponse(a)).join(', ');
  const moreCount = available.length > 5 ? ` (+${available.length - 5} more)` : '';

  return new Error(
    `${resourceType} not found: "${safeSearch}"\n\n` +
    `Available ${resourceType.toLowerCase()}s: ${availableList}${moreCount}\n\n` +
    `Example: ${exampleParam}: "${sanitizeForResponse(available[0]) || 'example-name'}"\n\n` +
    `Use services(action: "discover") to see all available ${resourceType.toLowerCase()}s.`
  );
}

/**
 * Generate validation error with examples
 * @param {Array<string>} errors - Validation error messages
 * @param {Object} example - Example of valid input
 * @param {string} tip - Additional tip
 * @returns {Error} Formatted validation error
 *
 * @example
 * throw validationError(
 *   ['name is required', 'endpoint must be URL'],
 *   { name: 'my-service', endpoint: 'https://api.example.com' },
 *   'See services(action: "discover") for registration guidance'
 * );
 */
function validationError(errors, example, tip) {
  // BUG-BASIC-XSS-1 Phase 2.2: errors[] may contain user-supplied values
  // echoed back from Zod validation messages (e.g., "value 'X' did not
  // match schema"). Sanitize each error string. example is a static caller-
  // provided template; tip is internal.
  const safeErrors = errors.map(e => sanitizeForResponse(e)).join(', ');
  return new Error(
    `Validation failed: ${safeErrors}\n\n` +
    `Valid format:\n${JSON.stringify(example, null, 2)}\n\n` +
    (tip ? `Tip: ${tip}` : '')
  );
}

/**
 * Generate "no results" error with recovery suggestions
 * @param {Object} options - Configuration
 * @param {string} options.message - Main error message
 * @param {Array<string>} options.suggestions - Recovery suggestions
 * @param {Object} options.filters - Filters that were applied
 * @returns {Object} Formatted no results response
 *
 * @example
 * return noResultsResponse({
 *   message: 'No services match your criteria',
 *   suggestions: ['Try: services(action: "discover") to see all', 'Remove filters'],
 *   filters: { capability: 'monitoring', category: 'AI' }
 * });
 */
function noResultsResponse(options) {
  const { message, suggestions, filters } = options;

  return {
    results: [],
    total: 0,
    message,
    suggestions,
    appliedFilters: filters,
    recovery: [
      'Remove or broaden filters',
      'Use services(action: "discover") to see available categories',
      'Try: services(action: "discover") without filters'
    ]
  };
}

/**
 * Generate error for missing required fields with field-by-field status
 * Follows gold standard pattern
 *
 * @param {Object} required - Required fields with descriptions
 * @param {Object} provided - What was actually provided
 * @param {Object} example - Complete working example
 * @returns {Object} Formatted validation response
 *
 * @example
 * return missingFieldsError(
 *   { name: 'Service name', endpoint: 'Service URL' },
 *   { name: 'test' },
 *   { name: 'my-service', endpoint: 'https://api.example.com' }
 * );
 * // Returns field-by-field status with ✅/❌
 */
function missingFieldsError(required, provided, example) {
  const fieldStatus = {};

  Object.entries(required).forEach(([field, description]) => {
    fieldStatus[field] = provided[field]
      ? `✅ Provided`
      : `❌ Required: ${description}`;
  });

  return {
    success: false,
    error: 'Missing Required Information',
    message: 'Please provide the following information:',
    requiredFields: fieldStatus,
    example,
    helpText: 'Please provide the missing information and try again.'
  };
}

/**
 * Enhanced operation error with categorization, recovery steps, and examples
 * Gold standard error format discovered in service-discovery-handler.js
 *
 * @param {string} operation - The operation that failed (e.g., "Service discovery")
 * @param {Error} error - The caught error
 * @param {Object} options - Configuration options
 * @param {string[]} options.validParams - Valid parameter descriptions
 * @param {string[]} options.examples - Working examples
 * @param {string[]} options.tips - Helpful tips
 * @returns {Error} Enhanced error with categorization and recovery
 *
 * @example
 * throw enhancedOperationError('Service discovery', error, {
 *   validParams: ['capability: Filter by service capability'],
 *   examples: ['services(action: "discover") → All active services'],
 *   tips: ['Use services(action: "discover") to see available categories']
 * });
 */
function enhancedOperationError(operation, error, options = {}) {
  const {
    validParams = [],
    examples = [],
    tips = []
  } = options;

  // BUG-BASIC-XSS-1 Phase 2.2: error.message MAY wrap user-supplied content
  // from upstream throw sites (e.g., new Error(`Failed for "${userInput}"`)).
  // Sanitize before echo. operation is internal (caller-supplied string).
  const errorMsg = sanitizeForResponse(error.message || String(error));
  let errorType = 'UNKNOWN';
  let suggestion = 'Unexpected error. Please try again.';
  let recovery = [];

  // Categorize error based on message patterns
  if (errorMsg.includes('ENOENT') || errorMsg.includes('Cannot find module')) {
    errorType = 'CONFIGURATION';
    suggestion = `${operation} may not be properly configured.`;
    recovery = [
      'Check that the service is running',
      'Verify configuration files',
      'Restart the MCP server'
    ];
  } else if (errorMsg.includes('database') || errorMsg.includes('prisma') || errorMsg.includes('ECONNREFUSED')) {
    errorType = 'DATABASE';
    suggestion = 'Database connection error.';
    recovery = [
      'Check database connection',
      'Verify PostgreSQL is running',
      'Check DATABASE_URL environment variable'
    ];
  } else if (errorMsg.includes('permission') || errorMsg.includes('EACCES')) {
    errorType = 'PERMISSION';
    suggestion = 'Permission error.';
    recovery = [
      'Check file/directory permissions',
      'Verify user role and access level',
      'Authenticate if not already done'
    ];
  } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    errorType = 'TIMEOUT';
    suggestion = 'Operation timed out — often transient (a slow or briefly-wedged upstream), not necessarily a permanent failure.';
    // Protocol 10 (2026-07-17): retry route BOUNDED — "repeatedly over a minute+" sanctioned
    // an open-ended retry loop by the reasoner (the layer with no backoff machinery).
    recovery = [
      'Wait ~5-10s and retry AT MOST ONCE — transient timeouts usually clear on their own',
      'Do NOT rely on a health check here: a /health endpoint ping can read green while the upstream path is wedged',
      'If the single retry also times out, treat it as persistent — STOP retrying and report the failure (repeated calls into a struggling service compound the problem)'
    ];
  } else if (errorMsg.includes('auth') || errorMsg.includes('401') || errorMsg.includes('403')) {
    errorType = 'AUTHENTICATION';
    suggestion = 'Authentication or authorization error.';
    recovery = [
      'Check authentication status',
      'Verify authentication credentials',
      'Verify API key or token'
    ];
  }

  // Build enhanced error message with 4-emoji format
  const parts = [
    `❌ ${operation} failed: ${errorMsg}`,
    '',
    `🔍 Error Type: ${errorType}`,
    `💡 Suggestion: ${suggestion}`,
    ''
  ];

  if (validParams.length > 0) {
    parts.push('Valid Parameters:');
    validParams.forEach(p => parts.push(`  • ${p}`));
    parts.push('');
  }

  if (examples.length > 0) {
    parts.push('Examples:');
    examples.forEach(e => parts.push(`  • ${e}`));
    parts.push('');
  }

  if (recovery.length > 0) {
    parts.push('🔧 Recovery Steps:');
    recovery.forEach(r => parts.push(`  • ${r}`));
    parts.push('');
  }

  if (tips.length > 0) {
    parts.push('Tips:');
    tips.forEach(t => parts.push(`  • ${t}`));
  }

  return new Error(parts.join('\n'));
}

/**
 * Generate error when neither serviceId nor service_name was provided.
 * Recurring pattern across health, update, delete, tools handlers.
 *
 * @param {string} toolAction - The tool action context (e.g., "health", "update", "delete", "tools")
 * @returns {Error} Formatted missing identifier error with examples
 *
 * @example
 * throw missingServiceIdentifierError('health');
 */
function missingServiceIdentifierError(toolAction) {
  const actionExamples = {
    health: 'services(action: "health", service_name: "notification-service")',
    update: 'registry(action: "update", service_name: "my-service", updates: {...})',
    delete: 'registry(action: "delete", service_name: "my-service", confirm: true)',
    tools: 'registry(action: "tools", service_name: "notification-service")',
    call: 'services(action: "call", targetService: "notification-service", tool: "send", arguments: {...})'
  };

  const example = actionExamples[toolAction] || `services(action: "${toolAction}", service_name: "my-service")`;

  return new Error(
    `❌ Missing service identifier: Either serviceId or service_name is required.\n\n` +
    `🔍 How to identify a service:\n` +
    `  • service_name: Human-readable name (fuzzy matched)\n` +
    `  • serviceId: Exact CUID from registry\n\n` +
    `💡 Example: ${example}\n\n` +
    `🔧 Next steps:\n` +
    `  1. Use services(action: "discover") to browse available services\n` +
    `  2. Use registry(action: "list") to see your registered services\n` +
    `  3. Copy a service name or ID and retry`
  );
}

/**
 * Generate error when service exists but user lacks permission.
 * Used for both view and modify permission checks.
 *
 * @param {string} operation - What the user was trying to do
 * @param {string} [requiredRole] - Role needed (optional)
 * @returns {Error} Formatted permission error
 *
 * @example
 * throw permissionDeniedError('register services');
 * throw permissionDeniedError('view service health', 'USER');
 */
function permissionDeniedError(operation, requiredRole) {
  const roleHint = requiredRole
    ? `\n💡 Required role: ${requiredRole} or higher.\n`
    : '\n💡 Contact an admin to check your role and permissions.\n';

  return new Error(
    `❌ Insufficient permissions to ${operation}.\n` +
    `\n🔍 Your current role does not allow this action.` +
    roleHint +
    `\n🔧 Next steps:\n` +
    `  1. Check your role: your permissions depend on your assigned role\n` +
    `  2. Contact admin to upgrade your role if needed\n` +
    `  3. Use registry(action: "list") to see what you can access`
  );
}

/**
 * Generate error when a service ID was resolved but the record doesn't exist in DB.
 * Distinct from notFoundError (which is for name-based search misses with fuzzy suggestions).
 * This is for exact ID lookups that fail.
 *
 * @param {string} serviceId - The ID that was looked up
 * @param {string} toolAction - The tool action context
 * @returns {Error} Formatted service not found error
 *
 * @example
 * throw serviceNotFoundByIdError('abc123', 'health');
 */
function serviceNotFoundByIdError(serviceId, toolAction) {
  // BUG-BASIC-XSS-1 Phase 2.2: serviceId is normally CUID-shaped (safe), but
  // helper accepts any string — defensive sanitize. toolAction is internal.
  const safeId = sanitizeForResponse(serviceId);
  return new Error(
    `❌ Service not found: "${safeId}"\n\n` +
    `🔍 No service exists with this ID. It may have been deleted or the ID is incorrect.\n\n` +
    `💡 Tip: Service IDs are case-sensitive CUIDs (e.g., "clx...").\n\n` +
    `🔧 Next steps:\n` +
    `  1. Use services(action: "discover") to find services by capability\n` +
    `  2. Use registry(action: "list") to see your registered services\n` +
    `  3. Try using service_name instead of serviceId for fuzzy matching`
  );
}

module.exports = {
  authRequiredError,
  notFoundError,
  validationError,
  noResultsResponse,
  missingFieldsError,
  enhancedOperationError,
  missingServiceIdentifierError,
  permissionDeniedError,
  serviceNotFoundByIdError,
  AUTH_METHODS
};
