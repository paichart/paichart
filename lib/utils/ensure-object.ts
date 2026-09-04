import { logger } from '@/lib/logger';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';

const ensureObjectLogger = logger.child({ module: 'EnsureObject' });

/**
 * Ensure a value is a plain object, parsing JSON strings if needed.
 * Defensive against MCP transport boundary serialization where transports
 * (stdio, SSE, HTTP) may silently convert nested objects to JSON strings.
 *
 * See: /.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md
 * CommonJS version: lib/utils/ensure-object.js
 *
 * @param value - The value to coerce (may be object, string, or nullish)
 * @param fallback - Fallback value if parsing fails (default: {})
 * @param label - Optional label for warning logs
 * @returns A plain object
 */
export function ensureObject<T extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
  fallback: T = {} as T,
  label?: string
): T {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return stripDangerousKeys(value as T);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return stripDangerousKeys(parsed as T);
      }
    } catch (e) {
      if (label) {
        ensureObjectLogger.warn({ label, err: e }, 'Failed to parse string to object');
      }
    }
  }
  return fallback;
}
