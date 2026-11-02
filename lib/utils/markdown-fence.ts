/**
 * markdown-fence — PURE fence tracking shared by the leg report appends (`report-warnings-section.ts` closeOpenFence) and the
 * §6 held render (`render-pipeline-context.ts`, PC-P2-7, PLATFORM-HELD-BYTES G3 entry 2026-10-16): one tracker, so the report and
 * the prompt agree on what an "open" fence is. No imports, so either side can load it without a cycle.
 */
/** The fence characters (```` ``` ```` or `~~~`) of a block left OPEN at the end of `body`, else null. */
export function openFenceOf(body: string): string | null {
  // Track WHICH fence opened the block (sec-ops F6) and close with the same characters.
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^[ \t]{0,3}(```|~~~)/);
    if (!m) continue;
    if (fence === null) fence = m[1]; else if (m[1] === fence) fence = null;
  }
  return fence;
}
