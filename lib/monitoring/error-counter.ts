/**
 * In-memory error rate counter with sliding 1-hour window.
 *
 * Tracks errors by category (ssr, api, uncaught, unhandled-rejection)
 * using 1-minute bucket granularity. Memory is bounded: max 60 buckets
 * per category. Resets on process restart (acceptable — PM2 restart
 * count is itself an indicator).
 *
 * Feeds into /api/health endpoint and enterprise-health-monitor.sh.
 */

interface Bucket {
  /** Minute timestamp (floored to start of minute) */
  minute: number;
  count: number;
}

export type ErrorCategory = 'ssr' | 'api' | 'uncaught' | 'unhandled-rejection';

export interface ErrorRate {
  lastHour: number;
  lastMinute: number;
}

export type ErrorRateSummary = Record<ErrorCategory, ErrorRate>;

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const BUCKET_MS = 60 * 1000;       // 1 minute

class ErrorCounter {
  private buckets: Map<ErrorCategory, Bucket[]> = new Map();

  increment(category: ErrorCategory): void {
    const now = Date.now();
    const minuteKey = Math.floor(now / BUCKET_MS) * BUCKET_MS;

    let categoryBuckets = this.buckets.get(category);
    if (!categoryBuckets) {
      categoryBuckets = [];
      this.buckets.set(category, categoryBuckets);
    }

    // BC65 FIX: Atomic bucket update — single-threaded but safe across async yields
    // Get or create bucket for current minute (no await between check and mutate)
    const last = categoryBuckets[categoryBuckets.length - 1];
    if (last && last.minute === minuteKey) {
      last.count = (last.count | 0) + 1; // Ensure integer arithmetic
    } else {
      categoryBuckets.push({ minute: minuteKey, count: 1 });
    }

    // Prune old buckets beyond the 1-hour window (bounded to 60 iterations max)
    const cutoff = now - WINDOW_MS;
    while (categoryBuckets.length > 0 && categoryBuckets[0].minute < cutoff) {
      categoryBuckets.shift();
    }
  }

  getRate(category: ErrorCategory): ErrorRate {
    const now = Date.now();
    const hourCutoff = now - WINDOW_MS;
    const minuteCutoff = now - BUCKET_MS;

    const categoryBuckets = this.buckets.get(category) || [];

    let lastHour = 0;
    let lastMinute = 0;

    for (const bucket of categoryBuckets) {
      if (bucket.minute >= hourCutoff) {
        lastHour += bucket.count;
      }
      if (bucket.minute >= minuteCutoff) {
        lastMinute += bucket.count;
      }
    }

    return { lastHour, lastMinute };
  }

  getSummary(): ErrorRateSummary {
    const categories: ErrorCategory[] = ['ssr', 'api', 'uncaught', 'unhandled-rejection'];
    const summary = {} as ErrorRateSummary;

    for (const category of categories) {
      summary[category] = this.getRate(category);
    }

    return summary;
  }

  /** Total errors across all categories in the last hour */
  getTotalLastHour(): number {
    const summary = this.getSummary();
    return Object.values(summary).reduce((sum, rate) => sum + rate.lastHour, 0);
  }
}

/** Singleton — shared across server.ts and API routes in the same process */
export const errorCounter = new ErrorCounter();
