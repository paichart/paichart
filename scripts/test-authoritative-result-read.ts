#!/usr/bin/env ts-node
/**
 * RWF Wave B (2026-09-26): the mechanical nets read the execution the chainer chained.
 *
 * The four net reads (derivation harvest/Author/fallback, dialect-lint Author, rollback leaf-persist harvest,
 * rollback leg-synthesize hoist) go through readAuthoritativeResultField, which selects with the chainer's
 * own CHAIN_SELECTION_OPTIONS. The archive cannot prove this: 1,203 of 1,203 archived leg children agree
 * with the old latest-artifact read, so the equivalence gate is byte-identical by construction. These
 * fixtures ARE the proof (execution-facts review §7, F1-F6).
 *
 * Method: each net is run three ways over the SAME children. The first is the full history (the case
 * under test). The second has ONLY the execution that should win. The third has ONLY the one that must
 * lose. The fact must equal the second and differ from the third. "Differ" is what makes a fixture
 * discriminating: a fixture where both executions produce the same fact would pass under either read.
 *
 * No DB. The stub (scripts/fixtures/authoritative-read-stub.ts) throws on the pre-Wave-B query.
 */
import * as fs from 'fs';
import * as path from 'path';
import { authoritativeReadStub, type StubExecution } from './fixtures/authoritative-read-stub';
import { computeDerivationContainmentFact } from '../lib/agents/harness/derivation-containment-enrichment';
import { computeDialectLintFact } from '../lib/agents/harness/dialect-lint-enrichment';
import { computeRollbackContainmentFact, hoistRollbackContainment } from '../lib/agents/harness/rollback-containment-enrichment';
import { readAuthoritativeResultField } from '../lib/agents/harness/authoritative-result-read';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../lib/services/execution-selection';

const ROOT = path.resolve(__dirname, '..');
let passed = 0; const failed: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const j = (x: unknown) => JSON.stringify(x);

// ── fixture vocabulary ────────────────────────────────────────────────────────────────────────
const STAGE = 'stage-b';
const H = { id: 'harvest', title: 'Harvest current state', agentRole: 'infra_state_harvester' };
const ARCH = { id: 'arch', title: 'Design change', agentRole: 'infra_change_architect' };
const A = { id: 'author', title: 'Author change package', agentRole: 'config_change_author' };
const R = { id: 'review', title: 'Review change package', agentRole: 'change_reviewer' };
const KIDS = [H, ARCH, A, R];

const fenced = (marker: string, json: unknown) => `prose\n\n${marker}\n\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\n`;
const HARVEST = fenced('## Harvested Allocations', [{ kind: 'cidr', cidr: '10.99.0.2/32', device: 'd1' }, { kind: 'cidr', cidr: '10.99.0.3/32', device: 'd2' }]);
const DERIVED = fenced('## Derived Values', [{ kind: 'cidr', value: '10.99.0.2/31', members: ['10.99.0.2/32', '10.99.0.3/32'] }]);
const CLEAN_CFG = 'package\n\n```\nrouter isis\n metric-style wide\n```\n';
const BANNED_CFG = 'package\n\n```\nrouter isis\n level-2-only\n```\n';
const CONTRACT = { platformDialect: { forbiddenTokens: ['level-2-only'] } };

let clock = 0;
/** One execution. `newer` executions are created after older ones, in call order. */
const ex = (id: string, taskId: string, result: Record<string, unknown> | null, extra: Partial<StubExecution> = {}): StubExecution =>
  ({ id, taskId, createdAt: new Date(1_700_000_000_000 + (clock++) * 1000), result, ...extra });

/** The Prisma surface all four nets use: stage children, the rollback lane lookups, and the read stub. */
function client(executions: StubExecution[], children = KIDS) {
  return {
    task: {
      findMany: async () => children,
      // Rollback leaf-persist: the Author's own stage; no leg back-pointer, so the lane arm is skipped.
      findUnique: async () => ({ stageId: STAGE }),
    },
    stage: { findUnique: async () => ({ metadata: {} }) },
    ...authoritativeReadStub(executions),
  } as never;
}
const derivation = (execs: StubExecution[], kids = KIDS) =>
  computeDerivationContainmentFact(client(execs, kids), { stageId: STAGE, chainedFrom: undefined });
const dialect = (execs: StubExecution[]) =>
  computeDialectLintFact(client(execs), { stageId: STAGE, interfaceContract: CONTRACT });
const hoist = (execs: StubExecution[]) => hoistRollbackContainment(client(execs), { stageId: STAGE });

/** The fact under test equals the winner-only fact and differs from the loser-only fact. */
async function winsOver<T>(label: string, run: (e: StubExecution[]) => Promise<T>,
  all: StubExecution[], winnerOnly: StubExecution[], loserOnly: StubExecution[]) {
  const [got, want, lose] = [await run(all), await run(winnerOnly), await run(loserOnly)];
  assert(j(want) !== j(lose), `${label}: fixture is not discriminating — winner and loser give the same fact ${j(want).slice(0, 120)}`);
  assert(j(got) === j(want), `${label}: read the wrong execution.\n       got  ${j(got).slice(0, 160)}\n       want ${j(want).slice(0, 160)}`);
}

(async () => {
  console.log('\n🧪 RWF Wave B — nets read what the Reviewer was chained\n');

  // ── F1: a superseded newer Author. All three Author-reading nets at once, because the failure mode
  //        is the Reviewer and the gate disagreeing, and a one-net fixture cannot show that.
  await test('F1 superseded Author: derivation, dialect-lint and the hoist ALL read the older authoritative run', async () => {
    const harvest = ex('eh', H.id, { finalResponse: HARVEST });
    const good = ex('ea1', A.id, { finalResponse: DERIVED + CLEAN_CFG, rollbackContainment: { checked: true, missing: [], tag: 'RA' } });
    const bad = ex('ea2', A.id, { finalResponse: BANNED_CFG, rollbackContainment: { checked: false, reason: 'x', tag: 'RB' } },
      { supersededById: 'ea1' });
    await winsOver('derivation', derivation, [harvest, good, bad], [harvest, good], [harvest, { ...bad, supersededById: null }]);
    await winsOver('dialect', dialect, [harvest, good, bad], [good], [{ ...bad, supersededById: null }]);
    await winsOver('hoist', hoist, [harvest, good, bad], [good], [{ ...bad, supersededById: null }]);
    const h = await hoist([harvest, good, bad]);
    assert(h.tag === 'RA' && h.source === A.id, `hoist must carry RA with source: ${j(h)}`);
  });

  // ── F2: an R8-empty newer Author with a stamp. The chainer skips it, so the gate must too.
  await test('F2 R8-empty newer Author (stamped): every net reads the OLDER non-empty run, as the chainer does', async () => {
    const harvest = ex('eh', H.id, { finalResponse: HARVEST });
    const older = ex('ea1', A.id, { finalResponse: DERIVED + CLEAN_CFG, rollbackContainment: { checked: true, tag: 'RA' } });
    const emptyNewer = ex('ea2', A.id, { finalResponse: '   ', rollbackContainment: { checked: true, tag: 'RB' } });
    await winsOver('dialect', dialect, [older, emptyNewer], [older], [emptyNewer]);
    await winsOver('hoist', hoist, [older, emptyNewer], [older], [emptyNewer]);
    await winsOver('derivation', derivation, [harvest, older, emptyNewer], [harvest, older], [harvest, emptyNewer]);
  });

  // ── F3: nothing selectable. The consumed reason vocabulary is unchanged, and the hoist fails CLOSED.
  await test('F3 all candidates empty or absent: named reasons unchanged (no-author-text, no-author-stamp, no-harvest-text, derivation null path)', async () => {
    const emptyAuthor = ex('ea', A.id, { finalResponse: '', rollbackContainment: { checked: true, tag: 'stamped-over-nothing' } });
    const d = await dialect([emptyAuthor]);
    assert(d.reason === 'no-author-text', `dialect: ${j(d)}`);
    const hz = await hoist([emptyAuthor]);
    assert(hz.reason === 'no-author-stamp', `hoist must fail closed, not hoist a stamp over an empty deliverable: ${j(hz)}`);
    const harvest = ex('eh', H.id, { finalResponse: HARVEST });
    const withEmpty = await derivation([harvest, emptyAuthor]);
    const withNone = await derivation([harvest]);
    assert(j(withEmpty) === j(withNone), `derivation: an empty Author must take the same null path as no Author:\n       ${j(withEmpty)}\n       ${j(withNone)}`);
    const rb = await computeRollbackContainmentFact(client([ex('eh0', H.id, { finalResponse: '' })]),
      { taskId: A.id, deliverable: fs.readFileSync(path.join(ROOT, 'scripts/fixtures/rollback-containment/r3a3-author.md'), 'utf8') });
    assert(rb.reason === 'no-harvest-text', `rollback leaf-persist: ${j(rb)}`);
  });

  // ── F4: a superseded harvest, at BOTH points that read one.
  await test('F4 superseded harvest: rollback LEAF-PERSIST and the derivation harvest parse both read the authoritative harvest', async () => {
    const pkg = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/rollback-containment/r3a3-author.md'), 'utf8');
    const goodH = ex('eh1', H.id, { finalResponse: fs.readFileSync(path.join(ROOT, 'scripts/fixtures/rollback-containment/r3a3-harvest.md'), 'utf8') });
    const badH = ex('eh2', H.id, { finalResponse: 'a harvest that quotes none of it' }, { supersededById: 'eh1' });
    const leaf = (execs: StubExecution[]) => computeRollbackContainmentFact(client(execs), { taskId: A.id, deliverable: pkg });
    await winsOver('rollback leaf-persist', leaf, [goodH, badH], [goodH], [{ ...badH, supersededById: null }]);
    const author = ex('ea', A.id, { finalResponse: DERIVED + CLEAN_CFG });
    const goodDH = ex('eh3', H.id, { finalResponse: HARVEST });
    const badDH = ex('eh4', H.id, { finalResponse: 'no allocation block' }, { supersededById: 'eh3' });
    await winsOver('derivation harvest', derivation, [goodDH, badDH, author], [goodDH, author], [{ ...badDH, supersededById: null }, author]);
  });

  // ── F5: the derivation FALLBACK loop (a Derived block found on a non-Author child) reads authoritatively.
  await test('F5 superseded fallback child: the Architect\'s authoritative run supplies the Derived block (derivedSource unchanged)', async () => {
    const harvest = ex('eh', H.id, { finalResponse: HARVEST });
    const author = ex('ea', A.id, { finalResponse: CLEAN_CFG });
    const goodArch = ex('ec1', ARCH.id, { finalResponse: DERIVED });
    const badArch = ex('ec2', ARCH.id, { finalResponse: 'design with no block' }, { supersededById: 'ec1' });
    await winsOver('derivation fallback', derivation, [harvest, author, goodArch, badArch], [harvest, author, goodArch],
      [harvest, author, { ...badArch, supersededById: null }]);
    const f = await derivation([harvest, author, goodArch, badArch]);
    assert(f.derivedSource === ARCH.id, `derivedSource must name the Architect: ${j(f)}`);
  });

  // ── F6: chainer parity. One constant, and the helper selects exactly what the chainer would.
  await test('F6a source pin: the chainer and the helper both select with CHAIN_SELECTION_OPTIONS (never a literal)', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const chainer = strip(fs.readFileSync(path.join(ROOT, 'lib/agents/harness/context-chainer.ts'), 'utf8'));
    const helper = strip(fs.readFileSync(path.join(ROOT, 'lib/agents/harness/authoritative-result-read.ts'), 'utf8'));
    for (const [name, src] of [['context-chainer', chainer], ['authoritative-result-read', helper]] as const) {
      assert(/selectAuthoritativeExecution\([^)]*CHAIN_SELECTION_OPTIONS\)/.test(src), `${name} must pass CHAIN_SELECTION_OPTIONS`);
      assert(!/requireNonEmptyArtifact/.test(src), `${name} carries an inline requireNonEmptyArtifact literal`);
    }
    const sel = fs.readFileSync(path.join(ROOT, 'lib/services/execution-selection.ts'), 'utf8');
    assert(/export const CHAIN_SELECTION_OPTIONS = \{ requireNonEmptyArtifact: true \} as const/.test(sel), 'CHAIN_SELECTION_OPTIONS changed');
  });
  await test('F6b behavioural: for F1 and F2 shapes, the helper reads the execution selectAuthoritativeExecution(CHAIN_SELECTION_OPTIONS) returns', async () => {
    const shapes: StubExecution[][] = [
      [ex('x1', A.id, { finalResponse: 'a' }), ex('x2', A.id, { finalResponse: 'b' }, { supersededById: 'x1' })],
      [ex('y1', A.id, { finalResponse: 'a' }), ex('y2', A.id, { finalResponse: '' })],
    ];
    for (const execs of shapes) {
      const c = client(execs) as any;
      const read = await readAuthoritativeResultField(c, A.id, 'finalResponse');
      const { execution } = await selectAuthoritativeExecution(c, A.id, CHAIN_SELECTION_OPTIONS);
      assert(read.executionId === execution?.id && read.executionId === execs[0].id,
        `helper read ${read.executionId}, selector chose ${execution?.id}, expected ${execs[0].id}`);
    }
  });

  // ── The stub's own regression pin: the pre-Wave-B read cannot come back unnoticed.
  await test('S1 the stub throws on the pre-Wave-B content-taskId query (so every suite on it pins the old read out)', async () => {
    const c = client([]) as any;
    let threw = false;
    try { await c.$queryRaw(Object.assign([`SELECT x FROM agent_artifacts WHERE (content::jsonb)->>'taskId' = `, ''], { raw: [] }), 'a'); }
    catch { threw = true; }
    assert(threw, 'stub accepted a content-taskId query');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
