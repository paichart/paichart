import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { downloadRateLimiter } from '@/lib/utils/rate-limiter';
import { safeContentDisposition } from '@/lib/utils/sanitize-filename';
import { logger } from '@/lib/logger';

// Signing key - required for security in production
const SIGNING_KEY = process.env.ARTIFACT_SIGNING_KEY || (
  process.env.NODE_ENV === 'development' 
    ? 'paichart-artifact-download-key-dev' 
    : ''
);

// Fail loud in production — but at REQUEST time, not import time. `next build` runs with
// NODE_ENV=production and imports every route while "collecting page data"; a throw here made
// `npm run build` impossible on any install without the key (found by the 2026-09-04 self-host
// gate on the public export). Prod always has the key, so the behaviour there is unchanged.
function assertSigningKeyConfigured(): NextResponse | null {
  if (!SIGNING_KEY && process.env.NODE_ENV === 'production') {
    logger.error('ARTIFACT_SIGNING_KEY environment variable is required in production');
    return NextResponse.json({ error: 'Artifact download service is not properly configured' }, { status: 500 });
  }
  return null;
}

// Verify a signed URL token
function verifyDownloadToken(token: string, artifactId: string): boolean {
  try {
    if (!SIGNING_KEY) return false;
    
    const decoded = Buffer.from(token, 'base64url').toString();
    const [id, expiresStr, signature] = decoded.split(':');
    
    if (id !== artifactId) return false;
    
    const expires = parseInt(expiresStr, 10);
    // BC3 FIX: NaN comparison is always false — attacker could bypass expiration
    if (isNaN(expires) || Date.now() > expires) return false;
    
    const payload = `${id}:${expiresStr}`;
    const expectedSignature = crypto
      .createHmac('sha256', SIGNING_KEY)
      .update(payload)
      .digest('hex');
    
    // BC16 defense: timing-safe comparison prevents signature brute-force via timing side-channel
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * GET /api/artifacts/[id]/public-download
 * Download artifact with signed URL token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const misconfigured = assertSigningKeyConfigured();
  if (misconfigured) return misconfigured;
  try {
    const artifactId = params.id;
    const token = request.nextUrl.searchParams.get('token');
    
    // Verify token
    if (!token || !verifyDownloadToken(token, artifactId)) {
      return NextResponse.json(
        { error: 'Invalid or expired download link' },
        { status: 401 }
      );
    }
    
    // Rate limiting - use token as identifier to prevent abuse
    const rateLimitKey = `download:${token.substring(0, 20)}`; // Use first 20 chars of token
    const allowed = await downloadRateLimiter.checkLimit(rateLimitKey);
    
    if (!allowed) {
      const remaining = downloadRateLimiter.getRemainingRequests(rateLimitKey);
      const resetTime = downloadRateLimiter.getResetTime(rateLimitKey);
      
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: 'Too many download requests. Please try again later.',
          remaining,
          resetAt: resetTime.toISOString()
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': resetTime.toISOString(),
            'Retry-After': Math.ceil((resetTime.getTime() - Date.now()) / 1000).toString()
          }
        }
      );
    }
    
    // Fetch artifact
    const artifact = await prisma.agentArtifact.findUnique({
      where: { id: artifactId },
      include: {
        execution: {
          include: {
            task: {
              include: {
                pov: true
              }
            }
          }
        }
      }
    });
    
    if (!artifact) {
      // Log failed download attempt
      logger.warn({ artifactId }, 'Artifact download attempted for non-existent artifact');
      
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      );
    }
    
    // Log successful download
    logger.info({ artifactId: artifact.id, artifactName: artifact.name, artifactType: artifact.type, artifactSize: artifact.content.length, taskId: artifact.execution.task?.id, povId: artifact.execution.task?.pov?.id }, 'Artifact downloaded');
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (artifact.type === 'application/json') {
      contentType = 'application/json';
    } else if (artifact.type === 'text/markdown') {
      contentType = 'text/markdown';
    } else if (artifact.type === 'text/plain') {
      contentType = 'text/plain';
    }
    
    // Create response with download headers
    const response = new NextResponse(artifact.content);
    response.headers.set('Content-Type', contentType);
    // BC22 FIX: Sanitize filename to prevent CRLF header injection
    response.headers.set('Content-Disposition', safeContentDisposition(artifact.name, `artifact-${artifact.id}`));
    // BC40 FIX: no-store prevents browser caching of token-authenticated downloads
    response.headers.set('Cache-Control', 'no-store');

    // Add CORS headers for browser access
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Add rate limit headers
    const remaining = downloadRateLimiter.getRemainingRequests(rateLimitKey);
    const resetTime = downloadRateLimiter.getResetTime(rateLimitKey);
    response.headers.set('X-RateLimit-Limit', '10');
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', resetTime.toISOString());
    
    return response;
    
  } catch (error) {
    logger.error({ err: error, artifactId: params.id }, 'Error downloading artifact');
    
    return NextResponse.json(
      { error: 'Failed to download artifact' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}