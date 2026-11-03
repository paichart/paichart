/**
 * The ONE JSON value-count cap (moved from lib/mcp/server/mcp-core.ts 2026-11-03 so the web API can use it without loading the MCP
 * core). True once more than `cap` JSON values would be seen — iterative (no recursion), and the early exit is checked as values are
 * QUEUED (seen + queued), so a wide array or object stops at the cap instead of being pushed whole (sec-ops B2 F1).
 */
export function exceedsArgumentNodeCap(value: unknown, cap: number): boolean {
  const stack: unknown[] = [value];
  let seen = 0;
  while (stack.length > 0) {
    const v = stack.pop();
    if (++seen > cap) return true;
    if (v !== null && typeof v === 'object') {
      if (Array.isArray(v)) {
        if (seen + stack.length + v.length > cap) return true;
        for (let i = 0; i < v.length; i++) stack.push(v[i]);
      } else {
        for (const k in v as Record<string, unknown>) {
          if (seen + stack.length + 1 > cap) return true;
          stack.push((v as Record<string, unknown>)[k]);
        }
      }
    }
  }
  return false;
}
