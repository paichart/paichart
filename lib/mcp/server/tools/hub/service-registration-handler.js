/**
 * Service Registration Handler
 *
 * Handles MCP service registration with comprehensive validation, permission checks,
 * uniqueness validation, and Anthropic compliance service approval policy.
 *
 * @class ServiceRegistrationHandler
 * @description Provides secure service registration including:
 *   - Authentication enforcement (required for all registrations)
 *   - Unified Zod validation framework for enterprise security
 *   - Permission checks using RolePermission system
 *   - Service name uniqueness validation
 *   - Anthropic compliance service approval policy
 *   - Risk-based evaluation (auto-approve safe services, require approval for high-risk)
 *   - ComplianceMonitor integration for audit logging
 *   - Service ownership tracking via user context
 *   - Pending approval workflow for high-risk services
 *
 * @version 1.0.0
 * @author pAIchart MCP Hub Team
 */

const { SDKParameterNormalizer } = require('../../utils/parameter-normalizer');
const { validationError, permissionDeniedError } = require('./error-helpers');
const { serviceRegistrationLimiter } = require('../../../../utils/rate-limiter');
const { extractAuthContext, invalidateServiceCaches, sanitizeEndpointUrl } = require('./hub-shared-middleware');
const { assertEndpointSafe } = require('./hub-utilities');
const { audienceForService } = require('./audience-policy');
const { SSRF_EXEMPT_SERVICES } = require('../../config/service-call-policy');
const { ensureObject } = require('../../../../utils/ensure-object');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-registration' }));

// Derive transport from endpoint URL scheme. Replaces the prior hardcoded 'stdio'
// that produced wrong values for every HTTP-based service (BUG fix 2026-05-13).
function deriveTransport(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return 'unknown';
  const url = endpoint.toLowerCase();
  if (/\/mcp(\?|$)/.test(url)) return 'streamable-http';
  if (/\/sse(\?|$)/.test(url)) return 'sse';
  return 'http';
}

class ServiceRegistrationHandler {
  /**
   * Creates Service Registration Handler
   *
   * @param {Object} prisma - Prisma client instance
   * @param {HubUtilities} utilities - Shared utilities for permission checks
   * @param {SDKParameterNormalizer} [parameterNormalizer] - Parameter normalizer instance
   */
  constructor(prisma, utilities, parameterNormalizer = null, parent = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parameterNormalizer = parameterNormalizer || new SDKParameterNormalizer();
    this.parent = parent; // For accessing serviceDiscoveryHandler to invalidate cache
  }

  /**
   * Register a new MCP service with the hub
   *
   * @param {Object} args - Service registration arguments
   * @param {string} args.name - Service name (must be unique)
   * @param {string} args.description - Service description
   * @param {string} [args.version='1.0.0'] - Service version
   * @param {string} args.endpoint - Service endpoint URL
   * @param {Object} [args.capabilities={}] - Service capabilities (tools, resources, etc.)
   * @param {string} [args.category] - Service category for organization
   * @param {string} [args.authType='NONE'] - Authentication type required
   * @param {Object} context - User authentication context
   * @param {Object} context.user - Authenticated user (required)
   * @param {string} context.user.id - User ID
   * @param {string} context.user.email - User email
   *
   * @returns {Promise<Object>} Registration result
   * @returns {boolean} returns.success - Whether registration succeeded
   * @returns {string} returns.serviceId - Created service ID (CUID)
   * @returns {string} returns.status - Service status (ACTIVE or PENDING_APPROVAL)
   * @returns {string} returns.message - Human-readable result message
   *
   * @description Registers new MCP service with Anthropic compliance validation.
   *   High-risk services require admin approval. Service ownership tracked via user context.
   *
   * @example
   * const result = await handler.handle({
   *   name: 'weather-api',
   *   description: 'Weather data service',
   *   endpoint: 'https://api.weather.com/mcp',
   *   capabilities: { tools: ['get_forecast'], resources: ['weather-data'] }
   * }, { user: { id: 'user123', email: 'admin@company.com' } });
   *
   * @throws {Error} If user not authenticated, service name exists, or validation fails
   */
  async handle(args, context) {
    try {
      // Normalize parameters
      args = this.parameterNormalizer.normalizeForTool('registry.register', args);

      // Extract user from JWT token
      const { userId, userEmail } = extractAuthContext(context, 'Service registration');

      log.info({ hasContext: !!context, hasUser: !!context?.user, userId, userEmail }, 'Auth context');

      // Rate limit: 50 service registrations per day per user
      // Aligns with: POV creation daily limit pattern (task-action-handler.js:113)
      const rateLimitKey = `service.register:${userId}`;
      const allowed = await serviceRegistrationLimiter.checkLimit(rateLimitKey);
      if (!allowed) {
        const resetTime = serviceRegistrationLimiter.getResetTime(rateLimitKey);
        const remaining = serviceRegistrationLimiter.getRemainingRequests(rateLimitKey);
        throw new Error(
          `⏱️ Daily Service Registration Limit Reached: You can register up to 50 services per day. ` +
          `Remaining today: ${remaining}. ` +
          `Limit resets: ${resetTime.toISOString()}. ` +
          `This prevents registry spam and ensures system stability.`
        );
      }

      // Quota enforcement: max 10 services per user (displayed in services discover)
      const currentServiceCount = await this.prisma.mCPTool.count({
        where: {
          configuration: {
            path: ['ownerId'],
            equals: userId
          }
        }
      });

      const SERVICE_QUOTA = 10;
      if (currentServiceCount >= SERVICE_QUOTA) {
        throw new Error(
          `Service quota reached: You own ${currentServiceCount}/${SERVICE_QUOTA} services. ` +
          `Delete unused services with registry(action: "delete") before registering new ones. ` +
          `View your services: registry(action: "list")`
        );
      }

      // Phase 3 C1 commit 2: L2 validator removed. Constraints (name kebab,
      // description charset, endpoint mcp://|http refine, version semver,
      // authType default 'NONE') migrated to L1 dispatch-boundary schema at
      // tool-schemas.js registry. authType default uses action-discriminator
      // transform to preserve BC76 N3 closure (no fan-out to list/update/
      // delete/tools — see smoke #61/#62). args is the L1-validated payload.
      const validatedArgs = args;

      // Check permission using proper RolePermission system
      const canCreate = await this.utilities.checkPermission(userId, 'mcp-service', 'create');
      if (!canCreate) {
        throw permissionDeniedError('register services');
      }

      // Wave B H1 fix (2026-05-23, Hub sec-ops Phase 3): Reserved-name refine.
      // Previously: SSRF-exempt name capture chain — if any seeded internal
      // service is deleted, missing, or renamed, a user could grab its name
      // via registry.register, then UPDATE the endpoint to 169.254.169.254
      // and pivot to IMDS. Defense was relying on uniqueness alone (lines
      // 152-167) which depends on deployment ordering, not code invariants.
      // Now: reject registration of any name in the SSRF-exempt list,
      // regardless of whether that seeded service currently exists in the DB.
      const normalizedName = String(validatedArgs.name || '').trim().toLowerCase();
      const reservedHit = SSRF_EXEMPT_SERVICES.find(
        (reserved) => reserved.toLowerCase() === normalizedName
      );
      if (reservedHit) {
        log.warn({
          userId,
          attemptedName: validatedArgs.name,
          reservedName: reservedHit,
        }, 'Reserved-name registration attempt blocked (SSRF-exempt capture defense)');
        throw validationError(
          [`Service name '${validatedArgs.name}' is reserved for first-party internal services and cannot be registered by users.`],
          {
            name: 'my-unique-service-name',
            endpoint: validatedArgs.endpoint,
            category: validatedArgs.category,
            description: validatedArgs.description,
          },
          'Choose a different name. Reserved names are kept exclusive to seeded internal services for network-policy correctness.'
        );
      }

      // Validate service name uniqueness using validated data
      const existingService = await this.prisma.mCPTool.findFirst({
        where: { name: validatedArgs.name }
      });

      if (existingService) {
        throw validationError(
          [`Service name '${validatedArgs.name}' is already registered`],
          {
            name: "my-unique-service-name",
            endpoint: validatedArgs.endpoint,
            category: validatedArgs.category,
            description: validatedArgs.description
          },
          "Choose a unique service name. Use registry(action: 'list') to see your existing services."
        );
      }

      // Validate endpoint uniqueness - prevent duplicate endpoint registration
      const existingEndpoint = await this.prisma.mCPTool.findFirst({
        where: {
          configuration: {
            path: ['endpoint'],
            equals: validatedArgs.endpoint
          }
        },
        select: { name: true }
      });

      if (existingEndpoint) {
        throw validationError(
          [`Endpoint '${validatedArgs.endpoint}' is already registered by service '${existingEndpoint.name}'`],
          {
            name: "my-new-service",
            endpoint: "https://api.mynewservice.com/mcp",
            category: "data-services",
            description: "My service description"
          },
          "Each service must have a unique endpoint. Use a different endpoint or call the existing service."
        );
      }

      // U2 Phase B (2026-05-19): per-service audience collision detection.
      // Per RFC 8707 — each service's audience must be unique. Names that
      // normalize identically (e.g., 'Foo Service' / 'Foo-Service' / 'Foo_Service')
      // would collapse to the same audience and defeat blast-radius isolation.
      // Catch at registration time so collisions never reach the verifier.
      //
      // In-memory check (vs querying configuration.audience JSONB) so we catch
      // existing pre-Phase-B services that don't yet have configuration.audience
      // persisted. With ~5-15 active services this is trivially cheap. New
      // registrations also persist their audience to configuration.audience
      // for monitoring / audit / fast lookups.
      const computedAudience = audienceForService({ name: validatedArgs.name });
      const allServices = await this.prisma.mCPTool.findMany({
        select: { name: true }
      });
      const audienceCollision = allServices.find((svc) => {
        try {
          return audienceForService(svc) === computedAudience;
        } catch {
          // Skip services with names that can't normalize (defensive — shouldn't
          // happen for any existing registration since name uniqueness has been
          // enforced longer than audienceForService's empty-string rejection).
          return false;
        }
      });

      if (audienceCollision) {
        throw validationError(
          [`Service name '${validatedArgs.name}' normalizes to audience '${computedAudience}' which collides with existing service '${audienceCollision.name}'`],
          {
            name: "a-distinctly-different-name",
            endpoint: validatedArgs.endpoint,
            category: validatedArgs.category,
            description: validatedArgs.description
          },
          `Choose a name that yields a distinct audience. The current name shares the same normalized form (NFKD + lowercase + dash-collapse) as '${audienceCollision.name}'.`
        );
      }

      // sec-ops Finding B (Phase 3 C1, 2026-05-16) — runtime SSRF gate.
      // Zod's `.url()` + `.refine(mcp://|http)` at the dispatch boundary
      // narrows the protocol but can't catch DNS/runtime-dependent private-
      // IP targets (169.254.169.254, localhost, RFC 1918, ::1). Update
      // handler has this check at L300; register previously did not, so
      // attacker-controlled private-IP endpoints persisted in the registry
      // until the first health-check / call hit them. No exemption at
      // register (SSRF_EXEMPT is a seeded internal-services list).
      assertEndpointSafe(validatedArgs.endpoint, { action: 'register' });

      // NEW: Apply Anthropic compliance service approval policy
      const { evaluateServiceRegistration, generateApprovalWorkflow } = require('../../config/service-approval-policy');
      const serviceEvaluation = evaluateServiceRegistration(validatedArgs, {
        userId,
        userEmail,
        isNewUser: await this.utilities.isNewUser(userId)
      });

      const approvalWorkflow = generateApprovalWorkflow(serviceEvaluation.evaluation);

      // Log compliance evaluation (uses singleton with auto-scheduled cleanup)
      const { ComplianceMonitor } = require('../../security/compliance-monitor');
      const monitor = ComplianceMonitor.getInstance();
      await monitor.logSecurityEvent('SERVICE_REGISTRATION', {
        serviceName: validatedArgs.name,
        endpoint: validatedArgs.endpoint,
        category: validatedArgs.category,
        evaluation: serviceEvaluation,
        riskLevel: serviceEvaluation.evaluation?.riskLevel || 'LOW'
      }, {
        userId,
        ipAddress: context?.ip
      });

      // Handle approval workflow
      const approvalRec = serviceEvaluation.evaluation?.approvalRecommendation;
      const isAutoApproved = approvalRec === 'AUTO_APPROVE' || approvalRec === 'AUTO_APPROVE_WITH_MONITORING';
      if (!isAutoApproved) {
        log.warn({ securityEvent: true, serviceName: validatedArgs.name, riskLevel: serviceEvaluation.riskLevel, violations: serviceEvaluation.violations, userId }, 'Service requires compliance approval');

        // Create pending service registration
        const pendingService = await this.prisma.mCPTool.create({
          data: {
            name: validatedArgs.name,
            description: validatedArgs.description,
            version: validatedArgs.version || '1.0.0',
            capabilities: ensureObject(validatedArgs.capabilities, {}, 'registry.register.capabilities'),
            configuration: {
              endpoint: validatedArgs.endpoint,
              transport: deriveTransport(validatedArgs.endpoint),
              category: validatedArgs.category,
              // U2 Phase B: persist per-service audience (RFC 8707) for collision detection
              audience: computedAudience,
              ownerId: userId,
              ownerEmail: userEmail,
              createdBy: 'user_registration',
              serviceType: 'mcp_service',
              approvalStatus: 'PENDING_APPROVAL',
              evaluationResult: serviceEvaluation
            },
            // N3 closure (Phase 2 chunk 4) — read from validatedArgs after
            // authType was added to the registry.register schema. Schema
            // applies default 'NONE' if not provided.
            authType: validatedArgs.authType,
            credentials: {},
            permissions: {
              canModify: [userId],
              canDelete: [userId],
              owner: userId,
              publicAccess: false  // Default to private (can update via registry(action: "update"))
            },
            status: 'INACTIVE' // Not ACTIVE until approved (PENDING_APPROVAL stored in configuration)
          }
        });

        // Phase A: Invalidate discovery cache (new service registered, even if pending)
        invalidateServiceCaches(this.parent);

        // Dec 2025 UX Assessment Fix 3: Add _meta for consistency
        return {
          success: true,
          serviceId: pendingService.id,
          serviceName: validatedArgs.name,
          status: 'PENDING_APPROVAL',
          message: `Service '${validatedArgs.name}' submitted for approval`,
          _meta: {
            tool: 'registry',
            timestamp: new Date().toISOString(),
            sdkNative: true
          },
          approvalDetails: {
            riskLevel: serviceEvaluation.riskLevel,
            estimatedReviewTime: '24-48 hours',
            reasons: serviceEvaluation.violations,
            warnings: serviceEvaluation.warnings,
            guidance: serviceEvaluation.evaluation?.userGuidance || []
          },
          nextSteps: [
            ...(serviceEvaluation.evaluation?.userGuidance || []),
            'Check status via registry(action: "list")',
            'For help, contact support@paichart.com'
          ]
        };
      }

      // Store service in MCPTool model with ownership using validated data
      const service = await this.prisma.mCPTool.create({
        data: {
          name: validatedArgs.name,
          description: validatedArgs.description,
          version: validatedArgs.version || '1.0.0',
          capabilities: ensureObject(validatedArgs.capabilities, {}, 'registry.register.capabilities'),
          configuration: {
            endpoint: validatedArgs.endpoint,
            transport: deriveTransport(validatedArgs.endpoint),
            category: validatedArgs.category,
            // U2 Phase B: persist per-service audience (RFC 8707) for collision detection
            audience: computedAudience,
            // Store ownership in configuration
            ownerId: userId,
            ownerEmail: userEmail,
            createdBy: 'user_registration',
            serviceType: 'mcp_service',
            approvalStatus: 'APPROVED',
            evaluationResult: serviceEvaluation
          },
          // N3 closure (Phase 2 chunk 4) — read from validatedArgs after
          // authType was added to the registry.register schema.
          authType: validatedArgs.authType,
          credentials: {}, // Empty credentials object for now
          permissions: {
            // Store ownership in permissions field
            canModify: [userId],
            canDelete: [userId],
            owner: userId,
            publicAccess: false  // Default to private (can update via registry(action: "update"))
          },
          status: 'ACTIVE'
        }
      });

      log.info({ serviceName: validatedArgs.name, serviceId: service.id, userEmail }, 'MCP service registered');

      // Phase A: Invalidate discovery cache (new service registered)
      invalidateServiceCaches(this.parent);

      // Dec 2025 UX Assessment Fix 3: Add _meta for consistency
      // R-5 closure (Phase 2 chunk 4) — response strings now read from
      // validatedArgs.name/endpoint. Was a future BC76 risk: if the schema
      // ever adds .transform() (trim/lowercase/normalize), raw args reads
      // would silently bypass the transform.
      // Phase 3 sec-ops L5 (2026-05-23): soft warning for http:// endpoints.
      // L1 schema allows `http://` AND `https://` (.startsWith('http')) to
      // preserve developer flows (localhost http://). For production endpoints
      // on the open internet, http:// transits credentials/tokens unencrypted.
      // Surface a warning so callers know to upgrade — UX-pleasant, no breakage.
      const endpointWarning = (
        typeof validatedArgs.endpoint === 'string' &&
        validatedArgs.endpoint.startsWith('http://')
      )
        ? '⚠️ Endpoint uses unencrypted http://. Recommend https:// for production services to protect credentials in transit.'
        : null;

      return {
        success: true,
        serviceId: service.id,
        serviceName: validatedArgs.name,
        message: `Service '${validatedArgs.name}' registered successfully`,
        _meta: {
          tool: 'registry',
          timestamp: new Date().toISOString(),
          sdkNative: true
        },
        endpoint: sanitizeEndpointUrl(validatedArgs.endpoint),
        owner: userEmail,
        status: 'ACTIVE',
        ...(endpointWarning ? { warnings: [endpointWarning] } : {}),
        nextSteps: [
          "✅ Your service is now discoverable via services(action: \"discover\")",
          "✅ Other users can call your service via services(action: \"call\")",
          `Monitor performance: services(action: 'health', service_name: '${validatedArgs.name}')`,
          `Update configuration: registry(action: 'update', service_name: '${validatedArgs.name}', ...)`
        ],
        verification: {
          action: "Try discovering your service",
          example: `services(action: "discover", ${Object.keys(validatedArgs.capabilities || {}).length > 0 ? `capability: "${Object.keys(validatedArgs.capabilities)[0]}"` : `category: "${validatedArgs.category}"`})`
        }
      };
    } catch (error) {
      log.error({ err: error }, 'Service registration failed');
      throw error;
    }
  }
}

module.exports = { ServiceRegistrationHandler };
