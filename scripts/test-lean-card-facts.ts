#!/usr/bin/env ts-node
/**
 * Lean-card Facts line tests (2026-07-18)
 *
 * Fixture-pins the shared `leanFactsLine` helper (lib/mcp/server/tools/advanced/
 * lean-card-facts.js) — the exec-review E advisory ("no automated pin covers
 * either card builder") + the dedup of the run-8 GAP-1 block.
 *
 * The line's exact shape is LOAD-BEARING: pov-program SYNTHESIZE Step 2 reads
 * the card's **Facts:** line for the derivation conjunct. A format change here
 * must come with a paired protocol review.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { leanFactsLine, appendFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');
import * as fs from 'fs';
import * as path from 'path';

console.log('🃏 Lean-card Facts line tests\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function expectEq(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- Fixture truth table ---

test('F1: all three facts render in canonical order with " | " separator', () => {
  expectEq(
    leanFactsLine({
      confidenceScore: 92,
      reviewerVerdict: { approved: true, blocking: [] },
      derivationContainment: { checked: true, violations: [], unsupported: [] },
    }),
    '**Facts:** confidence: 92 | reviewerVerdict: approved | derivationContainment: checked, 0 violation(s) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F2: rejected verdict with blocking count', () => {
  expectEq(
    leanFactsLine({ reviewerVerdict: { approved: false, blocking: ['a', 'b'] } }),
    '**Facts:** reviewerVerdict: rejected (2 blocking)'
  );
});

test('F3: containment violations + unsupported render both counts', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: true, violations: [{}], unsupported: [{}, {}] } }),
    '**Facts:** derivationContainment: checked, 1 violation(s), 2 unsupported | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4: checked:false renders NOT checked with reason', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block' } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

// ── violations on the checked:FALSE branch (2026-08-03, P0) ─────────────────────────────────────
// `consumed-value-mismatch` is stamped ONLY inside `checked === false`
// (derivation-containment-enrichment.ts:272), and this line used to render `violations` ONLY on the
// checked:true branch. Mutually exclusive ⇒ the class was structurally unrenderable, and a consuming
// leg that applied a /30 where upstream derived a /31 produced a line BYTE-IDENTICAL to a clean leg —
// which the consuming-leg exception then positively cleared. `cd8ad793` shipped inert for that reason.
// These are the fixtures whose absence let it ship: there was no checked:false + violations case.

test('F4-P0: checked:false + violations renders the count (consumed-value-mismatch reaches the gate)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'harvest-block-missing-or-unparseable',
      violations: [{ reason: 'consumed-value-mismatch', consumed: '10.99.0.16/30' }],
      upstreamContainment: { green: true, legs: [{ taskId: 'p1', checked: true, violations: 0 }] },
    } }),
    '**Facts:** derivationContainment: NOT checked (harvest-block-missing-or-unparseable, 1 violation(s)) | containmentDisposition: ABSENT ⇒ treat as blocking | upstreamContainment: green (1 leg)'
  );
});

test('F4-P0b: the DANGEROUS pair (arch c-iii) — soft reason + ABSENT harvestedCount + a violation', () => {
  // Runs 17, 18 and 20 all stamped this shape. Clause 5 reads ABSENT ⇒ benign; clause 1 says BLOCK.
  // The gate can only see the conflict if the violation renders — before this fix it could not.
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'no-derived-values-block',
      violations: [{ reason: 'consumed-value-mismatch' }],
    } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block, 1 violation(s)) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4-P0c: BACK-COMPAT — checked:false with NO violations is byte-identical to before the fix', () => {
  // The fix must be append-only. An empty violations array and an absent one both render nothing.
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block', violations: [] } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block' } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4-P0d: violations render ALONGSIDE harvestedCount, in stamp order', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
      violations: [{ reason: 'consumed-value-mismatch' }, { reason: 'consumed-value-mismatch' }],
    } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block, harvestedCount 6, 2 violation(s)) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

// ── Consuming-leg attribution suffix (2026-07-29, Run-14) ───────────────────────────────────────
// pov-program SYNTHESIZE Step 2 reads the gate's containment fact off THIS card. The v1.0.18
// taxonomy treats an absent upstreamContainment as fail-closed, so if these do not render, every
// correct sequenced run re-parks — the run-8 GAP-1 failure mode this module exists to prevent.

test('F4b: consuming leg — green upstream renders the attribution suffix (the Run-14 shape)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'harvest-block-missing-or-unparseable',
      upstreamContainment: { green: true, legs: [{ taskId: 'p1', checked: true, violations: 0 }] },
    } }),
    '**Facts:** derivationContainment: NOT checked (harvest-block-missing-or-unparseable) | containmentDisposition: ABSENT ⇒ treat as blocking | upstreamContainment: green (1 leg)'
  );
});

test('F4c: NOT green renders explicitly — never silently omitted (the broken-harvest deriver)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'harvest-block-missing-or-unparseable',
      upstreamContainment: { green: false, legs: [] },
    } }),
    '**Facts:** derivationContainment: NOT checked (harvest-block-missing-or-unparseable) | containmentDisposition: ABSENT ⇒ treat as blocking | upstreamContainment: NOT green (0 legs)'
  );
});

test('F4d: no upstreamContainment ⇒ suffix ABSENT (F4 shape unchanged — back-compat pin)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block' } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4e: harvestedCount renders — the DERIVING TEST must reach the gate', () => {
  // Present => the leg harvested a pool and emitted no derivation => refused/dropped => BLOCKING.
  // If the card omits it the gate cannot gate on it — the inertness that hit upstreamContainment on
  // Run 15 and the hoisted facts in run-8 GAP-1.
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block', harvestedCount: 6 } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block, harvestedCount 6) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4f: harvestedCount 0 renders (parsed-but-empty pool is STILL deriving — not the same as absent)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block', harvestedCount: 0 } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block, harvestedCount 0) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F4g: no harvestedCount ⇒ suffix ABSENT (byte-identical to before — back-compat pin)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block' } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F5: checked:false without reason renders the no-reason placeholder', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false } }),
    '**Facts:** derivationContainment: NOT checked (no reason given) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F6: confidence 0 renders (number check, not truthiness)', () => {
  expectEq(leanFactsLine({ confidenceScore: 0 }), '**Facts:** confidence: 0');
});

test('F7: no facts → null (caller prints nothing)', () => {
  expectEq(leanFactsLine({ status: 'SUCCESS' }), null);
  expectEq(leanFactsLine(null), null);
  expectEq(leanFactsLine(undefined), null);
});

test('F8: non-object reviewerVerdict / derivationContainment are skipped, not thrown', () => {
  expectEq(leanFactsLine({ reviewerVerdict: 'approved', derivationContainment: 'checked' }), null);
});

test('F9: string confidenceScore is skipped (typeof number gate)', () => {
  expectEq(leanFactsLine({ confidenceScore: '92' }), null);
});

// --- Call-site wiring pins (dedup must not regress to inline copies) ---


// ─── kind: "asn" (2026-08-02) — §3e of the asn-kind plan ──────────────────────────────────────
// The plan predicted ZERO card edits. PROVEN here rather than assumed, because an unrendered fact
// is a fact the gate cannot gate on, and that exact inertness has bitten three times
// (12a07144 upstreamContainment, 436d6d6d harvestedCount, run-8 GAP-1).

test('asn violations reach the card the gate reads — as a COUNT, which is all the taxonomy needs', () => {
  const line = leanFactsLine({ confidenceScore: 91, derivationContainment: {
    checked: true,
    violations: [
      { reason: 'asn-not-member', derived: '64999', kind: 'asn', device: 'ceos1' },
      { reason: 'asn-reserved-range', derived: '23456', kind: 'asn', policyClass: 'as-trans' },
    ],
  }});
  if (!line.includes('checked, 2 violation(s)')) throw new Error(`the gate blocks on a non-empty count, reason-agnostically; got: ${line}`);
});

test('THE FALSE-PARK CASE: an ASN-only harvest renders NO harvestedCount, so the card reads benign', () => {
  // §3c makes harvestedCount ABSENT for an ASN-only harvest. The card renders it conditionally, so
  // the A7 ABSENT-⇒-benign rule applies without any card change. This is why §3e needed no edit.
  const line = leanFactsLine({ confidenceScore: 88, derivationContainment: {
    checked: false, reason: 'no-derived-values-block', harvestedByKind: { asn: 2 },
  }});
  if (!(!line.includes('harvestedCount'))) throw new Error(`an ASN-only harvest must not present an address-pool count on the card; got: ${line}`);
  if (!line.includes('NOT checked (no-derived-values-block)')) throw new Error(`got: ${line}`);
});

test('CONTRAST: a cidr harvest with no derivation still renders harvestedCount ⇒ blocking', () => {
  const line = leanFactsLine({ confidenceScore: 88, derivationContainment: {
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
  }});
  if (!(line.includes('harvestedCount 6'))) throw new Error(`the A7 deriving test must still be visible for cidr; got: ${line}`);
});

const REPO_ROOT = path.resolve(__dirname, '..');
const taskActionSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/mcp/server/tools/advanced/task-action-handler.js'), 'utf-8');
const agentResultsSource = fs.readFileSync(
  path.join(REPO_ROOT, 'lib/mcp/server/tools/advanced/agent-results-handler.js'), 'utf-8');

test('W4: COUPLING — every branch that stamps `violations` has a card branch that renders them', () => {
  // THE GUARD THAT WOULD HAVE CAUGHT THE 2026-08-03 P0. `consumed-value-mismatch` is stamped inside
  // `if (fact.checked === false)` in the enrichment, while the card rendered `violations` only on the
  // checked:TRUE branch — mutually exclusive, so the class was structurally unrenderable and
  // `cd8ad793` shipped inert. Neither file was wrong in isolation; the PAIRING was. Nothing tested it.
  const enrichment = fs.readFileSync(
    path.join(REPO_ROOT, 'lib/agents/harness/derivation-containment-enrichment.ts'), 'utf-8');
  const card = fs.readFileSync(
    path.join(REPO_ROOT, 'lib/mcp/server/tools/advanced/lean-card-facts.js'), 'utf-8');

  // Does the enrichment write violations onto a checked:false fact?
  const stampsOnFalse = /checked\s*===\s*false/.test(enrichment) && /violations/.test(enrichment);
  if (!stampsOnFalse) return; // enrichment no longer does this — the coupling is moot, not broken.

  // Then the card's checked:FALSE branch must reference violations.
  const falseBranch = card.slice(card.indexOf('NOT checked ('), card.indexOf('NOT checked (') + 200);
  if (!/violationSuffix|violations/.test(falseBranch)) {
    throw new Error(
      'enrichment stamps violations on checked:false facts, but the card\'s checked:false branch ' +
      'renders none — a violation class the gate cannot see. This is the cd8ad793 defect.');
  }
});

// ── F7: unsupported IDENTITIES reach the gate, not just a count (2026-08-03, VT-14 Run 23) ─────
// Run 23 injected a `vlan` value; the card said `1 unsupported`; Node C was told by `needs-node-c` to
// decide and state what it relied on, and discharged the obligation by re-verifying the CIDR
// derivation — already covered, never in question — then reported "observed nothing anomalous".
// It was asked to verify a derivation the card refused to name.

test('F7-1: the kind is rendered beside the count (the VT-14 Run 23 shape)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: true, violations: [], unsupported: [{ kind: 'vlan', value: '100' }],
    } }),
    '**Facts:** derivationContainment: checked, 0 violation(s), 1 unsupported (vlan) | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F7-2: kinds are DEDUPED — three vlan entries name one kind, not three', () => {
  const line = leanFactsLine({ derivationContainment: {
    checked: true, violations: [], unsupported: [{ kind: 'vlan' }, { kind: 'vlan' }, { kind: 'vlan' }],
  } });
  expectEq(line.includes('3 unsupported (vlan)'), true);
});

test('F7-3: many kinds are CAPPED — the line is size-sensitive and feeds a truncation-gated path', () => {
  const line = leanFactsLine({ derivationContainment: {
    checked: true, violations: [],
    unsupported: [{ kind: 'a' }, { kind: 'b' }, { kind: 'c' }, { kind: 'd' }, { kind: 'e' }],
  } });
  expectEq(line.includes('5 unsupported (a, b, c, +2 more)'), true);
});

test('F7-4: BACK-COMPAT — entries with no kind render the bare count, exactly as before', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: true, violations: [], unsupported: [{}, {}] } }),
    '**Facts:** derivationContainment: checked, 0 violation(s), 2 unsupported | containmentDisposition: ABSENT ⇒ treat as blocking'
  );
});

test('F7-5: malformed unsupported entries do not crash or emit an empty bracket', () => {
  for (const bad of [[null], ['str'], [42], [{ kind: '' }], [{ kind: 7 }]]) {
    const line = leanFactsLine({ derivationContainment: { checked: true, violations: [], unsupported: bad } });
    expectEq(line.includes('1 unsupported'), true);
    expectEq(line.includes('()'), false);
  }
});

// ── G2: the disposition token renders when PRESENT, and absence is a positive token ────────────
// boundary-contract G2: every other segment on this line is conditional, so an absent object used to
// print NOTHING — no token to read, no anomaly to notice. That is the Run-15 shape (a tier asserted
// green:true for a field absent from the artifact), and a DERIVED disposition makes it worse because
// it is more trusted. Absence is now a positive string, computed at render time from the absence.

test('G2-1: a stamped disposition renders with its reason', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'harvest-block-missing-or-unparseable',
      containmentDisposition: { disposition: 'benign', reason: 'consuming-leg-upstream-discharged' },
      upstreamContainment: { green: true, legs: [{ taskId: 'p1' }] },
    } }),
    '**Facts:** derivationContainment: NOT checked (harvest-block-missing-or-unparseable) | containmentDisposition: benign (consuming-leg-upstream-discharged) [program-gate conjunct] | upstreamContainment: green (1 leg)'
  );
});

test('G2-2: a BLOCKING disposition renders as blocking, not as a bare reason', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
      containmentDisposition: { disposition: 'blocking', reason: 'refusal-or-drop' },
    } }),
    '**Facts:** derivationContainment: NOT checked (no-derived-values-block, harvestedCount 6) | containmentDisposition: blocking (refusal-or-drop) [program-gate conjunct]'
  );
});

test('G2-3: needs-node-c is rendered distinctly — a boolean could not carry it (G5)', () => {
  expectEq(
    leanFactsLine({ derivationContainment: {
      checked: true, violations: [], unsupported: [{ kind: 'vlan' }],
      containmentDisposition: { disposition: 'needs-node-c', reason: 'unsupported-not-mechanically-covered' },
    } }),
    '**Facts:** derivationContainment: checked, 0 violation(s), 1 unsupported (vlan) | containmentDisposition: needs-node-c (unsupported-not-mechanically-covered) [program-gate conjunct]'
  );
});

test('G2-4: ABSENCE is a positive token, never silence', () => {
  const line = leanFactsLine({ derivationContainment: { checked: false, reason: 'no-derived-values-block' } });
  expectEq(line.includes('containmentDisposition: ABSENT ⇒ treat as blocking'), true);
});

test('G2-5: a malformed disposition object falls back to the ABSENT token, not a crash or a blank', () => {
  for (const bad of [{}, { disposition: null }, 'nope', 42, []]) {
    const line = leanFactsLine({ derivationContainment: { checked: true, containmentDisposition: bad } });
    expectEq(line.includes('containmentDisposition: ABSENT ⇒ treat as blocking'), true);
  }
});

// ── A5: the Facts line must not be a truncation artifact (2026-08-03) ──────────────────────────
// leanFactsLine was reachable ONLY from the lean-summary builders, which run only when
// `!verbose && length > 3000`. A small response and any verbose:true call returned NO **Facts:**
// line, while the taxonomy tells the gate to read the fact off exactly that line.

const EXEC_WITH_FACT = { confidenceScore: 92, derivationContainment: {
  checked: false, reason: 'no-derived-values-block', violations: [{ reason: 'consumed-value-mismatch' }] } };

test('A5-1: appendFactsLine adds the line to a body that lacks it (the sub-3000 / verbose path)', () => {
  const out = appendFactsLine('✅ SUCCESS — abc123 (4s)', EXEC_WITH_FACT);
  expectEq(out.includes('**Facts:**'), true);
  expectEq(out.includes('1 violation(s)'), true);
  expectEq(out.startsWith('✅ SUCCESS — abc123 (4s)'), true); // original body preserved, appended not replaced
});

test('A5-2: IDEMPOTENT — a body that already carries the line is untouched (the lean-summary path)', () => {
  const lean = `x\n\n${leanFactsLine(EXEC_WITH_FACT)}`;
  expectEq(appendFactsLine(lean, EXEC_WITH_FACT), lean);
});

test('A5-3: no fact ⇒ body unchanged (never appends an empty or misleading line)', () => {
  expectEq(appendFactsLine('plain body', {}), 'plain body');
  expectEq(appendFactsLine('plain body', undefined), 'plain body');
});

test('A5-4: non-string / empty bodies are safe', () => {
  expectEq(appendFactsLine('', EXEC_WITH_FACT), '');
  expectEq(appendFactsLine(null as never, EXEC_WITH_FACT), null);
});

test('A5-5: BOTH handlers call appendFactsLine outside the lean-summary branch', () => {
  // The whole point is that it runs on the paths the lean summary does NOT cover. If a future edit
  // moves these calls inside the `length > 3000` branch, the fix silently reverts.
  for (const [name, src] of [['task-action', taskActionSource], ['agent-results', agentResultsSource]] as const) {
    if (!src.includes('appendFactsLine(')) {
      throw new Error(`${name}-handler no longer calls appendFactsLine — the containment fact is invisible again on the non-truncated path`);
    }
  }
});

test('W1: both handlers require the shared helper', () => {
  for (const [name, src] of [['task-action', taskActionSource], ['agent-results', agentResultsSource]] as const) {
    if (!src.includes("require('./lean-card-facts')")) {
      throw new Error(`${name}-handler does not require ./lean-card-facts`);
    }
  }
});

test('W2: no inline Facts-block remnant in either handler (drift guard)', () => {
  for (const [name, src] of [['task-action', taskActionSource], ['agent-results', agentResultsSource]] as const) {
    if (src.includes('**Facts:** ${') || /leanFacts\.push|facts\.push\(`confidence/.test(src)) {
      throw new Error(`${name}-handler still contains an inline Facts-line copy`);
    }
  }
});

test('W3: helper is the only site rendering the **Facts:** prefix under lib/mcp/server', () => {
  const dir = path.join(REPO_ROOT, 'lib/mcp/server');
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js') && fs.readFileSync(p, 'utf-8').includes('`**Facts:** ')) hits.push(p);
    }
  };
  walk(dir);
  if (hits.length !== 1 || !hits[0].endsWith('lean-card-facts.js')) {
    throw new Error(`Expected exactly lean-card-facts.js to render the prefix, found: ${hits.join(', ') || 'none'}`);
  }
});

// --- Summary ---
console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
if (failed > 0) process.exit(1);
