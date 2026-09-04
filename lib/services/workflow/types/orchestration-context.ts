/**
 * Orchestration Context - Execution context for MCP Service Orchestration
 *
 * Provides user, POV, and execution context for workflow orchestration.
 * Used by MCPServiceOrchestrationHandler to build execution context.
 *
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 */

import { UserRole } from '@prisma/client';  // Use UserRole enum, NOT Role model

/**
 * Orchestration execution context
 * Contains all information needed to execute and track an orchestration workflow
 */
export interface OrchestrationContext {
  /** User who triggered the orchestration */
  user: {
    id: string;
    email: string;
    role: UserRole;  // Use UserRole enum type (not Role model)
    /**
     * Authorized party (client_id) claim — preserved across per-call mints for
     * forensic chain. May be undefined for X-API-Key auth (PAICHART_API_KEY
     * has no azp claim — known limit per v3.1 N-5).
     *
     * U2 Phase D site #17 (2026-05-19): `token` field DROPPED entirely.
     * Pre-Phase-D the Bearer token was carried through the orchestration
     * context for downstream Bearer-forwarding. Post-Phase-D, downstream
     * sites (api-client.js, service-caller.ts) mint per-call tokens with
     * per-service audience. The Bearer-forward path is REMOVED.
     */
    azp?: string;
  };
  /** Optional POV context for scoped workflows */
  pov?: {
    id: string;
    /** Tenant identifier (uses POV id until multi-tenancy is implemented) */
    tenantId: string;
  };
  /** Execution tracking information */
  execution: {
    /** Generated workflow ID for tracking */
    workflowId: string;
    /** When execution started */
    startedAt: Date;
    /** Unique request ID for tracing */
    requestId: string;
  };
}

/**
 * Build orchestration context from user and optional POV
 *
 * U2 Phase D site #17 (2026-05-19): `token` parameter DROPPED. Pre-Phase-D the
 * caller passed a Bearer token here for downstream forwarding; post-Phase-D
 * downstream sites mint per-call tokens with per-service audience. The `azp`
 * claim (Option α) flows through req.user.azp → setUserContext → context.user.azp
 * — populated by Phase E.5 at the auth middleware (mcp-server-http-clean.js).
 *
 * @param userId - User ID who triggered the orchestration
 * @param povId - Optional POV ID for scoped workflows
 * @returns Complete orchestration context
 */
export async function buildOrchestrationContext(
  userId: string,
  povId?: string
): Promise<OrchestrationContext> {
  const { prisma } = await import('@/lib/prisma');

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, role: true }
  });

  // azp is populated downstream by setUserContext for web-API workflow triggers;
  // for direct orchestration calls (no inbound HTTP), azp is undefined and
  // per-call mints get no azp claim (forensic-chain limit per v3.1 N-5).
  const user: OrchestrationContext['user'] = { ...dbUser };

  let pov = undefined;
  if (povId) {
    const povData = await prisma.pOV.findUnique({
      where: { id: povId },
      select: { id: true }
    });
    if (povData) {
      // Use POV id as tenantId until multi-tenancy is implemented
      pov = { id: povData.id, tenantId: povData.id };
    }
  }

  return {
    user,
    pov,
    execution: {
      workflowId: `mcp-orch-${Date.now()}`,
      startedAt: new Date(),
      requestId: crypto.randomUUID(),
    },
  };
}
