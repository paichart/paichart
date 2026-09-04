import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { trackActivity } from '@/lib/auth/audit';
import { CreateFeatureRequestSchema } from '@/lib/validation/support-validation';
import { featureRequestLimiter } from '@/lib/middleware/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // ✅ Rate limiting: 5 requests per hour
    const rateLimitResponse = featureRequestLimiter(req);
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
    const validation = CreateFeatureRequestSchema.safeParse(data);

    if (!validation.success) {
      // Log security violations for monitoring
      logger.warn({ userId: user.userId, errors: validation.error.issues }, 'Feature request validation failed');

      return NextResponse.json(
        {
          error: 'Invalid request data',
          issues: validation.error.issues
        },
        { status: 400 }
      );
    }

    const requestData = validation.data;  // Now sanitized and validated!

    // Create feature request
    const request = await prisma.featureRequest.create({
      data: {
        userId: user.userId,
        category: requestData.category,
        impact: requestData.impact,
        title: requestData.title,
        description: requestData.description,
        businessCase: requestData.businessCase,
        isUrgent: requestData.isUrgent || false,
        status: 'PENDING',
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
      'FEATURE_REQUEST',
      'CREATE',
      {
        requestId: request.id,
        category: data.category,
        impact: data.impact,
        isUrgent: data.isUrgent,
      }
    );

    return NextResponse.json({ data: { request } });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/support/feature' }, 'Failed to create feature request');
    return NextResponse.json(
      { error: 'Failed to create feature request' },
      { status: 500 }
    );
  }
}
