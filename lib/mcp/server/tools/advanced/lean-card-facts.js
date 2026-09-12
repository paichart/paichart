/** Cap on the MISSING-lines detail. The Facts line is read through head-slice caps (fetch 50KB ->
 *  tool-loop 8KB), so one verbose net must not crowd out the ones the gate reads first. Truncation
 *  is STAMPED (`+N more`), never silent — an elided finding that looks complete is the failure this
 *  whole module exists to prevent. */
const MAX_MISSING_CHARS = 160;

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
  // F-A (2026-09-10): chained-context coverage — rendered whenever chain-capable predecessors exist,
  // predecessors 0 INCLUDED (the case that used to vanish), with the drop reasons.
  if (exec.chainedContext && typeof exec.chainedContext === 'object') {
    const cc = exec.chainedContext;
    const nc = Array.isArray(cc.notChained) && cc.notChained.length
      ? `; notChained: ${cc.notChained.map((n) => `${n.taskId}:${n.reason}`).join(', ')}` : '';
    facts.push(`chainedContext: ${cc.predecessors} of ${cc.chainCapablePredecessors} chain-capable (degraded ${cc.degradedPredecessors}${nc})`);
  }
  // H-4 (2026-09-10): marker presence — which machine-parsed blocks the platform found (a fact).
  if (exec.markerPresence && typeof exec.markerPresence === 'object') {
    const mp = exec.markerPresence;
    const t = (b) => (b === true ? '✓' : '✗');
    facts.push(`markerPresence: harvested ${t(mp.harvestedAllocations)} derived ${t(mp.derivedValues)} consumed ${t(mp.consumedValues)}`);
  }
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
  // ROLLBACK CONTAINMENT (net #3, 2026-09-11) — rendered from the FIRST commit that stamps it.
  // §5.1 convention (ruled 2026-09-11): a net ships with its render or with a recorded reason for
  // having none; it never passes through a stamped-and-invisible interval. Two earlier nets ARE
  // stamped and whitelisted while rendering nowhere here; they are remediated when the net registry
  // lands, and this net was not allowed to become a third.
  //
  // ⚠️ THOSE TWO ARE DELIBERATELY NOT NAMED IN THIS COMMENT. The execution-facts discovery carries
  // an `expect 0` tripwire that greps this file for their identifiers, so that a non-zero result
  // means the gap was CLOSED. Naming them in prose makes that grep non-zero while the gap is still
  // open — a checking tool made to lie by a comment about it. Same class as the derivation
  // -containment discovery's "no backtick in this comment" note.
  //
  // ⚠️ NO `ABSENT` TOKEN HERE, and that is a RULING, not an oversight (H2, 2026-09-11). While the
  // fact gates nothing, ABSENT means "not yet produced" — a leg whose Author predates this net, or
  // one mid-flight across the deploy — so a blocking-flavoured token would be false. IF this ever
  // becomes a `programReleasable` conjunct, ABSENT must flip to fail-closed in the SAME commit
  // (the G2 precedent set by the derivation fact's own disposition token above — named indirectly
  // because a documented mention-count greps this file for that symbol); adopting the conjunct and
  // adopting fail-closed absence are one decision, not two.
  if (exec.rollbackContainment && typeof exec.rollbackContainment === 'object') {
    const rc = exec.rollbackContainment;
    if (rc.checked) {
      const missing = Array.isArray(rc.missing) ? rc.missing : [];
      // RENDER WHAT, NOT JUST HOW MANY (the F7 lesson). A count tells a reasoner something is wrong
      // and denies it the subject; Node C, asked to verify an unnamed line, verified the nearest
      // thing and reported "nothing anomalous". Capped because this line is size-sensitive.
      let detail = `${rc.restoreLinesFound}/${rc.restoreLinesTotal} restore lines found in harvest`;
      if (missing.length) {
        const names = missing.map((m) => (m && typeof m === 'object' ? m.line : String(m)))
          .filter((s) => typeof s === 'string' && s.length);
        let shown = [];
        let used = 0;
        for (const n of names) {
          if (used + n.length > MAX_MISSING_CHARS) break;
          shown.push(n);
          used += n.length + 2;
        }
        const more = names.length - shown.length;
        detail += ` — MISSING: ${shown.join(', ')}${more > 0 ? `, +${more} more` : ''}`;
      } else {
        detail += ' (0 missing)';
      }
      facts.push(`rollbackContainment: ${detail}`);
    } else {
      facts.push(`rollbackContainment: NOT checked (${rc.reason || 'no reason given'})`);
    }
    const rdp = rc.rollbackDisposition;
    if (rdp && typeof rdp === 'object' && rdp.disposition) {
      facts.push(`rollbackDisposition: ${rdp.disposition} (${rdp.reason || 'no reason given'})`);
    }
  }
  // ── dialectLint + contractPropagation (2026-09-12, stage 2b) ──────────────────────────────
  //
  // STAMPED AND WHITELISTED SINCE 2026-08-25 / 2026-08-26, AND RENDERED NOWHERE UNTIL TODAY. Both
  // survived every parity suite because a fact that is written correctly and read by nobody is
  // green at every layer in isolation — the A1/F7 class. The registry's render-required field is
  // the mechanical end of that state; these two blocks are the debt it was built to repay.
  //
  // Render WHAT, not how many. A bare count tells a reasoner something is wrong and denies it the
  // subject, which is how Node C came to "verify" the nearest thing and report nothing anomalous.
  if (exec.dialectLint && typeof exec.dialectLint === 'object') {
    const dl = exec.dialectLint;
    if (dl.checked !== true) {
      facts.push(`dialectLint: NOT checked (${dl.reason || 'no reason given'})`);
    } else {
      const v = Array.isArray(dl.violations) ? dl.violations : [];
      const parts = [];
      if (v.length) {
        const named = v.slice(0, 3).map((x) => `${x.token || '?'}${typeof x.line === 'number' ? `@L${x.line}` : ''}`).join(', ');
        parts.push(`${v.length} banned (${named}${v.length > 3 ? `, +${v.length - 3} more` : ''})`);
      } else {
        parts.push('0 banned');
      }
      const t = dl.transcription;
      if (t && typeof t.linesRequired === 'number' && t.linesRequired > 0) {
        // BOTH counts, deliberately. A REMOVAL leg legitimately reads near-zero and a DEPLOY leg
        // that dropped a line reads high-but-not-complete; naming only the misses makes those two
        // indistinguishable, which is the false positive dialect-lint's own SCOPE_NOTE warns about.
        const miss = Array.isArray(t.missing) ? t.missing : [];
        let seg = `transcription ${t.linesPresent || 0}/${t.linesRequired}`;
        if (miss.length) {
          let shown = miss.slice(0, 2).join(', ');
          if (shown.length > MAX_MISSING_CHARS) shown = `${shown.slice(0, MAX_MISSING_CHARS - 1)}…`;
          seg += ` (missing: ${shown}${miss.length > 2 ? `, +${miss.length - 2} more` : ''})`;
        }
        parts.push(seg);
      }
      facts.push(`dialectLint: ${parts.join(' · ')}`);
    }
  }
  if (exec.contractPropagation && typeof exec.contractPropagation === 'object') {
    const cp = exec.contractPropagation;
    if (cp.checked !== true) {
      facts.push(`contractPropagation: NOT checked (${cp.reason || 'no reason given'})`);
    } else {
      const kids = Array.isArray(cp.children) ? cp.children : [];
      const executed = kids.filter((k) => k.executed);
      const starved = executed.filter((k) => !k.hasInterfaceContract);
      if (!starved.length) {
        facts.push(`contractPropagation: ${executed.length} of ${executed.length} executed children held the contract`);
      } else {
        const first = starved[0];
        const absent = Array.isArray(first.canonicalLinesAbsentFromBrief) ? first.canonicalLinesAbsentFromBrief.length : 0;
        facts.push(`contractPropagation: ${starved.length} of ${executed.length} children STARVED (${first.role || '?'} — ${absent} canonical lines absent from brief)`);
      }
    }
  }
  // contractApplicability rides NESTED inside both facts above (E3b) and is rendered as their
  // qualifier rather than as a fact of its own — a standalone pipeline's absent contract is
  // BY DESIGN, and a reader told only "no-contract" grades it as a gap (9 of 37 archived legs did).
  for (const key of ['dialectLint', 'contractPropagation']) {
    const ca = exec[key] && typeof exec[key] === 'object' ? exec[key].contractApplicability : null;
    if (ca && typeof ca === 'object' && ca.expected === false) {
      facts.push(`contractApplicability(${key}): none expected (${ca.basis || 'no basis given'})`);
      break;
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
