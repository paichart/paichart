/**
 * Hub Shared Middleware
 * Extracts repeated boilerplate from hub handlers into reusable functions.
 *
 * Patterns extracted (Feb 2026 code review):
 * - Auth context extraction (8 files)
 * - Service resolution with fuzzy matching + alias support (4 files)
 * - Ownership validation (4 files)
 * - Cache invalidation (3 files)
 *
 * @version 1.0.0
 * @created 2026-02-22
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { findBestMatch, getScoredSuggestions } = require('../../utils/fuzzy-search-helper');

const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-middleware' }));

// ============================================================
// Service Name Aliases (consolidated from health + tools handlers)
// ============================================================

const INTERNAL_SERVICE_ALIASES = {
  'paichart-project-service': 'pAIchart Project Service',
  'paichart-agent-service': 'pAIchart Agent Service',
  'paichart-analytics-service': 'pAIchart Analytics Service'
};

/**
 * Resolve service name alias if it's an internal service name
 * @param {string} serviceName - Service name (possibly internal format)
 * @returns {string} Display name if alias found, original name otherwise
 */
function resolveServiceAlias(serviceName) {
  if (!serviceName) return serviceName;
  return INTERNAL_SERVICE_ALIASES[serviceName.toLowerCase()] || serviceName;
}

// ============================================================
// Auth Context Extraction
// ============================================================

/**
 * Extract and validate auth context from MCP request context.
 * Handles both MCP direct (context.user) and API forwarded (context.apiUserContext) paths.
 * Throws a user-friendly error if not authenticated.
 *
 * U2 Phase D site #2 (2026-05-19): drops `token` from return shape, adds `azp`.
 * The Bearer-forwarded token model is replaced by per-call minting at downstream
 * sites (api-client.js, service-caller.ts, workflow-tools-handler.js). Consumers
 * that previously read `.token` to forward upstream must now mint a per-call
 * token with the correct per-service audience. The `azp` claim (Option α) is
 * surfaced so per-call mints can preserve client-binding for forensic trace.
 *
 * @param {Object} context - MCP request context
 * @param {Object} [context.user] - MCP direct path ({ id, email, role, azp })
 * @param {Object} [context.apiUserContext] - API forwarded path ({ userId, email, role, azp })
 * @param {string} [operation] - Operation name for error messages (e.g., 'Service deletion')
 * @returns {{ userId: string, userEmail: string, role: string, azp: string|undefined }}
 */
function extractAuthContext(context, operation = 'This operation') {
  // Support both MCP direct (user.id) and API forwarded (apiUserContext.userId) paths
  const userId = context?.user?.id || context?.apiUserContext?.userId;
  const userEmail = context?.user?.email || context?.apiUserContext?.email;
  const role = context?.user?.role || context?.apiUserContext?.role;
  // U2 Phase D site #2: azp (authorized party / client_id) surfaced for per-call
  // mint preservation. Populated by Phase E.5 in setUserContext / by Phase D site
  // #4 in InternalServiceRouter.normalizeContext. May be undefined for X-API-Key
  // auth (PAICHART_API_KEY has no azp claim — known forensic-chain limit per v3.1 N-5).
  const azp = context?.user?.azp || context?.apiUserContext?.azp;

  if (!userId) {
    throw new Error(
      `Authentication Required: ${operation} requires authentication. ` +
      'Please authenticate using:\n' +
      '- API Key: X-API-Key header\n' +
      '- OAuth: Microsoft/Google/GitHub sign-in\n' +
      '- JWT Bearer: Authorization header\n' +
      '- Claude Desktop: Authenticated session'
    );
  }

  return { userId, userEmail, role, azp };
}

// ============================================================
// Service Resolution (fuzzy matching + alias + context inference)
// ============================================================

/**
 * Resolve a service from args (serviceId, service_name, or context inference).
 * Handles alias resolution, fuzzy matching, and NOT_FOUND responses.
 *
 * @param {Object} params
 * @param {Object} params.args - Handler args ({ serviceId?, service_name? })
 * @param {Object} params.prisma - Prisma client
 * @param {Object} [params.options]
 * @param {string} [params.options.toolName] - Tool name for error responses
 * @param {string[]} [params.options.statusFilter] - Service status filter (default: ['ACTIVE'])
 * @param {string} [params.options.ownerFilter] - userId to filter by ownership (for delete/update)
 * @param {number} [params.options.minScore] - Minimum fuzzy match score (0=any, 100=contains, 500=startsWith, 1000=exact)
 * @returns {Promise<{ serviceId: string, service: Object|null, wasAlias: boolean, notFound: Object|null }>}
 */
async function resolveService({ args, prisma, options = {} }) {
  const {
    toolName = 'services',
    statusFilter = ['ACTIVE'],
    ownerFilter = null,
    minScore = 0
  } = options;

  const { serviceId, service_name } = args;
  let finalServiceId = serviceId;
  let wasAlias = false;

  // Service name lookup (fuzzy search with alias resolution)
  if (!finalServiceId && service_name) {
    // Skip alias resolution for owner-filtered queries (delete/update) —
    // aliases map to display names that don't match owned service names,
    // causing fuzzy search to silently match the wrong service
    const resolvedName = ownerFilter ? service_name : resolveServiceAlias(service_name);
    wasAlias = resolvedName !== service_name;
    if (wasAlias) {
      log.info({ alias: service_name, resolvedName }, 'Resolved service alias');
    }
    log.info({ serviceName: resolvedName }, 'Looking up service by name');

    const where = {
      status: statusFilter.length === 1 ? statusFilter[0] : { in: statusFilter }
    };
    if (ownerFilter) {
      where.configuration = { path: ['ownerId'], equals: ownerFilter };
    }

    const services = await prisma.mCPTool.findMany({
      where,
      select: { id: true, name: true },
      take: 100
    });

    const foundService = findBestMatch(
      services,
      resolvedName,
      'name',
      { threshold: minScore, logger: log, ambiguityThreshold: 0.1 }
    );

    if (foundService) {
      finalServiceId = foundService.id;
      log.info({ serviceName: foundService.name, serviceId: foundService.id }, 'Found service');
    } else {
      // Build NOT_FOUND response (don't throw — MCP SDK handles thrown errors as Internal Error)
      const suggestions = getScoredSuggestions(services, service_name, 'name', 3);
      const availableNames = services.map(s => s.name).slice(0, 5);

      const suggestionText = suggestions.length > 0
        ? suggestions.map(s => `"${s.title}" (${Math.round(s.score * 100)}% match)`).join(', ')
        : null;

      // BUG-REGISTRY-002 fix (2026-05-22): toolName-aware example action.
      // Previously hardcoded `action: "health"` even when called from `registry`
      // tool, which DOESN'T HAVE a `health` action (services tool does).
      // Mapping: registry → `tools` (inspect service tool schemas — the
      // closest registry-valid analogue); services + anything else → `health`.
      const exampleAction = toolName === 'registry' ? 'tools' : 'health';
      const exampleServiceName = suggestions[0]?.title || availableNames[0] || 'service-name';

      return {
        serviceId: null,
        service: null,
        wasAlias,
        notFound: {
          status: 'NOT_FOUND',
          message: `Service not found: "${service_name}"`,
          suggestions: suggestionText
            ? `Did you mean: ${suggestionText}?`
            : availableNames.length > 0
              ? `Available services: ${availableNames.join(', ')}`
              : 'No services found',
          example: `${toolName}(action: "${exampleAction}", service_name: "${exampleServiceName}")`,
          nextSteps: [
            'Use services(action: "discover") to see all available services',
            'Check spelling of service name',
            suggestions.length > 0
              ? `Try: service_name: "${suggestions[0].title}"`
              : 'Register your service with registry(action: "register")'
          ],
          _meta: {
            tool: toolName,
            timestamp: new Date().toISOString(),
            sdkNative: true
          }
        }
      };
    }
  }

  // (2026-07-28) The serviceId inference that used to sit here is deleted. It read
  // parameterNormalizer.getServiceContext(), whose writer had been a no-op since
  // 2026-05-23, so the guard could never fire. See the SERVICE-CONTEXT deletion
  // tombstone in lib/mcp/server/utils/parameter-normalizer.js.
  //
  // The `parameterNormalizer` option was removed with it (Protocol 11 Axis 6:
  // deleting a reader orphans what fed it) — this block was its only consumer,
  // and the two call sites in service-health-handler.js no longer pass it.

  return { serviceId: finalServiceId, service: null, wasAlias, notFound: null };
}

// ============================================================
// Ownership Validation
// ============================================================

/**
 * Validate that a user owns a service (or is admin).
 *
 * @param {string} userId - Current user's ID
 * @param {Object} service - Service record (must have configuration.ownerId)
 * @param {Object} utilities - HubUtilities instance (for isUserAdmin check)
 * @returns {Promise<{ isOwner: boolean, isAdmin: boolean }>}
 * @throws {Error} If user is neither owner nor admin
 */
async function validateOwnership(userId, service, utilities) {
  const isOwner = service.configuration?.ownerId === userId;
  const isAdmin = await utilities.isUserAdmin(userId);

  if (!isOwner && !isAdmin) {
    throw new Error(
      `Access denied. You can only modify services you own. ` +
      `Service owned by: ${service.configuration?.ownerEmail || 'unknown'}`
    );
  }

  return { isOwner, isAdmin };
}

// ============================================================
// Cache Invalidation
// ============================================================

/**
 * Invalidate the health cache after service mutation.
 *
 * NOTE (2026-07-27): the discovery response cache was DELETED — see the
 * "NO RESPONSE CACHE HERE" block in service-discovery-handler.js. Discovery
 * now reads through on every call, so it needs no invalidation. If a
 * Prisma-read-layer cache is ever reintroduced there (see that block for the
 * required shape), re-add its invalidation hook here.
 *
 * @param {Object} parent - Handler parent with optional serviceHealthHandler
 * @param {string} [serviceId] - Specific service ID for health cache (null for full clear)
 */
function invalidateServiceCaches(parent, serviceId = null) {
  if (parent?.serviceHealthHandler) {
    if (serviceId) {
      parent.serviceHealthHandler.clearHealthCache(serviceId);
    } else {
      parent.serviceHealthHandler.clearHealthCache();
    }
    log.info('Health cache invalidated');
  }
}

// ============================================================
// Endpoint URL Sanitization
// ============================================================

/**
 * Sanitize endpoint URLs by stripping sensitive query parameters.
 * Prevents API keys embedded in URLs from being leaked to MCP clients.
 */
function sanitizeEndpointUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['apikey', 'api_key', 'key', 'token', 'secret', 'password', 'auth', 'access_token'];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '***');
      }
    }
    return parsed.toString();
  } catch {
    return url; // Not a valid URL — return as-is
  }
}

module.exports = {
  INTERNAL_SERVICE_ALIASES,
  resolveServiceAlias,
  extractAuthContext,
  resolveService,
  validateOwnership,
  invalidateServiceCaches,
  sanitizeEndpointUrl
};
