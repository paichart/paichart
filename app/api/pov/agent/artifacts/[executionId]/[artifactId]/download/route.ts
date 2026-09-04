import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { UserRole, TokenPayload } from '@/lib/types/auth';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { safeContentDisposition } from '@/lib/utils/sanitize-filename';

/**
 * GET /api/pov/agent/artifacts/[executionId]/[artifactId]/download
 * Download an artifact
 */
export const GET = createHandler(
  async (req: NextRequest, context: { params: Record<string, string> }, user?: TokenPayload) => {
    const { executionId, artifactId } = context.params;

    // Fetch artifact WITH POV context for access validation
    const artifact = await prisma.agentArtifact.findFirst({
      where: {
        id: artifactId,
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
    });

    // Check if artifact exists
    if (!artifact) {
      return {
        error: {
          message: 'Artifact not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Validate POV access (throws ApiError on denial)
    const pov = artifact.execution?.task?.pov;

    if (!pov) {
      return {
        error: {
          message: 'Artifact has no associated POV',
          code: 'NOT_FOUND',
        },
      };
    }

    // Validate access with DEMO_USER support
    validatePOVAccess(user!, pov, {
      throwOnDeny: true,
      logContext: 'Artifact Download'
    });

    // Determine content type based on artifact type
    let contentType = 'application/octet-stream';
    if (artifact.type === 'application/json') {
      contentType = 'application/json';
    } else if (artifact.type === 'text/markdown') {
      contentType = 'text/markdown';
    } else if (artifact.type === 'text/plain') {
      contentType = 'text/plain';
    } else if (artifact.type === 'text/html') {
      // BC46 FIX: Serve LLM-generated HTML as markdown to prevent stored XSS
      // LLM output may contain <script> tags or event handlers — markdown renderers don't execute them
      contentType = 'text/markdown';
    }

    // Create response with appropriate headers
    // BC22 FIX: Sanitize filename to prevent CRLF header injection
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', safeContentDisposition(artifact.name, `artifact-${artifactId}`));

    // Return raw response with content
    return new Response(artifact.content, {
      headers,
    });
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
