/**
 * Retry Utility with Exponential Backoff
 * Handles transient failures with Microsoft/Google OAuth APIs
 *
 * Handles:
 * - Rate limiting (429) - honors the Retry-After header (2026-06-09: fetchWithRetry now sets
 *   error.response.headers so withRetry's 429 branch clamps the delay to Retry-After), else exponential
 *   backoff + jitter. Jitter never subtracts from a server-dictated Retry-After (the 429 branch overwrites
 *   the jittered delay).
 * - Transient errors (503, 504) - Exponential backoff + jitter (BC14)
 * - Network timeouts - Configurable retries
 *
 * Part of: Microsoft MCP OAuth Integration (Plan v3.2 - Phase 0.9)
 * Created: 2025-10-14
 */

import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'RetryUtils' });

export interface RetryConfig {
  maxAttempts: number;          // Maximum retry attempts
  initialDelay: number;         // Initial delay in ms
  maxDelay: number;             // Maximum delay in ms
  backoffMultiplier: number;    // Delay multiplier (e.g., 2 for exponential)
  retryableStatusCodes: number[]; // HTTP status codes to retry
  // BC14 jitter (2026-06-09). Number = symmetric ±fraction (0.2 = ±20%, the herd-desync default for the
  // OAuth path); 'full' = random(0, cap) (max decorrelation, used by the DB serialization-retry adapter);
  // 0/undefined = no jitter. Applied to the EXPONENTIAL term only (a Retry-After override, when live, replaces
  // delay AFTER calculateDelay). OAuth-multi-provider/client signed off ±20% for the MS token-exchange path.
  jitter?: number | 'full';
  // Optional custom retryability predicate (2026-06-09). When set it OVERRIDES the retryableStatusCodes
  // HTTP check, letting non-HTTP callers (the DB serialization-retry adapter) classify Prisma/SQLSTATE errors.
  isRetryable?: (error: unknown) => boolean;
  // Optional wall-clock budget across ALL backoff sleeps (ms) — give up early under sustained contention
  // (perf amplification guard). Undefined = bounded only by maxAttempts.
  maxTotalDelayMs?: number;
  // Optional per-retry hook, fired just before each backoff sleep — lets a caller emit its own telemetry
  // (e.g. the DB serialization adapter logs via dbLogger). 2026-06-09.
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,           // 1 second
  maxDelay: 30000,              // 30 seconds
  backoffMultiplier: 2,         // Exponential backoff
  retryableStatusCodes: [429, 503, 504], // Rate limit, service unavailable, gateway timeout
  jitter: 0.2                   // ±20% — BC14 herd de-sync (closes the lone auth-subsystem BC14 gap)
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay, with optional jitter (BC14).
 * Jitter is applied to the exponential term ONLY — never to a server-dictated Retry-After
 * (the caller's 429 branch overwrites `delay` after this returns).
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const base = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );
  const jitter = config.jitter;
  if (jitter === 'full') {
    // Full jitter: random(0, base) — maximally decorrelates concurrent conflicters (DB serialization retry).
    return Math.random() * base;
  }
  if (typeof jitter === 'number' && jitter > 0) {
    // Symmetric ±fraction (e.g. 0.2 → ±20%): de-syncs a retry herd while preserving backoff shape.
    const jittered = base + base * jitter * (Math.random() * 2 - 1);
    return Math.min(Math.max(jittered, 0), config.maxDelay);
  }
  return base;
}

/**
 * Execute function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { provider?: string; operation?: string }
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let totalDelay = 0; // cumulative backoff sleep (ms), for maxTotalDelayMs

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      const result = await fn();

      if (attempt > 1) {
        localLogger.info({ provider: context?.provider, operation: context?.operation, attempt }, 'Retry succeeded');
      }

      return result;

    } catch (error: any) {
      lastError = error;
      const isLastAttempt = attempt === fullConfig.maxAttempts;

      // Check if error is retryable — a custom predicate (e.g. DB serialization SQLSTATEs) takes
      // precedence over the default HTTP-status check (back-compat: no predicate → status check).
      const statusCode = error.statusCode || error.status || error.response?.status;
      const isRetryable = fullConfig.isRetryable
        ? fullConfig.isRetryable(error)
        : !!(statusCode && fullConfig.retryableStatusCodes.includes(statusCode));

      if (!isRetryable || isLastAttempt) {
        // Don't retry non-retryable errors or on last attempt
        throw error;
      }

      // Calculate delay
      let delay = calculateDelay(attempt, fullConfig);

      // Respect Retry-After header for rate limiting (429)
      if (statusCode === 429) {
        const retryAfter = error.response?.headers?.['retry-after'];
        if (retryAfter) {
          // Retry-After can be seconds (number) or HTTP date
          const retryAfterMs = parseInt(retryAfter) * 1000;
          if (!isNaN(retryAfterMs)) {
            delay = Math.min(retryAfterMs, fullConfig.maxDelay);
            localLogger.info({ provider: context?.provider, retryAfterSeconds: retryAfter }, 'Rate limited, respecting Retry-After header');
          }
        }
      }

      // maxTotalDelayMs: give up early if the cumulative backoff budget would be exceeded (amplification guard).
      if (fullConfig.maxTotalDelayMs != null && totalDelay + delay > fullConfig.maxTotalDelayMs) {
        throw error;
      }
      totalDelay += delay;

      localLogger.warn({ provider: context?.provider, operation: context?.operation, attempt, maxAttempts: fullConfig.maxAttempts, delayMs: delay, errorMessage: error.message }, 'Retry attempt failed, retrying');
      fullConfig.onRetry?.({ attempt, delayMs: delay, error });

      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Fetch with automatic retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: Partial<RetryConfig> = {},
  context?: { provider?: string; operation?: string }
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

      // Check if response is retryable error
      if (config.retryableStatusCodes?.includes(response.status) ||
          DEFAULT_RETRY_CONFIG.retryableStatusCodes.includes(response.status)) {
        // Capture Retry-After (if present) BEFORE cancelling the body — headers are independent of the
        // stream. 2026-06-09 fix: fetchWithRetry previously set only error.statusCode, never error.response,
        // so withRetry's 429 Retry-After honor branch (`error.response?.headers?.['retry-after']`) was dead
        // code and Microsoft's Retry-After was silently ignored on the token-exchange path. Now wired.
        const retryAfter = response.headers.get('retry-after');
        // BC20 FIX: consume body before throwing to release TCP connection
        await response.body?.cancel();
        const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.statusCode = response.status;
        error.response = { headers: { 'retry-after': retryAfter } };
        throw error;
      }

      return response;
    },
    config,
    context
  );
}
