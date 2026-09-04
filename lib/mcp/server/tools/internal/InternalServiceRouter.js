/**
 * Internal Service Router
 * Routes services(action: "call") requests to pAIchart internal tool handlers
 *
 * Handles services with endpoint: "internal://..."
 *
 * DUAL-MODE OPERATION:
 * 1. Web UI context (Next.js compiled): Uses direct domain service calls (NO HTTP)
 * 2. MCP server context (plain JS): Falls back to HTTP API calls
 *
 * FIX (2026-01-19): Previous implementation incorrectly used apiClient.get() for HTTP calls.
 * This caused 504 deadlocks when called from web UI (Next.js calling itself).
 * Now correctly calls domain services directly when possible, HTTP fallback for MCP server.
 *
 * PATTERNS FOLLOWED:
 * - global-prisma-singleton-pattern.md (98%): Services use shared prisma instance
 * - mcp-api-context-differences.md (100%): Handles MCP vs API context correctly
 * - field-leakage-prevention-pattern.md (98%): Defensive field access
 *
 * @see bug-report: cline_docs/bug-reports/504-workflow-timeout-2026-01-19.md
 * @see implementation-plan: cline_docs/implementation-plans/504-fix-internal-service-router-2026-01-19.md
 */

const { SDKNativeAdvancedTools } = require('../sdk-native-advanced-tools');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'internal-service-router' }));
const { apiClient } = require('../../utils/api-client');
const { ContextEnricher } = require('../../middleware/context-enricher');
// BUG-BASIC-XSS-1 Phase 2.5 (GAP-4): sanitize ~10 inline 'throw new Error'
// sites with povName/povId/taskId/serviceId interpolation. Same vector
// as error-helpers (Phase 2.2) but via inline throws not helper funcs.
const { sanitizeForResponse } = require('../response-sanitizer');

// Domain services for direct invocation (matches documented design)
// Lazy-loaded to avoid circular dependencies
let povServiceInstance = null;
let phaseServiceInstance = null;
let taskServiceClass = null;
let validatePOVAccessFn = null;

// Context detection: can we load TypeScript services directly?
// If not, we're in MCP server context and need HTTP fallback
let useHttpFallback = null; // null = not yet determined, true/false after first attempt

/**
 * Detect if we're in a context that can load TypeScript services
 * Returns true if we need HTTP fallback (MCP server context)
 */
function needsHttpFallback() {
  if (useHttpFallback !== null) {
    return useHttpFallback;
  }

  try {
    // Try to load a TypeScript service to detect context
    require('../../../../pov/services/pov');
    useHttpFallback = false;
    log.info({ mode: 'direct' }, 'TypeScript services available - using direct calls');
  } catch (e) {
    useHttpFallback = true;
    log.info({ mode: 'http-fallback' }, 'TypeScript services unavailable - using HTTP fallback');
  }

  return useHttpFallback;
}

/**
 * Get POV Service instance (lazy loaded)
 * Uses the existing N+1 optimized PoVService from lib/pov/services/pov.ts
 * Export pattern: singleton (export const povService = new PoVService())
 */
function getPOVService() {
  if (needsHttpFallback()) {
    return null; // Signal to use HTTP
  }

  if (!povServiceInstance) {
    try {
      const { povService } = require('../../../../pov/services/pov');
      povServiceInstance = povService;
      log.info('Loaded PoVService (singleton)');
    } catch (e) {
      log.error('Could not load PoVService', { err: e });
      return null; // Fallback to HTTP
    }
  }
  return povServiceInstance;
}

/**
 * Get Phase Service instance (lazy loaded)
 * Uses the existing PhaseService from lib/pov/services/phase.ts
 * Export pattern: singleton (export const phaseService = new PhaseService())
 *
 * Better than direct Prisma: includes logical ordering (PLANNING → EXECUTION → REVIEW)
 */
function getPhaseService() {
  if (needsHttpFallback()) {
    return null; // Signal to use HTTP
  }

  if (!phaseServiceInstance) {
    try {
      const { phaseService } = require('../../../../pov/services/phase');
      phaseServiceInstance = phaseService;
      log.info('Loaded PhaseService (singleton)');
    } catch (e) {
      log.error('Could not load PhaseService', { err: e });
      return null; // Fallback to HTTP
    }
  }
  return phaseServiceInstance;
}

/**
 * Get Task Service class (lazy loaded)
 * Uses the existing N+1 optimized TaskService from lib/tasks/services/task.ts
 * Export pattern: static methods (export class TaskService)
 */
function getTaskService() {
  if (needsHttpFallback()) {
    return null; // Signal to use HTTP
  }

  if (!taskServiceClass) {
    try {
      const { TaskService } = require('../../../../tasks/services/task');
      taskServiceClass = TaskService;
      log.info('Loaded TaskService (static methods)');
    } catch (e) {
      log.error('Could not load TaskService', { err: e });
      return null; // Fallback to HTTP
    }
  }
  return taskServiceClass;
}

/**
 * Get validatePOVAccess function (lazy loaded)
 *
 * 2026-05-23 (Round 2 Hub probe — R1 direct-mode access check):
 * Direct-mode handlers (povService.get, phaseService.getPoVPhases,
 * TaskService.getTasksWithContext, TaskService.getTask) call the domain
 * services without per-user team-membership filtering. In MCP server
 * context this is moot — needsHttpFallback() returns true so direct mode
 * never activates. But if InternalServiceRouter is ever wired into a
 * Next.js context (web UI route handler etc.), direct mode would activate
 * with no access enforcement → cross-tenant DB reads. Gate the 4 handlers
 * by re-using lib/auth/validate-pov-access.ts (the canonical helper that
 * REST middleware also uses).
 *
 * Only loadable when direct mode is active (TS reachable). Same lazy/
 * fallback pattern as getPOVService / getTaskService.
 *
 * @returns {Function|null} validatePOVAccess(user, pov, options) → boolean
 */
function getValidatePOVAccess() {
  if (needsHttpFallback()) {
    return null; // HTTP fallback path uses REST middleware enforcement
  }

  if (!validatePOVAccessFn) {
    try {
      const { validatePOVAccess } = require('../../../../auth/validate-pov-access');
      validatePOVAccessFn = validatePOVAccess;
      log.info('Loaded validatePOVAccess (direct-mode access check)');
    } catch (e) {
      log.error('Could not load validatePOVAccess', { err: e });
      return null;
    }
  }
  return validatePOVAccessFn;
}

class InternalServiceRouter {
  constructor(sharedNormalizer = null) {
    this.advancedTools = new SDKNativeAdvancedTools(null, sharedNormalizer);

    // Active internal services
    //
    // 2026-05-23 (Round 2 Hub probe — R3 drift cleanup):
    //   - Dropped paichart-pov-service + paichart-task-service: both
    //     registered here but NEVER present in the MCPTool DB. They were
    //     unreachable via services.call (services.discover wouldn't list
    //     them, and direct service_name lookup would 404 at the service
    //     resolver). Dead code at the routing layer.
    //   - Added paichart-recommendation-engine: present in the MCPTool DB
    //     (visible in services.discover with _canCall:false) but had no
    //     router entry — call would error "Unknown internal service".
    //     Mirrors the KPI service pattern: read-only HTTP forward to
    //     /api/mcp/recommendations which inherits requirePermission +
    //     validatePOVAccess.
    this.serviceToolMap = {
      'paichart-project-service': {
        'project': this.handleProject.bind(this),
        'perform': this.handlePerform.bind(this)
      },
      // KPI Service: read-only scoring, history, evaluation for POVs
      'paichart-kpi-service': {
        'kpi': this.handleKPI.bind(this)
      },
      // Recommendation Engine: read-only POV-scoped recommendation listing
      // (registered 2026-05-23 — see R3 cleanup note above)
      'paichart-recommendation-engine': {
        'recommendation': this.handleRecommendation.bind(this)
      }
    };
  }

  /**
   * Check if service uses internal routing
   */
  isInternalService(service) {
    return service?.configuration?.type === 'internal' ||
           service?.configuration?.endpoint?.startsWith('internal://');
  }

  /**
   * Normalize context to support both MCP and Hub patterns
   * @see mcp-api-context-differences.md
   *
   * MCP direct: context.user.id
   * Hub API: context.apiUserContext.userId
   */
  normalizeContext(context) {
    return {
      ...context,
      user: context.apiUserContext || context.user || {},
      apiUserContext: context.apiUserContext || {
        userId: context.user?.id,
        // U2 Phase D site #4 (v3.1 Edit 1, 2026-05-19): token removed —
        // per-call minting deferred to api-client.js (site #5). azp added so
        // downstream mint sites can preserve client-binding (Option α).
        azp: context.user?.azp,
        email: context.user?.email,
        role: context.user?.role
      }
    };
  }

  /**
   * Extract user info from context (handles both MCP and API patterns)
   * @see mcp-api-context-differences.md
   * @see field-leakage-prevention-pattern.md
   */
  extractUserInfo(context) {
    const normalized = this.normalizeContext(context);

    // MCP pattern: user.id, API pattern: apiUserContext.userId
    const userId = normalized.user?.id || normalized.apiUserContext?.userId;
    const userRole = normalized.user?.role || normalized.apiUserContext?.role;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

    // Log for debugging (helps diagnose context issues)
    log.info({
      userId: userId ? `${userId.substring(0, 8)}...` : 'MISSING',
      role: userRole || 'MISSING',
      isAdmin,
      source: normalized.user?.id ? 'MCP' : 'API'
    }, 'extractUserInfo');

    if (!userId) {
      log.warn({ securityEvent: true }, 'No userId found in context');
    }

    return { userId, userRole, isAdmin };
  }

  /**
   * Route call to appropriate internal handler
   *
   * ⚠️ SECURITY — THIS LOOKUP IS LOAD-BEARING. DO NOT ADD A NAME-BASED FALLBACK.
   * (2026-07-27 specialist panel; tripwire relocated here from a schema comment
   *  ~900 lines away in tool-schemas.js, because whoever adds that fallback will
   *  be reading THIS file, not that one.)
   *
   * Callers reach this via `services(action:'call')`, and that handler
   * short-circuits for internal services at STEP 2.5a — it routes here and
   * RETURNS (service-call-handler.js, the internal branch) BEFORE STEP 2.5b.
   * So for an internal service, NEITHER of these ever runs:
   *
   *   • validateServiceCall  — approved-tools allowlist, BLOCKED_PATTERNS,
   *                            SSRF BLOCKED_URLS, size limits
   *   • checkServiceAccess   — the authorization check
   *
   * That skip is defensible in itself: these are first-party in-process
   * services, and `serviceToolMap` IS the allowlist. The exact-match lookup
   * below is therefore not a convenience — it is the thing standing in for the
   * authorization check that was skipped upstream.
   *
   * Containment today rests on two layers, NEITHER of which is an authz check:
   *   1. A user cannot mark their own service internal — `serviceEndpointSchema`
   *      rejects `internal://` on register AND update (9901a198), and
   *      `configuration.type` is not user-settable (the update handler merges
   *      only endpoint/category/healthCheckPath/rateLimit/maxExecutionTime).
   *   2. Even if they could, `this.serviceToolMap[serviceId]` is keyed by the
   *      hardcoded first-party ids; user services get CUIDs, so a forged
   *      internal service throws here instead of executing.
   *
   * Layer 2 holds because of a lookup-shape choice, not a security decision.
   * Resolving `serviceId` by NAME — or any fuzzy/fallback match — collapses it
   * and makes the upstream authorization skip reachable. `isInternalService()`
   * reads registry STATE (configuration.type or an `internal://` endpoint
   * prefix), not code, so the trust boundary is data an attacker may influence
   * if either containment layer is ever loosened.
   *
   * If a name-based lookup is genuinely needed: add `checkServiceAccess` to the
   * internal branch of service-call-handler FIRST, in the same commit.
   */
  async routeCall(serviceId, tool, args, context) {
    const toolMap = this.serviceToolMap[serviceId];
    if (!toolMap) {
      throw new Error(`Unknown internal service: ${sanitizeForResponse(serviceId)}. Available: ${Object.keys(this.serviceToolMap).join(', ')}`);
    }

    const handler = toolMap[tool];
    if (!handler) {
      throw new Error(`Tool '${sanitizeForResponse(tool)}' not found on service '${sanitizeForResponse(serviceId)}'. Available: ${Object.keys(toolMap).join(', ')}`);
    }

    const normalizedContext = this.normalizeContext(context);
    const startTime = Date.now();

    try {
      const result = await handler(args, normalizedContext);
      return {
        success: true,
        result,
        metadata: {
          serviceType: 'internal',
          executionTime: Date.now() - startTime,
          tool,
          serviceId
        }
      };
    } catch (error) {
      throw new Error(`Internal service call failed: ${sanitizeForResponse(error.message)}`);
    }
  }

  // =========================================================================
  // Consolidated Tool Dispatchers (Mar 2026)
  // =========================================================================

  /**
   * Handle project tool - dispatches to POV/task read handlers based on action
   */
  async handleProject(args, context) {
    const action = args.action;
    if (!action) {
      throw new Error('action is required. Use: pov.list, pov.details, pov.phases, task.list, task.context');
    }

    switch (action) {
      case 'pov.list':
        return this.handleListPOVs(args, context);
      case 'pov.details':
        return this.handleGetPOVDetails(args, context);
      case 'pov.phases':
        return this.handleGetPOVPhases(args, context);
      case 'task.list':
        return this.handleListTasks(args, context);
      case 'task.context':
        return this.advancedTools.handleGetTaskContext(args, context);
      case 'task.details':
        return this.handleGetTaskDetails(args, context);
      default:
        throw new Error(`Unknown project action: '${sanitizeForResponse(action)}'. Available: pov.list, pov.details, pov.phases, task.list, task.context, task.details`);
    }
  }

  /**
   * Handle perform tool - dispatches to task action handler
   */
  async handlePerform(args, context) {
    return this.advancedTools.handleExecuteTaskAction(args, context);
  }

  // =========================================================================
  // KPI Service Handler - Routes through existing API for POV access validation
  // =========================================================================

  /**
   * Handle KPI requests (score, history, evaluate)
   * Routes through existing /api/pov/[povId]/kpi endpoint to inherit
   * requirePermission + BC28 IDOR checks. [SEC-S3]
   *
   * Read-only: no kpi.update exposed via MCP.
   */
  async handleKPI(args, context) {
    const { action, povId, kpiId, timeRange } = args || {};

    if (!povId) {
      return { error: 'povId is required for KPI operations' };
    }

    log.info({ action, povId, kpiId }, 'Handling KPI request');

    // Route through existing API for POV access validation [identity-preserving-token-forwarding-pattern]
    const enrichedContext = ContextEnricher.enrichContext(context);
    const userContext = ContextEnricher.getUserContext(enrichedContext);
    // Pass userContext as options (3rd arg) — apiClient.get(endpoint, params, options)
    const requestOptions = { userContext };

    try {
      // NOTE: apiClient.get() returns parsed JSON on success, throws on error.
      // It does NOT return a raw fetch Response — no .ok, .text(), .json() methods.
      switch (action) {
        case 'score': {
          // GET /api/pov/[povId]/kpi — returns all KPIs for this POV
          const data = await apiClient.get(`/api/pov/${povId}/kpi`, {}, requestOptions);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                povId,
                kpis: data.data || data,
                evaluatedAt: new Date().toISOString(),
              }, null, 2)
            }]
          };
        }

        case 'history': {
          if (!kpiId) {
            return { error: 'kpiId is required for history action' };
          }
          // GET /api/pov/[povId]/kpi with specific KPI lookup
          const data = await apiClient.get(`/api/pov/${povId}/kpi`, { kpiId }, requestOptions);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                povId,
                kpiId,
                history: data.data?.history || [],
                timeRange: timeRange || '30d',
              }, null, 2)
            }]
          };
        }

        case 'evaluate': {
          // Trigger recalculation by calling recommendations endpoint with this POV
          // This piggybacks on the recommendation cycle which evaluates KPIs
          await apiClient.get(`/api/mcp/recommendations`, { povId }, requestOptions);
          // Now fetch the updated scores
          const kpiData = await apiClient.get(`/api/pov/${povId}/kpi`, {}, requestOptions);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                povId,
                action: 'evaluate',
                kpis: kpiData.data || kpiData,
                evaluatedAt: new Date().toISOString(),
                message: 'KPIs recalculated from latest task data',
              }, null, 2)
            }]
          };
        }

        default:
          return { error: `Unknown KPI action: ${action}. Valid: score, history, evaluate` };
      }
    } catch (error) {
      log.error({ err: error, action, povId }, 'KPI handler error');
      return { error: `KPI operation failed: ${error.message || 'Unknown error'}` };
    }
  }

  // =========================================================================
  // Recommendation Engine Handler — Routes through /api/mcp/recommendations
  // (added 2026-05-23 — R3 router/DB drift cleanup; mirrors KPI handler)
  // =========================================================================

  /**
   * Handle recommendation requests (list)
   * Routes through existing /api/mcp/recommendations endpoint to inherit
   * requirePermission + validatePOVAccess team-membership filtering.
   *
   * Read-only: no mutation actions exposed via MCP.
   */
  async handleRecommendation(args, context) {
    const { action = 'list', povId, taskId } = args || {};

    if (!povId && !taskId) {
      return { error: 'povId or taskId is required for recommendation operations' };
    }

    log.info({ action, povId, taskId }, 'Handling recommendation request');

    // Token forwarding for POV access validation [identity-preserving-token-forwarding-pattern]
    const enrichedContext = ContextEnricher.enrichContext(context);
    const userContext = ContextEnricher.getUserContext(enrichedContext);
    const requestOptions = { userContext };

    try {
      switch (action) {
        case 'list': {
          // GET /api/mcp/recommendations — POV-scoped via validatePOVAccess
          const query = {};
          if (povId) query.povId = povId;
          if (taskId) query.taskId = taskId;
          const data = await apiClient.get('/api/mcp/recommendations', query, requestOptions);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                povId: povId || null,
                taskId: taskId || null,
                recommendations: data.data || data,
                generatedAt: new Date().toISOString(),
              }, null, 2)
            }]
          };
        }

        default:
          return { error: `Unknown recommendation action: ${action}. Valid: list` };
      }
    } catch (error) {
      log.error({ err: error, action, povId, taskId }, 'Recommendation handler error');
      return { error: `Recommendation operation failed: ${error.message || 'Unknown error'}` };
    }
  }

  // =========================================================================
  // POV Service Handlers - DIRECT DOMAIN SERVICE CALLS (NO HTTP)
  // =========================================================================

  /**
   * List POVs - Direct call to PoVService.list() or HTTP fallback
   *
   * Web UI context: povService.list() - Direct Prisma query, no HTTP (N+1 optimized)
   * MCP server context: apiClient.get('/api/pov') - HTTP fallback
   */
  async handleListPOVs(args, context) {
    const { userId, isAdmin } = this.extractUserInfo(context);
    const povService = getPOVService();

    // HTTP FALLBACK: MCP server context can't load TypeScript services
    if (!povService) {
      log.info({ method: 'handleListPOVs', mode: 'http-fallback' }, 'Routing request');

      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      const queryParams = { limit: (args.limit || 100).toString() };
      if (args.status) queryParams.status = args.status;
      if (args.customerName || args.customer_name) queryParams.customer_name = args.customerName || args.customer_name;
      if (args.salesTheatre || args.theatre_name) queryParams.theatre_name = args.salesTheatre || args.theatre_name;

      const povData = await apiClient.get('/api/pov', queryParams, { userContext });
      return { data: povData.data || [], total: povData.total || povData.data?.length || 0 };
    }

    // DIRECT MODE: Web UI context - use domain service directly
    log.info({
      method: 'handleListPOVs',
      mode: 'direct',
      userId: userId ? `${userId.substring(0, 8)}...` : 'MISSING',
      isAdmin,
      filters: { status: args.status, limit: args.limit }
    }, 'Routing request');

    let povs = await povService.list(userId, isAdmin, { limit: args.limit ? parseInt(args.limit, 10) : 50, offset: args.offset ? parseInt(args.offset, 10) : 0 });

    // Apply filters from args
    if (args.status) {
      povs = povs.filter(p => p.status === args.status);
    }
    if (args.customerName || args.customer_name) {
      const search = (args.customerName || args.customer_name).toLowerCase();
      povs = povs.filter(p => p.customerName?.toLowerCase().includes(search));
    }
    if (args.salesTheatre || args.theatre_name) {
      const theatre = args.salesTheatre || args.theatre_name;
      povs = povs.filter(p => p.salesTheatre === theatre);
    }

    // Return format matches API response (workflows expect step.0.output.data[0].id)
    return { data: povs, total: povs.length };
  }

  /**
   * Get POV Details - Direct call to PoVService.get() or HTTP fallback
   *
   * Web UI context: povService.get() - Direct Prisma query, no HTTP (N+1 optimized)
   * MCP server context: apiClient.get('/api/pov/{id}') - HTTP fallback
   */
  async handleGetPOVDetails(args, context) {
    const { userId, isAdmin } = this.extractUserInfo(context);

    if (!args.povId && !args.povName && !args.pov_name && !args.pov_id) {
      throw new Error('Either povId or povName is required');
    }

    let povId = args.povId || args.pov_id;
    const povName = args.povName || args.pov_name;
    const povService = getPOVService();

    // HTTP FALLBACK: MCP server context can't load TypeScript services
    if (!povService) {
      log.info({ method: 'handleGetPOVDetails', mode: 'http-fallback' }, 'Routing request');

      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // If searching by name, first list POVs to find the ID
      if (!povId && povName) {
        const povData = await apiClient.get('/api/pov', { limit: '200' }, { userContext });
        const povs = povData.data || [];
        const searchLower = povName.toLowerCase();
        const pov = povs.find(p =>
          p.title?.toLowerCase().includes(searchLower) ||
          p.customerName?.toLowerCase().includes(searchLower)
        );
        if (!pov) {
          throw new Error(`POV not found: ${sanitizeForResponse(povName)}`);
        }
        povId = pov.id;
      }

      const povData = await apiClient.get(`/api/pov/${povId}`, {}, { userContext });
      if (!povData) {
        throw new Error(`POV not found: ${sanitizeForResponse(povId)}`);
      }
      return povData;
    }

    // DIRECT MODE: Web UI context - use domain service directly
    // Look up by name if needed
    if (!povId && povName) {
      const povs = await povService.list(userId, isAdmin);
      const searchLower = povName.toLowerCase();
      const pov = povs.find(p =>
        p.title?.toLowerCase().includes(searchLower) ||
        p.customerName?.toLowerCase().includes(searchLower)
      );
      if (!pov) {
        throw new Error(`POV not found: ${sanitizeForResponse(povName)}`);
      }
      povId = pov.id;
    }

    log.info({ method: 'handleGetPOVDetails', mode: 'direct', povId }, 'Routing request');

    const pov = await povService.get(povId);

    if (!pov) {
      throw new Error(`POV not found: ${sanitizeForResponse(povId)}`);
    }

    // 2026-05-23 R1: direct-mode access check. HTTP fallback path goes
    // through /api/pov/{id} (withPOVAccess middleware enforces). Direct
    // mode bypassed that entirely — close the gap by re-using the same
    // canonical validator. Returns POV-not-found for cross-tenant access
    // (don't leak existence).
    const validatePOVAccess = getValidatePOVAccess();
    if (validatePOVAccess) {
      const { userRole } = this.extractUserInfo(context);
      const user = { userId, role: userRole };
      const hasAccess = validatePOVAccess(user, {
        id: pov.id,
        ownerId: pov.ownerId,
        metadata: pov.metadata,
        team: pov.team
      }, { logContext: 'InternalServiceRouter.handleGetPOVDetails' });
      if (!hasAccess) {
        throw new Error(`POV not found: ${sanitizeForResponse(povId)}`);
      }
    }

    return pov;
  }

  /**
   * Get POV Phases - Direct call to PhaseService.getPoVPhases() or HTTP fallback
   *
   * Web UI context: phaseService.getPoVPhases() - Direct Prisma query, no HTTP
   * MCP server context: apiClient.get('/api/pov/{id}/phases') - HTTP fallback
   *
   * Better than direct Prisma: includes logical ordering (PLANNING → EXECUTION → REVIEW)
   */
  async handleGetPOVPhases(args, context) {
    const povId = args.povId || args.pov_id;

    if (!povId) {
      throw new Error('povId is required');
    }

    const phaseService = getPhaseService();

    // HTTP FALLBACK: MCP server context can't load TypeScript services
    if (!phaseService) {
      log.info({ method: 'handleGetPOVPhases', mode: 'http-fallback', povId }, 'Routing request');

      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      const phaseData = await apiClient.get(`/api/pov/${povId}/phases`, {}, { userContext });
      return { data: phaseData.data || phaseData || [], total: phaseData.total || phaseData.length || 0 };
    }

    // DIRECT MODE: Web UI context - use domain service directly
    log.info({ method: 'handleGetPOVPhases', mode: 'direct', povId }, 'Routing request');

    // 2026-05-23 R1: direct-mode access check. Phases inherit POV team
    // scope — fetch the parent POV through povService.get (cheap; cached
    // in Prisma) and gate via validatePOVAccess. Cross-tenant → 404.
    const validatePOVAccess = getValidatePOVAccess();
    const povServiceForCheck = getPOVService();
    if (validatePOVAccess && povServiceForCheck) {
      const parentPov = await povServiceForCheck.get(povId);
      if (!parentPov) {
        throw new Error(`POV not found: ${sanitizeForResponse(povId)}`);
      }
      const { userId, userRole } = this.extractUserInfo(context);
      const user = { userId, role: userRole };
      const hasAccess = validatePOVAccess(user, {
        id: parentPov.id,
        ownerId: parentPov.ownerId,
        metadata: parentPov.metadata,
        team: parentPov.team
      }, { logContext: 'InternalServiceRouter.handleGetPOVPhases' });
      if (!hasAccess) {
        throw new Error(`POV not found: ${sanitizeForResponse(povId)}`);
      }
    }

    // PhaseService.getPoVPhases includes logical ordering (PLANNING → EXECUTION → REVIEW)
    const phases = await phaseService.getPoVPhases(povId);

    // Return format matches API response (workflows expect step.N.output.data)
    return { data: phases, total: phases.length };
  }

  // =========================================================================
  // Task Service Handlers - DIRECT DOMAIN SERVICE CALLS (NO HTTP)
  // =========================================================================

  /**
   * List Tasks - Direct call to TaskService.getTasksWithContext() or HTTP fallback
   *
   * Web UI context: TaskService.getTasksWithContext() - Direct Prisma query, no HTTP (N+1 optimized)
   * MCP server context: apiClient.get('/api/tasks') - HTTP fallback
   */
  async handleListTasks(args, context) {
    const TaskService = getTaskService();

    // HTTP FALLBACK: MCP server context can't load TypeScript services
    if (!TaskService) {
      log.info({
        method: 'handleListTasks',
        mode: 'http-fallback',
        povId: args.povId || args.pov_id,
        status: args.status
      }, 'Routing request');

      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      const queryParams = { limit: (args.limit || 100).toString() };
      if (args.povId || args.pov_id) queryParams.pov_id = args.povId || args.pov_id;
      if (args.phaseId || args.phase_id) queryParams.phase_id = args.phaseId || args.phase_id;
      if (args.stageId || args.stage_id) queryParams.stage_id = args.stageId || args.stage_id;
      if (args.assigneeId || args.assignee_id) queryParams.assignee_id = args.assigneeId || args.assignee_id;
      if (args.status) queryParams.status = args.status;

      const taskData = await apiClient.get('/api/tasks', queryParams, { userContext });
      return { data: taskData.data || [], total: taskData.total || taskData.data?.length || 0 };
    }

    // DIRECT MODE: Web UI context - use domain service directly
    log.info({
      method: 'handleListTasks',
      mode: 'direct',
      povId: args.povId || args.pov_id,
      phaseId: args.phaseId || args.phase_id,
      status: args.status,
      limit: args.limit
    }, 'Routing request');

    // 2026-05-23 R1: direct-mode access check. TaskService.getTasksWithContext
    // doesn't filter by user team-membership. Gate by parent POV when povId
    // is provided. If no povId, require it in direct mode (the HTTP fallback
    // path goes through /api/tasks which has its own user-scoping).
    const argPovId = args.povId || args.pov_id;
    const validatePOVAccess = getValidatePOVAccess();
    const povServiceForCheck = getPOVService();
    if (validatePOVAccess && povServiceForCheck) {
      if (!argPovId) {
        throw new Error('povId is required for direct-mode task listing');
      }
      const parentPov = await povServiceForCheck.get(argPovId);
      if (!parentPov) {
        throw new Error(`POV not found: ${sanitizeForResponse(argPovId)}`);
      }
      const { userId, userRole } = this.extractUserInfo(context);
      const user = { userId, role: userRole };
      const hasAccess = validatePOVAccess(user, {
        id: parentPov.id,
        ownerId: parentPov.ownerId,
        metadata: parentPov.metadata,
        team: parentPov.team
      }, { logContext: 'InternalServiceRouter.handleListTasks' });
      if (!hasAccess) {
        // Return empty list (mirror REST behavior that filters silently)
        return { data: [], total: 0 };
      }
    }

    const tasks = await TaskService.getTasksWithContext({
      povId: argPovId,
      phaseId: args.phaseId || args.phase_id,
      stageId: args.stageId || args.stage_id,
      assigneeId: args.assigneeId || args.assignee_id,
      status: args.status,
      limit: args.limit ? parseInt(args.limit, 10) : 100,
      offset: args.offset ? parseInt(args.offset, 10) : 0
    });

    // Return format matches API response (workflows expect step.N.output.data)
    return { data: tasks, total: tasks.length };
  }

  /**
   * Get Task Details - Direct call to TaskService.getTask() or HTTP fallback
   *
   * Web UI context: TaskService.getTask() - Direct Prisma query, no HTTP
   * MCP server context: apiClient.get('/api/tasks/{id}') - HTTP fallback
   */
  async handleGetTaskDetails(args, context) {
    const taskId = args.taskId || args.task_id;

    if (!taskId) {
      throw new Error('taskId is required');
    }

    const TaskService = getTaskService();

    // HTTP FALLBACK: MCP server context can't load TypeScript services
    if (!TaskService) {
      log.info({ method: 'handleGetTaskDetails', mode: 'http-fallback', taskId }, 'Routing request');

      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      const taskData = await apiClient.get(`/api/tasks/${taskId}`, {}, { userContext });
      if (!taskData) {
        throw new Error(`Task not found: ${sanitizeForResponse(taskId)}`);
      }
      return taskData;
    }

    // DIRECT MODE: Web UI context - use domain service directly
    log.info({ method: 'handleGetTaskDetails', mode: 'direct', taskId }, 'Routing request');

    const task = await TaskService.getTask(taskId);

    if (!task) {
      throw new Error(`Task not found: ${sanitizeForResponse(taskId)}`);
    }

    // 2026-05-23 R1: direct-mode access check. Gate by task's parent POV.
    // Cross-tenant → 404 (don't leak existence).
    const validatePOVAccess = getValidatePOVAccess();
    const povServiceForCheck = getPOVService();
    if (validatePOVAccess && povServiceForCheck && task.povId) {
      const parentPov = await povServiceForCheck.get(task.povId);
      if (!parentPov) {
        throw new Error(`Task not found: ${sanitizeForResponse(taskId)}`);
      }
      const { userId, userRole } = this.extractUserInfo(context);
      const user = { userId, role: userRole };
      const hasAccess = validatePOVAccess(user, {
        id: parentPov.id,
        ownerId: parentPov.ownerId,
        metadata: parentPov.metadata,
        team: parentPov.team
      }, { logContext: 'InternalServiceRouter.handleGetTaskDetails' });
      if (!hasAccess) {
        throw new Error(`Task not found: ${sanitizeForResponse(taskId)}`);
      }
    }

    return task;
  }
}

module.exports = { InternalServiceRouter };
