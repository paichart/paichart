import { NextRequest, NextResponse } from "next/server"
import { stageValidationService } from "@/lib/pov/services/stageValidationService"
import { getAuthUser } from "@/lib/auth/get-auth-user"
import { validatePOVAccess } from "@/lib/auth/validate-pov-access"
import { prisma } from "@/lib/prisma"
import { StageStatus } from "@prisma/client"
import { logger } from '@/lib/logger'

/**
 * POST /api/stages/[stageId]/validate
 * 
 * OPTIMIZED ENDPOINT: Stage gate validation with caching
 * - Uses new aggregate query approach with intelligent caching
 * - Target response time: <75ms
 * - Pre-computed validation state with TTL-based cache
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { stageId: string } }
) {
  try {
    // Authentication validation
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { stageId } = params;
    
    if (!stageId) {
      return NextResponse.json(
        { error: "Stage ID is required" },
        { status: 400 }
      );
    }

    // Cross-tenant access check (2026-05-26 round 2): resolve the stage's POV
    // (stage → phase → pov) and verify the caller can access it. Without this any
    // authenticated user could validate / cache-invalidate another tenant's stage
    // by supplying an arbitrary stageId.
    const stageForAccess = await prisma.stage.findUnique({
      where: { id: stageId },
      select: { phase: { select: { pov: { select: {
        id: true, ownerId: true, metadata: true,
        team: { select: { members: { select: { userId: true } } } },
      } } } } },
    });
    if (!stageForAccess) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    const stageIsAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const hasStageAccess = validatePOVAccess(user, stageForAccess.phase.pov, { throwOnDeny: false, logContext: 'Stage Validate' });
    if (!hasStageAccess && !stageIsAdmin) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { targetStatus, invalidateCache = false } = body;

    // Validate target status
    if (!targetStatus || !['PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED'].includes(targetStatus)) {
      return NextResponse.json(
        { 
          error: "Invalid target status",
          validStatuses: Object.values(StageStatus)
        },
        { status: 400 }
      );
    }

    // Invalidate cache if requested
    if (invalidateCache) {
      await stageValidationService.invalidateValidationCache(stageId);
    }

    const startTime = Date.now();

    // Perform optimized validation
    const validationResult = await stageValidationService.validateStageGates(stageId, targetStatus);
    
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: validationResult,
      meta: {
        executionTime: `${executionTime}ms`,
        target: '<75ms',
        optimized: true,
        cacheInvalidated: invalidateCache
      }
    });

  } catch (error) {
    logger.error({ err: error, stageId: params.stageId }, 'POST /api/stages/[stageId]/validate error');
    
    return NextResponse.json(
      { 
        error: "Failed to validate stage",
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/stages/[stageId]/validate
 * 
 * Get current validation state without updating cache
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { stageId: string } }
) {
  try {
    // Authentication validation
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { stageId } = params;
    
    if (!stageId) {
      return NextResponse.json(
        { error: "Stage ID is required" },
        { status: 400 }
      );
    }

    // Cross-tenant access check (2026-05-26 round 2): see POST handler above.
    const stageForAccess = await prisma.stage.findUnique({
      where: { id: stageId },
      select: { phase: { select: { pov: { select: {
        id: true, ownerId: true, metadata: true,
        team: { select: { members: { select: { userId: true } } } },
      } } } } },
    });
    if (!stageForAccess) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
    const stageIsAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const hasStageAccess = validatePOVAccess(user, stageForAccess.phase.pov, { throwOnDeny: false, logContext: 'Stage Validate' });
    if (!hasStageAccess && !stageIsAdmin) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const targetStatus = url.searchParams.get('targetStatus') as StageStatus;

    if (!targetStatus || !['PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED'].includes(targetStatus)) {
      return NextResponse.json(
        { 
          error: "Invalid or missing target status",
          validStatuses: Object.values(StageStatus)
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Get validation state (will use cache if available)
    const validationResult = await stageValidationService.validateStageGates(stageId, targetStatus);
    
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: validationResult,
      meta: {
        executionTime: `${executionTime}ms`,
        target: '<75ms',
        optimized: true,
        cacheUsed: executionTime < 10 // Heuristic for cache usage
      }
    });

  } catch (error) {
    logger.error({ err: error, stageId: params.stageId }, 'GET /api/stages/[stageId]/validate error');
    
    return NextResponse.json(
      { 
        error: "Failed to get validation state",
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}