/**
 * Hub Audit Service
 * Fire-and-forget audit logging for MCP Hub operations.
 *
 * Patterns applied:
 * - fire-and-forget-activity-logging-pattern.md (non-blocking writes)
 * - time-bomb-detection-pattern.md (Category 6: Singleton usage)
 *
 * @version 1.0.0
 * @created Jan 2026
 */

// TIME BOMB PREVENTION (Category 6): USE GLOBAL PRISMA SINGLETON
// Using `new PrismaClient()` here would create new connection pool per import
// → connection pool exhaustion → "too many connections" error
const { prisma: globalPrisma } = require('../../../../prisma');
const prisma = globalPrisma;
const { stderr, createAdapter } = require('../../mcp-logger');
const { sanitizeMetadataForAudit } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-audit' }));

/**
 * Audit event types for MCP Hub operations
 */
const HubAuditEvent = {
  SERVICE_PERMISSIONS_CHANGED: 'SERVICE_PERMISSIONS_CHANGED',
  SERVICE_MADE_PUBLIC: 'SERVICE_MADE_PUBLIC',
  SERVICE_MADE_PRIVATE: 'SERVICE_MADE_PRIVATE',
  SERVICE_RATE_LIMIT_CHANGED: 'SERVICE_RATE_LIMIT_CHANGED',
  SERVICE_HEALTH_CHECK_PATH_CHANGED: 'SERVICE_HEALTH_CHECK_PATH_CHANGED',
  SERVICE_MAX_EXECUTION_TIME_CHANGED: 'SERVICE_MAX_EXECUTION_TIME_CHANGED',
  // Phase 3 sec-ops L2 fix (2026-05-23): explicit audit event for service
  // deletion. Pino info-log alone is operational telemetry — different
  // retention/indexing/tamper-resistance profile from the Activity table.
  // GDPR right-to-erasure requires an immutable attestation trail.
  SERVICE_DELETED: 'SERVICE_DELETED',
};

/**
 * Log permissions change (fire-and-forget)
 * Pattern: fire-and-forget-activity-logging-pattern.md
 *
 * @param {string} serviceId - Service being modified
 * @param {string} userId - User making the change
 * @param {Object} change - { action, field, oldValue, newValue }
 * @param {Object} metadata - { source: 'MCP' | 'API' }
 */
function logPermissionsChange(serviceId, userId, change, metadata = {}) {
  // Fire-and-forget - no await, no blocking
  // Uses Activity table (no AuditLog model exists)
  // 2026-05-23 BUG-AUDIT-STORED-XSS D1 (task #188): change.oldValue +
  // change.newValue carry user-controlled service configuration values
  // (descriptions, endpoint URLs, capability strings). Without write-time
  // escape, payloads land in the Activity row's metadata JSONB column and
  // hit any future admin UI that renders audit history.
  prisma.activity.create({
    data: {
      userId,
      action: change.action,
      type: 'Security',  // Activity type for service permission changes
      metadata: sanitizeMetadataForAudit({
        serviceId,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        source: metadata.source || 'MCP',
        timestamp: new Date().toISOString(),
      })
    }
  }).catch(error => {
    // Log error but don't propagate - caller continues unaffected
    log.warn({ err: error }, 'Failed to log permissions change');
  });
}

/**
 * Log service configuration change (fire-and-forget)
 *
 * @param {string} serviceId - Service being modified
 * @param {string} userId - User making the change
 * @param {string} field - Field that was changed
 * @param {*} oldValue - Previous value
 * @param {*} newValue - New value
 * @param {Object} metadata - Additional context
 */
function logConfigChange(serviceId, userId, field, oldValue, newValue, metadata = {}) {
  const eventType = getEventTypeForField(field);

  // Fire-and-forget - no await
  // Uses Activity table (no AuditLog model exists)
  // BUG-AUDIT-STORED-XSS D1 sibling (config change site): same write-time
  // sanitize as the permissions-change site above.
  prisma.activity.create({
    data: {
      userId,
      action: eventType,
      type: 'Security',  // Activity type for service configuration changes
      metadata: sanitizeMetadataForAudit({
        serviceId,
        field,
        oldValue,
        newValue,
        source: metadata.source || 'MCP',
        timestamp: new Date().toISOString(),
      })
    }
  }).catch(error => {
    log.warn({ err: error }, 'Failed to log config change');
  });
}

/**
 * Map field names to audit event types
 * @param {string} field - Field name
 * @returns {string} Audit event type
 */
function getEventTypeForField(field) {
  const fieldMap = {
    publicAccess: HubAuditEvent.SERVICE_PERMISSIONS_CHANGED,
    rateLimit: HubAuditEvent.SERVICE_RATE_LIMIT_CHANGED,
    healthCheckPath: HubAuditEvent.SERVICE_HEALTH_CHECK_PATH_CHANGED,
    maxExecutionTime: HubAuditEvent.SERVICE_MAX_EXECUTION_TIME_CHANGED,
  };

  return fieldMap[field] || HubAuditEvent.SERVICE_PERMISSIONS_CHANGED;
}

/**
 * Log multiple changes at once (fire-and-forget)
 * Useful when registry(action: "update") modifies multiple fields
 *
 * @param {string} serviceId - Service being modified
 * @param {string} userId - User making the change
 * @param {Array<{field, oldValue, newValue}>} changes - Array of changes
 * @param {Object} metadata - Additional context
 */
function logMultipleChanges(serviceId, userId, changes, metadata = {}) {
  for (const change of changes) {
    logConfigChange(serviceId, userId, change.field, change.oldValue, change.newValue, metadata);
  }
}

module.exports = {
  logPermissionsChange,
  logConfigChange,
  logMultipleChanges,
  HubAuditEvent
};
