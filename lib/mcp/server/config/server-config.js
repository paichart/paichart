const { PUBLIC_BASE_URL } = require('../../../auth/public-base-url');
/**
 * MCP Server Configuration
 * Jan Marshal's Simple & Reliable Configuration
 * "Configuration should be simple and readable"
 */

const SERVER_CONFIG = {
  name: 'paichart-mcp-server',
  version: '3.0.0',
  description: 'pAIchart MCP Server - Official SDK Implementation',
  
  // Server capabilities
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  },

  // API configuration - simple and reliable
  api: {
    baseUrl: PUBLIC_BASE_URL,  // D4-B: one derivation (was a localhost fallback while auth fell back to the prod origin)
    // Internal base URL for server-to-server calls (avoids SSL/nginx round-trip)
    // Uses 127.0.0.1 instead of localhost to avoid IPv6 resolution issues
    internalBaseUrl: process.env.APP_INTERNAL_BASE_URL || 'http://127.0.0.1:3000',
    timeout: 30000,
    retries: 3
  },

  // Authentication configuration
  auth: {
    adminEmail: process.env.MCP_ADMIN_EMAIL || 'system@paichart.com',
    get adminPassword() {
      // 2026-09-04 (D7): the non-production literal-password fallback is GONE. This getter is only
      // reached by the dead session/bearer login path (auth-manager.js getSessionAuth /
      // getBearerTokenAuth → testAuthentication, zero callers, never observed in prod journald);
      // live MCP→API calls mint per-call RS256 tokens. Throw in every environment.
      const pw = process.env.MCP_ADMIN_PASSWORD;
      if (pw) return pw;
      throw new Error('MCP_ADMIN_PASSWORD is not set (and the session-login fallback that needs it is deprecated)');
    },
    sessionTimeout: parseInt(process.env.MCP_SESSION_TIMEOUT || '3600000'), // 1 hour default
    retryAttempts: parseInt(process.env.MCP_RETRY_ATTEMPTS || '3')
  },

  // Simple compression - use built-in features (Jan Marshal approved)
  compression: {
    enabled: true,
    level: 6,
    threshold: 1024
  },
  
  // Simple connection settings (Jan Marshal approved)
  keepAlive: {
    enabled: true,
    timeout: 65000,
    maxSockets: 50
  },

  // Simple connection pool settings (from database optimization)
  connectionPool: {
    maxConnections: 15,        // Proven database optimization
    minConnections: 3,         // Maintain minimum connections
    idleTimeout: 30000,        // 30 seconds
    acquireTimeout: 10000,     // 10 seconds
    connectionValidation: true // Simple health check
  },

  // Simple cache configuration - no complex optimization
  cache: {
    timeout: 1800000, // 30 minutes - simple, proven timeout
    maxSize: '256mb',
    enableLRU: true
  },

  // Simple timeout configuration - no adaptive complexity
  timeouts: {
    default: 30000,    // 30 seconds
    upload: 300000     // 5 minutes for uploads
  },

  // Tool configuration
  tools: {
    defaultLimit: 100,  // 🔧 FIX: Increase default to handle larger POVs
    maxLimit: 200,      // 🔧 FIX: Increase max limit for comprehensive data access
    timeframes: ['7d', '30d', '90d', '1y'],
    priorities: ['HIGH', 'MEDIUM', 'LOW'],
    statuses: {
      pov: ['PROJECTED', 'IN_PROGRESS', 'STALLED', 'VALIDATION', 'WON', 'LOST'],
      task: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']
    }
  },

};

module.exports = { SERVER_CONFIG };
