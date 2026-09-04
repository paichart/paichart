/**
 * Standardized authentication error messages
 * Part of Plan 11B: Authentication-Based Tool Access Strategy
 */

/**
 * Generate authentication required message with context
 */
function getAuthRequiredMessage(toolName, operation = 'operation') {
  const baseMessage = `🔒 Authentication Required for ${toolName}

This tool requires authentication because it involves ${operation}.`;

  const authMethods = `
**Authentication Methods Available:**
• 🔑 API Key: Provide X-API-Key header with your JWT token
• 🌐 OAuth: Sign in at /api/auth/oauth/[microsoft|google|github]  
• 📱 JWT Bearer: Authorization header with Bearer token
• 🖥️ Claude Desktop: Use authenticated MCP connection`;

  const alternatives = `
**Explore Without Authentication:**
• services(action: 'discover') - Browse available MCP services
• project(action: 'pov.list') - View public project data
• analytics(action: 'recommendations.get') - Get AI insights
• registry(action: "list") - Check your identity and services`;

  // Tool-specific messaging
  const specificMessages = {
    'registry': {
      operation: 'service registry operations',
      alternative: `💡 **Alternative**: Use services(action: "discover") to browse all public services without authentication.`
    }
  };

  const specific = specificMessages[toolName];
  const operationText = specific ? specific.operation : operation;
  const alternativeText = specific ? specific.alternative : alternatives;

  return `${baseMessage.replace(operation, operationText)}

${authMethods}

${alternativeText}`;
}

/**
 * Generate semantic conflict explanation
 */
function getSemanticConflictMessage(toolName) {
  const messages = {
    'registry': `The registry tool requires knowing WHO you are. Without authentication, we cannot determine service ownership or permissions.`
  };
  
  return messages[toolName] || `This tool requires user identity to function properly.`;
}

/**
 * Create MCP-formatted error response
 */
function createAuthError(toolName, operation = 'operation') {
  return {
    content: [{
      type: "text",
      text: getAuthRequiredMessage(toolName, operation)
    }],
    isError: true,
    _meta: {
      errorType: 'AUTHENTICATION_REQUIRED',
      tool: toolName,
      timestamp: new Date().toISOString(),
      semanticReason: getSemanticConflictMessage(toolName)
    }
  };
}

module.exports = {
  getAuthRequiredMessage,
  getSemanticConflictMessage,
  createAuthError
};