import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { mapRecommendationToActions } from '@/lib/services/mcp/recommendation-action-mapper';
import type { WorkflowStep } from '@/lib/services/mcp/recommendation-action-mapper';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'RecommendationPreview' });

type ApiHandler<T = unknown> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

/**
 * GET /api/mcp/recommendations/[id]/preview
 * Preview mapped actions for a recommendation without executing them.
 * Returns action descriptions, risk levels, and counts.
 */
const previewHandler: ApiHandler = async (
  _req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const { id } = context.params;

  // Fetch recommendation
  const recommendation = await prisma.mCPRecommendation.findUnique({
    where: { id },
    select: {
      id: true, povId: true, userId: true, toolId: true, title: true,
      actions: true, status: true, context: true, confidence: true,
      createdAt: true,
    },
  });
  if (!recommendation) {
    return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
  }

  // Access check — owner (userId), POV team member, or admin. Most recs carry a
  // null povId (user-scoped), so fall back to userId ownership; without this a
  // null-povId rec's content is readable by ANY authenticated user. NOT_FOUND on
  // deny (IDOR prevention). (2026-05-26 pentest round 2)
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
      // validatePOVAccess returns boolean when throwOnDeny=false (verified L74-78)
      hasAccess = validatePOVAccess(user, pov, { throwOnDeny: false, logContext: 'Preview Recommendation' });
    }
  }
  if (!hasAccess) {
    return { error: { message: 'Recommendation not found', code: 'NOT_FOUND' } };
  }

  // Guard: already implemented
  if (recommendation.status === 'IMPLEMENTED') {
    return { error: { message: 'Recommendation already implemented', code: 'ALREADY_IMPLEMENTED' } };
  }

  // Map actions (dry run — no execution)
  const actions = (recommendation.actions as unknown as WorkflowStep[]) || [];
  const mapped = mapRecommendationToActions(actions, recommendation.title);

  // Extract context fields
  const ctx = (recommendation.context as Record<string, unknown>) || {};

  log.info({ recommendationId: id, actionCount: mapped.actions.length }, 'Preview generated');

  return {
    data: {
      recommendationId: recommendation.id,
      title: recommendation.title,
      status: recommendation.status,
      confidence: recommendation.confidence || 0,
      actions: mapped.actions.map(a => ({
        type: a.type,
        description: a.description,
        riskLevel: a.riskLevel,
        requiresApproval: a.requiresApproval,
      })),
      overallRisk: mapped.overallRisk,
      requiresApproval: mapped.requiresApproval,
      summary: mapped.summary,
      counts: {
        total: mapped.actions.length,
        LOW: mapped.actions.filter(a => a.riskLevel === 'LOW').length,
        MEDIUM: mapped.actions.filter(a => a.riskLevel === 'MEDIUM').length,
        HIGH: mapped.actions.filter(a => a.riskLevel === 'HIGH').length,
      },
      expectedBenefits: (ctx.expectedBenefits as string[]) || [],
      estimatedTimeSavings: (ctx.estimatedTimeSavings as number) || 0,
      estimatedCostSavings: (ctx.estimatedCostSavings as number) || 0,
      generatedAt: recommendation.createdAt,
    },
  };
};

export const GET = createHandler(previewHandler, { requireAuth: true });
