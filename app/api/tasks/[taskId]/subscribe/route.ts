import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { taskLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/middleware/rate-limit';

// G-4 (2026-05-27): cap concurrent SSE connections per user (connection-exhaustion guard —
// these are long-lived hour-long streams, previously unbounded for DEMO viewers).
const SSE_MAX_CONN_PER_USER = 10;
const sseConnCounts = new Map<string, number>();

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/[taskId]/subscribe - Server-sent events for real-time task updates
const taskSubscribeHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { taskId } = context.params;

  if (!taskId) {
    return new Response('Task ID is required', { status: 400 });
  }

  // G-4 (2026-05-27): per-user connect throttle (parity with the rest of the DEMO surface)
  const rl = checkRateLimit(`sse-subscribe:${user.userId}`, 20, 60_000);
  if (!rl.allowed) {
    return new Response('Too many requests', { status: 429 });
  }

  try {
    // PENTEST FIX: Validate POV access before establishing SSE stream (was missing — any user could subscribe to any task)
    const taskWithPOV = await getTaskWithPOV(taskId);

    if (!taskWithPOV || !taskWithPOV.pov) {
      return new Response('Task not found', { status: 404 });
    }

    try {
      validatePOVAccess(user, taskWithPOV.pov, { throwOnDeny: true });
    } catch {
      return new Response('Task not found', { status: 404 });
    }

    const task = taskWithPOV;

    // G-4 (2026-05-27): reject if the user already holds the max concurrent SSE streams
    if ((sseConnCounts.get(user.userId) || 0) >= SSE_MAX_CONN_PER_USER) {
      return new Response('Too many concurrent connections', { status: 429 });
    }

    // Set up Server-Sent Events
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        // G-4 (2026-05-27): track this connection for the per-user concurrency cap
        sseConnCounts.set(user.userId, (sseConnCounts.get(user.userId) || 0) + 1);

        // Send initial connection confirmation
        const initialData = {
          type: 'connection',
          taskId,
          timestamp: new Date().toISOString(),
          message: 'Connected to task updates'
        };
        
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`)
        );

        // Set up task update listener
        const subscriptionId = `task-${taskId}-${user.userId}-${Date.now()}`;
        
        // Import and use the task subscription service
        import('@/lib/services/taskSubscriptionService').then(({ TaskSubscriptionService }) => {
          TaskSubscriptionService.subscribe(taskId, user.userId, (update) => {
            try {
              const eventData = {
                type: 'task_update',
                taskId,
                timestamp: new Date().toISOString(),
                update
              };
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
              );
            } catch (error) {
              taskLogger.error({ err: error, taskId }, 'SSE error sending update');
            }
          });
        });

        // Send periodic heartbeat
        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeat = {
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(heartbeat)}\n\n`)
            );
          } catch (error) {
            taskLogger.error({ err: error, taskId }, 'SSE error sending heartbeat');
            clearInterval(heartbeatInterval);
          }
        }, 30000); // 30 seconds

        // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
        heartbeatInterval.unref();

        // BC57 FIX: Cleanup function shared by signal and max-age timeout
        // BC64 FIX: Self-removes abort listener to prevent dangling references
        let cleaned = false;
        let maxAgeTimeout: ReturnType<typeof setTimeout> | null = null; // BC64 FIX: Declare before cleanup
        let reauthInterval: ReturnType<typeof setInterval> | null = null; // G-3: declare before cleanup
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          // G-4 (2026-05-27): release the concurrency slot
          const remaining = (sseConnCounts.get(user.userId) || 1) - 1;
          if (remaining <= 0) sseConnCounts.delete(user.userId);
          else sseConnCounts.set(user.userId, remaining);
          clearInterval(heartbeatInterval);
          if (reauthInterval) clearInterval(reauthInterval);
          if (maxAgeTimeout) clearTimeout(maxAgeTimeout);
          if (req.signal) req.signal.removeEventListener('abort', cleanup); // BC64 FIX
          import('@/lib/services/taskSubscriptionService').then(({ TaskSubscriptionService }) => {
            TaskSubscriptionService.unsubscribe(taskId, user.userId);
          });
          try { controller.close(); } catch { /* already closed */ }
        };

        // Primary: signal-based cleanup
        if (req.signal) {
          req.signal.addEventListener('abort', cleanup);
        }

        // BC57 FIX: Fallback max-age timeout (1 hour) if signal never fires
        maxAgeTimeout = setTimeout(cleanup, 60 * 60 * 1000);
        maxAgeTimeout.unref();

        // G-3 (2026-05-27): periodic re-authorization. SSE validated access only at
        // connect, so a user who lost access mid-stream (removed from POV team, POV
        // deleted, isDemo flag flipped) kept receiving updates until the 60-min max-age.
        // Re-validate every 5 min against a FRESH fetch and tear down on revocation —
        // bounds the stale-authz window from ~60 min to ~5 min.
        reauthInterval = setInterval(async () => {
          try {
            const fresh = await getTaskWithPOV(taskId);
            if (!fresh || !fresh.pov) {
              taskLogger.info({ taskId, userId: user.userId }, 'SSE re-auth: task/POV gone — closing stream');
              cleanup();
              return;
            }
            validatePOVAccess(user, fresh.pov, { throwOnDeny: true });
          } catch {
            taskLogger.info({ taskId, userId: user.userId }, 'SSE re-auth: access revoked — closing stream');
            cleanup();
          }
        }, 5 * 60 * 1000);
        reauthInterval.unref();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });

  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'GET /api/tasks/[taskId]/subscribe' }, 'SSE subscription failed');
    return new Response('Internal server error', { status: 500 });
  }
};

export const GET = createHandler(taskSubscribeHandler, { requireAuth: true });
