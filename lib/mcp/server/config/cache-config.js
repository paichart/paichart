/**
 * Jan Marshal's Simple Cache Configuration
 * "Caching should be simple - just set a TTL and move on"
 */

const { SERVER_CONFIG } = require('./server-config');

/**
 * Simple cache configuration - no complex optimization classes
 * Use the cache settings from server-config.js
 */
const SIMPLE_CACHE_CONFIG = {
  // Simple TTL - same for all data types
  defaultTTL: SERVER_CONFIG.cache.timeout, // 30 minutes
  maxSize: SERVER_CONFIG.cache.maxSize,    // 256mb
  enableLRU: SERVER_CONFIG.cache.enableLRU // true
};

/**
 * Simple cache key generator
 */
function getCacheKey(type, identifier) {
  return `${type}:${identifier}`;
}

/**
 * Simple cache TTL getter - no adaptive complexity
 */
function getTTL() {
  return SIMPLE_CACHE_CONFIG.defaultTTL;
}

module.exports = {
  SIMPLE_CACHE_CONFIG,
  getCacheKey,
  getTTL
};
