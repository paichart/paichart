/**
 * Hub Utilities
 *
 * Shared utility functions for MCP Hub tools handlers.
 *
 * Extracted from hub-tools-handler.js (Phase 4 Task 1 Days 3-5)
 * Part of systematic 2,191 → ~200 line reduction.
 */

const { stderr, createAdapter } = require('../../mcp-logger');
const { validateUrlSafety } = require('../../../../utils/url-safety');
const { isSSRFExemptService } = require('../../config/service-call-policy');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize \${userId} in User not found error.
const { sanitizeForResponse } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-utilities' }));

// Detect application-level tool failure inside an MCP response.
// Two signal sources:
//   1. MCP spec — `isError: true` on the tool response
//   2. Common pattern — JSON-encoded text content with `{ success: false, ... }`
//      (services like Snowflake, EIA, EODHD historically return errors this
//      way; the Snowflake service was updated to also set isError on
//      2026-05-13, but the JSON-payload check covers older patterns and any
//      service that hasn't migrated yet)
function isToolError(serviceResult) {
  if (!serviceResult || typeof serviceResult !== 'object') return false;
  if (serviceResult.isError === true) return true;
  const text = serviceResult.content?.[0]?.text;
  if (typeof text === 'string' && text.length > 0 && text.length < 50000) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed.success === false) return true;
    } catch {
      // Not JSON — fall through; not a structured-error payload
    }
  }
  return false;
}

/**
 * Runtime SSRF gate for service endpoint URLs.
 *
 * Throws if the endpoint resolves to a private/blocked address per
 * `validateUrlSafety`. Lifted from inline call sites (sec-ops Finding B,
 * Phase 3 C1, 2026-05-16) to eliminate the asymmetry between register and
 * update handlers — register previously skipped this check entirely,
 * letting attacker-controlled private-IP endpoints persist in the registry
 * until the first health-check / call hit them.
 *
 * Exempt path: callers that already loaded the existing DB record can pass
 * it via `existingService`; `isSSRFExemptService` allows seeded internal
 * first-party services (Docker containers bootstrapped at install) to
 * bypass the check. **Register path passes NO existingService** —
 * `SSRF_EXEMPT_SERVICES` is a seeded list, not a self-service registration
 * path, so user-facing registrations always run the full check.
 *
 * Pure function (no I/O). Idempotent on partial-registration retries.
 *
 * @param {string} endpoint - URL to validate
 * @param {Object} [options]
 * @param {Object} [options.existingService] - Existing DB record for
 *   exempt check (update path only; omit for register).
 * @param {string} [options.action] - Operation name for error message
 *   ('register' | 'update'). Default 'register'.
 * @throws {Error} if SSRF check fails (and not exempt).
 */
function assertEndpointSafe(endpoint, { existingService = null, action = 'register' } = {}) {
  if (existingService && isSSRFExemptService(existingService)) return;
  const urlCheck = validateUrlSafety(endpoint);
  if (!urlCheck.safe) {
    throw new Error(
      `Endpoint ${action} blocked: ${urlCheck.reason}. ` +
      'Use approved HTTPS endpoints. See service registration policy for allowed patterns.'
    );
  }
}

class HubUtilities {
  /**
   * @param {Object} prisma - Prisma client instance
   */
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Check permission using proper RolePermission system
   * Integrates with /lib/auth/permissions.ts
   *
   * @param {string} userId - User ID
   * @param {string} resourceType - Resource type (e.g., 'mcp-service')
   * @param {string} action - Action to check ('view', 'create', 'edit', 'delete')
   *
   * @returns {Promise<boolean>} Whether user has permission
   */
  async checkPermission(userId, resourceType, action) {
    try {
      // 1. Get user from database with role
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, email: true }
      });

      if (!user) {
        throw new Error(`User not found: ${sanitizeForResponse(userId)}`);
      }

      // 2. Load permissions module (TypeScript → JavaScript)
      let checkPermissionFn;
      try {
        // Try to load compiled JavaScript version first
        // Path from lib/mcp/server/tools/hub/ to lib/auth/ is 4 levels up
        const permissionsModule = require('../../../../auth/permissions');
        checkPermissionFn = permissionsModule.checkPermission;
      } catch (e) {
        // Fallback: Simple role-based check if permissions module unavailable
        // 2026-07-28: error, not warn — the fallback now DENIES, so this is an
        // outage signal rather than a degraded-mode notice.
        log.error({ err: e, securityEvent: true }, 'Permissions module unavailable — denying');
        return this.fallbackPermissionCheck(user, resourceType, action);
      }

      // 3. Use proper permission system
      const hasPermission = await checkPermissionFn(
        user,
        {
          type: resourceType,  // 'mcp-service'
          id: null,            // Hub-level permissions (not resource-specific)
          ownerId: null,
          teamId: null
        },
        action,              // 'view', 'create', 'edit', 'delete'
        { source: 'mcp_hub_tools' }
      );

      return hasPermission;
    } catch (error) {
      log.error({ err: error }, 'Permission check error');
      // Fail closed - deny access on error
      return false;
    }
  }

  /**
   * Fallback when the permissions module cannot be loaded.
   *
   * 2026-07-28: CHANGED FROM PERMISSIVE TO DENY-ALL.
   *
   * It previously granted SUPER_ADMIN/ADMIN everything and gave every USER and
   * DEMO_USER `view` + `create` — bypassing the `rolePermission` table entirely.
   * A module-load failure therefore WIDENED access, silently, behind a log.warn.
   * That is the wrong direction for a security fallback, and it contradicts
   * checkPermission itself, which is documented as failing closed on error or a
   * missing row.
   *
   * Reachability, measured before changing it: mcp-server-http-clean.js registers
   * ts-node + tsconfig-paths UNCONDITIONALLY at startup, so the `.ts` require
   * resolves in the running server, and across all rotated MCP logs this path has
   * fired ZERO times against 14,004 hub-discovery lines. So this is hardening
   * against a failure that has never occurred — not an incident fix.
   *
   * Why change it anyway: if the ts-node registration is ever removed — a build
   * step that compiles to JS, or someone trimming startup cost — this fallback
   * activates silently and re-grants that access. Denying converts an invisible
   * privilege widening into a loud, obvious outage.
   *
   * @param {Object} user - User object with role
   * @param {string} resourceType - Resource type
   * @param {string} action - Action to check
   * @returns {boolean} Always false — deny closed
   * @private
   */
  fallbackPermissionCheck(user, resourceType, action) {
    log.error(
      {
        securityEvent: true,
        userId: user?.id,
        role: user?.role,
        resourceType,
        action,
        reason: 'PERMISSIONS_MODULE_UNAVAILABLE',
      },
      'DENYING permission: the permissions module failed to load, so the ' +
      'rolePermission table could not be consulted. This path should be ' +
      'unreachable — mcp-server-http-clean.js registers ts-node at startup. If ' +
      'you are seeing this, that registration is gone or broken; fix the module ' +
      'load rather than relaxing this fallback.'
    );
    return false;
  }

  /**
   * Check if user is admin (ADMIN or SUPER_ADMIN)
   *
   * @param {string} userId - User ID
   *
   * @returns {Promise<boolean>} Whether user is admin
   */
  async isUserAdmin(userId) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });
      return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
    } catch (error) {
      log.error({ err: error }, 'Error checking admin status');
      return false;
    }
  }

  /**
   * Check if user is new (created within last 7 days)
   *
   * @param {string} userId - User ID
   *
   * @returns {Promise<boolean>} Whether user is new
   */
  async isNewUser(userId) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true }
      });

      if (!user) return true;

      // Consider users created within last 7 days as "new"
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return user.createdAt > weekAgo;
    } catch (error) {
      log.error({ err: error }, 'Error checking new user status');
      return false; // Default to not new user if error
    }
  }

  /**
   * Check if user has access to call a service
   *
   * @param {string} userId - User ID
   * @param {Object} service - Service object with configuration
   *
   * @returns {Promise<boolean>} Whether user has access
   */
  async checkServiceAccess(userId, service) {
    // Check if service is marked as public (permissions column)
    // Post-standardization (Jan 2026): All services use permissions.publicAccess
    const isPublic = service.permissions?.publicAccess === true;

    if (isPublic) {
      log.debug('Service is public, allowing access');
      return true;
    }

    // Check if user owns the service
    if (service.configuration?.ownerId === userId) {
      log.debug('User owns the service, allowing access');
      return true;
    }

    // Check if user is admin
    const isAdmin = await this.isUserAdmin(userId);
    if (isAdmin) {
      log.debug('User is admin, allowing access');
      return true;
    }

    // Future: Check for explicit service permissions
    // const permission = await this.prisma.servicePermission.findFirst({
    //   where: {
    //     userId,
    //     serviceId: service.id,
    //     canExecute: true
    //   }
    // });
    // if (permission) {
    //   log.debug('User has explicit permission, allowing access');
    //   return true;
    // }

    log.info('Access denied - no permission found');
    return false;
  }

  /**
   * Get count of service interactions
   *
   * @param {string} serviceId - Service ID
   *
   * @returns {Promise<number>} Interaction count
   */
  async getServiceInteractionCount(serviceId) {
    try {
      return await this.prisma.mCPInteraction.count({
        where: { toolId: serviceId }
      });
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate service uptime percentage.
   *
   * Uses three signals in priority order:
   *   1. successRate (EMA from actual calls/pings — most accurate)
   *   2. lastHeartbeat recency (service confirmed alive within 2× health-check interval)
   *   3. status field as final fallback
   *
   * @param {Object} service - Service object (status, successRate, lastHeartbeat)
   * @returns {string} Uptime percentage formatted as "XX.X%"
   */
  calculateUptimePercent(service) {
    // Best signal: EMA success rate from real observations
    if (service.successRate != null) {
      return `${service.successRate.toFixed(1)}%`;
    }

    // Second signal: lastHeartbeat recency.
    // F-SWEEP-7 (2026-07-17): was minted precision — '99.9%'/'95.0%'/'80.0%' tiers
    // fabricated from heartbeat age and published as if measured (a service with one
    // successful ping 5 minutes ago was stamped "99.9%" uptime). Post-C2 the heartbeat
    // itself is truthful (success-only writes), so publish THAT fact instead of a
    // number nobody measured. This branch only fires while successRate is null
    // (brand-new services, pre-first-observation).
    if (service.lastHeartbeat) {
      const ageMin = Math.round((Date.now() - new Date(service.lastHeartbeat).getTime()) / 60000);
      return `N/A (no rate data; last successful contact ${ageMin}m ago)`;
    }

    // Fallback: no observations yet
    return service.status === 'ACTIVE' ? 'N/A (no data)' : '0.0%';
  }

  /**
   * Track service interaction in database and update service performance metrics.
   *
   * Creates an MCPInteraction record for the event log, then rolls up
   * performance data to the MCPTool summary columns so that services(discover),
   * services(health), and registry(list) display live metrics.
   *
   * @param {string} serviceId - Service ID
   * @param {string} tool - Tool name
   * @param {Object} result - Execution result
   * @param {Object} context - User context
   * @param {string} [action='SERVICE_CALL'] - MCPAction enum value (SERVICE_CALL, EXECUTE_WORKFLOW, HEALTH_CHECK)
   *
   * @returns {Promise<void>}
   */
  /**
   * Summarize a service response for persistence — SHAPE ONLY, NEVER THE PAYLOAD.
   *
   * WHY (2026-08-28, tool-result-twin-dedup panel, WS4): `mcp_interactions.response` used to store
   * the downstream response VERBATIM, with no redaction of any kind, on every external
   * services.call — including calls made by external Claude Desktop / ChatGPT users. R10 does not
   * and cannot reach this table: its scope is harness-persisted artifacts (report.md / result.json)
   * only, at ANY flag setting. So this was an unprotected at-rest copy of whatever a service
   * returned, and a live incident (IGP-T1 R16) proved services return credentials — an admin
   * password hash and plaintext SNMP community strings. The ONLY reason those are not in this table
   * today is the incidental GDPR delete-cascade when the rig service was removed. That is luck,
   * not a control.
   *
   * WHY SUMMARY AND NOT REDACTION: a repo-wide sweep found NO code consumer of this column — the
   * single findMany (app/api/mcp/metrics/route.ts:59) selects toolId/status/executionTime/
   * createdAt/tool.name; every other site counts, aggregates, creates or deletes. Redacting a
   * payload nobody reads leaves a payload to get the patterns wrong on. Not storing it removes the
   * surface outright.
   *
   * WHY SUMMARY AND NOT NULL: `create` here never populates the `error` column, so for a FAILED
   * call the response was the only record of what went wrong. Dropping it outright would trade a
   * security surface for a debugging regression. The shape below keeps failure diagnosis (error
   * text, error flags, content kinds) while carrying no successful payload.
   *
   * ERROR TEXT IS THE ONE JUDGEMENT CALL: it is capped and kept because a failure message is the
   * diagnostic. It is the one field that could in principle echo caller-supplied content, so it is
   * length-bounded. If that ever proves too generous, bound it harder — do not restore the payload.
   */
  summarizeServiceResponse(result) {
    const inner = result && result.result;
    const content = inner && Array.isArray(inner.content) ? inner.content : [];
    const kinds = {};
    for (const c of content) {
      const k = (c && c.type) || 'unknown';
      kinds[k] = (kinds[k] || 0) + 1;
    }
    let bytes = 0;
    try { bytes = JSON.stringify(inner === undefined ? null : inner).length; } catch { bytes = -1; }
    const summary = {
      persisted: 'summary-only',
      reason: 'payload not stored — unredacted at-rest surface, no code consumer (WS4, 2026-08-28)',
      success: result ? result.success === true : false,
      isError: !!(inner && inner.isError),
      contentKinds: kinds,
      hasStructuredContent: !!(inner && inner.structuredContent),
      approxBytes: bytes,
    };
    if (result && result.targetService) summary.targetService = result.targetService;
    if (result && result.tool) summary.tool = result.tool;
    // Failure diagnostics only — never on the success path.
    if (!summary.success || summary.isError) {
      const err = (result && (result.error || result.message)) ||
        (content.find((c) => c && typeof c.text === 'string') || {}).text;
      if (typeof err === 'string' && err.length) summary.errorText = err.slice(0, 500);
    }
    return summary;
  }

  async trackServiceInteraction(serviceId, tool, result, context, action = 'SERVICE_CALL') {
    try {
      // The outer wrapper's `result.success === true` only tells us the MCP
      // transport call succeeded. Application-level failures (Snowflake account
      // suspended, EIA invalid state code, etc.) come back inside the inner
      // MCP response — either as `isError: true` (spec) or as a JSON-encoded
      // text payload with `success: false`. Without this check, every
      // transport-OK call gets counted as success, inflating successRate.
      const actualSuccess = result?.success === true && !isToolError(result?.result);

      await this.prisma.mCPInteraction.create({
        data: {
          toolId: serviceId,
          action,
          request: { tool, arguments: result.arguments },
          // SHAPE ONLY — see summarizeServiceResponse(). The verbatim payload used to live here
          // unredacted; R10 never reached this table at any flag setting.
          response: this.summarizeServiceResponse(result),
          status: actualSuccess ? 'COMPLETED' : 'FAILED',
          executionTime: result.metadata?.executionTime,
          context: {
            sourceUser: context?.user?.email || context?.apiUserContext?.email,
            timestamp: new Date().toISOString()
          }
        }
      });

      // Roll up metrics to MCPTool summary columns (fire-and-forget)
      await this.updateServiceMetrics(serviceId, {
        executionTimeMs: result.metadata?.executionTime ?? null,
        success: actualSuccess
      });
    } catch (error) {
      log.debug({ err: error }, 'Failed to track interaction');
      // Don't throw - interaction tracking shouldn't break the main flow
    }
  }

  /**
   * Update MCPTool performance summary columns from a single observation.
   *
   * Uses Exponential Moving Average (EMA) so that recent calls have more
   * weight than older ones, without needing to re-query the interaction log.
   *
   *   EMA = α × new_value + (1 − α) × old_value
   *
   * α = 0.3 gives ~86% weight to the last 5 observations, which is a good
   * balance between responsiveness and stability for service monitoring.
   *
   * For successRate the observation is 100 (success) or 0 (failure).
   *
   * All writes are fire-and-forget; a failure here must never break the
   * services(call) or health-check happy path.
   *
   * @param {string} serviceId - MCPTool id
   * @param {Object} observation
   * @param {number|null} observation.executionTimeMs - Latency (null = health ping, skip responseTime update)
   * @param {boolean} observation.success - Whether the interaction succeeded
   */
  async updateServiceMetrics(serviceId, { executionTimeMs, success }) {
    return updateServiceMetricsCore(this.prisma, serviceId, { executionTimeMs, success });
  }

  /**
   * Start background health checks for all active HTTP/HTTPS services.
   *
   * Pings each service's health endpoint every `intervalMs` and persists
   * the result via updateServiceMetrics(). This ensures services(discover)
   * always shows fresh metrics even for services that aren't actively called.
   *
   * Uses .unref() so the interval doesn't prevent process exit.
   *
   * @param {number} [intervalMs=300000] - Check interval (default 5 minutes)
   */
  startBackgroundHealthChecks(intervalMs = 5 * 60 * 1000) {
    if (this._healthCheckInterval) return; // Prevent double-start

    const runHealthChecks = async () => {
      try {
        const services = await this.prisma.mCPTool.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, configuration: true }
        });

        let checked = 0;
        let healthy = 0;

        for (const service of services) {
          const endpoint = service.configuration?.endpoint;
          // Only ping HTTP/HTTPS services (skip internal://, seed services without real endpoints)
          if (!endpoint || !endpoint.startsWith('http')) continue;

          const healthPath = service.configuration?.healthCheckPath || '/health';
          try {
            const healthUrl = new URL(healthPath, endpoint).toString();

            // BC51 FIX: SSRF prevention — block health checks to private/internal addresses
            // Trusted internal services (first-party Docker containers) bypass SSRF checks
            // BC70 FIX: Check both name and id to handle seeded vs user-registered services
            if (!isSSRFExemptService(service)) {
              const urlCheck = validateUrlSafety(healthUrl);
              if (!urlCheck.safe) {
                log.warn({ endpoint, healthUrl, reason: urlCheck.reason, serviceId: service.id }, 'SSRF blocked: background health check URL points to private/internal address');
                // F-SWEEP-3 C1: null, not 0 — a blocked probe produced NO latency measurement;
                // feeding 0 dragged the responseTime EMA toward a false "excellent". The
                // failure observation itself is real and stays.
                await this.updateServiceMetrics(service.id, { executionTimeMs: null, success: false });
                checked++;
                continue;
              }
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const pingStart = Date.now();
            const response = await fetch(healthUrl, {
              method: 'GET',
              signal: controller.signal,
              headers: { 'User-Agent': 'pAIchart-MCP-Hub-BG/1.0' }
            });
            clearTimeout(timeout);
            const latency = Date.now() - pingStart;

            // 2026-05-22: propagate Bug #9 fix (originally applied to the foreground
            // realtime health check at service-health-handler.js line 379, May 13). The
            // background loop was a parallel site that was missed — it counted 401/405
            // as failures, accumulating ~12 phantom errors/hour for every external MCP
            // service without a REST /health endpoint (alpha-vantage, context7-docs, and
            // any other streamable-http endpoint). Services without dedicated /health
            // return 401 (auth required) or 405 (method not allowed) when probed with
            // GET — both prove the service is responding. See user memory
            // feedback_health_probe_protocol_semantics.md for the full reasoning.
            // 2026-05-29: generalised from the Bug #9 401/405 allowlist to "any status < 500".
            // A 404 (no REST /health route — alpha-vantage, context7, any streamable-http MCP
            // endpoint) still proves the server ANSWERED, so it must not count as a failure.
            // Counting it as failure pinned those services' successRate to ~0.1% (288 phantom
            // failures/day) and poisoned the recentSuccessRate recovery fact. 5xx stays a
            // failure so a 503-when-degraded service (e.g. Snowflake) still registers as down.
            const respondingCode = response.status < 500;

            // F-SWEEP-3 C1: latency is a real measurement only when the probe SUCCEEDED;
            // a 5xx's elapsed time measures the failure path, not service latency.
            await this.updateServiceMetrics(service.id, {
              executionTimeMs: respondingCode ? latency : null,
              success: respondingCode
            });
            checked++;
            if (respondingCode) healthy++;
          } catch (err) {
            // Service unreachable — record failure. F-SWEEP-3 C1: was a hardcoded
            // `executionTimeMs: 5000` (the abort constant, not a measurement) — a
            // fabricated latency fact feeding the responseTime EMA. null = no measurement.
            await this.updateServiceMetrics(service.id, {
              executionTimeMs: null,
              success: false
            });
            checked++;
          }
        }

        log.info(
          { checked, healthy, total: services.length, intervalMs },
          'Background health check cycle complete'
        );
      } catch (error) {
        log.warn({ err: error }, 'Background health check cycle failed');
      }
    };

    // Run immediately on startup, then on interval
    // .catch() prevents unhandled rejection — runHealthChecks has its own try/catch
    // but a defensive .catch() ensures Node doesn't crash if the outer async frame rejects
    runHealthChecks().catch(err => log.warn({ err }, 'Background health check startup failed'));
    this._healthCheckInterval = setInterval(() => {
      runHealthChecks().catch(err => log.warn({ err }, 'Background health check interval failed'));
    }, intervalMs);
    // TIME BOMB PREVENTION: Don't block process exit
    this._healthCheckInterval.unref();

    log.info({ intervalMs, intervalMin: intervalMs / 60000 }, 'Background health checks started');
  }
}

/**
 * Rate Limit Cache with Time Bomb Prevention
 *
 * Patterns applied:
 * - cache-lru-invalidation-pattern.md (LRU eviction)
 * - time-bomb-detection-pattern.md (Categories 1 & 5)
 *
 * Time Bomb Prevention:
 * - Category 1: Unbounded Cache → maxCacheSize: 10000 + LRU eviction
 * - Category 5: TTL Without Enforcement → windowMs expiration resets counters
 *
 * @version 1.0.0
 * @created Jan 2026
 */
/**
 * Module-level metric updater (F-SWEEP-3 A-lite, 2026-07-17, panel).
 * Extracted from HubUtilities.updateServiceMetrics (which now delegates here) so the
 * WORKFLOW execution path (workflow-tools-handler + service-caller.ts — they hold prisma
 * but no utilities instance) can feed the same EMA. Previously workflow calls were
 * invisible to successRate/errorCount entirely. Metrics-only by design: mcp_interactions
 * rows for the workflow path are DEFERRED (trackServiceInteraction stores the response
 * verbatim, ≤50KB for chatty pipeline legs — row-bloat decision in the F-SWEEP-3 record).
 *
 * @param {Object} prisma - Prisma client
 * @param {string} serviceId - MCPTool id
 * @param {Object} observation
 * @param {number|null} observation.executionTimeMs - Latency of a SUCCESSFUL operation only
 *   (null = no measurement: failed/blocked probe or failure path — F-SWEEP-3 C1)
 * @param {boolean} observation.success - Whether the operation succeeded
 */
async function updateServiceMetricsCore(prisma, serviceId, { executionTimeMs, success }) {
  try {
    // BC47/BC19 FIX (2026-06-08): the original "wrap in $transaction" did NOT prevent the
    // lost update — a plain $transaction at READ COMMITTED takes no row lock, so concurrent
    // metric updates both read v0 and one clobbers. Lock the service row with FOR UPDATE so
    // the EMA read-modify-write serializes (waits, no abort; fire-and-forget so the brief
    // convoy is fine). See transaction-atomicity-pattern.md / BC19.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM mcp_tools WHERE id = ${serviceId} FOR UPDATE`;
      const service = await tx.mCPTool.findUnique({
        where: { id: serviceId },
        select: { responseTime: true, successRate: true }
      });

      if (!service) return;

      const alpha = 0.3;

      // --- responseTime: EMA of execution latencies ---
      let newResponseTime = service.responseTime;
      if (executionTimeMs != null) {
        newResponseTime = service.responseTime != null
          ? alpha * executionTimeMs + (1 - alpha) * service.responseTime
          : executionTimeMs;
        newResponseTime = Math.round(newResponseTime * 10) / 10;
      }

      // --- successRate: EMA where success=100, failure=0 ---
      const observation = success ? 100 : 0;
      const newSuccessRate = service.successRate != null
        ? alpha * observation + (1 - alpha) * service.successRate
        : observation;
      const roundedSuccessRate = Math.round(newSuccessRate * 10) / 10;

      const data = {
        // F-SWEEP-3 C2 (2026-07-17, panel): lastHeartbeat bumps on SUCCESS only. It was
        // written unconditionally, so a service failing every probe for months still read
        // "heartbeating today" (the Snowflake 0%-successRate-with-fresh-heartbeat signature),
        // and calculateUptimePercent's fresh-heartbeat fallback advertised 99.9% uptime for
        // it. Success-only writes make the field's liveness claim literally true; a stale
        // heartbeat now correctly signals "no successful contact". (Known trade-off: an
        // up-but-failing-health-body service reads stale — the realtime ping in
        // services(action:'health') remains the diagnostic fact for that case.)
        ...(success ? { lastHeartbeat: new Date() } : {}),
        successRate: roundedSuccessRate,
        ...(newResponseTime != null ? { responseTime: newResponseTime } : {}),
        ...(!success ? { errorCount: { increment: 1 } } : {})
      };

      await tx.mCPTool.update({
        where: { id: serviceId },
        data
      });

      log.debug(
        { serviceId, responseTime: newResponseTime, successRate: roundedSuccessRate, success },
        'Service metrics updated'
      );
    });
  } catch (error) {
    // Fire-and-forget — never break the caller
    log.warn({ err: error, serviceId }, 'Failed to update service metrics');
  }
}

class RateLimitCache {
  constructor() {
    this.cache = new Map();
    // TIME BOMB PREVENTION (Category 1): Bounded cache size
    // Without this, cache grows unbounded → memory exhaustion attack
    this.maxCacheSize = 10000;
    this.stats = { hits: 0, misses: 0, evictions: 0, rateLimited: 0 };
  }

  /**
   * Check if a request is within rate limits
   *
   * @param {string} userId - User making the request
   * @param {string} serviceId - Service being called
   * @param {number} maxRequests - Maximum requests allowed in window
   * @param {number} windowMs - Time window in milliseconds
   * @returns {{allowed: boolean, remaining: number, resetAt: number}}
   */
  checkRateLimit(userId, serviceId, maxRequests, windowMs) {
    const key = `${userId}:${serviceId}`;

    // TIME BOMB PREVENTION (Category 1): LRU eviction at capacity
    // Deletes oldest entry when at max size
    if (this.cache.size >= this.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
      this.stats.evictions++;
    }

    const now = Date.now();
    const entry = this.cache.get(key) || { count: 0, windowStart: now };

    // TIME BOMB PREVENTION (Category 5): TTL enforcement
    // Window expired → reset counter (prevents stale accumulation)
    if (now - entry.windowStart > windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }

    entry.count++;
    this.cache.set(key, entry);

    const allowed = entry.count <= maxRequests;
    if (!allowed) {
      this.stats.rateLimited++;
    } else {
      this.stats.hits++;
    }

    return {
      allowed,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.windowStart + windowMs
    };
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Clear all rate limit entries (for testing)
   */
  clear() {
    this.cache.clear();
    log.info('Rate limit cache cleared');
  }
}

// Singleton instance (Category 6: Correct singleton usage)
const rateLimitCache = new RateLimitCache();

module.exports = { HubUtilities, RateLimitCache, rateLimitCache, assertEndpointSafe, updateServiceMetricsCore };
