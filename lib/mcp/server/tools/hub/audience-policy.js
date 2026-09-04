/**
 * Per-service audience policy (RFC 8707 Resource Indicators).
 *
 * U2 Phase B (2026-05-19) — per IMPLEMENTATION-PLAN-v3.md.
 *
 * Each downstream MCP service gets a resource-specific audience identifier
 * derived from its service.name via NFKD-normalized lowercase + URL-safe
 * regex + dash collapse. Per-call tokens forwarded to a service carry
 * that audience; the service's verifier rejects audience mismatch, achieving
 * cross-service blast-radius isolation (a Snowflake-forwarded token cannot
 * replay at Databricks, /api/*, or any other service).
 *
 * Tenant model trajectory (folded architectural-review Important #3 — Pattern B):
 * This helper's signature is STABLE under Tier 3 multi-tenancy. Audience
 * represents RESOURCE identity (the service endpoint). Tenant represents
 * PRINCIPAL identity and will be carried as a separate JWT claim
 * (TokenPayload.tenantId?), NOT in the audience URI. Per RFC 8707 §1:
 * "the party in possession of a resource indicator value is the party who
 * needs to identify the resource." When Tier 3 lands, audienceForService(service)
 * signature does not change; the verifier gains a separate tenantId check.
 */

// Derived from APP_BASE_URL (2026-09-04, D4) — the SAME constants the inbound verifier
// and the OAuth callback flow use, so the four can never drift apart again.
const {
  MCP_FRONTDOOR_AUDIENCE,
  API_AUDIENCE: INTERNAL_API_AUDIENCE,
  MCP_SERVICE_AUDIENCE_PREFIX,
} = require('../../../../auth/public-base-url');

/**
 * Compute the per-service audience for outbound forwarding.
 * Convention: ${PUBLIC_BASE_URL}/mcp/<normalized-service-name> (MCP_SERVICE_AUDIENCE_PREFIX)
 *
 * Normalization pipeline (folded oauth-multi-provider CR-1 + arch-review Important #4):
 * 1. NFKD unicode normalize — handles diacritics + compatibility forms
 * 2. lowercase
 * 3. replace non-[a-z0-9-] with dash — URL-safe
 * 4. collapse runs of dashes
 * 5. trim leading/trailing dashes
 * 6. reject empty result (degenerate input like whitespace-only / pure punctuation)
 *
 * Examples:
 *   'Snowflake Service'      → 'snowflake-service'
 *   'Snowflake-Service'      → 'snowflake-service'  ← collision w/ above
 *   'Snowflake_Service'      → 'snowflake-service'  ← collision w/ above
 *   'Snowflake/Service'      → 'snowflake-service'  ← collision w/ above
 *   'Snowflake (Service)'    → 'snowflake-service'  ← collision w/ above
 *   'Café Analytics'         → 'cafe-analytics'
 *   'My   Service'           → 'my-service'
 *   ''                       → throws
 *   '   '                    → throws (normalizes to empty)
 *   '!!!'                    → throws (normalizes to empty)
 *
 * Collisions are CAUGHT at service-registration time (see
 * service-registration-handler.js) — two services that normalize to the same
 * audience defeat the entire blast-radius isolation goal.
 *
 * @param {Object} service - The MCPTool record (or any object with a `name` field)
 * @param {string} service.name - The service's display name
 * @returns {string} The full audience URI (${MCP_SERVICE_AUDIENCE_PREFIX}<normalized>)
 * @throws {Error} If service.name is missing or normalizes to an empty string
 */
function audienceForService(service) {
  if (!service?.name) {
    throw new Error('audienceForService requires service.name');
  }

  const normalized = String(service.name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new Error(
      `audienceForService: service.name "${service.name}" normalized to empty string ` +
      `(no a-z/0-9 characters after NFKD + lowercase). Choose a name with at least one alphanumeric character.`
    );
  }

  return `${MCP_SERVICE_AUDIENCE_PREFIX}${normalized}`;
}

module.exports = {
  audienceForService,
  MCP_FRONTDOOR_AUDIENCE,
  INTERNAL_API_AUDIENCE,
};
