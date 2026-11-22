/**
 * TASK-CREATE-AUDIT-KEYS-UNSTRIPPED (register; owner decision O28, 2026-11-22; join precondition 1) — the four task-create paths that
 * wrote caller- or template-supplied metadata as given now strip the platform-only keys (`AUDIT_STRIP_KEYS`) at the seam.
 *
 * This suite drives each of the four REAL create paths against the dev database and reads the created rows back:
 *   (a) the REST stage-task route          — the exported POST, a real ADMIN token, a real request body
 *   (b) PhaseService.createTask             — as lib/pov/handlers/put.ts calls it for a template's tasks
 *   (c) PhaseTemplateService.createPhaseFromTemplate — a stored PhaseTemplate row (the one path that can create a PIPELINE row)
 *   (d) TemplateStorageService.createPhaseFromTemplate — the same stored row through the storage service
 * For each: every one of the eight keys planted ⇒ none on the created row, every other key kept, ONE warn per key naming the
 * surface and the key (never a value); a clean create ⇒ exactly the metadata the path wrote before, and no warn.
 *
 * Requires the dev database + TEST_POV_ID + this install's signing key (.env). NOT in the battery (it writes rows).
 * Run: npm run test:task-create-audit-strip-behavioral
 */
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route';
import { PhaseService } from '../lib/pov/services/phase';
import { PhaseTemplateService } from '../lib/pov/services/phaseTemplate';
import { templateStorage } from '../lib/pov/phase-templates/storage';
import { AUDIT_STRIP_KEYS, AUDIT_KEY_STRIPPED_AT_CREATE, stripAuditFactsAtCreate } from '../lib/tasks/services/protected-task-metadata';
import { signAccessToken } from '../lib/auth/token-manager';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();
let pass = 0; let fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${!ok && d ? `\n   ${d}` : ''}`); if (ok) pass++; else fail++; };
type Rec = Record<string, unknown>;
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

const stream = (logger as unknown as Record<symbol, { write: (l: string) => unknown }>)[pino.symbols.streamSym];
const lines: Rec[] = [];
const origWrite = stream.write.bind(stream);
stream.write = (l: string) => { try { lines.push(JSON.parse(l) as Rec); } catch { /* not a JSON line */ } return true; };
const strips = (surface: string) => lines.filter((l) => l.errorCode === AUDIT_KEY_STRIPPED_AT_CREATE && l.surface === surface);

/** Every platform-only key, each with a value that would matter if it were kept. `SENTINEL` must never reach a row or a log line. */
const SENTINEL = 'PLANTED-VALUE-9f3';
const PLANTED: Rec = Object.fromEntries(AUDIT_STRIP_KEYS.map((k) => [k, k.endsWith('Snapshot') ? { version: 1, takenAt: SENTINEL, resolution: { state: 'parsed' } } : SENTINEL]));
const KEPT = { note: 'kept', nested: { a: 1 }, protocol: 'observability-config-protocol' };

async function main() {
  const povId = process.env.TEST_POV_ID;
  if (!povId) throw new Error('TEST_POV_ID is not set (.env)');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true, role: true } });
  if (!admin) throw new Error('the dev database has no ADMIN user');
  const basePhase = await prisma.phase.findFirst({ where: { povId }, select: { id: true } });
  if (!basePhase) throw new Error('the test POV has no phase');
  const tag = `g-strip-${Date.now() % 1_000_000}`;
  const cleanup = { tasks: [] as string[], stages: [] as string[], phases: [] as string[], templates: [] as string[] };
  const metaOf = async (id: string): Promise<Rec> => (((await prisma.task.findUnique({ where: { id }, select: { metadata: true } }))?.metadata ?? {}) as Rec);
  /** The assertions every path shares. `expectedClean` = the metadata the path wrote BEFORE this change for the clean input. */
  const judge = (label: string, surface: string, planted: Rec, clean: Rec, expectedPlanted: Rec, expectedClean: Rec, before: number) => {
    check(`${label}: none of the ${AUDIT_STRIP_KEYS.length} platform-only keys is on the created row`, AUDIT_STRIP_KEYS.every((k) => !(k in planted)) && !JSON.stringify(planted).includes(SENTINEL), JSON.stringify(Object.keys(planted)));
    check(`${label}: every other key is kept exactly (a \`protocol\` key included — it is not one of the eight)`, canon(planted) === canon(expectedPlanted), `${canon(planted)} vs ${canon(expectedPlanted)}`);
    const w = strips(surface).slice(before);
    check(`${label}: ONE warn per removed key, naming the surface and the key`, w.length === AUDIT_STRIP_KEYS.length && canon(w.map((x) => x.key).sort()) === canon([...AUDIT_STRIP_KEYS].sort()) && w.every((x) => x.level === 40), `${w.length} warns: ${JSON.stringify(w.map((x) => x.key))}`);
    check(`${label}: no warn carries a value`, !JSON.stringify(w).includes(SENTINEL) && !JSON.stringify(w).includes('takenAt'), JSON.stringify(w[0]));
    check(`${label}: a clean create writes exactly the metadata it wrote before — and logs nothing`, canon(clean) === canon(expectedClean), `${canon(clean)} vs ${canon(expectedClean)}`);
  };

  try {
    const stage = await prisma.stage.create({ data: { phaseId: basePhase.id, name: `${tag} stage`, order: 9995, status: 'PENDING' }, select: { id: true } });
    cleanup.stages.push(stage.id);

    // ── (a) the REST stage-task route ──
    {
      const token = await signAccessToken({ userId: admin.id, email: admin.email, name: admin.name ?? 'G', role: admin.role } as never);
      const post = async (metadata: Rec | undefined): Promise<{ status: number; body: Rec }> => {
        const req = new NextRequest(`http://localhost/api/pov/${povId}/phase/${basePhase.id}/stage/${stage.id}/task`, { method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ title: `${tag} rest`, description: 'x', ...(metadata ? { metadata } : {}) }) });
        const res = await (POST as unknown as (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>)(req, { params: Promise.resolve({ povId, phaseId: basePhase.id, stageId: stage.id }) });
        return { status: res.status, body: (await res.json().catch(() => ({}))) as Rec };
      };
      // This route's schema ALREADY refuses a `protocol` key at create (PROTOCOL_STAMP_IMMUTABLE, 400) — the one surface of the four
      // that does. Pinned here as the control it is; the strip cases below therefore carry no `protocol` key.
      const stamp = await post({ ...KEPT });
      check('(a) REST route: a `protocol` key in the body is REFUSED by the route\'s own schema (400, PROTOCOL_STAMP_IMMUTABLE) — before and after this change',
        stamp.status === 400 && JSON.stringify(stamp.body).includes('PROTOCOL_STAMP_IMMUTABLE'), `${stamp.status} ${JSON.stringify(stamp.body).slice(0, 200)}`);
      const REST_KEPT = { note: KEPT.note, nested: KEPT.nested };
      const n0 = strips('rest-stage-task-create').length;
      const p = await post({ ...REST_KEPT, ...PLANTED });
      const before = strips('rest-stage-task-create').length;
      const c = await post({ ...REST_KEPT });
      const none = await post(undefined);
      const ids = [p, c, none].map((r) => String((r.body as Rec).id ?? ((r.body as Rec).task as Rec | undefined)?.id ?? ''));
      cleanup.tasks.push(...ids.filter(Boolean));
      check('(a) REST route: the three creates succeed (a planted key is no error to the caller)', [p, c, none].every((r) => r.status >= 200 && r.status < 300) && ids.every(Boolean), JSON.stringify([p.status, c.status, none.status, p.body]).slice(0, 300));
      if (ids.every(Boolean)) {
        judge('(a) REST route', 'rest-stage-task-create', await metaOf(ids[0]), await metaOf(ids[1]), REST_KEPT, REST_KEPT, n0);
        check('(a) REST route: the clean creates logged no strip', strips('rest-stage-task-create').length === before, `${strips('rest-stage-task-create').length - before}`);
        check('(a) REST route: a create with NO metadata writes {} as before', canon(await metaOf(ids[2])) === '{}');
        const row = await prisma.task.findUnique({ where: { id: ids[0] }, select: { type: true } });
        check('(a) REST route: the row is never a PIPELINE row (the route passes no type)', row?.type !== 'PIPELINE', String(row?.type));
      }
    }

    // ── (b) PhaseService.createTask ──
    {
      const svc = new PhaseService();
      const n0 = strips('phase-service-create-task').length;
      const p = await svc.createTask(stage.id, { title: `${tag} svc planted`, metadata: { ...KEPT, ...PLANTED } });
      const before = strips('phase-service-create-task').length;
      const c = await svc.createTask(stage.id, { title: `${tag} svc clean`, metadata: { ...KEPT } });
      const none = await svc.createTask(stage.id, { title: `${tag} svc none` });
      cleanup.tasks.push(p.id, c.id, none.id);
      judge('(b) PhaseService.createTask', 'phase-service-create-task', await metaOf(p.id), await metaOf(c.id), KEPT, KEPT, n0);
      check('(b) PhaseService.createTask: the clean creates logged no strip', strips('phase-service-create-task').length === before);
      const raw = await prisma.$queryRaw<Array<{ isnull: boolean }>>`SELECT metadata IS NULL AS isnull FROM tasks WHERE id = ${none.id}`;
      check('(b) PhaseService.createTask: a create with NO metadata leaves the column as before (no object invented)', canon(await metaOf(none.id)) === '{}' && typeof raw[0]?.isnull === 'boolean');
    }

    // ── (c) + (d): a stored template whose task is a PIPELINE row carrying every key ──
    const workflow = (meta: Rec) => ({ stages: [{ name: `${tag} tstage`, description: 'x', tasks: [{ title: `${tag} t (protocol: observability-config)`, description: 'x', type: 'PIPELINE', priority: 'MEDIUM', metadata: meta, dependencies: [] }] }] });
    const tPlanted = await prisma.phaseTemplate.create({ data: { name: `${tag} planted`, description: 'x', type: 'PLANNING', workflow: workflow({ ...KEPT, ...PLANTED }) as never }, select: { id: true } });
    const tClean = await prisma.phaseTemplate.create({ data: { name: `${tag} clean`, description: 'x', type: 'PLANNING', workflow: workflow({ ...KEPT }) as never }, select: { id: true } });
    cleanup.templates.push(tPlanted.id, tClean.id);
    const tasksOfPhase = async (phaseId: string) => prisma.task.findMany({ where: { phaseId }, select: { id: true, type: true, metadata: true } });
    {
      const svc = new PhaseTemplateService();
      const mk = async (templateId: string) => { const ph = await svc.createPhaseFromTemplate({ povId, templateId, name: `${tag} c`, description: 'x', startDate: new Date(), endDate: new Date() }) as { id: string }; cleanup.phases.push(ph.id); return ph.id; };
      const n0 = strips('phase-template-create').length;
      const pp = await tasksOfPhase(await mk(tPlanted.id));
      const before = strips('phase-template-create').length;
      const cc = await tasksOfPhase(await mk(tClean.id));
      check('(c) phase-template service: each template created its one task', pp.length === 1 && cc.length === 1, `${pp.length} / ${cc.length}`);
      if (pp.length === 1 && cc.length === 1) {
        judge('(c) phase-template service', 'phase-template-create', pp[0].metadata as Rec, cc[0].metadata as Rec, { ...KEPT, dependencies: [] }, { ...KEPT, dependencies: [] }, n0);
        check('(c) phase-template service: the clean create logged no strip', strips('phase-template-create').length === before);
        check('(c) phase-template service: this path DOES create a PIPELINE row from a template — and that row carries no planted snapshot', pp[0].type === 'PIPELINE' && !('configSourcesSnapshot' in (pp[0].metadata as Rec)), String(pp[0].type));
      }
    }
    {
      const mk = async (templateId: string) => { const ph = await templateStorage.createPhaseFromTemplate(templateId, povId, { name: `${tag} d`, description: 'x', startDate: new Date(), endDate: new Date(), order: 9994 }) as { id: string }; cleanup.phases.push(ph.id); return ph.id; };
      const n0 = strips('phase-template-storage-create').length;
      const pp = await tasksOfPhase(await mk(tPlanted.id));
      const before = strips('phase-template-storage-create').length;
      const cc = await tasksOfPhase(await mk(tClean.id));
      check('(d) template storage: each template created its one task', pp.length === 1 && cc.length === 1, `${pp.length} / ${cc.length}`);
      if (pp.length === 1 && cc.length === 1) {
        // this path adds `required`, `id`, `dependencies` from the template's task config (undefined ones are not stored)
        const expected = (m: Rec) => JSON.parse(JSON.stringify({ ...m, required: undefined, id: undefined, dependencies: [] })) as Rec;
        const strip = (m: Rec) => { const o = { ...m }; for (const k of ['required', 'id']) if (o[k] === undefined || o[k] === null) delete o[k]; return o; };
        judge('(d) template storage', 'phase-template-storage-create', strip(pp[0].metadata as Rec), strip(cc[0].metadata as Rec), expected(KEPT), expected(KEPT), n0);
        check('(d) template storage: the clean create logged no strip', strips('phase-template-storage-create').length === before);
        check('(d) template storage: the row is never a PIPELINE row (the path passes no type)', pp[0].type !== 'PIPELINE', String(pp[0].type));
      }
    }

    // ── the helper itself: a copy, never a mutation; a non-object is returned as given ──
    const input = { ...KEPT, ...PLANTED }; const snapshot = JSON.stringify(input);
    const out = stripAuditFactsAtCreate(input, 'unit');
    check('H1 the helper returns a COPY (the caller\'s object is untouched) with the keys in their order', JSON.stringify(input) === snapshot && JSON.stringify(out) === JSON.stringify(KEPT) && out !== input);
    check('H2 a value that is not a plain object is returned as given', stripAuditFactsAtCreate(null, 'unit') === null && stripAuditFactsAtCreate(undefined, 'unit') === undefined && JSON.stringify(stripAuditFactsAtCreate(['a'] as never, 'unit')) === '["a"]');
    const clean = { ...KEPT }; let warned = 0;
    check('H3 a clean object: an equal copy, no warn', JSON.stringify(stripAuditFactsAtCreate(clean, 'unit', () => { warned++; })) === JSON.stringify(clean) && warned === 0);
  } finally {
    stream.write = origWrite;
    const phaseTasks = cleanup.phases.length ? await prisma.task.findMany({ where: { phaseId: { in: cleanup.phases } }, select: { id: true } }).catch(() => []) : [];
    const taskIds = [...cleanup.tasks, ...phaseTasks.map((t) => t.id)];
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } }).catch(() => undefined);
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } }).catch(() => undefined);
    await prisma.stage.deleteMany({ where: { OR: [{ id: { in: cleanup.stages } }, { phaseId: { in: cleanup.phases } }] } }).catch(() => undefined);
    await prisma.phase.deleteMany({ where: { id: { in: cleanup.phases } } }).catch(() => undefined);
    await prisma.phaseTemplate.deleteMany({ where: { id: { in: cleanup.templates } } }).catch(() => undefined);
  }
  console.log(`\ntask-create audit strip (behavioural): ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { stream.write = origWrite; console.error('script error:', e); await prisma.$disconnect(); process.exit(1); });
