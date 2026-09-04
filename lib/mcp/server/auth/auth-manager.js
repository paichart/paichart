/**
 * Jan Marshal's Simple Authentication Manager for MCP Server
 * "Authentication should be simple - try to login, if it works use it"
 */

const fetch = require('node-fetch');
const { SERVER_CONFIG } = require('../config/server-config');
const { stderr, createAdapter } = require('../mcp-logger');

class SimpleAuthManager {
  constructor() {
    this.cachedAuth = null;
    this.authExpiry = null;
    this.logger = this.createLogger();
  }

  createLogger() {
    return createAdapter(stderr.authLogger.child({ component: 'auth-manager' }));
  }

  /**
   * Simple authentication with API key priority (FIXED)
   */
  async getAuthHeaders() {
    // Check if cached auth is still valid (simple 30-minute cache)
    if (this.cachedAuth && this.authExpiry && Date.now() < this.authExpiry) {
      this.logger.debug('Using cached authentication');
      return this.cachedAuth;
    }

    // PRIORITY FIX: Try API key first (most reliable for MCP)
    try {
      const authHeaders = await this.getAPIKeyAuth();
      if (authHeaders) {
        // Simple cache for 30 minutes
        this.cachedAuth = authHeaders;
        this.authExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
        
        this.logger.info('API key authentication successful');
        return authHeaders;
      }
    } catch (error) {
      this.logger.debug('API key auth failed:', error.message);
    }

    // Fallback to other methods
    const authMethods = [
      () => this.getSessionAuth(),
      () => this.getBearerTokenAuth()
    ];

    for (const method of authMethods) {
      try {
        const authHeaders = await method();
        if (authHeaders) {
          // Simple cache for 30 minutes
          this.cachedAuth = authHeaders;
          this.authExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
          
          this.logger.info('Authentication successful');
          return authHeaders;
        }
      } catch (error) {
        this.logger.debug('Authentication method failed:', error.message);
        continue;
      }
    }

    throw new Error('All authentication methods failed');
  }

  /**
   * Session-based authentication with cookies
   */
  async getSessionAuth() {
    this.logger.debug('Attempting session authentication...');
    
    try {
      const loginResponse = await fetch(`${SERVER_CONFIG.api.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${SERVER_CONFIG.name}/${SERVER_CONFIG.version}`
        },
        body: JSON.stringify({
          email: SERVER_CONFIG.auth.adminEmail,
          password: SERVER_CONFIG.auth.adminPassword
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!loginResponse.ok) {
        await loginResponse.body?.cancel(); // BC20 FIX
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      // Extract cookies from response
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        const cookieStrings = [];
        
        setCookieHeaders.forEach(cookieHeader => {
          const cookieParts = cookieHeader.split(';')[0].trim();
          if (cookieParts.includes('=')) {
            cookieStrings.push(cookieParts);
          }
        });
        
        if (cookieStrings.length > 0) {
          const cookies = cookieStrings.join('; ');
          this.logger.debug(`Extracted ${cookieStrings.length} cookies`);
          return { Cookie: cookies };
        }
      }

      throw new Error('No valid cookies found in login response');
    } catch (error) {
      this.logger.debug('Session auth failed:', error.message);
      throw error;
    }
  }

  /**
   * Bearer token authentication
   */
  async getBearerTokenAuth() {
    this.logger.debug('Attempting bearer token authentication...');
    
    try {
      const loginResponse = await fetch(`${SERVER_CONFIG.api.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${SERVER_CONFIG.name}/${SERVER_CONFIG.version}`
        },
        body: JSON.stringify({
          email: SERVER_CONFIG.auth.adminEmail,
          password: SERVER_CONFIG.auth.adminPassword
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!loginResponse.ok) {
        await loginResponse.body?.cancel(); // BC20 FIX
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      const loginData = await loginResponse.json();
      if (loginData.token) {
        this.logger.debug('Bearer token extracted successfully');
        return { Authorization: `Bearer ${loginData.token}` };
      }

      throw new Error('No token found in login response');
    } catch (error) {
      this.logger.debug('Bearer token auth failed:', error.message);
      throw error;
    }
  }

  /**
   * API key authentication
   */
  async getAPIKeyAuth() {
    this.logger.debug('Attempting API key authentication...');
    
    const apiKey = process.env.PAICHART_API_KEY;
    if (!apiKey) {
      throw new Error('No API key available');
    }

    this.logger.debug('API key found in environment');
    
    // Simple check for JWT format
    if (apiKey.startsWith('eyJ')) {
      this.logger.debug('API key appears to be a JWT token');
      return { 'Authorization': `Bearer ${apiKey}` };
    } else {
      this.logger.debug('Using API key as X-API-Key header');
      return { 'X-API-Key': apiKey };
    }
  }

  /**
   * Clear cached authentication
   */
  clearCache() {
    this.logger.debug('Clearing authentication cache');
    this.cachedAuth = null;
    this.authExpiry = null;
  }

  /**
   * Test authentication
   */
  async testAuthentication() {
    try {
      const authHeaders = await this.getAuthHeaders();
      
      const testResponse = await fetch(`${SERVER_CONFIG.api.baseUrl}/api/health`, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'User-Agent': `${SERVER_CONFIG.name}/${SERVER_CONFIG.version}`
        },
        signal: AbortSignal.timeout(10_000),
      });

      // BC20 FIX: always consume body regardless of success/failure
      await testResponse.body?.cancel();

      if (testResponse.ok) {
        this.logger.info('Authentication test successful');
        return true;
      } else {
        this.logger.error('Authentication test failed:', testResponse.status);
        this.clearCache();
        return false;
      }
    } catch (error) {
      this.logger.error('Authentication test error:', error.message);
      this.clearCache();
      return false;
    }
  }

  /**
   * Simple authentication status
   */
  getAuthStatus() {
    return {
      cached: !!this.cachedAuth,
      expires: this.authExpiry,
      timeToExpiry: this.authExpiry ? Math.max(0, this.authExpiry - Date.now()) : 0
    };
  }
}

// Create singleton instance
const authManager = new SimpleAuthManager();

module.exports = { AuthManager: SimpleAuthManager, authManager };
