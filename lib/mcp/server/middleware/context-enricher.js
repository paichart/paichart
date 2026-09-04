/**
 * Context Enrichment Middleware
 * Adds per-request user context for API forwarding
 * Prevents race conditions from global state
 *
 * P0-2 FIX: Per-Request Context Pattern
 * Replaces global user context with request-scoped isolation
 */

class ContextEnricher {
  /**
   * Enrich context with API user context for forwarding
   * CRITICAL: Per-request isolation (not global state)
   *
   * @param {Object} baseContext - Base context from MCP request
   * @param {Object} baseContext.user - Authenticated user object
   * @param {boolean} baseContext.authenticated - Authentication status
   * @returns {Object} Enriched context with apiUserContext
   */
  static enrichContext(baseContext) {
    // Defensive: handle undefined/null context (e.g., agent execution engine tool calls)
    if (!baseContext) {
      return { authenticated: false, apiUserContext: null };
    }

    const { user, authenticated } = baseContext;

    // Build enriched context with API forwarding info
    const enriched = {
      ...baseContext,

      // Per-request API user context (forwarded to handlers)
      // BC FIX: Validate user.id exists before rename to prevent undefined userId downstream
      // U2 Phase D site #6 (2026-05-19): drop `token` synthesis — downstream
      // sites mint per-call tokens with per-service audience instead of forwarding
      // the front-door Bearer. Add `azp` so per-call mints preserve client-binding.
      apiUserContext: authenticated && user && user.id ? {
        userId: user.id,          // User ID for filtering
        azp: user.azp,            // Authorized party (client_id) for per-call mint forensics
        email: user.email,        // User email
        role: user.role,          // User role
        isDemoUser: user.role === 'DEMO_USER'
      } : null
    };

    return enriched;
  }

  /**
   * Extract user context from enriched context
   *
   * @param {Object} enrichedContext - Context with apiUserContext
   * @returns {Object|null} User context for API forwarding
   */
  static getUserContext(enrichedContext) {
    return enrichedContext.apiUserContext;
  }

  /**
   * Validate that context has required user authentication
   *
   * U2 Phase D site #6 (2026-05-19): semantics shift from "has token" to
   * "has user identity". The token field is dropped post-Phase-D — per-call
   * mints happen at downstream sites (api-client.js, service-caller.ts).
   * User identity (userId) is the authoritative signal that auth happened.
   *
   * @param {Object} enrichedContext - Context to validate
   * @returns {boolean} True if user is authenticated
   */
  static isAuthenticated(enrichedContext) {
    return !!(enrichedContext.apiUserContext?.userId);
  }

  /**
   * Get user ID from context (convenience method)
   *
   * @param {Object} enrichedContext - Context with user info
   * @returns {string|null} User ID or null
   */
  static getUserId(enrichedContext) {
    return enrichedContext.apiUserContext?.userId || null;
  }

  /**
   * Get user role from context (convenience method)
   *
   * @param {Object} enrichedContext - Context with user info
   * @returns {string|null} User role or null
   */
  static getUserRole(enrichedContext) {
    return enrichedContext.apiUserContext?.role || null;
  }

  /**
   * Check if user is demo user (convenience method)
   *
   * @param {Object} enrichedContext - Context with user info
   * @returns {boolean} True if demo user
   */
  static isDemoUser(enrichedContext) {
    return enrichedContext.apiUserContext?.isDemoUser || false;
  }
}

module.exports = { ContextEnricher };
