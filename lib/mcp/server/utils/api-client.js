/**
 * Jan Marshal's Simple API Client for MCP Server
 * "API calls should be simple - make request, handle response, that's it"
 */

const fetch = require('node-fetch');
const { SERVER_CONFIG } = require('../config/server-config');
const { authManager } = require('../auth/auth-manager');
const { stderr, createAdapter } = require('../mcp-logger');
// U2 Phase D site #5 (2026-05-19): per-call mint with INTERNAL_API_AUDIENCE
const { mintMcpToken } = require('../../../auth/token-manager');
const { INTERNAL_API_AUDIENCE } = require('../tools/hub/audience-policy');

class SimpleAPIClient {
  constructor() {
    this.logger = this.createLogger();
    // P0-2 FIX: No global user context - use per-request context only
  }

  /**
   * DEPRECATED: Use per-request userContext in options instead
   * This method is kept for backward compatibility but logs a warning
   *
   * @deprecated Use options.userContext in makeRequest/get/post instead
   */
  setUserContext(context) {
    this.logger.warn('[DEPRECATED] setUserContext called - use per-request userContext instead');
    this.logger.warn('Stack trace:', new Error().stack);
    // Don't set global state - force callers to use per-request pattern
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'api-client' }));
  }

  /**
   * Simple API request with basic retry logic
   *
   * Uses internalBaseUrl (http://127.0.0.1:3000) for server-to-server calls
   * to avoid SSL/nginx round-trip and prevent connection deadlocks.
   */
  async makeRequest(endpoint, options = {}) {
    // Use internal URL to avoid nginx round-trip (prevents 504 deadlock)
    const baseUrl = SERVER_CONFIG.api.internalBaseUrl || SERVER_CONFIG.api.baseUrl;
    const url = `${baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    // Log base URL usage (helps diagnose connection issues)
    this.logger.info(`${method} ${endpoint} via ${baseUrl.includes('127.0.0.1') ? 'internal' : 'external'}`);

    this.logger.debug(`${method} ${endpoint}`);

    let lastError;
    
    // Simple retry logic - no complex optimization
    for (let attempt = 1; attempt <= SERVER_CONFIG.api.retries; attempt++) {
      try {
        // U2 Phase D site #5 (v3.1 Edit 2, 2026-05-19): per-call mint with
        // INTERNAL_API_AUDIENCE. Enumerate ALL required MintMcpTokenOptions
        // fields explicitly (.js file has no TS compile gate — missing role/email
        // would silently break RBAC on the receiving /api/* route).
        const uc = options.userContext;
        if (!uc?.userId) {
          // P6 migration eliminated all callers that relied on admin fallback.
          // No legitimate code path should reach here — fail loudly.
          throw new Error(`User context (userId/email/role) required for API call to ${endpoint} — admin fallback disabled (P6)`);
        }

        const token = await mintMcpToken({
          userId: uc.userId,
          email: uc.email,
          role: uc.role,
          scope: 'mcp:execute',
          audience: INTERNAL_API_AUDIENCE,
          azp: uc.azp,  // forensic chain — undefined for X-API-Key auth (known limit per v3.1 N-5)
          ttlSeconds: 900,
          purpose: 'per-call-forward',
        });

        const authHeaders = {
          'Authorization': `Bearer ${token}`,
          'X-User-Id': uc.userId,
          'X-User-Role': uc.role || ''
        };
        this.logger.debug('Per-call mint for internal API:', {
          userId: uc.userId,
          audience: INTERNAL_API_AUDIENCE,
          endpoint
        });
        
        // Simple request headers
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': `${SERVER_CONFIG.name}/${SERVER_CONFIG.version}`,
          ...authHeaders,
          ...options.headers
        };

        // Make the request (destructure to exclude non-fetch properties)
        const { userContext: _, headers: __, body: ___, method: ____, ...fetchOptions } = options;
        const response = await fetch(url, {
          method,
          headers,
          body: options.body,
          timeout: SERVER_CONFIG.api.timeout,
          ...fetchOptions
        });

        // Always log response status for debugging workflow issues
        this.logger.info(`Response: ${response.status} ${response.statusText} for ${method} ${endpoint}`);

        // Handle response
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            this.logger.debug('Request successful');
            return data;
          } else {
            const text = await response.text();
            return { text };
          }
        } else {
          // Handle authentication errors
          if (response.status === 401 || response.status === 403) {
            this.logger.debug('Authentication error, clearing cache');
            authManager.clearCache();

            if (attempt < SERVER_CONFIG.api.retries) {
              this.logger.debug(`Retrying request (attempt ${attempt + 1})`);
              continue;
            }
          }

          // Get error details with proper serialization
          // FIX: Read body as text first, then try to parse as JSON
          // This avoids "body used already" error when json() fails
          let errorText;
          try {
            const rawText = await response.text();

            // Try to parse as JSON
            try {
              const errorData = JSON.parse(rawText);

              // Handle different error response formats
              if (typeof errorData === 'string') {
                errorText = errorData;
              } else if (errorData.message) {
                errorText = errorData.message;
              } else if (errorData.error) {
                // Handle nested error objects
                if (typeof errorData.error === 'string') {
                  errorText = errorData.error;
                } else if (errorData.error.message) {
                  errorText = errorData.error.message;
                  // Include validation details so LLMs can self-correct
                  if (Array.isArray(errorData.error.details) && errorData.error.details.length > 0) {
                    errorText += ': ' + errorData.error.details.join('; ');
                  }
                } else {
                  errorText = JSON.stringify(errorData.error, null, 2);
                }
              } else if (Array.isArray(errorData)) {
                // Handle Zod validation errors
                errorText = errorData.map(err => {
                  if (typeof err === 'string') return err;
                  if (err.message) return err.message;
                  return JSON.stringify(err);
                }).join(', ');
              } else {
                // Fallback: stringify the entire error object
                errorText = JSON.stringify(errorData, null, 2);
              }
            } catch {
              // Not JSON, use raw text
              errorText = rawText;
            }
          } catch {
            errorText = 'Unable to read error response';
          }

          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
      } catch (error) {
        lastError = error;
        // Log error at info level so it appears in production (helps diagnose 504 issues)
        this.logger.error(`Request attempt ${attempt} failed:`, error.message);
        this.logger.debug(`Request attempt ${attempt} failed:`, error.message);

        // Simple retry condition - no complex analysis
        const isRetryable = this.isSimpleRetryableError(error);
        if (!isRetryable && error.response?.status !== 401 && error.response?.status !== 403) {
          this.logger.debug('Error not retryable, breaking retry loop');
          break;
        }
        
        // Simple delay before retry
        if (attempt < SERVER_CONFIG.api.retries) {
          const delay = 1000 * attempt; // Simple linear backoff
          this.logger.debug(`Waiting ${delay}ms before retry (attempt ${attempt + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`All ${SERVER_CONFIG.api.retries} attempts failed for ${method} ${endpoint}`);
    throw lastError;
  }

  /**
   * Simple retry condition check
   */
  isSimpleRetryableError(error) {
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('timeout') || 
           errorMessage.includes('network') || 
           errorMessage.includes('connection') ||
           errorMessage.includes('fetch');
  }

  /**
   * GET request with per-request user context
   * P0-2 FIX: Accept userContext in options for per-request auth
   */
  async get(endpoint, params = {}, options = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.makeRequest(url, {
      method: 'GET',
      ...options
    });
  }

  /**
   * POST request with per-request user context
   * P0-2 FIX: Accept userContext in options for per-request auth
   */
  async post(endpoint, data = {}, options = {}) {
    return this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options
    });
  }

  /**
   * PUT request with per-request user context
   * P0-2 FIX: Accept userContext in options for per-request auth
   */
  async put(endpoint, data = {}, options = {}) {
    return this.makeRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options
    });
  }

  /**
   * DELETE request with per-request user context
   * P0-2 FIX: Accept userContext in options for per-request auth
   */
  async delete(endpoint, options = {}) {
    return this.makeRequest(endpoint, {
      method: 'DELETE',
      ...options
    });
  }

  /**
   * Simple health check
   */
  async healthCheck() {
    try {
      const response = await this.get('/api/health');
      return { healthy: true, response };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Simple connection test
   */
  async testConnection() {
    this.logger.info('Testing API connection...');
    
    try {
      // Test authentication
      const authTest = await authManager.testAuthentication();
      if (!authTest) {
        return { success: false, error: 'Authentication failed' };
      }

      // Test API endpoint
      const healthCheck = await this.healthCheck();
      if (!healthCheck.healthy) {
        return { success: false, error: `Health check failed: ${healthCheck.error}` };
      }

      this.logger.info('API connection test successful');
      return { success: true };
    } catch (error) {
      this.logger.error('API connection test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Simple status check
   */
  getStatus() {
    const authStatus = authManager.getAuthStatus();
    return {
      baseUrl: SERVER_CONFIG.api.baseUrl,
      authenticated: authStatus.cached,
      authExpiry: authStatus.expires,
      timeToExpiry: authStatus.timeToExpiry
    };
  }
}

// Create singleton instance
const apiClient = new SimpleAPIClient();

module.exports = { APIClient: SimpleAPIClient, apiClient };
