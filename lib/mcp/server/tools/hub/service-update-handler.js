/**
 * Service Update Handler
 *
 * Handles MCP service update operations with ownership validation.
 *
 * Extracted from hub-tools-handler.js (Phase 4 Task 1 Days 3-5)
 * Part of systematic 2,041 → ~200 line reduction.
 *
 * SECURITY DEPENDENCY (Phase 1 + Phase 2 layered defense, 2026-05-16):
 * This handler is reached via `registry-dispatcher.js` which already runs
 * `CONSOLIDATED_SCHEMAS.registry.inputSchema.safeParse()` (Phase 1 GS14
 * dispatch-boundary). The handler-boundary `ServiceUpdateHandlerInputSchema`
 * below is the second-pass / action-specific tightening. If a new code path
 * is added that calls `handleUpdateService` directly (bypassing the
 * dispatcher), this schema is the only Zod gate — by design (defense in
 * depth). Per sec-ops F8 (Phase 2 chunk 2 review).
 */

const { z } = require('zod');
// BC27 — reuse the inlined stripDangerousKeys from tool-schemas.js (see Phase 2 N4
// for rationale: tool-schemas.js inlines the helper because it loads from both
// webpack AND bare-Node; importing from there reuses the same inline copy + sync
// marker rather than adding a third inline copy).
// Also import MCP_SERVICE_CATEGORIES to keep the handler-boundary schema in
// lockstep with the consolidated tool-schemas.js source of truth (mcp-hub
// Phase 2 chunk 2 review Finding A — drift prevention).
// deepStripDangerousKeys closes F1/Q4 depth-N residual: capabilities is a
// nested object structure persisted to DB JSON column; downstream consumers
// may spread nested fields, so shallow strip leaves depth-1+ pollution.
const {
  stripDangerousKeys,
  deepStripDangerousKeys,
  MCP_SERVICE_CATEGORIES,
  // 2026-07-27 (panel D2/D3): shared with L1 so a constraint cannot be
  // tightened at the dispatch boundary and silently missed here.
  serviceEndpointSchema,
  serviceDescriptionSchema,
  serviceCapabilitiesSchema
} = require('../../config/tool-schemas');
const { extractAuthContext, resolveService, validateOwnership, invalidateServiceCaches } = require('./hub-shared-middleware');
const { ensureObject } = require('../../../../utils/ensure-object');
const { BLOCKED_DOMAINS } = require('../../config/service-approval-policy');
const { assertEndpointSafe } = require('./hub-utilities');

// Dec 2025 UX Assessment: Import error helpers
const { enhancedOperationError, missingServiceIdentifierError, serviceNotFoundByIdError, validationError } = require('./error-helpers');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-update' }));

// CUID format pattern (matches workflow-tools-handler.js convention)
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

// ────────────────────────────────────────────────────────────────────────────
// Handler-boundary input validation
// (Phase 2 chunk 2 closure for N5 + #29 + #30 from synthesis, 2026-05-16)
//
// Closes:
//   - N5 (P0)  — manual `JSON.parse(args.updates.capabilities)` at the old :115
//                with no stripDangerousKeys → BC27+BC2 compound where
//                `'{"__proto__":{...}}'` lands as prototype pollution in
//                `mCPTool.capabilities` JSON column. Schema's capabilitiesSchema
//                handles JSON-string-or-object union AND strips dangerous keys.
//   - #29 (P1) — field-leakage strip without validation at the old :127
//                (destructure removed serviceId/ownerId/id without validating
//                the rest). Schema's `.strict()` on `updates` rejects all
//                unknown fields explicitly (including those three) with a
//                clear error rather than silent strip.
//   - #30 (P2) — defense-by-accident at the old :137-142 (hand-rolled
//                healthCheckPath path-traversal + protocol check). Schema
//                encodes the same checks via `.refine()` blocks. Inline check
//                deleted. (Endpoint runtime URL-safety check at the old
//                :146-156 IS NOT deleted — it does SSRF / BLOCKED_DOMAINS
//                runtime checks beyond Zod's static-validation reach.)
//
// Phase 1 dispatch-with-schema validates against `CONSOLIDATED_SCHEMAS.registry
// .inputSchema` (permissive on the `updates` field because the registry tool's
// 5 actions diverge significantly — same architectural reason workflow-tools
// -handler has its own boundary schema). This handler-boundary schema is the
// action-specific tightening for `registry.update`.
//
// Phase 3 C1 (2026-05-16) deleted `lib/validation/mcp-hub-validation.ts`. This
// handler-boundary schema is the SOLE source of truth for `registry.update`
// input shape — no parallel "canonical" schema exists. Constraints not
// dispatch-uniform across the 5 registry actions live here at L3; constraints
// uniform across actions (or specific to register/call) live at L1 in
// tool-schemas.js.
// ────────────────────────────────────────────────────────────────────────────
// 2026-07-27 (panel D2): the local `capabilitiesUpdateSchema` that lived here
// was deleted. It was `z.record(z.any())` with a string branch that did
// JSON.parse + deepStripDangerousKeys and NO shape validation — so it enforced
// none of the R3-B5 array caps that register enforced, and its string branch
// bypassed constraints on both layers. Replaced by the shared
// serviceCapabilitiesSchema imported above, which keeps the deep-strip
// behaviour (F1/Q4 depth-N closure) and adds the caps to both branches.

const ServiceUpdateHandlerInputSchema = z.object({
  serviceId: z.string().regex(CUID_PATTERN, 'serviceId must be a valid CUID').optional(),
  service_name: z.string().min(1).max(200).optional(),
  updates: z.object({
    // 2026-07-27 (panel D3): was `z.string().min(10).max(500)`. The 500 cap was
    // enforced here AND at L1, so ~10 of 15 live services could not round-trip
    // their own description through update. Shared schema with register now.
    description: serviceDescriptionSchema.optional(),
    // 2026-07-27 (panel D2): capabilitiesUpdateSchema was `z.record(z.any())`
    // with no caps and a string branch that bypassed everything. Shared schema.
    capabilities: serviceCapabilitiesSchema.optional(),
    authType: z.enum(['NONE', 'API_KEY', 'BEARER_TOKEN', 'OAUTH2', 'HMAC']).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., "1.0.0")').optional(),
    // ERROR intentionally omitted — it is a system-set status assigned when
    // health checks fail. Allowing user-initiated transition INTO ERROR
    // would be a state-machine violation. Matches `tool-schemas.js:691`
    // consolidated registry schema, which also excludes ERROR for the same
    // reason (mcp-hub Phase 2 chunk 2 review Q3 confirmed).
    status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional(),
    // endpoint format validated by Zod; SSRF / BLOCKED_DOMAINS runtime check
    // remains in the handler body (validateUrlSafety) — beyond Zod's static reach.
    //
    // 2026-07-27 (validation-engine, D3 residual): was a bare
    // `z.string().url()`, which ACCEPTS `internal://evil` — the exact gap
    // 9901a198 closed at L1. L1 runs first and is strictly tighter so there was
    // no reachable bypass, but the parity gate only inspects CONSOLIDATED_SCHEMAS
    // and would not have caught it if the layering ever changed. Shared now.
    endpoint: serviceEndpointSchema.optional(),
    // Single source of truth — imported from tool-schemas.js. If categories
    // change, both L1 and L3 pick up the new list automatically. Closes
    // Finding A from mcp-hub Phase 2 chunk 2 review (drift prevention).
    category: z.enum(MCP_SERVICE_CATEGORIES).optional(),
    // Second-pass blocklist on top of `tool-schemas.js:693` canonical
    // allowlist regex (`/^\/[a-zA-Z0-9\-._~/:@!$&'()*+,;=%]*$/`). Phase 1
    // runs first and is strictly tighter (allowlist > blocklist), so this
    // is defense-in-depth. URL-encoded path-traversal (`%2e%2e`) is NOT
    // caught by these literal refines — pre-existing gap; sec-ops Phase 2
    // chunk 2 F2; consider downstream healthcheck URL-composer audit.
    healthCheckPath: z.string()
      .max(200, 'healthCheckPath too long')
      .startsWith('/', 'healthCheckPath must start with "/"')
      .refine((p) => !p.includes('..'), { message: 'healthCheckPath cannot contain path traversal (..)' })
      .refine((p) => !p.includes('://'), { message: 'healthCheckPath cannot contain protocol (://)' })
      .optional(),
    rateLimit: z.object({
      requests: z.number().int().min(1).max(10000).optional(),
      windowMs: z.number().int().min(1000).max(3600000).optional(),
    }).strict('Unknown rateLimit field').optional(),
    maxExecutionTime: z.number().int().min(1000).max(300000).optional(),
    // publicAccess is itself optional inside the permissions object — matches
    // the L1 consolidated schema (tool-schemas.js:701-703). Phase 2 chunk 2
    // initially declared publicAccess as required (gratuitously stricter
    // than L1); relaxed per mcp-hub Finding B — if a caller sends
    // `updates: { permissions: {} }` the schema should accept it cleanly
    // (current behavior is no-op, future Phase 3 may add canModify/canDelete).
    permissions: z.object({
      publicAccess: z.boolean().optional(),
    }).strict('Unknown permissions field').optional(),
  }).strict('Unknown updates field — only declared fields are accepted to prevent field-leakage; serviceId/ownerId/id are immutable')
    // Finding D closure (mcp-hub Phase 2 chunk 2, shipped 2026-05-17).
    // Pre-existing: empty `updates: {}` passed schema → triggered
    // `prisma.mCPTool.update({ data: { updatedAt: new Date() } })` no-op
    // that just bumped the timestamp without changing any business data.
    // Reject empty objects so the caller gets a clear error instead of a
    // silent successful-but-useless write.
    .refine(
      (o) => Object.keys(o).length > 0,
      { message: 'updates must contain at least one field' }
    ),
}).passthrough().transform(stripDangerousKeys);

class ServiceUpdateHandler {
  /**
   * @param {Object} prisma - Prisma client instance
   * @param {Object} utilities - Hub utilities instance
   */
  constructor(prisma, utilities, parent = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parent = parent; // For accessing serviceDiscoveryHandler to invalidate cache
  }

  /**
   * Update an existing MCP service (preserves service ID and history)
   *
   * @param {Object} args - Update request arguments
   * @param {string} [args.serviceId] - Service ID (CUID) OR use service_name for magic lookup
   * @param {string} [args.service_name] - Service name for fuzzy lookup (alternative to serviceId)
   * @param {Object} args.updates - Fields to update
   * @param {string} [args.updates.description] - New description
   * @param {Object} [args.updates.capabilities] - New capabilities
   * @param {string} [args.updates.authType] - New auth type
   * @param {string} [args.updates.version] - New version
   * @param {string} [args.updates.status] - New status
   * @param {string} [args.updates.endpoint] - New endpoint URL
   * @param {string} [args.updates.category] - New category
   * @param {Object} context - User authentication context (required)
   * @param {Object} context.user - Authenticated user
   * @param {string} context.user.id - User ID
   * @param {string} context.user.email - User email
   *
   * @returns {Promise<Object>} Update result
   * @returns {boolean} returns.success - Whether update succeeded
   * @returns {string} returns.serviceId - Service ID
   * @returns {string} returns.serviceName - Service name
   * @returns {string} returns.message - Human-readable result
   * @returns {Array<string>} returns.updatedFields - List of updated fields
   * @returns {Object} returns.service - Updated service data
   *
   * @throws {Error} If user not authenticated, service not found, or no ownership
   *
   * @example
   * const result = await handler.handle({
   *   service_name: 'my-service',
   *   updates: {
   *     description: 'New description',
   *     version: '2.0.0'
   *   }
   * }, { user: { id: 'user123', email: 'user@example.com' } });
   */
  async handle(args, context) {
    try {
      const { userId, userEmail } = extractAuthContext(context, 'Service update');

      // #218 Phase 3 sec-ops M2 (2026-05-23): per-user rate limit on update.
      // Previously update had no rate cap — an attacker who registered a
      // service could call update in a tight loop, generating audit log
      // entries (publicAccess flip-flop, rateLimit changes, etc.) and
      // potentially flooding the Activity table. Per writeOperationLimiter
      // shape: 300/min (same generous cap as other write operations; nginx
      // provides upstream IP-level throttling on top).
      const { writeOperationLimiter } = require('../../../../utils/rate-limiter');
      const rateLimitKey = `registry.update:${userId}`;
      const allowed = await writeOperationLimiter.checkLimit(rateLimitKey);
      if (!allowed) {
        throw new Error(
          '⏱️ Rate limit reached: too many registry update calls. ' +
          'Limit: 300 per minute per user. Wait a moment and retry.'
        );
      }

      // Transport boundary: outer args may have stringly-encoded updates from MCP
      // clients. ensureObject runs first because Zod's transform won't see the
      // string→object coercion at the OUTER level (the schema declares `updates`
      // as an object literal; safeParse would reject `updates: "{...}"`).
      args.updates = ensureObject(args.updates, {}, 'registry.update.updates');

      // N5 + #29 + #30 closure — handler-boundary safeParse.
      // Validates the FULL input including all updates.* fields the handler
      // accepts. The schema's capabilities union strips dangerous keys on both
      // object and JSON-string branches (closes N5). `.strict()` on updates
      // rejects unknown fields including serviceId/ownerId/id (closes #29
      // structurally; the destructure-strip pattern at the old :127 is gone).
      // healthCheckPath path-traversal + protocol checks moved into the schema
      // via .refine() (closes #30 partial; runtime URL safety stays inline).
      const parsed = ServiceUpdateHandlerInputSchema.safeParse(args);
      if (!parsed.success) {
        const errors = parsed.error.errors
          .map((e) => `${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
          .join('; ');
        throw validationError(
          [`Invalid update parameters: ${errors}`],
          { description: 'My updated service', version: '2.0.0' },
          'updates must contain only declared fields; serviceId/ownerId/id are immutable. Use registry(action: "list") to verify your service.'
        );
      }

      const validatedArgs = parsed.data;
      const { serviceId, service_name } = validatedArgs;
      let finalServiceId = serviceId;

      // MAGIC PARAMETER: Service name lookup via shared middleware
      if (!finalServiceId && service_name) {
        const result = await resolveService({
          args: { service_name },
          prisma: this.prisma,
          options: {
            toolName: 'registry',
            statusFilter: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR'],
            ownerFilter: userId,
            minScore: 100  // Require at least "contains" match — prevents wrong-service modification
          }
        });
        if (result.notFound) return result.notFound;
        finalServiceId = result.serviceId;
      }

      if (!finalServiceId) {
        throw missingServiceIdentifierError('update');
      }

      log.info({ serviceId: finalServiceId, userId }, 'Update service called');

      // Find and validate service ownership
      const existingService = await this.prisma.mCPTool.findUnique({
        where: { id: finalServiceId }
      });

      if (!existingService) {
        throw serviceNotFoundByIdError(finalServiceId, 'update');
      }

      // Check ownership (only owner or admin can update)
      await validateOwnership(userId, existingService, this.utilities);

      // N5 closure — `capabilities` JSON-string-or-object union is handled by
      // the schema's `capabilitiesUpdateSchema` (declared at module top).
      // The previous manual `JSON.parse(args.updates.capabilities)` block
      // didn't strip dangerous keys, allowing prototype pollution into the DB
      // JSON column. The schema strips on both branches; deleted manual parse.
      //
      // #29 closure — the previous destructure
      //   `const { serviceId: _sid, ownerId: _oid, id: _id, ...safeUpdates } = args.updates`
      // silently dropped sensitive fields without validating the rest. The
      // schema's `.strict()` on `updates` rejects those fields with a clear
      // error (and rejects ANY unknown field — closes the "new schema fields
      // won't apply automatically" drift that mcp-tool-architecture flagged).
      const safeUpdates = validatedArgs.updates || {};
      const updateData = {};

      if (safeUpdates.description) updateData.description = safeUpdates.description;
      if (safeUpdates.capabilities) updateData.capabilities = safeUpdates.capabilities;
      if (safeUpdates.authType) updateData.authType = safeUpdates.authType;
      if (safeUpdates.version) updateData.version = safeUpdates.version;
      if (safeUpdates.status) updateData.status = safeUpdates.status;

      // #30 closure — the BC51 inline healthCheckPath check is now in the schema
      // (capabilitiesUpdateSchema's `.refine()` blocks at module top). Path-traversal,
      // protocol, and length checks all run during safeParse. Inline check deleted.

      // BC51 — runtime URL safety check. Zod's `.url()` validates format;
      // `validateUrlSafety` does SSRF / BLOCKED_DOMAINS / internal-IP runtime
      // checks beyond Zod's static reach. Lifted to shared `assertEndpointSafe`
      // helper (sec-ops Finding B, Phase 3 C1, 2026-05-16) to eliminate the
      // asymmetry with the register path. BC70: existingService passed so
      // seeded internal first-party services bypass the check.
      if (safeUpdates.endpoint) {
        assertEndpointSafe(safeUpdates.endpoint, { existingService, action: 'update' });
      }

      // Handle configuration updates (operational settings)
      // Separate from permissions for semantic correctness (Jan 2026 standardization)
      const needsConfigUpdate = safeUpdates.endpoint || safeUpdates.category ||
        safeUpdates.healthCheckPath || safeUpdates.rateLimit || safeUpdates.maxExecutionTime;

      if (needsConfigUpdate) {
        updateData.configuration = {
          ...existingService.configuration,
          ...(safeUpdates.endpoint && { endpoint: safeUpdates.endpoint }),
          ...(safeUpdates.category && { category: safeUpdates.category }),
          ...(safeUpdates.healthCheckPath && { healthCheckPath: safeUpdates.healthCheckPath }),
          ...(safeUpdates.rateLimit && { rateLimit: safeUpdates.rateLimit }),
          ...(safeUpdates.maxExecutionTime && { maxExecutionTime: safeUpdates.maxExecutionTime })
        };
      }

      // Handle permissions updates (access control)
      // publicAccess belongs in permissions column (not configuration)
      const needsPermissionsUpdate = safeUpdates.permissions?.publicAccess !== undefined;

      if (needsPermissionsUpdate) {
        updateData.permissions = {
          ...existingService.permissions,
          publicAccess: safeUpdates.permissions.publicAccess
        };
      }

      // P0: Fire-and-forget audit logging
      const { logPermissionsChange, HubAuditEvent } = require('./hub-audit-service');

      if (safeUpdates.permissions?.publicAccess !== undefined) {
        logPermissionsChange(finalServiceId, userId, {
          action: safeUpdates.permissions.publicAccess
            ? HubAuditEvent.SERVICE_MADE_PUBLIC
            : HubAuditEvent.SERVICE_MADE_PRIVATE,
          field: 'publicAccess',
          oldValue: existingService.permissions?.publicAccess,  // ← Read from permissions now
          newValue: safeUpdates.permissions.publicAccess
        }, { source: 'MCP' });
      }

      if (safeUpdates.rateLimit) {
        logPermissionsChange(finalServiceId, userId, {
          action: HubAuditEvent.SERVICE_RATE_LIMIT_CHANGED,
          field: 'rateLimit',
          oldValue: existingService.configuration?.rateLimit,
          newValue: safeUpdates.rateLimit
        }, { source: 'MCP' });
      }

      if (safeUpdates.healthCheckPath) {
        logPermissionsChange(finalServiceId, userId, {
          action: HubAuditEvent.SERVICE_HEALTH_CHECK_PATH_CHANGED,
          field: 'healthCheckPath',
          oldValue: existingService.configuration?.healthCheckPath,
          newValue: safeUpdates.healthCheckPath
        }, { source: 'MCP' });
      }

      // Perform update (preserves service ID and all relationships)
      const updatedService = await this.prisma.mCPTool.update({
        where: { id: finalServiceId },
        data: {
          ...updateData,
          updatedAt: new Date()
          // Preserves: id, createdAt, interactions, workflows, permissions, etc.
        }
      });

      log.info({ serviceName: existingService.name, serviceId: finalServiceId, userEmail }, 'MCP service updated');

      // Phase A: Invalidate caches (service updated)
      invalidateServiceCaches(this.parent, finalServiceId);

      // Dec 2025 UX Assessment Fix 3: Add _meta for consistency
      return {
        success: true,
        serviceId: finalServiceId,
        serviceName: updatedService.name,
        message: `Service '${updatedService.name}' updated successfully`,
        _meta: {
          tool: 'registry',
          timestamp: new Date().toISOString(),
          sdkNative: true
        },
        updatedFields: Object.keys(safeUpdates),
        preservedHistory: {
          serviceId: 'unchanged',
          createdAt: 'preserved',
          interactions: 'preserved',
          workflows: 'preserved',
          analytics: 'preserved'
        },
        service: {
          id: updatedService.id,
          name: updatedService.name,
          description: updatedService.description,
          version: updatedService.version,
          category: updatedService.configuration?.category,
          status: updatedService.status,
          lastUpdated: updatedService.updatedAt
        },
        nextSteps: [
          "✅ Service configuration updated",
          `Verify changes: services(action: 'health', service_name: '${updatedService.name}')`,
          "Changes are immediately visible to all hub users"
        ],
        verification: `services(action: 'health', service_name: "${updatedService.name}")`
      };
    } catch (error) {
      log.error({ err: error }, 'Service update failed');

      // Dec 2025 UX Assessment: Use centralized error helper
      throw enhancedOperationError('Service update', error, {
        validParams: [
          'service_name: Name of your service to update (required)',
          'updates.description: New service description',
          'updates.version: New version number',
          'updates.status: ACTIVE, INACTIVE, or MAINTENANCE',
          'updates.endpoint: New service endpoint URL',
          'updates.category: New category',
          'updates.healthCheckPath: Custom health check path (e.g., "/api/status")',
          'updates.permissions.publicAccess: Make service public (true/false)',
          'updates.rateLimit: Rate limiting ({requests, windowMs}) - flat structure',
          'updates.maxExecutionTime: Max execution time in ms - flat structure'
        ],
        examples: [
          'registry(action: "update", service_name: "my-api", updates: { version: "2.0" })',
          'registry(action: "update", service_name: "my-api", updates: { permissions: { publicAccess: true } })',
          'registry(action: "update", service_name: "my-api", updates: { healthCheckPath: "/api/status" })',
          'registry(action: "update", service_name: "my-api", updates: { rateLimit: { requests: 50, windowMs: 60000 } })'
        ],
        tips: [
          'Use registry(action: "list") to see your registered services',
          'Only service owners can update their services',
          'Set publicAccess: true to let other users call your service'
        ]
      });
    }
  }
}

module.exports = { ServiceUpdateHandler, ServiceUpdateHandlerInputSchema };
