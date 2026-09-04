import { NextRequest, NextResponse } from "next/server"
import { phaseProgressService } from "@/lib/pov/services/phaseProgressService"
import { stageValidationService } from "@/lib/pov/services/stageValidationService"
import { getAuthUser } from "@/lib/auth/get-auth-user"
import { logger } from '@/lib/logger'

/**
 * GET /api/performance/phase-stage-health
 * 
 * Health check endpoint for Phase 1 optimization tasks 11-12
 * Tests performance of optimized phaseProgressService and stageValidationService
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication (admin only for performance monitoring)
    const user = await getAuthUser(request);
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const overallStartTime = Date.now();

    // Test Task 11: phaseProgressService performance
    logger.info('HealthCheck testing Task 11: phaseProgressService');
    const progressHealthStart = Date.now();
    const progressHealth = await phaseProgressService.healthCheck();
    const progressHealthTime = Date.now() - progressHealthStart;

    // Test Task 12: stageValidationService performance
    logger.info('HealthCheck testing Task 12: stageValidationService');
    const validationHealthStart = Date.now();
    const validationHealth = await stageValidationService.healthCheck();
    const validationHealthTime = Date.now() - validationHealthStart;

    const overallExecutionTime = Date.now() - overallStartTime;

    // Overall health assessment
    const overallStatus = 
      progressHealth.status === 'healthy' && validationHealth.status === 'healthy' ? 'healthy' :
      progressHealth.status === 'unhealthy' || validationHealth.status === 'unhealthy' ? 'unhealthy' :
      'degraded';

    const healthReport = {
      success: true,
      overall: {
        status: overallStatus,
        executionTime: `${overallExecutionTime}ms`,
        timestamp: new Date().toISOString()
      },
      tasks: {
        task11_phaseProgress: {
          description: "Optimize calculatePhaseProgress() with GROUP BY queries",
          target: "500ms → 100ms",
          status: progressHealth.status,
          performance: {
            averageExecutionTime: `${progressHealth.averageExecutionTime}ms`,
            target: "100ms",
            healthCheckTime: `${progressHealthTime}ms`,
            meetingTarget: progressHealth.averageExecutionTime <= 100
          },
          lastCheck: progressHealth.lastCheck,
          optimization: "✅ Aggregate queries with GROUP BY implemented"
        },
        task12_stageValidation: {
          description: "Optimize validateStageGates() with caching",
          target: "300ms → 75ms", 
          status: validationHealth.status,
          performance: {
            averageExecutionTime: `${validationHealth.averageExecutionTime}ms`,
            target: "75ms",
            healthCheckTime: `${validationHealthTime}ms`,
            meetingTarget: validationHealth.averageExecutionTime <= 75,
            cacheHitRate: `${Math.round(validationHealth.cacheHitRate * 100)}%`
          },
          lastCheck: validationHealth.lastCheck,
          optimization: "✅ Pre-computed validation state with intelligent caching"
        }
      },
      features: {
        phaseProgressService: {
          optimizations: [
            "Single GROUP BY query replaces N+1 individual queries",
            "Bulk POV progress calculation for dashboard views",
            "Performance logging and automatic fallback",
            "Health monitoring and metrics tracking"
          ],
          apis: [
            "GET /api/pov/[povId]/progress",
            "GET /api/pov/[povId]/progress?summary=true",
            "GET /api/pov/[povId]/progress?includePhases=false"
          ]
        },
        stageValidationService: {
          optimizations: [
            "Comprehensive validation in single aggregate query",
            "TTL-based intelligent caching (5min default)",
            "Bulk stage validation for multi-stage operations",
            "Cache invalidation strategies and maintenance"
          ],
          apis: [
            "POST /api/stages/[stageId]/validate",
            "GET /api/stages/[stageId]/validate?targetStatus=COMPLETED",
            "POST /api/stages/validate/bulk"
          ]
        }
      },
      recommendations: generateRecommendations(progressHealth, validationHealth)
    };

    return NextResponse.json(healthReport);

  } catch (error) {
    logger.error({ err: error }, 'HealthCheck performance health check failed');
    
    return NextResponse.json({
      success: false,
      error: "Health check failed",
      details: 'See server logs for details',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

function generateRecommendations(
  progressHealth: any, 
  validationHealth: any
): string[] {
  const recommendations: string[] = [];

  // Performance recommendations
  if (progressHealth.averageExecutionTime > 100) {
    recommendations.push("🔍 Phase progress calculation exceeding target time - consider database indexing");
  }

  if (validationHealth.averageExecutionTime > 75) {
    recommendations.push("🔍 Stage validation exceeding target time - review query optimization");
  }

  if (validationHealth.cacheHitRate < 0.7) {
    recommendations.push("📈 Low cache hit rate - consider increasing cache TTL or reviewing invalidation strategy");
  }

  // Status-based recommendations
  if (progressHealth.status === 'unhealthy' || validationHealth.status === 'unhealthy') {
    recommendations.push("🚨 Critical: Service unhealthy - immediate investigation required");
    recommendations.push("🔄 Consider using fallback implementations temporarily");
  } else if (progressHealth.status === 'degraded' || validationHealth.status === 'degraded') {
    recommendations.push("⚠️ Performance degraded - monitor closely and consider optimization");
  }

  // Success recommendations
  if (recommendations.length === 0) {
    recommendations.push("✅ All systems performing within target parameters");
    recommendations.push("📊 Consider monitoring trends over time for proactive optimization");
  }

  return recommendations;
}