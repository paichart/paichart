/**
 * Service Discovery Handler
 *
 * Handles MCP service discovery with capability search, category filtering,
 * fuzzy matching, and authentication-aware data filtering.
 *
 * @class ServiceDiscoveryHandler
 * @description Provides comprehensive service discovery including:
 *   - Capability-based search (tools, resources, description matching)
 *   - Category filtering (6 global categories)
 *   - Performance criteria filtering (success rate, response time)
 *   - Authentication-aware data filtering (public vs authenticated views)
 *   - Pagination with metadata enhancement
 *   - Parameter intelligence (service context setting)
 *   - Fuzzy search for flexible matching
 *
 * @version 1.0.0
 * @author pAIchart MCP Hub Team
 */

const { SDKParameterNormalizer } = require('../../utils/parameter-normalizer');
const { MetadataEnhancer } = require('../../utils/metadata-enhancer');
const { enhancedOperationError } = require('./error-helpers');
// Full schema validation performed upstream (mcp-server-v5.js validateToolInput)
const { extractAuthContext } = require('./hub-shared-middleware');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-discovery' }));

class ServiceDiscoveryHandler {
  /**
   * Creates Service Discovery Handler
   *
   * @param {Object} prisma - Prisma client instance
   * @param {Object} utilities - Hub utilities for access checks
   * @param {SDKParameterNormalizer} [parameterNormalizer] - Parameter normalizer instance
   */
  constructor(prisma, utilities = null, parameterNormalizer = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parameterNormalizer = parameterNormalizer || new SDKParameterNormalizer();
  }

  // ────────────────────────────────────────────────────────────────────
  // NO RESPONSE CACHE HERE — DELIBERATE. Do not reintroduce one naively.
  //
  // A 60s response cache lived here ("Phase A Performance") from 2026-04
  // until 2026-07-27. It was removed after a specialist panel
  // (cline_docs/reviews/hub-discovery-cache-caller-identity-2026-07-27/
  //  PANEL-SYNTHESIS.md) found it served one caller's response to another.
  //
  // Two independent defects, both structural rather than incidental:
  //
  //   1. IDENTITY LEAK. The cached unit was the FULL response, and
  //      createAuthenticatedDiscoveryResponse (public-discovery-filter.js)
  //      bakes the CALLER'S OWN identity into it — user{id,email,role},
  //      tier, capabilities.currentServices. Those leak on EVERY cross-user
  //      hit with no ownership precondition, so unlike the per-service
  //      ownership strip they are not blunted by registry topology. `tier`
  //      could tell a plain USER they were tier:'admin' — an authority
  //      misstatement an autonomous consumer acts on (Protocol 10).
  //
  //   2. CACHE POISONING. The key was built from RAW args, before
  //      parameterNormalizer ran, while the body was built from NORMALIZED
  //      args. So `include_schemas:true` was cached under the *lightweight*
  //      key, and a later bare discover received a schema-laden body.
  //      Likewise min_success_rate/max_response_time: a filtered subset
  //      served to a caller who asked for the whole registry.
  //
  // The invariant (pattern: cache-key-as-trust-boundary): a cache in front
  // of an authorization filter relocates the trust boundary to the cache
  // key, making the key a security control. Nothing here was caller-
  // independent enough to earn that surface: the cacheable region reduces
  // to the raw Prisma rows from a small, indexed table, while the expensive
  // part (per-service projection + envelope assembly) is caller-dependent
  // and must run per request regardless.
  //
  // IF YOU NEED A CACHE LATER (trigger: registry > ~200 services, or a
  // measurable discover p99 regression), cache at the PRISMA-READ layer
  // only — {services, total} for a given where+skip+take, keyed from
  // NORMALIZED args — and build the entire response envelope AFTER
  // retrieval. Never cache anything downstream of filterServiceArray or
  // createAuthenticatedDiscoveryResponse.
  //
  // Positive examples of the invariant done right: app/api/pov/route.ts:222
  // and lib/tasks/handlers/get.ts:69 (both key on userId AND role).
  // ────────────────────────────────────────────────────────────────────

  /**
   * Discover MCP services by capability or criteria
   *
   * @param {Object} args - Discovery filter arguments
   * @param {string} [args.capability] - Filter by capability (tool, resource, or description match)
   * @param {string} [args.category] - Filter by service category
   * @param {string} [args.status='ACTIVE'] - Filter by status (ACTIVE, INACTIVE, ALL)
   * @param {number} [args.minSuccessRate] - Minimum success rate threshold
   * @param {number} [args.maxResponseTime] - Maximum response time threshold (ms)
   * @param {number} [args.limit=20] - Maximum results to return
   * @param {number} [args.page=1] - Page number for pagination
   * @param {Object} [context] - User authentication context (optional)
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} Discovery results
   * @returns {Array<Object>} returns.services - Matching services (filtered by auth status)
   * @returns {number} returns.total - Total matching services
   * @returns {Object} returns.pagination - Pagination metadata
   *
   * @description Discovers MCP services with authentication-aware filtering.
   *   Public users see limited info; authenticated users see full details.
   *   Sets service context for parameter intelligence in subsequent calls.
   *
   * @example
   * const result = await handler.handle({
   *   capability: 'monitoring',
   *   minSuccessRate: 90,
   *   limit: 10
   * }, { user: { id: 'user123' } });
   */
  async handle(args, context) {
    try {
      // Note: Full schema validation already performed upstream (mcp-server-v5.js validateToolInput)
      // Dispatcher strips 'action' before passing params here, so re-validating against
      // the full services schema would fail on the missing 'action' field.

      // Normalize parameters
      args = this.parameterNormalizer.normalizeForTool('services.discover', args);

      // Import public discovery filter
      // Phase 3c: Always authenticated (tool-security.js enforces before handler)
      const { filterServiceArray, createAuthenticatedDiscoveryResponse, truncateDescription } =
        require('../public-discovery-filter');

      // Standardized auth extraction (defense-in-depth with tool-security.js)
      const { userId, userEmail } = extractAuthContext(context, 'Service discovery');

      // BC42 FIX: Log only expected fields, not full user-provided args object
      log.info({ capability: args.capability, status: args.status, category: args.category, userId }, 'Service discovery called');

      const where = {
        status: args.status === 'ALL' ? undefined : (args.status || 'ACTIVE')
      };

      // Filter by capability if specified
      if (args.capability) {
        where.OR = [
          {
            capabilities: {
              path: ['tools'],
              array_contains: args.capability
            }
          },
          {
            capabilities: {
              path: ['resources'],
              array_contains: args.capability
            }
          },
          {
            description: {
              contains: args.capability,
              mode: 'insensitive'
            }
          }
        ];
      }

      // Filter by category if specified
      if (args.category) {
        log.debug({ category: args.category }, 'Filtering by category');
        where.configuration = {
          path: ['category'],
          equals: args.category
        };
        log.debug({ where }, 'Where clause');
      }

      // Filter by performance criteria
      if (args.minSuccessRate) {
        where.successRate = { gte: args.minSuccessRate };
      }

      if (args.maxResponseTime) {
        where.responseTime = { lte: args.maxResponseTime };
      }

      // MCP Exposure Fix: Get total count for pagination metadata
      // UX Enhancement: Default to 15 when no category (encourage focused discovery)
      // BC41 FIX: Clamp limit and page from MCP tool args to prevent DoS/negative skip
      const limit = Math.min(Math.max(1, args.limit || (args.category ? 20 : 15)), 200);
      const page = Math.max(1, args.page || 1);
      const skip = (page - 1) * limit;

      // Phase A Step 1: Parallel queries (40-50% faster)
      // Run count, findMany, and user-owned count in parallel
      // Finding #5 fix (2026-04-08): previously `currentServices` in the response
      // capability block was always 0 because nothing populated `context.user.serviceCount`.
      // Add an authoritative count of services owned by this user so the quota UX is accurate.
      const [total, services, userOwnedServiceCount] = await Promise.all([
        this.prisma.mCPTool.count({ where }),
        this.prisma.mCPTool.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            version: true,
            capabilities: true,
            status: true,
            responseTime: true,
            successRate: true,
            lastHeartbeat: true,
            configuration: true,  // Phase 3a: Sanitized by filterServiceArray
            permissions: true,
            createdAt: true,
            credentials: false,  // Phase 3a: NEVER return encrypted credentials
          },
          orderBy: [
            { successRate: 'desc' },
            { responseTime: 'asc' }
          ],
          skip,
          take: limit
        }),
        this.prisma.mCPTool.count({
          where: {
            configuration: { path: ['ownerId'], equals: userId },
          },
        }),
      ]);

      // Phase 3b: Show ALL services (transparency model)
      // Specialist consensus: Better UX to show full ecosystem
      // Authorization still enforced in services(action: 'call') via checkServiceAccess()
      // userId already defined above (Phase 3c)
      const isAdmin = await this.utilities.isUserAdmin(userId);

      // Add access hints to each service (for transparency)
      const servicesWithAccessHints = services.map(service => {
        const isOwner = service.configuration?.ownerId === userId;
        const isPublic = service.permissions?.publicAccess === true;
        const isOwnerOrAdmin = isOwner || isAdmin;
        const canCall = isPublic || isOwnerOrAdmin;

        return {
          ...service,
          _canCall: canCall,  // Hint: Can this user call this service?
          _accessHint: canCall ? null : '🔒 Private - Contact owner for access',
          _isOwnerOrAdmin: isOwnerOrAdmin  // internal-only; stripped before response
        };
      });

      const accessFiltered = servicesWithAccessHints;
      log.info({ totalServices: services.length, filteredServices: accessFiltered.length }, 'Access filtering applied');

      // Phase 3c: Filter services (sanitize configuration, always authenticated)
      // filterServiceArray applies sanitizeConfiguration (defense-in-depth)
      //
      // 2026-05-23 (Round 2 Hub probe — M1 sibling fix): pass per-service
      // stripOwnerIdentity flag. Non-owner / non-admin callers see ownerEmail
      // + approvalStatus (publisher-contact + verified badge — npm/PyPI/Docker
      // Hub convention) but NOT ownerId / createdBy / evaluationResult /
      // permissions.canDelete[]/canModify[]/owner (internal authorization
      // plumbing). Pre-fix discover leaked all of these for ANY service in
      // the bulk response. See user memory feedback_bc2_audits_two_axes.md
      // and Phase 2.5 Q1 (sibling-branch sweep) — the M1 fix that covered
      // services.health (per-service drilldown) had to be paired with this
      // services.discover fix (bulk endpoint) to close the same class.
      let filteredServices = filterServiceArray(accessFiltered, true, (s) => ({
        stripOwnerIdentity: s._isOwnerOrAdmin !== true
      })).map(s => {
        // Strip internal flag before response (don't leak to caller)
        const { _isOwnerOrAdmin: _internal, ...rest } = s;
        return rest;
      });

      // Phase A: Schema depth control (includeSchemas parameter)
      // Default: Lightweight discovery — tool NAMES only (2026-08-21 de-bloat).
      // Formerly this mode kept per-tool descriptions and stripped only inputSchema;
      // measured in prod (follow-up doc below), descriptions were 64.6KB of a 76KB
      // response — ~10× the agent tool-loop's 8,000-char Tier-1 cap, so any agent
      // selecting a service silently saw ~10% of the list. discover is the SELECTION
      // step of the documented two-step (discover → registry(action:'tools')); full
      // per-tool detail lives in registry(action:'tools'), and includeSchemas:true
      // remains the unchanged one-call escape hatch (descriptions + inputSchema).
      // Guard: scripts/test-discover-payload-budget.ts (test:discover-budget).
      // See cline_docs/follow-ups/services-discover-payload-bloat-2026-08-21.md +
      // cline_docs/reviews/discover-payload-debloat-2026-08-21/.
      const includeSchemas = args.includeSchemas !== undefined ? args.includeSchemas : false;

      if (!includeSchemas && filteredServices.length > 0) {
        log.debug('Lightweight mode: tool names only (detail via registry action:tools)');
        filteredServices = filteredServices.map(service => {
          // Lean the service description to its first paragraph (mechanical prefix
          // cut, flagged as a fact when applied — full text via registry/health).
          const leanDescription = truncateDescription(service.description);
          const descriptionTruncated = leanDescription !== service.description;

          // Project configuration to the selection fields. Drops the
          // evaluationResult verdict prose (never needed to CHOOSE a service);
          // keeps type/endpoint (the isInternal detection below reads both).
          const cfg = service.configuration || {};
          const leanConfiguration = {
            ...(cfg.category !== undefined && { category: cfg.category }),
            ...(cfg.type !== undefined && { type: cfg.type }),
            ...(cfg.serviceType !== undefined && { serviceType: cfg.serviceType }),
            ...(cfg.transport !== undefined && { transport: cfg.transport }),
            ...(cfg.endpoint !== undefined && { endpoint: cfg.endpoint }),
            ...(cfg.approvalStatus !== undefined && { approvalStatus: cfg.approvalStatus }),
            ...(cfg.ownerEmail !== undefined && { ownerEmail: cfg.ownerEmail }),
            // Ownership plumbing: present here ONLY when the upstream sanitize
            // kept it (owner/admin callers — 2026-05-23 ownership contract,
            // pinned by test:hub-discovery-caller-isolation). The projection
            // must not re-strip what sanitization deliberately granted.
            ...(cfg.ownerId !== undefined && { ownerId: cfg.ownerId }),
            ...(cfg.createdBy !== undefined && { createdBy: cfg.createdBy }),
          };

          const base = {
            ...service,
            description: leanDescription,
            ...(descriptionTruncated && { descriptionTruncated: true }),
            configuration: leanConfiguration,
          };

          if (!service.capabilities || !service.capabilities.tools) {
            return base;
          }

          // Tool NAMES only (legacy string-array form — every consumer accepts it;
          // the only in-tree reader maps to names, execution-hub-guidance.ts).
          const lightweightTools = service.capabilities.tools.map(tool =>
            typeof tool === 'string' ? tool : tool.name
          );

          return {
            ...base,
            capabilities: {
              ...service.capabilities,
              tools: lightweightTools
            },
            // Per-service facts only. The "use registry(action:'tools')" guidance
            // formerly repeated here per service is stated once in nextSteps and
            // once in schemaMode.recommendation — response-level, not per row.
            _schemaInfo: {
              toolCount: lightweightTools.length,
              schemasAvailable: true
            }
          };
        });
        log.debug({ serviceCount: filteredServices.length }, 'Lightweight response (names-only tools)');
      }

      // BUG-HUB-003 fix (2026-05-22): mark internal services so consumers
      // (Claude Desktop, ChatGPT, dashboards) understand that null metrics are
      // by design, not a bug or missing measurement. Internal services run
      // in-process (paichart-recommendation, paichart-kpi, paichart-project)
      // and don't go through the HTTP probe loop that populates responseTime
      // and successRate. See cline_docs/reviews/mcp-hub-domain-testing-2026-
      // 05-22/MCP-HUB-DOMAIN-TESTING-REPORT.md Stage 5 BUG-HUB-003.
      filteredServices = filteredServices.map(service => {
        const isInternal =
          service.configuration?.type === 'internal' ||
          service.configuration?.endpoint?.startsWith('internal://');
        if (isInternal) {
          // 2026-05-23 fix: explicitly null out the HTTP-only metric fields
          // for internal services (stale lastHeartbeat looked like "service
          // hasn't checked in"). F-SWEEP-3 correction (2026-07-17, panel):
          // successRate is NOT HTTP-only for internals — the probe loop skips
          // internal:// so their successRate is fed ONLY by real tracked calls,
          // making it the purest call metric in the system (project-service:
          // 1,684 interactions). Nulling it while claiming "not applicable"
          // was itself a false fact. Keep successRate; null only the fields
          // that genuinely don't apply (probe RTT + probe liveness).
          return {
            ...service,
            responseTime: null,
            lastHeartbeat: null,
            _metricsApplicable: false
          };
        }
        return service;
      });
      // F-SWEEP-3 C3 (2026-07-17, panel): external services' stored metrics are
      // probe-dominated (~1000:1 probes:calls at 5-min cadence) — publish the
      // BASIS as a fact so consumers can't mistake availability for call quality
      // or probe RTT for call latency. 2026-08-21 de-bloat: these are constant
      // strings, formerly stamped identically on EVERY service row (~250 chars ×
      // N); hoisted to ONE response-level statement each, text verbatim. The
      // per-row fact that remains is _metricsApplicable:false on internal rows.
      const hasInternalServices = filteredServices.some(s => s._metricsApplicable === false);
      const hasExternalServices = filteredServices.some(s => s._metricsApplicable !== false);
      const responseMetricsNotes = {
        ...(hasExternalServices && {
          _metricsBasis: 'successRate = availability EMA (5-min health probes + direct calls, probe-dominated); responseTime = successful-probe RTT, not call latency; lastHeartbeat = last successful contact. Workflow-path calls are not included.'
        }),
        ...(hasInternalServices && {
          _metricsHint: 'Internal services (_metricsApplicable: false) run in-process — responseTime and lastHeartbeat (HTTP probe metrics) are not applicable. successRate IS meaningful here: it is an EMA over real tracked calls only (no probes reach internal services). Health is verified by the in-process registration check at startup.'
        })
      };

      // (2026-07-28) The `parameterNormalizer.setServiceContext(filteredServices)`
      // call that stood here is deleted — it had been a no-op since 2026-05-23 and
      // its only consumers could never fire. See the SERVICE-CONTEXT deletion
      // tombstone in lib/mcp/server/utils/parameter-normalizer.js before
      // reinstating anything of this shape.

      // MCP Exposure Fix: Create enhanced metadata with pagination
      //
      // 2026-07-28 FIX (panel OOC-1): this used `accessFiltered.length` as the
      // basis, described as "accessible count for accurate pagination". That was
      // true when access filtering actually removed rows; it stopped being true
      // once `accessFiltered` became a pass-through (see the Phase 3b transparency
      // note above — it is `servicesWithAccessHints` with NO rows dropped), i.e.
      // the length of the CURRENT PAGE, never the query total.
      //
      // The arithmetic made both signals constant on page 1:
      //   hasMore    = skip + page.length < page.length  ->  0 + N < N  ->  ALWAYS false
      //   totalPages = ceil(page.length / limit)         ->  N <= limit ->  ALWAYS 1
      // so a client paginating on either could never reach page 2, and silently
      // saw a truncated registry. Invisible at 15 services with a default limit of
      // 15; a data-loss bug the moment the registry outgrows one page.
      //
      // `total` (the mCPTool.count in the Promise.all above) is the correct basis
      // and was already being fetched — it was only used for a nextSteps message.
      // Protocol 10: pagination is a FACT an AI consumer acts on, so a wrong one
      // is the same class as the cache-poisoning defect, just narrower.
      const paginationMetadata = MetadataEnhancer.extractPagination({
        data: filteredServices,
        total,
        page,
        pageSize: limit,
        pagination: {
          hasMore: skip + filteredServices.length < total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          nextPage: (skip + filteredServices.length < total) ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null
        }
      });

      // Phase 3c: Always use authenticated response (user is authenticated)
      // Finding #5 fix (2026-04-08): inject the authoritative userOwnedServiceCount
      // into the user object so `currentServices` in the capability block is correct.
      // 2026-07-27 (panel F17): explicit field pick, NOT `{ ...context.user }`.
      // On the HTTP path context.user carries the caller's raw bearer token
      // (mcp-core.ts, `token: usr.token`). A spread put that token one careless
      // edit of createAuthenticatedDiscoveryResponse away from the wire — it is
      // excluded today only because that function happens to pick 3 fields.
      // Pick explicitly here so the guarantee lives at the source, not downstream.
      const userForResponse = {
        id: context.user.id,
        email: context.user.email,
        role: context.user.role,
        serviceCount: userOwnedServiceCount
      };
      const response = createAuthenticatedDiscoveryResponse(filteredServices, userForResponse, paginationMetadata);
      Object.assign(response, responseMetricsNotes);

      // P2: Add nextSteps guidance for service lifecycle workflow
      // UX Enhancement: Suggest categories when browsing all services (Jan 2026)
      // Phase A: Schema-aware nextSteps
      if (filteredServices.length > 0) {
        // Add schema-specific guidance based on includeSchemas mode
        if (!includeSchemas) {
          response.nextSteps = [
            `📋 Lightweight discovery: ${filteredServices.length} services listed — tool parameter schemas not included`,
            `⚠️ Before calling any service: always run registry(action: 'tools', service_name: '<chosen-service>') first to get exact parameter names and types — guessing parameters causes errors`,
            `Step 1 — Get schemas: registry(action: 'tools', service_name: '${filteredServices[0].name}')`,
            `Step 2 — Health check: services(action: 'health', service_name: '<chosen-service>')`,
            `Step 3 — Call: services(action: 'call', targetService: '<chosen-service>', tool: '<tool>', arguments: {...})`
          ];
        } else {
          response.nextSteps = [
            `📋 Full schema mode: Showing ${filteredServices.length} services with complete tool schemas`,
            "Use services(action: 'health') to check reliability before calling a service",
            "Use services(action: 'call') to execute tools on your chosen service",
            `Example: services(action: 'health', service_name: "${filteredServices[0].name}")`
          ];
        }

        // Add category suggestion if no category filter was used
        if (!args.category && total > limit) {
          // Get available categories from filtered services
          const categories = [...new Set(
            filteredServices
              .map(s => s.configuration?.category || s.category)
              .filter(c => c)
          )];

          response.nextSteps.unshift(
            `📊 Showing ${filteredServices.length} of ${total} services - Consider filtering by category for focused results`
          );

          if (categories.length > 0) {
            response.availableCategories = categories;
            response.nextSteps.push(
              `💡 Filter by category: ${categories.map(c => `services(action: "discover", category: "${c}")`).join(' | ')}`
            );
          }
        }
      } else {
        // BUG-HUB-002 fix (2026-05-22): when empty result, surface ACTUAL populated
        // categories rather than telling users to call discover again (which lists
        // services, not categories). Aggregate over the registry to show which
        // categories DO have services. See cline_docs/reviews/mcp-hub-domain-testing-
        // 2026-05-22/MCP-HUB-DOMAIN-TESTING-REPORT.md Stage 5 BUG-HUB-002.
        let populatedCategories = [];
        try {
          // groupBy on configuration.category — JSONB path query via raw aggregation.
          // Prisma's groupBy doesn't natively support JSONB paths, so use raw query.
          const rows = await this.prisma.$queryRaw`
            SELECT configuration->>'category' as cat, COUNT(*)::int as cnt
            FROM mcp_tools
            WHERE status = 'ACTIVE' AND configuration->>'category' IS NOT NULL
            GROUP BY configuration->>'category'
            ORDER BY cnt DESC
          `;
          populatedCategories = rows.map(r => ({ category: r.cat, count: r.cnt }));
        } catch (err) {
          // Aggregation failure shouldn't break the response — log and degrade.
          log.warn({ err: err.message }, 'BUG-HUB-002: failed to aggregate populated categories');
        }

        if (populatedCategories.length > 0) {
          response.availableCategories = populatedCategories;
          const categorySummary = populatedCategories
            .map(c => `${c.category} (${c.count})`)
            .join(', ');
          response.nextSteps = [
            `No services match your criteria${args.category ? ` (category: "${args.category}")` : ''}`,
            `📊 Currently populated categories: ${categorySummary}`,
            `💡 Try: ${populatedCategories.slice(0, 3).map(c => `services(action: "discover", category: "${c.category}")`).join(' | ')}`,
            `Or: services(action: "discover") to see ALL services`
          ];
        } else {
          // Fallback when registry has zero categorized services (unlikely in prod)
          response.nextSteps = [
            "No services match your criteria",
            "Try: services(action: \"discover\") to see all available services"
          ];
        }
      }

      // Phase A: Add schema mode metadata
      // 2026-08-21 (Protocol 10): `tokenEstimate` REMOVED — it was a fabricated
      // per-service multiplier (×0.3k / ×1.8k), measured ~4× wrong for the prod
      // security-category payload. Replaced with a MEASURED fact: the actual
      // serialized size of the services array in this response.
      response.schemaMode = {
        includeSchemas: includeSchemas,
        mode: includeSchemas ? "full" : "lightweight",
        servicesChars: JSON.stringify(filteredServices).length,
        recommendation: includeSchemas
          ? "Full schemas included - you can call services directly"
          : `Tool names only — use registry(action: 'tools', service_name: "...") for full tool descriptions and parameter schemas, or pass includeSchemas: true to discover`
      };

      response.workflow = {
        current: "discovery",
        next: filteredServices.length > 0
          ? (includeSchemas ? "health_check" : "get_schemas")
          : "explore_hub"
      };

      return response;
    } catch (error) {
      log.error({ err: error }, 'Service discovery failed');

      // Dec 2025 UX Assessment: Use centralized error helper
      throw enhancedOperationError('Service discovery', error, {
        validParams: [
          'capability: Filter by service capability (e.g., "monitoring", "ai", "data")',
          'category: Filter by service category (e.g., "AI", "DevOps", "Analytics")',
          'status: Filter by status - "ACTIVE" (default), "INACTIVE", "ALL"',
          'page: Page number for pagination (default: 1)',
          'limit: Results per page (default: 15, or 20 with a category filter; max: 200)'
        ],
        examples: [
          'services(action: "discover") → All active services',
          'services(action: "discover", capability: "monitoring") → Monitoring services',
          'services(action: "discover", category: "AI", status: "ACTIVE") → Active AI services'
        ],
        tips: [
          'Use services(action: "discover") to see available categories'
        ]
      });
    }
  }
}

module.exports = { ServiceDiscoveryHandler };
