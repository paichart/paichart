import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

/**
 * Development query logger using Prisma $extends API
 * Replaces the broken $use middleware (removed in Prisma 6.16+)
 *
 * Features:
 * - Slow query detection (>100ms)
 * - N+1 query detection (same Model.operation >5 times in 1s window)
 * - Live query/slow counters via getQueryStats()
 */

let queryCount = 0;
let slowQueryCount = 0;

// N+1 detection: tracks { "Model.operation" => timestamps[] }
const recentCalls = new Map<string, number[]>();

const SLOW_THRESHOLD_MS = 100;
const N_PLUS_ONE_WINDOW_MS = 1000;
const N_PLUS_ONE_THRESHOLD = 5;

/**
 * Returns a Prisma extension that logs slow queries and detects N+1 patterns.
 * In production (NODE_ENV !== 'development') returns an identity extension (no-op).
 */
export function devQueryLoggerExtension() {
  if (process.env.NODE_ENV !== 'development') {
    // Identity extension — no overhead in production
    return Prisma.defineExtension((client) => client);
  }

  return Prisma.defineExtension({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const start = performance.now();
        const result = await query(args);
        const duration = Math.round(performance.now() - start);

        queryCount++;

        // Slow query detection
        if (duration > SLOW_THRESHOLD_MS) {
          slowQueryCount++;
          const label = model ? `${model}.${operation}` : operation;
          console.warn(`[DEV] SLOW QUERY: ${label} took ${duration}ms`);
        }

        // N+1 detection (only for model-scoped operations)
        if (model) {
          const key = `${model}.${operation}`;
          const now = Date.now();
          let timestamps = recentCalls.get(key);

          if (!timestamps) {
            timestamps = [];
            recentCalls.set(key, timestamps);
          }

          // Prune entries outside the sliding window
          const cutoff = now - N_PLUS_ONE_WINDOW_MS;
          while (timestamps.length > 0 && timestamps[0] < cutoff) {
            timestamps.shift();
          }

          timestamps.push(now);

          if (timestamps.length > N_PLUS_ONE_THRESHOLD) {
            console.warn(
              `[DEV] N+1 DETECTED: ${key} called ${timestamps.length} times in ${N_PLUS_ONE_WINDOW_MS}ms`
            );
          }
        }

        return result;
      },
    },
  });
}

/**
 * Backward-compatible setup call (kept for lib/prisma.ts:139).
 * The actual logging now happens via the $extends extension applied in createPrismaClient().
 */
export function setupDevQueryLogger(_prisma: PrismaClient) {
  if (process.env.NODE_ENV !== 'development') return;
  logger.info({ module: 'dev-query-logger' }, 'Query logger active via Prisma extension');
}

export function getQueryStats() {
  return {
    totalQueries: queryCount,
    slowQueries: slowQueryCount,
    slowPercentage: queryCount > 0 ? Math.round(slowQueryCount / queryCount * 100) : 0,
  };
}

export function resetQueryStats() {
  queryCount = 0;
  slowQueryCount = 0;
  recentCalls.clear();
}

// Simple query timer for manual performance measurement
export function createQueryTimer(operationName: string) {
  const start = Date.now();

  return {
    stop: () => {
      const duration = Date.now() - start;
      if (duration > SLOW_THRESHOLD_MS && process.env.NODE_ENV === 'development') {
        console.warn(`[DEV] SLOW OPERATION: ${operationName} took ${duration}ms`);
      }
      return duration;
    },
  };
}

// Log optimization results
export function logOptimizationResult(operation: string, beforeMs: number, afterMs: number) {
  if (process.env.NODE_ENV !== 'development') return;

  const reduction = Math.round((1 - afterMs / beforeMs) * 100);
  console.log(`[DEV] OPTIMIZATION: ${operation} improved from ${beforeMs}ms to ${afterMs}ms (${reduction}% reduction)`);
}
