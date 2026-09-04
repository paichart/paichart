import { TokenPayload, UserRole } from '@/lib/types/auth';
import { ApiError } from '@/lib/errors';
import { authLogger } from '@/lib/logger';

/**
 * POV access context - minimal required fields for validation
 */
export interface POVAccessContext {
  id?: string; // Optional: for logging/auditing
  ownerId: string;
  metadata?: any;
  team?: {
    members?: Array<{ userId?: string; user?: { id: string } }>;
  } | null; // Allow null from Prisma queries
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Throw ApiError on access denial (default: false) */
  throwOnDeny?: boolean;
  /** Context for logging (default: 'POV Access') */
  logContext?: string;
  /** Include detailed access breakdown in logs (default: true) */
  detailedLogging?: boolean;
  /** Enable security audit logging (default: from env SECURITY_AUDIT_ENABLED) */
  enableAudit?: boolean;
  /**
   * When true, the DEMO_USER `isDemo` flag does NOT grant access — write
   * operations require owner/team/admin. Default false (reads: isDemo grants).
   * 2026-05-26 demo-write fix (Protocol-2 reviewed). Set by `withPOVAccess`
   * (method-derived) and by write handlers; CI gate enforces coverage.
   */
  requireWrite?: boolean;
}

/**
 * Access validation result (when throwOnDeny = false)
 */
export interface AccessValidationResult {
  hasAccess: boolean;
  reason?: string;
  breakdown: {
    isAdmin: boolean;
    isOwner: boolean;
    isTeamMember: boolean;
    isDemo: boolean;
    isSameTenant: boolean;
  };
}

/**
 * Validates POV access using additive filtering (owned + team + demo/tenant)
 *
 * Supports both DEMO_USER (isDemo) and multi-tenant (tenantId) patterns.
 *
 * @param user - Authenticated user from token
 * @param pov - POV access context (ownerId, metadata, team)
 * @param options - Validation options (throwOnDeny, logContext, etc.)
 * @returns boolean if throwOnDeny=false, void if throwOnDeny=true
 * @throws ApiError if access denied and throwOnDeny=true
 *
 * @example
 * // Throw on denial (API handlers)
 * validatePOVAccess(user, pov, { throwOnDeny: true, logContext: 'POV Get' });
 *
 * @example
 * // Return boolean (service layer)
 * const hasAccess = validatePOVAccess(user, pov);
 * if (!hasAccess) {
 *   return { error: 'Access denied' };
 * }
 */
export function validatePOVAccess(
  user: TokenPayload,
  pov: POVAccessContext,
  options: ValidationOptions & { throwOnDeny: true }
): void;

export function validatePOVAccess(
  user: TokenPayload,
  pov: POVAccessContext,
  options?: ValidationOptions & { throwOnDeny?: false }
): boolean;

export function validatePOVAccess(
  user: TokenPayload,
  pov: POVAccessContext,
  options: ValidationOptions = {}
): boolean | void {
  const {
    throwOnDeny = false,
    logContext = 'POV Access',
    detailedLogging = true,
    enableAudit = process.env.SECURITY_AUDIT_ENABLED === 'true',
    requireWrite = false
  } = options;

  // Performance monitoring start
  const startTime = Date.now();

  // 1. Defensive null checks: Check ownership
  const isOwner = pov?.ownerId === user?.userId;

  // 2. Defensive null checks: Check team membership
  // BC: Support both flat (member.userId) and nested (member.user.id) patterns
  // Canonical pattern is flat userId (from Prisma TeamMember.userId field)
  // Nested pattern exists for queries that include the user relation
  const teamMembers = pov?.team?.members ?? [];
  // BC SAFETY: Log if members exist but lack the canonical userId field
  if (Array.isArray(teamMembers) && teamMembers.length > 0 &&
      teamMembers.some((member: any) => member?.userId === undefined)) {
    authLogger.warn({ povId: pov?.id, memberCount: teamMembers.length, boundary: 'TeamMember → validatePOVAccess' },
      'Team members loaded without userId field — falling back to member.user.id');
  }
  const isTeamMember = Array.isArray(teamMembers) && teamMembers.length > 0 &&
    teamMembers.some((member: any) =>
      member?.userId === user?.userId || member?.user?.id === user?.userId
    );

  // 3. Check isDemo flag (current pattern)
  const isDemo = pov?.metadata &&
    typeof pov.metadata === 'object' &&
    'isDemo' in pov.metadata &&
    pov.metadata.isDemo === true;

  // 4. Check tenantId (future multi-tenant pattern - prepared but not enforced)
  const isSameTenant = user?.tenantId &&
    pov?.metadata &&
    typeof pov.metadata === 'object' &&
    'tenantId' in pov.metadata &&
    pov.metadata.tenantId === user.tenantId;

  // 5. Admin override
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  // 6. DEMO_USER-specific validation (owned + team + demo)
  if (user?.role === UserRole.DEMO_USER) {
    // 2026-05-26 demo-write fix: isDemo grants READ only. For writes
    // (requireWrite), a demo user needs to genuinely own or be a team member.
    const demoHasAccess = requireWrite ? (isOwner || isTeamMember) : (isOwner || isTeamMember || isDemo);

    if (!demoHasAccess) {
      const errorMsg = 'Access denied - you do not have access to this POV';
      authLogger.warn({ userId: user.userId, role: user.role, povId: pov?.id, context: logContext }, 'DEMO_USER access denied');

      // Security audit logging
      if (enableAudit) {
        logSecurityAudit({
          timestamp: new Date().toISOString(),
          userId: user.userId,
          role: user.role,
          resourceType: 'POV',
          resourceId: pov?.id,
          accessGranted: false,
          accessPath: { isOwner, isTeamMember, isDemo, isSameTenant: false, requireWrite },
          context: logContext
        });
      }

      if (throwOnDeny) {
        throw new ApiError('FORBIDDEN', errorMsg);
      }
      return false;
    }

    if (detailedLogging) {
      authLogger.debug({ userId: user.userId, isOwner, isTeamMember, isDemo, context: logContext }, 'DEMO_USER access granted');
    }

    // Security audit logging (success)
    if (enableAudit) {
      logSecurityAudit({
        timestamp: new Date().toISOString(),
        userId: user.userId,
        role: user.role,
        resourceType: 'POV',
        resourceId: pov?.id,
        accessGranted: true,
        accessPath: { isOwner, isTeamMember, isDemo, isSameTenant: false },
        context: logContext
      });
    }

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > 50) {
      authLogger.warn({ durationMs: duration, context: logContext }, 'slow POV validation');
    }

    return throwOnDeny ? undefined : true;
  }

  // 7. Calculate final access (admin OR owned OR team OR tenant)
  // SECURITY: isDemo only applies to DEMO_USER role (handled in block 6 above).
  // Standard users must NOT gain access via isDemo flag — it's for demo accounts only.
  const hasAccess = isAdmin || isOwner || isTeamMember || isSameTenant;

  // 8. Log access check
  if (detailedLogging) {
    authLogger.debug({ isAdmin, isOwner, isTeamMember, isDemo, isSameTenant, hasAccess, context: logContext }, 'POV access check');
  }

  // 9. Handle access denial
  if (!hasAccess) {
    authLogger.warn({ userId: user?.userId, povId: pov?.id, context: logContext }, 'POV access denied');

    // Security audit logging
    if (enableAudit) {
      logSecurityAudit({
        timestamp: new Date().toISOString(),
        userId: user?.userId,
        role: user?.role,
        resourceType: 'POV',
        resourceId: pov?.id,
        accessGranted: false,
        accessPath: { isOwner, isTeamMember, isDemo, isSameTenant },
        context: logContext
      });
    }

    if (throwOnDeny) {
      throw new ApiError('FORBIDDEN', 'Access denied');
    }
    return false;
  }

  // Security audit logging (success)
  if (enableAudit) {
    logSecurityAudit({
      timestamp: new Date().toISOString(),
      userId: user?.userId,
      role: user?.role,
      resourceType: 'POV',
      resourceId: pov?.id,
      accessGranted: true,
      accessPath: { isOwner, isTeamMember, isDemo, isSameTenant },
      context: logContext
    });
  }

  // Performance monitoring
  const duration = Date.now() - startTime;
  if (duration > 50) {
    authLogger.warn({ durationMs: duration, context: logContext }, 'slow POV validation');
  }

  return throwOnDeny ? undefined : true;
}

/**
 * Extended validation with detailed result
 * Useful for debugging and analytics
 */
export function validatePOVAccessDetailed(
  user: TokenPayload,
  pov: POVAccessContext,
  options: ValidationOptions = {}
): AccessValidationResult {
  const { logContext = 'POV Access', requireWrite = false } = options;

  // Defensive null checks
  const isOwner = pov?.ownerId === user?.userId;
  const teamMembers = pov?.team?.members ?? [];
  // BC SAFETY: Reuse same dual-pattern with canonical userId preference
  const isTeamMember = Array.isArray(teamMembers) && teamMembers.length > 0 &&
    teamMembers.some((member: any) =>
      member?.userId === user?.userId || member?.user?.id === user?.userId
    );
  const isDemo = pov?.metadata?.isDemo === true;
  const isSameTenant = !!(user?.tenantId && pov?.metadata?.tenantId === user.tenantId);
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  // SECURITY: isDemo only applies to DEMO_USER role (standard users must not access demo POVs)
  const isDemoUser = user?.role === UserRole.DEMO_USER;
  const hasAccess = isAdmin || isOwner || isTeamMember || (isDemoUser && isDemo && !requireWrite) || isSameTenant;

  const result: AccessValidationResult = {
    hasAccess,
    breakdown: {
      isAdmin,
      isOwner,
      isTeamMember,
      isDemo: isDemoUser && isDemo,
      isSameTenant
    }
  };

  if (!hasAccess) {
    result.reason = 'User does not meet any access criteria (admin, owner, team, demo, or tenant)';
  }

  authLogger.debug({ ...result.breakdown, hasAccess: result.hasAccess, context: logContext }, 'detailed POV access check');

  return result;
}

/**
 * Security audit logging helper
 * Can be extended to send to external security monitoring service
 */
function logSecurityAudit(auditData: {
  timestamp: string;
  userId?: string;
  role?: string;
  resourceType: string;
  resourceId?: string;
  accessGranted: boolean;
  accessPath: {
    isOwner: boolean;
    isTeamMember: boolean;
    isDemo: boolean;
    isSameTenant: boolean;
    requireWrite?: boolean;  // 2026-05-26: distinguishes denied write vs read in forensics
  };
  context: string;
}) {
  // Structured security audit log (parsed by log aggregators)
  authLogger.info({ audit: auditData }, 'security audit');

  // TODO: Send to external security monitoring service if configured
  // Example: await securityAudit.logAccess(auditData);
}

// ========================================
// POV Access Middleware Wrapper
// Added: 2025-11-06 (Week 4 P3 - Complete coverage)
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { POV } from '@prisma/client';

/**
 * POV Route Handler Type
 *
 * Handler receives validated user and pov in context
 */
import { TeamRole } from '@prisma/client';

type POVRouteHandler = (
  request: NextRequest,
  context: {
    params: { povId: string; [key: string]: string };
    user: TokenPayload;
    pov: POV & {
      team?: {
        members: Array<{
          id: string;
          userId: string;
          role: TeamRole;
        }>;
      } | null;
    };
  }
) => Promise<NextResponse>;

/**
 * withPOVAccess Middleware — wraps POV route handlers with auth + POV load +
 * access enforcement (validatePOVAccess) + context injection (user, pov).
 * 2026-05-26 demo-write fix: derives requireWrite from request.method, so non-GET
 * routes deny the isDemo grant (write needs owner/team/admin).
 *
 * @param handler - Route handler with validated context (user, pov)
 * @returns Next.js route handler
 */
export function withPOVAccess(handler: POVRouteHandler) {
  return async (
    request: NextRequest,
    { params }: { params: { povId: string; [key: string]: string } }
  ): Promise<NextResponse> => {
    try {
      // 1. Authentication
      const user = await getAuthUser(request);
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
          { status: 401 }
        );
      }

      // 2. Validate povId parameter exists
      if (!params.povId) {
        return NextResponse.json(
          { error: 'POV ID is required', code: 'MISSING_POV_ID' },
          { status: 400 }
        );
      }

      // 3. Load POV with team members (single query, optimized)
      const pov = await prisma.pOV.findUnique({
        where: { id: params.povId },
        include: {
          team: {
            include: {
              members: {
                select: {
                  id: true,
                  userId: true,
                  role: true,
                }
              }
            }
          }
        }
      });

      if (!pov) {
        return NextResponse.json(
          { error: 'POV not found', code: 'POV_NOT_FOUND' },
          { status: 404 }
        );
      }

      // 4. Tenant isolation enforcement
      // ✅ REUSES existing validatePOVAccess function (no code duplication!)
      try {
        validatePOVAccess(user, pov, {
          throwOnDeny: true,
          // 2026-05-26 demo-write fix (chokepoint #1): derive write-ness from the
          // HTTP method so every current AND future withPOVAccess route is
          // auto-classified — GET/HEAD/OPTIONS = read (isDemo grants); anything
          // else = write (isDemo does NOT grant; needs owner/team/admin).
          requireWrite: !['GET', 'HEAD', 'OPTIONS'].includes(request.method),
          logContext: `withPOVAccess [${request.method} ${request.nextUrl.pathname}]`,
          enableAudit: true,
          detailedLogging: process.env.NODE_ENV === 'development'
        });
      } catch (error) {
        // Access denied (already logged by validatePOVAccess)
        return NextResponse.json(
          {
            error: 'Access denied',
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to access this POV'
          },
          { status: 403 }
        );
      }

      // 5. Execute handler with validated context
      return await handler(request, { params, user, pov });

    } catch (error) {
      authLogger.error({ err: error, povId: params.povId, path: request.nextUrl.pathname }, 'withPOVAccess middleware error');

      return NextResponse.json(
        {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'development'
            ? error instanceof Error ? error.message : 'Unknown error'
            : 'An error occurred processing your request'
        },
        { status: 500 }
      );
    }
  };
}

// ========================================
// MCP Tool POV Access Validation
// Added: 2025-12-15 (Phase 7 - Security Gap Fix)
// ========================================

/**
 * Validates POV access for MCP tools
 *
 * Simplified helper that fetches user and POV, then validates access.
 * Designed for use in MCP tools where only userId and povId are available.
 *
 * @param userId - User ID from MCP context (may be undefined for system operations)
 * @param povId - POV ID to validate access for
 * @param options - Validation options
 * @returns Promise<boolean> - true if access granted, false if denied
 *
 * @example
 * // In MCP tool execution
 * const hasAccess = await validateMCPPOVAccess(context.userId, input.povId);
 * if (!hasAccess) {
 *   throw new Error('Access denied: insufficient POV permissions');
 * }
 */
export async function validateMCPPOVAccess(
  userId: string | undefined,
  povId: string,
  options: {
    logContext?: string;
    allowSystemAccess?: boolean;  // Allow operations when userId is undefined
    requireWrite?: boolean;  // 2026-05-26 demo-write fix: forwarded to validatePOVAccess (isDemo read-only on writes)
  } = {}
): Promise<boolean> {
  const { logContext = 'MCP POV Access', allowSystemAccess = false, requireWrite = false } = options;

  // If no userId, check if system access is allowed
  if (!userId) {
    if (allowSystemAccess) {
      authLogger.debug({ context: logContext }, 'system access granted (no userId)');
      return true;
    }
    authLogger.warn({ context: logContext }, 'MCP access denied: no userId provided');
    return false;
  }

  try {
    // Fetch user to get role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationDomain: true  // tenantId derived from organizationDomain
      }
    });

    if (!user) {
      authLogger.warn({ userId, context: logContext }, 'MCP access denied: user not found');
      return false;
    }

    // Fetch POV with team for access check
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        ownerId: true,
        metadata: true,
        team: {
          select: {
            members: {
              select: {
                userId: true,
                user: { select: { id: true } }
              }
            }
          }
        }
      }
    });

    if (!pov) {
      authLogger.warn({ povId, context: logContext }, 'MCP access denied: POV not found');
      return false;
    }

    // Construct TokenPayload from user
    // Note: tenantId is derived from organizationDomain in multi-tenant setup
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      tenantId: user.organizationDomain || undefined
    };

    // Use existing validatePOVAccess (returns boolean when throwOnDeny=false)
    const hasAccess = validatePOVAccess(tokenPayload, pov, {
      throwOnDeny: false,
      logContext,
      detailedLogging: true,
      requireWrite
    });

    return hasAccess;
  } catch (error) {
    authLogger.error({ err: error, userId, povId, context: logContext }, 'MCP POV access validation error');
    return false;
  }
}
