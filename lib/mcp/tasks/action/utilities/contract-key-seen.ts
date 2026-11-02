/**
 * Q2 leg-contract heal (2026-10-17) — was an `interfaceContract` SENT in this task.create call, even though none survived to the
 * validated parameters? (SYNTHESIS v3 V9; boundary-contract F4, architectural-review SF-5.)
 *
 * That is Q2's real broken-wiring class — a contract the caller sent that the transport/validation layers dropped (the F11
 * double-nest class was one instance) — and it must stay LOUD: the platform never heals a contract it may have lost itself.
 *
 * KEYS ONLY, BOUNDED: walks object keys (and objects inside arrays) up to `maxDepth`; never matches string VALUES, so a
 * description that mentions the word cannot trip it. Pure; no I/O.
 */
export const CONTRACT_KEY_SCAN_MAX_DEPTH = 4;
export const CONTRACT_KEY = 'interfaceContract';

export function interfaceContractKeySeen(
  rawParameters: unknown,
  unappliedTopLevelKeys: readonly string[] | undefined,
  maxDepth: number = CONTRACT_KEY_SCAN_MAX_DEPTH,
): boolean {
  if (unappliedTopLevelKeys?.includes(CONTRACT_KEY)) return true;
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > maxDepth || v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.some((x) => walk(x, depth + 1));
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (k === CONTRACT_KEY && child !== undefined) return true;
      if (walk(child, depth + 1)) return true;
    }
    return false;
  };
  return walk(rawParameters, 0);
}
