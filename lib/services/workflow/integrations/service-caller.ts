/**
 * Orchestration Service Caller - Connection pooled MCP service calls
 *
 * Provides connection-pooled calls to MCP Hub registered services.
 * Routes internal services (paichart-*) directly via InternalServiceRouter.
 * Uses the existing ServiceConnectionPool for external services (100-200ms savings per call).
 *
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 * @see /.claude/knowledge/domain/mcp/workflow-dual-handler-architecture.md
 */

import { OrchestrationContext } from '../types/orchestration-context';
import { prisma } from '@/lib/prisma';
import { ensureObject } from '@/lib/utils/ensure-object';
import { logger } from '@/lib/logger';
import { mintMcpToken } from '@/lib/auth/token-manager';
import { UserRole as AuthUserRole } from '@/lib/types/auth';

const { audienceForService } = require('@/lib/mcp/server/tools/hub/audience-policy');

const callerLogger = logger.child({ module: 'ServiceCaller' });

// Import connection pool (JavaScript module)
const { ServiceConnectionPool } = require('@/lib/mcp/server/utils/service-connection-pool');

// Import InternalServiceRouter for in-process internal service calls (zero HTTP overhead)
const { InternalServiceRouter } = require('@/lib/mcp/server/tools/internal/InternalServiceRouter');

// Import resilient call utility for stale connection detection and retry
const { resilientServiceCall } = require('@/lib/mcp/server/utils/resilient-call');
// F-SWEEP-3 A-lite (2026-07-17): shared metric updater so orchestration/pipeline-leg
// calls feed the same successRate/errorCount EMA as the direct services.call path.
const { updateServiceMetricsCore } = require('@/lib/mcp/server/tools/hub/hub-utilities');

// Import shared trust utilities (JavaScript module)
// Using require + as pattern for JS/TS interop (same pattern as orchestration-engine.js)
const {
  TrustLevel,
  determineTrustLevel,
  buildServiceContext,
  trustLevelReceivesToken,
  logTrustDenial,
} = require('../security/trust-level') as {
  TrustLevel: {
    INTERNAL: 'INTERNAL';
    TRUSTED: 'TRUSTED';
    OWNER: 'OWNER';
    TEAM_MEMBER: 'TEAM_MEMBER';
    SCOPED: 'SCOPED';
    ANONYMOUS: 'ANONYMOUS';
  };
  determineTrustLevel: (params: {
    serviceId: string;
    serviceRecord: { name?: string; configuration?: { ownerId?: string }; permissions?: { publicAccess?: boolean } } | null;
    userId: string;
    povId: string | null | undefined;
    prisma: typeof prisma;
  }) => Promise<string>;
  buildServiceContext: (
    trustLevel: string,
    contextData: {
      userId: string;
      userEmail: string;
      userRole: string;
      token: string | undefined;
      povId: string | null | undefined;
      tenantId: string | null | undefined;
      requestId: string;
      source?: string;
    }
  ) => {
    userId: string;
    userEmail: string;
    userRole: string;
    povId: string | null;
    tenantId: string | null;
    requestId: string;
    source: string;
    token?: string;
  };
  trustLevelReceivesToken: (trustLevel: string) => boolean;
  logTrustDenial: (
    prisma: any,
    params: {
      userId: string;
      serviceId: string;
      serviceName: string;
      trustLevel: string;
      povId: string | null;
      reason: string;
    }
  ) => Promise<void>;
};

// Singleton internal router instance
let internalRouter: InstanceType<typeof InternalServiceRouter> | null = null;

/**
 * Get or create singleton InternalServiceRouter instance
 */
function getInternalRouter(): InstanceType<typeof InternalServiceRouter> {
  if (!internalRouter) {
    internalRouter = new InternalServiceRouter();
  }
  return internalRouter;
}

/**
 * Check if a service ID is an internal pAIchart service
 * Internal services are routed directly without HTTP
 */
function isInternalService(serviceId: string): boolean {
  const router = getInternalRouter();
  // Check if service exists in the internal router's service map
  return !!router.serviceToolMap?.[serviceId];
}

/**
 * Result of a single service call
 */
export interface ServiceCallResult {
  /** Whether the call succeeded */
  success: boolean;
  /** Response data from the service (if successful) */
  data?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Error classification for diagnostics */
  errorType?: string;
  /** Whether this error type is retryable */
  retryable?: boolean;
  /** Number of attempts made (when retries are enabled) */
  attempts?: number;
  /** Execution time in ms */
  executionTime: number;
  /** Service that was called */
  service: string;
  /** Tool that was invoked */
  tool: string;
  /** Step index in workflow */
  stepIndex?: number;
  /** Warnings from response filtering */
  warnings?: string[];
}

/**
 * Service record with endpoint and trust-relevant configuration
 */
interface ServiceRecord {
  id: string;
  name: string;
  endpoint: string;
  transportType: 'http' | 'websocket';
  configuration: {
    ownerId?: string;
    endpoint?: string;
  };
  // F-SWEEP-2: publicAccess lives in the permissions COLUMN (post-Jan-2026
  // standardization), not configuration — trust-level.js reads it there.
  permissions: {
    publicAccess?: boolean;
  };
}

/**
 * Resolve service ID/name to endpoint via MCP Hub registry (MCPTool table)
 *
 * Returns full service record including configuration for trust level determination.
 *
 * @param serviceId - Service ID or name to resolve
 * @returns Service record with endpoint and configuration, or null if not found/inactive
 */
async function resolveServiceEndpoint(serviceId: string): Promise<ServiceRecord | null> {
  const service = await prisma.mCPTool.findFirst({
    where: {
      OR: [
        { id: serviceId },
        { name: serviceId }  // Allow lookup by name or ID
      ],
      status: 'ACTIVE'  // Only active services
    },
    select: {
      id: true,
      name: true,
      configuration: true,
      permissions: true  // F-SWEEP-2: trust-level reads permissions.publicAccess
    }
  });

  if (!service) {
    return null;
  }

  // Configuration is stored as JSON
  const config = service.configuration as {
    endpoint?: string;
    ownerId?: string;
  } | null;
  const endpoint = config?.endpoint;

  if (!endpoint) {
    return null;
  }

  // Determine transport type from endpoint URL
  const transportType = endpoint.startsWith('ws://') || endpoint.startsWith('wss://')
    ? 'websocket'
    : 'http';

  return {
    id: service.id,
    name: service.name,
    endpoint,
    transportType,
    configuration: config || {},
    permissions: (service.permissions as { publicAccess?: boolean } | null) || {}
  };
}

/**
 * Orchestration Service Caller
 *
 * Provides connection-pooled calls to MCP services for orchestration workflows.
 * Handles service resolution, connection management, and context propagation.
 */
class OrchestrationServiceCaller {
  private pool: InstanceType<typeof ServiceConnectionPool>;
  /** Max concurrent parallel executions to prevent pool exhaustion */
  private static MAX_CONCURRENT = 5;

  constructor() {
    this.pool = ServiceConnectionPool.getInstance();
  }

  /**
   * Call a single service tool with connection pooling
   *
   * Routes internal services (paichart-*) directly via InternalServiceRouter.
   * External services use HTTP connection pool for efficiency.
   *
   * @param context - Orchestration execution context
   * @param service - Service ID or name
   * @param tool - Tool name to invoke
   * @param args - Arguments to pass to the tool
   * @returns Service call result
   */
  async callService(
    context: OrchestrationContext,
    service: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<ServiceCallResult> {
    const startTime = Date.now();

    try {
      // Transport-boundary normalization (single point, 2026-06-06). Hoisted
      // ABOVE the internal/external branch so the internal routeCall (below) and
      // the external callTool both receive a guaranteed plain object. The external
      // branch previously had its own ensureObject (now idempotent); the internal
      // branch consumed raw `args`. Latent here — workflow steps[].arguments has no
      // string branch at L1 — but kept symmetric with service-call-handler.js to
      // prevent a future regression. See [[feedback_mcp_parameter_three_layers]].
      args = ensureObject(args, {}, 'ServiceCaller');

      // Route internal services directly (zero HTTP overhead)
      if (isInternalService(service)) {
        const router = getInternalRouter();

        // Build context for internal router (matches MCP context format).
        // U2 Phase D site #7 (2026-05-19): drop `token` from internal context
        // — InternalServiceRouter.normalizeContext (site #4) no longer reads it;
        // api-client.js (site #5) mints per-call with INTERNAL_API_AUDIENCE.
        // Add `azp` so per-call mints can preserve client-binding (Option α).
        const internalContext = {
          user: {
            id: context.user.id,
            email: context.user.email,
            role: context.user.role,
            azp: context.user.azp,
          },
          apiUserContext: {
            userId: context.user.id,
            email: context.user.email,
            role: context.user.role,
            azp: context.user.azp,
          },
          pov: context.pov,
          requestId: context.execution.requestId,
        };

        const result = await router.routeCall(service, tool, args, internalContext);

        return {
          success: result.success,
          data: result.result,
          executionTime: Date.now() - startTime,
          service,
          tool,
        };
      }

      // External services: Resolve endpoint via registry
      const serviceInfo = await resolveServiceEndpoint(service);
      if (!serviceInfo) {
        return {
          success: false,
          error: `Service not found or inactive: ${service}`,
          executionTime: Date.now() - startTime,
          service,
          tool,
        };
      }

      // SECURITY: Determine trust level for this service
      // Controls whether JWT token is included in _context
      // See: lib/services/workflow/security/trust-level.js
      const trustLevel = await determineTrustLevel({
        serviceId: service,
        serviceRecord: serviceInfo,
        userId: context.user.id,
        povId: context.pov?.id,
        prisma
      });

      // U2 Phase D site #7 + Phase C mint-before-trust pattern (2026-05-19):
      // determine trust permission FIRST, mint per-call token ONLY when trust
      // grants token-receiving. Per-service audience (RFC 8707 blast-radius
      // isolation) — a token minted here for Snowflake CANNOT replay at
      // Databricks / EIA / front-door /api.
      const hasToken = trustLevelReceivesToken(trustLevel);

      let perCallToken: string | undefined;
      if (hasToken) {
        // Mint signature enumerates ALL required MintMcpTokenOptions fields
        // explicitly (v3.1 Edit 2 — though this is a .ts file with TS compile
        // gate, the convention is uniform across all mint sites for review clarity):
        perCallToken = await mintMcpToken({
          userId: context.user.id,
          email: context.user.email,
          // Prisma's UserRole and @/lib/types/auth UserRole are runtime-equivalent
          // (identical string-literal members) but nominally distinct to TS.
          // Cast follows the existing codebase pattern (admin/handlers, pov/handlers,
          // mcpService) — `as UserRole` is the standard conversion.
          role: context.user.role as AuthUserRole,
          scope: 'mcp:execute',
          audience: audienceForService(serviceInfo),
          azp: context.user.azp,
          ttlSeconds: 900,
          purpose: 'per-call-forward',
        });
      }

      // Build context based on trust level
      // Token is only passed to INTERNAL, TRUSTED, OWNER, TEAM_MEMBER services
      // Phase 2: TEAM_MEMBER enabled with RS256/JWKS
      const serviceContext = buildServiceContext(trustLevel, {
        userId: context.user.id,
        userEmail: context.user.email,
        userRole: context.user.role,
        token: perCallToken,
        povId: context.pov?.id,
        tenantId: context.pov?.tenantId,
        requestId: context.execution.requestId,
        source: 'mcp_hub_workflow'
      });

      // Log trust decision for debugging/auditing
      callerLogger.info({ service, trustLevel, hasToken }, 'Trust level determined for service');

      // Phase 2: Audit trust denials for security forensics
      if (!hasToken) {
        await logTrustDenial(prisma, {
          userId: context.user.id,
          serviceId: service,
          serviceName: serviceInfo?.name || service,
          trustLevel,
          povId: context.pov?.id || null,
          reason: `Token withheld: trust level ${trustLevel} does not receive tokens`
        });
      }

      // Ensure arguments is a plain object (transport boundary guard)
      const callArguments = ensureObject(args, {}, 'ServiceCaller');

      // Default timeout for orchestration calls (fixes P0: missing timeout bug)
      const maxExecutionTime = 30000;

      // Call with stale connection detection, retry, and timeout (resilient-call utility)
      // Use serviceInfo.id (resolved CUID) not raw `service` param (could be name)
      // to match pool key convention used by service-call-handler.js and workflow-tools-handler.js
      const result = await resilientServiceCall(
        this.pool,
        serviceInfo.id,
        serviceInfo.endpoint,
        // F-NEW-5 (2026-07-17): RequestOptions is the SDK's THIRD callTool arg (2nd = resultSchema).
        // Without it the SDK's 60s default binds instead of maxExecutionTime — see
        // service-call-handler.js for the full rationale. Strictly widening; also sends
        // notifications/cancelled so the remote stops work (the outer race only abandons).
        (pooledClient: any) => pooledClient.callTool({
          name: tool,
          arguments: {
            ...callArguments,
            _context: serviceContext,
          },
        }, undefined, { timeout: maxExecutionTime }),
        { timeout: maxExecutionTime, label: `orchestration:${service}/${tool}` }
      );

      // F-SWEEP-3 A-lite (2026-07-17, panel): feed the pipeline-leg path into the shared
      // service-metrics EMA (previously invisible). Metric-only, fire-and-forget; the
      // observation is isError-aware (an isError:true MCP response is a failed call for
      // metric purposes even though this function's return keeps success:true for
      // transport-level success — return shape unchanged). Latency only on genuine
      // success (C1 discipline). Transport throws land in the catch where serviceInfo
      // is out of scope — unfed, same documented residual as workflow-tools-handler.
      const callSucceeded = !(result && (result as { isError?: boolean }).isError === true);
      updateServiceMetricsCore(prisma, serviceInfo.id, {
        executionTimeMs: callSucceeded ? Date.now() - startTime : null,
        success: callSucceeded,
      }).catch(() => {});

      return {
        success: true,
        data: result?.content || result,
        executionTime: Date.now() - startTime,
        service,
        tool,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        service,
        tool,
      };
    }
  }

  /**
   * Call multiple services in parallel with batching
   *
   * Executes calls in batches of MAX_CONCURRENT to prevent pool exhaustion.
   *
   * @param context - Orchestration execution context
   * @param calls - Array of service calls to execute
   * @returns Array of results in same order as calls
   */
  async callServicesParallel(
    context: OrchestrationContext,
    calls: Array<{ service: string; tool: string; args: Record<string, unknown> }>
  ): Promise<ServiceCallResult[]> {
    const results: ServiceCallResult[] = [];

    // Process in batches of MAX_CONCURRENT to prevent pool exhaustion
    for (let i = 0; i < calls.length; i += OrchestrationServiceCaller.MAX_CONCURRENT) {
      const batch = calls.slice(i, i + OrchestrationServiceCaller.MAX_CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(call => this.callService(context, call.service, call.tool, call.args))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

/** Singleton instance of the orchestration service caller */
export const orchestrationServiceCaller = new OrchestrationServiceCaller();
