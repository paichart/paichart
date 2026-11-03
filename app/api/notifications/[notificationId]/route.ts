import { NextRequest, NextResponse } from 'next/server';
import { markAsReadHandler } from '@/lib/notifications/handlers/read';
import { logger } from '@/lib/logger';

export async function PUT(req: NextRequest, props: { params: Promise<{ notificationId: string }> }) {
  const params = await props.params;
  try {
    const data = await markAsReadHandler(req, params.notificationId);
    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error, endpoint: 'PUT /api/notifications/[notificationId]' }, 'Failed to mark notification as read');
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}
