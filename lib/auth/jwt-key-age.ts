import { logger } from '@/lib/logger';

/**
 * JWT signing-key age, for the admin jwt-status endpoint.
 *
 * Source of the age, in order:
 *   1. `rotatedAt` — JWT_KEY_ROTATED_AT, the exact rotation day (YYYY-MM-DD), written by the
 *      deploy workflow from the GitHub secret of the same name.
 *   2. Fallback — the 1st of the kid's month (`paichart-YYYY-MM`). Approximate: overstates the
 *      age by up to ~30 days, because the kid label carries the month only.
 *
 * 2026-10-13: the endpoint used ONLY the fallback, so after the 2026-10-13 rotation it reported
 * keyAgeDays 12 (and nextRotationDate 2026-12-30) for a key minutes old. The daily-summary email
 * had the same bug and was fixed 2026-06-21 by preferring JWT_KEY_ROTATED_AT; this is the
 * endpoint half of that fix, using the same rule.
 *
 * Edge cases (validation-engine-specialist, Phase 3 CRITICAL FIX #2) are kept unchanged:
 * malformed kid / year outside 2000-2100 / month outside 1-12 → -1; a date in the future → 0.
 */

const ROTATED_AT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Parse a strict, real calendar YYYY-MM-DD as UTC midnight; null if absent or invalid. */
function parseRotatedAt(rotatedAt: string | undefined | null): Date | null {
  if (!rotatedAt) return null;
  const m = ROTATED_AT_RE.exec(rotatedAt.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Round-trip check rejects impossible days (2026-02-30 would roll to March).
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/** The key's start date per the order above, or null if the kid is invalid. */
function keyStartDate(keyId: string, rotatedAt: string | undefined | null): Date | null {
  const match = keyId.match(/paichart-(\d{4})-(\d{2})/);
  if (!match) {
    logger.error({ keyId }, 'JWT Status invalid key ID format');
    return null;
  }

  const year = parseInt(match[1]);
  const month = parseInt(match[2]);

  if (year < 2000 || year > 2100) {
    logger.error({ year }, 'JWT Status invalid year in key ID');
    return null;
  }
  if (month < 1 || month > 12) {
    logger.error({ month }, 'JWT Status invalid month in key ID');
    return null;
  }

  const exact = parseRotatedAt(rotatedAt);
  if (exact) return exact;
  if (rotatedAt) {
    logger.warn({ rotatedAt }, 'JWT Status JWT_KEY_ROTATED_AT is not a valid YYYY-MM-DD — falling back to the kid month');
  }
  return new Date(year, month - 1, 1);
}

/**
 * Key age in whole days, or -1 for an invalid kid.
 *
 * @param keyId     kid, format paichart-YYYY-MM
 * @param rotatedAt JWT_KEY_ROTATED_AT (YYYY-MM-DD); optional
 * @param now       injectable clock for tests
 */
export function calculateKeyAge(keyId: string, rotatedAt?: string | null, now: Date = new Date()): number {
  const start = keyStartDate(keyId, rotatedAt);
  if (!start) return -1;

  const ageDays = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  if (ageDays < 0) {
    logger.warn({ keyId, daysInFuture: -ageDays }, 'JWT Status future key date detected');
    return 0; // Treat as brand new key
  }
  return ageDays;
}

/** Next rotation date (YYYY-MM-DD) on the 90-day cadence, or 'Invalid key ID'. */
export function calculateNextRotationDate(keyId: string, rotatedAt?: string | null, now: Date = new Date()): string {
  const keyAge = calculateKeyAge(keyId, rotatedAt, now);
  if (keyAge === -1) return 'Invalid key ID';

  const nextRotation = new Date(now.getTime());
  nextRotation.setDate(nextRotation.getDate() + Math.max(0, 90 - keyAge));
  return nextRotation.toISOString().split('T')[0];
}
