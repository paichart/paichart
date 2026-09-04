import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { markAsRead } from '@/lib/notifications/services/delivery';
import { logger } from '@/lib/logger';
import { corsPreflightResponse } from '@/lib/utils/cors';

export async function POST(
  req: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    logger.info({ notificationId: params.notificationId }, 'Marking notification as read');
    const user = await getAuthUser(req);
    
    if (!user) {
      logger.warn('Notification read attempt with no authenticated user');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const notification = await markAsRead(params.notificationId, user.userId);
    logger.info({ notificationId: notification.id }, 'Notification marked as read');

    return NextResponse.json({ notification });
  } catch (error) {
    logger.error({ err: error, endpoint: 'POST /api/notifications/[notificationId]/read' }, 'Failed to mark notification as read');
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'POST, OPTIONS');
}
