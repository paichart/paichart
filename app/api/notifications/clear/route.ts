import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { logNotificationActivity } from '@/lib/notifications/services/activity';
import { NotificationType } from '@/lib/notifications/types';
import { corsPreflightResponse } from '@/lib/utils/cors';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    logger.info('Clearing all notifications');
    const user = await getAuthUser(req);
    
    if (!user) {
      logger.warn('Notification clear attempt with no authenticated user');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Mark all user's notifications as read
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    // Log activity
    await logNotificationActivity(user.userId, 'read', {
      notificationId: 'all',
      type: NotificationType.INFO,
      title: 'All notifications marked as read',
    });

    logger.info({ count: result.count }, 'All notifications marked as read');
    return NextResponse.json({ 
      success: true,
      count: result.count,
    });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/notifications/clear' }, 'Failed to clear notifications');
    return NextResponse.json(
      { error: 'Failed to clear notifications' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'POST, OPTIONS');
}
