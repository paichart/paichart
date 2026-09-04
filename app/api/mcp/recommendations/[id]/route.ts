import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { mcpLogger } from '@/lib/logger';
import { z } from 'zod';

// Dismiss (REJECTED) is the live use case from the Automation tab's thumbs-down button;
// REVIEWED is allowed for parity with the implement path's terminal states.
const PatchSchema = z.object({
  status: z.enum(['REJECTED', 'REVIEWED']),
});

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * PATCH /api/mcp/recommendations/[id]
 * Update a recommendation's status — used by the dashboard's dismiss (thumbs-down) action
 * to set REJECTED. Dismissed recs are then filtered out of the list (and persistRecommendations
 * reuses the REJECTED row instead of regenerating a PENDING duplicate), so a dismissal sticks.
 */
const patchRecommendationHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  try {
    const { id } = context.params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return { error: { message: 'Invalid status: must be REJECTED or REVIEWED', code: 'VALIDATION_ERROR' } };
    }
    const { status } = parsed.data;

    // Verify the recommendation exists and the caller has access (mirrors the feedback route's
    // IDOR pattern: owner by userId, POV team member, or admin).
    const recommendation = await prisma.mCPRecommendation.findUnique({
      where: { id },
      select: { id: true, povId: true, userId: true },
    });
    if (!recommendation) {
      return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
    }

    // A dismiss is a write. For POV-scoped recs, gate on validatePOVAccess with
    // requireWrite:true (consistent with the implement route) — this also blocks isDemo
    // read-only users from mutating via this path. Most recs carry a null povId (user-scoped);
    // fall back to userId ownership / admin so a null-povId rec isn't open to anyone.
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const isOwner = !!recommendation.userId && recommendation.userId === user.userId;
    let hasAccess = isOwner || isAdmin;
    if (!hasAccess && recommendation.povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: recommendation.povId },
        select: {
          id: true, ownerId: true, metadata: true,
          team: { select: { members: { select: { userId: true } } } },
        },
      });
      if (pov) {
        hasAccess = validatePOVAccess(user, pov, {
          throwOnDeny: false,
          requireWrite: true,
          logContext: 'Dismiss Recommendation',
        });
      }
    }
    if (!hasAccess) {
      return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
    }

    await prisma.mCPRecommendation.update({
      where: { id },
      data: { status },
    });

    mcpLogger.info({ recommendationId: id, userId: user.userId, status }, 'Recommendation status updated');

    return { data: { success: true, recommendationId: id, status } };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to update recommendation status');
    return { error: { message: 'Failed to update recommendation', code: 'UPDATE_FAILED' } };
  }
};

export const PATCH = createHandler(patchRecommendationHandler, { requireAuth: true });
