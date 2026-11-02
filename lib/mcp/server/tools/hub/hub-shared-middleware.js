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

/**
 * SF-5 (held-k8s step 1d, 2026-10-18): an AGENT may not delete or update a PLATFORM row.
 *
 * - A platform row has no `configuration.ownerId`. Seed scripts leave it unset on purpose (see
 *   seed-cloudflare-service.ts, seed-github-service.ts); every row `registry(action:'register')` writes carries one.
 * - An agent call carries `context.callingExecutionId`. Only mcpService sets it, server-side, for a tool call made
 *   inside an execution's tool loop; a client never supplies it.
 *
 * Why: by-name lookups already filter on `ownerId = caller`, so a platform row cannot match them. By-id lookups go
 * through validateOwnership, which admits any admin, and an admin-launched agent sees a platform service's id in
 * every gateway envelope. One confused teardown (`registry(action:'delete', serviceId:<that id>)`) would delete
 * the platform file source, and an `update` could repoint it. Human admins (GUI, an MCP client) keep both paths.
 *
 * @param {Object} service - the resolved MCPTool row
 * @param {Object} context - the tool call's auth context
 * @param {'delete'|'update'} action
 * @throws {Error} PLATFORM_SERVICE_AGENT_MUTATION_REFUSED
 */
function refuseAgentMutationOfPlatformRow(service, context, action, opts = {}) {
  const ownerId = service?.configuration?.ownerId;
  const isPlatformRow = typeof ownerId !== 'string' || ownerId.length === 0;
  const callingExecutionId = context?.callingExecutionId;
  // ONE agent predicate (INTERNAL-FIT I-7 condition 1): a server-set callingExecutionId OR the embedded agent transport.
  const isAgent = require('./registrant-declaration').isAgentCaller(context, opts.transport);
  if (!isAgent) return;
  // INTERNAL-FIT IF-3 (mcp-hub SF-3): an agent may mutate ONLY a row its launching user owns — a colleague's run (even under an
  // admin launch) must never update or delete the team's shared row by its serviceId.
  if (!isPlatformRow) {
    // sec-ops IF-3 build SF-2: the handler's RESOLVED user (extractAuthContext also accepts apiUserContext.userId) — reading
    // only context.user.id refused an agent on its OWN row on the API-forwarded path, so teardown failed and squatted names.
    const launcher = opts.userId || context?.user?.id || context?.apiUserContext?.userId;
    if (typeof launcher === 'string' && launcher && ownerId === launcher) return;
    log.warn({ serviceId: service?.id, serviceName: service?.name, action, callingExecutionId, errorCode: 'AGENT_MUTATION_NOT_OWNER', securityEvent: true },
      'Agent attempted to mutate a service its launching user does not own; refused');
    throw new Error(`AGENT_MUTATION_NOT_OWNER: '${service?.name}' belongs to another user. An agent can ${action} only a service its launching user owns.`);
  }
  log.warn(
    { serviceId: service?.id, serviceName: service?.name, action, callingExecutionId,
      errorCode: 'PLATFORM_SERVICE_AGENT_MUTATION_REFUSED', securityEvent: true },
    'Agent attempted to mutate a platform service row; refused'
  );
  throw new Error(
    `PLATFORM_SERVICE_AGENT_MUTATION_REFUSED: '${service?.name}' is a platform service (it has no owner). ` +
    `An agent cannot ${action} it. Only a service this run registered can be updated or deleted by an agent, ` +
    `and only by its name.`
  );
}

/**
 * SF-1 (held-network step 2 sec-ops, 2026-10-25): an AGENT may delete or update only a row THIS RUN registered.
 *
 * Why: a `registry register` with `descriptorUrl` from the same owner and the same descriptor bytes answers `adopted` and
 * reuses the customer's existing long-lived row. The leg's SYNTHESIZE teardown then deletes by name, and the owner check
 * above admits it (the launching user owns the row). So an agent run could delete — or repoint — a customer's permanent
 * service. Only a prose "do not tear it down" stood in the way.
 *
 * The rule — server-stamped facts only, written ONCE at the two create sites of the register handler, never from args:
 *   - `configuration.provisionedByExecutionId` — the server-set callingExecutionId of the registering call;
 *   - `configuration.provisionedByRunScope` — the LEG that execution belonged to AT REGISTRATION (provisionedRunScope():
 *     a PIPELINE task's own id, or a child's owning leg via `stage.metadata.harnessTaskId`; absent otherwise).
 *   A human registration carries neither, an adoption returns before any write, and `registry update` cannot set them
 *   (strict `updates`, configuration spread). So an agent can never mutate a human's row or an adopted row this way.
 * Allowed: the registering execution itself (the Harvester attaching tools), OR an execution whose task is the PIPELINE
 * task named by the stamped scope (every pass of that leg's harness — the SYNTHESIZE teardown). Never another child of
 * the leg, a sibling leg, or the program root.
 * Why the scope is stamped at create and not re-derived here (sec-ops build review SF-1): `stage.metadata.harnessTaskId`
 * is rewritten by any PIPELINE `task.update` carrying `pipelineStageId`, so a harness could pull another leg's stage into
 * its own scope at delete time. The caller side reads only `agent_executions.taskId` and `tasks.type`, which no MCP call
 * changes. Residual: a rebind BEFORE the Harvester registers would stamp the wrong leg (loud: stage_activities +
 * the victim leg's completion fails clobber detection; register N-5).
 * Fail closed: no stamp, no run scope (a row created before this guard: only its registering execution), no execution
 * id, a missing row, or any read error refuses an agent. Human callers are unchanged (the one isAgentCaller predicate).
 *
 * @param {Object} service - the resolved MCPTool row
 * @param {Object} context - the tool call's auth context
 * @param {'delete'|'update'} action
 * @param {{ transport?: string, prisma: Object }} opts
 * @throws {Error} AGENT_DELETE_NOT_PROVISIONED_BY_RUN | AGENT_UPDATE_NOT_PROVISIONED_BY_RUN
 */
async function refuseAgentMutationOfRowNotProvisionedByRun(service, context, action, opts = {}) {
  const isAgent = require('./registrant-declaration').isAgentCaller(context, opts.transport);
  if (!isAgent) return;
  const callingExecutionId = typeof context?.callingExecutionId === 'string' ? context.callingExecutionId : '';
  const cfg = service?.configuration && typeof service.configuration === 'object' ? service.configuration : {};
  const provisionedBy = typeof cfg.provisionedByExecutionId === 'string' ? cfg.provisionedByExecutionId : '';
  const runScope = typeof cfg.provisionedByRunScope === 'string' ? cfg.provisionedByRunScope : '';
  let reason;
  if (!provisionedBy) {
    reason = 'not-provisioned-by-an-agent-run';
  } else if (!callingExecutionId) {
    reason = 'no-calling-execution';
  } else if (provisionedBy === callingExecutionId) {
    return;
  } else if (!runScope) {
    reason = 'no-run-scope';
  } else {
    try {
      const exec = await opts.prisma.agentExecution.findUnique({ where: { id: callingExecutionId }, select: { taskId: true } });
      const task = exec && typeof exec.taskId === 'string'
        ? await opts.prisma.task.findUnique({ where: { id: exec.taskId }, select: { id: true, type: true } })
        : null;
      if (!task) reason = 'could-not-check';
      else if (task.type === 'PIPELINE' && task.id === runScope) return;
      else reason = 'another-run';
    } catch {
      reason = 'could-not-check';
    }
  }
  const code = action === 'update' ? 'AGENT_UPDATE_NOT_PROVISIONED_BY_RUN' : 'AGENT_DELETE_NOT_PROVISIONED_BY_RUN';
  log.warn({ serviceId: service?.id, action, callingExecutionId: callingExecutionId || null, reason, errorCode: code, securityEvent: true },
    'Agent attempted to mutate a service this run did not register; refused');
  const left = action === 'update' ? 'it is left unchanged' : 'it is left in place';
  const fact = (reason === 'could-not-check' || reason === 'no-run-scope')
    ? `the platform could not confirm that this run registered this service, so ${left}`
    : `this service was not registered by this run, so ${left}`;
  throw new Error(
    `${code}: ${fact}. An agent can ${action} only a service this run registered — never a service the task named as ` +
    `already registered, and never a registration the platform answered \`adopted\`.`
  );
}

/**
 * The leg an execution belongs to, read at REGISTRATION and stamped as `provisionedByRunScope`: a PIPELINE task's id, or
 * a child task's owning leg (its stage's server-written `harnessTaskId`). Null for anything else, a missing row or a read
 * error — the row then carries no scope and only its registering execution may mutate it (fail closed, never a refusal
 * of the registration itself).
 */
async function provisionedRunScope(prisma, executionId) {
  try {
    const exec = await prisma.agentExecution.findUnique({ where: { id: executionId }, select: { taskId: true } });
    if (!exec || typeof exec.taskId !== 'string' || !exec.taskId) return null;
    const task = await prisma.task.findUnique({ where: { id: exec.taskId }, select: { id: true, type: true, stageId: true } });
    if (!task) return null;
    if (task.type === 'PIPELINE') return task.id;
    if (!task.stageId) return null;
    const stage = await prisma.stage.findUnique({ where: { id: task.stageId }, select: { metadata: true } });
    const legId = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata.harnessTaskId : undefined;
    return typeof legId === 'string' && legId ? legId : null;
  } catch {
    return null;
  }
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
  refuseAgentMutationOfPlatformRow,
  refuseAgentMutationOfRowNotProvisionedByRun,
  provisionedRunScope,
  invalidateServiceCaches,
  sanitizeEndpointUrl
};
