/**
 * Service Call Handler
 *
 * Handles cross-service MCP tool calls with comprehensive security validation.
 * Implements Phase 2 Priority 1 features: Real MCP client calling with
 * SDK Client, transport selection, and connection lifecycle management.
 *
 * @class ServiceCallHandler
 * @description Provides secure cross-service communication including:
 *   - Authentication enforcement (required for all calls)
 *   - Unified Zod validation to prevent proxy attacks
 *   - Anthropic compliance policy checks
 *   - Service access authorization
 *   - Real MCP SDK Client instantiation and calling
 *   - Transport selection (SSE/HTTP only - WebSocket removed Jan 2026)
 *   - Connection lifecycle: connect → callTool → close
 *   - Audit logging of all calls (successful and failed)
 *   - Service interaction tracking
 *
 * @version 1.0.0
 * @author pAIchart MCP Hub Team
 */

const { SDKParameterNormalizer } = require('../../utils/parameter-normalizer');
const { shadowObserveDualRepresentation } = require('./dual-representation');
const { ServiceConnectionPool } = require('../../utils/service-connection-pool');
const { InternalServiceRouter } = require('../internal/InternalServiceRouter');
const { ensureObject } = require('../../../../utils/ensure-object');
const { resilientServiceCall } = require('../../utils/resilient-call');
// F-NEW-5: the gateway's hard cap and the agent loop's ceiling MUST read one constant or they
// drift — which is precisely what lib/validation/runtime-limits.ts exists to prevent.
// (.js -> .ts require is established here: ensure-object, rate-limiter, prisma all do it.)
const { RUNTIME_LIMITS } = require('../../../../validation/runtime-limits');
const { extractAuthContext, sanitizeEndpointUrl } = require('./hub-shared-middleware');
const { isSSRFExemptService } = require('../../config/service-call-policy');
const { stderr, createAdapter } = require('../../mcp-logger');
// BUG-BASIC-XSS-1 Phase 2.6 (GAP-2): 6 inline throw new Error sites echo
// targetService + service.name + urlCheck.reason etc.
const { sanitizeForResponse, sanitizeMetadataForAudit } = require('../response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-service-call' }));

class ServiceCallHandler {
  /**
   * Creates Service Call Handler
   *
   * @param {Object} prisma - Prisma client instance
   * @param {HubUtilities} utilities - Shared utilities for permission/access checks
   * @param {SDKParameterNormalizer} [parameterNormalizer] - Parameter normalizer instance
   */
  constructor(prisma, utilities, parameterNormalizer = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parameterNormalizer = parameterNormalizer || new SDKParameterNormalizer();

    // Phase B.2: Initialize connection pool for service call optimization
    this.connectionPool = ServiceConnectionPool.getInstance({
      maxIdleTime: 5 * 60 * 1000,  // 5 minutes
      maxConnections: 20
    });
    this.connectionPool.startCleanupTimer();

    // v4.2: Initialize internal service router for paichart-* services
    this.internalRouter = new InternalServiceRouter(this.parameterNormalizer);
  }

  /**
   * Call another service through the hub
   *
   * @param {Object} args - Service call arguments
   * @param {string} args.targetService - Target service ID or name
   * @param {string} args.tool - Tool name to execute on target service
   * @param {Object} [args.arguments={}] - Tool arguments to pass
   * @param {Object} context - User authentication context (required)
   * @param {Object} context.user - Authenticated user object
   * @param {string} context.user.id - User ID
   * @param {string} context.user.email - User email
   *
   * @returns {Promise<Object>} Service call result
   * @returns {boolean} returns.success - Whether call succeeded
   * @returns {string} returns.targetService - Target service name
   * @returns {string} returns.tool - Tool that was executed
   * @returns {Object} returns.result - Tool execution result
   * @returns {Object} returns.metadata - Execution metadata (time, source user, etc.)
   *
   * @description Executes cross-service calls with comprehensive security validation:
   *   - Authentication enforcement (required)
   *   - Unified Zod validation to prevent proxy attacks
   *   - Anthropic compliance policy checks
   *   - Service access authorization
   *   - Real MCP SDK Client connection and tool calling
   *   - Audit logging of all calls
   *
   * @example
   * const result = await handler.handle({
   *   targetService: 'weather-api',
   *   tool: 'get_forecast',
   *   arguments: { location: 'San Francisco', days: 7 }
   * }, { user: { id: 'user123', email: 'admin@company.com' } });
   *
   * @throws {Error} If not authenticated, validation fails, policy blocks, or access denied
   */
  async handle(args, context) {
    try {
      // STEP 1: Enforce authentication (CRITICAL SECURITY)
      const { userId, userEmail } = extractAuthContext(context, 'Service call');

      // Defensive copy — NOT incidental. `ensureObject` below writes to
      // `validatedArgs.arguments`, and this copy is what keeps that from mutating
      // the caller's payload (see the L103 note further down).
      //
      // (2026-07-28) The targetService inference that used to sit here is deleted.
      // It read parameterNormalizer.getServiceContext(), whose writer had been a
      // no-op since 2026-05-23, so the guard could never fire and the inference
      // never once ran. See the SERVICE-CONTEXT deletion tombstone in
      // lib/mcp/server/utils/parameter-normalizer.js — restoring the writer is
      // what reintroduces the cross-tenant leak it was gutted for.
      const enhancedArgs = { ...args };

      // Phase 3 C1 commit 2: L2 validator removed. Constraints (25KB cap +
      // cross-trust injection regex) migrated to L1 dispatch-boundary schema
      // at tool-schemas.js services.arguments. enhancedArgs is the L1-
      // validated payload with `targetService` enrichment applied above.
      const validatedArgs = enhancedArgs;

      // Transport-boundary normalization (SINGLE POINT, 2026-06-06).
      // An LLM-as-caller (agent pipeline) routinely emits the nested
      // `arguments` object as a JSON *string*, which the L1 union
      // (tool-schemas.js services.arguments) forwards verbatim via its
      // z.string() branch. Every downstream consumer below then indexes it:
      // validateToolArguments → Object.keys(string) → ['0','1',...], which
      // fast-fails the call with a misleading "you provided 0,1,2..." error
      // BEFORE the per-call ensureObject guard (former L414) ever ran. Real
      // MCP clients (Claude Desktop) send an object, so this only bit the
      // agent path. Normalize ONCE here so the internal-router routeCall,
      // policy check, validateToolArguments, audit metadata, and the external
      // callTool all see a guaranteed plain object. enhancedArgs is a shallow
      // copy of args (L103), so this does not mutate the caller's payload.
      // Replaces the fragile per-consumer ensureObject invariant
      // (tool-schemas.js:764-768) for this handler. Transport-boundary-coercion
      // bug class — see [[feedback_mcp_parameter_three_layers]].
      validatedArgs.arguments = ensureObject(validatedArgs.arguments, {}, 'Service Call');

      // STEP 2.5a: Resolve target service BEFORE compliance check
      // Single DB query — reused for internal routing, compliance, and execution
      const targetServiceForInternalCheck = await this.prisma.mCPTool.findFirst({
        where: {
          OR: [
            { id: validatedArgs.targetService },
            { name: validatedArgs.targetService }
          ]
        }
      });

      // Early exit: service must exist before any policy checks
      if (!targetServiceForInternalCheck) {
        throw new Error(`Target service '${sanitizeForResponse(validatedArgs.targetService)}' not found`);
      }

      if (targetServiceForInternalCheck.status !== 'ACTIVE') {
        throw new Error(`Target service '${sanitizeForResponse(validatedArgs.targetService)}' is not active (status: ${sanitizeForResponse(targetServiceForInternalCheck.status)})`);
      }

      // Internal services (paichart-*) skip external compliance policy
      if (this.internalRouter.isInternalService(targetServiceForInternalCheck)) {
        // Internal service - route directly without external compliance check
        // 2026-05-23 R2 (Round 2 Hub probe): the Hub's checkServiceAccess
        // check at L236+ runs only on the external-service branch. Internal
        // services rely on downstream per-tool auth (KPI uses REST /api/pov/
        // [id]/kpi → requirePermission + validatePOVAccess; project goes
        // through /api/pov + /api/tasks etc.). To preserve observability
        // when those downstream checks reject, emit an audit Activity
        // event for every internal-service call. Cross-POV enumeration
        // attempts that fail downstream still leave a Hub-level trail.
        log.info({ serviceName: targetServiceForInternalCheck.name }, 'Internal service detected, skipping external compliance');

        try {
          // 2026-05-23 R3-3 (Round 3 Hub probe — write-time sanitize):
          // BC71 write-time pattern. tool field is user-controlled (no
          // regex in services tool schema) — pass through sanitizeForResponse
          // before storing in Activity.metadata to prevent stored-XSS via
          // audit reads. Same defense as BUG-HUB-001 / Phase 2.4 GAP-5
          // (recommendations route's escapeHtml-on-write for pov.title +
          // kpi.name). targetService + serviceId sanitized too as
          // defense-in-depth — service.name is bound by registration regex
          // ^[a-z0-9\-]+$ but internal services bypass that gate.
          await this.prisma.activity.create({
            data: {
              userId,
              action: 'INTERNAL_SERVICE_ACCESS',
              type: 'Security',
              metadata: {
                targetService: sanitizeForResponse(targetServiceForInternalCheck.name),
                serviceId: sanitizeForResponse(targetServiceForInternalCheck.id),
                tool: sanitizeForResponse(validatedArgs.tool),
                bypassedHubAccessCheck: true,
                // F-SWEEP-1 (2026-07-17): was `downstreamAuthRequired: true` — an assertion
                // about the TARGET service hardcoded at the emission site and verified nowhere
                // (any future internal:// registration would inherit the claim regardless of
                // its actual auth behavior; a false fact in a security audit record misleads
                // the investigation that reads it). Reframed to the code-path fact this branch
                // can actually attest (Protocol 10): the Hub-level access check was skipped
                // and authorization is DELEGATED to the downstream handlers — it says nothing
                // about whether downstream enforces. Records before 2026-07-17 carry the old key.
                authDelegatedToDownstream: true,
                timestamp: new Date().toISOString()
              }
            }
          });
        } catch (auditError) {
          // Audit log is best-effort — don't break the call if Activity table is unavailable
          log.warn({ err: auditError, serviceName: targetServiceForInternalCheck.name }, 'Failed to log internal-service access audit event');
        }

        // Use the DB record ID directly — it matches InternalServiceRouter.serviceToolMap keys
        const internalServiceName = targetServiceForInternalCheck.id;

        let result;
        try {
          result = await this.internalRouter.routeCall(
            internalServiceName,
            validatedArgs.tool,
            validatedArgs.arguments || {},
            context
          );
        } catch (internalError) {
          // Bug Class 30: Return MCP content instead of throwing — Claude mobile hides JSON-RPC errors
          log.warn({ err: internalError, serviceName: targetServiceForInternalCheck.name, tool: validatedArgs.tool }, 'Internal service call failed');
          return {
            content: [{ type: 'text', text: `❌ Internal service call failed: ${internalError.message}` }],
            isError: true,
            _meta: {
              tool: 'services',
              timestamp: new Date().toISOString(),
              internal: true,
              errorType: 'INTERNAL_SERVICE_ERROR',
              targetService: targetServiceForInternalCheck.name,
              requestedTool: validatedArgs.tool
            }
          };
        }

        // Track interaction
        await this.utilities.trackServiceInteraction(
          targetServiceForInternalCheck.id,
          validatedArgs.tool,
          result,
          context
        );

        return {
          success: true,
          targetService: targetServiceForInternalCheck.name,
          tool: validatedArgs.tool,
          arguments: validatedArgs.arguments,
          result: result.result,
          _meta: {
            tool: 'services',
            timestamp: new Date().toISOString(),
            internal: true
          },
          metadata: result.metadata,
          nextSteps: [
            '✅ Internal service call completed',
            `Make another call: services(action: "call", targetService: '${targetServiceForInternalCheck.name}', tool: '...', arguments: {...})`
          ]
        };
      }

      // STEP 2.5b: Apply Anthropic compliance service call policy for EXTERNAL services
      // Extract registered tools from capabilities already fetched in STEP 2.5a (no redundant query)
      const registeredTools = targetServiceForInternalCheck.capabilities?.tools?.map(t =>
        typeof t === 'string' ? t : t.name
      ) || [];

      const { validateServiceCall } = require('../../config/service-call-policy');
      const policyCheck = validateServiceCall(
        validatedArgs.targetService,
        validatedArgs.tool,
        validatedArgs.arguments,
        context,
        registeredTools  // Pass registered tools for dynamic whitelisting
      );

      if (!policyCheck.allowed) {
        log.warn({ securityEvent: true, violations: policyCheck.violations, targetService: validatedArgs.targetService, tool: validatedArgs.tool, userId }, 'Service call blocked by compliance policy');

        // Log compliance violation (uses singleton with auto-scheduled cleanup)
        const { ComplianceMonitor } = require('../../security/compliance-monitor');
        const monitor = ComplianceMonitor.getInstance();
        await monitor.logSecurityEvent('SERVICE_CALL_BLOCKED', {
          targetService: validatedArgs.targetService,
          tool: validatedArgs.tool,
          violations: policyCheck.violations,
          riskLevel: 'HIGH'
        }, { userId, ipAddress: context?.ip });

        // Fix: Extract message from violation objects
        const violationMessages = policyCheck.violations.map(v => v.message || v.type).join('; ');
        throw new Error(`Service call blocked by compliance policy: ${sanitizeForResponse(violationMessages)}`);
      }

      // STEP 3: Reuse service resolved in STEP 2.5a (eliminates redundant DB query)
      const targetService = targetServiceForInternalCheck;

      // STEP 4: NEW - Check service access authorization
      const canAccess = await this.utilities.checkServiceAccess(userId, targetService);
      if (!canAccess) {
        // Log security violation
        log.warn({ securityEvent: true, userId, userEmail, targetService: targetService.name, ip: context?.ip || 'unknown' }, 'Unauthorized service access attempt');

        // Audit log the violation (using Activity table)
        // 2026-05-23 R3-3: write-time sanitize. Same BC71 pattern as the
        // INTERNAL_SERVICE_ACCESS site above — tool field is user-controlled
        // (no regex in services schema), so escape before persisting to
        // prevent stored-XSS in Activity reads.
        try {
          await this.prisma.activity.create({
            data: {
              userId,
              action: 'UNAUTHORIZED_SERVICE_ACCESS',
              type: 'Security',
              metadata: {
                targetService: sanitizeForResponse(targetService.name),
                tool: sanitizeForResponse(validatedArgs.tool),
                denied: true,
                timestamp: new Date().toISOString()
              }
            }
          });
        } catch (auditError) {
          log.warn({ err: auditError }, 'Failed to log security violation');
        }

        throw new Error('🚫 Access Denied: You don\'t have permission to access this MCP service. Services can be accessed by their owners, admins, or if they have public access enabled. Contact the service owner for access.');
      }

      // STEP 4.5: P2 - Rate limiting enforcement (Jan 2026)
      // Pattern: Rate limiting with LRU cache (time-bomb-detection-pattern.md Category 1 & 5)
      const serviceRateLimit = targetService.configuration?.rateLimit;
      if (serviceRateLimit) {
        const { rateLimitCache } = require('./hub-utilities');
        const { requests = 100, windowMs = 60000 } = serviceRateLimit;

        const rateLimitResult = rateLimitCache.checkRateLimit(
          userId,
          targetService.id,
          requests,
          windowMs
        );

        if (!rateLimitResult.allowed) {
          const retryAfterMs = rateLimitResult.resetAt - Date.now();
          const retryAfterSec = Math.ceil(retryAfterMs / 1000);

          // Log rate limit hit
          log.warn({ userId, targetService: targetService.name, remaining: rateLimitResult.remaining, resetAt: new Date(rateLimitResult.resetAt).toISOString() }, 'Service call rate limited');

          return {
            content: [{ type: 'text', text:
              `⏱️ Rate Limit Exceeded: You've exceeded the rate limit for service "${targetService.name}". ` +
              `Limit: ${requests} requests per ${windowMs / 1000}s. ` +
              `Retry in ${retryAfterSec}s or contact the service owner to increase limits.`
            }],
            isError: true,
            _meta: { tool: 'services', errorType: 'RATE_LIMITED', retryAfterSec, timestamp: new Date().toISOString() }
          };
        }

        log.debug({ targetService: targetService.name, remaining: rateLimitResult.remaining, limit: requests }, 'Rate limit check passed');
      }

      // STEP 5: NEW - Audit log the successful service call (using Activity table)
      try {
        // BUG-AUDIT-XSS-2 sweep (success-path SERVICE_CALL site, sibling
        // of the two earlier audit sites at L162 + L285 in this file).
        // validatedArgs.arguments is a nested object spread — walker handles
        // string fields recursively.
        await this.prisma.activity.create({
          data: {
            userId,
            action: 'SERVICE_CALL',
            type: 'Integration',
            metadata: sanitizeMetadataForAudit({
              targetService: targetService.name,
              tool: validatedArgs.tool,
              arguments: validatedArgs.arguments,
              timestamp: new Date().toISOString()
            })
          }
        });
      } catch (auditError) {
        log.warn({ err: auditError }, 'Failed to log service call');
      }

      // NOTE: Internal service routing now happens earlier (STEP 2.5a)
      // If we reach here, it's an external service

      // STEP 5.5: Validate tool arguments against schema (fast-fail for missing required params)
      // Return as MCP content (not throw) so Claude mobile/desktop displays the full error
      const argValidationError = this.validateToolArguments(targetService.capabilities, validatedArgs.tool, validatedArgs.arguments, targetService.name);
      if (argValidationError) {
        return argValidationError;
      }

      // PHASE 2 PRIORITY 1: Real MCP client connection to target service
      const startTime = Date.now();

      // 2026-05-29 (#3): honour the caller's timeout, clamped to the per-service hard cap.
      // Precedence: caller (if set) → service config → 30s default. Declared BEFORE the try
      // so the catch's error _meta can report effectiveTimeout/timeoutClamped (this was
      // previously a try-scoped const, invisible to the catch).
      const HARD_TIMEOUT_CAP = RUNTIME_LIMITS.TOOL_CALL_TIMEOUT_MS; // shared constant — see lib/validation/runtime-limits.ts (F-NEW-5: the gateway cap and the loop ceiling MUST NOT drift)
      const requestedTimeout = validatedArgs.timeout; // undefined unless caller set it (schema default dropped)
      const configuredTimeout = targetService.configuration?.maxExecutionTime;
      const baselineTimeout = requestedTimeout ?? configuredTimeout ?? 30000;
      const maxExecutionTime = Math.min(baselineTimeout, HARD_TIMEOUT_CAP);
      const timeoutClamped = baselineTimeout > HARD_TIMEOUT_CAP;

      try {
        const endpoint = targetService.configuration?.endpoint;

        if (!endpoint) {
          throw new Error(`Service ${sanitizeForResponse(targetService.name)} has no endpoint configured`);
        }

        // Validate transport - only HTTP/HTTPS (SSE) supported (WebSocket removed Jan 2026)
        if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
          throw new Error(`Unsupported endpoint protocol for service "${sanitizeForResponse(targetService.name)}". Only HTTP/HTTPS (SSE) is supported.`);
        }

        // BC51 FIX: SSRF prevention — block calls to private/internal addresses
        // SSRF-exempt services (first-party Docker containers) bypass endpoint checks
        // Trust level (JWT forwarding) is separate — see service-approval-policy.js
        if (!isSSRFExemptService(targetService)) {
          const { validateUrlSafety } = require('../../../../utils/url-safety');
          const urlCheck = validateUrlSafety(endpoint);
          if (!urlCheck.safe) {
            throw new Error(`Service call blocked: endpoint resolves to internal address (${sanitizeForResponse(urlCheck.reason)})`);
          }
        }

        // Phase B.2: Get pooled connection with resilient retry
        log.info({ serviceName: targetService.name }, 'Getting pooled connection');

        // validatedArgs.arguments was already normalized to a plain object at
        // the single transport-boundary point above; this is now an idempotent
        // belt-and-suspenders guard kept explicit at the callTool dispatch site.
        const callArguments = ensureObject(validatedArgs.arguments, {}, 'Service Call');

        // Call with stale connection detection and retry (resilient-call utility)
        const response = await resilientServiceCall(
          this.connectionPool,
          targetService.id,
          endpoint,
          // F-NEW-5 (2026-07-17): the SDK's RequestOptions is the THIRD arg
          // (callTool(params, resultSchema = CallToolResultSchema, options)) — passing options
          // 2nd would be parsed as a resultSchema. `undefined` keeps the schema default.
          //
          // WHY: without an inner timeout the SDK applies DEFAULT_REQUEST_TIMEOUT_MSEC = 60000
          // (sdk/shared/protocol.js), so the binding ceiling was min(maxExecutionTime, 60s) and the
          // `effectiveTimeout` we advertise in _meta below was a FALSE fact for anything > 60s — a
          // 300s-configured service still died at 60s. Live: a Browser Automation scrape burned
          // 60,196ms (= 60,000 + overhead) inside a pipeline harvest and killed the leg.
          //
          // STRICTLY WIDENING: services with no configured maxExecutionTime already bind at 30s via
          // the outer race (baselineTimeout ?? 30000), so forwarding this inward only RAISES ceilings
          // for services configured > 60s. Nothing that succeeds today starts failing.
          //
          // BONUS: an SDK-level timeout sends notifications/cancelled, so the remote actually STOPS
          // working. The outer race below only abandons the promise — it never cancels. Keep it as
          // belt-and-suspenders (it also covers connect/pool stalls the SDK timer never arms for).
          (pooledClient) => pooledClient.callTool({
            name: validatedArgs.tool,
            arguments: callArguments
          }, undefined, { timeout: maxExecutionTime }),
          { timeout: maxExecutionTime, label: `services.call:${targetService.name}` }
        );

        const executionTime = Date.now() - startTime;
        log.info({ executionTime, poolReuseRate: this.connectionPool.getPoolStats().reuseRate }, 'Tool executed');

        // Don't close! Pool manages connection lifecycle

        // WS2 PHASE 1 — SHADOW MODE (2026-08-28). Observes the MCP dual representation and emits a
        // content-free census line. Drops NOTHING. Placed here deliberately: this is the seam where
        // the downstream response still exists as a parsed object, BEFORE result construction and
        // BEFORE trackServiceInteraction, and — critically — PRE-R10, so the twins are still
        // byte-comparable. Post-redaction they never are, which is what confounded the artifact
        // sample this census exists to replace.
        shadowObserveDualRepresentation(response, log, {
          service: targetService.name,
          tool: validatedArgs.tool,
        });

        // Format result
        // Dec 2025 UX Assessment Fix 3: Add _meta for consistency
        const result = {
          success: true,
          targetService: targetService.name,
          tool: validatedArgs.tool,
          arguments: validatedArgs.arguments,
          result: response,
          _meta: {
            tool: 'services',
            timestamp: new Date().toISOString(),
            sdkNative: true
          },
          metadata: {
            executionTime,
            maxExecutionTime, // kept for compat
            // #3: PER-CALL ceiling actually applied to this call (SDK-bound since e72f5b17).
            // QUALIFIER (M2, 2026-07-17): the execution watchdog envelope (180s + turns×30s)
            // dominates when smaller — only possible at maxToolTurns <= 3, which no template
            // has (INV-A ordering test pins the default case in test:sdk-request-options).
            effectiveTimeout: maxExecutionTime,
            requestedTimeout: requestedTimeout ?? null, // #3: caller-supplied value, or null
            timeoutClamped, // #3: true if the caller exceeded the 300s cap
            targetServiceId: targetService.id,
            sourceUser: userEmail,
            endpoint: sanitizeEndpointUrl(endpoint),
            timestamp: new Date().toISOString()
          }
        };

        // Track successful interaction
        await this.utilities.trackServiceInteraction(targetService.id, validatedArgs.tool, result, context);

        // P2: Add result-based nextSteps — ordered to match the integration-testing workflow:
        // inspect schemas → health check → call → REPORT. Health hint moved to "new service"
        // branch so it doesn't imply you should check health after every successful call.
        result.nextSteps = [
          "✅ Service call completed",
          "📝 Report results: perform(action: \"task.comment\", taskId: '...', comment: '| Tool | Status | Key Data | Notes |\\n|------|--------|----------|-------|')",
          `Make another call (same service): services(action: "call", targetService: '${targetService.name}', tool: '...', arguments: {...})`,
          `New service workflow: registry(action: "tools", service_name: '...') → services(action: "health", service_name: '...') → services(action: "call")`
        ];

        return result;

      } catch (callError) {
        // Phase B.2: Don't close pooled connections on error
        // Pool's idle timeout will handle cleanup if connection is bad
        // Log the error for monitoring
        log.error({ serviceName: targetService.name, err: callError }, 'Service call failed');

        const executionTime = Date.now() - startTime;

        // Track failed interaction
        const failureResult = {
          success: false,
          targetService: targetService.name,
          tool: validatedArgs.tool,
          error: callError.message,
          metadata: {
            executionTime,
            targetServiceId: targetService.id,
            sourceUser: userEmail,
            timestamp: new Date().toISOString()
          }
        };

        await this.utilities.trackServiceInteraction(targetService.id, validatedArgs.tool, failureResult, context);

        // 2026-05-28: timeout-aware recovery guidance. A timeout is the one case
        // where "check health" misleads — /health is an endpoint ping that reads
        // green while the tool's upstream path is wedged, and the right move is a
        // delayed retry, not a health check. (See the field-failure-loop case study.)
        const isTimeout = /timeout|etimedout|exceeded \d+ms/i.test(callError.message || '');

        // 2026-05-29 (#2): surface the recent-success-rate FACT (not a verdict) so the
        // client can judge whether a retry is worthwhile. Read from the PRE-call
        // targetService so it reflects the track record *before* this failure. Fact only —
        // we deliberately do NOT assert transient/persistent (an unvalidated verdict could
        // mislead a capable client the way the original incident did; see
        // hub-recovery-signals plan, 2026-05-29).
        // F-SWEEP-3 (2026-07-17, panel): the published text previously claimed this was an
        // EMA "over its recent calls — recent quality". FALSE for external services: the
        // 5-min background health probes outnumber real calls ~1000:1, so the number is
        // reachability-dominated — a service whose CALLS always fail behind a healthy
        // /health can read ~99.9%, steering a client into retrying a broken service. The
        // text now states the true basis. It also contaminated the 2026-05-29 recovery-
        // correlation dataset's premise (recentSuccessRate as a call-quality predictor) —
        // interpret that analysis accordingly. A call-only figure exists in
        // mcp_interactions (the dashboard derives one); wiring it here is the deferred
        // D-lite option in the F-SWEEP-3 decision record.
        const recentSuccessRate = targetService?.successRate ?? null;
        const rateLine = recentSuccessRate != null
          ? `\n  • Context: this service's recent availability is ~${Math.round(recentSuccessRate)}% (an EMA dominated by 5-minute health probes, plus direct calls) — it measures reachability, NOT whether calls like yours succeed.`
          : '';

        // 2026-05-29 (#2 instrumentation): emit the decision-relevant snapshot as a single
        // queryable event so the DEFERRED transient/persistent verdict can later be EARNED
        // from data — does a high pre-call successRate actually predict the next call to this
        // service recovers? Pairs with the recovery-correlation analysis tracked in
        // cline_docs/follow-ups/hub-recovery-signals-2026-05-28.md. Log-only; no behaviour change.
        log.info({
          event: 'service_call_failure',
          serviceId: targetService.id,
          tool: validatedArgs.tool,
          recentSuccessRate,            // pre-call EMA (0..100) or null — the predictor under test
          isTimeout,                    // timeouts are the case the verdict would most help
          executionTime,
          effectiveTimeout: maxExecutionTime
        }, 'Service call failure — recovery-signal snapshot');

        const nextStepsText = isTimeout
          ? `\n\n🔧 Next steps (timeout):\n  1. Transient timeouts usually clear on their own — wait ~5-10s and retry AT MOST ONCE before assuming the tool is broken.\n  2. Note: services(action: "health") is an endpoint ping and can read healthy while the tool's upstream is slow/wedged — a green health check does NOT mean this call will succeed.\n  3. If the single retry also times out, treat it as persistent — STOP retrying, report the failure, and flag the service logs / owner.${rateLine}`
          // Protocol 10 (2026-07-17, Steve's finding): step 3 was an UNCONDITIONAL "Retry the
          // call" — a retry-worthiness verdict handed to the one consumer guaranteed to obey it
          // (the loop deliberately has no tool-retry machinery; retry is delegated to the
          // reasoner), with no backoff and no bound: the instruction layer of a retry storm
          // against an already-failing service. Observed worst case is 2 attempts ever (so no
          // circuit breaker is earned — maxToolTurns + the per-service rateLimit bound the
          // blast radius mechanically), but the ROUTE must be bounded and conditional:
          // retry AT MOST ONCE, only after the checks, then stop and report.
          : `\n\n🔧 Next steps:\n  1. Check service health: services(action: "health", service_name: "${targetService.name}")\n  2. Verify arguments: registry(action: "tools", service_name: "${targetService.name}")\n  3. If health and arguments check out, retry AT MOST ONCE. If it fails again, STOP — report the failure in your output instead of retrying further (repeated calls into a failing service compound the problem and burn your turn budget).`;
        // Bug Class 30: Return MCP content instead of throwing — Claude mobile hides JSON-RPC errors
        return {
          content: [{ type: 'text', text: `❌ Service call to "${targetService.name}" failed: ${callError.message}${nextStepsText}` }],
          isError: true,
          _meta: {
            tool: 'services',
            timestamp: new Date().toISOString(),
            errorType: 'SERVICE_CALL_FAILED',
            executionTime,
            targetService: targetService.name,
            effectiveTimeout: maxExecutionTime, // #3: ceiling actually applied to this call
            timeoutClamped, // #3
            // #2: fact, not a verdict. F-SWEEP-3: basis published alongside so a machine
            // consumer can't mistake reachability for call quality.
            ...(recentSuccessRate != null ? {
              recentSuccessRate,
              recentSuccessRateBasis: 'availability-ema: 5-min health probes + direct calls (probe-dominated for external services); NOT a per-call success rate'
            } : {})
          }
        };
      }
    } catch (error) {
      // Security/infrastructure errors still throw — these are appropriate as JSON-RPC errors
      // (auth failures, compliance blocks, SSRF blocks — generic messages are fine)
      log.error({ err: error }, 'Service call failed');
      throw error;
    }
  }

  /**
   * Validate tool arguments against the service's registered schema.
   * Fast-fails with a descriptive error if required parameters are missing.
   * Skips validation gracefully for legacy services without inputSchema.
   */
  validateToolArguments(capabilities, toolName, args, serviceName) {
    const tools = capabilities?.tools;
    if (!Array.isArray(tools)) return;

    const toolDef = tools.find(t =>
      typeof t === 'string' ? false : t.name === toolName
    );

    if (!toolDef || typeof toolDef === 'string' || !toolDef.inputSchema?.required) return null;

    const required = toolDef.inputSchema.required;
    const provided = Object.keys(args || {});
    const missing = required.filter(r => !provided.includes(r));

    if (missing.length > 0) {
      // Build format hints from schema properties for each missing field
      const hints = missing.map(field => {
        const prop = toolDef.inputSchema.properties?.[field];
        if (!prop) return `  - ${field} (required)`;
        return `  - ${field}: ${this._describeSchemaField(prop)}`;
      }).join('\n');

      // Build provided fields hint so AI can see what was sent vs what's expected
      const allSchemaFields = Object.keys(toolDef.inputSchema.properties || {});
      const providedHints = provided.map(field => {
        if (required.includes(field)) return `  - ${field} ✅`;
        if (allSchemaFields.includes(field)) return `  - ${field} (optional, valid)`;
        return `  - ${field} ⚠️ (unrecognized — not in schema)`;
      }).join('\n');

      const errorMessage =
        `❌ Missing required parameters for tool "${toolName}" on service "${serviceName}": ${missing.join(', ')}\n\n` +
        `🔍 Expected parameters:\n${hints}\n\n` +
        `📤 You provided:\n${providedHints}\n\n` +
        `💡 Tip: Check if the service expects nested objects (e.g. "message": {subject, body}) ` +
        `rather than flat fields (e.g. "subject", "body" at top level).\n\n` +
        `🔧 Next steps:\n` +
        `  1. Use registry(action: 'tools', service_name: '${serviceName}') to see full schemas with examples\n` +
        `  2. Restructure your arguments to match the expected format above\n` +
        `  3. Retry: services(action: "call", targetService: "${serviceName}", tool: "${toolName}", arguments: {...})`;

      // Return as MCP content format (not throw) — thrown errors become JSON-RPC errors
      // which some clients (Claude mobile) display as generic "Error occurred during tool execution"
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
        _meta: {
          tool: 'services',
          timestamp: new Date().toISOString(),
          errorType: 'VALIDATION',
          targetService: serviceName,
          requestedTool: toolName
        }
      };
    }

    return null;
  }

  /**
   * Generate a human-readable description of a JSON Schema field for error hints.
   * Recurses one level into objects and arrays to show expected structure.
   *
   * @param {Object} prop - JSON Schema property definition
   * @returns {string} Human-readable description with example structure
   * @private
   */
  _describeSchemaField(prop) {
    if (!prop) return '(unknown)';

    if (prop.enum) {
      return `one of [${prop.enum.join(', ')}]`;
    }

    if (prop.type === 'array' && prop.items) {
      if (prop.items.type === 'object' && prop.items.properties) {
        const fields = Object.entries(prop.items.properties).map(([k, v]) => {
          const req = prop.items.required?.includes(k) ? ' (required)' : '';
          const type = v.type || (v.enum ? `one of [${v.enum.join(', ')}]` : 'any');
          return `${k}: ${type}${req}`;
        });
        return `array of objects, e.g. [{ ${fields.join(', ')} }]`;
      }
      return `array of ${prop.items.type || 'items'}`;
    }

    if (prop.type === 'object' && prop.properties) {
      const fields = Object.entries(prop.properties).map(([k, v]) => {
        const req = prop.required?.includes(k) ? ' (required)' : '';
        const type = v.type || (v.enum ? `one of [${v.enum.join(', ')}]` : 'any');
        return `${k}: ${type}${req}`;
      });
      return `object, e.g. { ${fields.join(', ')} }`;
    }

    return prop.type || 'any';
  }
}

module.exports = { ServiceCallHandler };
