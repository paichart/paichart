/**
 * MCP Tool Annotations for Anthropic Directory Compliance
 * Provides readOnlyHint, destructiveHint, and title annotations for all tools
 * Required for Anthropic MCP Directory listing
 */

/**
 * Tool annotations following MCP specification
 * https://modelcontextprotocol.io/specification/draft/schema#toolannotations
 */
const TOOL_ANNOTATIONS = {
  // === CONSOLIDATED EMBEDDED SERVER TOOLS (Mar 2026: 14 -> 6) ===

  'project': {
    title: 'Query Project Data',
    readOnlyHint: true,
    destructiveHint: false
  },

  'perform': {
    title: 'Perform Task Action',
    readOnlyHint: false,
    destructiveHint: true
  },

  'analytics': {
    title: 'Analytics and Recommendations',
    readOnlyHint: true,
    destructiveHint: false
  },

  'template': {
    title: 'Agent Template Management',
    readOnlyHint: true,
    destructiveHint: false
  },

  'services': {
    title: 'External Service Operations',
    readOnlyHint: false,
    destructiveHint: true
  },

  'registry': {
    title: 'Manage Service Registry',
    readOnlyHint: false,
    destructiveHint: true   // register/update/delete modify service data
  },

  // === NON-CONSOLIDATED TOOLS (kept as individual registrations) ===

  'list_prompts': {
    title: 'List Available Prompts',
    readOnlyHint: true,
    destructiveHint: false
  },
  
  'prompt_command': {
    title: 'Run Prompt Command',
    readOnlyHint: false,  // Prompts can execute actions (not read-only)
    destructiveHint: true   // Prompts may perform irreversible actions
  },

  // === CHATGPT CONNECTOR TOOLS (Search & Fetch) ===

  'search': {
    title: 'Search pAIchart Resources',
    readOnlyHint: true,   // Search queries don't modify data
    destructiveHint: false  // Safe read-only operation
  },

  'fetch': {
    title: 'Fetch pAIchart Resource',
    readOnlyHint: true,   // Fetch retrieves existing data
    destructiveHint: false  // Safe read-only operation
  },

  // Legacy register_service, list_my_services, update_service, delete_service, get_service_tools
  // were consolidated into registry (Mar 2026)
};

/**
 * Get annotations for a specific tool
 * @param {string} toolName - Name of the tool
 * @returns {object|null} - Tool annotations or null if not found
 */
function getToolAnnotations(toolName) {
  return TOOL_ANNOTATIONS[toolName] || null;
}

/**
 * Get all tool annotations
 * @returns {object} - Complete tool annotations mapping
 */
function getAllToolAnnotations() {
  return { ...TOOL_ANNOTATIONS };
}

/**
 * Check if a tool is read-only
 * @param {string} toolName - Name of the tool
 * @returns {boolean} - True if tool is read-only
 */
function isReadOnlyTool(toolName) {
  const annotations = TOOL_ANNOTATIONS[toolName];
  return annotations?.readOnlyHint === true;
}

/**
 * Check if a tool is potentially destructive
 * @param {string} toolName - Name of the tool
 * @returns {boolean} - True if tool may perform destructive operations
 */
function isDestructiveTool(toolName) {
  const annotations = TOOL_ANNOTATIONS[toolName];
  return annotations?.destructiveHint === true;
}

/**
 * Get tool title for display
 * @param {string} toolName - Name of the tool
 * @returns {string} - Human-readable tool title
 */
function getToolTitle(toolName) {
  const annotations = TOOL_ANNOTATIONS[toolName];
  return annotations?.title || toolName;
}

/**
 * Validate that all tools have proper annotations
 * @param {string[]} toolNames - List of tool names to validate
 * @returns {object} - Validation result with missing annotations
 */
function validateToolAnnotations(toolNames) {
  const missing = [];
  const invalid = [];
  
  for (const toolName of toolNames) {
    const annotations = TOOL_ANNOTATIONS[toolName];
    
    if (!annotations) {
      missing.push(toolName);
      continue;
    }
    
    // Validate required fields
    if (typeof annotations.title !== 'string') {
      invalid.push({ tool: toolName, issue: 'Missing or invalid title' });
    }
    
    if (typeof annotations.readOnlyHint !== 'boolean') {
      invalid.push({ tool: toolName, issue: 'Missing or invalid readOnlyHint' });
    }
    
    if (typeof annotations.destructiveHint !== 'boolean') {
      invalid.push({ tool: toolName, issue: 'Missing or invalid destructiveHint' });
    }
    
    // Validate logical consistency
    if (annotations.readOnlyHint === true && annotations.destructiveHint === true) {
      invalid.push({ tool: toolName, issue: 'Read-only tools cannot be destructive' });
    }
  }
  
  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    annotated: toolNames.length - missing.length,
    total: toolNames.length
  };
}

module.exports = {
  TOOL_ANNOTATIONS,
  getToolAnnotations,
  getAllToolAnnotations,
  isReadOnlyTool,
  isDestructiveTool,
  getToolTitle,
  validateToolAnnotations
};