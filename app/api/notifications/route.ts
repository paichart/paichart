import { NextRequest } from 'next/server';
import { getNotificationsHandler } from '@/lib/notifications/handlers/get';
import { logger } from '@/lib/logger';
import { corsPreflightResponse } from '@/lib/utils/cors';

export async function GET(req: NextRequest) {
  try {
    return await getNotificationsHandler(req);
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/notifications' }, 'Notifications API error');
    throw error;
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req, 'GET, OPTIONS');
}
