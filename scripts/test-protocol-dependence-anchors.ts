#!/usr/bin/env ts-node
/**
 * Tier-2 composition pin (WS1 Phase C, D5): PROTOCOL_DEPENDENCE_ANCHORS vs the REAL
 * agent_prompt_library rows.
 *
 * DB-NEEDING — deliberately NOT in test:all-validation (the chain stops at the first failure and
 * this test requires a seeded database). It runs at the quarterly health-run (CLAUDE.md, next to
 * protocol-public-parity) and after any protocol seed change. The PURE structural half of the
 * composition pin (headings exactly-once, rendered order, tier-split, goldens) lives in
 * scripts/test-system-prompt-injections.ts and IS in CI.
 *
 * Three checks:
 *  1. PAIRS  — every anchor pair's `ref` appears in its delta row's promptText AND its `anchor`
 *              appears in the (exactly-one, protocol-base-tagged) base row's promptText.
 *  2. BASE   — exactly one ACTIVE protocol-base row exists (the composed-injection contract).
 *  3. COUNTS — bidirectional: per-delta occurrences of BASE_REFERENCE_MARKERS match
 *              EXPECTED_MARKER_COUNTS, so a NEW base-reference added without an anchor pair
 *              fails here (and a removed one fails too). Run with --print-counts to re-derive
 *              after a DELIBERATE change — a drift without an anchor-list change IS the finding.
 *
 * Named exclusions (counted-never-dropped, D5): version-changelog COMMENTS in the seed source
 * mention base symbols but never reach promptText, so they are structurally outside this test's
 * corpus — recorded here so their absence reads as designed, not missed.
 */
import { prisma } from '../lib/prisma';
import {
  PROTOCOL_DEPENDENCE_ANCHORS,
  BASE_REFERENCE_MARKERS,
  EXPECTED_MARKER_COUNTS,
} from '../lib/agents/harness/protocol-dependence-anchors';

const printCounts = process.argv.includes('--print-counts');

function countMarkers(text: string): number {
  let n = 0;
  for (const m of BASE_REFERENCE_MARKERS) {
    let i = 0;
    while ((i = text.indexOf(m, i)) !== -1) { n++; i += m.length; }
  }
  return n;
}

(async () => {
  let passed = 0, failed = 0;
  const fail = (msg: string) => { console.log(`❌ ${msg}`); failed++; };
  const ok = (msg: string) => { console.log(`✅ ${msg}`); passed++; };

  // 2. BASE cardinality
  const bases = await prisma.agentPromptLibrary.findMany({
    where: { tags: { has: 'protocol-base' }, status: 'ACTIVE' },
    select: { name: true, promptText: true },
  });
  if (bases.length === 1) ok(`exactly one ACTIVE protocol-base row (${bases[0].name})`);
  else fail(`ACTIVE protocol-base rows: expected exactly 1, found ${bases.length} [${bases.map(b => b.name).join(', ')}]`);
  const base = bases[0];

  const deltaNames = [...new Set(PROTOCOL_DEPENDENCE_ANCHORS.map(p => p.delta))];
  const deltas = await prisma.agentPromptLibrary.findMany({
    where: { name: { in: deltaNames } },
    select: { name: true, promptText: true },
  });
  const deltaByName = new Map(deltas.map(d => [d.name, d.promptText]));

  // 1. PAIRS
  for (const pair of PROTOCOL_DEPENDENCE_ANCHORS) {
    const deltaText = deltaByName.get(pair.delta);
    if (!deltaText) { fail(`pair delta row missing: ${pair.delta}`); continue; }
    const refOk = deltaText.includes(pair.ref);
    const anchorOk = !!base && base.promptText.includes(pair.anchor);
    if (refOk && anchorOk) ok(`${pair.delta}: "${pair.ref.slice(0, 60)}…" ⇄ base`);
    else {
      if (!refOk) fail(`${pair.delta}: ref NOT in delta promptText: "${pair.ref.slice(0, 90)}"`);
      if (!anchorOk) fail(`${pair.delta}: anchor NOT in base promptText: "${pair.anchor.slice(0, 90)}" — the reference now DANGLES`);
    }
  }

  // 3. COUNTS (bidirectional)
  for (const [name, expected] of Object.entries(EXPECTED_MARKER_COUNTS)) {
    const text = deltaByName.get(name);
    if (!text) { fail(`count-pin row missing: ${name}`); continue; }
    const actual = countMarkers(text);
    if (printCounts) console.log(`   counts: ${name} = ${actual}`);
    if (actual === expected) ok(`marker count ${name}: ${actual}`);
    else fail(`marker count ${name}: expected ${expected}, found ${actual} — a base-reference was added/removed without updating PROTOCOL_DEPENDENCE_ANCHORS (+ this pin) in the same commit`);
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
