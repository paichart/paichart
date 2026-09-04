import { NextRequest } from 'next/server';
import { ApiResponse, ApiResponseWithCookies, TokenPayload, UserRole } from './types/auth';
import { formatCookieHeader } from './cookies';
import { logger } from './logger';
import auth from '@/lib/auth';
import { config } from '@/lib/config';
import { ApiError } from './errors';
import { RateLimiter, checkRateLimit, adminOperationLimiter, writeOperationLimiter } from './utils/rate-limiter';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T> | ApiResponseWithCookies<T>>;

interface ApiHandlerOptions {
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  /** Apply rate limiting - use 'admin', 'write', or provide custom RateLimiter */
  rateLimit?: 'admin' | 'write' | RateLimiter;
  /** BC45 FIX: Max request body size in bytes (default 1MB). Set higher for import/upload endpoints. */
  maxBodySize?: number;
}

export function handleApiError(error: unknown) {
  logger.error({ err: error }, 'API error');

  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          message: error.message,
          code: error.code,
        },
      },
      { status: error.statusCode }
    );
  }

  return Response.json(
    {
      error: {
        message: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      },
    },
    { status: 500 }
  );
}

/**
 * API handler wrapper with authentication and error handling
 */
export function createHandler<T = any>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions = {}
) {
  return async (req: NextRequest, context: { params: Record<string, string> }) => {
    try {
      // BC45 FIX: Reject oversized request bodies before parsing (defense-in-depth)
      const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
      const maxBody = options.maxBodySize || 1_048_576; // 1MB default
      if (contentLength > maxBody) {
        return Response.json(
          { error: { message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' } },
          { status: 413 }
        );
      }

      // Check rate limiting if configured
      if (options.rateLimit) {
        // BC44 FIX: Always rate limit — use IP from proxy headers or fall back to user-id from
        // an unverified token peek, then to a single shared 'direct' bucket as a last resort.
        // The token peek (no signature verification) gives concurrent internal callers their
        // own per-user buckets so embedded agent executions don't collide. Even a forged token
        // is harmless here — an attacker would only self-rate-limit into their forged bucket.
        const forwardedFor = req.headers.get('x-forwarded-for');
        const realIp = req.headers.get('x-real-ip');

        const limiter = options.rateLimit === 'admin' ? adminOperationLimiter
          : options.rateLimit === 'write' ? writeOperationLimiter
          : options.rateLimit;

        let identifier = forwardedFor?.split(',')[0] || realIp;
        if (!identifier) {
          // Internal callers (embedded server → /api/mcp/tasks/action) have no proxy headers.
          // Peek the bearer token's userId WITHOUT verifying — bucketing only, not auth.
          try {
            const authHeader = req.headers.get('authorization');
            if (authHeader?.startsWith('Bearer ')) {
              const payload = authHeader.substring(7).split('.')[1];
              if (payload) {
                const decoded = JSON.parse(
                  Buffer.from(payload, 'base64url').toString('utf8'),
                ) as { sub?: string; userId?: string };
                const uid = decoded.userId || decoded.sub;
                if (uid) identifier = `direct:${uid}`;
              }
            }
          } catch {
            // Malformed token — fall through to shared bucket. Auth check below will reject anyway.
          }
        }

        const rateLimitResponse = await checkRateLimit(limiter, identifier || 'direct');
        if (rateLimitResponse) {
          return rateLimitResponse;
        }
      }

      // Check authentication if required
      let user: TokenPayload | undefined;
      if (options.requireAuth) {
        // Try to get token from cookie first
        let token = req.cookies.get(config.cookie.accessToken)?.value;
        
        // If no cookie token, try Authorization header (for MCP server and API clients)
        if (!token) {
          const authHeader = req.headers.get('authorization');
          if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7); // Remove 'Bearer ' prefix
          }
        }
        
        if (!token) {
          return Response.json(
            {
              error: {
                message: 'Unauthorized',
                code: 'UNAUTHORIZED',
              },
            },
            { status: 401 }
          );
        }

        // 2026-05-27 (pentest M-1): verifyAccessToken THROWS Error('Invalid token')
        // on any crypto/claim failure (bad signature, expired, wrong key/kid,
        // tampered) — it never returns falsy. Without this catch the throw fell
        // through to the outer handler → 500 instead of 401 (a key-rotation hazard:
        // old-key tokens would 500 rather than re-auth). Mirror getAuthUser/verifyAuth.
        let decoded;
        try {
          decoded = await auth.tokens.verifyAccessToken(token);
        } catch {
          return Response.json(
            { error: { message: 'Invalid token', code: 'INVALID_TOKEN' } },
            { status: 401 }
          );
        }
        if (!decoded) {
          return Response.json(
            {
              error: {
                message: 'Invalid token',
                code: 'INVALID_TOKEN',
              },
            },
            { status: 401 }
          );
        }

        user = decoded;

        // Check role if required
        if (options.allowedRoles && !options.allowedRoles.includes(user.role)) {
          return Response.json(
            {
              error: {
                message: 'Forbidden',
                code: 'FORBIDDEN',
              },
            },
            { status: 403 }
          );
        }
      }

      // Handle request
      const response = await handler(req, context, user);

      // Return raw Response if provided
      if (response instanceof Response) {
        return response;
      }

      // Format API response
      const headers = new Headers();

      // Set cookie headers if provided
      if ('cookies' in response && response.cookies?.length) {
        response.cookies.forEach(cookie => {
          headers.append('Set-Cookie', formatCookieHeader([cookie]));
        });
      }

      if ('error' in response && response.error) {
        return Response.json(
          { error: response.error },
          {
            status: response.error.code === 'UNAUTHORIZED' ? 401 : response.error.code === 'FORBIDDEN' ? 403 : response.error.code === 'NOT_FOUND' ? 404 : 400,
            headers,
          }
        );
      }

      return Response.json({ data: response.data }, { headers });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export default createHandler;
