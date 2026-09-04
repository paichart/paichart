/**
 * Resilient Service Call Utility
 *
 * Provides retry-on-failure for stale MCP connections.
 * When a pooled SSE connection dies (e.g., Docker container restart),
 * the first call fails with a connection error. This utility detects
 * stale connection errors, evicts the dead connection, and retries once
 * with a fresh connection.
 *
 * Design decisions (from specialist reviews):
 * - Pool stays a pure connection manager; retry logic lives here
 * - Timeouts do NOT trigger eviction (slow service != dead connection)
 * - Timer cleanup uses .finally(clearTimeout) to prevent timer leaks
 * - Only one retry attempt (prevents retry storms)
 *
 * @version 1.0.0
 */

/**
 * Race a promise against a timeout with proper timer cleanup
 *
 * @param {Promise} promise - The promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} label - Label for the timeout error message
 * @returns {Promise} Result of the promise or timeout error
 */
function raceWithTimeout(promise, timeoutMs, label = 'Operation') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeoutMs}ms limit`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Conservative classifier for stale connection errors
 *
 * Only classifies network-level errors that indicate a dead connection.
 * Timeouts do NOT trigger eviction (per architectural review:
 * a slow service isn't a dead connection).
 *
 * @param {Error} error - The error to classify
 * @returns {boolean} True if this error indicates a stale/dead connection
 */
function isStaleConnectionError(error) {
  if (!error) return false;

  const message = error.message || '';
  const code = error.code || '';

  // MCP SDK ConnectionClosed error (-32000)
  if (message.includes('ConnectionClosed') || message.includes('-32000')) {
    return true;
  }

  // Network-level errors indicating dead connection
  const staleErrorCodes = ['ECONNRESET', 'EPIPE', 'ECONNREFUSED'];
  if (staleErrorCodes.includes(code)) {
    return true;
  }

  // Message-based detection for errors without error codes
  const stalePatterns = [
    'ECONNRESET',
    'EPIPE',
    'ECONNREFUSED',
    'socket hang up',
    'connection closed',
    'This operation was aborted',
    'fetch failed',  // Node.js 18+ fetch() wraps connection failures (StreamableHTTP transport)
  ];

  return stalePatterns.some(pattern => message.includes(pattern));
}

/**
 * Execute a service call with stale connection detection and retry
 *
 * Gets a pooled client, executes the call with timeout, and on stale
 * connection error: evicts the dead connection, gets a fresh client,
 * and retries once.
 *
 * @param {ServiceConnectionPool} pool - Connection pool instance
 * @param {string} serviceId - Service ID for pool lookup
 * @param {string} endpoint - Service endpoint URL
 * @param {function(Client): Promise} callFn - Function that takes a client and returns a promise
 * @param {Object} [options] - Options
 * @param {number} [options.timeout=30000] - Timeout in milliseconds
 * @param {string} [options.label='Service call'] - Label for logging and timeout errors
 * @returns {Promise} Result of the call
 */
async function resilientServiceCall(pool, serviceId, endpoint, callFn, options = {}) {
  const { timeout = 30000, label = 'Service call' } = options;

  try {
    const client = await pool.getOrCreateClient(serviceId, endpoint, 'http');
    return await raceWithTimeout(callFn(client), timeout, label);
  } catch (error) {
    if (isStaleConnectionError(error)) {
      pool.logger.info(`Stale connection for ${serviceId}: ${error.message}. Evicting and retrying.`);
      pool.stats.retriesAttempted++;
      // Fire-and-forget eviction: Map cleanup is synchronous inside evictConnection(),
      // so getOrCreateClient() immediately sees the entry as gone. The async client.close()
      // is best-effort cleanup of a dead socket -- no need to block the retry path.
      // Pattern: fire-and-forget-activity-logging-pattern.md (hub-audit-service.js)
      pool.evictConnection(serviceId).catch((err) => {
        pool.logger.debug(`Eviction cleanup error for ${serviceId}: ${err.message}`);
      });
      const freshClient = await pool.getOrCreateClient(serviceId, endpoint, 'http');
      const result = await raceWithTimeout(callFn(freshClient), timeout, label);
      pool.stats.retriesSucceeded++;
      return result;
    }
    throw error;
  }
}

module.exports = { resilientServiceCall, raceWithTimeout, isStaleConnectionError };
