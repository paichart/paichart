import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole } from '@/lib/types/auth';
import { ApiKeyService } from '@/lib/services/apiKeyService';
import { prisma } from '@/lib/prisma';
import { GenerateAPIKeySchema } from '@/lib/validation/admin-user-validation';
import { trackActivity } from '@/lib/auth/audit';
import { adminAPIKeyLimiter } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/admin/users/[userId]/api-key - Get user's API key info
const getUserApiKeyHandler: ApiHandler = async (
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

  // Check if user is admin or accessing their own key
  const targetUserId = context.params.userId;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isOwnKey = user.userId === targetUserId;

  if (!isAdmin && !isOwnKey) {
    return {
      error: {
        message: 'Forbidden - Insufficient permissions',
        code: 'FORBIDDEN',
      },
    };
  }

  try {
    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!targetUser) {
      return {
        error: {
          message: 'User not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Get current API key
    const apiKey = await ApiKeyService.getUserApiKey(targetUserId);
    const history = await ApiKeyService.getUserApiKeyHistory(targetUserId);

    let apiKeyInfo = null;
    if (apiKey) {
      const status = ApiKeyService.getApiKeyStatus(apiKey);
      apiKeyInfo = {
        hasKey: true,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
        purpose: apiKey.purpose,
        status,
        // Only show partial token for security
        tokenPreview: `${apiKey.token.substring(0, 20)}...${apiKey.token.substring(apiKey.token.length - 10)}`
      };
    }

    return {
      data: {
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role
        },
        apiKey: apiKeyInfo,
        history: history.map(key => ({
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          purpose: key.purpose,
          status: ApiKeyService.getApiKeyStatus(key),
          revokedAt: (key as any).revokedAt || null,
          tokenPreview: `${key.token.substring(0, 20)}...${key.token.substring(key.token.length - 10)}`
        }))
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'GET /api/admin/users/[userId]/api-key failed');
    return {
      error: {
        message: 'Failed to retrieve API key information',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// POST /api/admin/users/[userId]/api-key - Generate new API key
const generateApiKeyHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  // ✅ Rate limiting (P2.3): 10 API key operations per hour
  const rateLimitResponse = adminAPIKeyLimiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  // Check if user is admin or generating their own key
  const targetUserId = context.params.userId;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isOwnKey = user.userId === targetUserId;

  if (!isAdmin && !isOwnKey) {
    return {
      error: {
        message: 'Forbidden - Insufficient permissions',
        code: 'FORBIDDEN',
      },
    };
  }

  try {
    const body = await req.json();

    // ✅ ENHANCEMENT: Zod validation with safeParse (P1 fix - proper error handling)
    const result = GenerateAPIKeySchema.safeParse({
      name: body.name || body.purpose || 'mcp-authentication',
      expiresIn: body.expirationDays || body.expiresIn
    });

    if (!result.success) {
      return {
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.errors
        },
      };
    }

    const validated = result.data;

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!targetUser) {
      return {
        error: {
          message: 'User not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Generate new API key
    const apiKeyData = await ApiKeyService.generateApiKey(
      targetUserId,
      validated.expiresIn,
      validated.name
    );

    // ✅ ENHANCEMENT: Centralized audit logging (database + console)
    await trackActivity(
      user.userId,
      'API_KEY_MANAGEMENT',
      'GENERATE',
      {
        targetUserId: targetUserId,
        targetUserEmail: targetUser.email,
        keyName: validated.name,
        expiresIn: validated.expiresIn,
        success: true
      }
    );

    logger.info({ userId: user.userId, targetUserId, keyName: validated.name }, 'AUDIT: API key generated');

    return {
      data: {
        message: 'API key generated successfully',
        apiKey: {
          token: apiKeyData.token, // Full token returned only on generation
          createdAt: apiKeyData.createdAt,
          expiresAt: apiKeyData.expiresAt,
          purpose: apiKeyData.purpose,
          status: 'active'
        },
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role
        }
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'POST /api/admin/users/[userId]/api-key failed');
    return {
      error: {
        message: 'Failed to generate API key',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// DELETE /api/admin/users/[userId]/api-key - Revoke API key
const revokeApiKeyHandler: ApiHandler = async (
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

  // Check if user is admin or revoking their own key
  const targetUserId = context.params.userId;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isOwnKey = user.userId === targetUserId;

  if (!isAdmin && !isOwnKey) {
    return {
      error: {
        message: 'Forbidden - Insufficient permissions',
        code: 'FORBIDDEN',
      },
    };
  }

  try {
    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!targetUser) {
      return {
        error: {
          message: 'User not found',
          code: 'NOT_FOUND',
        },
      };
    }

    // Revoke API key
    await ApiKeyService.revokeApiKey(targetUserId);

    // ✅ P1-1 FIX: Centralized audit logging (database + console)
    await trackActivity(
      user.userId,
      'API_KEY_MANAGEMENT',
      'REVOKE',
      {
        targetUserId: targetUserId,
        targetUserEmail: targetUser.email,
        targetUserRole: targetUser.role,
        success: true,
        selfService: isOwnKey,
        performedBy: user.email
      }
    );

    // Log the action
    logger.info({ userId: user.userId, targetUserId, selfService: isOwnKey }, 'API key revoked');

    return {
      data: {
        message: 'API key revoked successfully',
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role
        }
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/admin/users/[userId]/api-key failed');
    return {
      error: {
        message: 'Failed to revoke API key',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

// 2026-05-17: BC60 (cbf89c53, 2026-02-28) added `allowedRoles: [ADMIN, SUPER_ADMIN]`
// as defense-in-depth. The sweep didn't audit the in-handler `isAdmin || isOwnKey`
// logic (lines 34-35 / 133-134 / 250-251) which had supported user self-service
// since inception. The component `SelfServiceApiKeyManagement` lives on the
// user profile page (`app/(authenticated)/profile/page.tsx:418`) and BC60 made
// it unreachable for non-admins (403 at the gate). Reverting to `requireAuth: true`
// — the in-handler ownership check is the actual gate that lets users manage
// only their own keys.
export const GET = createHandler(getUserApiKeyHandler, { requireAuth: true });
export const POST = createHandler(generateApiKeyHandler, { requireAuth: true });
export const DELETE = createHandler(revokeApiKeyHandler, { requireAuth: true });
