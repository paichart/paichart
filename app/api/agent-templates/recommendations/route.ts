import { NextRequest, NextResponse } from 'next/server';
import { AgentTemplateService } from '../../../../lib/services/agentTemplateService';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { logger } from '@/lib/logger';

/**
 * GET /api/agent-templates/recommendations
 * Get recommended agent templates for a task
 *
 * Security: Requires authentication (P0 fix - Nov 8, 2025)
 */
export async function GET(request: NextRequest) {
  try {
    // ✅ P0 FIX: Authentication required (Issue #1)
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required'
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const taskId = searchParams.get('taskId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10) || 5, 50);

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Task ID is required'
        },
        { status: 400 }
      );
    }

    // Get recommended templates for the task
    const recommendations = await AgentTemplateService.getRecommendedTemplates(taskId, limit);

    // Add recommendation scores and reasons
    const enhancedRecommendations = recommendations.map((template, index) => ({
      ...template,
      recommendation: {
        score: Math.max(0, 100 - (index * 10)), // Simple scoring based on order
        rank: index + 1,
        reasons: [
          template.category === 'GENERAL' ? 'Versatile template suitable for most tasks' : `Specialized for ${template.category.toLowerCase()} tasks`,
          template.successRate && template.successRate > 80 ? 'High success rate' : 'Proven reliability',
          template.usageCount > 10 ? 'Popular choice among users' : 'Well-tested template',
          template.isDefault ? 'Recommended default template' : 'Optimized performance'
        ].slice(0, 2), // Show top 2 reasons
        compatibility: template.category === 'GENERAL' ? 'High' : 'Medium',
        estimatedTime: template.averageTime || 60
      }
    }));

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        recommendations: enhancedRecommendations,
        total: enhancedRecommendations.length
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplate Recommendations API GET error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get template recommendations'
      },
      { status: 500 }
    );
  }
}
