/**
 * Config sources STEP 3 slice P5 — join precondition 4 (register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS): a BEHAVIOURAL test of the
 * snapshot-removal arm (`configSnapshotDecision` → `remove`) and its `CONFIG_SOURCES_SNAPSHOT_REMOVED` security event, through the
 * REAL `prepareTaskForExecution` against a real database row. Until this suite the arm was pinned by a source-string test
 * (scripts/test-config-sources-step3.ts SN3) and its SQL expression was run by hand.
 *
 * WHAT IT DRIVES: real task rows of a real POV → `prepareTaskForExecution(taskId, { configSourceAwaiting })` → the one decision →
 * the first-stamp statement → the row read back; the module's own pino logger, captured at its stream.
 *
 * THE AWAITING LIST: observability's row still awaits its text, so as SHIPPED the decision is `none` for it and the removal arm is
 * not reached (R4 pins exactly that — it is what a deploy of this slice does: nothing). The arm is driven with an EMPTY list through
 * the prepare step's defaulted `configSourceAwaiting` option, the way every other awaiting-list reader is tested before the join.
 *
 * Requires the dev database + TEST_POV_ID (loaded from .env). NOT in the battery (it writes rows), like the other *-behavioral suites.
 * Run: npm run test:config-snapshot-removal-behavioral
 */
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { prepareTaskForExecution } from '../lib/agents/harness/prepare-task-for-execution';
import { configSnapshotDecision } from '../lib/agents/harness/config-sources-read';
import { CONFIG_SOURCES_SNAPSHOT_KEY } from '../lib/agents/harness/config-sources';
import { CONFIG_SOURCE_AWAITING_TEXT } from '../lib/agents/harness/held-bytes/variant';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();
let pass = 0; let fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${!ok && d ? `\n   ${d}` : ''}`); if (ok) pass++; else fail++; };
type Rec = Record<string, unknown>;

const OBS = 'observability-config-protocol';
const K8S = 'kubernetes-gitops-protocol';
const NONE: readonly string[] = [];
const BLOCK = 'Tune the collector.\n\n## Config sources\nobs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml\n\n## Notes\nx\n';
const NO_BLOCK = 'Tune the collector.';

// The module's logger writes through ONE pino stream; its `write` is replaced for the run (the pattern of test-security-invariants).
const stream = (logger as unknown as Record<symbol, { write: (l: string) => unknown }>)[pino.symbols.streamSym];
const lines: Rec[] = [];
const origWrite = stream.write.bind(stream);
stream.write = (l: string) => { try { lines.push(JSON.parse(l) as Rec); } catch { /* not a JSON line */ } return true; };
/** Key-order-free form: the stored value went through jsonb, which reorders keys. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const eventsFor = (taskId: string, code: string) => lines.filter((l) => l.taskId === taskId && l.errorCode === code);

async function main() {
  const povId = process.env.TEST_POV_ID;
  if (!povId) throw new Error('TEST_POV_ID is not set (.env)');
  const phase = await prisma.phase.findFirst({ where: { povId }, select: { id: true } });
  if (!phase) throw new Error('the test POV has no phase');
  const tag = `p5snap-${Date.now() % 1_000_000}`;
  const cleanup = { tasks: [] as string[], stages: [] as string[] };
  // A real snapshot the platform would have taken for ANOTHER text — what a create path that does not strip the key could plant.
  const plantedDecision = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: BLOCK, interfaceContract: null, takenAt: 'PLANTED' }, NONE);
  if (plantedDecision.action !== 'write') throw new Error('the fixture block did not snapshot');
  const PLANTED = JSON.parse(JSON.stringify(plantedDecision.snapshot)) as Rec;

  try {
    const stage = await prisma.stage.create({ data: { phaseId: phase.id, name: `${tag} stage`, order: 9996, status: 'PENDING' }, select: { id: true } });
    cleanup.stages.push(stage.id);
    const mk = async (title: string, description: string, metadata: Rec | undefined): Promise<string> => {
      const t = await prisma.task.create({ data: { title, description, type: 'PIPELINE', status: 'OPEN', pov: { connect: { id: povId } }, phase: { connect: { id: phase.id } },
        stage: { connect: { id: stage.id } }, ...(metadata !== undefined ? { metadata } : {}) } as never, select: { id: true } });
      cleanup.tasks.push(t.id); return t.id;
    };
    const meta = async (id: string): Promise<Rec> => (((await prisma.task.findUnique({ where: { id }, select: { metadata: true } }))?.metadata ?? {}) as Rec);
    const OBS_TITLE = (n: string) => `${tag} ${n} (protocol: observability-config)`;

    // ── R1: THE ARM — a planted snapshot, no block, the leg's first stamp ──
    const r1 = await mk(OBS_TITLE('R1'), NO_BLOCK, { [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED, keepMe: { a: 1 }, dependencies: [] });
    await prepareTaskForExecution(r1, { configSourceAwaiting: NONE });
    const m1 = await meta(r1);
    check('R1 the planted snapshot is REMOVED from the row by the first-stamp statement', !(CONFIG_SOURCES_SNAPSHOT_KEY in m1), JSON.stringify(Object.keys(m1)));
    check('R1 the same statement wrote the protocol stamp', m1.protocol === OBS && typeof m1.protocolResolvedAt === 'string', JSON.stringify(m1));
    check('R1 every other metadata key is kept as it was', JSON.stringify(m1.keepMe) === '{"a":1}' && JSON.stringify(m1.dependencies) === '[]', JSON.stringify(m1));
    const ev1 = eventsFor(r1, 'CONFIG_SOURCES_SNAPSHOT_REMOVED');
    check('R1 ONE security event names the removal: securityEvent true, the task id, warn level', ev1.length === 1 && ev1[0].securityEvent === true && ev1[0].level === 40, JSON.stringify(ev1));
    check('R1 the event carries NO snapshot content — its keys are the logger\'s own, the task id, the flag and the code',
      ev1.length === 1 && JSON.stringify(Object.keys(ev1[0]).sort()) === JSON.stringify(['errorCode', 'hostname', 'level', 'module', 'msg', 'pid', 'securityEvent', 'taskId', 'time'])
      && !JSON.stringify(ev1[0]).includes('obs-otelcol') && !JSON.stringify(ev1[0]).includes('PLANTED'), JSON.stringify(ev1[0]));
    check('R1 no snapshot was taken (the leg declares nothing)', eventsFor(r1, 'CONFIG_SOURCES_SNAPSHOT_TAKEN').length === 0);

    // ── R2: the same leg shape with nothing planted — the statement runs, there is nothing to say ──
    const r2 = await mk(OBS_TITLE('R2'), NO_BLOCK, { keepMe: 2 });
    await prepareTaskForExecution(r2, { configSourceAwaiting: NONE });
    const m2 = await meta(r2);
    check('R2 no planted key: the stamp is written, the row carries no snapshot, and NO security event is logged',
      m2.protocol === OBS && !(CONFIG_SOURCES_SNAPSHOT_KEY in m2) && m2.keepMe === 2 && eventsFor(r2, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0, JSON.stringify(m2));

    // ── R3: a row whose metadata is SQL NULL ──
    const r3 = await mk(OBS_TITLE('R3'), NO_BLOCK, undefined);
    await prisma.$executeRaw`UPDATE tasks SET metadata = NULL WHERE id = ${r3}`;
    await prepareTaskForExecution(r3, { configSourceAwaiting: NONE });
    const m3 = await meta(r3);
    check('R3 NULL metadata: the removal statement writes the stamp (COALESCE) and logs no event', m3.protocol === OBS && Object.keys(m3).sort().join() === 'protocol,protocolResolvedAt' && eventsFor(r3, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0, JSON.stringify(m3));

    // ── R4: a leg that DECLARES a block — the write arm; a planted snapshot is REPLACED by the platform's own ──
    const r4 = await mk(OBS_TITLE('R4'), BLOCK, { [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED });
    await prepareTaskForExecution(r4, { configSourceAwaiting: NONE });
    const m4 = await meta(r4);
    const snap4 = m4[CONFIG_SOURCES_SNAPSHOT_KEY] as Rec | undefined;
    check('R4 a declared block: the platform\'s snapshot is written (its takenAt is the stamp\'s time, not the planted one) and NO removal event is logged',
      !!snap4 && snap4.takenAt === m4.protocolResolvedAt && snap4.takenAt !== 'PLANTED' && (snap4.resolution as Rec)?.state === 'parsed'
      && eventsFor(r4, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0 && eventsFor(r4, 'CONFIG_SOURCES_SNAPSHOT_TAKEN').length === 1, JSON.stringify(m4).slice(0, 400));

    // ── R5: AS SHIPPED (no option): the row awaits its text, the decision is `none`, the arm is NOT reached ──
    const r5 = await mk(OBS_TITLE('R5'), NO_BLOCK, { [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED });
    await prepareTaskForExecution(r5);
    const m5 = await meta(r5);
    check('R5 as shipped (observability on the awaiting list): the stamp is written, the planted key is UNTOUCHED and no event is logged — what a deploy of this slice does',
      CONFIG_SOURCE_AWAITING_TEXT.includes(OBS) ? (m5.protocol === OBS && canon(m5[CONFIG_SOURCES_SNAPSHOT_KEY]) === canon(PLANTED) && eventsFor(r5, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0)
        // after the join this case IS the arm (the default list no longer holds the row): the key is removed and the event logged
        : (m5.protocol === OBS && !(CONFIG_SOURCES_SNAPSHOT_KEY in m5) && eventsFor(r5, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 1), JSON.stringify(m5).slice(0, 300));

    // ── R6: the arm runs at the FIRST stamp only — a snapshot planted on an already-stamped leg is not this arm's ──
    const r6 = await mk(OBS_TITLE('R6'), NO_BLOCK, {});
    await prepareTaskForExecution(r6, { configSourceAwaiting: NONE });
    await prisma.$executeRaw`UPDATE tasks SET metadata = metadata || ${JSON.stringify({ [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED })}::jsonb WHERE id = ${r6}`;
    const before6 = (await meta(r6)).protocolResolvedAt;
    await prepareTaskForExecution(r6, { configSourceAwaiting: NONE });
    const m6 = await meta(r6);
    check('R6 a second prepare of a stamped leg writes nothing: the stamp time is unchanged, a later-planted key stays (the governing read names it — A9 / snapshot-changed), no event',
      m6.protocolResolvedAt === before6 && CONFIG_SOURCES_SNAPSHOT_KEY in m6 && eventsFor(r6, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0, JSON.stringify(m6).slice(0, 300));

    // ── R7: a `forced` protocol (Kubernetes — LIVE today) never takes the removal arm: an absent block is SNAPSHOTTED ──
    const r7 = await mk(`${tag} R7 (protocol: kubernetes-gitops)`, NO_BLOCK, { [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED });
    await prepareTaskForExecution(r7);
    const m7 = await meta(r7);
    const snap7 = m7[CONFIG_SOURCES_SNAPSHOT_KEY] as Rec | undefined;
    check('R7 a forced protocol, as shipped: the planted snapshot is overwritten by the platform\'s `absent` snapshot — no removal, no removal event',
      m7.protocol === K8S && !!snap7 && (snap7.resolution as Rec)?.state === 'absent' && snap7.takenAt === m7.protocolResolvedAt && eventsFor(r7, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0, JSON.stringify(m7).slice(0, 300));

    // ── R8: a task that is not a PIPELINE leg is never this arm's (the decision is `none`) ──
    const r8t = await prisma.task.create({ data: { title: OBS_TITLE('R8'), description: NO_BLOCK, type: 'ACTION', status: 'OPEN', pov: { connect: { id: povId } }, phase: { connect: { id: phase.id } },
      stage: { connect: { id: stage.id } }, metadata: { [CONFIG_SOURCES_SNAPSHOT_KEY]: PLANTED } } as never, select: { id: true } });
    cleanup.tasks.push(r8t.id);
    await prepareTaskForExecution(r8t.id, { configSourceAwaiting: NONE });
    const m8 = await meta(r8t.id);
    check('R8 an ACTION task: stamped, the key untouched, no event (the arm is a PIPELINE leg\'s)', m8.protocol === OBS && CONFIG_SOURCES_SNAPSHOT_KEY in m8 && eventsFor(r8t.id, 'CONFIG_SOURCES_SNAPSHOT_REMOVED').length === 0, JSON.stringify(m8).slice(0, 200));

    // ── static: the option has ONE reader and NO production caller passes it ──
    const ROOT = path.join(__dirname, '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const users = [...walk('lib'), ...walk('app')].filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('configSourceAwaiting')).sort();
    check('S1 `configSourceAwaiting` is named in ONE file under lib/ and app/ — the prepare step itself; no production caller passes it',
      JSON.stringify(users) === JSON.stringify(['lib/agents/harness/prepare-task-for-execution.ts']), JSON.stringify(users));
    const prep = fs.readFileSync(path.join(ROOT, 'lib/agents/harness/prepare-task-for-execution.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    check('S2 the option reaches the ONE decision call and nothing else', (prep.match(/configSourceAwaiting/g) ?? []).length === 2 && /takenAt: resolvedAt \},\s*opts\.configSourceAwaiting\);/.test(prep));
    const create = fs.readFileSync(path.join(ROOT, 'lib/services/agent-execution-create.ts'), 'utf8');
    check('S3 the one production caller passes an explicit pick of two options', /prepareTaskForExecutionWithRecord\(args\.taskId, \{\s*status: args\.status,\s*skipChaining: args\.skipChaining,\s*\}\)/.test(create));
  } finally {
    stream.write = origWrite;
    await prisma.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: cleanup.tasks } }, { dependsOnId: { in: cleanup.tasks } }] } }).catch(() => undefined);
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: cleanup.tasks } } }).catch(() => undefined);
    await prisma.task.deleteMany({ where: { id: { in: cleanup.tasks } } }).catch(() => undefined);
    await prisma.stage.deleteMany({ where: { id: { in: cleanup.stages } } }).catch(() => undefined);
  }
  console.log(`\nconfig snapshot removal (behavioural): ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { stream.write = origWrite; console.error('script error:', e); await prisma.$disconnect(); process.exit(1); });
