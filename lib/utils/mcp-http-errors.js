/**
 * MCP HTTP Transport Error Handling
 * Comprehensive error patterns for different error types
 */

const { mcpLogger, createAdapter } = require('../js-logger');
const log = createAdapter(mcpLogger.child({ component: 'mcp-http-errors' }));

// Error codes following JSON-RPC 2.0 and MCP specifications
const MCPErrorCodes = {
  // JSON-RPC 2.0 standard errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP-specific errors
  NOT_INITIALIZED: -32001,
  CAPABILITY_NOT_SUPPORTED: -32002,
  RESOURCE_NOT_FOUND: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  
  // HTTP Transport specific errors
  SESSION_EXPIRED: -33001,
  AUTHENTICATION_FAILED: -33002,
  RATE_LIMIT_EXCEEDED: -33003,
  TRANSPORT_ERROR: -33004
};

// HTTP status code mappings
const HTTPStatusMappings = {
  [MCPErrorCodes.PARSE_ERROR]: 400,
  [MCPErrorCodes.INVALID_REQUEST]: 400,
  [MCPErrorCodes.METHOD_NOT_FOUND]: 404,
  [MCPErrorCodes.INVALID_PARAMS]: 400,
  [MCPErrorCodes.INTERNAL_ERROR]: 500,
  [MCPErrorCodes.NOT_INITIALIZED]: 400,
  [MCPErrorCodes.CAPABILITY_NOT_SUPPORTED]: 501,
  [MCPErrorCodes.RESOURCE_NOT_FOUND]: 404,
  [MCPErrorCodes.TOOL_EXECUTION_ERROR]: 500,
  [MCPErrorCodes.SESSION_EXPIRED]: 440, // Login timeout
  [MCPErrorCodes.AUTHENTICATION_FAILED]: 401,
  [MCPErrorCodes.RATE_LIMIT_EXCEEDED]: 429,
  [MCPErrorCodes.TRANSPORT_ERROR]: 502
};

/**
 * Create standardized MCP error response
 */
function createMCPError(code, message, data = null, id = null) {
  return {
    jsonrpc: '2.0',
    error: {
      code,
      message,
      ...(data && { data })
    },
    id
  };
}

/**
 * Create HTTP error response with MCP error inside
 */
function createHTTPMCPError(code, message, data = null, id = null) {
  const httpStatus = HTTPStatusMappings[code] || 500;
  const mcpError = createMCPError(code, message, data, id);
  
  return {
    status: httpStatus,
    response: mcpError
  };
}

/**
 * Session timeout error
 */
function createSessionTimeoutError(sessionId, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.SESSION_EXPIRED,
    'Session has expired',
    {
      sessionId,
      suggestion: 'Initialize a new session',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Authentication error
 */
function createAuthenticationError(reason = 'Invalid credentials', id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.AUTHENTICATION_FAILED,
    'Authentication failed',
    {
      reason,
      supportedMethods: ['JWT Bearer token', 'X-API-Key header'],
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Rate limit error
 */
function createRateLimitError(limit, windowMs, retryAfter, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.RATE_LIMIT_EXCEEDED,
    'Rate limit exceeded',
    {
      limit,
      windowMs,
      retryAfter,
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Transport error (connection, network, etc.)
 */
function createTransportError(reason, details = null, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.TRANSPORT_ERROR,
    'Transport error occurred',
    {
      reason,
      details,
      transport: 'http',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Tool execution error
 */
function createToolExecutionError(toolName, error, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.TOOL_EXECUTION_ERROR,
    `Tool execution failed: ${toolName}`,
    {
      toolName,
      error: error.message || String(error),
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Resource not found error
 */
function createResourceNotFoundError(resourceUri, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.RESOURCE_NOT_FOUND,
    'Resource not found',
    {
      resourceUri,
      suggestion: 'Check resource URI and ensure it exists',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Parse error for malformed JSON-RPC
 */
function createParseError(parseDetails = null, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.PARSE_ERROR,
    'Parse error',
    {
      details: parseDetails,
      requirement: 'Valid JSON-RPC 2.0 request',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Invalid request error
 */
function createInvalidRequestError(validationDetails = null, id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.INVALID_REQUEST,
    'Invalid request',
    {
      details: validationDetails,
      requirement: 'Valid JSON-RPC 2.0 request structure',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Method not found error
 */
function createMethodNotFoundError(method, availableMethods = [], id = null) {
  return createHTTPMCPError(
    MCPErrorCodes.METHOD_NOT_FOUND,
    `Method not found: ${method}`,
    {
      method,
      availableMethods,
      suggestion: 'Use tools/list, resources/list, or prompts/list to see available methods',
      timestamp: new Date().toISOString()
    },
    id
  );
}

/**
 * Express error handler middleware for MCP HTTP transport
 */
function createMCPErrorHandler() {
  return (error, req, res, next) => {
    log.error({ err: error, path: req.path, method: req.method, sessionId: req.headers['mcp-session-id'], userId: req.user?.id }, '[MCP-HTTP-Error]');

    // Handle different error types
    let mcpError;
    
    if (error.name === 'SyntaxError' && error.type === 'entity.parse.failed') {
      // JSON parse error
      mcpError = createParseError(error.message, null);
    } else if (error.name === 'ValidationError') {
      // Validation error
      mcpError = createInvalidRequestError(error.message, null);
    } else if (error.status === 401) {
      // Authentication error
      mcpError = createAuthenticationError(error.message, null);
    } else if (error.status === 429) {
      // Rate limit error
      mcpError = createRateLimitError(100, 60000, 60, null);
    } else if (error.code && MCPErrorCodes[error.code]) {
      // Known MCP error
      mcpError = createHTTPMCPError(error.code, error.message, error.data, null);
    } else {
      // Generic internal error
      mcpError = createHTTPMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        'Internal server error',
        process.env.NODE_ENV === 'development' ? { original: error.message } : null,
        null
      );
    }

    res.status(mcpError.status).json(mcpError.response);
  };
}

/**
 * Express 404 handler for MCP HTTP transport
 */
function createMCP404Handler() {
  return (req, res, next) => {
    const error = createMethodNotFoundError(
      `${req.method} ${req.path}`,
      ['POST /mcp', 'GET /mcp', 'DELETE /mcp', 'GET /health'],
      null
    );
    
    res.status(error.status).json(error.response);
  };
}

/**
 * Async error wrapper for Express routes
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate JSON-RPC request structure
 */
function validateJSONRPCRequest(body) {
  const errors = [];
  
  if (!body || typeof body !== 'object') {
    errors.push('Request body must be a JSON object');
  } else {
    if (body.jsonrpc !== '2.0') {
      errors.push('jsonrpc field must be "2.0"');
    }
    
    if (!body.method || typeof body.method !== 'string') {
      errors.push('method field is required and must be a string');
    }
    
    if (body.id !== null && body.id !== undefined && 
        typeof body.id !== 'string' && typeof body.id !== 'number') {
      errors.push('id field must be a string, number, or null');
    }
    
    if (body.params !== undefined && typeof body.params !== 'object') {
      errors.push('params field must be an object if provided');
    }
  }
  
  return errors;
}

module.exports = {
  MCPErrorCodes,
  HTTPStatusMappings,
  createMCPError,
  createHTTPMCPError,
  createSessionTimeoutError,
  createAuthenticationError,
  createRateLimitError,
  createTransportError,
  createToolExecutionError,
  createResourceNotFoundError,
  createParseError,
  createInvalidRequestError,
  createMethodNotFoundError,
  createMCPErrorHandler,
  createMCP404Handler,
  asyncHandler,
  validateJSONRPCRequest
};