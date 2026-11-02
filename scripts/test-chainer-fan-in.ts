/**
 * FAN-IN CHAINING (FI-2, 2026-10-23) — a program leg with TWO PIPELINE upstream legs, through the REAL chainer and on into
 * the REAL containment enrichment.
 *
 * WHY THIS FILE EXISTS. A leg can depend on two upstream legs (`dependencyIds: [gate, A, B]`) and the platform will run it,
 * but 0 of 713 PIPELINE tasks ever have (measured 2026-10-22), and every chainer test that used several dependencies used
 * ACTION children inside one stage. Bug Class 85's fixtures test the containment NET on hand-built `chainedFrom` — not the
 * path INTO it. This suite drives `chainDependencyContext` with two PIPELINE predecessors and hands its OUTPUT, unedited, to
 * `computeDerivationContainmentFact`, so the seam between the two is what is tested.
 *
 * Record: cline_docs/follow-ups/fan-in-program-graphs-2026-10-23.md (FI-2); design: PROGRAM-COMPOSITION-CATALOG §Fan-in.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
const { chainDependencyContext } = require('../lib/agents/harness/context-chainer') as typeof import('../lib/agents/harness/context-chainer');
import { computeDerivationContainmentFact, type ContainmentPrisma } from '../lib/agents/harness/derivation-containment-enrichment';
import { authoritativeReadStubFromTexts } from './fixtures/authoritative-read-stub';

let passed = 0;
let failed = 0;
const declared = (require('fs').readFileSync(__filename, 'utf-8').match(/^ {2}await test\(/gm) || []).length;
async function test(desc: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${desc}`); } catch (e) { failed++; console.log(`  ❌ ${desc}\n       ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

// ── The upstream legs (PIPELINE predecessors) ────────────────────────────────────────────────────────────────────────
interface Upstream {
  id: string;
  status?: 'COMPLETED' | 'IN_PROGRESS';
  inFlight?: boolean;               // a completed leg whose SYNTHESIZE execution is still persisting (F18)
  executionStatus?: string;         // default SUCCESS; a mid-flight leg is RUNNING
  reportMd?: string | null;         // null ⇒ no report.md ⇒ the pipeline-index.json fallback
  dc: Record<string, unknown>;      // the leg's own stamped derivationContainment (pipeline-index.json)
}
const cidr = (value: string) => ({ kind: 'cidr', value });
const CLEAN = (values: string[]) => ({ checked: true, violations: [], derivedValues: values.map(cidr),
  containmentDisposition: { disposition: 'benign', reason: 'checked-clean' } });
const UNDECIDED = { checked: false, reason: 'no-derived-values-block', harvestedCount: 2,
  containmentDisposition: { disposition: 'needs-node-c', reason: 'harvested-pool-no-derivation-cannot-decide' } };

/** A chainer client modelling exactly the calls `chainDependencyContext` makes; anything else throws. */
function chainerStub(ups: Upstream[], captured: { dependencyQuery?: unknown } = {}) {
  const byId = new Map(ups.map(u => [u.id, u]));
  const piContent = (u: Upstream) => JSON.stringify({ finalResponse: `leg ${u.id} synthesis`, confidenceScore: 90, derivationContainment: u.dc });
  return {
    taskDependency: {
      findMany: async (args: unknown) => {
        captured.dependencyQuery = args;
        return ups.map(u => ({ dependsOn: {
          id: u.id, title: `Program leg ${u.id}`, status: u.status ?? 'COMPLETED', type: 'PIPELINE', agentRole: null,
          agentTemplateId: null, executionStatus: u.executionStatus ?? 'SUCCESS', metadata: {}, stageId: `stage-${u.id}` } }));
      },
    },
    agentExecution: {
      findFirst: async (args: { where?: { taskId?: string; status?: { in?: string[] } } }) => {
        if (!args?.where?.status?.in) throw new Error(`unmodelled agentExecution.findFirst ${JSON.stringify(args)}`);
        return byId.get(String(args.where.taskId))?.inFlight ? { id: `exec-${args.where.taskId}-running` } : null;
      },
      findMany: async (args: { where?: { taskId?: string } }) =>
        [{ id: `exec-${args?.where?.taskId}`, status: 'SUCCESS', createdAt: new Date(), supersededById: null }],
    },
    agentArtifact: {
      findFirst: async (args: { where: { executionId: string; name: string | { in: string[] } } }) => {
        const u = byId.get(args.where.executionId.replace(/^exec-/, ''));
        if (!u) return null;
        const name = args.where.name;
        if (typeof name === 'object') return { content: piContent(u) };          // the selector's R8 floor read
        if (name === 'pipeline-index.json') return { content: piContent(u) };
        if (name === 'report.md') return u.reportMd === null ? null : { content: u.reportMd ?? `# Leg ${u.id} report` };
        return null;
      },
    },
    task: { findUnique: async () => null },
    stage: { findUnique: async () => null },
  } as unknown as Parameters<typeof chainDependencyContext>[1];
}

// ── The consuming leg's own children (what the containment enrichment reads) ─────────────────────────────────────────
const STAGE = 'stage-consumer';
const KIDS = [
  { id: 'hc', title: 'Harvest current state', agentRole: 'infra_state_harvester' },
  { id: 'ac', title: 'Author change package', agentRole: 'config_change_author' },
];
const block = (marker: string, json: unknown) => `text\n\n${marker}\n\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\n`;
function consumerPrisma(consumed: Array<{ kind: string; value: string }>): ContainmentPrisma {
  return {
    task: { findMany: async () => KIDS } as unknown as ContainmentPrisma['task'],
    ...authoritativeReadStubFromTexts({
      hc: block('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.50.0.1/32', device: 'sg' }]),
      ac: block('## Consumed Values', consumed),
    }),
  } as unknown as ContainmentPrisma;
}
async function containmentOf(ups: Upstream[], consumed: Array<{ kind: string; value: string }>) {
  const ctx = await chainDependencyContext('consumer-leg', chainerStub(ups));
  assert(ctx, 'the chainer must return context for a leg with dependencies');
  const fact = await computeDerivationContainmentFact(consumerPrisma(consumed), { stageId: STAGE, chainedFrom: ctx!.chainedFrom });
  return { ctx: ctx!, fact, d: fact.containmentDisposition as { disposition: string; reason: string; inputs: Record<string, unknown> } };
}

async function main() {
  console.log('\n📋 Fan-in: one program leg, two PIPELINE upstream legs — chainer → containment\n');

  await test('FI2-1: both upstream deliverables are chained (report.md), in the order the query returns them; the query asks for creation order', async () => {
    const captured: { dependencyQuery?: unknown } = {};
    const ctx = await chainDependencyContext('consumer-leg', chainerStub([
      { id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', dc: CLEAN(['10.20.0.0/24']) }], captured));
    assert(ctx && ctx.chainedFrom.length === 2, `expected 2 chained entries, got ${JSON.stringify(ctx?.chainedFrom.map(e => e.taskId))}`);
    assert(ctx!.chainedFrom.map(e => e.taskId).join(',') === 'legA,legB', `order: ${ctx!.chainedFrom.map(e => e.taskId)}`);
    assert(ctx!.chainedFrom.every(e => (e as { source?: string }).source === 'report.md'), 'both must be the report.md deliverable');
    assert(ctx!.chainedFrom.every(e => e.derivationContainment !== null), 'each carries its own containment stamp (CC3)');
    assert(JSON.stringify((captured.dependencyQuery as { orderBy?: unknown }).orderBy) === JSON.stringify({ dependsOn: { createdAt: 'asc' } }),
      `CC2b: foundational-first order must be requested: ${JSON.stringify((captured.dependencyQuery as { orderBy?: unknown }).orderBy)}`);
    assert(ctx!.pipelineMetadata.allDependenciesMet === true && ctx!.pipelineMetadata.notChained.length === 0
      && ctx!.pipelineMetadata.totalDependencies === 2, JSON.stringify(ctx!.pipelineMetadata));
  });

  await test('FI2-2 (F18): one upstream completed but still persisting ⇒ NOT chained from a stale snapshot, recorded in notChained — never a silent single-upstream chain', async () => {
    const ctx = await chainDependencyContext('consumer-leg', chainerStub([
      { id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', inFlight: true, dc: CLEAN(['10.20.0.0/24']) }]));
    assert(ctx!.chainedFrom.map(e => e.taskId).join(',') === 'legA', JSON.stringify(ctx!.chainedFrom.map(e => e.taskId)));
    assert(JSON.stringify(ctx!.pipelineMetadata.notChained) === JSON.stringify([{ taskId: 'legB', reason: 'pipeline-synthesis-in-flight' }]),
      JSON.stringify(ctx!.pipelineMetadata.notChained));
  });

  await test('FI2-3: one upstream still running ⇒ allDependenciesMet false and the missing leg named', async () => {
    // Realistic mid-flight leg (IN_PROGRESS, execution RUNNING). Note: the chainer CHAINS a not-COMPLETED dependency whose
    // executionStatus is SUCCESS (a harness after PLAN-SPAWN) — unreachable in a normal run, because every execution entry
    // path refuses DEPENDENCY_NOT_SATISFIED first (listUnsatisfiedDeps; scripts/test-execute-routes-dependency-gate.ts).
    const ctx = await chainDependencyContext('consumer-leg', chainerStub([
      { id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', status: 'IN_PROGRESS', executionStatus: 'RUNNING', dc: CLEAN(['10.20.0.0/24']) }]));
    assert(ctx!.pipelineMetadata.allDependenciesMet === false, JSON.stringify(ctx!.pipelineMetadata));
    assert(ctx!.pipelineMetadata.notChained.some(n => n.taskId === 'legB' && n.reason === 'dependency-not-completed'),
      JSON.stringify(ctx!.pipelineMetadata.notChained));
  });

  await test('FI2-4 end to end: two CLEAN upstreams, the consumer applies one value from each ⇒ green, benign, check 1 ran', async () => {
    const { fact, d } = await containmentOf([{ id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', dc: CLEAN(['10.20.0.0/24']) }],
      [cidr('10.10.0.0/24'), cidr('10.20.0.0/24')]);
    const uc = fact.upstreamContainment as { green: boolean; legs: Array<{ taskId: string }> };
    assert(uc.green === true && uc.legs.map(l => l.taskId).join(',') === 'legA,legB', JSON.stringify(uc));
    assert(fact.violations === undefined, `both values match their upstream: ${JSON.stringify(fact.violations)}`);
    assert(d.disposition === 'benign' && d.reason === 'consuming-leg-consumed-discharged', JSON.stringify(d));
  });

  await test('FI2-5 end to end (Bug Class 85): one clean + one UNDECIDED upstream ⇒ NOT green (the clean one no longer vouches for it) ⇒ delegated, legB named', async () => {
    const { fact, d } = await containmentOf([{ id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', dc: UNDECIDED }], [cidr('10.10.0.0/24')]);
    assert((fact.upstreamContainment as { green: boolean }).green === false, JSON.stringify(fact.upstreamContainment));
    assert(d.disposition === 'needs-node-c' && d.reason === 'consuming-leg-upstream-delegated', JSON.stringify(d));
    assert(JSON.stringify((d.inputs.upstreamDelegated as Array<{ taskId: string }>).map(u => u.taskId)) === '["legB"]', JSON.stringify(d.inputs));
  });

  await test('FI2-6 end to end (Bug Class 85 G1): one upstream\'s report.md never arrived ⇒ it chains as the pipeline-index.json fallback ⇒ counted, NOT green, blocking', async () => {
    const { ctx, fact, d } = await containmentOf([{ id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', reportMd: null, dc: CLEAN(['10.20.0.0/24']) }],
      [cidr('10.10.0.0/24')]);
    assert(ctx.chainedFrom.map(e => `${e.taskId}:${(e as { source?: string }).source}`).join(',') === 'legA:report.md,legB:pipeline-index.json',
      JSON.stringify(ctx.chainedFrom.map(e => [e.taskId, (e as { source?: string }).source])));
    assert(fact.upstreamDeliverableMissing === 1 && (fact.upstreamContainment as { green: boolean }).green === false, JSON.stringify(fact));
    assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-not-green', JSON.stringify(d));
  });

  await test('FI2-7 end to end (diamond): D over B and C, both carrying A ⇒ A appears ONCE in the consumer\'s legs, its worse copy kept', async () => {
    const viaA = (aCopy: Record<string, unknown>) => ({ checked: false, reason: 'no-derived-values-block', consumedValues: [cidr('10.10.0.0/24')],
      containmentDisposition: { disposition: 'benign', reason: 'consuming-leg-consumed-discharged' },
      upstreamContainment: { green: true, legs: [{ taskId: 'legA', violations: 0, derivedValues: [cidr('10.10.0.0/24')], ...aCopy }] } });
    const clean = viaA({ checked: true, disposition: 'benign', dispositionReason: 'checked-clean' });
    const undecided = viaA({ checked: false, disposition: 'needs-node-c', dispositionReason: 'harvested-pool-no-derivation-cannot-decide' });
    const both = await containmentOf([{ id: 'legB', dc: clean }, { id: 'legC', dc: clean }], [cidr('10.10.0.0/24')]);
    const aLegs = (both.fact.upstreamContainment as { legs: Array<{ taskId: string }> }).legs.filter(l => l.taskId === 'legA');
    assert(aLegs.length === 1, `A must be merged to one copy: ${JSON.stringify((both.fact.upstreamContainment as { legs: unknown }).legs)}`);
    assert(both.d.disposition === 'benign', `two clean paths to a clean A ⇒ benign: ${JSON.stringify(both.d)}`);
    const mixed = await containmentOf([{ id: 'legB', dc: clean }, { id: 'legC', dc: undecided }], [cidr('10.10.0.0/24')]);
    const a = (mixed.fact.upstreamContainment as { legs: Array<{ taskId: string; checked: boolean; disposition?: string }> }).legs.filter(l => l.taskId === 'legA');
    assert(a.length === 1 && a[0].checked === false && a[0].disposition === 'needs-node-c', `worse copy of A kept: ${JSON.stringify(a)}`);
    assert(mixed.d.reason === 'consuming-leg-upstream-delegated', JSON.stringify(mixed.d));
  });

  await test('FI2-8 KNOWN GAP, pinned as it stands (FI-1, not a defect yet): a consumer that applied legB\'s value where it needed legA\'s still passes check 1 — it matches the UNION', async () => {
    // Both upstreams derive a cidr. Nothing records which one the Author meant, so a swapped value is indistinguishable.
    // When FI-1 is decided and built, THIS TEST IS EXPECTED TO CHANGE — deliberately, in the same commit as the fix.
    const { fact, d } = await containmentOf([{ id: 'legA', dc: CLEAN(['10.10.0.0/24']) }, { id: 'legB', dc: CLEAN(['10.20.0.0/24']) }],
      [cidr('10.20.0.0/24')]);
    assert(fact.violations === undefined && d.disposition === 'benign',
      `the gap as it stands today: no violation for a value from the "wrong" upstream: ${JSON.stringify({ v: fact.violations, d })}`);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (passed + failed !== declared) { console.error(`❌ SELF-CHECK: ${declared} declared, ${passed + failed} executed`); process.exit(1); }
  process.exit(failed > 0 ? 1 : 0);
}

main();
