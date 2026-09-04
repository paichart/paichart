import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { UserRole, TokenPayload } from '@/lib/types/auth';
import { AgentArtifact } from '@/lib/pov/api/agent-service';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';

/**
 * GET /api/pov/agent/artifacts/[executionId]
 * Get artifacts for an agent execution
 */
export const GET = createHandler(
  async (req: NextRequest, context: { params: Record<string, string> }, user?: TokenPayload) => {
    const { executionId } = context.params;

    // Fetch artifacts WITH POV context for access validation
    const artifacts = await prisma.agentArtifact.findMany({
      where: {
        executionId,
      },
      include: {
        execution: {
          include: {
            task: {
              include: {
                pov: {
                  select: {
                    id: true,
                    ownerId: true,
                    metadata: true,
                    team: {
                      include: {
                        members: {
                          include: {
                            user: { select: { id: true } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Validate POV access (throws ApiError on denial)
    if (artifacts.length > 0) {
      const pov = artifacts[0]?.execution?.task?.pov;

      if (!pov) {
        return {
          error: {
            message: 'Artifact execution has no associated POV',
            code: 'NOT_FOUND',
          },
        };
      }

      // Validate access with DEMO_USER support
      validatePOVAccess(user!, pov, {
        throwOnDeny: true,
        logContext: 'Artifact List Access'
      });
    }

    // Return artifacts (access granted)
    const response: AgentArtifact[] = artifacts.map((artifact: any) => ({
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      content: artifact.content,
      createdAt: artifact.createdAt.toISOString(),
    }));

    return { data: response };
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
