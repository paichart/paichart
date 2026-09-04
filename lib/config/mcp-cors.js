/**
 * @deprecated BC45 FIX: This module is DEAD CODE — not imported anywhere.
 * Active CORS logic is in lib/utils/cors.ts (isAllowedOrigin + corsPreflightResponse).
 * DO NOT import this module — its development config has origin:'*' with credentials:true
 * which is insecure. Kept for reference only.
 */

const MCPCorsConfig = {
  // Development configuration - permissive for Claude Desktop
  development: {
    origin: '*', // INSECURE: Do not use. See lib/utils/cors.ts instead.
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization', 
      'X-API-Key',
      'Mcp-Session-Id',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: [
      'Mcp-Session-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining', 
      'X-RateLimit-Reset'
    ],
    optionsSuccessStatus: 200, // Support legacy browsers
    preflightContinue: false,
    maxAge: 86400 // 24 hours
  },

  // Production configuration - more restrictive
  production: {
    origin: [
      'https://claude.ai',
      'https://www.claude.ai',
      'http://localhost:3000', // Local dev access
      process.env.ALLOWED_ORIGIN // Custom allowed origin
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key', 
      'Mcp-Session-Id'
    ],
    exposedHeaders: [
      'Mcp-Session-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    optionsSuccessStatus: 200,
    maxAge: 3600 // 1 hour
  }
};

/**
 * Get CORS configuration based on environment
 */
function getMCPCorsConfig() {
  const env = process.env.NODE_ENV || 'development';
  const config = MCPCorsConfig[env] || MCPCorsConfig.development;
  
  // Override with environment variables if provided
  if (process.env.MCP_HTTP_CORS_ORIGIN) {
    config.origin = process.env.MCP_HTTP_CORS_ORIGIN === '*' 
      ? '*' 
      : process.env.MCP_HTTP_CORS_ORIGIN.split(',');
  }
  
  return config;
}

/**
 * Custom CORS handler for MCP-specific requirements
 */
function createMCPCorsHandler() {
  const config = getMCPCorsConfig();
  
  return (req, res, next) => {
    const origin = req.headers.origin;
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', config.origin === '*' ? '*' : origin);
      res.header('Access-Control-Allow-Methods', config.methods.join(', '));
      res.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      res.header('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', config.maxAge.toString());
      return res.status(200).end();
    }
    
    // Handle actual requests
    res.header('Access-Control-Allow-Origin', config.origin === '*' ? '*' : origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    
    next();
  };
}

module.exports = {
  MCPCorsConfig,
  getMCPCorsConfig,
  createMCPCorsHandler
};