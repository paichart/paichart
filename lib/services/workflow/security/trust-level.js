/**
 * Trust Level Utilities for MCP Hub Workflow Execution
 *
 * Shared module used by both:
 * - workflow-tools-handler.js (JavaScript path)
 * - service-caller.ts (TypeScript path)
 *
 * SECURITY: Controls JWT token exposure to external services.
 * Only trusted services receive the token.
 *
 * @see workflow-dual-handler-architecture.md
 * @see implementation-plan-v3.md (cline_docs/reviews/token-exposure-pov-scoping-2026-01-18/)
 */

const { mcpLogger, createAdapter } = require('../../../js-logger');
const { isTrustedInternalService, TRUSTED_INTERNAL_SERVICES } = require('../../../mcp/server/config/service-approval-policy');
const { sanitizeMetadataForAudit } = require('../../../mcp/server/tools/response-sanitizer');
const log = createAdapter(mcpLogger.child({ component: 'trust-level' }));

// ============================================
// Trust Level Constants
// ============================================

/**
 * Trust levels for service context exposure
 * Higher trust = more context (specifically: JWT token)
 */
const TrustLevel = {
  INTERNAL: 'INTERNAL',       // paichart-* services - full trust
  TRUSTED: 'TRUSTED',         // Localhost Docker services - full trust
  OWNER: 'OWNER',             // Caller owns the service - full trust
  TEAM_MEMBER: 'TEAM_MEMBER', // Service owner is POV team member - NO token (until RS256)
  SCOPED: 'SCOPED',           // Public service with POV context - NO token
  ANONYMOUS: 'ANONYMOUS'      // Public service, no POV - NO token
};

/**
 * Services routed internally (no HTTP, in-process)
 * These bypass all external security checks
 */
const INTERNAL_SERVICES = ['paichart-project-service'];

// BC70 FIX: Removed local TRUSTED_INTERNAL_SERVICES duplicate (had only 2 of 6 services).
// Now uses isTrustedInternalService() from service-approval-policy.js (single source of truth).

/**
 * Trust levels that receive JWT token
 *
 * PHASE 2 COMPLETE (RS256/JWKS):
 * RS256 signing and JWKS endpoint implemented. External services can now
 * validate pAIchart JWT tokens via GET /api/auth/jwks endpoint.
 *
 * TEAM_MEMBER services (owned by POV team members) now receive tokens
 * and can validate them securely using public key cryptography.
 *
 * @see app/api/auth/jwks/route.ts - JWKS endpoint
 * @see lib/auth/token-manager.ts - RS256 signing
 */
const TOKEN_RECEIVING_TRUST_LEVELS = new Set([
  TrustLevel.INTERNAL,
  TrustLevel.TRUSTED,
  TrustLevel.OWNER,
  TrustLevel.TEAM_MEMBER,  // ✅ PHASE 2: Enabled - external services can validate via JWKS
]);

// ============================================
// Trust Level Determination
// ============================================

/**
 * Determine trust level for a service
 *
 * Trust levels control what context is passed, specifically the JWT token.
 * povId and tenantId are always passed (they're just identifiers, not secrets).
 *
 * @param {Object} params - Parameters for trust determination
 * @param {string} params.serviceId - Service identifier (name or ID)
 * @param {Object} params.serviceRecord - Service record from database (MCPTool)
 * @param {string} params.userId - Calling user's ID
 * @param {string|null} params.povId - Current POV context (if any)
 * @param {Object} params.prisma - Prisma client for team membership lookup
 * @returns {Promise<string>} Trust level constant
 */
async function determineTrustLevel({ serviceId, serviceRecord, userId, povId, prisma }) {
  // Level 1: Internal pAIchart services - highest trust (in-process routing)
  if (INTERNAL_SERVICES.includes(serviceId)) {
    return TrustLevel.INTERNAL;
  }

  // Level 2: Trusted localhost services (Docker internal)
  // BC70 FIX: Use central isTrustedInternalService() to check both name and id
  if (isTrustedInternalService(serviceRecord || serviceId)) {
    return TrustLevel.TRUSTED;
  }

  // Level 3: Caller owns the service
  const serviceOwnerId = serviceRecord?.configuration?.ownerId;
  if (serviceOwnerId && serviceOwnerId === userId) {
    return TrustLevel.OWNER;
  }

  // Level 4: Caller is a team member of a POV owned by the service owner
  // SECURITY FIX: Check if CALLER is on team of POV owned by SERVICE OWNER
  // Prevents attack: Caller creating POV, adding service owner, stealing token
  if (povId && serviceOwnerId) {
    try {
      const isTeamMember = await prisma.teamMember.findFirst({
        where: {
          userId: userId,  // CALLER (not service owner!)
          team: {
            // 2026-05-17: POV.teamId is now @unique (1:1 with Team). Back-relation
            // is singular `pov`, not list `povs`. Match directly instead of `.some`.
            pov: {
              id: povId,
              ownerId: serviceOwnerId  // POV must be owned by service owner
            }
          }
        },
        select: { id: true }
      });

      if (isTeamMember) {
        return TrustLevel.TEAM_MEMBER;
      }
    } catch (error) {
      // Log but don't fail - fall through to lower trust levels
      log.warn('[TrustLevel] Team membership check failed:', error.message);
    }
  }

  // Level 5: Public service with POV context - scoped trust
  // F-SWEEP-2 (2026-07-17): was `configuration.publicAccess` — the PRE-standardization
  // location. Post-Jan-2026 the flag lives in the permissions column (written by
  // service-update-handler, read by checkServiceAccess); prod has ZERO services with
  // configuration.publicAccess, so this read was ALWAYS FALSE — public services never
  // reached SCOPED trust (fail-closed: they got ANONYMOUS). Callers must select/thread
  // the permissions column (workflow-tools-handler already did; service-caller fixed
  // same commit).
  const isPublic = serviceRecord?.permissions?.publicAccess === true;
  if (isPublic && povId) {
    return TrustLevel.SCOPED;
  }

  // Level 6: Public service without POV - minimal trust
  if (isPublic) {
    return TrustLevel.ANONYMOUS;
  }

  // Default: Service is not public and caller doesn't have special access
  // This should be caught by access control, but default to ANONYMOUS
  return TrustLevel.ANONYMOUS;
}

// ============================================
// Context Building
// ============================================

/**
 * Build service context based on trust level
 *
 * SIMPLIFIED APPROACH:
 * - povId and tenantId are ALWAYS passed (harmless identifiers)
 * - Only the JWT token is gated based on trust level
 * - Token is only passed to services in TOKEN_RECEIVING_TRUST_LEVELS
 *
 * @param {string} trustLevel - Determined trust level
 * @param {Object} contextData - Full context data available
 * @param {string} contextData.userId - User ID
 * @param {string} contextData.userEmail - User email
 * @param {string} contextData.userRole - User role
 * @param {string} contextData.token - Per-call-minted JWT token with per-service audience (U2 Phase D, 2026-05-19). Pre-Phase-D this was the Bearer-forwarded token from the front door; post-Phase-D it's freshly minted at workflow-tools-handler.js (mint-before-trust) with `aud: https://paichart.app/mcp/<service-name>` (RFC 8707 blast-radius isolation). Bearer-forward path is REMOVED.
 * @param {string|null} contextData.povId - POV ID
 * @param {string|null} contextData.tenantId - Tenant ID
 * @param {string} contextData.requestId - Request trace ID
 * @param {string} contextData.source - Source identifier
 * @returns {Object} Filtered context for service
 */
function buildServiceContext(trustLevel, contextData) {
  const {
    userId,
    userEmail,
    userRole,
    token,
    povId,
    tenantId,
    requestId,
    source = 'mcp_hub_workflow'
  } = contextData;

  // Base context - always included for all trust levels
  // povId and tenantId are just identifiers, safe to pass everywhere
  // trustLevel helps developers understand why they did/didn't get a token
  const baseContext = {
    userId,
    userEmail,
    userRole,
    povId: povId || null,
    tenantId: tenantId || null,
    requestId: requestId || `wf-${Date.now()}`,
    source,
    trustLevel  // NEW: Developer visibility (sec-ops recommendation)
  };

  // Token is only added for trusted services (TOKEN_RECEIVING_TRUST_LEVELS).
  if (TOKEN_RECEIVING_TRUST_LEVELS.has(trustLevel)) {
    // U2 Phase F.4 (2026-05-19, sec-ops Important-3): spread guard prevents
    // `token: undefined` from being set (per-call mint may have failed
    // upstream). Cleaner to simply not have the key than have it with undefined.
    return {
      ...baseContext,
      ...(token ? { token } : {})
    };
  }

  // For untrusted services: everything except token
  // They can still use povId/tenantId for their own scoping
  return baseContext;

  /*
   * PHASE 2 SCAFFOLDING (RS256):
   *
   * When RS256/JWKS is implemented, update TOKEN_RECEIVING_TRUST_LEVELS
   * to include TrustLevel.TEAM_MEMBER.
   *
   * See: TODO-jwks-public-key-auth.md for RS256 implementation
   */
}

// ============================================
// POV Requirement Checking
// ============================================

/**
 * Check if workflow uses external services without POV context
 *
 * Provides informational warnings about trust levels:
 * - Internal services (paichart-*) always receive INTERNAL trust + token
 * - External services without povId receive trust based on ownership:
 *   - OWNER trust (+ token) if you own the service
 *   - ANONYMOUS trust (no token) otherwise
 * - External services with povId receive SCOPED trust (no token, but scoped context)
 *
 * @param {Array} steps - Workflow steps
 * @param {string|null} povId - Provided POV ID
 * @returns {Object} { warning?: string, hint?: string }
 */
function checkPOVRequirement(steps, povId) {
  // Extract service names from steps
  const serviceNames = steps.map(step => step.service);

  // WARNING: External services without POV - trust level depends on ownership
  const externalServices = serviceNames.filter(s =>
    !INTERNAL_SERVICES.includes(s) &&
    !isTrustedInternalService(s)
  );

  if (externalServices.length > 0 && !povId) {
    return {
      warning: `External services detected without POV context. Trust level: ANONYMOUS (no token), OWNER (if you own them), or SCOPED (with povId).`,
      hint: 'Add povId for SCOPED trust and secure token passing'
    };
  }

  return {}; // No issues
}

// ============================================
// Cross-Service Trust Inheritance
// ============================================

/**
 * Trust cannot increase through service chains
 * If Service A (SCOPED) calls Service B (OWNER), B gets SCOPED trust
 *
 * @param {string} callerLevel - Trust level of the calling service
 * @param {string} targetLevel - Computed trust level of target service
 * @returns {string} Effective trust level (the lower of the two)
 */
function getEffectiveTrustLevel(callerLevel, targetLevel) {
  const trustOrder = [
    TrustLevel.ANONYMOUS,   // 0 - lowest
    TrustLevel.SCOPED,      // 1
    TrustLevel.TEAM_MEMBER, // 2
    TrustLevel.OWNER,       // 3
    TrustLevel.TRUSTED,     // 4
    TrustLevel.INTERNAL     // 5 - highest
  ];

  const callerIndex = trustOrder.indexOf(callerLevel);
  const targetIndex = trustOrder.indexOf(targetLevel);

  // Return the LOWER trust level (more restrictive)
  return callerIndex <= targetIndex ? callerLevel : targetLevel;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a trust level receives the JWT token
 *
 * @param {string} trustLevel - Trust level to check
 * @returns {boolean} True if this trust level receives the token
 */
function trustLevelReceivesToken(trustLevel) {
  return TOKEN_RECEIVING_TRUST_LEVELS.has(trustLevel);
}

/**
 * Check if a service is internal (in-process routing)
 *
 * @param {string} serviceId - Service identifier
 * @returns {boolean} True if this is an internal service
 */
function isInternalService(serviceId) {
  return INTERNAL_SERVICES.includes(serviceId);
}

// BC70 FIX: Local isTrustedInternalService removed — now imported from service-approval-policy.js

// ============================================
// Audit Logging (Phase 2)
// ============================================

/**
 * Log trust denial for security forensics
 *
 * Called when a service doesn't receive the JWT token due to insufficient
 * trust level. This creates an audit trail for security monitoring.
 *
 * Phase 2: Added with TEAM_MEMBER enablement to track when external
 * services are denied token access.
 *
 * @param {Object} prisma - Prisma client
 * @param {Object} params - Denial details
 * @param {string} params.userId - User ID
 * @param {string} params.serviceId - Service ID
 * @param {string} params.serviceName - Service name (for readability)
 * @param {string} params.trustLevel - Trust level assigned to service
 * @param {string|null} params.povId - POV ID (if applicable)
 * @param {string} params.reason - Human-readable denial reason
 */
async function logTrustDenial(prisma, {
  userId,
  serviceId,
  serviceName,
  trustLevel,
  povId,
  reason
}) {
  try {
    // BUG-AUDIT-XSS-2 sweep: serviceName + reason may carry user-controlled
    // strings (service name comes from DB write at registration; reason is
    // caller-supplied). Write-time sanitize.
    await prisma.activity.create({
      data: {
        userId,
        action: 'TRUST_DENIAL',
        type: 'Security',  // Categorize as security event
        metadata: sanitizeMetadataForAudit({
          serviceId,
          serviceName,
          trustLevel,
          povId: povId || null,
          reason: reason || `Token withheld: trust level ${trustLevel} does not receive tokens`,
          timestamp: new Date().toISOString()
        })
      }
    });
    log.info(`[TrustLevel] Audit logged: Token denied for ${serviceName} (${trustLevel})`);
  } catch (error) {
    // Don't fail workflow if audit logging fails
    log.error('[TrustLevel] Audit logging failed:', error.message);
  }
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Constants
  TrustLevel,
  INTERNAL_SERVICES,
  TRUSTED_INTERNAL_SERVICES,
  TOKEN_RECEIVING_TRUST_LEVELS,

  // Main functions
  determineTrustLevel,
  buildServiceContext,
  checkPOVRequirement,
  getEffectiveTrustLevel,

  // Utilities
  trustLevelReceivesToken,
  isInternalService,
  isTrustedInternalService,

  // Audit (Phase 2)
  logTrustDenial
};
