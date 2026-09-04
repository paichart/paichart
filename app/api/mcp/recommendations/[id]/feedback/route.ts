import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { logCommentAdded } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { z } from 'zod';

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * POST /api/mcp/recommendations/[id]/feedback
 * Provide feedback on an implemented recommendation
 */
const recommendationFeedbackHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const { id } = context.params;
    const body = await req.json();
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return { error: { message: 'Invalid feedback: rating must be 1-5, comment max 2000 chars', code: 'VALIDATION_ERROR' } };
    }
    const { rating, comment } = parsed.data;

    mcpLogger.info({ recommendationId: id, userId: user.userId, rating }, 'Recommendation feedback received');

    // BC28 IDOR FIX: Verify recommendation exists and user has access
    const recommendation = await prisma.mCPRecommendation.findUnique({
      where: { id },
      select: { id: true, povId: true, userId: true, toolId: true }
    });
    if (!recommendation) {
      return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
    }
    // Access — owner (userId), POV team member, or admin. Most recs carry a null
    // povId (user-scoped); fall back to userId ownership so a null-povId rec isn't
    // open to feedback from any authenticated user. (IDOR fix 2026-05-26 round 2)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const isOwner = !!recommendation.userId && recommendation.userId === user.userId;
    let hasAccess = isOwner || isAdmin;
    if (!hasAccess && recommendation.povId) {
      const povAccess = await prisma.pOV.findFirst({
        where: { id: recommendation.povId, team: { members: { some: { userId: user.userId } } } },
        select: { id: true }
      });
      hasAccess = !!povAccess;
    }
    if (!hasAccess) {
      return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
    }

    // Create feedback record as an MCP interaction
    const feedbackId = `feedback-${id}-${Date.now()}`;
    
    await prisma.mCPInteraction.create({
      data: {
        id: feedbackId,
        toolId: recommendation.toolId,
        action: 'VALIDATE_DATA',
        request: {
          recommendationId: id,
          rating,
          comment,
          userId: user.userId
        },
        response: {
          status: 'feedback_recorded',
          rating,
          comment,
          timestamp: new Date().toISOString()
        },
        status: 'COMPLETED',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
    // Log feedback as a comment activity (includes rating and comment text)
    const feedbackText = `Recommendation feedback: Rating ${rating}/5${comment ? ` - ${comment}` : ''}`;
    const metadata: ActivityMetadata = { source: 'API' };
    logCommentAdded('system', user.userId, feedbackText, metadata);

    mcpLogger.debug({ recommendationId: id }, 'Rich activity logged for recommendation feedback');

    return {
      data: {
        success: true,
        recommendationId: id,
        feedbackId,
        rating,
        comment,
        message: 'Feedback recorded successfully! This helps improve our AI recommendations.',
        submittedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to record recommendation feedback');
    return {
      error: {
        message: 'Failed to record feedback',
        code: 'FEEDBACK_FAILED',
      },
    };
  }
};

export const POST = createHandler(recommendationFeedbackHandler, { requireAuth: true });
