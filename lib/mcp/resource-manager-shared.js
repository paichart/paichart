/**
 * Shared utilities for resource managers
 *
 * Both SimpleResourceManager (JS, MCP servers) and MCPResourceManager (TS, REST API)
 * share these constants, key helpers, and utility functions.
 *
 * Created: Feb 2026 — extracted to eliminate duplication between dual managers.
 * See resource-manager-specialist.md for why both managers exist.
 */

const crypto = require('crypto');
const { mcpLogger, createAdapter } = require('../js-logger');
const log = createAdapter(mcpLogger.child({ component: 'resource-manager-shared' }));

// ─── Key Prefix Constants ────────────────────────────────────────────────────
// CRITICAL: Both managers MUST use dash-prefix format (standardized Feb 2026).
// See P2 fix notes — colons caused cross-manager key mismatches.

const RESOURCE_KEY_PREFIX = Object.freeze({
  ARTIFACT: 'artifact-',
  EXECUTION: 'execution-',
  TEMPLATE: 'template-',
});

/**
 * Build a prefixed resource key from type and ID.
 *
 * @param {'artifact' | 'execution' | 'template'} type
 * @param {string} id - Raw entity ID (CUID)
 * @returns {string} Prefixed key, e.g. "artifact-clxy123"
 */
function buildResourceKey(type, id) {
  switch (type) {
    case 'artifact':  return `${RESOURCE_KEY_PREFIX.ARTIFACT}${id}`;
    case 'execution': return `${RESOURCE_KEY_PREFIX.EXECUTION}${id}`;
    case 'template':  return `${RESOURCE_KEY_PREFIX.TEMPLATE}${id}`;
    default:          return id;
  }
}

/**
 * Extract the raw entity ID from a prefixed resource key.
 *
 * @param {string} resourceKey - e.g. "artifact-clxy123"
 * @returns {{ type: string, id: string }} Parsed type and raw ID
 */
function parseResourceKey(resourceKey) {
  if (resourceKey.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)) {
    return { type: 'artifact', id: resourceKey.slice(RESOURCE_KEY_PREFIX.ARTIFACT.length) };
  }
  if (resourceKey.startsWith(RESOURCE_KEY_PREFIX.EXECUTION)) {
    return { type: 'execution', id: resourceKey.slice(RESOURCE_KEY_PREFIX.EXECUTION.length) };
  }
  if (resourceKey.startsWith(RESOURCE_KEY_PREFIX.TEMPLATE)) {
    return { type: 'template', id: resourceKey.slice(RESOURCE_KEY_PREFIX.TEMPLATE.length) };
  }
  return { type: 'unknown', id: resourceKey };
}

// ─── POV Context Extraction ──────────────────────────────────────────────────
// Shared v4 optimization: extract POV context during discovery for fast
// validation (~5ms cached) instead of per-request DB queries (~50-100ms).

/**
 * Extract a lightweight POV context object from a Prisma POV include.
 * Used by resource discovery to cache access control data alongside resources.
 *
 * @param {Object|null} pov - POV object from Prisma include (with team.members)
 * @returns {Object|undefined} Lightweight POV context for caching
 */
function extractPOVContext(pov) {
  if (!pov) return undefined;

  return {
    id: pov.id,
    ownerId: pov.ownerId,
    teamMemberIds: pov.team?.members?.map(m => m.userId) || [],
    isDemo: pov.metadata?.isDemo || false,
    tenantId: pov.metadata?.tenantId,
  };
}

// ─── Signed Download URL ─────────────────────────────────────────────────────
// Generates time-limited HMAC-signed URLs for artifact downloads.
// Used by SimpleResourceManager (discovery) and embedded-server.ts (download tool).

/**
 * Generate a signed download URL for an artifact.
 *
 * @param {string} artifactId - The artifact CUID
 * @param {string} [baseUrl] - Base URL (defaults to APP_BASE_URL or localhost)
 * @returns {string} Signed download URL valid for 1 hour
 */
function generateDownloadUrl(artifactId, baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000') {
  const SIGNING_KEY = process.env.ARTIFACT_SIGNING_KEY || (
    process.env.NODE_ENV === 'development'
      ? 'paichart-artifact-download-key-dev'
      : undefined
  );

  if (!SIGNING_KEY) {
    log.error('ARTIFACT_SIGNING_KEY required in production');
    return `${baseUrl}/api/artifacts/${artifactId}/public-download?error=config`;
  }

  const expires = Date.now() + (60 * 60 * 1000); // 1 hour
  const payload = `${artifactId}:${expires}`;
  const signature = crypto
    .createHmac('sha256', SIGNING_KEY)
    .update(payload)
    .digest('hex');

  const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
  return `${baseUrl}/api/artifacts/${artifactId}/public-download?token=${token}`;
}

// ─── Cache Defaults ──────────────────────────────────────────────────────────

const CACHE_DEFAULTS = Object.freeze({
  TTL_MS: 10 * 60 * 1000,           // 10 minutes
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_RESOURCES: 5000,
});

module.exports = {
  RESOURCE_KEY_PREFIX,
  CACHE_DEFAULTS,
  buildResourceKey,
  parseResourceKey,
  extractPOVContext,
  generateDownloadUrl,
};
