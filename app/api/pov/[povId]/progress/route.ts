import { NextRequest, NextResponse } from "next/server"
import { phaseProgressService } from "@/lib/pov/services/phaseProgressService"
import { withPOVAccess } from "@/lib/auth/validate-pov-access"
import { povLogger } from "@/lib/logger"

/**
 * GET /api/pov/[povId]/progress
 *
 * OPTIMIZED ENDPOINT: Phase progress calculation
 * - Uses new aggregate query approach
 * - Target response time: <100ms
 * - Replaces N+1 query pattern with single GROUP BY query
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅
    const { povId } = params;

    // Get query parameters
    const url = new URL(request.url);
    const includePhases = url.searchParams.get('includePhases') !== 'false';
    const summary = url.searchParams.get('summary') === 'true';

    const startTime = Date.now();

    if (summary) {
      // Return comprehensive POV progress summary
      const progressSummary = await phaseProgressService.calculatePOVProgress(povId);
      
      const executionTime = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        data: progressSummary,
        meta: {
          executionTime: `${executionTime}ms`,
          target: '<100ms',
          optimized: true,
          cacheUsed: false // TODO: Add caching if needed
        }
      });
    } else if (includePhases) {
      // Return detailed phase progress metrics
      const phaseMetrics = await phaseProgressService.calculatePhaseProgress(povId);
      
      const executionTime = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        data: {
          povId,
          phases: phaseMetrics,
          overall: {
            total: phaseMetrics.reduce((sum, p) => sum + p.total, 0),
            completed: phaseMetrics.reduce((sum, p) => sum + p.completed, 0),
            percentage: phaseMetrics.length > 0 
              ? Math.round(phaseMetrics.reduce((sum, p) => sum + (p.percentage * p.total), 0) / phaseMetrics.reduce((sum, p) => sum + p.total, 0) || 0)
              : 0
          }
        },
        meta: {
          executionTime: `${executionTime}ms`,
          target: '<100ms',
          optimized: true,
          phasesCount: phaseMetrics.length
        }
      });
    } else {
      // Return basic progress metrics only
      const phaseMetrics = await phaseProgressService.calculatePhaseProgress(povId);
      
      const overall = phaseMetrics.reduce((acc, phase) => ({
        total: acc.total + phase.total,
        completed: acc.completed + phase.completed,
        inProgress: acc.inProgress + phase.inProgress,
        open: acc.open + phase.open,
        blocked: acc.blocked + phase.blocked
      }), { total: 0, completed: 0, inProgress: 0, open: 0, blocked: 0 });

      const percentage = overall.total > 0 ? Math.round((overall.completed / overall.total) * 100) : 0;
      
      const executionTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        data: {
          povId,
          overall: { ...overall, percentage },
          phasesCount: phaseMetrics.length
        },
        meta: {
          executionTime: `${executionTime}ms`,
          target: '<100ms',
          optimized: true
        }
      });
    }

  } catch (error) {
    povLogger.error({ err: error, povId: params.povId }, 'POV progress error');

    return NextResponse.json(
      {
        error: "Failed to calculate progress",
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
});