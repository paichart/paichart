/**
 * Args-shape refine factory (sec-ops Finding C, 2026-05-17)
 *
 * Zod `.superRefine()` callback factory that enforces depth + leaf-count
 * caps on forwarded arguments. The 25KB stringify-length cap at
 * `tool-schemas.js services.call.arguments` measures byte-size of the
 * JSON, not memory cost or iteration cost. A flat array of 100,000 small
 * strings totaling 24,999 bytes passes the byte cap but:
 *
 *   - allocates 100K JS string objects
 *   - forces 100K iterator-step / property-access ops on downstream consumers
 *   - can exhaust per-request memory budgets on resource-constrained instances
 *
 * Depth + leaf-count caps close this DoS bypass at a tighter dimension.
 *
 * Thresholds calibrated 2026-05-16 from a 66-sample production survey of
 * `mcp_workflow_executions.input->'steps'`:
 *
 *   |--------|-----|-----|-----|
 *   | depth  |  1  |  3  |  3  |
 *   | leaves |  1  |  7  |  7  |
 *   | bytes  | 35  | 352 | 352 |
 *
 *   MAX_DEPTH = 8     (2.6× p99 headroom — generous; permits future nested
 *                      filter objects for Snowflake-style query predicates)
 *   MAX_LEAVES = 100  (14× p99 headroom — accommodates future array-heavy
 *                      payloads for Alpha Vantage multi-symbol queries, EIA
 *                      multi-state queries; rejects the
 *                      100K-flat-string-totaling-24KB DoS bypass)
 *
 * Quarterly recalibration recommended after Snowflake/Alpha Vantage usage
 * grows; re-sample if p99 leaves exceeds 33.
 *
 * Uses `.superRefine()` with `ctx.addIssue({ params: { kind: ... } })` rather
 * than throw-in-refine — distinct `params.kind` codes enable SOC pino-log
 * alerting to distinguish depth-bomb vs leaf-bomb failure modes (per
 * architectural-review Finding C feedback in phase-3 verdict matrix).
 *
 * Pure function (no I/O). Idempotent.
 *
 * Plain-JS (not .ts) so `lib/mcp/server/config/tool-schemas.js` can require
 * it directly. tool-schemas.js is loaded from BOTH Next.js webpack AND bare
 * Node (paichart-mcp); bare Node cannot resolve `.ts` extensions without
 * ts-node hooks. Per [[feedback_bare_node_smoke_test]].
 *
 * @see cline_docs/follow-ups/sec-ops-finding-c-args-depth-itemcount-caps.md
 *      for full design context + threshold calibration data.
 */

/**
 * Build a Zod `.superRefine()` callback enforcing depth + leaf-count bounds.
 *
 * @param {Object} options
 * @param {number} options.maxDepth - Maximum nesting depth (typically 8)
 * @param {number} options.maxLeaves - Maximum leaf-value count (typically 100)
 * @returns {(args: unknown, ctx: any) => void} Zod superRefine callback
 */
function makeArgsShapeRefine({ maxDepth, maxLeaves }) {
  return function argsShapeRefine(args, ctx) {
    if (args === undefined || args === null) return;

    const state = { leaves: 0, depthBombHit: false, leafBombHit: false };

    function walk(node, depth) {
      if (state.depthBombHit || state.leafBombHit) return; // short-circuit
      if (depth > maxDepth) {
        ctx.addIssue({
          code: 'custom',
          params: { kind: 'args-depth-bomb', maxDepth, observed: depth },
          message: `Args nesting > ${maxDepth} levels`,
        });
        state.depthBombHit = true;
        return;
      }
      if (Array.isArray(node)) {
        for (const v of node) {
          walk(v, depth + 1);
          if (state.depthBombHit || state.leafBombHit) return;
        }
      } else if (node !== null && typeof node === 'object') {
        for (const v of Object.values(node)) {
          walk(v, depth + 1);
          if (state.depthBombHit || state.leafBombHit) return;
        }
      } else {
        // Leaf — primitive, null is treated as container above (skipped)
        if (++state.leaves > maxLeaves) {
          ctx.addIssue({
            code: 'custom',
            params: { kind: 'args-leaf-bomb', maxLeaves, observed: state.leaves },
            message: `Args > ${maxLeaves} leaf values`,
          });
          state.leafBombHit = true;
        }
      }
    }

    walk(args, 0);
  };
}

module.exports = { makeArgsShapeRefine };
