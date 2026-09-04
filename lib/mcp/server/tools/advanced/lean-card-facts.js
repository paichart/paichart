/**
 * Lean-card Facts line — SINGLE SOURCE (2026-07-18, exec-review E advisory).
 *
 * Renders the `**Facts:** ...` line for execution "lean cards" from the hoisted
 * RESULT_JSON_SUMMARY_KEYS fields on `exec` (confidenceScore, reviewerVerdict,
 * derivationContainment). Born in run-8 GAP-1 (2026-07-18): the hoisted facts
 * existed on `exec` but neither card printed them, so the program gate's
 * derivation conjunct silently degraded to Node-C-only. The block was then
 * duplicated verbatim in task-action-handler.js AND agent-results-handler.js —
 * this module is the dedup. Consumers: those two handlers ONLY (grep before
 * adding more). The pov-program protocol's SYNTHESIZE Step 2 reads this line —
 * its exact shape is load-bearing for the program gate; change it only with a
 * paired protocol review (fixture test pins the format:
 * scripts/test-lean-card-facts.ts).
 *
 * @param {object|null|undefined} exec - execution row with hoisted summary fields
 * @returns {string|null} the full `**Facts:** ...` line, or null when no facts
 */
function leanFactsLine(exec) {
  if (!exec) return null;
  const facts = [];
  if (typeof exec.confidenceScore === 'number') facts.push(`confidence: ${exec.confidenceScore}`);
  if (exec.reviewerVerdict && typeof exec.reviewerVerdict === 'object') {
    const rv = exec.reviewerVerdict;
    const blocking = Array.isArray(rv.blocking) ? rv.blocking.length : 0;
    facts.push(`reviewerVerdict: ${rv.approved ? 'approved' : 'rejected'}${blocking ? ` (${blocking} blocking)` : ''}`);
  }
  if (exec.derivationContainment && typeof exec.derivationContainment === 'object') {
    const dc = exec.derivationContainment;
    // `harvestedCount` is the DERIVING TEST for a no-derived-values-block leg (present ⇒ harvested a
    // pool and emitted nothing ⇒ refused/dropped ⇒ blocking; absent ⇒ nothing to derive ⇒ benign).
    // It MUST render here: SYNTHESIZE Step 2 reads the fact off this card, so a field the card omits
    // is a field the gate cannot gate on — the exact failure that made `upstreamContainment` inert on
    // Run 15 (and run-8 GAP-1 before it). Rendered only when present, so absent stays distinguishable
    // from zero and the no-harvest shape is byte-identical to before.
    const harvestSuffix = typeof dc.harvestedCount === 'number' ? `, harvestedCount ${dc.harvestedCount}` : '';
    // P0 FIX 2026-08-03 — `violations` MUST render on the checked:FALSE branch too.
    // It did not, and `consumed-value-mismatch` is stamped ONLY inside `checked === false`
    // (derivation-containment-enrichment.ts:272). The two conditions are mutually exclusive, so that
    // violation class was STRUCTURALLY UNRENDERABLE: a consuming leg that applied a /30 where upstream
    // derived a /31 produced a Facts line BYTE-IDENTICAL to a clean leg, and the consuming-leg
    // exception then positively cleared it. `cd8ad793` ("acceptance check 1 made mechanical") shipped
    // inert for that reason, and its body's claim of "no new gate wiring" was false at this boundary.
    // Found by the 2026-08-03 taxonomy panel (boundary-contract F1), runtime-proven before the fix.
    // Instance 4 of this module's stamp -> render -> gate class; see the two comments below for 1-3.
    // Empty when there are no violations, so every previously-rendered shape stays byte-identical.
    const violationSuffix = (dc.violations || []).length ? `, ${dc.violations.length} violation(s)` : '';
    // F7 FIX 2026-08-03 — RENDER WHAT IS UNCOVERED, not just how many.
    // VT-14 Run 23: a `vlan` value landed in `unsupported[]`, the card said `1 unsupported`, and Node C
    // — instructed by `needs-node-c` to decide and state what it relied on — discharged the obligation
    // by re-verifying the CIDR derivation, which was already covered and never in question. It then
    // reported "observed nothing anomalous". It was asked to verify a derivation the card refused to
    // name. An escape hatch that cannot say what escaped is a rubber stamp with extra steps.
    // Kinds only, deduped and capped: the VALUES can be long and this line is size-sensitive, and the
    // kind is what tells a reader whether the gap is one they can reason about at all.
    const unsupportedKinds = [...new Set((dc.unsupported || [])
      .map(u => (u && typeof u === 'object' ? u.kind : undefined))
      .filter(k => typeof k === 'string' && k.length > 0))];
    const unsupportedSuffix = (dc.unsupported || []).length
      ? `, ${dc.unsupported.length} unsupported${unsupportedKinds.length
          ? ` (${unsupportedKinds.slice(0, 3).join(', ')}${unsupportedKinds.length > 3 ? `, +${unsupportedKinds.length - 3} more` : ''})`
          : ''}`
      : '';
    facts.push(`derivationContainment: ${dc.checked
      ? `checked, ${(dc.violations || []).length} violation(s)${unsupportedSuffix}`
      : `NOT checked (${dc.reason || 'no reason given'}${harvestSuffix}${violationSuffix})`}`);
    // Consuming-leg attribution (2026-07-29). APPEND-ONLY — the segment above is fixture-pinned
    // and load-bearing for the program gate; this adds a suffix and never alters it.
    // WHY IT MUST BE HERE: pov-program SYNTHESIZE Step 2 tells the gate to read the fact off THIS
    // card, so a field absent here is a field the gate cannot gate on. The v1.0.18 taxonomy makes
    // `harvest-block-missing-or-unparseable` non-blocking only when upstreamContainment.green — and
    // treats ABSENT as fail-closed, so omitting it here would silently re-park every correct
    // sequenced run (the run-8 GAP-1 failure mode this whole module exists to prevent).
    // G2 (2026-08-03) — ABSENCE MUST BE A POSITIVE TOKEN ON THE CARD, not a rule in prose.
    // Every other segment here is conditional, so an absent object prints NOTHING: no token to read,
    // no anomaly to notice. That is the Run-15 shape verbatim (a tier asserted green:true for a field
    // absent from the artifact), and a derived disposition makes it strictly worse because it is more
    // trusted — a reader seeing no disposition beside a benign-looking `NOT checked (...)` has been
    // handed a card that reads clean. Rendered from the ABSENCE itself, at render time.
    const cdp = dc.containmentDisposition;
    // Scope fact (2026-08-19, morning-list #5): the disposition is a PROGRAM-release conjunct —
    // on a standalone pipeline (e.g. an artifact-synthesis run, which has no author child by
    // design) a 'blocking' disposition gates nothing and read as a scary anomaly on an approved
    // run. The suffix states the consumer, true in both contexts; it weakens nothing (the
    // program gate still reads the disposition word itself). The ABSENT token is untouched —
    // its G2 wording is load-bearing.
    facts.push(`containmentDisposition: ${cdp && typeof cdp === 'object' && cdp.disposition
      ? `${cdp.disposition} (${cdp.reason || 'no reason given'}) [program-gate conjunct]`
      : 'ABSENT ⇒ treat as blocking'}`);

    const uc = dc.upstreamContainment;
    if (uc && typeof uc === 'object') {
      const legs = Array.isArray(uc.legs) ? uc.legs : [];
      facts.push(`upstreamContainment: ${uc.green ? 'green' : 'NOT green'} (${legs.length} leg${legs.length === 1 ? '' : 's'})`);
    }
  }
  return facts.length ? `**Facts:** ${facts.join(' | ')}` : null;
}

/**
 * A5 FIX 2026-08-03 — the gate's read surface must not be a TRUNCATION ARTIFACT.
 *
 * `leanFactsLine` was reachable only from the lean-summary builders, which run only when
 * `!verbose && formattedText.length > 3000`. The non-truncated formatter renders no containment
 * fields at all (grep `derivationContainment` in analytics-formatters.js: zero hits). So the
 * containment fact — the thing pov-program SYNTHESIZE Step 2 tells the gate to read off this card —
 * was invisible in TWO common cases:
 *   1. a response that happens to come in under 3,000 chars, and
 *   2. ANY `verbose: true` call, which skips the lean path entirely.
 * In both, the gate is told to read a fact that is not on the page. Found by boundary-contract F6
 * (taxonomy panel, 2026-08-03); it also bounds what the A1 render fix buys, since A1 renders into a
 * line that may not exist.
 *
 * Idempotent by construction: the lean summary already embeds the line, so this is a no-op there.
 *
 * @param {string} text  the response body about to be returned
 * @param {object} exec  the execution carrying the hoisted fact fields
 * @returns {string} text, with the Facts line appended when it was missing
 */
function appendFactsLine(text, exec) {
  if (typeof text !== 'string' || !text) return text;
  if (text.includes('**Facts:** ')) return text; // lean summary already carries it
  const line = leanFactsLine(exec);
  return line ? `${text}\n\n${line}` : text;
}

module.exports = { leanFactsLine, appendFactsLine };
