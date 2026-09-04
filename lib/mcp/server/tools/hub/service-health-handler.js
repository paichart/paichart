/**
 * Service Health Handler
 *
 * Handles service health monitoring and real-time health checks.
 * Implements Phase 2 Priority 2 features: Real-time HTTP endpoint pinging
 * with 5-second timeout, latency measurement, and availability checking.
 *
 * @class ServiceHealthHandler
 * @description Provides comprehensive service health monitoring including:
 *   - Real-time HTTP endpoint pinging with fetch + AbortController
 *   - 5-second timeout implementation
 *   - Actual latency measurement
 *   - Combined stored metrics + real-time health data
 *   - Permission-based access control
 *   - Fuzzy name matching for service lookup
 *
 * @version 1.0.0
 * @author pAIchart MCP Hub Team
 */

const { SDKParameterNormalizer } = require('../../utils/parameter-normalizer');
const { enhancedOperationError, notFoundError, missingServiceIdentifierError, permissionDeniedError, serviceNotFoundByIdError } = require('./error-helpers');
const { TOOL_SCHEMAS } = require('../../config/tool-schemas');  // Phase 3a: Input validation
const { stderr, createAdapter } = require('../../mcp-logger');
const { extractAuthContext, resolveService, sanitizeEndpointUrl } = require('./hub-shared-middleware');
const { validateUrlSafety } = require('../../../../utils/url-safety');
const { isSSRFExemptService } = require('../../config/service-call-policy');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-health' }));

class ServiceHealthHandler {
  /**
   * Creates Service Health Handler
   *
   * @param {Object} prisma - Prisma client instance
   * @param {HubUtilities} utilities - Shared utilities for permission checks
   * @param {SDKParameterNormalizer} [parameterNormalizer] - Parameter normalizer instance
   */
  constructor(prisma, utilities, parameterNormalizer = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parameterNormalizer = parameterNormalizer || new SDKParameterNormalizer();

    // Phase A Performance: Health check caching (30s TTL)
    this.healthCache = new Map();
    this.healthCacheTTL = 30 * 1000; // 30 seconds
    // TIME BOMB FIX (Jan 2026): Add size limit to prevent memory exhaustion
    // Pattern: time-bomb-detection-pattern.md (Category 1: Unbounded Caches)
    this.maxHealthCacheSize = 500; // LRU eviction limit
    this.healthCacheStats = {
      hits: 0,
      misses: 0,
      realtimeBypass: 0,
      evictions: 0
    };
  }

  /**
   * Clear health cache for specific service
   */
  clearHealthCache(serviceId) {
    const keysToDelete = [];
    for (const key of this.healthCache.keys()) {
      if (key.includes(serviceId)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.healthCache.delete(key));
    log.debug({ clearedEntries: keysToDelete.length, serviceId }, 'Health cache cleared for service');
  }

  /**
   * Clear entire health cache
   */
  clearAllHealthCache() {
    const size = this.healthCache.size;
    this.healthCache.clear();
    log.info({ clearedEntries: size }, 'Health cache cleared (all)');
  }

  /**
   * Get health cache statistics
   */
  getHealthCacheStats() {
    const total = this.healthCacheStats.hits + this.healthCacheStats.misses;
    const hitRate = total > 0 ? (this.healthCacheStats.hits / total * 100).toFixed(1) : 0;

    return {
      size: this.healthCache.size,
      maxSize: this.maxHealthCacheSize,
      ttl: this.healthCacheTTL,
      hits: this.healthCacheStats.hits,
      misses: this.healthCacheStats.misses,
      realtimeBypass: this.healthCacheStats.realtimeBypass,
      evictions: this.healthCacheStats.evictions,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Set health cache value with LRU eviction
   * TIME BOMB FIX (Jan 2026): Bounded cache with eviction
   * Pattern: time-bomb-detection-pattern.md (Category 1)
   *
   * @param {string} key - Cache key
   * @param {Object} value - Health data to cache
   */
  setHealthCacheValue(key, value) {
    // TIME BOMB PREVENTION: LRU eviction if at max size
    if (this.healthCache.size >= this.maxHealthCacheSize) {
      const firstKey = this.healthCache.keys().next().value;
      this.healthCache.delete(firstKey);
      this.healthCacheStats.evictions++;
      log.debug({ cacheSize: this.healthCache.size }, 'Health cache LRU eviction');
    }

    this.healthCache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }

  /**
   * Get health status of a specific service
   *
   * @param {Object} args - Health check arguments
   * @param {string} [args.serviceId] - Service CUID to check
   * @param {string} [args.service_name] - Service name for lookup (alternative to serviceId)
   * @param {boolean} [args.includeDiagnostics=false] - Include detailed diagnostics
   * @param {boolean} [args.realtime=false] - Force real-time ping (bypass cache, Phase A)
   * @param {Object} context - User authentication context (required)
   * @param {Object} context.user - Authenticated user object
   * @param {string} context.user.id - User ID
   *
   * @returns {Promise<Object>} Service health status
   * @returns {string} returns.serviceId - Service ID
   * @returns {string} returns.serviceName - Service name
   * @returns {string} returns.status - Service status (ACTIVE, INACTIVE, etc.)
   * @returns {Date} returns.lastHeartbeat - Last health check timestamp
   * @returns {number} returns.responseTime - Average response time (ms)
   * @returns {number} returns.successRate - Success rate percentage
   * @returns {Object} [returns.diagnostics] - Detailed diagnostics (if requested)
   * @returns {Object} [returns.realtime] - Real-time health check results (Phase 2)
   *
   * @description Retrieves service health metrics with permission-based access control.
   *   Supports fuzzy name matching for service_name parameter.
   *   Implements real-time HTTP health checking with fetch + AbortController.
   *
   * @example
   * const health = await handler.handle({
   *   service_name: 'sentry-mcp',
   *   includeDiagnostics: true
   * }, { user: { id: 'user123' } });
   *
   * @throws {Error} If user not authenticated or lacks view permission
   */
  async handle(args, context) {
    try {
      // Validate required params (serviceId or service_name must be provided)
      if (!args.serviceId && !args.service_name) {
        throw missingServiceIdentifierError('health');
      }

      // Normalize parameters and apply parameter intelligence
      args = this.parameterNormalizer.normalizeForTool('services.health', args);
      const { serviceId, service_name } = args;
      let finalServiceId = serviceId;

      // Service resolution: alias lookup, fuzzy matching, context inference (shared middleware)
      if (!finalServiceId && service_name) {
        const result = await resolveService({
          args: { service_name },
          prisma: this.prisma,
          options: {
            toolName: 'services',
            statusFilter: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR']
          }
        });
        if (result.notFound) return result.notFound;
        finalServiceId = result.serviceId;
      }

      // PARAMETER INTELLIGENCE: Only if NEITHER serviceId NOR service_name was provided
      if (!finalServiceId && !service_name) {
        const result = await resolveService({
          args: {},
          prisma: this.prisma,
          options: {
            toolName: 'services'
          }
        });
        finalServiceId = result.serviceId;
      }

      if (!finalServiceId) {
        throw missingServiceIdentifierError('health');
      }

      // 2026-07-27 (panel): authorization is resolved BEFORE the cache is consulted.
      // Previously extractAuthContext + checkPermission ran ~50 lines BELOW the
      // cache-hit return, so a cache HIT returned health data without ever
      // evaluating the caller's VIEW permission. Authorization must never be
      // memoized — see the invariant block in service-discovery-handler.js.
      const { userId, userEmail } = extractAuthContext(context, 'Service health check');

      const canView = await this.utilities.checkPermission(userId, 'mcp-service', 'view');
      if (!canView) {
        throw permissionDeniedError('view service health');
      }

      // Phase A Performance: Check health cache (unless realtime requested)
      //
      // 2026-05-23 (Round 2 Hub probe): rolled back the M1 per-caller email
      // gate. Registry-transparency policy keeps ownerEmail visible as
      // publisher contact (npm/PyPI/Docker Hub convention).
      //
      // 2026-07-27 — CORRECTS the stale note that used to sit here ("no per-caller
      // projection needed because the cached data IS the response shape"). That
      // claim was true when written and stopped being true once an ownership
      // branch was added to nextSteps below: `health` is cached BY REFERENCE and
      // was then mutated, so the mutation landed inside the cached object. It did
      // not leak in practice only because the branch tested `service.userId`,
      // which MCPTool does not have (prisma/schema.prisma) — it was always
      // undefined, so the condition was dead and the value caller-independent by
      // accident. Both halves are now fixed: ownership is resolved from ownerEmail
      // (already public here per the transparency policy), and nextSteps /
      // recommendation are applied AFTER retrieval on BOTH paths, so the cached
      // object holds only caller-independent data.
      const forceRealtime = args.realtime === true;

      if (!forceRealtime) {
        const cacheKey = `health_${finalServiceId}`;
        const cached = this.healthCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.healthCacheTTL) {
          this.healthCacheStats.hits++;
          const cacheAge = Date.now() - cached.timestamp;
          log.debug({ serviceId: finalServiceId, cacheAge, hitRate: this.getHealthCacheStats().hitRate }, 'Health cache HIT');

          return this._applyCallerProjection({
            ...cached.data,
            _meta: {
              ...cached.data._meta,
              cached: true,
              cacheAge,
              cacheHitRate: this.getHealthCacheStats().hitRate
            }
          }, userEmail);
        }

        this.healthCacheStats.misses++;
        log.debug({ serviceId: finalServiceId }, 'Health cache MISS');
      } else {
        this.healthCacheStats.realtimeBypass++;
        log.debug({ serviceId: finalServiceId }, 'Health cache BYPASS (realtime requested)');
      }

      const service = await this.prisma.mCPTool.findUnique({
        where: { id: finalServiceId },
        select: {
          id: true,
          name: true,
          description: true,
          version: true,
          status: true,
          configuration: true,  // Phase 3a: Sanitized before response
          permissions: true,
          responseTime: true,
          successRate: true,
          lastHeartbeat: true,
          errorCount: true,
          credentials: false,  // Phase 3a: NEVER return encrypted credentials
        }
      });

      if (!service) {
        throw serviceNotFoundByIdError(finalServiceId, 'health');
      }

      // (auth context + VIEW permission resolved above, before the cache lookup)

      // v4.2: Internal services are always healthy (same process)
      if (service.configuration?.type === 'internal' ||
          service.configuration?.endpoint?.startsWith('internal://')) {
        const healthResult = {
          service: service.name,
          status: 'healthy',
          type: 'internal',
          message: 'Internal service (same process - always available)',
          lastCheck: new Date().toISOString(),
          responseTime: 0,
          storedMetrics: {
            version: service.version,
            status: service.status,
            interactionCount: await this.utilities.getServiceInteractionCount(service.id),
            // F-SWEEP-7 (2026-07-17): was a hardcoded '100.0%' — an uptime MEASUREMENT
            // that was never made. The true fact is structural: in-process availability
            // equals the hub process's own availability.
            uptimePercent: 'N/A (in-process — availability = hub process)'
          },
          _meta: {
            tool: 'services',
            timestamp: new Date().toISOString(),
            sdkNative: true,
            internal: true
          },
          nextSteps: [
            '✅ Internal service is healthy',
            `Call service: services(action: "call", targetService: "${service.name}", tool: "...", arguments: {...})`
          ]
        };

        // Cache internal service health too
        this.setHealthCacheValue(`health_${service.id}`, healthResult);

        return healthResult;
      }

      // PHASE 2 PRIORITY 2: Real health check ping to service endpoint
      let realtimeHealth = null;
      const endpoint = service.configuration?.endpoint;
      // P1: Use custom healthCheckPath if configured (Jan 2026)
      const healthCheckPath = service.configuration?.healthCheckPath || '/health';

      if (endpoint) {
        try {
          const pingStart = Date.now();

          // Try to ping the service endpoint based on protocol
          if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
            // P1: Construct health URL with custom path
            const healthUrl = new URL(healthCheckPath, endpoint).toString();

            // BC22 FIX: SSRF prevention — block requests to private/internal addresses
            // SSRF-exempt services (first-party Docker containers) bypass this check
            const urlCheck = isSSRFExemptService(service) ? { safe: true } : validateUrlSafety(healthUrl);
            if (!urlCheck.safe) {
              log.warn({ endpoint, healthUrl, reason: urlCheck.reason, serviceId: service.id }, 'SSRF blocked: health check URL points to private/internal address');
              realtimeHealth = {
                available: false,
                latency: 0,
                error: 'Health check blocked: endpoint resolves to internal address',
                lastChecked: new Date().toISOString()
              };
            } else {

            // HTTP/HTTPS health check
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            try {
              let response = await fetch(healthUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'User-Agent': 'pAIchart-MCP-Hub/1.0' }
              });

              // Fallback: if default /health returns 404, try the base endpoint
              const isDefaultHealthPath = healthCheckPath === '/health';
              if (!response.ok && response.status === 404 && isDefaultHealthPath) {
                log.debug({ healthUrl, endpoint }, 'Default /health returned 404, falling back to base endpoint');
                const fallbackController = new AbortController();
                const fallbackTimeout = setTimeout(() => fallbackController.abort(), 5000);
                try {
                  // 1a (2026-05-29): strip the query string before the base-endpoint liveness
                  // probe — a health GET must never carry credentials (e.g. ?apikey=). For a
                  // rate-limited upstream like Alpha Vantage (25 calls/day) a keyed probe is
                  // attributed to the key and silently burns the user's daily quota. Keyless
                  // matches the background check, which already drops the query via /health.
                  const baseLivenessUrl = new URL(endpoint);
                  baseLivenessUrl.search = '';
                  response = await fetch(baseLivenessUrl.toString(), {
                    method: 'GET',
                    signal: fallbackController.signal,
                    headers: { 'User-Agent': 'pAIchart-MCP-Hub/1.0' }
                  });
                  clearTimeout(fallbackTimeout);
                } catch (fallbackErr) {
                  clearTimeout(fallbackTimeout);
                  // Keep original 404 response if fallback also fails
                }
              }

              clearTimeout(timeout);
              const latency = Date.now() - pingStart;

              // Determine ping success more carefully than `response.ok`.
              // Two concerns:
              //   1. (Bug #1, 2026-05-13) — a service that returns 200 with
              //      `{status: 'unhealthy', ...}` was being counted as a
              //      success ping; honor an explicit body.status field.
              //   2. (Bug #9, 2026-05-13) — services without a dedicated
              //      /health endpoint return 401 (auth required) or 405
              //      (method not allowed) when probed with GET. Both prove
              //      the service is responding; counting them as failures
              //      accumulated tens of thousands of phantom errors on
              //      external MCP services (alpha-vantage, context7-docs).
              //   See user memory feedback_health_probe_protocol_semantics.md
              let bodyHealthy = true;
              try {
                const text = await response.text();
                if (text.length > 0 && text.length < 50000) {
                  const body = JSON.parse(text);
                  if (body && typeof body === 'object' && typeof body.status === 'string') {
                    bodyHealthy = body.status === 'healthy';
                  }
                }
              } catch { /* not JSON or unreadable — fall back to status code only */ }
              // 1b (2026-05-29): a server that ANSWERS is up. Generalised from the Bug #9
              // 401/405 allowlist to "any status < 500" so a 404 (no REST /health route, e.g.
              // alpha-vantage, context7) also counts as responding. 5xx stays a failure, so a
              // service that returns 503-when-degraded (e.g. Snowflake) still registers as down.
              const respondingCode = response.status < 500;
              const pingHealthy = respondingCode && bodyHealthy;

              realtimeHealth = {
                available: pingHealthy,
                latency,
                statusCode: response.status,
                ...(bodyHealthy ? {} : { bodyStatus: 'unhealthy' }),
                healthCheckPath: response.ok && isDefaultHealthPath && response.url === endpoint ? '(base endpoint)' : healthCheckPath,
                lastChecked: new Date().toISOString()
              };

              // Persist realtime ping results to MCPTool summary columns (fire-and-forget).
              // F-SWEEP-3 C1: only a HEALTHY probe's latency is a service-latency measurement.
              this.utilities.updateServiceMetrics(service.id, {
                executionTimeMs: pingHealthy ? latency : null,
                success: pingHealthy
              }).catch(err => log.warn({ err, serviceId: service.id }, 'Failed to persist health ping metrics'));
            } catch (fetchError) {
              clearTimeout(timeout);
              const failLatency = Date.now() - pingStart;
              realtimeHealth = {
                available: false,
                latency: failLatency,
                error: fetchError.name === 'AbortError' ? 'Timeout' : fetchError.message,
                healthCheckPath, // P1: Include path used for health check
                lastChecked: new Date().toISOString()
              };

              // Persist failed ping to MCPTool summary columns (fire-and-forget).
              // F-SWEEP-3 C1: latency of a FAILED probe (often the timeout constant)
              // is not a service-latency measurement — null keeps it out of the EMA.
              this.utilities.updateServiceMetrics(service.id, {
                executionTimeMs: null,
                success: false
              }).catch(err => log.warn({ err, serviceId: service.id }, 'Failed to persist health ping metrics'));
            }
            } // end BC22 SSRF-safe else block
          } else {
            // For non-HTTP endpoints (internal://, stdio), just use stored metrics
            realtimeHealth = {
              available: service.status === 'ACTIVE',
              note: 'Real-time ping not supported for this transport type',
              lastChecked: new Date().toISOString()
            };
          }
        } catch (healthCheckError) {
          log.warn({ err: healthCheckError }, 'Health check failed');
          realtimeHealth = {
            available: false,
            error: healthCheckError.message,
            lastChecked: new Date().toISOString()
          };
        }
      }

      // 2026-05-30 (Protocol 10 — fact-framing honesty): derive errorCount7d, a *scoped*
      // fact (real call failures in the last 7 days from mcp_interactions). The legacy
      // errorCount field below is LIFETIME cumulative — incremented in hub-utilities.js:423
      // on every failure including background health pings, never decremented — and was
      // historically polluted by phantom-health-ping failures (cf. the 404-as-failure fix
      // earlier on 2026-05-30, which had pinned services' successRate near zero). The
      // unscoped name was misleadingly framed (implies recent, delivered lifetime + noise).
      // errorCount7d answers the honest "how many recent call failures" question most
      // clients want. Cached for 5 min via the surrounding health cache; uses the existing
      // @@index([toolId]) on mcp_interactions (composite not needed at expected scale —
      // see cline_docs/follow-ups/interactions-retention-policy-2026-05-30.md for the
      // scaling lever, which is retention not indexing).
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const errorCount7d = await this.prisma.mCPInteraction.count({
        where: {
          toolId: service.id,
          status: { in: ['FAILED', 'TIMEOUT'] },
          createdAt: { gt: sevenDaysAgo }
        }
      });

      const health = {
        serviceId: serviceId,
        serviceName: service.name,
        status: service.status,
        lastHeartbeat: service.lastHeartbeat,
        responseTime: service.responseTime || 0,
        successRate: service.successRate || 0,
        errorCount: service.errorCount || 0,        // LIFETIME cumulative — see comment above; framing-honesty work tracked in retention follow-up.
        errorCount7d,                               // FACT — real call failures in last 7d (Protocol 10).
        version: service.version,
        // Add real-time health check results
        ...(realtimeHealth ? { realtime: realtimeHealth } : {}),
        // Phase 3c: Always return full data (user is authenticated)
        endpoint: sanitizeEndpointUrl(service.configuration?.endpoint),
        // 2026-05-23 (Round 2 Hub probe): ownerEmail visible to all authenticated
        // callers as publisher-contact signal (registry-transparency policy —
        // npm/PyPI/Docker Hub convention). Internal authorization plumbing
        // (ownerId, permissions.canDelete/canModify, evaluationResult) is
        // stripped for non-owner / non-admin callers in services.discover via
        // the public-discovery-filter — this `services.health` response only
        // exposes the safe publisher-facing fields (owner email, endpoint,
        // status, metrics), never the internal plumbing.
        owner: service.configuration?.ownerEmail
      };

      // Phase 3c: Always return full diagnostics (user is authenticated)
      if (args.includeDiagnostics) {
        health.diagnostics = {
          registeredAt: service.createdAt,
          lastUpdated: service.updatedAt,
          totalInteractions: await this.utilities.getServiceInteractionCount(args.serviceId),
          avgResponseTime: service.responseTime,
          uptimePercent: this.utilities.calculateUptimePercent(service),
          // F-SWEEP-3/7: same basis fact discovery publishes — these numbers are
          // probe-dominated EMAs (availability + successful-probe RTT), not call metrics.
          metricsBasis: 'availability EMA (5-min health probes + direct calls, probe-dominated); avgResponseTime = successful-probe RTT, not call latency'
        };
      }

      // Phase A Performance: Cache health result (unless realtime bypass)
      // TIME BOMB FIX: Use setHealthCacheValue for LRU eviction
      if (!forceRealtime) {
        const cacheKey = `health_${finalServiceId}`;
        this.setHealthCacheValue(cacheKey, health);
      }

      // P2: Add state-aware nextSteps based on health status.
      // 2026-05-30 (Protocol 10 — make the verdict honest): a live-up service is never
      // "avoid". The realtime ping is a current fact; the stored successRate EMA is a
      // recent-quality estimate that can be stale or contaminated (cold-start, phantom
      // failures, recovering after a fix). When the live ping just succeeded, trust it
      // over the historical EMA. This generalises the earlier cold-start fix (which
      // only handled null successRate) to also cover the recovering-low case.
      return this._applyCallerProjection(health, userEmail);
    } catch (error) {
      log.error({ err: error }, 'Service health check failed');

      // Dec 2025 UX Assessment: Use centralized error helper
      throw enhancedOperationError('Service health check', error, {
        validParams: [
          'service_name: Name of the service to check (required)',
          'realtime: true = ping endpoint now (default: true)',
          'timeout: Max wait time in ms (default: 5000)'
        ],
        examples: [
          `services(action: 'health', service_name: "sentry-mcp") → Check Sentry service`,
          `services(action: 'health', service_name: "my-api", realtime: true) → Real-time check`
        ],
        tips: [
          `Use services(action: 'discover') to find service names`,
          'Services with >90% success rate are recommended'
        ]
      });
    }
  }
}

/**
 * Apply the per-caller projection to a health payload.
 *
 * 2026-07-27 (specialist panel): extracted so it runs AFTER cache retrieval on
 * BOTH the hit and miss paths. Previously `nextSteps`/`recommendation` were
 * assigned onto `health` *after* it had already been stored in the cache by
 * reference, so the assignment mutated the cached object in place.
 *
 * The cached object must therefore contain only caller-independent data.
 * Everything caller-dependent belongs here.
 *
 * Ownership is resolved from `health.owner` (the service's ownerEmail, already
 * public in this payload per the registry-transparency policy) rather than the
 * old `service.userId === userId` test — MCPTool has no `userId` column, so
 * that comparison was permanently false and no owner ever saw the owner-facing
 * guidance.
 *
 * @param {Object} health - Health payload (caller-independent)
 * @param {string} [userEmail] - Calling user's email, for the ownership branch
 * @returns {Object} health, with nextSteps + recommendation applied
 */
ServiceHealthHandler.prototype._applyCallerProjection = function (health, userEmail) {
  const isHealthy = health.status === 'healthy' || health.status === 'ACTIVE';
  const realtimeAvailable = health.realtime?.available === true;
  // Equivalent to the previous `service.successRate != null && >= 90`: health
  // .successRate is `service.successRate || 0`, and 0 never satisfies >= 90.
  const hasHighSuccessRate = realtimeAvailable || health.successRate >= 90;

  const rateText = health.successRate != null
    ? `${health.successRate.toFixed(1)}%`
    : 'no history yet';

  const isOwner = !!userEmail && !!health.owner && health.owner === userEmail;

  health.nextSteps = isHealthy && hasHighSuccessRate
    ? [
        `✅ Service "${health.serviceName}" is healthy and reliable`,
        "Ready to use - services(action: \"call\") to execute tools",
        `Example: services(action: "call", targetService: "${health.serviceName}", tool: "tool_name", arguments: {...})`
      ]
    : !isHealthy
    ? [
        `⚠️ Service "${health.serviceName}" is ${health.status}`,
        "Use services(action: \"discover\") to find alternative services",
        isOwner ? "Your service - check logs and restart if needed" : "Contact service owner for assistance"
      ]
    : [
        // Protocol 10: state the FACT (the EMA and what it means), not a prescription.
        // The 90 threshold is an unvalidated heuristic — surface it as a client-chosen
        // filter via discover(minSuccessRate), don't have the platform say "use something else".
        `Service "${health.serviceName}" recent success rate: ${rateText} — an EMA over recent calls (recent quality, not first-failure precision).`,
        "No live ping confirmation this cycle — the historical rate is the best signal available.",
        "Filter for stricter selection if you want: services(action: \"discover\", minSuccessRate: 90)."
      ];

  // `recommendation` is still a VERDICT layered on top of the facts (Protocol 10).
  // Kept as a useful summary signal, but the input is now honest: a live-up service is
  // never 'avoid'. The 90 threshold remains an unvalidated tunable — ideally validated
  // against outcomes (same defer/earn pattern as the transient/persistent verdict in
  // cline_docs/follow-ups/hub-recovery-verdict-validation-2026-05-29.md).
  health.recommendation = isHealthy && hasHighSuccessRate ? 'use' : 'avoid';

  return health;
};

module.exports = { ServiceHealthHandler };
