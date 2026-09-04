/**
 * Build TokenPayload from MCP user context (for direct handler calls).
 *
 * Maps MCP context shape { id, email, role } to handler shape { userId, email, role }.
 * See: mcp-api-context-differences.md for the field name difference.
 *
 * Security guarantees:
 * - MUST throw on missing user (never fall back to admin)
 * - Validates role against known enum values (parity with verifyAccessToken's validateRole())
 * - Guards against empty-string userId (field-leakage-prevention-pattern.md attack vector #4)
 *
 * @param {Object} enrichedContext - Context from ContextEnricher.enrichContext()
 * @returns {{ userId: string, email: string, role: string, tenantId?: string }}
 * @throws {Error} If user context is missing, incomplete, or has invalid role
 */

const VALID_ROLES = ['USER', 'DEMO_USER', 'ADMIN', 'SUPER_ADMIN'];

function buildTokenPayload(enrichedContext) {
  const user = enrichedContext?.user;
  if (!user) {
    throw new Error('Authentication required: No user context available');
  }

  const userId = user.id || user.userId;
  const email = user.email;
  const role = user.role;

  // Guard against empty strings (falsy but defined — field-leakage-prevention attack vector #4)
  // An empty userId could match empty ownerId records in Prisma queries
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Incomplete user context: userId is missing or empty');
  }

  if (!email || !role) {
    throw new Error('Incomplete user context: userId, email, and role are all required');
  }

  // Role validation — parity with verifyAccessToken's validateRole() in token-manager.ts:200
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid user role in context: ${role}`);
  }

  return {
    userId,
    email,
    role,
    tenantId: user.tenantId || undefined  // NB-1: future-proofing for multi-tenant support
  };
}

module.exports = { buildTokenPayload, VALID_ROLES };
