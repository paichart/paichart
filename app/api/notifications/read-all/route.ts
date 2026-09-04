import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { logger } from '@/lib/logger';

export async function PUT(request: NextRequest) {
  try {
    // Get authenticated user
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Update all unread notifications for the user
    await prisma.notification.updateMany({
      where: {
        userId: authUser.userId,
        read: false
      },
      data: {
        read: true
      }
    });

    return NextResponse.json({
      message: 'All notifications marked as read'
    });
  } catch (error) {
    logger.error({ err: error, endpoint: 'PUT /api/notifications/read-all' }, 'Failed to mark all notifications as read');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
