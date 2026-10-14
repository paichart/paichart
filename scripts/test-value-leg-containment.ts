#!/usr/bin/env ts-node
/**
 * test-value-leg-containment — B5 pins for the value-leg containment fact (value-chain build, 2026-10-02).
 *
 * No value leg has run (the protocol is DRAFT), so every arm here is FIXTURE-proven; the archived-leg equivalence
 * gate (test:net-registry-equivalence) proves the other direction — every existing leg byte-identical through the new
 * dispatch. Plan: cline_docs/reviews/producer-leg-2026-10-02/BUILD-PLAN.md B4 + B5. Each test names the plan item.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

import {
  VALUE_LEG_PROTOCOLS, VALUE_LEG_ARCHITECT_ROLE, isValueLegProtocol, isValueLegTask,
  computeValueLegContainmentFact, hoistValueLegContainment, type ValueLegPrisma,
} from '../lib/agents/harness/value-leg-containment-enrichment';
import { computeDerivationContainmentFact } from '../lib/agents/harness/derivation-containment-enrichment';
import { hoistRollbackContainment } from '../lib/agents/harness/rollback-containment-enrichment';
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';
import { runNetsAtPoint, type NetContext } from '../lib/agents/harness/net-registry';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
import { pickResultJsonSummary } from '../lib/services/execution-artifacts';
import { authoritativeReadStub, type StubExecution } from './fixtures/authoritative-read-stub';

const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts.js');
const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };

let passed = 0, failed = 0;
async function test(desc: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✅ ${desc}`); }
  catch (e) { failed++; console.log(`  ❌ ${desc}\n       ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────
const LEG_STAGE = 'leg-stage';
const block = (marker: string, json: unknown) => `prose\n\n${marker}\n\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\n`;
// Six harvested /32s; the rule selects all six; their tightest cover is 10.99.0.0/27 (synthetic addresses).
const SIX = ['10.99.0.1', '10.99.0.2', '10.99.0.4', '10.99.0.24', '10.99.0.26', '10.99.0.29'];
const HARVEST = block('## Harvested Allocations',
  SIX.map((a, i) => ({ kind: 'cidr', cidr: `${a}/32`, device: `sw${i}`, interface: 'Loopback0', source: 'show ip interface brief' })));
const DERIVED_SIX = block('## Derived Values', [{ kind: 'cidr', value: '10.99.0.0/27', members: SIX.map((a) => `${a}/32`) }]);
// The AR F3 omission case: three of the six, with their correct minimal cover.
const DERIVED_THREE = block('## Derived Values', [{ kind: 'cidr', value: '10.99.0.0/29',
  members: ['10.99.0.1/32', '10.99.0.2/32', '10.99.0.4/32'] }]);

type Kid = { id: string; title: string; agentRole: string | null };
const KIDS_VALUE: Kid[] = [
  { id: 'h1', title: 'Harvest current network state for loopback aggregate', agentRole: 'infra_state_harvester' },
  { id: 'd1', title: 'Derive loopback aggregate', agentRole: VALUE_LEG_ARCHITECT_ROLE },
  { id: 'r1', title: 'Review derivation for loopback aggregate', agentRole: 'derivation_reviewer' },
];

interface World {
  childStage?: string | null;
  legs?: Array<{ id: string; title: string; metadata: Record<string, unknown> }>;
  kids?: Kid[];
  executions?: StubExecution[];
}
const t0 = new Date('2026-10-02T00:00:00Z');
const at = (s: number) => new Date(t0.getTime() + s * 1000);

function world(w: World): ValueLegPrisma {
  const legs = w.legs ?? [{ id: 'leg1', title: 'Derive the loopback aggregate (protocol: network-derivation)',
    metadata: { protocol: 'network-derivation-protocol', pipelineStageId: LEG_STAGE } }];
  const reads = authoritativeReadStub(w.executions ?? []);
  return {
    task: {
      findUnique: async (args: { where: { id: string } }) => {
        const leg = legs.find((l) => l.id === args.where.id);
        if (leg) return { title: leg.title, metadata: leg.metadata, stageId: 'program-stage' };
        return { stageId: w.childStage === undefined ? LEG_STAGE : w.childStage };
      },
      findMany: async () => w.kids ?? KIDS_VALUE,
    },
    agentExecution: reads.agentExecution,
    agentArtifact: reads.agentArtifact,
    $queryRaw: async (a0: unknown, ...rest: unknown[]) => {
      // resolveOwningLeg passes ONE Prisma.Sql object; the authoritative reader uses a tagged template (an array).
      if (!Array.isArray(a0)) {
        const stageId = ((a0 as { values?: unknown[] }).values ?? [])[0];
        return legs.filter((l) => l.metadata.pipelineStageId === stageId && l.metadata.protocol)
          .map((l) => ({ id: l.id, chained: [] }));
      }
      return (reads.$queryRaw as (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>)(a0 as unknown as TemplateStringsArray, ...rest);
    },
  } as unknown as ValueLegPrisma;
}
const harvestExec = (id = 'eh1', s = 1): StubExecution =>
  ({ id, taskId: 'h1', createdAt: at(s), result: { finalResponse: HARVEST } });

async function leaf(derived: string, w: World = {}) {
  return computeValueLegContainmentFact(world({ executions: [harvestExec()], ...w }),
    { taskId: 'd1', finalResponse: derived, executionId: 'ed1' });
}
const disp = (f: Record<string, unknown>) => f.containmentDisposition as { disposition: string; reason: string };

async function main() {
  console.log('\n🧪 Value-leg containment (B4/B5)\n');

  // ── isValueLeg + the closed set (AU-4) ──
  await test('VALUE_LEG_PROTOCOLS is pinned: exactly network-derivation-protocol (a new member is a design decision)', () => {
    assert(JSON.stringify(VALUE_LEG_PROTOCOLS) === '["network-derivation-protocol"]', JSON.stringify(VALUE_LEG_PROTOCOLS));
  });
  await test('isValueLeg is FALSE for every other seeded protocol, null and empty; true for both name forms', () => {
    for (const p of PROTOCOLS.map((x) => x.name)) {
      if (p === 'network-derivation-protocol') continue;
      assert(!isValueLegProtocol(p), `${p} read as a value leg`);
    }
    assert(!isValueLegProtocol(null) && !isValueLegProtocol('') && !isValueLegProtocol(undefined), 'null/empty');
    assert(isValueLegProtocol('network-derivation') && isValueLegProtocol('network-derivation-protocol'), 'both forms');
    assert(!isValueLegTask({ metadata: { protocol: 'network-provisioning-protocol' } }), 'network-provisioning leg');
    assert(!isValueLegTask({ metadata: {} }), 'unstamped, untitled leg');
  });

  // ── leaf-persist (B4.1) ──
  await test('LEAF clean: all six members ⇒ checked, benign checked-clean, legShape + orphanCheck stamped, disposition LAST', async () => {
    const f = await leaf(DERIVED_SIX);
    assert(f.checked === true, JSON.stringify(f));
    assert(disp(f).disposition === 'benign' && disp(f).reason === 'checked-clean', JSON.stringify(disp(f)));
    const ls = f.legShape as Record<string, unknown>;
    assert(ls.shape === 'value' && ls.protocol === 'network-derivation-protocol', JSON.stringify(ls));
    assert(ls.harvestExecutionId === 'eh1' && ls.derivedExecutionId === 'ed1', JSON.stringify(ls));
    assert(JSON.stringify(f.orphanCheck) === '{"checked":false,"reason":"not-applicable-value-leg"}', JSON.stringify(f.orphanCheck));
    const keys = Object.keys(f);
    assert(keys[keys.length - 1] === 'containmentDisposition', `key order: ${keys.join(',')}`);
    assert(f.harvestSource === 'h1' && f.derivedSource === 'd1', 'sources');
  });
  await test('THE OMISSION CASE (AR F3): three of six members, correct /29 ⇒ the PLATFORM reads checked-clean — ' +
             'membership is the Reviewer\'s in Stage A, which is why its guidance carries this case', async () => {
    const f = await leaf(DERIVED_THREE);
    assert(f.checked === true && disp(f).reason === 'checked-clean',
      `if this ever turns non-clean, a membership check has landed — update derivation_reviewer's remit: ${JSON.stringify(disp(f))}`);
  });
  await test('LEAF no derived block ⇒ value-leg-no-derived-block ⇒ BLOCKING (unrecognised-reason, audit A3)', async () => {
    const f = await leaf('no block here');
    assert(f.reason === 'value-leg-no-derived-block', String(f.reason));
    assert(disp(f).disposition === 'blocking' && disp(f).reason === 'unrecognised-reason:value-leg-no-derived-block', JSON.stringify(disp(f)));
    assert(f.harvestedCount === 6, 'the harvest census is kept');
  });
  await test('B6 S2b: an EMPTY ## Derived Values block (`[]`) is treated as no value ⇒ value-leg-no-derived-block ⇒ blocking', async () => {
    const f = await leaf(block('## Derived Values', []));
    assert(f.reason === 'value-leg-no-derived-block' && f.checked === false, JSON.stringify(f));
    assert(disp(f).disposition === 'blocking', JSON.stringify(disp(f)));
  });
  for (const [label, w, reason] of [
    ['no child stage', { childStage: null }, 'value-leg-owning-leg-none'],
    ['no owning leg', { legs: [] }, 'value-leg-owning-leg-none'],
    ['two owning legs', { legs: [
      { id: 'L1', title: 'a', metadata: { protocol: 'network-derivation-protocol', pipelineStageId: LEG_STAGE } },
      { id: 'L2', title: 'b', metadata: { protocol: 'network-derivation-protocol', pipelineStageId: LEG_STAGE } }] },
      'value-leg-owning-leg-ambiguous'],
    ['a derivation_architect inside a network-provisioning leg', { legs: [
      { id: 'L3', title: 'x', metadata: { protocol: 'network-provisioning-protocol', pipelineStageId: LEG_STAGE } }] },
      'value-leg-owning-leg-not-value'],
  ] as Array<[string, World, string]>) {
    await test(`LEAF tripwire: ${label} ⇒ ${reason} ⇒ blocking`, async () => {
      const f = await leaf(DERIVED_SIX, w);
      assert(f.reason === reason, String(f.reason));
      assert(disp(f).disposition === 'blocking', JSON.stringify(disp(f)));
    });
  }
  await test('a reused harvester whose OWN injection was network-provisioning does not make the leg non-value (AE)', async () => {
    const f = await leaf(DERIVED_SIX, { executions: [{ ...harvestExec(), result: { finalResponse: HARVEST,
      protocolInjection: { delta: 'network-provisioning-protocol' } } }] });
    assert((f.legShape as Record<string, unknown>)?.shape === 'value' && f.checked === true, JSON.stringify(f));
  });

  // ── leg-synthesize hoist (B4.2/B4.3) ──
  const stampExec = async (): Promise<StubExecution> => ({ id: 'ed1', taskId: 'd1', createdAt: at(2),
    result: { finalResponse: DERIVED_SIX, derivationContainment: await leaf(DERIVED_SIX) } });
  const hoist = async (w: World, chainedFrom: unknown = []) =>
    hoistValueLegContainment(world(w), { stageId: LEG_STAGE, chainedFrom });

  await test('HOIST clean: the Architect\'s stamp, unchanged, plus its source', async () => {
    const s = await stampExec();
    const f = await hoist({ executions: [harvestExec(), s] });
    const { source, ...rest } = f;
    assert(source === 'd1', String(source));
    assert(JSON.stringify(rest) === JSON.stringify(s.result!.derivationContainment), 'hoist must not recompute');
  });
  const tripCases: Array<[string, () => Promise<Record<string, unknown>>, string]> = [
    ['an author child (visible only here)', async () => hoist({ kids: [...KIDS_VALUE,
      { id: 'a1', title: 'Author configs', agentRole: 'config_change_author' }], executions: [harvestExec(), await stampExec()] }),
      'value-leg-has-author-child'],
    ['no Architect stamp', async () => hoist({ executions: [harvestExec()] }), 'value-leg-no-architect-stamp'],
    ['no Architect child', async () => hoist({ kids: [KIDS_VALUE[0], KIDS_VALUE[2]], executions: [harvestExec()] }),
      'value-leg-no-architect-stamp'],
    ['a pipeline upstream (Stage A: value legs are producers)', async () =>
      hoist({ executions: [harvestExec(), await stampExec()] }, [{ taskId: 'up', source: 'report.md' }]),
      'value-leg-has-pipeline-upstream'],
    ['the harvest re-ran after the derivation', async () =>
      hoist({ executions: [harvestExec(), await stampExec(), harvestExec('eh2', 3)] }),
      'value-leg-harvest-execution-mismatch'],
  ];
  for (const [label, run, reason] of tripCases) {
    await test(`HOIST tripwire: ${label} ⇒ ${reason} ⇒ blocking, checked:false, value kept`, async () => {
      const f = await run();
      assert(f.reason === reason, String(f.reason));
      assert(f.checked === false && f.unsupported === undefined, 'tripwire must be checked:false with no unsupported');
      assert(disp(f).disposition === 'blocking' && disp(f).reason === `unrecognised-reason:${reason}`, JSON.stringify(disp(f)));
      if (reason !== 'value-leg-no-architect-stamp') {
        assert(Array.isArray(f.derivedValues) && (f.derivedValues as unknown[]).length === 1, 'derivedValues kept');
      }
    });
  }
  await test('B6 S22: a leaf refusal stamp WITHOUT legShape hoists its OWN reason, never relabelled a harvest mismatch', async () => {
    const leafRefusal = await leaf(DERIVED_SIX, { legs: [] });   // value-leg-owning-leg-none, no legShape
    assert(leafRefusal.legShape === undefined, 'fixture premise');
    const f = await hoist({ executions: [harvestExec(), { id: 'ed1', taskId: 'd1', createdAt: at(2),
      result: { finalResponse: DERIVED_SIX, derivationContainment: leafRefusal } }] });
    assert(f.reason === 'value-leg-owning-leg-none' && f.source === 'd1', JSON.stringify(f));
    assert(disp(f).disposition === 'blocking', JSON.stringify(disp(f)));
  });
  await test('EF edit 7: a tripwire over a checked:true stamp NEVER reads checked-clean', async () => {
    const f = await hoist({ kids: [...KIDS_VALUE, { id: 'a1', title: 'Author x', agentRole: 'config_change_author' }],
      executions: [harvestExec(), await stampExec()] });
    assert(disp(f).reason !== 'checked-clean' && f.checked === false, JSON.stringify(disp(f)));
  });

  // ── dispatch: non-value legs byte-identical (B4.2, B5 "no-author-child byte-identical") ──
  await test('DISPATCH: a non-value leg with no author still stamps the existing no-author-child fact, byte-identical', async () => {
    const net = MECHANICAL_NETS.find((n) => n.name === 'derivationContainment' && n.point === 'leg-synthesize')!;
    const db = world({ kids: [KIDS_VALUE[0]], executions: [harvestExec()] });
    const meta = { protocol: 'network-provisioning-protocol', pipelineStageId: LEG_STAGE };
    const viaNet = await net.enrich({ prisma: db, programTier: false, task: { id: 'leg1', type: 'PIPELINE', metadata: meta, inputContext: {} } } as unknown as NetContext);
    const direct = await computeDerivationContainmentFact(db, { stageId: LEG_STAGE, chainedFrom: undefined, programTier: false });
    assert(JSON.stringify(viaNet) === JSON.stringify(direct) && viaNet.reason === 'no-author-child', JSON.stringify(viaNet));
  });
  await test('DISPATCH: a value leg goes to the hoist', async () => {
    const net = MECHANICAL_NETS.find((n) => n.name === 'derivationContainment' && n.point === 'leg-synthesize')!;
    const f = await net.enrich({ prisma: world({ executions: [harvestExec(), await stampExec()] }), programTier: false,
      task: { id: 'leg1', type: 'PIPELINE', metadata: { protocol: 'network-derivation-protocol', pipelineStageId: LEG_STAGE }, inputContext: {} } } as unknown as NetContext);
    assert(f.source === 'd1' && (f.legShape as Record<string, unknown>)?.shape === 'value', JSON.stringify(f));
  });
  await test('LEAF appliesTo is an EXACT role match: infra_change_architect / program_architect / value_chain_architect do not run it', () => {
    const net = MECHANICAL_NETS.find((n) => n.name === 'derivationContainment' && n.point === 'leaf-persist')!;
    const ctx = (role: string, type = 'ACTION') => ({ agentRole: role, task: { type } }) as unknown as NetContext;
    assert(net.appliesTo(ctx('derivation_architect')), 'derivation_architect');
    for (const r of ['infra_change_architect', 'program_architect', 'value_chain_architect', 'network_design_architect', 'derivation_reviewer']) {
      assert(!net.appliesTo(ctx(r)), r);
    }
    assert(!net.appliesTo(ctx('derivation_architect', 'PIPELINE')), 'never on a PIPELINE task');
  });

  // ── rollback (B4.4, audit A4) ──
  await test('ROLLBACK: a value leg with no author ⇒ value-leg-no-package BENIGN; a non-value leg is unchanged (hard-gap)', async () => {
    const db = world({ kids: KIDS_VALUE }) as unknown as Parameters<typeof hoistRollbackContainment>[0];
    const v = await hoistRollbackContainment(db, { stageId: LEG_STAGE, valueLeg: true });
    const rd = v.rollbackDisposition as { disposition: string; reason: string };
    assert(v.reason === 'value-leg-no-package' && rd.disposition === 'benign', JSON.stringify(v));
    const before = await hoistRollbackContainment(db, { stageId: LEG_STAGE });
    const after = await hoistRollbackContainment(db, { stageId: LEG_STAGE, valueLeg: false });
    assert(JSON.stringify(before) === JSON.stringify(after) && before.reason === 'no-author-child', JSON.stringify(before));
    assert((before.rollbackDisposition as { disposition: string }).disposition === 'blocking', 'non-value stays fail-closed');
  });

  // ── E3b-5: nesting survives the whitelist ──
  await test('E3b-5: legShape and orphanCheck survive NESTED; a promoted top-level sibling is stripped', async () => {
    const f = await leaf(DERIVED_SIX);
    const picked = pickResultJsonSummary({ derivationContainment: f, legShape: { shape: 'value' }, finalResponse: 'x' });
    const dc = picked.derivationContainment as Record<string, unknown>;
    assert(dc && (dc.legShape as Record<string, unknown>).shape === 'value' && dc.orphanCheck, 'nested fields lost');
    assert(!('legShape' in picked), 'a promoted sibling must be stripped by the whitelist');
  });

  // ── card (B4.6) ──
  await test('CARD: a value-leg fact renders legShape, the VALUE and orphanCheck — the exact names the pov-program SYNTHESIZE text uses', async () => {
    const f = await leaf(DERIVED_SIX);
    const line = String(leanFactsLine({ derivationContainment: f }));
    for (const seg of ['legShape: value', 'value: cidr 10.99.0.0/27', 'orphanCheck: not applicable (value leg)']) {
      assert(line.includes(seg), `missing "${seg}" in: ${line}`);
    }
    // Promotion E (E2): the value-leg text lives in pov-program-protocol 2.0.0 (VALUE_LEG_* section constants); the
    // retired value-chain-program row is a tombstone and names nothing.
    const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')!.promptText;
    for (const name of ['`legShape: value`', '`value:`', '`orphanCheck: not applicable (value leg)`']) {
      assert(pov.includes(name), `the pov-program SYNTHESIZE text no longer names ${name} — card and text drifted`);
    }
  });

  // ── EF-F1 (promotion E, E2): the card↔text pin, BIDIRECTIONAL, over every platform-emitted name the folded value-leg
  // text relies on (REVIEW-execution-facts-specialist.md §1a). Each row asserts BOTH directions:
  //   (1) the pov-program text names it, and (2) a fixture run through the SHIPPING code emits that exact string.
  // A one-directional "text includes X" pin stays green on a name the code has stopped emitting (the dialect-lint
  // forbiddenTokens class); that is the failure R5's same-day rename (b38a6c71) would have walked into. Rename a
  // name in code without the text, or the text without the code, and this goes red.
  await test('EF-F1 TWO-WAY: every value-leg name the pov-program text uses is emitted by the shipping code under that exact name', async () => {
    const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')!.promptText;
    const card = (dc: Record<string, unknown>) => String(leanFactsLine({ derivationContainment: dc }));
    const clean = await leaf(DERIVED_SIX);
    const noBlock = await leaf('no block here');
    const noHarvestChild = await computeValueLegContainmentFact(world({ kids: [KIDS_VALUE[1], KIDS_VALUE[2]], executions: [] }),
      { taskId: 'd1', finalResponse: DERIVED_SIX, executionId: 'ed1' });
    const unparseableHarvest = await leaf(DERIVED_SIX, { executions: [{ id: 'eh1', taskId: 'h1', createdAt: at(1), result: { finalResponse: 'no harvest block' } }] });
    const rb = await hoistRollbackContainment(world({ kids: KIDS_VALUE }) as unknown as Parameters<typeof hoistRollbackContainment>[0], { stageId: LEG_STAGE, valueLeg: true });
    const s6 = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Derive x', agentRole: 'derivation_architect',
      confidenceScore: 90, finalResponse: 'derivation', derivationContainment: clean }] }).join('\n');
    const consumer = await computeDerivationContainmentFact(
      world({ kids: [{ id: 'ch', title: 'Harvest x', agentRole: 'infra_state_harvester' }, { id: 'ca', title: 'Author x', agentRole: 'config_change_author' }],
        executions: [{ id: 'eca', taskId: 'ca', createdAt: at(5), result: { finalResponse: block('## Consumed Values', [{ kind: 'cidr', value: '10.99.0.0/26' }]) } }] }),
      { stageId: 'consumer-stage', chainedFrom: [{ taskId: 'leg1', source: 'report.md', derivationContainment: clean }] });
    const rows: Array<[string, string, string]> = [
      // [name the TEXT uses, what the shipping CODE emitted, the exact emitted substring]
      ['`legShape: value`', card(clean), 'legShape: value'],
      ['`value:`', card(clean), 'value: cidr 10.99.0.0/27'],
      ['`value: NONE STAMPED`', card(noBlock), 'value: NONE STAMPED'],
      ['`orphanCheck: not applicable (value leg)`', card(clean), 'orphanCheck: not applicable (value leg)'],
      ['`benign (value-leg-no-package)`', String(leanFactsLine({ rollbackContainment: rb })), 'rollbackDisposition: benign (value-leg-no-package)'],
      ['`benign (checked-clean)`', card(clean), 'containmentDisposition: benign (checked-clean)'],
      // E4 (EF-F4, PC-E2 L2): the text became "(e.g. no harvest child)" — the row moved in the same commit; the property is unchanged.
      ['`hard-gap` (e.g. no harvest child)', card(noHarvestChild), 'containmentDisposition: blocking (hard-gap)'],
      ['`harvest-missing-or-unparseable-no-upstream`', card(unparseableHarvest), 'containmentDisposition: blocking (harvest-missing-or-unparseable-no-upstream)'],
      ['`unrecognised-reason:value-leg-', card(noBlock), 'containmentDisposition: blocking (unrecognised-reason:value-leg-'],
      ['`Derivation containment (platform fact)`', s6, '**Derivation containment (platform fact)**'],
      ['(`consumed-value-mismatch`)', JSON.stringify(consumer.violations ?? []), '"consumed-value-mismatch"'],
    ];
    const bad: string[] = [];
    for (const [inText, emitted, emittedName] of rows) {
      if (!pov.includes(inText)) bad.push(`TEXT no longer names ${inText}`);
      if (!emitted.includes(emittedName)) bad.push(`CODE no longer emits "${emittedName}" (got: ${emitted.slice(0, 300)})`);
    }
    assert(bad.length === 0, `card↔text drift:\n       ${bad.join('\n       ')}`);
  });
  // ── Promotion E (E4, 2026-10-05): the Node C paragraph + SYNTHESIZE corrections, pinned beside the E2 pins ──
  // PC-F1 / B14: "check only" is scoped to a consumer that DECLARES its value, so BRANCH D3's discharge (an undeclared
  // consumer is Node C's to compare) is reachable again. PC-F7 / §8 C-1: the untyped-entry rule, keyed on the platform
  // fact `legShape: value` — never a leg token (the absolute-zero layering pin). EF-F5 / K6: the machine-parsed ✗
  // parenthetical is gone and the absence exemption beside it stays. PC-F11: the paragraph leans on a ROLE sentence
  // ("the evidence-section rule elsewhere in your instructions"), so that sentence must survive in change_reviewer.
  await test('E4 Node C paragraph + SYNTHESIZE: F1 scoping, the untyped-entry rule (both sites), K6 removed with its exemption kept, the role sentence it leans on', async () => {
    const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')!.promptText;
    const bad: string[] = [];
    const must = (cond: boolean, msg: string) => { if (!cond) bad.push(msg); };
    must(pov.includes('on a consuming leg that declares it in `## Consumed Values` you check only that its package applies exactly the declared value'),
      'F1: the "check only" sentence is no longer scoped to a declaring consumer');
    must(pov.includes('a consuming leg whose containment reads `consuming-leg-no-consumed-block` is yours to compare, per your role guidance'),
      'F1: the undeclared consumer is no longer handed to Node C (BRANCH D3 discharge unreachable)');
    must(!pov.includes('on a consuming leg you check only that its package applies exactly the value it declares'), 'F1: the unscoped sentence is back');
    must(pov.includes('A DAG entry that states no leg type is a change leg unless its `agent.results` card carries `legShape: value`; report the missing type, never BLOCKING on its own.'),
      'untyped-entry rule missing from the Node C paragraph');
    must(pov.includes('A DAG entry with no leg type is a change leg unless its card carries `legShape: value`; the missing type is reported, never BLOCKING on its own.'),
      'untyped-entry rule missing from the SYNTHESIZE value-leg block');
    must(!pov.includes("machine-parsed line is expected"), 'K6: the ✗ parenthetical is back');
    must(pov.includes('Do not refuse a value leg for the absence of configuration, validation, rollback, a `## Pre-existing Allocations` section or a `## Harvested Allocations` block'),
      'EF-F5: the absence exemption must stay beside the K6 removal (it covers a drill-down onto the Derivation Architect card)');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const roles = require('../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate').ROLE_GUIDANCE_LIBRARY as Record<string, string>;
    if (pov.includes('the evidence-section rule elsewhere in your instructions')) {
      must((roles.change_reviewer ?? '').includes('Evidence PRESENCE is always yours'),
        'PC-F11 quote-survives: the Node C paragraph points at "the evidence-section rule elsewhere in your instructions", and that change_reviewer sentence is gone');
    }
    assert(bad.length === 0, bad.join('\n       '));
  });
  await test('CARD: a non-value fact is unchanged — no value-leg segment', async () => {
    const f = await computeDerivationContainmentFact(world({ kids: [KIDS_VALUE[0]] }), { stageId: LEG_STAGE, chainedFrom: undefined });
    const line = String(leanFactsLine({ derivationContainment: f }));
    assert(!/legShape|orphanCheck|value: /.test(line), line);
  });

  // ── §6 (B4.7): the Reviewer sees the Architect sibling's disposition, never its value ──
  await test('§6: a sibling entry carrying the value-leg fact renders the DISPOSITION and not the value; no fact ⇒ no line', async () => {
    const f = await leaf(DERIVED_SIX);
    const withFact = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Derive x', agentRole: 'derivation_architect',
      confidenceScore: 90, finalResponse: 'derivation', derivationContainment: f }] }).join('\n');
    assert(withFact.includes('**Derivation containment (platform fact)**: benign — checked-clean'), withFact);
    assert(!withFact.includes('10.99.0.0/27') && !withFact.includes('Derived values stamped'), 'value line leaked');
    const without = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Derive x', agentRole: 'derivation_architect',
      confidenceScore: 90, finalResponse: 'derivation' }] }).join('\n');
    assert(!without.includes('Derivation containment'), without);
  });

  // ── B5: check 1 FIRES on a consumed-value mismatch against a value-leg upstream ──
  await test('CHECK 1: a consuming leg chained from a value leg is green on a match and FIRES on a mismatch', async () => {
    const up = await leaf(DERIVED_SIX);
    const consumerKids: Kid[] = [{ id: 'ch', title: 'Harvest x', agentRole: 'infra_state_harvester' },
      { id: 'ca', title: 'Author x', agentRole: 'config_change_author' }];
    const run = async (applied: string) => computeDerivationContainmentFact(
      world({ kids: consumerKids, executions: [{ id: 'eca', taskId: 'ca', createdAt: at(5),
        result: { finalResponse: block('## Consumed Values', [{ kind: 'cidr', value: applied }]) } }] }),
      { stageId: 'consumer-stage', chainedFrom: [{ taskId: 'leg1', source: 'report.md', derivationContainment: up }] });
    const ok = await run('10.99.0.0/27');
    assert((ok.upstreamContainment as { green: boolean }).green === true, JSON.stringify(ok.upstreamContainment));
    assert(!(ok.violations as unknown[] | undefined)?.length, JSON.stringify(ok.violations));
    const bad = await run('10.99.0.0/26');
    assert((bad.violations as Array<{ kind?: string; type?: string }>)?.length === 1, `check 1 did not fire: ${JSON.stringify(bad)}`);
    assert(disp(bad).disposition === 'blocking', JSON.stringify(disp(bad)));
  });

  // ── AU-4: the child titles the enrichment keys on are the ones the protocol tells the harness to write ──
  await test('network-derivation child titles start with the prefixes the enrichment reads (Harvest / Derive / Review derivation)', () => {
    const nd = PROTOCOLS.find((p) => p.name === 'network-derivation-protocol')!.promptText;
    for (const t of ['"Harvest current network state for <intent>"', '"Derive <intent>"', '"Review derivation for <intent>"']) {
      assert(nd.includes(t), `protocol no longer names ${t}`);
    }
    assert(nd.includes('`Network Derivation Architect`') && nd.includes('`Network Derived Value Reviewer`'), 'template names (renamed, B6 D3)');
    // Promotion E (E2, D4): pov-program's Node C is the unbound `Program Integration Reviewer` row — never `Change
    // Reviewer` (bound to network-provisioning) and never the retired `Value-Chain Program Integration Reviewer` (a
    // substring of it: a mis-name would fuzzy-bind the other row silently).
    const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')!.promptText;
    assert(pov.includes('then `agent.assign` the `Program Integration Reviewer` template'),
      'pov-program Node C is assigned the `Program Integration Reviewer` template');
    assert(!pov.includes('the `Change Reviewer` template'), 'pov-program Node C must not be the bound Change Reviewer (B1)');
    assert(!pov.includes('Value-Chain'), 'pov-program names no Value-Chain row');
  });

  // ── Promotion E (E6, C1-a; PLAN-v2 §E6, B9): the producer and Node C depend on the pipeline children ONLY ──
  // C1: in 3 of 7 value-chain runs both were wired to the change-method gates (the harness read the gate table, or obeyed
  // an Architect that had). The rule sits IN each step's dependencyIds bracket, and the override clause is stated once.
  // The Architect half is anchored in test-requirements-guidance-anchors.ts.
  await test('pov-program PLAN-SPAWN steps 5 and 6: dependencyIds = the pipeline child ids, never a gate (E6)', () => {
    const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')!.promptText;
    const step = (start: string, end: string) => {
      const i = pov.indexOf(start), j = pov.indexOf(end, i);
      assert(i >= 0 && j > i, `cannot locate "${start}"`);
      return pov.slice(i, j);
    };
    const s5 = step('5. Create the **program-synthesis producer**', '\n6. Create **Node C');
    const s6 = step('6. Create **Node C', '\n7. Wire the deliverable');
    const BRACKET = '`dependencyIds: [<ALL pipeline child ids — never a gate>]`';
    assert(s5.includes(BRACKET), 'step 5 (producer) bracket carries "— never a gate"');
    assert(s6.includes(BRACKET), 'step 6 (Node C) bracket carries "— never a gate"');
    const CLAUSE = 'whatever the plan, its contract or its gate table says';
    assert(s5.includes(CLAUSE), 'step 5 states the override clause');
    assert(pov.split(CLAUSE).length - 1 === 1, `the override clause is stated exactly once (${pov.split(CLAUSE).length - 1})`);
    assert(!pov.includes('[<ALL pipeline child ids>]'), 'no unqualified [<ALL pipeline child ids>] bracket survives');
    // E6 review TD-LOW-1: the PLAN-SPAWN retrigger line agrees with the wiring (the last GATE release usually wakes SYNTHESIZE).
    assert(pov.includes('when every child, gates included, is terminal, you are auto-retriggered into PROGRAM SYNTHESIZE'),
      'the retrigger line names every child, gates included');
    assert(!pov.includes('when the last of producer + Node C completes'), 'the producer + Node C retrigger wording is gone');
  });

  // ── EF F12: the prediction table — what every leaf/leg net stamps on a value leg (fixture) ──
  await test('F12 PREDICTION: the leaf nets on the Derivation Architect and the Reviewer', async () => {
    const stamped: Record<string, Record<string, unknown>> = {};
    const ctx = (role: string, fr: string) => ({ prisma: world({ executions: [harvestExec()] }), programTier: false,
      agentRole: role, harnessMode: null, finalResponse: fr, executionId: 'ed1', stageId: null,
      task: { id: role === 'derivation_architect' ? 'd1' : 'r1', type: 'ACTION', metadata: {}, inputContext: {} },
      children: async () => KIDS_VALUE, contractApplicability: async () => null }) as unknown as NetContext;
    await runNetsAtPoint('leaf-persist', ctx('derivation_architect', DERIVED_SIX), MECHANICAL_NETS,
      (n, f) => { stamped[`architect.${n}`] = f; }, () => {});
    await runNetsAtPoint('leaf-persist', ctx('derivation_reviewer', '## VERDICT: APPROVED'), MECHANICAL_NETS,
      (n, f) => { stamped[`reviewer.${n}`] = f; }, () => {});
    const keys = Object.keys(stamped).sort().join(', ');
    assert(keys === 'architect.derivationContainment, architect.markerPresence', `stamped: ${keys}`);
    assert((stamped['architect.markerPresence'] as Record<string, unknown>).derivedValues === true, 'Architect ✓ derived');
    console.log(`       architect: markerPresence derived ✓; derivationContainment ${disp(stamped['architect.derivationContainment']).reason}; ` +
      'reviewer: no leaf net applies (derivation_reviewer matches neither leaf-role regex)');
  });

  console.log(`\n📊 ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
