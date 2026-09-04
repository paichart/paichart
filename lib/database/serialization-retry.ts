import { Prisma } from '@prisma/client';
import { withRetry, type RetryConfig } from '@/lib/auth/oauth/retry-utils';
import { dbLogger } from '@/lib/logger';

const log = dbLogger.child({ module: 'SerializationRetry' });

/**
 * SQLSTATEs that indicate a TRANSIENT transaction conflict that is safe to retry:
 *  - 40001 serialization_failure  (RepeatableRead/Serializable abort)
 *  - 40P01 deadlock_detected
 *  - 55P03 lock_not_available     (FOR UPDATE NOWAIT)
 *
 * SINGLE SOURCE OF TRUTH — the helper AND any future caller import this constant (anti-drift; no forked
 * predicates). Deliberately EXCLUDES `53300 too_many_connections` (retrying amplifies pool exhaustion — BC14)
 * and the deterministic Prisma codes P2002/P2025/P2003 (re-running just repeats the failure).
 */
export const RETRYABLE_SQLSTATES: ReadonlySet<string> = new Set(['40001', '40P01', '55P03']);

/** True iff `e` is a transient transaction conflict worth retrying. */
export function isRetryableSerializationError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma maps serialization/deadlock aborts raised inside an interactive $transaction to P2034.
    if (e.code === 'P2034') return true;
    // Raw $executeRaw aborts (e.g. FOR UPDATE NOWAIT) surface as code='P2010' with the REAL SQLSTATE in
    // e.meta.code (probe-confirmed 2026-06-09: NOWAIT → {code:'P2010', meta:{code:'55P03'}}). Check meta.code.
    const sqlState = (e.meta?.code ?? (e as { code?: string }).code) as string | undefined;
    if (sqlState && RETRYABLE_SQLSTATES.has(sqlState)) return true;
  }
  return false;
}

// Serialization-retry tuning (performance-analyst, 2026-06-09). 40001 on a hot row resolves in single-digit
// ms; FULL jitter (not ±20%) decorrelates concurrent conflicters; sleeps happen OUTSIDE the tx (withRetry),
// so a pooled connection is held only during each attempt, never across a backoff.
const SERIALIZATION_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 5,
  initialDelay: 25,
  backoffMultiplier: 2,
  maxDelay: 200,
  maxTotalDelayMs: 750,
  jitter: 'full',
  isRetryable: isRetryableSerializationError,
};

/**
 * Retry a Postgres transaction that aborts with a transient serialization / deadlock / lock conflict
 * (RepeatableRead/Serializable 40001, deadlock 40P01, FOR UPDATE NOWAIT 55P03 / Prisma P2034).
 *
 * Thin adapter over the shared `withRetry` core (BC14: exponential backoff + FULL jitter + max-attempt and
 * total-delay caps). The backoff sleeps OUTSIDE `$transaction`, so the pooled connection is released between
 * attempts — under contention this can't exhaust the pool.
 *
 * ⚠ CONTRACT (non-negotiable): `fn` MUST contain ONLY the `prisma.$transaction(...)` call (with its
 * isolationLevel/timeout opts). Activity logs / notifications / SSE / external calls / ID generation MUST live
 * OUTSIDE this helper — a retry re-runs the ENTIRE `fn`, so anything non-idempotent inside it double-fires or
 * drifts. Only for SHORT transactions (<1s). See transaction-atomicity-pattern.md §Retry.
 *
 * @param fn   the bare `() => prisma.$transaction(...)` thunk
 * @param site short label for telemetry, e.g. 'task.ts:updateTask'
 */
export async function withSerializationRetry<T>(fn: () => Promise<T>, site: string): Promise<T> {
  try {
    return await withRetry(
      fn,
      {
        ...SERIALIZATION_RETRY_CONFIG,
        onRetry: ({ attempt, delayMs }) =>
          log.warn({ site, attempt, delayMs }, 'serialization conflict, retrying'),
      },
      { operation: site }
    );
  } catch (e) {
    if (isRetryableSerializationError(e)) {
      log.error({ site, maxAttempts: SERIALIZATION_RETRY_CONFIG.maxAttempts }, 'serialization retry exhausted');
    }
    throw e;
  }
}
