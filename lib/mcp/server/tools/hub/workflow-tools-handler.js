/**
 * Workflow Tools Handler
 *
 * MCP Hub tool handler for multi-service workflow execution.
 * Uses the shared OrchestrationEngine for execution logic.
 *
 * Security Features (for external MCP flows):
 * - POV access validation (ownership, team membership, admin)
 * - Audit logging (activity tracking for compliance)
 *
 * @see lib/services/workflow/core/orchestration-engine.js (shared core)
 * @see implementation-plan-v4.2-focused.md
 * @see mcp-tool-gold-standard-pattern.md (GS7, GS9)
 */

const { z } = require('zod');
// BC27 — reuse the inlined stripDangerousKeys from tool-schemas.js (the inline
// is canonical here because tool-schemas.js loads from both webpack AND bare-Node;
// importing from there reuses the same inline copy + sync marker rather than
// adding a third inline copy. See lib/utils/sanitize-keys.ts for the TS canonical.)
const { stripDangerousKeys } = require('../../config/tool-schemas');
// Use global Prisma singleton (Dec 2025 consolidation)
const { prisma: globalPrisma } = require('../../../../prisma');
const { InternalServiceRouter } = require('../internal/InternalServiceRouter');
const { OrchestrationEngine } = require('../../../../services/workflow/core/orchestration-engine');
const { validateServiceCall, validateServiceResponse } = require('../../config/service-call-policy');
const { ServiceConnectionPool } = require('../../utils/service-connection-pool');
const { rateLimitCache, updateServiceMetricsCore } = require('./hub-utilities');
const { ensureObject } = require('../../../../utils/ensure-object');
const { resilientServiceCall, raceWithTimeout } = require('../../utils/resilient-call');
const { extractAuthContext } = require('./hub-shared-middleware');
const { isSSRFExemptService } = require('../../config/service-call-policy');
// U2 Phase C (2026-05-19): mint-before-trust + per-service audience
const { mintMcpToken } = require('../../../../auth/token-manager');
const { audienceForService } = require('./audience-policy');
const { stderr, createAdapter } = require('../../mcp-logger');
// BUG-BASIC-XSS-1 Phase 2.4: ~13+ 'error:' field interpolations echo user
// input (service name, workflowName, executionId, Zod errors, etc.) directly
// into MCP tool responses. GAP-3 + GAP-5 from boundary-contract Round 1
// review. Also: write-time sanitize at line 1140 closes the BUG-HUB-001
// sibling persistent stored-XSS via MCPWorkflowExecution.error round-trip.
const { sanitizeForResponse, sanitizeMetadataForAudit } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-workflow' }));

// Trust level utilities for secure context passing
// Controls JWT token exposure based on service trust level
const {
  TrustLevel,
  INTERNAL_SERVICES,
  determineTrustLevel,
  buildServiceContext,
  checkPOVRequirement,
  trustLevelReceivesToken,
  logTrustDenial
} = require('../../../../services/workflow/security/trust-level');

// CUID format validation pattern (validation-engine review Fix 12)
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

// Maximum concurrent workflow executions per user (sec-ops review Fix 13)
// Prevents resource exhaustion attacks and ensures fair usage
// See: /.claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md (System Limits Reference)
const MAX_CONCURRENT_EXECUTIONS_PER_USER = 10;

// ────────────────────────────────────────────────────────────────────────────
// Handler-boundary input validation (BC76 / N1 closure, Phase 2 chunk 2026-05-16)
//
// Closes N1 from validation-engine's Phase 1 audit: the handler was destructuring
// workflowName/povId/taskId from raw args and the inner MCPOrchestrationParamsSchema
// safeParse at :722 (engine-input schema) does NOT include those meta-fields, so
// they were never validated by Zod inside this handler.
//
// Phase 1's dispatch-with-schema validates at the consolidated-tool boundary
// (CONSOLIDATED_SCHEMAS.services.inputSchema) and GS12 validates CUID format
// on taskId/povId at the services-dispatcher. This is the third gate —
// handler-side defense-in-depth that doesn't trust upstream layers.
//
// Permissive on `steps` (z.array(z.any())) because the stricter per-step shape
// (service/tool/arguments/retries/etc.) is validated at :722 against the
// orchestration engine's input schema after workflowName lookup resolves
// the steps. Cross-cutting concern Phase 4 will collapse the 3-way schema
// fragmentation (per synthesis Phase 4 commission).
//
// **KEEP IN SYNC** — bounds must match the engine schema at
// `lib/services/workflow/types/orchestration-params.ts`. Phase 4 (2026-05-16)
// extracted these into named constants both here and at the engine module.
// The contract test at `scripts/test-workflow-schema-alignment.ts` asserts the
// constants below match the canonical engine-side values — build fails on drift.
//
// Replaces the prose KEEP-IN-SYNC mechanism. Per the 4-specialist Phase 4
// verdict matrix (Option C, 85% avg confidence): structural drift detection
// replaces comment-as-contract.
// ────────────────────────────────────────────────────────────────────────────
// Inline copies of the workflow bounds. Sourced from
// `lib/services/workflow/types/orchestration-params.ts` — change there first,
// then update here. Contract test verifies equality at build time.
const WORKFLOW_EXECUTION_MODES = ['sequential', 'parallel', 'conditional'];
const WORKFLOW_FAILURE_STRATEGIES = ['stop', 'continue', 'rollback'];
const WORKFLOW_STEPS_MAX = 20;
const WORKFLOW_TIMEOUT_MIN = 1000;
const WORKFLOW_TIMEOUT_MAX = 600000;
const WORKFLOW_TIMEOUT_DEFAULT = 60000;
const WORKFLOW_RETRY_BUDGET_MIN = 0;
const WORKFLOW_RETRY_BUDGET_MAX = 20;
const WORKFLOW_RETRY_BUDGET_DEFAULT = 10;

const WorkflowHandlerInputSchema = z.object({
  workflowName: z.string().max(200).optional(),
  steps: z.array(z.any()).max(WORKFLOW_STEPS_MAX).optional(),
  executionMode: z.enum(WORKFLOW_EXECUTION_MODES).default('sequential'),
  failureStrategy: z.enum(WORKFLOW_FAILURE_STRATEGIES).default('stop'),
  timeout: z.number().min(WORKFLOW_TIMEOUT_MIN).max(WORKFLOW_TIMEOUT_MAX).default(WORKFLOW_TIMEOUT_DEFAULT),
  // F3 closure (workflow-orchestration Phase 2 chunk review, 2026-05-16) —
  // pre-existing data-loss bug: handler's old params-rebuild dropped
  // maxTotalRetries silently, so the engine's `params.maxTotalRetries || 10`
  // fallback always fired → users specifying `maxTotalRetries: 5` to limit
  // workflow retry budget got 10 anyway.
  maxTotalRetries: z.number().int().min(WORKFLOW_RETRY_BUDGET_MIN).max(WORKFLOW_RETRY_BUDGET_MAX).default(WORKFLOW_RETRY_BUDGET_DEFAULT),
  povId: z.string().regex(CUID_PATTERN).optional(),
  taskId: z.string().regex(CUID_PATTERN).optional(),
  // C8 (mcp-tool-arch round-2 2026-05-17): accept snake_case aliases too.
  // services-dispatcher.js:28 CUID-validates BOTH povId and pov_id (W2 closure,
  // 2026-05-16), but doesn't alias-rename. Without these fields here, a caller
  // passing pov_id would reach this handler with povId === undefined, and the new
  // requires pre-flight at line ~793 would false-positive-reject the call.
  pov_id: z.string().regex(CUID_PATTERN).optional(),
  task_id: z.string().regex(CUID_PATTERN).optional(),
}).passthrough()
  // BC27 boy-scout (validation-engine Phase 2 chunk review) — don't trust upstream
  // for prototype-pollution defense. Phase 2 N4 strips at the consolidated boundary;
  // this re-strips at the handler boundary so a regression at L3 doesn't expose this
  // handler. Idempotent — sanitize-keys.ts:32-37 short-circuits on already-clean input.
  .transform(stripDangerousKeys)
  // C8 (continued): normalize snake_case → camelCase BEFORE downstream code reads.
  // camelCase wins via `??` on collision (matches existing handler conventions).
  .transform(({ pov_id, povId, task_id, taskId, ...rest }) => ({
    ...rest,
    povId: povId ?? pov_id,
    taskId: taskId ?? task_id,
  }));

// ────────────────────────────────────────────────────────────────────────────
// W1 closure — workflow.list handler-boundary safeParse (2026-05-16).
//
// Closes the W1 finding from Phase 2 workflow chunk review (validation-engine):
// `handleListWorkflowExecutions` was reading `povId`/`status`/`workflowType`
// from raw args and passing them straight into a Prisma `where` clause. After
// W2 closure (services-dispatcher CUID_PARAM_NAMES adds povId/pov_id),
// `povId` is upstream-CUID-validated. After Phase 1, `status` is upstream-
// enum-validated. The REMAINING gap was `workflowType: z.string().optional()`
// (no length cap), which this schema closes with `.max(100)`.
//
// Same action-discriminator pattern as WorkflowHandlerInputSchema above —
// handler-boundary tightening that the cross-action consolidated services
// schema can't carry. Per mcp-tool-arch F7 from Phase 2 workflow review:
// future Phase 3 discriminated-union may collapse these into a single
// schema; for now, separate-schema-per-action is the cleaner shape.
// ────────────────────────────────────────────────────────────────────────────
const WorkflowListHandlerInputSchema = z.object({
  povId: z.string().regex(CUID_PATTERN).optional(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']).optional(),
  // workflowType DoS bound (W1 gap closure) — Phase 1 declares unbounded string
  workflowType: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
}).passthrough().transform(stripDangerousKeys);

// ============================================
// Zod Schema Validation (CommonJS-first for MCP server)
// ============================================

let MCPOrchestrationParamsSchema = null;

/**
 * Initialize Zod schema validation
 * Uses CommonJS require() for JavaScript version (production MCP server)
 * Falls back to dynamic import for TypeScript version (development with ts-node)
 */
async function initializeZodSchema() {
  if (!MCPOrchestrationParamsSchema) {
    // Try CommonJS require first (works for .js files in plain Node.js)
    try {
      const schemaModule = require('../../../../services/workflow/types/orchestration-params');
      MCPOrchestrationParamsSchema = schemaModule.MCPOrchestrationParamsSchema;
      log.info('Zod schema loaded via CommonJS require');
      return MCPOrchestrationParamsSchema;
    } catch (requireError) {
      log.info({ err: requireError }, 'CommonJS require failed, trying dynamic import');
    }

    // Fallback to dynamic import (works with ts-node in development)
    try {
      const schemaModule = await import('../../../../services/workflow/types/orchestration-params');
      MCPOrchestrationParamsSchema = schemaModule.MCPOrchestrationParamsSchema;
      log.info('Zod schema loaded via dynamic import');
    } catch (importError) {
      // SECURITY: Fail hard if validation schema cannot be loaded (sec-ops review Fix 4)
      log.error({ err: importError }, 'CRITICAL: Zod schema failed to load');
      throw new Error('[Workflow] Cannot initialize without validation schema: ' + importError.message);
    }
  }
  return MCPOrchestrationParamsSchema;
}

// ============================================
// Security: POV Access Validation (JavaScript)
// ============================================

/**
 * Validate POV access for external MCP flows
 *
 * Checks: admin role, ownership, team membership
 *
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID to validate
 * @param {string} povId - POV ID to check access for
 * @param {string} [userRole] - User role (if already known)
 * @returns {Promise<{hasAccess: boolean, reason?: string}>}
 */
async function validatePOVAccess(prisma, userId, povId, userRole = null) { // eslint-disable-line no-unused-vars -- prisma/userRole kept for call-site compat; the canonical owns the query + fresh role lookup
  if (!userId || !povId) {
    return { hasAccess: false, reason: 'Missing userId or povId' };
  }

  try {
    // 2026-05-27 (pentest G-1): converged onto the canonical TS chokepoint instead of a
    // divergent hand-rolled copy (BC75 phantom-canonical). requireWrite:true preserves
    // this path's semantics — services.workflow.execute is write-adjacent, owner/team/admin
    // only, isDemo NOT granted — AND inherits future canonical changes (demo-write split,
    // tenant scoping) automatically. Same runtime `require` pattern as the sibling TS modules
    // already required at the top of this file (token-manager, url-safety, prisma).
    const { validateMCPPOVAccess } = require('../../../../auth/validate-pov-access');
    const hasAccess = await validateMCPPOVAccess(userId, povId, {
      logContext: 'services.workflow.execute',
      requireWrite: true,
    });
    return hasAccess
      ? { hasAccess: true, reason: 'authorized' }
      : { hasAccess: false, reason: 'No access to POV' };
  } catch (error) {
    log.error({ err: error }, 'POV access check failed');
    return { hasAccess: false, reason: `Access check failed: ${error.message}` };
  }
}

// ============================================
// Security: Audit Logging (JavaScript)
// ============================================

/**
 * Log workflow orchestration activity
 *
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User performing the action
 * @param {string} action - Action type (start, complete, step, failed)
 * @param {Object} details - Additional details
 */
async function auditOrchestration(prisma, userId, action, details = {}) {
  if (!userId) {
    log.warn('Skipping audit - no userId');
    return;
  }

  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'WORKFLOW_ORCHESTRATION',
        action: `orchestration.${action}`,
        // 2026-05-23 BUG-AUDIT-XSS-2 sweep: details spread can carry
        // user-controlled fields (workflowName, services[], step inputs).
        // Wrap the full metadata object with sanitizeMetadataForAudit which
        // walks string values and escapeHtml-encodes them per BC71 write-time
        // pattern.
        metadata: sanitizeMetadataForAudit({
          success: action === 'complete' || action === 'start',
          timestamp: new Date().toISOString(),
          source: 'mcp_hub',
          ...details
        })
      }
    });
  } catch (error) {
    // Don't fail workflow for audit errors
    log.warn({ err: error }, 'Failed to log audit activity');
  }
}

/**
 * Log security event (access denied, etc.)
 */
async function auditSecurityEvent(prisma, userId, event, details = {}) {
  if (!userId) return;

  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'SECURITY_EVENT',
        action: `orchestration.security.${event}`,
        // BUG-AUDIT-XSS-2 sweep: same write-time sanitize as audit site above.
        metadata: sanitizeMetadataForAudit({
          success: false,
          severity: 'high',
          timestamp: new Date().toISOString(),
          source: 'mcp_hub',
          ...details
        })
      }
    });
  } catch (error) {
    log.warn({ err: error }, 'Failed to log security event');
  }
}

class WorkflowToolsHandler {
  constructor(prisma = null, internalRouter = null) {
    this.prisma = prisma || globalPrisma;
    this.internalRouter = internalRouter || new InternalServiceRouter();
    this.engine = new OrchestrationEngine({ maxConcurrent: 5 });

    // Initialize connection pool for external service calls (100-200ms savings per call)
    this.connectionPool = ServiceConnectionPool.getInstance({
      maxIdleTime: 5 * 60 * 1000,  // 5 minutes
      maxConnections: 20
    });
    this.connectionPool.startCleanupTimer();
  }

  /**
   * Create service caller function for the orchestration engine
   *
   * The engine expects: async (step, context) => StepResult
   * This wraps our internal router + external MCP client calling logic.
   *
   * Security Features:
   * - validateServiceCall() for external calls (tool whitelist, blocked patterns, URLs)
   * - ServiceConnectionPool for connection reuse
   * - validateServiceResponse() for PII filtering
   * - Token passing for external authenticated services (Jan 2026 - feature parity with TS handler)
   */
  createServiceCaller(context) {
    // U2 Phase D site #3 (2026-05-19): extractAuthContext now returns `azp`
    // instead of `token` — per-call mint at trust-gate (Phase C) supplies the
    // outbound token; userToken (Bearer-forwarded) is no longer used.
    const { userId, userEmail, role: userRole, azp } = extractAuthContext(context, 'Workflow execution');
    const povId = context?.pov?.id || context?.apiUserContext?.povId || context?.povId;

    return async (step) => {
      const { service, tool, arguments: rawArgs = {}, timeout: stepTimeout } = step;
      // Transport boundary guard: step arguments may arrive as JSON string
      const args = ensureObject(rawArgs, {}, `Workflow Step ${service}.${tool}`);
      const startTime = Date.now();

      // Per-step identity FACT (Protocol 10 — ship the fact, never the verdict).
      // Hoisted to `let` so BOTH the success return and the failure return in the
      // catch can carry it — the service_rejected failure path is the exact case
      // this was built for (identity forwarded, service rejected downstream).
      // Stays null for pre-trust-resolution errors (not-found / policy-blocked /
      // SSRF / rate-limited), which are legitimately identity-less by design.
      // NEVER carries a `tokenAccepted`-style verdict: the Hub gets no validation
      // ack back from the service, so it reports only what it DID with the identity.
      let identity = null;

      try {
        // Check if internal service (bypass external security checks)
        if (INTERNAL_SERVICES.includes(service)) {
          // Internal services route in-process (no minted-JWT forwarding on the
          // wire); identity is INTERNAL trust with no per-call token attached.
          identity = { trustLevel: 'INTERNAL', tokenForwarded: false, audience: null };
          // Apply per-step timeout if specified (default: no timeout, bounded by global)
          const internalCall = this.internalRouter.routeCall(service, tool, args, context);
          const result = stepTimeout
            ? await raceWithTimeout(internalCall, stepTimeout, `Internal step ${service}/${tool}`)
            : await internalCall;
          const data = result.result;

          // Detect MCP protocol errors: SDKNativeAdvancedTools returns { content: [...], isError: true }
          // instead of throwing, so we must check the isError flag explicitly
          const isErrorResponse = data?.isError === true;

          return {
            success: !isErrorResponse,
            data,
            error: isErrorResponse ? (data?.content?.[0]?.text || 'Internal service returned error') : undefined,
            ...(isErrorResponse && { errorType: 'service_rejected', retryable: false }),
            ...(identity ? { identity } : {}),
            executionTime: Date.now() - startTime,
            service,
            tool
          };
        }

        // External service - look up service record (by ID or name)
        const serviceRecord = await this.prisma.mCPTool.findFirst({
          where: {
            OR: [
              { id: service },
              { name: service }
            ],
            status: 'ACTIVE'
          },
          select: {
            id: true,
            name: true,
            status: true,
            configuration: true,
            capabilities: true,
            permissions: true  // Required for publicAccess check
          }
        });

        if (!serviceRecord) {
          // Check if it's a typo of an internal service
          const internalSuggestions = INTERNAL_SERVICES.filter(s =>
            s.includes(service.toLowerCase()) || service.toLowerCase().includes(s.split('-')[1] || s)
          );
          const hint = internalSuggestions.length > 0
            ? ` Did you mean: ${internalSuggestions.join(', ')}?`
            : ` Use services(action: 'discover') to see available services.`;

          return {
            success: false,
            error: `Service not found: "${sanitizeForResponse(service)}".${hint}`,
            errorType: 'not_found',
            retryable: false,
            executionTime: Date.now() - startTime,
            service,
            tool
          };
        }

        const endpoint = serviceRecord.configuration?.endpoint;
        if (!endpoint) {
          return {
            success: false,
            error: `Service ${sanitizeForResponse(service)} has no endpoint configured`,
            errorType: 'not_found',
            retryable: false,
            executionTime: Date.now() - startTime,
            service,
            tool
          };
        }

        // SECURITY: Validate service call against Hub security policy
        // Extracts registered tools for dynamic whitelisting
        const registeredTools = serviceRecord.capabilities?.tools?.map(t =>
          typeof t === 'string' ? t : t.name
        ) || [];

        const policyCheck = validateServiceCall(
          service,
          tool,
          args,
          context,
          registeredTools
        );

        if (!policyCheck.allowed) {
          const violationMessages = policyCheck.violations.map(v => v.message || v.type).join('; ');
          log.warn({ securityEvent: true, service, tool, violations: policyCheck.violations, userId }, 'Service call blocked by policy');
          return {
            success: false,
            error: `Service call blocked by compliance policy: ${sanitizeForResponse(violationMessages)}`,
            errorType: 'policy_blocked',
            retryable: false,
            executionTime: Date.now() - startTime,
            service,
            tool,
            securityBlocked: true
          };
        }

        // ACCESS CONTROL: Check service access authorization
        // Post-standardization (Jan 2026): All services use permissions.publicAccess
        const isPublic = serviceRecord.permissions?.publicAccess === true;
        const isOwner = serviceRecord.configuration?.ownerId === userId;
        const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

        if (!isPublic && !isOwner && !isAdmin) {
          log.warn({ securityEvent: true, service, userId, isPublic, isOwner, isAdmin }, 'Service access denied');
          return {
            success: false,
            error: `Access denied to service "${sanitizeForResponse(service)}". Services require publicAccess, ownership, or admin role.`,
            errorType: 'policy_blocked',
            retryable: false,
            executionTime: Date.now() - startTime,
            service,
            tool,
            accessDenied: true
          };
        }

        // RATE LIMITING: Enforce per-service rate limits
        const serviceRateLimit = serviceRecord.configuration?.rateLimit;
        if (serviceRateLimit) {
          const { requests = 100, windowMs = 60000 } = serviceRateLimit;

          const rateLimitResult = rateLimitCache.checkRateLimit(
            userId,
            serviceRecord.id,
            requests,
            windowMs
          );

          if (!rateLimitResult.allowed) {
            const retryAfterMs = rateLimitResult.resetAt - Date.now();
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);

            log.warn({ service, userId, remaining: rateLimitResult.remaining, resetAt: new Date(rateLimitResult.resetAt).toISOString() }, 'Rate limit exceeded');

            return {
              success: false,
              error: `Rate limit exceeded for service "${sanitizeForResponse(service)}". Limit: ${requests}/${windowMs / 1000}s. Retry in ${retryAfterSec}s.`,
              errorType: 'rate_limited',
              retryable: false,  // Retrying amplifies the problem
              executionTime: Date.now() - startTime,
              service,
              tool,
              rateLimited: true,
              retryAfter: retryAfterSec
            };
          }
        }

        // CONNECTION POOLING: Validate endpoint protocol
        // Note: SSE/HTTP only - WebSocket removed Jan 2026
        if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
          return {
            success: false,
            error: `Unsupported endpoint protocol for service "${sanitizeForResponse(service)}". Only HTTP/HTTPS (SSE) is supported.`,
            errorType: 'validation',
            retryable: false,
            executionTime: Date.now() - startTime,
            service,
            tool
          };
        }

        // BC51 FIX: SSRF prevention — block workflow calls to private/internal addresses
        // SSRF-exempt services (first-party Docker containers) bypass endpoint checks
        // Trust level (JWT forwarding) is separate — see service-approval-policy.js
        if (!isSSRFExemptService(serviceRecord)) {
          const { validateUrlSafety } = require('../../../../utils/url-safety');
          const urlCheck = validateUrlSafety(endpoint);
          if (!urlCheck.safe) {
            return {
              success: false,
              error: `Workflow call blocked: endpoint resolves to internal address (${sanitizeForResponse(urlCheck.reason)})`,
              errorType: 'policy_blocked',
              retryable: false,
              executionTime: Date.now() - startTime,
              service,
              tool
            };
          }
        }

        // Per-step timeout takes precedence, then service config, then default 30s
        const maxExecutionTime = stepTimeout || serviceRecord.configuration?.maxExecutionTime || 30000;

        // SECURITY: Determine trust level for this service
        // Controls whether JWT token is included in _context
        // See: lib/services/workflow/security/trust-level.js
        const trustLevel = await determineTrustLevel({
          serviceId: service,
          serviceRecord,
          userId,
          povId,
          prisma: this.prisma
        });

        // U2 Phase C (2026-05-19): mint-before-trust-gate.
        // Determine trust permission FIRST, mint per-call token ONLY when trust
        // level grants token-receiving privileges. Prevents wasted RSA-sign
        // work on denials and keeps the mint audit trail clean (mint event
        // correlates 1:1 with trust-grant event).
        const hasToken = trustLevelReceivesToken(trustLevel);

        // C2: capture the EXACT audience handed to the mint so the surfaced fact
        // cannot drift from the token's real `aud`. Null when no token is minted.
        const audience = hasToken ? audienceForService(serviceRecord) : null;

        let perCallToken;
        if (hasToken) {
          // Per-call mint with PER-SERVICE audience (RFC 8707 blast-radius
          // isolation). A token minted here for Snowflake CANNOT replay at
          // Databricks / EIA / front-door /api — each service's verifier
          // only accepts its own audience URI.
          //
          // Mint signature enumerates ALL required MintMcpTokenOptions fields
          // explicitly (v3.1 Edit 2 — .js file has no TS compile gate to catch
          // missing role/email which would silently break RBAC):
          perCallToken = await mintMcpToken({
            userId,
            email: userEmail,
            role: userRole,
            scope: 'mcp:execute',
            audience,  // C2: same value surfaced in the identity fact below
            azp,  // U2 Phase D site #3: from extractAuthContext (Phase E populates source)
            ttlSeconds: 900,
            purpose: 'per-call-forward',
          });
        }

        // Build context based on trust level
        // Token is only passed to INTERNAL, TRUSTED, OWNER, TEAM_MEMBER services
        // Phase 2: TEAM_MEMBER enabled with RS256/JWKS
        const serviceContext = buildServiceContext(trustLevel, {
          userId,
          userEmail,
          userRole,
          token: perCallToken,
          povId: povId || null,
          tenantId: povId || null,  // Currently tenantId = povId
          requestId: context?.requestId || `wf-${Date.now()}`,
          source: 'mcp_hub_workflow'
        });

        // Per-step identity FACT. `tokenForwarded` is ground truth of what was
        // actually attached to the outbound _context — NOT `hasToken`. hasToken
        // means "trust policy grants a token"; buildServiceContext's spread-guard
        // (...(token ? {token} : {})) omits the key if the per-call mint failed
        // upstream, so reading the assembled object is the only honest fact (C3).
        // audience is surfaced only when a token was truly attached (C2).
        const tokenForwarded = Object.prototype.hasOwnProperty.call(serviceContext, 'token');
        identity = {
          trustLevel,                                    // C1: the mint-time value, not a recompute
          tokenForwarded,
          audience: tokenForwarded ? audience : null,
        };

        // Log trust decision for debugging/auditing
        log.info({ service, trustLevel, hasToken }, 'Service trust level resolved');

        // Phase 2: Audit trust denials for security forensics
        if (!hasToken) {
          await logTrustDenial(this.prisma, {
            userId,
            serviceId: service,
            serviceName: serviceRecord?.name || service,
            trustLevel,
            povId: povId || null,
            reason: `Token withheld: trust level ${trustLevel} does not receive tokens`
          });
        }

        // Ensure arguments is a plain object (transport boundary guard)
        const callArguments = ensureObject(args, {}, 'Workflow Step');

        // Call with stale connection detection and retry (resilient-call utility)
        const response = await resilientServiceCall(
          this.connectionPool,
          serviceRecord.id,
          endpoint,
          // F-NEW-5 (2026-07-17): RequestOptions is the SDK's THIRD callTool arg (2nd = resultSchema).
          // Without it the SDK's 60s default binds instead of maxExecutionTime — see
          // service-call-handler.js for the full rationale. Strictly widening; also sends
          // notifications/cancelled so the remote stops work (the outer race only abandons).
          (pooledClient) => pooledClient.callTool({
            name: tool,
            arguments: {
              ...callArguments,
              _context: serviceContext
            }
          }, undefined, { timeout: maxExecutionTime }),
          { timeout: maxExecutionTime, label: `workflow:${service}/${tool}` }
        );

        // Parse MCP response structure: { content: [{ type: 'text', text: '...' }] }
        let parsedData = response;
        if (response.content && Array.isArray(response.content) && response.content[0]?.text) {
          try {
            parsedData = JSON.parse(response.content[0].text);
          } catch (e) {
            // If not JSON, keep raw text
            parsedData = { raw: response.content[0].text };
          }
        }

        // SECURITY: Filter sensitive data from response
        const filteredResponse = validateServiceResponse(parsedData);

        // Detect MCP protocol errors (isError flag on the raw response)
        const hasError = response.isError === true;

        // F-SWEEP-3 A-lite (2026-07-17, panel): feed the workflow path into the shared
        // service-metrics EMA — previously invisible to successRate/errorCount (only the
        // direct services.call path and health probes fed them). Metrics-only, fire-and-
        // forget; mcp_interactions rows deferred (row-bloat decision, see F-SWEEP-3 record).
        // Latency only on success (C1 discipline). Known residual: transport-level throws
        // land in the catch below where serviceRecord is out of scope — those failures are
        // unfed (slight upward bias, immaterial under ~1000:1 probe dominance).
        const wfExecutionTime = Date.now() - startTime;
        updateServiceMetricsCore(this.prisma, serviceRecord.id, {
          executionTimeMs: hasError ? null : wfExecutionTime,
          success: !hasError
        }).catch(() => {});

        return {
          success: !hasError,
          data: filteredResponse.filteredResponse,  // Use filteredResponse not .data
          error: hasError ? (response.content?.[0]?.text || 'Service returned error') : undefined,
          ...(hasError && { errorType: 'service_rejected', retryable: false }),
          ...(identity ? { identity } : {}),
          executionTime: Date.now() - startTime,
          service,
          tool,
          warnings: filteredResponse.warnings || undefined
        };

      } catch (error) {
        // Classify error type for diagnostics and retry decisions
        const isTimeout = /timeout/i.test(error.message) || error.code === 'ETIMEDOUT';
        const isNetwork = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN']
          .includes(error.code);

        let errorType = 'service_error';
        let retryable = false;
        if (isTimeout) {
          errorType = 'timeout';
          retryable = true;
        } else if (isNetwork) {
          errorType = 'network';
          retryable = true;
        }

        return {
          success: false,
          // BUG-BASIC-XSS-1 Phase 2.4: error.message may wrap upstream user
          // input (e.g., service tool error includes the args echoed back).
          // This result feeds into the engine.execute aggregation that
          // workflow-tools-handler.js:1140 persists — but defense-in-depth at
          // the per-step return shape too.
          error: sanitizeForResponse(error.message),
          errorType,
          retryable,
          // C5: the failure path carries identity too — this is the exact
          // service_rejected case that motivated the change (identity forwarded,
          // service rejected downstream). Null for pre-resolution throws.
          ...(identity ? { identity } : {}),
          executionTime: Date.now() - startTime,
          service,
          tool
        };
      }
    };
  }

  /**
   * services(workflow.execute) - Execute a multi-service workflow
   *
   * @param {Object} args - Workflow arguments
   * @param {string} [args.workflowName] - Name of saved workflow to execute (alternative to steps)
   * @param {Array} [args.steps] - Workflow steps [{service, tool, arguments, dependsOn?}]
   * @param {string} [args.executionMode='sequential'] - sequential | parallel | conditional
   * @param {string} [args.failureStrategy='stop'] - stop | continue | rollback
   * @param {number} [args.timeout=60000] - Global timeout in ms
   * @param {string} [args.povId] - Optional POV scope
   * @param {string} [args.taskId] - Optional task context (derives povId if not provided)
   * @param {Object} context - User context
   */
  async handleExecuteWorkflow(args, context) {
    // BC76 / N1 closure — handler-boundary safeParse (Phase 2 chunk 2026-05-16).
    // Validates ALL handler-relevant fields (workflowName/povId/taskId + meta)
    // that the inner orchestration schema at :722 doesn't cover. Defense-in-depth
    // on top of Phase 1's dispatch-boundary safeParse. See WorkflowHandlerInputSchema
    // declaration above for full rationale.
    const handlerParsed = WorkflowHandlerInputSchema.safeParse(args);
    if (!handlerParsed.success) {
      const errors = handlerParsed.error.errors
        .map(e => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
        .join('; ');
      return {
        success: false,
        error: `Invalid workflow.execute parameters: ${sanitizeForResponse(errors)}`,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: [
          'Fix validation errors above',
          'Verify workflowName is a string, taskId/povId are valid CUIDs, executionMode is sequential/parallel/conditional',
        ],
      };
    }

    // BC36 closure — the manual `JSON.parse(args.steps)` block that previously
    // lived here is now dead code after Phase 1: CONSOLIDATED_SCHEMAS.services
    // declares `steps: z.array(z.object({...})).max(20)` (no string union),
    // so string-form steps are rejected at the dispatch boundary before reaching
    // this handler. If a future requirement adds string-form support, update
    // the consolidated services schema (single source of truth) — don't
    // re-introduce per-handler transport coercion.

    let {
      workflowName,
      steps,
      executionMode,   // schema applies default 'sequential' if absent
      failureStrategy, // schema applies default 'stop' if absent
      timeout,         // schema applies default 60000 if absent
      maxTotalRetries, // schema applies default 10 if absent (F3 closure)
      povId,
      taskId,
    } = handlerParsed.data;

    const { userId, role: userRole } = extractAuthContext(context, 'Workflow execution');

    // SECURITY: Check concurrent execution limit per user (sec-ops review Fix 13)
    // Prevents resource exhaustion and ensures fair usage across users
    const runningCount = await this.prisma.mCPWorkflowExecution.count({
      where: {
        userId,
        status: 'RUNNING'
      }
    });

    if (runningCount >= MAX_CONCURRENT_EXECUTIONS_PER_USER) {
      // Log security event for potential abuse detection
      await auditSecurityEvent(this.prisma, userId, 'execution_limit_exceeded', {
        runningCount,
        limit: MAX_CONCURRENT_EXECUTIONS_PER_USER,
        action: 'services.workflow.execute'
      });

      return {
        success: false,
        error: `Maximum concurrent executions reached (${MAX_CONCURRENT_EXECUTIONS_PER_USER}). Wait for running workflows to complete.`,
        runningCount,
        limit: MAX_CONCURRENT_EXECUTIONS_PER_USER,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: [
          'Wait for existing workflows to complete',
          `Use services(action: 'workflow.list', status: "RUNNING") to see active workflows`,
          `Cancel unneeded workflows: services(action: 'workflow.cancel', executionId: "...")`
        ]
      };
    }

    // Track workflow definition ID for named workflows (mcp-hub-specialist review)
    // This populates MCPWorkflowExecution.workflowId for traceability
    let namedWorkflowId = null;
    // Bug #2 closure (2026-05-17): runtime-context requirements declared by the
    // named workflow. Empty for inline-steps callers (skipped per workflow-orch I1).
    let workflowRequires = [];

    // If workflowName provided, lookup from MCPWorkflow table
    // NOTE: Use findFirst (not findUnique) - compound where clause (boundary-contract review)
    if (workflowName && !steps) {
      const workflow = await this.prisma.mCPWorkflow.findFirst({
        where: { name: workflowName, status: 'ACTIVE' }
      });

      if (!workflow) {
        return {
          success: false,
          error: `Workflow "${sanitizeForResponse(workflowName)}" not found. Use services(action: 'workflow.list') to check executions, or provide inline steps.`,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: [
            'Check workflow name spelling',
            'Check workflow name spelling and try again',
            'Or provide inline steps: { steps: [...] }'
          ]
        };
      }

      // Capture workflow definition ID for execution record (mcp-hub-specialist review)
      namedWorkflowId = workflow.id;

      // Extract config from workflow.steps (contains full config)
      const config = ensureObject(workflow.steps, {}, 'MCPWorkflow steps');
      steps = config.steps;
      executionMode = config.executionMode || executionMode;
      failureStrategy = config.failureStrategy || failureStrategy;
      timeout = config.timeout || timeout;
      // F3 closure — named workflow's stored maxTotalRetries was also being
      // dropped (sibling of the params-rebuild data-loss bug).
      maxTotalRetries = config.maxTotalRetries || maxTotalRetries;
      // Bug #2 closure (2026-05-17): if the named workflow declares runtime-context
      // requirements (e.g., requires: ["povId"]), extract them so the pre-flight
      // check below can gate dispatch.
      workflowRequires = Array.isArray(config.requires) ? config.requires : [];
    }

    // Derive povId from taskId if not provided
    if (taskId && !povId) {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { povId: true }
      });
      if (task?.povId) {
        povId = task.povId;
      }
    }

    // Bug #2 closure (2026-05-17) — Pre-flight: if a named workflow declared runtime-context
    // requirements, validate they were provided BEFORE dispatching any step. Surfaces
    // "you forgot povId" at the front door instead of letting it fail deep in the first
    // service step that needed it (e.g., Snowflake's REQUIRE_OAUTH path).
    //
    // Runs AFTER taskId→povId derivation so a caller passing taskId satisfies
    // requires: ["povId"] (povId resolved above). Skipped for inline-steps callers
    // (workflowRequires is [] in that case) per workflow-orch I1 — inline-steps callers
    // can include whatever runtime params they like.
    //
    // Error type kept as 'validation' (existing WorkflowErrorTypeSchema enum) per
    // workflow-orch C2 — this is a dispatch-time gate, not a step-level engine failure.
    if (workflowRequires.length > 0) {
      const provided = { povId, taskId };
      const missing = workflowRequires.filter(name => !provided[name]);
      if (missing.length > 0) {
        return {
          success: false,
          error: `Workflow "${sanitizeForResponse(workflowName)}" requires runtime parameter(s): ${sanitizeForResponse(missing.join(', '))}. See workflow description for context.`,
          errorType: 'validation',
          missingRequires: missing,
          declaredRequires: workflowRequires,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: [
            `Re-run with the missing parameter(s): services(action: "workflow.execute", workflowName: "${workflowName}", ${missing.map(p => `${p}: '<your-${p}>'`).join(', ')})`,
            `For povId: services(action: "workflow.execute", workflowName: "${workflowName}", povId: '<cuid-of-pov-where-you-are-team-member>')`
          ]
        };
      }
      // R1 (arch round-2): drift logger — confirm gate satisfied in prod. Surfaces
      // false-negatives where a workflow declared requires but the call succeeded
      // because all declared keys happened to be present. Helps detect drift between
      // declared `requires` and actual call patterns.
      log.info({
        workflow: workflowName,
        declaredRequires: workflowRequires,
        providedKeys: Object.keys(provided).filter(k => provided[k])
      }, 'workflow.execute pre-flight passed: declared requires satisfied');
    }

    // Validate either workflowName or steps was provided
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return {
        success: false,
        error: 'Either workflowName or steps must be provided',
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: [
          `Provide workflowName: services(action: 'workflow.execute', workflowName: "my-workflow")`,
          `Or provide steps: services(action: 'workflow.execute', steps: [{ service: "...", tool: "...", arguments: {} }])`
        ]
      };
    }

    // SECURITY: Check POV context for trust level assignment (trust-level.js)
    // - Internal services always receive INTERNAL trust + token
    // - External services without povId: OWNER (if owned) or ANONYMOUS trust
    // - External services with povId: SCOPED trust
    const povCheck = checkPOVRequirement(steps, povId);

    if (povCheck.warning) {
      log.warn({ warning: povCheck.warning }, 'Security notice');
      // Continue execution but with reduced trust level
    }

    // Security: Validate POV access if workflow is POV-scoped
    if (povId) {
      const accessCheck = await validatePOVAccess(this.prisma, userId, povId, userRole);
      if (!accessCheck.hasAccess) {
        // Log security event
        await auditSecurityEvent(this.prisma, userId, 'access_denied', {
          povId,
          reason: accessCheck.reason,
          action: 'services.workflow.execute'
        });

        return {
          success: false,
          error: `POV access denied: ${sanitizeForResponse(accessCheck.reason)}`,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: ['Verify you have access to the specified POV', 'Contact POV owner for access']
        };
      }
    }

    // Build params object — F3 closure includes maxTotalRetries which the
    // engine reads at orchestration-engine.js:389,466,568 (was being silently
    // dropped pre-fix; engine fell back to `|| 10` default unconditionally).
    const params = { steps, executionMode, failureStrategy, timeout, maxTotalRetries };

    // STEP 1: Zod schema validation (type safety, ranges, required fields)
    const zodSchema = await initializeZodSchema();
    const zodResult = zodSchema.safeParse(params);

    if (!zodResult.success) {
      const zodErrors = zodResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return {
        success: false,
        error: `Validation failed: ${sanitizeForResponse(zodErrors)}`,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: [
          'Fix validation errors above',
          'Example: steps: [{ service: "paichart-project-service", tool: "project", arguments: { action: "pov.list" } }]'
        ]
      };
    }

    // STEP 2: Engine validation (business logic - circular deps, dependency ordering)
    const validation = this.engine.validate(zodResult.data);

    if (!validation.isValid) {
      // Phase 4 (2026-05-16) — Drift logger per boundary-contract specialist
      // recommendation. When engine.validate() rejects a payload that Zod
      // already accepted, that's a schema-vs-engine contract gap (Zod let
      // something through that engine semantically refuses). Log loud so
      // SOC can detect drift in production. See scripts/test-workflow-schema-alignment.ts
      // for the static drift check; this is the runtime complement.
      log.warn({
        securityEvent: true,
        component: 'workflow-handler',
        engineErrors: validation.errors,
        zodPassedFields: Object.keys(zodResult.data || {}),
        userId
      }, 'Engine validation rejected Zod-accepted payload — possible schema/engine drift');
      return {
        success: false,
        error: validation.errors.join('; '),
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: [
          'Fix validation errors above',
          'Check for circular dependencies in dependsOn arrays'
        ]
      };
    }

    // Use validated data (includes Zod defaults)
    const validatedParams = zodResult.data;

    const startTime = Date.now();
    const executionRef = `wf-${Date.now()}`; // Reference ID for logging (not FK)
    let execution = null;

    try {
      // Create execution record
      // Note: workflowId links to MCPWorkflow.id for named workflows (null for ad-hoc)
      // 2026-05-23 (Round 3 A5 finding): persist input.steps[].service + .tool
      // through sanitizeMetadataForAudit. Verified live — adversary submitted
      // service: "<script>alert(1)</script>" was stored RAW in input + steps
      // JSONB columns. Any admin UI / workflow viewer rendering input.steps
      // as HTML would execute the payload. BC71 write-time defense — same
      // class as the Activity.create audit fixes above.
      const sanitizedInput = sanitizeMetadataForAudit(validatedParams);
      execution = await this.prisma.mCPWorkflowExecution.create({
        data: {
          workflowId: namedWorkflowId, // Links to MCPWorkflow.id for named workflows (null for ad-hoc)
          workflowType: namedWorkflowId ? 'named_workflow' : 'mcp_service_orchestration',
          executionMode: 'AD_HOC',  // MCP execution (ChatGPT/Claude Desktop)
          userId,
          povId: povId || null,
          status: 'RUNNING',
          startTime: new Date(),
          input: sanitizedInput,
          steps: []
        }
      });

      // Audit: Log workflow start
      await auditOrchestration(this.prisma, userId, 'start', {
        executionRef, // Reference for logging (not database FK)
        executionId: execution.id,
        namedWorkflowId,
        workflowName: workflowName || null,
        povId,
        stepCount: validatedParams.steps.length,
        executionMode: validatedParams.executionMode,
        services: [...new Set(validatedParams.steps.map(s => s.service))]
      });

      // Create service caller with workflow povId if provided
      // BUGFIX: Pass povId from workflow args to service caller for TEAM_MEMBER trust level
      const enrichedContext = povId ? { ...context, povId } : context;
      // Set global deadline for retry pre-checks
      enrichedContext._globalDeadline = Date.now() + (validatedParams.timeout || 60000);
      const callService = this.createServiceCaller(enrichedContext);

      // Execute with timeout using shared engine (raceWithTimeout cleans up timer properly)
      const result = await raceWithTimeout(
        this.engine.execute(
          validatedParams,
          callService,
          context,
          {
            onStepComplete: async (result, index) => {
              // Transaction prevents parallel steps from overwriting each other (race condition fix)
              // 2026-05-23 A5 sweep: step results echo back user-controlled
              // step.service / step.tool fields — sanitize before persistence
              // (BC71 write-time, same class as input sanitize at L1014).
              const sanitizedResult = sanitizeMetadataForAudit(result);
              await this.prisma.$transaction(async (tx) => {
                const currentExecution = await tx.mCPWorkflowExecution.findUnique({
                  where: { id: execution.id },
                  select: { steps: true, metadata: true }
                });
                const currentSteps = Array.isArray(currentExecution?.steps) ? currentExecution.steps : [];
                currentSteps.push(sanitizedResult);
                const existingMetadata = ensureObject(currentExecution?.metadata, {});
                await tx.mCPWorkflowExecution.update({
                  where: { id: execution.id },
                  data: {
                    steps: currentSteps,
                    metadata: { ...existingMetadata, lastCompletedStep: index }
                  }
                });
              });
            }
          }
        ),
        validatedParams.timeout,
        'Workflow execution'
      );
      const executionTime = Date.now() - startTime;

      // Update execution with final results
      // A5 sweep: same write-time sanitize on final results.
      const finalStatus = result.success ? 'COMPLETED' : 'FAILED';
      const sanitizedResults = sanitizeMetadataForAudit(result.results);
      await this.prisma.mCPWorkflowExecution.update({
        where: { id: execution.id },
        data: {
          status: finalStatus,
          endTime: new Date(),
          duration: executionTime,
          output: sanitizedResults,  // Full step results with data payloads
          steps: sanitizedResults,   // Step summary (for backward compatibility)
          error: result.error ? sanitizeForResponse(result.error) : null,
          failedStep: result.failedStep != null ? String(result.failedStep) : null
        }
      });

      // Build summary
      const successCount = result.results.filter(r => r.success).length;
      const summary = {
        totalSteps: validatedParams.steps.length,
        completed: successCount,
        failed: result.results.filter(r => !r.success).length,
        mode: validatedParams.executionMode,
        services: [...new Set(validatedParams.steps.map(s => s.service))],
        branch: result.branch // For conditional workflows
      };

      // Add warnings if any
      if (validation.warnings.length > 0) {
        summary.warnings = validation.warnings;
      }

      // Audit: Log workflow completion (includes error type and retry summary)
      const totalRetries = result.results.reduce((sum, r) => sum + ((r.attempts || 1) - 1), 0);
      const errorTypes = result.results
        .filter(r => !r.success && r.errorType)
        .map(r => r.errorType);
      await auditOrchestration(this.prisma, userId, result.success ? 'complete' : 'failed', {
        executionRef,
        executionId: execution.id,
        povId,
        successCount,
        failureCount: result.results.length - successCount,
        totalExecutionTime: executionTime,
        ...(totalRetries > 0 && { totalRetries }),
        ...(errorTypes.length > 0 && { errorTypes }),
        // BUG-HUB-001 fix (2026-05-22): surface aggregated error in audit metadata.
        // Audit log captures `errorTypes` array (classification) but previously omitted
        // the actual error message — operators querying the Activity table for
        // 'orchestration.failed' had no diagnostic context. See Plan v2 Fix 5.
        ...(result.error && { error: result.error })
      });

      return {
        success: result.success,
        executionRef,
        executionId: execution.id,
        status: finalStatus,
        summary,
        stepResults: result.results,
        executionTime,
        error: result.error || undefined,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: result.success
          ? [
              `Check status: services(action: 'workflow.status', executionId: "${execution.id}")`,
              'View step results in stepResults above'
            ]
          : [
              'Review error above',
              'Adjust steps and retry',
              `Cancel if needed: services(action: 'workflow.cancel', executionId: "${execution.id}")`
            ]
      };
    } catch (error) {
      // BUG-BASIC-XSS-1 Phase 2.4 GAP-5 fix (BUG-HUB-001 sibling): error.message
      // may wrap user-supplied content from upstream throw sites (e.g., line
      // 809 echoes workflowName which IS user input). Without sanitize at write,
      // a malicious workflowName persists in MCPWorkflowExecution.error and
      // replays on EVERY subsequent workflow.list / workflow.status read —
      // persistent stored-XSS vector. Sanitize once at write so historical
      // pollution is prevented at the data layer.
      const safeErrMsg = sanitizeForResponse(error.message);
      // raceWithTimeout throws `TIMEOUT: <label> exceeded <N>ms limit` (resilient-call.js:31).
      // The prior check for the literal 'Workflow timeout' never matched, so timed-out runs were
      // recorded status=FAILED with isTimeout=false (the TIMEOUT status was unreachable). Match the
      // actual throw prefix instead.
      const isTimeout = typeof error?.message === 'string' && error.message.startsWith('TIMEOUT:');

      // Update execution as failed if it was created
      if (execution) {
        await this.prisma.mCPWorkflowExecution.update({
          where: { id: execution.id },
          data: {
            status: isTimeout ? 'TIMEOUT' : 'FAILED',
            endTime: new Date(),
            duration: Date.now() - startTime,
            error: safeErrMsg
          }
        }).catch(updateErr => log.warn({ err: updateErr, executionId: execution.id }, 'Failed to update workflow execution status'));

        // Audit: Log workflow failure (also receives sanitized error)
        await auditOrchestration(this.prisma, userId, 'failed', {
          executionRef,
          executionId: execution.id,
          povId,
          error: safeErrMsg,
          isTimeout
        });
      }

      return {
        success: false,
        error: safeErrMsg,
        executionId: execution?.id,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Check workflow configuration', 'Verify service availability']
      };
    }
  }

  /**
   * services(workflow.status) - Check workflow execution status
   */
  async handleGetWorkflowStatus(args, context) {
    const { executionId } = args;
    const { userId, role: userRole } = extractAuthContext(context, 'Workflow status check');

    if (!executionId) {
      return {
        success: false,
        error: 'executionId is required',
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Provide executionId from services(action: "workflow.execute") result']
      };
    }

    // CUID format validation (validation-engine review Fix 12)
    if (!CUID_PATTERN.test(executionId)) {
      return {
        success: false,
        error: 'Invalid executionId format (must be CUID)',
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['executionId should be a CUID like "clxxxx..." from services(action: "workflow.execute") result']
      };
    }

    try {
      const execution = await this.prisma.mCPWorkflowExecution.findUnique({
        where: { id: executionId }
      });

      if (!execution) {
        return {
          success: false,
          error: `Workflow execution not found: ${sanitizeForResponse(executionId)}`,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: [
            'Verify executionId is correct',
            `List executions: services(action: 'workflow.list')`
          ]
        };
      }

      // Check access (owner or admin)
      // 2026-05-23 L2 fix: SUPER_ADMIN was wrongly locked out where ADMIN
      // is allowed. Re-audit confirmed 1 SUPER_ADMIN user in prod, so this
      // was a real bug. SUPER_ADMIN is higher-privilege than ADMIN in the
      // UserRole hierarchy; should never be denied where ADMIN succeeds.
      if (execution.userId !== userId && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        return {
          success: false,
          error: 'Access denied to this workflow execution',
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: ['You can only view your own workflow executions']
        };
      }

      const steps = Array.isArray(execution.steps) ? execution.steps : [];
      const completedSteps = steps.filter(s => s.success === true).length;

      return {
        success: true,
        executionId: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        progress: `${completedSteps}/${steps.length} steps`,
        startTime: execution.startTime,
        endTime: execution.endTime,
        duration: execution.duration,
        error: execution.error,
        failedStep: execution.failedStep,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: execution.status === 'RUNNING'
          ? [`Cancel if needed: services(action: 'workflow.cancel', executionId: "${executionId}")`]
          : execution.status === 'COMPLETED'
            ? ['Workflow completed successfully']
            : ['Review error and retry workflow']
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Verify executionId format']
      };
    }
  }

  /**
   * services(workflow.cancel) - Cancel a running workflow
   */
  async handleCancelWorkflow(args, context) {
    const { executionId, reason } = args;
    const { userId, role: userRole } = extractAuthContext(context, 'Workflow cancellation');

    if (!executionId) {
      return {
        success: false,
        error: 'executionId is required',
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Provide executionId of workflow to cancel']
      };
    }

    // CUID format validation (validation-engine review Fix 12)
    if (!CUID_PATTERN.test(executionId)) {
      return {
        success: false,
        error: 'Invalid executionId format (must be CUID)',
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['executionId should be a CUID like "clxxxx..." from services(action: "workflow.execute") result']
      };
    }

    try {
      const execution = await this.prisma.mCPWorkflowExecution.findUnique({
        where: { id: executionId }
      });

      if (!execution) {
        return {
          success: false,
          error: `Workflow execution not found: ${sanitizeForResponse(executionId)}`,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: ['Verify executionId is correct']
        };
      }

      // 2026-05-23 L2 fix: SUPER_ADMIN was wrongly locked out where ADMIN
      // is allowed. Re-audit confirmed 1 SUPER_ADMIN user in prod, so this
      // was a real bug. SUPER_ADMIN is higher-privilege than ADMIN in the
      // UserRole hierarchy; should never be denied where ADMIN succeeds.
      if (execution.userId !== userId && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
        return {
          success: false,
          error: 'Access denied',
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: ['You can only cancel your own workflow executions']
        };
      }

      if (execution.status !== 'RUNNING') {
        return {
          success: false,
          error: `Cannot cancel workflow in ${sanitizeForResponse(execution.status)} status`,
          _meta: { tool: 'services', timestamp: new Date().toISOString() },
          nextSteps: ['Only RUNNING workflows can be cancelled']
        };
      }

      await this.prisma.mCPWorkflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'CANCELLED',
          endTime: new Date(),
          error: reason || 'Cancelled by user'
        }
      });

      return {
        success: true,
        executionId,
        status: 'CANCELLED',
        message: `Workflow cancelled${reason ? `: ${sanitizeForResponse(reason)}` : ''}`,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Workflow has been cancelled', 'Start a new workflow if needed']
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Check executionId and try again']
      };
    }
  }

  /**
   * services(workflow.list) - List workflow execution history
   */
  async handleListWorkflowExecutions(args, context) {
    // W1 closure (2026-05-16) — handler-boundary safeParse.
    // After Phase 1 + W2: povId is CUID-validated upstream (services-dispatcher
    // GS12), status is enum-validated upstream (consolidated services schema).
    // This handler boundary closes the remaining gap (workflowType DoS bound
    // via max(100)) and provides defense-in-depth on top of upstream layers.
    const parsed = WorkflowListHandlerInputSchema.safeParse(args);
    if (!parsed.success) {
      const errors = parsed.error.errors
        .map(e => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
        .join('; ');
      return {
        success: false,
        error: `Invalid workflow.list parameters: ${sanitizeForResponse(errors)}`,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Fix validation errors above', 'Check that povId is a valid CUID and status is a known enum value'],
      };
    }

    const { povId, status, workflowType, limit, offset } = parsed.data;
    const { userId, role: userRole } = extractAuthContext(context, 'List workflow executions');

    const where = {};

    // Non-admins only see their own executions
    // 2026-05-23 L2 fix: SUPER_ADMIN must see all executions (same as ADMIN);
    // see sibling-site comment above for context.
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      where.userId = userId;
    }

    if (povId) where.povId = povId;
    if (status) where.status = status;
    if (workflowType) where.workflowType = workflowType;

    try {
      const [executions, total] = await Promise.all([
        this.prisma.mCPWorkflowExecution.findMany({
          where,
          orderBy: { startTime: 'desc' },
          // Schema-enforced cap (.max(100)) is the authoritative gate; this
          // inline Math.min is defense-in-depth. If schema cap is ever raised,
          // this floor silently re-imposes 100 — flag for review. Per
          // workflow-orchestration W1 F2 review.
          take: Math.min(limit, 100),
          skip: offset,
          select: {
            id: true,
            workflowId: true,
            workflowType: true,
            status: true,
            startTime: true,
            endTime: true,
            duration: true,
            error: true,
            // BUG-HUB-001 fix (2026-05-22): include failedStep in workflow.list
            // response. Was missing — operators saw error message but not which
            // step. Closes the same gap on the read path that error/failedStep
            // closes on the write path. See Plan v2 Fix 6.
            failedStep: true,
            povId: true
          }
        }),
        this.prisma.mCPWorkflowExecution.count({ where })
      ]);

      return {
        success: true,
        executions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + executions.length < total
        },
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: executions.length > 0
          ? [`Check status: services(action: 'workflow.status', executionId: "${executions[0].id}")`]
          : ['No workflow executions found', `Start a workflow: services(action: 'workflow.execute', ...)`]
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        _meta: { tool: 'services', timestamp: new Date().toISOString() },
        nextSteps: ['Check filter parameters']
      };
    }
  }

  /**
   * Recover stale workflow executions on server startup
   *
   * Marks RUNNING executions older than maxAgeMs as FAILED.
   * Uses updateMany for atomic single-SQL execution.
   * Duration left null (actual duration unknown for recovered executions).
   *
   * @param {number} [maxAgeMs=900000] - Max age in ms (default 15 min, provides 5-min safety margin over 10-min global timeout)
   * @returns {Promise<number>} Number of recovered executions
   */
  async recoverStaleExecutions(maxAgeMs = 900000) {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const result = await this.prisma.mCPWorkflowExecution.updateMany({
      where: {
        status: 'RUNNING',
        startTime: { lt: cutoff }
      },
      data: {
        status: 'FAILED',
        endTime: new Date(),
        error: 'Server restarted during execution'
      }
    });

    if (result.count > 0) {
      log.warn({
        recovered: result.count,
        cutoffTime: cutoff.toISOString(),
        maxAgeMs
      }, 'Recovered stale workflow executions');
    }

    return result.count;
  }
}

module.exports = { WorkflowToolsHandler, WorkflowHandlerInputSchema, WorkflowListHandlerInputSchema };
