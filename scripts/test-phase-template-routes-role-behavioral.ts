/**
 * PHASE-TEMPLATE-ROUTES-NO-ROLE-CHECK (register; owner decision 2026-11-22) — `POST /api/phase-templates` and
 * `POST /api/phase-templates/import` checked only that a user was signed in, while the `[id]` routes required ADMIN / SUPER_ADMIN.
 * A phase template has no owner column, is listed to every user, and the caller chooses `isDefault`; the import route also
 * UPDATES an existing template (`overwrite`). Both now carry the `[id]` routes' check and 403 body.
 *
 * This suite drives the REAL exported route handlers with REAL signed tokens against the dev database:
 *   R1  POST /api/phase-templates          USER, DEMO_USER ⇒ 403 + no row; ADMIN, SUPER_ADMIN ⇒ 200 + the row; no token ⇒ 401
 *   R2  POST /api/phase-templates/import   USER, DEMO_USER ⇒ 403 + no row, no overwrite, validateOnly too; ADMIN, SUPER_ADMIN as before
 *   R3  the `[id]` PUT / DELETE            unchanged (USER 403, ADMIN 200)
 *   R4  the read routes                    still open to a USER (list, [id], export, validate)
 *   R5  a POV created FROM a template by a USER (the wizard's POST /api/pov) still gets its POV, phase and tasks
 *
 * Requires the dev database + this install's signing key (.env). NOT in the battery (it writes rows and signs tokens); the
 * static twin that IS in the battery is `test:security-invariants` §TPL.
 * Run: npm run test:phase-template-routes-role-behavioral
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { GET as LIST, POST as CREATE } from '../app/api/phase-templates/route';
import { POST as IMPORT } from '../app/api/phase-templates/import/route';
import { GET as EXPORT } from '../app/api/phase-templates/export/route';
import { POST as VALIDATE } from '../app/api/phase-templates/validate/route';
import { GET as GET_ONE, PUT as PUT_ONE, DELETE as DELETE_ONE } from '../app/api/phase-templates/[id]/route';
import { POST as CREATE_POV } from '../app/api/pov/route';
import { signAccessToken } from '../lib/auth/token-manager';
import { config } from '../lib/config';

const prisma = new PrismaClient();
let pass = 0; let fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? '✅' : '❌'} ${n}${!ok && d ? `\n   ${d}` : ''}`); if (ok) pass++; else fail++; };
type Rec = Record<string, unknown>;
type Handler = (r: NextRequest, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const FORBIDDEN = JSON.stringify({ error: 'Forbidden: admin role required' });

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } });
  const plain = await prisma.user.findFirst({ where: { role: 'USER' }, select: { id: true, email: true, name: true } });
  if (!admin || !plain) throw new Error('the dev database needs one ADMIN and one USER');
  const tag = `tpl-role-${Date.now() % 1_000_000}`;
  // The role a route sees is the token's claim (lib/auth/get-auth-user.ts), so one real user per side carries each role.
  const tokenFor = (u: { id: string; email: string; name: string | null }, role: string) => signAccessToken({ userId: u.id, email: u.email, name: u.name ?? 'T', role } as never);
  const tokens: Record<string, string> = {
    USER: await tokenFor(plain, 'USER'), DEMO_USER: await tokenFor(plain, 'DEMO_USER'),
    ADMIN: await tokenFor(admin, 'ADMIN'), SUPER_ADMIN: await tokenFor(admin, 'SUPER_ADMIN'),
  };
  const call = async (h: unknown, method: string, url: string, role: string | null, body?: unknown, params?: Record<string, string>, asCookie = false): Promise<{ status: number; body: Rec; text: string }> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (role && !asCookie) headers.authorization = `Bearer ${tokens[role]}`;
    if (role && asCookie) headers.cookie = `${config.cookie.accessToken}=${tokens[role]}`;
    const req = new NextRequest(`http://localhost${url}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const res = await (h as Handler)(req, { params: Promise.resolve(params ?? {}) });
    const text = await res.text();
    let parsed: Rec = {}; try { parsed = JSON.parse(text) as Rec; } catch { /* not JSON */ }
    return { status: res.status, body: parsed, text };
  };
  const template = (name: string) => ({ name, description: 'role test', type: 'PLANNING', isDefault: true,
    stages: [{ name: 'Stage one', description: 'x', tasks: [{ title: `${name} task`, description: 'x', priority: 'MEDIUM', dependencies: [] }] }] });
  const named = (name: string) => prisma.phaseTemplate.findMany({ where: { name }, select: { id: true, description: true, isDefault: true } });
  /** The whole stored row, as text — for "byte-unchanged". */
  const stored = async (name: string) => JSON.stringify(await prisma.phaseTemplate.findMany({ where: { name } }));
  const cleanup = { povs: [] as string[], povTemplates: [] as string[] };

  try {
    // ── R1 POST /api/phase-templates ──
    for (const role of ['USER', 'DEMO_USER']) {
      const name = `${tag} create ${role}`;
      const r = await call(CREATE, 'POST', '/api/phase-templates', role, template(name));
      check(`R1 create as ${role}: 403 with the [id] routes' body`, r.status === 403 && JSON.stringify(r.body) === FORBIDDEN, `${r.status} ${r.text.slice(0, 160)}`);
      check(`R1 create as ${role}: no template row was written`, (await named(name)).length === 0);
    }
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      const name = `${tag} create ${role}`;
      const r = await call(CREATE, 'POST', '/api/phase-templates', role, template(name));
      const rows = await named(name);
      check(`R1 create as ${role}: 200 and the row exists, as before (isDefault as sent)`, r.status === 200 && rows.length === 1 && r.body.id === rows[0].id && rows[0].isDefault === true, `${r.status} ${r.text.slice(0, 160)}`);
    }
    {
      const r = await call(CREATE, 'POST', '/api/phase-templates', null, template(`${tag} anon`));
      check('R1 create with no token: 401, as before', r.status === 401 && (await named(`${tag} anon`)).length === 0, String(r.status));
      // the check runs before the body is read: a non-admin learns nothing from validation
      const bad = await call(CREATE, 'POST', '/api/phase-templates', 'USER', { name: '' });
      check('R1 create as USER with an invalid body: 403, not a validation answer', bad.status === 403, String(bad.status));
    }

    // ── R2 POST /api/phase-templates/import ──
    const victim = `${tag} create ADMIN`; // an existing template, to try to overwrite
    for (const role of ['USER', 'DEMO_USER']) {
      const name = `${tag} import ${role}`;
      const r = await call(IMPORT, 'POST', '/api/phase-templates/import', role, { templates: [template(name)], options: {} });
      check(`R2 import as ${role}: 403 with the [id] routes' body`, r.status === 403 && JSON.stringify(r.body) === FORBIDDEN, `${r.status} ${r.text.slice(0, 160)}`);
      check(`R2 import as ${role}: no template row was written`, (await named(name)).length === 0);
      // THE WORSE HALF of the finding: with `overwrite` this route UPDATES an existing template, by name or by id.
      const rowBefore = await stored(victim);
      const o = await call(IMPORT, 'POST', '/api/phase-templates/import', role, { templates: [{ ...template(victim), description: 'OVERWRITTEN', isDefault: false }], options: { overwrite: true } });
      const victimId = (await named(victim))[0]?.id;
      const oid = await call(IMPORT, 'POST', '/api/phase-templates/import', role, { templates: [{ ...template(`${victim} renamed`), id: victimId, description: 'OVERWRITTEN BY ID' }], options: { overwrite: true } });
      const rowAfter = await stored(victim);
      check(`R2 import as ${role} with overwrite, by NAME and with an id in the body (the schema drops a top-level id, so the name is the only overwrite key): 403 and the stored template is byte-unchanged (updatedAt included)`, o.status === 403 && oid.status === 403 && rowBefore === rowAfter && JSON.parse(rowAfter).length === 1 && (await named(`${victim} renamed`)).length === 0, `${o.status} ${oid.status}\n   ${rowBefore}\n   ${rowAfter}`);
      const v = await call(IMPORT, 'POST', '/api/phase-templates/import', role, { templates: [template(name)], options: { validateOnly: true } });
      check(`R2 import as ${role} with validateOnly: 403 (the check is before the body)`, v.status === 403, String(v.status));
    }
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      const name = `${tag} import ${role}`;
      const r = await call(IMPORT, 'POST', '/api/phase-templates/import', role, { templates: [template(name)], options: {} });
      const results = (r.body.results ?? {}) as Rec;
      check(`R2 import as ${role}: 200, one valid, the row exists, as before`, r.status === 200 && r.body.success === true && results.valid === 1 && (await named(name)).length === 1, `${r.status} ${r.text.slice(0, 200)}`);
    }
    {
      const o = await call(IMPORT, 'POST', '/api/phase-templates/import', 'ADMIN', { templates: [{ ...template(victim), description: 'admin overwrite' }], options: { overwrite: true } });
      const after = await named(victim);
      check('R2 import as ADMIN with overwrite: the existing template IS updated, as before', o.status === 200 && after.length === 1 && after[0].description === 'admin overwrite', `${o.status} ${JSON.stringify(after)}`);
      const r = await call(IMPORT, 'POST', '/api/phase-templates/import', null, { templates: [template(`${tag} anon`)] });
      check('R2 import with no token: 401, as before', r.status === 401, String(r.status));
    }

    // ── R3 the [id] routes: unchanged ──
    const target = (await named(`${tag} create SUPER_ADMIN`))[0];
    {
      const put = await call(PUT_ONE, 'PUT', `/api/phase-templates/${target.id}`, 'USER', { ...template(`${tag} create SUPER_ADMIN`), description: 'USER EDIT' }, { id: target.id });
      const del = await call(DELETE_ONE, 'DELETE', `/api/phase-templates/${target.id}`, 'USER', undefined, { id: target.id });
      const still = await prisma.phaseTemplate.findUnique({ where: { id: target.id }, select: { description: true } });
      check('R3 [id] PUT and DELETE as USER: 403 and the row is untouched (unchanged by this commit)', put.status === 403 && del.status === 403 && JSON.stringify(put.body) === FORBIDDEN && still?.description === 'role test', `${put.status} ${del.status} ${still?.description}`);
      const aput = await call(PUT_ONE, 'PUT', `/api/phase-templates/${target.id}`, 'ADMIN', { ...template(`${tag} create SUPER_ADMIN`), description: 'admin edit' }, { id: target.id });
      check('R3 [id] PUT as ADMIN: 200 (unchanged)', aput.status === 200 && aput.body.description === 'admin edit', `${aput.status} ${aput.text.slice(0, 160)}`);
    }

    // ── R4 the read routes stay open to a signed-in USER ──
    {
      const list = await call(LIST, 'GET', '/api/phase-templates', 'USER');
      const one = await call(GET_ONE, 'GET', `/api/phase-templates/${target.id}`, 'USER', undefined, { id: target.id });
      const exp = await call(EXPORT, 'GET', `/api/phase-templates/export?ids=${target.id}`, 'USER');
      const val = await call(VALIDATE, 'POST', '/api/phase-templates/validate', 'USER', { data: {} });
      check('R4 list GET as USER: 200 and it lists the template', list.status === 200 && list.text.includes(target.id), String(list.status));
      check('R4 [id] GET as USER: 200', one.status === 200 && one.body.id === target.id, String(one.status));
      check('R4 export GET as USER: 200', exp.status === 200 && Array.isArray(exp.body.templates), String(exp.status));
      check('R4 validate POST as USER: 200 (it writes nothing)', val.status === 200 && typeof val.body.valid === 'boolean', `${val.status} ${val.text.slice(0, 120)}`);
    }

    // ── R5 a USER creates a POV from an existing template (components/poveditor/pov/TemplateWizard.tsx → POST /api/pov) ──
    {
      const country = await prisma.country.findFirst({ select: { id: true } });
      if (!country) throw new Error('the dev database has no Country row');
      const povTemplate = await prisma.pOVTemplate.create({ data: { name: `${tag} pov template`, description: 'role test', status: 'published',
        schema: { name: `${tag} pov template`, description: 'role test', version: '1.0.0', fields: {}, metadata: { phaseTemplates: [target.id] } } }, select: { id: true } });
      cleanup.povTemplates.push(povTemplate.id);
      // The route fetches each phase template over HTTP with the caller's cookies (app/api/pov/route.ts ~:480-492). Route that
      // one fetch to the REAL exported [id] GET handler, carrying the same cookie — no dev server needed, no handler replaced.
      const realFetch = global.fetch; let fetched = 0; let fetchStatus = 0;
      (global as unknown as { fetch: unknown }).fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
        const u = new URL(String(input));
        const m = /^\/api\/phase-templates\/([^/]+)$/.exec(u.pathname);
        if (!m) return realFetch(input as never, init as never);
        fetched++;
        const res = await (GET_ONE as unknown as Handler)(new NextRequest(`http://localhost${u.pathname}`, { method: 'GET', headers: { cookie: init?.headers?.Cookie ?? '' } }), { params: Promise.resolve({ id: m[1] }) });
        fetchStatus = res.status;
        return res;
      }) as unknown;
      let r: { status: number; body: Rec; text: string };
      try {
        r = await call(CREATE_POV, 'POST', '/api/pov', 'USER', { templateId: povTemplate.id, phaseTemplateIds: [target.id],
          formData: { title: `${tag} pov`, description: 'created from a template by a USER', status: 'PROJECTED', priority: 'MEDIUM',
            startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 86_400_000).toISOString(), countryId: country.id } }, undefined, true);
      } finally { (global as unknown as { fetch: unknown }).fetch = realFetch; }
      const povId = typeof r.body.id === 'string' ? r.body.id : '';
      if (povId) cleanup.povs.push(povId);
      check('R5 POV from a template as USER: the POV is created (2xx)', r.status >= 200 && r.status < 300 && !!povId, `${r.status} ${r.text.slice(0, 240)}`);
      check('R5 the route read the phase template through the [id] GET as that USER: 200', fetched === 1 && fetchStatus === 200, `${fetched} fetch(es), status ${fetchStatus}`);
      if (povId) {
        const pov = await prisma.pOV.findUnique({ where: { id: povId }, select: { ownerId: true, phases: { select: { templateId: true, stages: { select: { tasks: { select: { title: true } } } } } } } });
        const fromTemplate = pov?.phases.filter((p) => p.templateId === target.id) ?? [];
        const titles = fromTemplate.flatMap((p) => p.stages.flatMap((s) => s.tasks.map((t) => t.title)));
        check('R5 the POV is owned by the USER and carries the template\'s phase with its task', pov?.ownerId === plain.id && fromTemplate.length === 1 && titles.length === 1, `${pov?.ownerId} phases=${fromTemplate.length} tasks=${JSON.stringify(titles)}`);
      }
    }
  } finally {
    for (const povId of cleanup.povs) {
      const tasks = await prisma.task.findMany({ where: { povId }, select: { id: true } }).catch(() => []);
      await prisma.taskActivity.deleteMany({ where: { taskId: { in: tasks.map((t) => t.id) } } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { povId } }).catch(() => undefined);
      await prisma.stage.deleteMany({ where: { phase: { povId } } }).catch(() => undefined);
      await prisma.phase.deleteMany({ where: { povId } }).catch(() => undefined);
      await prisma.pOV.delete({ where: { id: povId } }).catch((e: unknown) => console.error(`cleanup: POV ${povId} not deleted:`, (e as Error).message?.slice(0, 200)));
    }
    await prisma.pOVTemplate.deleteMany({ where: { id: { in: cleanup.povTemplates } } }).catch(() => undefined);
    await prisma.phaseTemplate.deleteMany({ where: { name: { startsWith: tag } } }).catch(() => undefined);
  }
  console.log(`\nphase-template routes role check (behavioural): ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('script error:', e); await prisma.$disconnect(); process.exit(1); });
