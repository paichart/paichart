/**
 * Prototype Pollution Prevention
 *
 * Strips dangerous keys (__proto__, constructor, prototype) from objects
 * to prevent prototype pollution attacks via user-provided JSON.
 *
 * Bug Class: BC27 - Prototype Pollution via Passthrough Validation
 * See: /.claude/knowledge/domain/mcp/bug-class-registry.md
 *
 * **KEEP IN SYNC** — DANGEROUS_KEYS, stripDangerousKeys, AND deepStripDangerousKeys
 * are also INLINED in `lib/mcp/server/config/tool-schemas.js` because that file
 * loads from BOTH webpack AND bare-Node (paichart-mcp). Cross-runtime import
 * via `@/lib/utils/sanitize-keys` only works under webpack — bare Node can't
 * resolve `@` paths or `.ts` extensions. If you change DANGEROUS_KEYS or
 * either strip algorithm here, update the inlined copies too. A drift-detection
 * smoke test exists at `scripts/test-mcp-phase1-smoke.ts:21` (the
 * DANGEROUS_KEYS equality assertion) to catch divergence at PR time.
 * For the deep variant, also keep MAX_STRIP_DEPTH (20) in sync.
 */

/** Keys that can trigger prototype pollution when spread or Object.assign'd */
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strip dangerous prototype-pollution keys from an object (shallow).
 * Returns a new object without __proto__, constructor, or prototype keys.
 *
 * Use this for Zod .transform() chains on .passthrough() and z.record(z.any()).
 */
export function stripDangerousKeys<T extends Record<string, unknown>>(obj: T): T {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  const keys = Object.keys(obj);
  let hasDangerous = false;
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      hasDangerous = true;
      break;
    }
  }

  if (!hasDangerous) return obj;

  const clean = {} as Record<string, unknown>;
  for (const key of keys) {
    if (!DANGEROUS_KEYS.has(key)) {
      clean[key] = obj[key];
    }
  }
  return clean as T;
}

/** Maximum nesting depth for recursive key stripping (prevents stack overflow DoS) */
const MAX_STRIP_DEPTH = 20;

/**
 * Deep strip dangerous keys from nested objects AND nested arrays.
 *
 * BC29 FIX: Depth-limited to prevent stack overflow from malicious nesting.
 *
 * Wave B C1 FIX (2026-05-23, Hub validation Phase 3): Previously skipped
 * arrays entirely (line 31 + line 62), creating a structural inconsistency
 * with argsShapeRefine (which DOES walk arrays). Attack payload
 * `{items: [{__proto__:{polluted:true}}]}` would survive strip but be
 * measured by depth/size caps — bypass class. Now recurses into arrays
 * and deep-strips any object elements within. Strings, numbers, booleans
 * inside arrays pass through unchanged.
 */
export function deepStripDangerousKeys<T extends Record<string, unknown>>(obj: T, _depth = 0): T {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (_depth > MAX_STRIP_DEPTH) return obj; // Depth guard — truncate traversal

  const clean = {} as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const val = obj[key];
    if (val != null && typeof val === 'object') {
      if (Array.isArray(val)) {
        clean[key] = deepStripArray(val, _depth + 1);
      } else {
        clean[key] = deepStripDangerousKeys(val as Record<string, unknown>, _depth + 1);
      }
    } else {
      clean[key] = val;
    }
  }
  return clean as T;
}

/**
 * Helper: deep-strip each element of an array. Objects get recursed via
 * deepStripDangerousKeys; nested arrays recurse via deepStripArray; primitives
 * pass through unchanged. Depth cap shared with deepStripDangerousKeys.
 */
function deepStripArray(arr: unknown[], _depth: number): unknown[] {
  if (_depth > MAX_STRIP_DEPTH) return arr; // depth guard
  return arr.map((el) => {
    if (el == null || typeof el !== 'object') return el;
    if (Array.isArray(el)) return deepStripArray(el, _depth + 1);
    return deepStripDangerousKeys(el as Record<string, unknown>, _depth + 1);
  });
}
