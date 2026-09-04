import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/auth';
import { TokenPayload } from '@/lib/types/auth';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { safeContentDisposition } from '@/lib/utils/sanitize-filename';
import { logger } from '@/lib/logger';

/**
 * GET /api/artifacts/[id]/download
 * Download an agent artifact
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const artifactId = params.id;

    // Get artifact from database with POV context for access validation
    const artifact = await prisma.agentArtifact.findUnique({
      where: { id: artifactId },
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
      }
    });

    if (!artifact) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      );
    }

    // Check access permissions using shared validation utility
    const task = artifact.execution.task;
    const pov = task?.pov;

    if (!pov) {
      return NextResponse.json(
        { error: 'Artifact has no associated POV' },
        { status: 404 }
      );
    }

    // Use shared validation utility with DEMO_USER support
    try {
      validatePOVAccess(user, pov, {
        throwOnDeny: true,
        logContext: 'Artifact Download (Direct)'
      });
    } catch (error) {
      // validatePOVAccess throws ApiError, convert to NextResponse
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Determine content type
    const contentType = getContentType(artifact.type);
    
    // Determine filename
    const filename = artifact.name || `artifact-${artifact.id}.${getFileExtension(artifact.type)}`;

    // Create response with appropriate headers
    const response = new NextResponse(artifact.content);

    // Set headers for download
    // BC22 FIX: Sanitize filename to prevent CRLF header injection
    response.headers.set('Content-Type', contentType);
    response.headers.set('Content-Disposition', safeContentDisposition(filename, `artifact-${artifact.id}`));
    response.headers.set('Content-Length', artifact.content.length.toString());
    
    // Cache for 1 hour — BC40 FIX: Add Vary: Authorization to prevent cross-user cache poisoning
    response.headers.set('Cache-Control', 'private, max-age=3600');
    response.headers.set('Vary', 'Authorization');
    
    // BC22 + BC54 FIX: CORS with trusted origin check (uses APP_BASE_URL, not spoofable Host header)
    const origin = request.headers.get('origin');
    const trustedOrigin = (process.env.APP_BASE_URL || 'https://paichart.app').toLowerCase();
    if (origin && origin.toLowerCase() === trustedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;

  } catch (error) {
    logger.error({ err: error, artifactId: params.id }, 'Error downloading artifact');
    return NextResponse.json(
      { error: 'Failed to download artifact' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/artifacts/[id]/download
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });

  // BC22 + BC54 FIX: CORS with trusted origin check (uses APP_BASE_URL, not spoofable Host header)
  const origin = request.headers.get('origin');
  const trustedOrigin = (process.env.APP_BASE_URL || 'https://paichart.app').toLowerCase();
  if (origin && origin.toLowerCase() === trustedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  return response;
}

/**
 * Get content type from artifact type
 */
function getContentType(artifactType: string): string {
  const typeMap: Record<string, string> = {
    'json': 'application/json',
    'text': 'text/plain',
    'markdown': 'text/markdown',
    'html': 'text/plain', // BC58 FIX: Serve as text/plain to prevent XSS (was text/html)
    'xml': 'text/xml',
    'csv': 'text/csv',
    'pdf': 'application/pdf',
    'image': 'image/png',
    'code': 'text/plain',
    'log': 'text/plain',
    'yaml': 'text/yaml',
    'sql': 'text/plain',
    'result.json': 'application/json',
    'report.md': 'text/markdown'
  };
  
  return typeMap[artifactType.toLowerCase()] || 'application/octet-stream';
}

/**
 * Get file extension from artifact type
 */
function getFileExtension(artifactType: string): string {
  const extensionMap: Record<string, string> = {
    'json': 'json',
    'text': 'txt',
    'markdown': 'md',
    'html': 'html',
    'xml': 'xml',
    'csv': 'csv',
    'pdf': 'pdf',
    'image': 'png',
    'code': 'txt',
    'log': 'log',
    'yaml': 'yaml',
    'sql': 'sql',
    'result.json': 'json',
    'report.md': 'md'
  };
  
  return extensionMap[artifactType.toLowerCase()] || 'bin';
}