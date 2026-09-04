/**
 * MCP dual-representation collapse — SHADOW MODE (WS2 phase 1, 2026-08-28).
 *
 * WHAT THE DUPLICATION IS
 * -----------------------
 * A structured-output MCP tool emits its payload TWICE, and this is spec-conformant, not a bug in
 * the service: `structuredContent` carries the parsed object, and a `content[]` entry carries the
 * SAME payload JSON-serialized. The spec's wording is "for backwards compatibility, a tool that
 * returns structured content SHOULD also return the serialized JSON in a TextContent block" —
 * identical in the 2025-06-18 and 2025-11-25 revisions. A SHOULD, for clients predating structured
 * output, with no negotiation mechanism to suppress it at source.
 *
 * Our gateway then embeds the whole downstream response verbatim into OUR tool result, so both
 * copies reach the model's context and both land in `agent_artifacts`. Once nested as payload,
 * NEITHER copy functions as a TextContent fallback for anybody — the back-compat rationale
 * evaporates at the nesting boundary while its bytes remain.
 *
 * WHY THIS FILE DOES NOTHING YET
 * ------------------------------
 * Phase 1 is SHADOW MODE: measure, drop nothing. The equivalence evidence available before this
 * shipped came from PERSISTED artifacts, which are a CONFOUNDED sample — R10 redacts one twin and
 * not the other, so 12 of 86 pairs "differed" purely because of the defect under study. Running the
 * comparator here, PRE-persist and PRE-redaction, produces the unconfounded census that sample
 * could not: every role, every service, real traffic.
 *
 * Do NOT read a low twin RATE from this census as "not worth fixing". Current call volume is
 * dominated by text-only services, while the twin class is where future sensitive traffic goes:
 * alpha-vantage (133 outputSchema declarations), google-secops (68 of ~78 tools) and purple-ai
 * (33 of 33) are registered NOW and all three are structured-output.
 *
 * WHAT PHASE 2 WILL NEED (deliberately not implemented here)
 * ---------------------------------------------------------
 *  - Never drop a sole payload: condition on `structuredContent` being present.
 *  - Per-entry equivalence, key-order-insensitive, nothing else normalized. A server may LEGALLY
 *    put a human-readable summary in `content[]` — "functionally equivalent" is not "equal" — so
 *    differ ⇒ KEEP BOTH. This gate is spec-REQUIRED, not paranoia.
 *  - Skip entirely when `response.isError === true` (downstream errors ride the success envelope).
 *  - Extend `isToolError` to also read `structuredContent?.success === false` FIRST, or app-level
 *    failures silently reclassify FAILED→COMPLETED in mcp_interactions and the successRate EMA.
 *
 * FACTS ARE CONTENT-FREE, ALWAYS
 * ------------------------------
 * These lines go to pino, which sits entirely OUTSIDE R10's persist-scope redaction. A
 * payload-bearing diff log would create a fresh unredacted secret channel with no guard in front of
 * it. Metadata only — lengths, counts, booleans. Never a leaf value, never a diff body.
 *
 * Not tagged `securityEvent`: that tag is reserved for integrity violations and this fires on
 * ordinary traffic. A routinely-firing tag desensitizes the channel.
 *
 * Record: cline_docs/reviews/tool-result-twin-dedup-2026-08-28/FINAL-PLAN.md (WS2)
 */

/** Canonical, key-order-insensitive serialization. Used ONLY to compare, never to emit. */
function canon(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
}

/**
 * Inspect a downstream MCP response for the dual representation. PURE — returns a fact, mutates
 * nothing, drops nothing.
 *
 * @param {*} response - the downstream CallToolResult, as returned by the pooled client
 * @returns {{applicable: boolean, reason?: string, twins: number, equal: number, differ: number,
 *            unparseable: number, dupBytes: number, totalBytes: number}}
 */
function inspectDualRepresentation(response) {
  const out = {
    applicable: false, twins: 0, equal: 0, differ: 0, unparseable: 0, dupBytes: 0, totalBytes: 0,
  };
  if (!response || typeof response !== 'object') { out.reason = 'no-response'; return out; }
  try { out.totalBytes = JSON.stringify(response).length; } catch { out.totalBytes = -1; }

  // Errors ride the SUCCESS envelope; phase 2 will skip them, so the census excludes them too.
  if (response.isError === true) { out.reason = 'is-error'; return out; }
  if (!('structuredContent' in response)) { out.reason = 'no-structured-content'; return out; }
  if (!Array.isArray(response.content)) { out.reason = 'no-content-array'; return out; }

  out.applicable = true;
  const sc = canon(response.structuredContent);
  for (const item of response.content) {
    if (!item || typeof item.text !== 'string') continue;
    const t = item.text;
    if (!/^\s*[{[]/.test(t)) continue; // a prose/summary block is not a twin candidate
    out.twins += 1;
    let parsed;
    try { parsed = JSON.parse(t); } catch { out.unparseable += 1; continue; }
    if (canon(parsed) === sc) { out.equal += 1; out.dupBytes += t.length; } else { out.differ += 1; }
  }
  if (out.twins === 0) { out.applicable = false; out.reason = 'no-serialized-twin'; }
  return out;
}

/**
 * SHADOW MODE entry point. Emits a content-free census line and returns the response UNCHANGED.
 * Never throws — a measurement must not be able to fail a service call.
 */
function shadowObserveDualRepresentation(response, logger, meta) {
  try {
    const fact = inspectDualRepresentation(response);
    if (!fact.applicable) return response;
    logger.info(
      {
        dualRepresentation: {
          service: meta && meta.service,
          tool: meta && meta.tool,
          twins: fact.twins,
          equal: fact.equal,
          differ: fact.differ,
          unparseable: fact.unparseable,
          dupBytes: fact.dupBytes,
          totalBytes: fact.totalBytes,
          dupPct: fact.totalBytes > 0 ? Math.round((1000 * fact.dupBytes) / fact.totalBytes) / 10 : null,
          mode: 'shadow',
        },
      },
      'dual-representation census (shadow — nothing dropped)'
    );
  } catch (e) {
    try { logger.warn({ err: e && e.message }, 'dual-representation census failed (non-fatal)'); } catch { /* ignore */ }
  }
  return response;
}

module.exports = { inspectDualRepresentation, shadowObserveDualRepresentation, canon };
