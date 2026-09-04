/**
 * Public Discovery Data Filter
 *
 * Security utility for authentication-aware data filtering in MCP Hub discovery endpoints.
 * Part of Plan 8: MCP-First Security Architecture.
 *
 * @module PublicDiscoveryFilter
 * @version 1.0.0
 * @description Core security functions:
 *   - Authentication-aware service data filtering
 *   - Sensitive field exclusion for public users
 *   - Enticing discovery responses to encourage registration
 *   - Pagination metadata integration (MCP Exposure Fix)
 *   - Prompt data filtering
 *
 * @security Protection Strategy:
 *   - Authenticated users: Full data access
 *   - Public users: Limited data (no endpoints, credentials, ownership info)
 *   - Explicitly excluded fields documented in comments
 *   - Enticing metadata to encourage registration
 *
 * @integration Used by:
 *   - ServiceDiscoveryHandler (services action: "discover")
 *   - UserServicesHandler (registry action: "list")
 *   - Public API endpoints
 */

/**
 * Filter service data based on authentication status
 *
 * @param {Object} service - Raw service data from database
 * @param {string} service.id - Service CUID
 * @param {string} service.name - Service name
 * @param {string} service.description - Service description
 * @param {Object} service.capabilities - Service capabilities object
 * @param {string} service.status - Service status
 * @param {string} service.version - Service version
 * @param {Object} [service.configuration] - Service configuration (contains sensitive data)
 * @param {string} [service.endpoint] - Service endpoint URL (HIDDEN for public)
 * @param {string} [service.ownerId] - Owner user ID (HIDDEN for public)
 * @param {number} [service.interactionCount] - Total interactions
 * @param {number} [service.rating] - Service rating
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 *
 * @returns {Object} Filtered service data
 * @returns {string} returns.id - Service CUID (always visible)
 * @returns {string} returns.name - Service name (always visible)
 * @returns {string} returns.description - Service description (always visible)
 * @returns {Object} returns.capabilities - Capabilities object (always visible)
 * @returns {string} returns.status - Service status (always visible)
 * @returns {string} returns.version - Service version (always visible)
 * @returns {string} returns.category - Service category (always visible)
 * @returns {number} returns.featureCount - Capability count (public: enticing metadata)
 * @returns {boolean} returns.isPopular - Popularity flag (public: enticing metadata)
 * @returns {number|null} returns.rating - Service rating (public: enticing metadata)
 *
 * @description Authentication-based filtering:
 *   - Authenticated: Returns full service object (no filtering)
 *   - Public: Returns limited data with enticing metadata
 *
 *   Public users DO NOT see:
 *   - endpoint (service URL)
 *   - configuration (except category)
 *   - ownerId, ownerEmail
 *   - apiKeys, authType
 *   - createdAt, updatedAt
 *
 * @example
 * const filtered = filterPublicServiceData(
 *   rawService,
 *   context.authenticated
 * );
 * // Public user: {id, name, description, capabilities, featureCount, isPopular}
 * // Authenticated: Full rawService object
 */
/**
 * Truncate description for browsing (full details available via registry action: "tools")
 * Extracts first paragraph or truncates to 150 chars
 */
const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'public-discovery-filter' }));
const { ensureObject } = require('../../../utils/ensure-object');

function truncateDescription(description) {
  if (!description) return description;

  // Normalize line endings before splitting — descriptions registered through
  // Windows clients or copy-pasted from rich-text sources can carry \r\n,
  // which would defeat the \n\n paragraph split (2026-05-13 bug #8).
  const normalized = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Try to get first paragraph (before double newline)
  const firstParagraph = normalized.split('\n\n')[0];

  // If first paragraph is reasonable length, use it
  if (firstParagraph.length <= 200) {
    return firstParagraph;
  }

  // Otherwise truncate to 150 chars at word boundary
  if (normalized.length <= 150) {
    return normalized;
  }

  const truncated = normalized.substring(0, 150);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 100 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/**
 * Sanitize configuration object to remove sensitive data
 * Phase 3a Critical Security Fix: Defense-in-depth credential protection
 *
 * 2026-05-23 (Round 2 Hub probe — sibling of M1): the `stripOwnerIdentity`
 * option projects out internal-authorization plumbing for non-owner /
 * non-admin callers (CUIDs, eval internals, createdBy provenance). The
 * registry-transparency model intentionally keeps `ownerEmail` + `approvalStatus`
 * visible — those are publisher-contact + verified-badge signals (npm/PyPI/
 * Docker Hub convention). Keep credentials + identity-plumbing stripped.
 *
 * @param {Object} config - Configuration object
 * @param {Object} [options]
 * @param {boolean} [options.stripOwnerIdentity=false] - When true, also strip
 *   ownerId, createdBy, evaluationResult (authorization plumbing not useful
 *   to callers who don't own / can't admin the service). ownerEmail and
 *   approvalStatus remain visible as publisher-contact + verification badge.
 * @returns {Object} Sanitized configuration (safe for responses)
 */
function sanitizeConfiguration(config, options = {}) {
  if (!config || typeof config !== 'object') return config;

  // List of sensitive keywords to match (lowercase for case-insensitive matching)
  const SENSITIVE_KEYWORDS = [
    'apikey', 'api_key',
    'secret', 'secretkey', 'secret_key',
    'password', 'pass', 'pwd',
    'credentials', 'creds',
    'token', 'accesstoken', 'access_token',
    'privatekey', 'private_key',
    'clientsecret', 'client_secret',
    'auth', 'authorization',
  ];

  // Deep clone to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(config));

  // Remove sensitive keys at all levels (recursive)
  function removeSensitiveKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    for (const key of Object.keys(obj)) {
      // Check if key matches sensitive pattern (case-insensitive)
      // Remove underscores for matching (privateKey matches private_key)
      const normalizedKey = key.toLowerCase().replace(/_/g, '');
      const shouldRemove = SENSITIVE_KEYWORDS.some(keyword => {
        const normalizedKeyword = keyword.replace(/_/g, '');
        return normalizedKey.includes(normalizedKeyword) || normalizedKey === normalizedKeyword;
      });

      if (shouldRemove) {
        delete obj[key];
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        removeSensitiveKeys(obj[key]);
      }

      // Sanitize endpoint URLs (remove API keys from query params)
      if (key === 'endpoint' && typeof obj[key] === 'string') {
        obj[key] = sanitizeEndpointUrl(obj[key]);
      }
    }

    return obj;
  }

  removeSensitiveKeys(sanitized);

  if (options.stripOwnerIdentity) {
    delete sanitized.ownerId;
    delete sanitized.createdBy;
    delete sanitized.evaluationResult;
  }

  return sanitized;
}

/**
 * Sanitize endpoint URL to remove API keys from query parameters
 * Phase 3a Critical Security Fix: Strip credentials from URLs
 *
 * @param {string} url - Endpoint URL
 * @returns {string} Sanitized URL (credentials removed)
 */
function sanitizeEndpointUrl(url) {
  if (!url || typeof url !== 'string') return url;

  try {
    const urlObj = new URL(url);

    // Sensitive query parameter names
    const SENSITIVE_PARAMS = [
      'apikey', 'api_key', 'apiKey',
      'key', 'token', 'access_token', 'accessToken',
      'secret', 'password', 'pwd',
      'auth', 'authorization',
      'client_secret', 'clientSecret',
    ];

    // Remove sensitive query parameters
    for (const param of SENSITIVE_PARAMS) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    }

    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, return original (not a valid URL)
    return url;
  }
}

// ⚠️ 2026-07-28 — DO NOT DELETE THE `isAuthenticated === false` BRANCH BELOW.
//
// It is unreachable in production today: PUBLIC_TOOLS is empty, tool-security.js
// requires auth before any handler runs, and the single production call site
// (service-discovery-handler.js) passes a hardcoded `true`. That makes it look
// like dead code worth tidying — it was flagged as exactly that during the
// 2026-07-27 review, and the tidy-up was the wrong call.
//
// The branch is a FAIL-SAFE DEFAULT, not residue. `isAuthenticated` defaults to
// false, so any caller that omits the argument, or passes an undefined variable,
// falls to the REDUCED shape (no endpoint, no configuration, no ownerEmail).
// Delete it and that same mistake yields the FULL authenticated payload instead —
// failing open, inside a security filter, to remove code that costs nothing.
//
// The correct treatment of an unreachable fail-safe is to keep it and PIN it, not
// to remove it. scripts/test-phase-3a-credential-protection.ts asserts the reduced
// shape and the omitted-argument default, so a future deletion fails CI rather
// than silently widening the response.
function filterPublicServiceData(service, isAuthenticated = false, options = {}) {
  if (!service) return null;

  // Authenticated users see full service details (with sanitized configuration)
  // Phase 3a: Always sanitize configuration (defense-in-depth)
  if (isAuthenticated) {
    log.info({ serviceName: service.name }, 'Authenticated access - returning service data');
    const sanitizedConfig = sanitizeConfiguration(service.configuration, {
      stripOwnerIdentity: options.stripOwnerIdentity === true
    });
    // Strip evaluationResult.serviceData — redundant full registration payload (~2-5k tokens per service)
    // Keeps evaluation verdict (riskLevel, risks, approvalRecommendation) for admin context
    if (sanitizedConfig?.evaluationResult?.serviceData) {
      delete sanitizedConfig.evaluationResult.serviceData;
    }
    // 2026-05-23 (Round 2 Hub probe): permissions object carries authorization
    // plumbing (canDelete[], canModify[], owner userId) that is internal-only
    // for non-owner / non-admin callers. publicAccess (the boolean badge) stays.
    let sanitizedPermissions = service.permissions;
    if (options.stripOwnerIdentity === true && sanitizedPermissions && typeof sanitizedPermissions === 'object') {
      const { owner: _o, canDelete: _cd, canModify: _cm, ...rest } = sanitizedPermissions;
      sanitizedPermissions = rest;
    }
    return {
      ...service,
      description: service.description,
      configuration: sanitizedConfig,  // Phase 3a: Critical security fix
      permissions: sanitizedPermissions,
    };
  }

  // Public users see limited information
  log.info({ serviceName: service.name, securityEvent: true }, 'Public access - filtering sensitive data');

  return {
    // Safe public fields
    id: service.id,
    name: service.name,
    description: truncateDescription(service.description),  // Truncate for faster browsing
    capabilities: ensureObject(service.capabilities, {}, 'publicFilter.capabilities'),
    status: service.status,
    version: service.version,
    category: service.configuration?.category || 'general',

    // Enticing metadata to encourage registration
    //
    // 2026-07-28 — `isPopular` and `rating` REMOVED. Both read fields that do not
    // exist on MCPTool (verified against prisma/schema.prisma): the model has
    // `interactions` (a relation) but no `interactionCount`, and no `rating` at all.
    // So `service.interactionCount > 100` was `undefined > 100` — permanently false —
    // and `service.rating || null` was permanently null. Two fields that had never
    // once carried a value. Same phantom-field class as the `service.userId` test in
    // service-health-handler.js fixed earlier the same day (MCPTool has no `userId`
    // either), and the same reason both survived: this is an untyped .js file, where
    // a nonexistent property reads as undefined instead of failing. In a .ts file
    // tsc rejects both with TS2339 — verified.
    //
    // Removed rather than repaired: this shape is the spec of what a public caller
    // may see, and a spec listing fields that never worked is a misleading spec. If
    // popularity is wanted later, derive it from a real aggregate (a _count on
    // `interactions`), not from a field that does not exist.
    //
    // `featureCount` retained but CORRECTED — it counted the top-level keys of the
    // capabilities blob (tools/resources/prompts), so it returned ~3 for every
    // service regardless of content. Now counts actual capability entries.
    featureCount: (() => {
      const caps = ensureObject(service.capabilities, {}, 'publicFilter.featureCount');
      return ['tools', 'resources', 'prompts']
        .reduce((n, k) => n + (Array.isArray(caps[k]) ? caps[k].length : 0), 0);
    })(),

    // Explicitly exclude sensitive fields
    // endpoint: HIDDEN
    // configuration: HIDDEN (except category)
    // ownerId: HIDDEN
    // ownerEmail: HIDDEN
    // apiKeys: HIDDEN
    // authType: HIDDEN
    // createdAt: HIDDEN
    // updatedAt: HIDDEN
  };
}

/**
 * Filter an array of services
 *
 * 2026-05-23 (Round 2 Hub probe): `optionsFor` is a per-service factory so
 * callers can pass per-service stripOwnerIdentity (computed from per-service
 * isOwner OR global isAdmin). Pre-fix this loop was uniform-options only,
 * which is why services.discover leaked ownerId / permissions.canDelete etc.
 * for ANY service in the bulk response.
 *
 * @param {array} services - Array of service objects
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 * @param {(service: object) => object} [optionsFor] - Optional per-service
 *   options factory (returns { stripOwnerIdentity }). When omitted, no
 *   per-service projection is applied.
 * @returns {array} - Filtered services array
 */
function filterServiceArray(services, isAuthenticated, optionsFor) {
  if (!Array.isArray(services)) return [];

  return services.map(service => {
    const opts = typeof optionsFor === 'function' ? optionsFor(service) : undefined;
    return filterPublicServiceData(service, isAuthenticated, opts);
  });
}

// PUBLIC-RESPONSE deletion (2026-07-28): `createPublicDiscoveryResponse` and
// `filterPublicPromptData` are deleted. Both had ZERO callers — no external
// reference and no use inside this module.
//
// They are residue of the unauthenticated access model retired by Phase 3c:
// PUBLIC_TOOLS is empty, tool-security.js requires auth before any handler runs,
// and filterServiceArray is invoked with a hardcoded `true` from the only call
// site (service-discovery-handler.js). Nothing can reach a public response path.
//
// createPublicDiscoveryResponse was ALREADY KNOWN DEAD in January 2026 — the
// Phase 3 public-removal review recorded "No longer called" and "Can remove"
// (cline_docs/reviews/hub-ux-enhancement-2026-01-30/). The import was removed;
// the function was not. It then survived six months. Per
// [[feedback_defend_vs_delete_dead_code]]: at zero callers, delete beats defend —
// git history is the rollback reference.
//
// NOT deleted, and do not "tidy" it by the same reasoning: `filterPublicServiceData`
// also has zero EXTERNAL references, but is called internally by filterServiceArray
// and is load-bearing for every discovery response. External-reference count alone
// would have condemned it.
//
// Its `isAuthenticated === false` branch is probably dead too, for the same Phase 3c
// reason — but that is surgery inside a live security filter, not an export removal,
// and is deliberately left alone.

/**
 * Create an authenticated discovery response
 * MCP Exposure Fix: Now includes pagination metadata
 * @param {array} services - All accessible services
 * @param {object} user - User object
 * @param {object} paginationMetadata - Pagination metadata from MetadataEnhancer (optional)
 * @returns {object} - Discovery response object
 */
function createAuthenticatedDiscoveryResponse(services, user, paginationMetadata = null) {
  const response = {
    services,
    // `total` here is the RETURNED count (post-filter, post-limit) — the house
    // convention shared with prompt-list-handler.js and user-services-handler.js.
    // It is NOT the registry-wide match count; that is `pagination.total`.
    //
    // 2026-07-28: `returned` added alongside it. Until the pagination fix that
    // day, `pagination.total` was ALSO the page length, so the two agreed and the
    // ambiguity was masked by the bug. With `pagination.total` now correct, a
    // response can read `total: 1` beside `pagination.total: 4`, and the consumer
    // here is a REASONER, not a parser — an inline comment does not reach it.
    // Emitting both names makes the pair self-describing (total === returned,
    // distinct from the larger pagination.total) without a contract break.
    // Same shape prompt-list-handler.js already returns. Protocol 10: this is a
    // fact an AI consumer acts on, so the wrong reading has to be made hard.
    total: services.length,
    returned: services.length,
    authenticated: true,
    // 2026-07-28: SUPER_ADMIN was falling through to 'registered' — the same label an
    // ordinary USER gets. Under Protocol 10 `tier` is a FACT an autonomous consumer acts
    // on, and this one was wrong in the UNDER-privileged direction: an agent reading
    // 'registered' for a SUPER_ADMIN may decline operations it is entitled to perform.
    // The sibling handler already got this right (user-services-handler maps both roles
    // to 'full_access'), so this was an inconsistency inside one subsystem, not a
    // deliberate distinction. Mapped to the existing 'admin' rather than inventing a
    // third tier value, which would be a contract change for no gain.
    tier: (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'admin' : 'registered',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    capabilities: {
      canRegisterServices: true,
      canExecuteServices: true,
      serviceQuota: user.serviceQuota || 10,
      currentServices: user.serviceCount || 0,
    },
  };

  // MCP Exposure Fix: Add pagination metadata if available
  if (paginationMetadata) {
    response.pagination = paginationMetadata;
  }

  return response;
}

module.exports = {
  filterPublicServiceData,
  filterServiceArray,
  createAuthenticatedDiscoveryResponse,
  sanitizeConfiguration,  // Phase 3a: Export for testing and reuse
  sanitizeEndpointUrl,    // Phase 3a: Export for testing and reuse
  truncateDescription,    // 2026-08-21: reused by discover's lean mode (payload de-bloat)
};