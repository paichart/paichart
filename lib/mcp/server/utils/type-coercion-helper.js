/**
 * Type Coercion Helper for MCP Server
 *
 * Handles cross-platform parameter type differences between AI clients:
 * - ChatGPT: Passes arguments as strings ('200', 'true', 'false')
 * - Claude Desktop: Passes arguments as native types (200, true, false)
 * - Gemini: Similar to ChatGPT (string serialization)
 *
 * Pattern discovered during audit_all_tasks ChatGPT testing (Nov 15, 2025)
 * Bug fix: Commit 73f2ecc
 *
 * @see /cline_docs/reviews/chat-workflow-improvements-2025-11-15/mcp-exposure-completion-roadmap.md (lines 777-820)
 * @version 1.0.0
 */

/**
 * Coerce a value to a number
 * @param {any} value - Value to coerce (string, number, or null/undefined)
 * @param {number} defaultValue - Default value if coercion fails
 * @returns {number} - Coerced number value
 *
 * @example
 * coerceToNumber('200', 100) // → 200
 * coerceToNumber(200, 100)   // → 200
 * coerceToNumber('invalid', 100) // → 100
 * coerceToNumber(null, 100) // → 100
 */
function coerceToNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Coerce a value to a boolean
 * Handles special case where string 'false' should be false (not truthy)
 *
 * @param {any} value - Value to coerce (string, boolean, or null/undefined)
 * @param {boolean} defaultValue - Default value if undefined/null
 * @returns {boolean} - Coerced boolean value
 *
 * @example
 * coerceToBoolean('true', false)  // → true
 * coerceToBoolean('false', false) // → false (special case!)
 * coerceToBoolean(true, false)    // → true
 * coerceToBoolean(false, false)   // → false
 * coerceToBoolean(undefined, false) // → false
 * coerceToBoolean('', false)      // → false
 */
function coerceToBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // Special case: String 'false' should be false (not truthy)
  if (value === 'false') {
    return false;
  }

  // Convert to boolean (truthy/falsy)
  return Boolean(value);
}

/**
 * Coerce a value to a string
 * @param {any} value - Value to coerce
 * @param {string} defaultValue - Default value if null/undefined
 * @returns {string} - Coerced string value
 *
 * @example
 * coerceToString(200, 'default') // → '200'
 * coerceToString('text', 'default') // → 'text'
 * coerceToString(null, 'default') // → 'default'
 */
function coerceToString(value, defaultValue = '') {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  return String(value);
}

/**
 * Coerce an enum value with whitelist validation
 * @param {any} value - Value to coerce
 * @param {string[]} allowedValues - Whitelist of valid enum values
 * @param {string} defaultValue - Default value if invalid
 * @returns {string} - Coerced enum value
 *
 * @example
 * coerceToEnum('high', ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM') // → 'HIGH' (case-insensitive)
 * coerceToEnum('urgent', ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM') // → 'MEDIUM' (invalid, use default)
 */
function coerceToEnum(value, allowedValues, defaultValue) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // Convert to uppercase for case-insensitive matching
  const upperValue = String(value).toUpperCase();

  if (allowedValues.includes(upperValue)) {
    return upperValue;
  }

  // Try exact match (case-sensitive)
  if (allowedValues.includes(value)) {
    return value;
  }

  return defaultValue;
}

/**
 * Coerce argument object based on schema definition
 * @param {object} args - Raw arguments from MCP client
 * @param {object} schema - Schema definition with types and defaults
 * @returns {object} - Coerced arguments
 *
 * Schema format:
 * {
 *   paramName: {
 *     type: 'number' | 'boolean' | 'string' | 'enum',
 *     default: defaultValue,
 *     enum: ['VALUE1', 'VALUE2'] // For enum type only
 *   }
 * }
 *
 * @example
 * const schema = {
 *   maxPerPOV: { type: 'number', default: 200 },
 *   showAssignees: { type: 'boolean', default: true },
 *   status: { type: 'enum', enum: ['OPEN', 'IN_PROGRESS'], default: 'OPEN' }
 * };
 *
 * coerceArguments(
 *   { maxPerPOV: '500', showAssignees: 'false', status: 'open' },
 *   schema
 * );
 * // Returns: { maxPerPOV: 500, showAssignees: false, status: 'OPEN' }
 */
function coerceArguments(args = {}, schema = {}) {
  const coerced = {};

  for (const [key, config] of Object.entries(schema)) {
    const value = args[key];

    switch (config.type) {
      case 'number':
        coerced[key] = coerceToNumber(value, config.default);
        break;

      case 'boolean':
        coerced[key] = coerceToBoolean(value, config.default);
        break;

      case 'string':
        coerced[key] = coerceToString(value, config.default);
        break;

      case 'enum':
        if (!config.enum || !Array.isArray(config.enum)) {
          throw new Error(`Enum type requires 'enum' array for parameter: ${key}`);
        }
        coerced[key] = coerceToEnum(value, config.enum, config.default);
        break;

      default:
        // Unknown type - pass through as-is
        coerced[key] = value !== undefined ? value : config.default;
    }
  }

  // Include any args not in schema (pass through)
  for (const [key, value] of Object.entries(args)) {
    if (!(key in coerced)) {
      coerced[key] = value;
    }
  }

  return coerced;
}

/**
 * Convenience function for prompt argument coercion
 * Common pattern for MCP server-side prompts
 *
 * @param {object} args - Raw arguments from prompt invocation
 * @returns {object} - Object with coerced numeric and boolean parameters
 *
 * @example
 * const { maxPerPOV, showAssignees, includeCompleted } = coercePromptArguments({
 *   maxPerPOV: '500',
 *   showAssignees: 'false',
 *   includeCompleted: 'true'
 * });
 * // Returns: { maxPerPOV: 500, showAssignees: false, includeCompleted: true }
 */
function coercePromptArguments(args = {}) {
  const coerced = { ...args };

  // Auto-detect and coerce common numeric parameters
  const numericParams = ['maxPerPOV', 'limit', 'page', 'pageSize', 'take', 'skip', 'max', 'min'];
  for (const param of numericParams) {
    if (param in coerced) {
      coerced[param] = coerceToNumber(coerced[param], undefined);
    }
  }

  // Auto-detect and coerce common boolean parameters
  const booleanParams = ['showAssignees', 'showPhaseInfo', 'includeCompleted', 'includeHistory',
                          'includeAnalytics', 'includeRecommendations', 'enabled', 'active'];
  for (const param of booleanParams) {
    if (param in coerced) {
      coerced[param] = coerceToBoolean(coerced[param], undefined);
    }
  }

  return coerced;
}

module.exports = {
  coerceToNumber,
  coerceToBoolean,
  coerceToString,
  coerceToEnum,
  coerceArguments,
  coercePromptArguments
};
