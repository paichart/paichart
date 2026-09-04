/**
 * Service Connection Pool for MCP Hub
 * Reuses MCP client connections to remote services for better performance
 *
 * Pattern based on SharedEventConnectionPool (90% database performance gains)
 * Reduces connection overhead from 100-200ms per call to 0ms for reused connections
 *
 * @version 1.0.0
 * @author Phase B Performance Optimization (Dec 2025)
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { stderr, createAdapter } = require('../mcp-logger');

class ServiceConnectionPool {
  constructor(options = {}) {
    this.connections = new Map();  // serviceId → client
    this.lastUsed = new Map();     // serviceId → timestamp
    this.connectionMetadata = new Map();  // serviceId → { endpoint, transport, createdAt }
    this.pendingConnections = new Map();  // serviceId → Promise (deduplication)
    this.maxIdleTime = options.maxIdleTime || 5 * 60 * 1000; // 5 minutes default
    this.maxConnections = options.maxConnections || 20;
    this.cleanupInterval = null;
    this.stats = {
      created: 0,
      reused: 0,
      closed: 0,
      errors: 0,
      activeConnections: 0,
      evictions: 0,  // LRU evictions when at maxConnections
      staleEvictions: 0,     // Evictions triggered by stale detection
      proactiveEvictions: 0, // client.onclose removals
      retriesAttempted: 0,   // Retry attempts from resilient-call
      retriesSucceeded: 0,   // Successful retries
      coalesced: 0           // Requests that piggybacked on pending connection
    };

    this.logger = createAdapter(stderr.mcpLogger.child({ component: 'service-connection-pool' }));
  }

  /**
   * Get singleton instance (follows SharedEventConnectionPool pattern)
   */
  static getInstance(options) {
    if (!global.serviceConnectionPool) {
      global.serviceConnectionPool = new ServiceConnectionPool(options);
    }
    return global.serviceConnectionPool;
  }

  /**
   * Get or create MCP client for service
   *
   * @param {string} serviceId - Service CUID
   * @param {string} endpoint - Service endpoint URL (HTTP/HTTPS only)
   * @param {string} transportType - 'http' (WebSocket removed Jan 2026)
   * @returns {Promise<Client>} MCP SDK client (reused if exists)
   */
  async getOrCreateClient(serviceId, endpoint, transportType = 'http') {
    // Check if we have active connection
    if (this.connections.has(serviceId)) {
      const client = this.connections.get(serviceId);
      this.lastUsed.set(serviceId, Date.now());
      this.stats.reused++;
      this.logger.debug(`Reusing connection for service: ${serviceId} (${this.stats.reused} total reuses)`);
      return client;
    }

    // Promise deduplication: if a connection is already being established, piggyback on it
    if (this.pendingConnections.has(serviceId)) {
      this.logger.debug(`Waiting on pending connection for service: ${serviceId}`);
      this.stats.coalesced++;
      return this.pendingConnections.get(serviceId);
    }

    // Register deduplication promise BEFORE any await to close TOCTOU window.
    // Without this, a concurrent caller could slip past the pendingConnections.has()
    // check during the eviction await and create a duplicate connection.
    const connectionPromise = (async () => {
      // Check if we're at max connections (evict oldest if needed)
      if (this.connections.size >= this.maxConnections) {
        await this.evictOldestConnection();
      }
      return this._createConnection(serviceId, endpoint, transportType);
    })();
    this.pendingConnections.set(serviceId, connectionPromise);

    try {
      const client = await connectionPromise;
      return client;
    } finally {
      this.pendingConnections.delete(serviceId);
    }
  }

  /**
   * Internal: Create and connect a new MCP client
   * Separated from getOrCreateClient for promise deduplication support
   */
  async _createConnection(serviceId, endpoint, transportType) {
    this.logger.info(`Creating new connection for service: ${serviceId} at ${endpoint}`);

    // Declare transport outside try block so it's accessible in catch for cleanup
    let transport = null;

    try {
      // Validate and create transport (HTTP/HTTPS only - WebSocket removed Jan 2026)
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        throw new Error(`Unsupported endpoint protocol. Only HTTP/HTTPS is supported.`);
      }

      // Detect transport type from endpoint URL
      const url = new URL(endpoint);
      const isSSE = url.pathname.endsWith('/sse') || url.pathname.includes('/sse?');

      if (isSSE) {
        // SSE transport for /sse endpoints
        this.logger.debug(`Using SSE transport for: ${endpoint}`);
        transport = new SSEClientTransport(url);
      } else {
        // Streamable HTTP transport for /mcp and other endpoints
        this.logger.debug(`Using Streamable HTTP transport for: ${endpoint}`);
        transport = new StreamableHTTPClientTransport(url);
      }

      // Create MCP client
      const client = new Client({
        name: 'paichart-hub-pooled-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect to remote service
      await client.connect(transport);
      this.logger.info(`Connected successfully to service: ${serviceId}`);

      // Store in pool FIRST, then set onclose handler.
      // Order matters: if onclose fires immediately after assignment, the handler
      // must find the client in the pool maps to evict it. Setting onclose before
      // storage would leave a dead client stored with no eviction.
      this.connections.set(serviceId, client);
      this.lastUsed.set(serviceId, Date.now());
      this.connectionMetadata.set(serviceId, {
        endpoint,
        transportType,
        createdAt: Date.now()
      });

      // Proactive stale detection: remove dead connections immediately
      // When Docker restarts or SSE drops, the SDK fires onclose and the pool
      // evicts the dead entry. Next getOrCreateClient() creates a fresh connection.
      // NOTE: onclose is "best effort" for SSE (EventSource may auto-reconnect
      // silently). resilientServiceCall is the guaranteed safety net.
      client.onclose = () => {
        this.logger.info(`Connection closed by remote for service: ${serviceId} (proactive eviction)`);
        this.connections.delete(serviceId);
        this.lastUsed.delete(serviceId);
        this.connectionMetadata.delete(serviceId);
        this.stats.proactiveEvictions++;
        this.stats.activeConnections = this.connections.size;
      };

      this.stats.created++;
      this.stats.activeConnections = this.connections.size;

      return client;

    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Failed to create connection for service ${serviceId}:`, error.message);
      // P1 fix: Clean up transport if connection failed (prevents resource leak)
      if (transport && typeof transport.close === 'function') {
        try {
          await transport.close();
          this.logger.debug(`Cleaned up failed transport for service: ${serviceId}`);
        } catch (closeError) {
          this.logger.debug(`Transport cleanup error for ${serviceId}:`, closeError.message);
        }
      }

      // Wrap connection errors with user-friendly message (service provider responsibility to stay up)
      const isConnectionError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('timeout');

      if (isConnectionError) {
        const wrappedError = new Error(
          `Service "${serviceId}" is not reachable at ${endpoint}. The service may be temporarily unavailable. (Original: ${error.message})`
        );
        wrappedError.code = 'SERVICE_UNAVAILABLE';
        throw wrappedError;
      }

      throw error;
    }
  }

  /**
   * Close specific connection
   */
  async closeConnection(serviceId) {
    if (!this.connections.has(serviceId)) {
      return;
    }

    try {
      const client = this.connections.get(serviceId);
      await client.close();

      this.connections.delete(serviceId);
      this.lastUsed.delete(serviceId);
      this.connectionMetadata.delete(serviceId);

      this.stats.closed++;
      this.stats.activeConnections = this.connections.size;

      this.logger.info(`Closed connection for service: ${serviceId}`);
    } catch (error) {
      this.logger.error(`Failed to close connection for service ${serviceId}:`, error.message);
      // Remove from pool anyway
      this.connections.delete(serviceId);
      this.lastUsed.delete(serviceId);
      this.connectionMetadata.delete(serviceId);
    }
  }

  /**
   * Forcefully evict a stale/dead connection from the pool
   * Unlike closeConnection(), this handles dead clients gracefully
   * (the client may already be disconnected and close() may hang or throw)
   */
  async evictConnection(serviceId) {
    const client = this.connections.get(serviceId);
    this.connections.delete(serviceId);
    this.lastUsed.delete(serviceId);
    this.connectionMetadata.delete(serviceId);
    this.stats.staleEvictions++;
    this.stats.activeConnections = this.connections.size;
    if (client) {
      try {
        await Promise.race([client.close(), new Promise(r => setTimeout(r, 2000))]);
      } catch (_) { /* already dead */ }
    }
    this.logger.info(`Evicted stale connection for service: ${serviceId}`);
  }

  /**
   * Evict oldest connection when at max pool size
   */
  async evictOldestConnection() {
    let oldestServiceId = null;
    let oldestTime = Date.now();

    for (const [serviceId, timestamp] of this.lastUsed) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestServiceId = serviceId;
      }
    }

    if (oldestServiceId) {
      this.logger.info(`[LRU] Evicting oldest connection: ${oldestServiceId} (idle for ${Date.now() - oldestTime}ms)`);
      await this.closeConnection(oldestServiceId);
      this.stats.evictions++;
    }
  }

  /**
   * Cleanup idle connections (called periodically)
   */
  cleanupIdleConnections() {
    const now = Date.now();
    const toClose = [];

    for (const [serviceId, timestamp] of this.lastUsed) {
      if (now - timestamp > this.maxIdleTime) {
        toClose.push(serviceId);
      }
    }

    if (toClose.length > 0) {
      this.logger.info(`Cleaning up ${toClose.length} idle connections`);
      toClose.forEach(serviceId => this.closeConnection(serviceId));
    }
  }

  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupInterval) {
      return; // Already running
    }

    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60 * 1000);
    this.cleanupInterval.unref(); // Don't block process exit (P1 fix)

    this.logger.info('Started periodic cleanup timer (60s interval)');
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('Stopped periodic cleanup timer');
    }
  }

  /**
   * Get pool statistics (for monitoring)
   * (time-bomb-detection-pattern.md - Expose stats for monitoring)
   */
  getPoolStats() {
    const totalRequests = this.stats.created + this.stats.reused;
    const reuseRate = totalRequests > 0 ? (this.stats.reused / totalRequests * 100).toFixed(1) : 0;

    return {
      activeConnections: this.connections.size,
      maxConnections: this.maxConnections,
      created: this.stats.created,
      reused: this.stats.reused,
      closed: this.stats.closed,
      errors: this.stats.errors,
      evictions: this.stats.evictions,
      staleEvictions: this.stats.staleEvictions,
      proactiveEvictions: this.stats.proactiveEvictions,
      retriesAttempted: this.stats.retriesAttempted,
      retriesSucceeded: this.stats.retriesSucceeded,
      coalesced: this.stats.coalesced,
      reuseRate: `${reuseRate}%`,
      maxIdleTime: this.maxIdleTime
    };
  }

  /**
   * Close all connections (cleanup)
   * (time-bomb-detection-pattern.md - Category 3: Proper shutdown handler)
   */
  async closeAll() {
    this.logger.info(`Closing all ${this.connections.size} connections`);

    const closePromises = [];
    for (const serviceId of this.connections.keys()) {
      closePromises.push(this.closeConnection(serviceId));
    }

    await Promise.allSettled(closePromises);
    this.stopCleanupTimer();

    this.logger.info('All connections closed - shutdown complete');
  }

  /**
   * Alias for closeAll (naming consistency with other modules)
   */
  async shutdown() {
    return this.closeAll();
  }
}

module.exports = { ServiceConnectionPool };
