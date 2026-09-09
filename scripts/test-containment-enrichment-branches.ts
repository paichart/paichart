/**
 * Enrichment branch-order tests — the control flow ABOVE the kind dispatch.
 *
 * WHY THIS FILE EXISTS (§3b of cline_docs/reviews/asn-kind-2026-08-02/IMPLEMENTATION-PLAN-v2.md).
 * The architectural review's F2 identified the structural constraint that the ASN work surfaced:
 *
 *   `checkDerivationContainment` — the only place ANY per-kind checker can live — is unreachable
 *   unless a parseable `## Harvested Allocations` block exists. ASN *containment* is relational and
 *   fits that. ASN *range policy* is a predicate on the derived value ALONE and has no seat.
 *
 * The plan asserted range policy "depends on harvest? No". The code makes that false. We ACCEPTED
 * the coupling for v1 — running range checks with no harvest would produce `checked:true` on a fact
 * whose containment half is hollow, and the taxonomy already names hollow-green as the worse signal
 * — but an accepted constraint that nothing pins is indistinguishable from an oversight six months
 * later. These tests are what make it "intended, not latent".
 *
 * Nothing else in the repo calls computeDerivationContainmentFact directly, so this branch logic had
 * NO coverage before this file.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-containment-enrichment-branches.ts
 */

import { computeDerivationContainmentFact, type ContainmentPrisma } from '../lib/agents/harness/derivation-containment-enrichment';

let passed = 0, failed = 0;
function test(desc: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => { passed++; console.log(`  ✅ ${desc}`); },
    (e: Error) => { failed++; console.log(`  ❌ ${desc}\n       ${e.message}`); }
  );
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

const STAGE = 'stage-1';

/**
 * Minimal stand-in for the two prisma surfaces the enrichment uses. `artifacts` maps a taskId to the
 * `finalResponse` text its result.json would carry; a missing entry models "no artifact".
 */
function stubPrisma(children: Array<{ id: string; title: string; agentRole: string | null }>,
                    artifacts: Record<string, string>): ContainmentPrisma {
  return {
    task: { findMany: async () => children } as unknown as ContainmentPrisma['task'],
    $queryRaw: (async (_strings: TemplateStringsArray, taskId: string) => {
      const fr = artifacts[taskId];
      return fr === undefined ? [] : [{ fr }];
    }) as unknown as ContainmentPrisma['$queryRaw'],
  };
}

const KIDS = [
  { id: 'h1', title: 'Harvest current network state', agentRole: 'network_state_harvester' },
  { id: 'a1', title: 'Author change package', agentRole: 'config_change_author' },
];

const block = (marker: string, json: unknown) => `text before\n\n${marker}\n\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\n`;

async function main() {
  console.log('\n📋 Enrichment branch order (the control flow above the kind dispatch)\n');

  await test('THE ACCEPTED v1 CONSTRAINT: an ASN-deriving leg with NO harvest block gets the harvest ' +
             'reason, NOT a range violation — range policy has no seat above the harvest gate', async () => {
    // A reserved ASN (0) that WOULD be flagged by asn-reserved-range if the checker were reached.
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, { a1: block('## Derived Values', [{ kind: 'asn', value: 0, device: 'ceos1' }]) }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.checked === false, `expected checked:false, got ${JSON.stringify(fact)}`);
    assert(fact.reason === 'harvest-block-missing-or-unparseable',
      `expected the harvest reason, got ${String(fact.reason)}`);
    assert(fact.violations === undefined,
      'no violation may be reported from a branch that never ran the checker — a partially-checked ' +
      'fact is a worse signal than an unchecked one');
  });

  await test('existence-first ordering survives: NO derived block wins over a missing harvest block', async () => {
    // finding (f), run 10: !derived is tested BEFORE !harvested. Both are absent here.
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, {}), { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.reason === 'no-derived-values-block',
      `existence-first ordering broken: got ${String(fact.reason)}`);
  });

  await test('ph F1 END TO END: an ASN-only harvest with no derivation stamps NO harvestedCount, ' +
             'so the taxonomy cannot classify it as a refusal', async () => {
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, {
        h1: block('## Harvested Allocations', [
          { kind: 'asn', asn: 65001, device: 'ceos1', source: 'fetch_data(...)' },
          { kind: 'asn', asn: 65002, device: 'ceos2', source: 'fetch_data(...)' },
        ]),
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.reason === 'no-derived-values-block', `got ${String(fact.reason)}`);
    assert(fact.harvestedCount === undefined,
      `an ASN-only harvest must NOT present an address-pool count — that is the false-park bug. ` +
      `got ${JSON.stringify(fact)}`);
    assert((fact.harvestedByKind as Record<string, number>)?.asn === 2,
      'the census must still record what WAS harvested');
  });

  await test('BACK-COMPAT: a CIDR harvest with no derivation still stamps harvestedCount ⇒ blocking', async () => {
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, {
        h1: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.2/32', device: 'ceos1' }]),
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.harvestedCount === 1,
      `the A7 deriving test must be unchanged for cidr, got ${JSON.stringify(fact)}`);
    assert(fact.harvestedByKind === undefined, 'a cidr-only harvest gains no census key');
  });

  await test('the checker IS reached when both blocks parse, and the asn arm runs there', async () => {
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, {
        h1: block('## Harvested Allocations', [{ kind: 'asn', asn: 65001, device: 'ceos1', source: 'x' }]),
        // The package must actually USE the value, as a real change package does — otherwise the
        // 2026-08-04 orphan check correctly fires and this fixture stops testing the asn arm.
        // Measured on real packages: legitimate derived values occur 8-19 times across the
        // document. A stub carrying only the blocks is not a change package.
        a1: block('## Derived Values', [{ kind: 'asn', value: 65001, device: 'ceos1' }])
          + '\n## Device Configuration Blocks\nrouter bgp 65001\n',
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.checked === true, `expected checked:true, got ${JSON.stringify(fact)}`);
    assert((fact.violations as unknown[]).length === 0, 'a harvested ASN is clean');
  });

  await test('and a NON-harvested ASN violates once the checker is reachable', async () => {
    const fact = await computeDerivationContainmentFact(
      stubPrisma(KIDS, {
        h1: block('## Harvested Allocations', [{ kind: 'asn', asn: 65001, device: 'ceos1', source: 'x' }]),
        a1: block('## Derived Values', [{ kind: 'asn', value: 64999, device: 'ceos1' }]),
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    const v = fact.violations as Array<{ reason: string }>;
    assert(v.some(x => x.reason === 'asn-not-member'), `expected asn-not-member, got ${JSON.stringify(v)}`);
  });

  await test('RUN 19 REGRESSION: the derived block is found on the DESIGN child when the Author omits it', async () => {
    // Run 19's P1 derived the exactly-minimal 10.99.0.6/31 and its reviewer approved at 92, but the
    // Author referenced Phase 1's block in prose instead of re-emitting it. The reader assumed the
    // Author, stamped no-derived-values-block, and harvestedCount PRESENT made that read as a
    // REFUSAL — blocking a correct leg.
    const kids = [
      { id: 'h1', title: 'Harvest current network state', agentRole: 'network_state_harvester' },
      { id: 'd1', title: 'Design telemetry-exporter aggregate', agentRole: 'network_design_architect' },
      { id: 'a1', title: 'Author change package', agentRole: 'config_change_author' },
    ];
    const fact = await computeDerivationContainmentFact(
      stubPrisma(kids, {
        h1: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.3/32', device: 'ceos1' }]),
        d1: block('## Derived Values', [{ kind: 'cidr', value: '10.99.0.6/31', members: ['10.99.0.6/32', '10.99.0.7/32'] }]),
        a1: 'The prior output provides the derived aggregate 10.99.0.6/31. Now the change package...',
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.checked === true,
      `a leg that DID derive must not be classified a refusal; got ${JSON.stringify(fact)}`);
    assert(fact.derivedSource === 'd1',
      `derivedSource must name where the block really was, got ${String(fact.derivedSource)}`);
    assert((fact.violations as unknown[]).length === 0, 'the minimal /31 is clean');
  });

  await test('the Author still WINS when it carries the block (strongest anchor — its package ships)', async () => {
    const kids = [
      { id: 'h1', title: 'Harvest state', agentRole: 'harvester' },
      { id: 'd1', title: 'Design aggregate', agentRole: 'architect' },
      { id: 'a1', title: 'Author change package', agentRole: 'config_change_author' },
    ];
    const fact = await computeDerivationContainmentFact(
      stubPrisma(kids, {
        h1: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.3/32' }]),
        d1: block('## Derived Values', [{ kind: 'cidr', value: '10.99.0.0/24', members: [] }]),
        a1: block('## Derived Values', [{ kind: 'cidr', value: '10.99.0.6/31', members: ['10.99.0.6/32', '10.99.0.7/32'] }]),
      }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.derivedSource === 'a1', `the Author must take precedence, got ${String(fact.derivedSource)}`);
    assert((fact.derivedValues as Array<{value: string}>)[0].value === '10.99.0.6/31',
      'the shipped package value, not the design draft');
  });

  await test('absence from EVERY child keeps its meaning: that IS the refusal signal', async () => {
    const kids = [
      { id: 'h1', title: 'Harvest state', agentRole: 'harvester' },
      { id: 'd1', title: 'Design aggregate', agentRole: 'architect' },
      { id: 'a1', title: 'Author change package', agentRole: 'config_change_author' },
    ];
    const fact = await computeDerivationContainmentFact(
      stubPrisma(kids, { h1: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.3/32' }]) }),
      { stageId: STAGE, chainedFrom: undefined }
    );
    assert(fact.reason === 'no-derived-values-block', `got ${String(fact.reason)}`);
    assert(fact.harvestedCount === 1,
      'a cidr harvest with no derivation anywhere is still BLOCKING — VT-11 collision refusal');
  });

  await test('H-3: a PROGRAM parent (programTier:true) gets a self-describing tier-inapplicable fact, never the leg hard-gap', async () => {
    const PROGRAM_KIDS = [
      { id: 'arch', title: 'Produce program plan + interface contract', agentRole: 'program_architect' },
      { id: 'g0', title: 'Plan gate', agentRole: null },
      { id: 'p1', title: 'Pipeline 1 EDGE', agentRole: 'pipeline_harness_orchestrator' },
      { id: 'nodec', title: 'Program integration review', agentRole: 'change_reviewer' },
    ];
    const fact = await computeDerivationContainmentFact(stubPrisma(PROGRAM_KIDS, {}),
      { stageId: STAGE, chainedFrom: undefined, programTier: true });
    assert(fact.checked === false && fact.reason === 'program-tier', `got ${JSON.stringify(fact)}`);
    assert(fact.tier === 'program' && fact.applicable === false, `tier fields missing: ${JSON.stringify(fact)}`);
    // FAIL-CLOSED PRESERVED: the same program-shaped stage read as a LEG (programTier absent) is still
    // the leg's hard gap — the tier flag is the ONLY thing that may change the reading.
    const asLeg = await computeDerivationContainmentFact(stubPrisma(PROGRAM_KIDS, {}),
      { stageId: STAGE, chainedFrom: undefined });
    assert(asLeg.reason === 'no-harvest-child', `leg reading changed: ${JSON.stringify(asLeg)}`);
  });

  // ── H-2 (2026-09-09): TRANSITIVE consuming leg — edge (derives) → dmz (consumes) → core (consumes) ──
  // The leaf's direct predecessor is itself a consuming leg. Its stamp carries the deriving leg's clean
  // stamp nested in ITS upstreamContainment.legs; the enrichment used to read one level too shallow.
  const X = { kind: 'cidr', value: '10.99.0.6/31' };
  const CORE_KIDS = [
    { id: 'h3', title: 'Harvest current network state for Core ceos2', agentRole: 'network_state_harvester' },
    { id: 'a3', title: 'Author configs + validation + rollback for Core', agentRole: 'config_change_author' },
  ];
  const coreArtifacts = (consumed: { kind: string; value: string }) => ({
    h3: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.3/32', device: 'ceos2' }]),
    a3: block('## Consumed Values', [consumed]),
  });
  const dmzStamp = (opts: { edgeViolations?: number; dmzViolations?: unknown[]; withUpstream?: boolean }) => ({
    taskId: 'p2', source: 'report.md',
    derivationContainment: {
      checked: false, reason: 'no-derived-values-block', harvestedCount: 0,
      consumedValues: [X],
      ...(opts.dmzViolations ? { violations: opts.dmzViolations } : {}),
      containmentDisposition: { disposition: 'benign', reason: 'consuming-leg-consumed-discharged' },
      ...(opts.withUpstream === false ? {} : {
        upstreamContainment: {
          green: (opts.edgeViolations ?? 0) === 0,
          legs: [{ taskId: 'p1', checked: true, violations: opts.edgeViolations ?? 0, derivedValues: [X],
                   disposition: (opts.edgeViolations ?? 0) === 0 ? 'benign' : 'blocking' }],
        },
      }),
    },
  });

  await test('H-2 T1: a consumer-of-a-consumer is GREEN off the deriving leg two hops up, tagged via', async () => {
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts(X)),
      { stageId: STAGE, chainedFrom: [dmzStamp({})] });
    const uc = fact.upstreamContainment as { green: boolean; legs: Array<{ taskId: string; via?: string; checked: boolean }> };
    assert(uc && uc.legs.length === 2, `expected 2 legs (direct + via), got ${JSON.stringify(uc)}`);
    assert(uc.legs[1].taskId === 'p1' && uc.legs[1].via === 'p2' && uc.legs[1].checked === true, JSON.stringify(uc.legs));
    assert(uc.green === true, `green must be true off p1: ${JSON.stringify(uc)}`);
    const d = fact.containmentDisposition as { disposition: string; reason: string };
    assert(d.disposition === 'benign' && d.reason === 'consuming-leg-consumed-discharged', JSON.stringify(d));
    assert(fact.violations === undefined, `no violations expected: ${JSON.stringify(fact.violations)}`);
  });

  await test('H-2 T2: a DIRTY deriving root two hops up still blocks the leaf (fail-closed through the flatten)', async () => {
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts(X)),
      { stageId: STAGE, chainedFrom: [dmzStamp({ edgeViolations: 1 })] });
    const uc = fact.upstreamContainment as { green: boolean };
    assert(uc.green === false, `green must be false with a dirty root: ${JSON.stringify(uc)}`);
    const d = fact.containmentDisposition as { disposition: string; reason: string };
    assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-not-green', JSON.stringify(d));
  });

  await test('H-2 T3: a violation on the HOP itself (dmz consumed-value-mismatch) makes the leaf not green', async () => {
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts(X)),
      { stageId: STAGE, chainedFrom: [dmzStamp({ dmzViolations: [{ kind: 'consumed-value-mismatch' }] })] });
    const uc = fact.upstreamContainment as { green: boolean };
    assert(uc.green === false, `a dirty hop must not be masked: ${JSON.stringify(uc)}`);
  });

  await test('H-2 T4: check 1 FIRES for a transitive consumer — a value the deriving leg never derived is a mismatch (inert before this fix)', async () => {
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts({ kind: 'cidr', value: '10.99.0.4/31' })),
      { stageId: STAGE, chainedFrom: [dmzStamp({})] });
    const v = fact.violations as Array<{ kind?: string; type?: string }> | undefined;
    assert(Array.isArray(v) && v.length > 0 && JSON.stringify(v).includes('consumed-value-mismatch'),
      `expected a consumed-value-mismatch, got ${JSON.stringify(fact.violations)}`);
    const d = fact.containmentDisposition as { disposition: string; reason: string };
    assert(d.disposition === 'blocking' && d.reason === 'violations', JSON.stringify(d));
  });

  await test('H-2 T5: a hop stamped WITHOUT upstreamContainment contributes itself only — no inheritance, not green (invariant 2)', async () => {
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts(X)),
      { stageId: STAGE, chainedFrom: [dmzStamp({ withUpstream: false })] });
    const uc = fact.upstreamContainment as { green: boolean; legs: unknown[] };
    assert(uc.legs.length === 1 && uc.green === false, `expected 1 leg, not green: ${JSON.stringify(uc)}`);
  });

  await test('H-2 T6: diamond dedup keeps the dirtier reading of a leg reached twice', async () => {
    const clean = dmzStamp({});
    const dirtyTwin = { ...dmzStamp({ edgeViolations: 2 }), taskId: 'p2b' };
    const fact = await computeDerivationContainmentFact(stubPrisma(CORE_KIDS, coreArtifacts(X)),
      { stageId: STAGE, chainedFrom: [clean, dirtyTwin] });
    const uc = fact.upstreamContainment as { green: boolean; legs: Array<{ taskId: string; violations: number }> };
    const p1 = uc.legs.filter(l => l.taskId === 'p1');
    assert(p1.length === 1 && p1[0].violations === 2, `dedup must keep max violations: ${JSON.stringify(uc.legs)}`);
    assert(uc.green === false, 'a dirty duplicate must not be masked by a clean one');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
