import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { trackActivity } from '@/lib/auth/audit';
import { CreateSupportRequestSchema } from '@/lib/validation/support-validation';
import { supportRequestLimiter } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // ✅ Rate limiting: 10 requests per hour
    const rateLimitResponse = supportRequestLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await req.json();

    // ✅ SECURITY: Validate with multi-layer defense (31 patterns, sanitization)
    const validation = CreateSupportRequestSchema.safeParse(data);

    if (!validation.success) {
      // Log security violations for monitoring
      logger.warn({ userId: user.userId, errors: validation.error.issues }, 'Support request validation failed');

      return NextResponse.json(
        {
          error: 'Invalid request data',
          issues: validation.error.issues
        },
        { status: 400 }
      );
    }

    const requestData = validation.data;  // Now sanitized and validated!

    // Create support request
    const request = await prisma.supportRequest.create({
      data: {
        userId: user.userId,
        type: requestData.type,
        priority: requestData.priority,
        subject: requestData.subject,
        description: requestData.description,
        status: 'OPEN',
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Track activity
    await trackActivity(
      user.userId,
      'SUPPORT_REQUEST',
      'CREATE',
      {
        requestId: request.id,
        type: data.type,
        priority: data.priority,
      }
    );

    return NextResponse.json({ data: { request } });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/support/request' }, 'Failed to create support request');
    return NextResponse.json(
      { error: 'Failed to create support request' },
      { status: 500 }
    );
  }
}
