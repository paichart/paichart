import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UserRole } from '@/lib/types/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/event-system/status
 * Returns health status of event-driven systems
 * Admin-only endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Admin-only check
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get prompt registry event emitter status
    let promptRegistryStatus = {
      isConnected: false,
      eventCount: 0,
      listenerCount: 0,
      error: null as string | null,
    };

    try {
      const { getPromptRegistryEventEmitter } = require('@/lib/events/prompt-registry-events');
      const eventEmitter = getPromptRegistryEventEmitter();
      const stats = eventEmitter.getStats();

      promptRegistryStatus = {
        isConnected: stats.isConnected,
        eventCount: stats.eventCount,
        listenerCount: stats.listenerCount,
        error: null,
      };
    } catch (error) {
      promptRegistryStatus.error = 'Failed to get prompt registry status';
    }

    return NextResponse.json({
      success: true,
      data: {
        promptRegistry: promptRegistryStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Event System Status error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get event system status',
        details: 'See server logs for details',
      },
      { status: 500 }
    );
  }
}
