import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth';
import { TokenPayload } from '@/lib/types/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { trackActivity } from '@/lib/auth/audit';

const ArtifactCleanupSchema = z.object({
  keepLastNExecutions: z.coerce.number().int()
    .min(1, 'keepLastNExecutions must be at least 1')
    .max(1000, 'keepLastNExecutions cannot exceed 1000')
    .optional()
    .default(3),
  olderThanDays: z.coerce.number().int()
    .min(1, 'olderThanDays must be at least 1')
    .max(365, 'olderThanDays cannot exceed 365')
    .optional(),
});

/**
 * POST /api/admin/cleanup/artifacts
 * Manually trigger artifact cleanup
 * 
 * Body:
 * - keepLastNExecutions: number (default: 3)
 * - olderThanDays: number (optional, for age-based cleanup)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    let user: TokenPayload;
    try {
      user = await verifyAccessToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Only admins can trigger cleanup
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // ✅ SECURITY: Validate with Zod schema (range checks prevent deleting all artifacts)
    const body = await request.json();
    const validation = ArtifactCleanupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }
    const { keepLastNExecutions, olderThanDays } = validation.data;

    // Import resource manager
    const { mcpResourceManager } = await import('@/lib/services/mcp/resourceManager');

    let result;
    
    if (olderThanDays !== undefined) {
      // Age-based cleanup
      await mcpResourceManager.cleanupArtifactsByAge(olderThanDays);
      result = {
        message: `Cleaned up artifacts older than ${olderThanDays} days`,
        type: 'age-based'
      };
    } else {
      // Task-based cleanup
      await mcpResourceManager.cleanupArtifactsByTask(keepLastNExecutions);
      result = {
        message: `Cleaned up artifacts keeping last ${keepLastNExecutions} executions per task`,
        type: 'task-based'
      };
    }

    // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — destructive-operation audit (CRITICAL).
    // calculateDeleteSeverity classifier could be added later if we track row counts.
    void trackActivity(user.userId, 'ARTIFACT_CLEANUP', 'EXECUTE', {
      keepLastNExecutions,
      olderThanDays,
      type: result.type,
      success: true,
      source: 'admin',
    });

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ err: error }, 'Error during artifact cleanup');
    return NextResponse.json(
      { error: 'Failed to cleanup artifacts' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/cleanup/artifacts
 * Get cleanup status/configuration
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    let user: TokenPayload;
    try {
      user = await verifyAccessToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Only admins can view cleanup configuration
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get current statistics
    const { prisma } = await import('@/lib/prisma');
    
    const [totalArtifacts, totalExecutions, oldestArtifact] = await Promise.all([
      prisma.agentArtifact.count(),
      prisma.agentExecution.count(),
      prisma.agentArtifact.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      })
    ]);

    // Calculate storage size (approximate)
    const avgArtifactSize = 50000; // 50KB average
    const estimatedStorageMB = (totalArtifacts * avgArtifactSize) / (1024 * 1024);

    return NextResponse.json({
      statistics: {
        totalArtifacts,
        totalExecutions,
        oldestArtifactDate: oldestArtifact?.createdAt || null,
        estimatedStorageMB: Math.round(estimatedStorageMB * 100) / 100
      },
      cleanupSchedule: {
        taskBased: {
          enabled: true,
          interval: 'hourly',
          keepLastNExecutions: 3
        },
        ageBased: {
          enabled: true,
          interval: 'daily',
          olderThanDays: 30
        }
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting cleanup status');
    return NextResponse.json(
      { error: 'Failed to get cleanup status' },
      { status: 500 }
    );
  }
}