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
import { buildExecutionResultJson, pickResultJsonSummary, RESULT_JSON_SUMMARY_KEYS, ExecutionResultJsonInput, ChainedContextSignal } from '../lib/services/execution-artifacts';

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

test('F4b (H-3): a program parent renders its tier-inapplicable fact as benign, not as a hard gap', () => {
  expectEq(
    leanFactsLine({ derivationContainment: { checked: false, reason: 'program-tier', tier: 'program', applicable: false,
      containmentDisposition: { disposition: 'benign', reason: 'program-tier-inapplicable' } } }),
    '**Facts:** derivationContainment: NOT checked (program-tier) | containmentDisposition: benign (program-tier-inapplicable) [program-gate conjunct]'
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

// --- net #3: rollbackContainment (2026-09-11) ---
// §5.1 convention: a net ships WITH its render. These are COUPLING assertions — the enrichment's
// write site and this card's read site must stay paired. The 2026-08-03 A1 defect was that neither
// file was wrong in isolation; the PAIRING was, and nothing tested it. A test that only checked
// "a render function exists" would have passed straight through that.

test('RC1: a clean fact renders counts AND the disposition', () => {
  expectEq(
    leanFactsLine({
      rollbackContainment: {
        checked: true, restoreLinesFound: 51, restoreLinesTotal: 51, missing: [],
        rollbackDisposition: { disposition: 'benign', reason: 'all-restore-lines-found' },
      },
    }),
    '**Facts:** rollbackContainment: 51/51 restore lines found in harvest (0 missing) | rollbackDisposition: benign (all-restore-lines-found)'
  );
});

test('RC2: missing lines render WHAT is missing, not just how many (the F7 lesson)', () => {
  const line = leanFactsLine({
    rollbackContainment: {
      checked: true, restoreLinesFound: 24, restoreLinesTotal: 26,
      missing: [{ line: 'endpoint: 0.0.0.0:9999' }, { line: 'batch: {timeout: 5s}' }],
      rollbackDisposition: { disposition: 'needs-node-c', reason: 'unmatched-restore-lines' },
    },
  }) as string;
  for (const needle of ['24/26', 'MISSING:', 'endpoint: 0.0.0.0:9999', 'batch: {timeout: 5s}', 'needs-node-c']) {
    if (!line.includes(needle)) throw new Error(`Facts line must name ${needle}; got: ${line}`);
  }
});

test('RC3: a long MISSING list is CAPPED and the truncation is STAMPED, never silent', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ line: `config/line/number-${i}-padded-out-a-bit` }));
  const line = leanFactsLine({
    rollbackContainment: { checked: true, restoreLinesFound: 1, restoreLinesTotal: 41, missing: many },
  }) as string;
  if (!/\+\d+ more/.test(line)) {
    throw new Error(`truncation must be stamped — an elided finding that looks complete is the failure this module exists to prevent; got: ${line}`);
  }
  if (line.length > 400) throw new Error(`Facts segment is size-sensitive; got ${line.length} chars`);
});

test('RC4: NOT-checked renders the NAMED reason — absence is never a silent pass', () => {
  const line = leanFactsLine({
    rollbackContainment: {
      checked: false, reason: 'no-restore-form-lines',
      rollbackDisposition: { disposition: 'benign', reason: 'no-restore-form-lines' },
    },
  }) as string;
  if (!line.includes('NOT checked (no-restore-form-lines)')) {
    throw new Error(`got: ${line}`);
  }
});

test('RC5 (H2 RULING): an ABSENT rollbackContainment renders NOTHING while the fact is ungated', () => {
  // Deliberate asymmetry with containmentDisposition's `ABSENT ⇒ treat as blocking`. This fact is
  // not a programReleasable conjunct in v1, so ABSENT means "not yet produced" — a leg whose Author
  // predates the net, or one mid-flight across the deploy — and a blocking-flavoured token would be
  // FALSE. ⚠️ If it ever becomes a conjunct, this test must flip in the SAME commit that wires it:
  // adopting the conjunct and adopting fail-closed absence are one decision, not two.
  expectEq(leanFactsLine({ confidenceScore: 90 }), '**Facts:** confidence: 90');
});

test('RC6 COUPLING: every reason the enrichment can stamp is renderable by this card', () => {
  // The write site and the read site must agree on the vocabulary. A reason the enrichment emits
  // and the card cannot render is a fact that reaches the gate as "no reason given".
  const enrichmentSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'lib/agents/harness/rollback-containment-enrichment.ts'), 'utf-8');
  const reasons = [...enrichmentSrc.matchAll(/reason: '([a-z-]+)'/g)].map((m) => m[1]);
  const unique = [...new Set(reasons)];
  if (unique.length < 5) {
    throw new Error(`expected the enrichment to stamp several named reasons, found: ${unique.join(', ')}`);
  }
  for (const r of unique) {
    const line = leanFactsLine({ rollbackContainment: { checked: false, reason: r } }) as string;
    if (!line || !line.includes(r)) {
      throw new Error(`reason '${r}' is stamped by the enrichment but does not reach the card`);
    }
  }
});

/* ── DL/CP SURFACING (2026-09-12, stage 2b) ───────────────────────────────────────────────────
 *
 * `dialectLint` and `contractPropagation` were stamped and whitelisted from 2026-08-25/26 and
 * rendered on NO card line until today. Every parity suite stayed green throughout, because a fact
 * that is written correctly and read by nobody is green at each layer in isolation — the A1/F7
 * class. These assertions are the read half; `test:net-registry` R5b is the write half (a net may
 * not CLAIM a card render it does not have).
 */
test('DL1: dialectLint renders WHAT, not just how many — the token and its line', () => {
  const line = leanFactsLine({
    dialectLint: { checked: true, violations: [{ token: 'metric-style wide', line: 412 }] },
  }) as string;
  if (!line || !line.includes('metric-style wide') || !line.includes('@L412')) {
    throw new Error(`the violating token and its line must both reach the card: ${line}`);
  }
});
test('DL2: the transcription half reports BOTH counts, so a REMOVAL leg is not read as a defect', () => {
  // 1 of 10 is a FALSE positive on a removal leg (IGP-T1 R12 P4) and a real defect on a deploy leg
  // (R11, 8 of 10). Rendering only the misses makes those indistinguishable.
  const line = leanFactsLine({
    dialectLint: { checked: true, violations: [],
      transcription: { linesPresent: 8, linesRequired: 10, missing: ['address-family ipv4 unicast'] } },
  }) as string;
  if (!line.includes('8/10') || !line.includes('address-family ipv4 unicast')) {
    throw new Error(`both counts and the missing line must render: ${line}`);
  }
});
test('DL3: an UNCHECKED dialectLint renders its named reason, never silence', () => {
  const line = leanFactsLine({ dialectLint: { checked: false, reason: 'no-author-text' } }) as string;
  if (!line || !line.includes('no-author-text')) throw new Error(`reason must reach the card: ${line}`);
});
test('CP1: contractPropagation names the STARVED child and how much of the contract it lost', () => {
  const line = leanFactsLine({
    contractPropagation: { checked: true, children: [
      { executed: true, hasInterfaceContract: true, role: 'reviewer' },
      { executed: true, hasInterfaceContract: false, role: 'author',
        canonicalLinesAbsentFromBrief: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    ] },
  }) as string;
  if (!line.includes('1 of 2 children STARVED') || !line.includes('author') || !line.includes('7 canonical')) {
    throw new Error(`the starved child must be NAMED, not counted: ${line}`);
  }
});
test('CP2: a fully-propagated contract renders positively (absence of a gap is itself the fact)', () => {
  const line = leanFactsLine({
    contractPropagation: { checked: true, children: [{ executed: true, hasInterfaceContract: true, role: 'author' }] },
  }) as string;
  if (!line.includes('1 of 1 executed children held the contract')) {
    throw new Error(`a clean propagation must still render: ${line}`);
  }
});
test('CA1: contractApplicability renders the by-design absence that reviewers kept grading as a gap', () => {
  // 9 of 37 archived standalone legs had a reviewer grade a by-design missing contract as a gap.
  const line = leanFactsLine({
    dialectLint: { checked: false, reason: 'no-contract',
      contractApplicability: { expected: false, basis: 'no-program-parent' } },
  }) as string;
  if (!line.includes('none expected') || !line.includes('no-program-parent')) {
    throw new Error(`the applicability qualifier must reach the reader: ${line}`);
  }
});
test('CA2: contractApplicability is SUPPRESSED on a program leg — the other direction (2026-09-18)', () => {
  // ⚠️ CA1 ALONE IS WHY THE STAGE-ID DEFECT SHIPPED. It pins that the qualifier RENDERS, and the
  // render is `expected === false`-only, so a predicate that answered `no-program-parent` for
  // EVERY leg kept CA1 green while telling the reader "no Program Interface Contract is expected
  // here" on 30 program legs — 25 of which carried `reason: no-banned-token-list`, i.e. the fact
  // and its own qualifier contradicted each other on the same card line. A one-directional render
  // test cannot see a predicate that is stuck on the direction it pins.
  const line = leanFactsLine({
    dialectLint: { checked: false, reason: 'no-banned-token-list',
      contractApplicability: { expected: true, basis: 'program-parent', programParentId: 'cmprogramparent0000000001' } },
  }) as string | null;
  if (line && line.includes('contractApplicability')) {
    throw new Error(`a program leg's contract is EXPECTED — there is nothing to excuse, so the `
      + `qualifier must not render: ${line}`);
  }
});

// --- 2026-09-16: the artifact → summary → card boundary (boundary review F1/F2) ---
//
// ⚠️ THESE FIXTURES ARE BUILT, NOT HAND-ROLLED. Every fixture above hands `leanFactsLine` a literal
// object, which proves the RENDER and nothing about whether the value ever REACHES it. That is
// exactly how the chainedContext branch passed green for six days while `pickResultJsonSummary`
// stripped the key on every real execution (instance 5 of this module's stamp → render → gate
// class). A fixture that survives the real whitelist is the only fixture that can fail for the
// real reason.

const quietLogger = { info: () => {} } as unknown as ExecutionResultJsonInput['logger'];
function execViaBuilder(overrides: Partial<ExecutionResultJsonInput>): Record<string, unknown> {
  const built = buildExecutionResultJson({
    taskId: 'cmtaskid00000000000000001', taskTitle: 'T', agentRole: 'config_change_author', modelUsed: 'm',
    finalResponse: 'x'.repeat(20000), confidenceScore: 80,
    turnCount: 1, maxToolTurns: 30, toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0,
    executionTime: 1000, tokensUsed: 100, correctionTurnUsed: false,
    executionId: 'cmexecid000000000000000001', logger: quietLogger,
    ...overrides,
  });
  return pickResultJsonSummary(built);
}

test('CC1 (F1): chainedContext SURVIVES the whitelist and renders — the branch fires on a built artifact', () => {
  const exec = execViaBuilder({ chainedContext: {
    predecessors: 1, expectedPredecessors: 2, chainCapablePredecessors: 2, degradedPredecessors: 0,
    notChained: [{ taskId: 'cmdep0000000000000000002', reason: 'no-result-json' }],
    totalChars: 10, anyTruncated: false,
  } as unknown as ChainedContextSignal });
  if (!('chainedContext' in exec)) {
    throw new Error('chainedContext was stripped by pickResultJsonSummary — the card branch that reads it can never fire');
  }
  const line = leanFactsLine(exec) as string;
  const expected = 'chainedContext: 1 of 2 chain-capable (degraded 0; notChained: cmdep0000000000000000002:no-result-json)';
  if (!line.includes(expected)) throw new Error(`expected "${expected}" in: ${line}`);
});

test('CC2 (F1): the 0-of-1 shape — the case F-A was shipped to make visible — renders through the real pick', () => {
  const exec = execViaBuilder({ chainedContext: {
    predecessors: 0, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0,
    totalChars: 0, anyTruncated: false,
  } as unknown as ChainedContextSignal });
  const line = leanFactsLine(exec) as string;
  if (!line.includes('chainedContext: 0 of 1 chain-capable (degraded 0)')) throw new Error(`0-of-1 must render: ${line}`);
});

test('CC3 (A11/C8, 2026-09-16): the INHERITED cross-pipeline facts survive the whitelist NESTED inside chainedContext and render with their denominator + subject', () => {
  // E3b in miniature, proved rather than assumed: the four new fields are nested inside an
  // already-whitelisted key, so `pickResultJsonSummary` — a strict whitelist that drops unlisted
  // keys with NO error — passes them verbatim. Had they been added as SIBLINGS of `chainedContext`
  // on the result.json root they would be present in the artifact and absent at the gate.
  const exec = execViaBuilder({ chainedContext: {
    predecessors: 0, expectedPredecessors: 0, chainCapablePredecessors: 0, degradedPredecessors: 0,
    totalChars: 7000, anyTruncated: false,
    inheritedPredecessors: 1, legCrossPipelineEntries: 2, inheritedFromLeg: 'cmleg00000000000000000001',
    inheritedSkipped: [{ taskId: 'cmups0000000000000000001', reason: 'own-edge-wins' }],
  } });
  const cc = (exec.chainedContext ?? {}) as Record<string, unknown>;
  for (const k of ['inheritedPredecessors', 'legCrossPipelineEntries', 'inheritedFromLeg', 'inheritedSkipped']) {
    if (!(k in cc)) throw new Error(`${k} was stripped — a nested field of a whitelisted fact must survive the pick`);
  }
  const line = leanFactsLine(exec) as string;
  const expected = 'chainedContext: 0 of 0 chain-capable (degraded 0; inherited 1 of 2 cross-pipeline from leg cmleg00000000000000000001; inheritedSkipped: cmups0000000000000000001:own-edge-wins)';
  if (!line.includes(expected)) throw new Error(`expected "${expected}" in: ${line}`);
});

test('CC4 (A11/C8): nothing inherited AND nothing on offer renders the pre-2026-09-16 line byte-identically', () => {
  // The suppression is deliberate and scoped: `0 of 0` says nothing, and this line is read by the
  // pov-program protocol's SYNTHESIZE Step 2, so every execution in the platform must not grow a
  // clause that carries no information. The case that MUST NOT be suppressed — entries offered and
  // none taken — is CC5.
  const zeroed = execViaBuilder({ chainedContext: {
    predecessors: 1, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0,
    totalChars: 10, anyTruncated: false, inheritedPredecessors: 0, legCrossPipelineEntries: 0,
  } });
  // The cast is the POINT, not a convenience: the inherited counts are REQUIRED on the producer's
  // type (derive always emits them, zeros included), so a fixture without them can only be an
  // artifact written before 2026-09-16 — and saying so in a cast keeps that assumption visible.
  const legacy = execViaBuilder({ chainedContext: {
    predecessors: 1, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0,
    totalChars: 10, anyTruncated: false,
  } as unknown as ChainedContextSignal });
  const a = leanFactsLine(zeroed) as string;
  if (a !== leanFactsLine(legacy)) throw new Error(`explicit zeros must render identically to a pre-fix artifact:\n${a}\n${leanFactsLine(legacy)}`);
  if (a.includes('inherited')) throw new Error(`no inherited clause expected: ${a}`);
});

test('CC5 (A12/C9): entries were OFFERED and none taken — the clause renders with the reason, not a silent zero', () => {
  const exec = execViaBuilder({ chainedContext: {
    predecessors: 1, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0,
    totalChars: 10, anyTruncated: false, inheritedPredecessors: 0, legCrossPipelineEntries: 1,
    inheritedSkipped: [{ taskId: 'cmups0000000000000000001', reason: 'in-not-chained' }],
  } });
  const line = leanFactsLine(exec) as string;
  if (!line.includes('inherited 0 of 1 cross-pipeline')) throw new Error(`the denominator must render: ${line}`);
  if (!line.includes('inheritedSkipped: cmups0000000000000000001:in-not-chained')) throw new Error(`the reason must render: ${line}`);
  // ⚠️ and it must NOT have been laundered into notChained, which the program gate treats as blocking.
  if (line.includes('notChained')) throw new Error(`a benign inherit skip must not appear as notChained: ${line}`);
});

test('CC6 (A11/C9): every leg entry POLICY-FILTERED — `legCrossPipelineEntries` is 0 and the skip rows must still render', () => {
  // The denominator counts POST-POLICY candidates (context-chainer `injection.candidates.length`),
  // so a leg that offered three `result.json` entries reports 0 here while `inheritedSkipped` names
  // all three. Keying the clause on the counts alone would suppress precisely the rows that explain
  // the zero — the Register-Pattern-1 shape C9 exists to close, one level down.
  const exec = execViaBuilder({ chainedContext: {
    predecessors: 1, expectedPredecessors: 1, chainCapablePredecessors: 1, degradedPredecessors: 0,
    totalChars: 10, anyTruncated: false, inheritedPredecessors: 0, legCrossPipelineEntries: 0,
    inheritedSkipped: [{ taskId: 'cmups0000000000000000009', reason: 'not-cross-pipeline-source' }],
  } });
  const line = leanFactsLine(exec) as string;
  if (!line.includes('inheritedSkipped: cmups0000000000000000009:not-cross-pipeline-source')) {
    throw new Error(`a 0-of-0 with recorded skips must still name them: ${line}`);
  }
});

test('EC1 (F2): errorCategory survives the whitelist and renders its VALUE, first among the facts', () => {
  const exec = execViaBuilder({ executionDegradation: { errorCategory: 'PROTOCOL_STEP_SKIPPED', missingSteps: ['x'] } });
  if (exec.errorCategory !== 'PROTOCOL_STEP_SKIPPED') {
    throw new Error(`errorCategory must be hoisted as the bare token, got ${JSON.stringify(exec.errorCategory)}`);
  }
  if ('executionDegradation' in exec) {
    throw new Error('executionDegradation must NOT be hoisted wholesale — its prose would wreck the head slice; the token is the gate-relevant content');
  }
  const line = leanFactsLine(exec) as string;
  expectEq(line.startsWith('**Facts:** confidence: 80 | errorCategory: PROTOCOL_STEP_SKIPPED'), true);
});

test('EC3 (register E1, 2026-09-25): TRUNCATED_PARTIAL_OUTPUT rides the same hoist and renders first — no card code change', () => {
  // The new category needed no renderer work: the errorCategory path already carries any string value.
  // This fixture proves the path for the new token so a future card refactor cannot quietly drop it.
  const exec = execViaBuilder({ executionDegradation: { errorCategory: 'TRUNCATED_PARTIAL_OUTPUT' } });
  if (exec.errorCategory !== 'TRUNCATED_PARTIAL_OUTPUT') {
    throw new Error(`errorCategory must be hoisted as the bare token, got ${JSON.stringify(exec.errorCategory)}`);
  }
  const line = leanFactsLine(exec) as string;
  expectEq(line.startsWith('**Facts:** confidence: 80 | errorCategory: TRUNCATED_PARTIAL_OUTPUT'), true);
});

test('EC2 (F2): a clean execution renders NO errorCategory segment — absence here is the true clean state', () => {
  // Contrast with containmentDisposition, whose absence is "not yet decided" and gets a positive
  // token. A degradation is stamped only when detected, so a missing token is not a silent pass.
  const exec = execViaBuilder({});
  if ('errorCategory' in exec) throw new Error('the picker must not fabricate an absent category');
  const line = leanFactsLine(exec) as string;
  if (line.includes('errorCategory')) throw new Error(`no segment expected on a clean execution: ${line}`);
});

// --- TR: the truncation segment (register E1, 2026-09-25) ------------------------------------
// Keyed on `toolLoop.deliverableTruncated === true` ONLY. Every fixture is BUILT through the real
// builder + pick (the facts ride NESTED inside the whitelisted `toolLoop` — E3b), so a whitelist or
// nesting regression fails here for the real reason. Both directions are pinned: a segment that
// always fired, or never fired, would each pass a one-directional test.

test('TR1: a non-truncated execution is BYTE-IDENTICAL to a card with no toolLoop at all — no segment', () => {
  const exec = execViaBuilder({ finalStopReason: 'end_turn', truncationRetryUsed: true, truncationRetryRecovered: true, truncationRetryStopReason: 'end_turn' });
  const without = { ...exec };
  delete (without as Record<string, unknown>).toolLoop;
  expectEq(leanFactsLine(exec), leanFactsLine(without));
  if (String(leanFactsLine(exec)).includes('truncation:')) throw new Error('a RECOVERED retry must not render — the deliverable is complete');
});

test('TR2: TRUNCATED_PARTIAL_OUTPUT + INSUFFICIENT_TIME renders the category FIRST, then the skip reason', () => {
  const exec = execViaBuilder({
    executionDegradation: { errorCategory: 'TRUNCATED_PARTIAL_OUTPUT' } as unknown as ExecutionResultJsonInput['executionDegradation'],
    finalStopReason: 'max_tokens', truncationRetrySkippedReason: 'INSUFFICIENT_TIME', truncationRetryMaxTokens: 45800,
  });
  const line = leanFactsLine(exec) as string;
  expectEq(line.startsWith('**Facts:** confidence: 80 | errorCategory: TRUNCATED_PARTIAL_OUTPUT | truncation: final stop max_tokens (retry skipped: INSUFFICIENT_TIME)'), true);
});

test('TR3 (MASKING — the reason the segment exists): an earlier category wins, and the truncation is STILL visible', () => {
  // errorCategory is first-wins: TOOL_LOOP_DEGRADED outranks TRUNCATED_* (test:execution-quality
  // TPO-3). Without this segment the card would name only the tool-loop category and the cut-off
  // deliverable would be stamped and invisible — the A1 class.
  const exec = execViaBuilder({
    executionDegradation: { errorCategory: 'TOOL_LOOP_DEGRADED' } as unknown as ExecutionResultJsonInput['executionDegradation'],
    finalStopReason: 'max_tokens',
  });
  const line = leanFactsLine(exec) as string;
  if (!line.includes('errorCategory: TOOL_LOOP_DEGRADED | truncation: final stop max_tokens (no retry)')) {
    throw new Error(`a masked truncation must render beside the winning category: ${line}`);
  }
});

test('TR4: the retry state names only what the facts say about the FINAL turn', () => {
  const cases: Array<[Partial<ExecutionResultJsonInput>, string]> = [
    [{ truncationRetryUsed: true, truncationRetryStopReason: 'max_tokens' }, 'retry also stopped at max_tokens'],
    // A retry that returned end_turn cannot be the final response of a truncated deliverable — it ran on an earlier turn.
    [{ truncationRetryUsed: true, truncationRetryRecovered: true, truncationRetryStopReason: 'end_turn' }, 'retry spent on an earlier turn'],
    // null stop reason: threw, or returned without one — the facts cannot tell which, so the card does not guess.
    [{ truncationRetryUsed: true }, 'retry used, no retry stop reason stamped'],
    [{ truncationRetrySkippedReason: 'AT_MODEL_CEILING' }, 'retry skipped: AT_MODEL_CEILING'],
    [{}, 'no retry'],
  ];
  for (const [over, want] of cases) {
    const line = leanFactsLine(execViaBuilder({ finalStopReason: 'max_tokens', ...over })) as string;
    if (!line.includes(`truncation: final stop max_tokens (${want})`)) throw new Error(`expected "(${want})" for ${JSON.stringify(over)} in: ${line}`);
  }
});

test('TR5: an artifact PREDATING F2 (no deliverableTruncated field) renders nothing — no false ABSENT token', () => {
  const exec = execViaBuilder({ finalStopReason: 'max_tokens' });
  const tl = { ...(exec.toolLoop as Record<string, unknown>) };
  delete tl.deliverableTruncated; delete tl.finalStopReason;
  const line = leanFactsLine({ ...exec, toolLoop: tl }) as string;
  if (line.includes('truncation')) throw new Error(`a pre-F2 artifact must not render a truncation segment: ${line}`);
});

// --- RW: the READ half of the render-required convention ------------------------------------
// The recurring defect on this boundary is not "a field was omitted" but "a renderer reads a field
// the whitelist does not pass" — five instances, every one found by a human or a live run. RW1
// derives the READ set from the card source and checks each key against what the results handler
// actually EMITS: the whitelist plus the handler's own literal keys. RW2 pins the collision that
// made F2's whitelist fix inert on its own.


const resultsHandlerTs = fs.readFileSync(path.join(REPO_ROOT, 'lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts'), 'utf-8');

/** The literal keys of the `const result: any = {` object in the TS results handler, in order,
 *  with the index of the `...resultSummary` spread among them. */
function resultsHandlerLiteralKeys(): { keys: string[]; spreadAt: number } {
  const start = resultsHandlerTs.indexOf('const result: any = {');
  if (start < 0) throw new Error('results handler no longer builds `const result: any = {` — retarget RW1/RW2');
  const body = resultsHandlerTs.slice(start, resultsHandlerTs.indexOf('\n    };', start));
  const keys: string[] = [];
  let spreadAt = -1;
  for (const m of body.matchAll(/^      (?:([A-Za-z_]\w*)\s*[:,]|(\.\.\.resultSummary))/gm)) {
    if (m[2]) spreadAt = keys.length;
    else keys.push(m[1]);
  }
  if (spreadAt < 0) throw new Error('results handler no longer spreads resultSummary into the card — the whitelist reaches nothing');
  return { keys, spreadAt };
}

test('RW1: every exec.<key> the card renderers read is a key the results handler EMITS', () => {
  const emitted = new Set<string>([...RESULT_JSON_SUMMARY_KEYS, ...resultsHandlerLiteralKeys().keys]);
  const sources: Array<[string, string]> = [
    ['lean-card-facts.js', fs.readFileSync(path.join(REPO_ROOT, 'lib/mcp/server/tools/advanced/lean-card-facts.js'), 'utf-8')],
    ['agent-results-handler.js', agentResultsSource],
  ];
  const unmatched: string[] = [];
  for (const [name, src] of sources) {
    const reads = new Set([...src.matchAll(/\bexec\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
    for (const key of reads) if (!emitted.has(key)) unmatched.push(`${name}: exec.${key}`);
  }
  if (unmatched.length) {
    throw new Error(`card reads a key the handler never emits (whitelist it or fix the read): ${unmatched.join(', ')}`);
  }
});

test('RW2 (F2 collision): no whitelist key is re-declared as a literal AFTER the ...resultSummary spread', () => {
  const { keys, spreadAt } = resultsHandlerLiteralKeys();
  const after = keys.slice(spreadAt).filter((k) => (RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes(k));
  if (after.length) {
    throw new Error(`literal(s) after the spread CLOBBER the hoisted value — whitelisting is inert for: ${after.join(', ')}`);
  }
  // And the coalesce itself: result.json's hoisted category must reach the card key.
  if (!/resultSummary\.errorCategory/.test(resultsHandlerTs)) {
    throw new Error('results handler no longer coalesces resultSummary.errorCategory — the degraded-SUCCESS case reads null again');
  }
});

// --- Summary ---
console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
if (failed > 0) process.exit(1);
