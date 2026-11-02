/**
 * test:task-title-lookup-scope — register X9 (2026-10-31): a task-by-TITLE lookup must be scoped to the
 * caller's POVs, because the "Multiple tasks found … Found in POVs: <title> (ID: <id>)" error names every
 * match. Unscoped, it disclosed other tenants' POV titles (customer names) and task ids to any
 * authenticated caller, incl. DEMO_USER; the later validatePOVAccess only protected the write.
 *
 * Pins both halves, no database:
 *   1. the helper: ADMIN/SUPER_ADMIN unchanged; USER and DEMO_USER wrapped in AND with the POV access rule,
 *      keeping any pov filter the caller set (povTitle);
 *   2. the wiring: every handler that builds a "Found in POVs" error passes its lookup through
 *      scopeTaskTitleLookup — a new title-lookup site that names matches without it turns this red.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
const { scopeTaskTitleLookup, scopeTeamLookup, scopeTaskIdLookup } = require('../lib/pov/auth/pov-access-filter') as typeof import('../lib/pov/auth/pov-access-filter');
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`);
}

const where = { title: { equals: 'Kickoff', mode: 'insensitive' as const } };

test('ADMIN: criteria unchanged', () => eq(scopeTaskTitleLookup(where, { userId: 'a', role: 'ADMIN' }), where, 'admin'));
test('SUPER_ADMIN: criteria unchanged', () => eq(scopeTaskTitleLookup(where, { userId: 'a', role: 'SUPER_ADMIN' }), where, 'super'));
test('USER: scoped to owned + team POVs', () => eq(scopeTaskTitleLookup(where, { userId: 'u1', role: 'USER' }), {
  AND: [where, { pov: { OR: [{ ownerId: 'u1' }, { team: { members: { some: { userId: 'u1' } } } }] } }],
}, 'user'));
test('DEMO_USER: scoped, plus demo POVs', () => {
  const r = scopeTaskTitleLookup(where, { userId: 'd1', role: 'DEMO_USER' }) as { AND: Array<{ pov?: { OR: unknown[] } }> };
  if (!r.AND || r.AND.length !== 2) throw new Error('not wrapped');
  const or = r.AND[1].pov?.OR ?? [];
  if (or.length !== 3) throw new Error(`expected 3 access arms, got ${or.length}`);
});
test('USER: an existing pov filter (povTitle) is kept, not overwritten', () => {
  const withPov = { ...where, pov: { title: { contains: 'Meridian', mode: 'insensitive' as const } } };
  const r = scopeTaskTitleLookup(withPov, { userId: 'u1', role: 'USER' }) as { AND: unknown[] };
  eq(r.AND[0], withPov, 'caller criteria');
});

test('fails closed: a missing userId throws (Prisma would drop ownerId: undefined and match every POV)', () => {
  for (const u of [{ userId: undefined as unknown as string, role: 'USER' }, { userId: '', role: 'USER' }, null as unknown as { userId: string; role: string }]) {
    let threw = false;
    try { scopeTaskTitleLookup(where, u); } catch { threw = true; }
    if (!threw) throw new Error(`did not throw for ${JSON.stringify(u)}`);
  }
});

// TEAM-LOOKUP-CROSS-TENANT (2026-10-31): team lookups scoped the same way.
const twhere = { name: { equals: 'Team A', mode: 'insensitive' as const } };
test('team: ADMIN unchanged', () => eq(scopeTeamLookup(twhere, { userId: 'a', role: 'ADMIN' }), twhere, 'team admin'));
test("team: USER limited to accessible POVs' teams OR teams they belong to", () => eq(scopeTeamLookup(twhere, { userId: 'u1', role: 'USER' }), {
  AND: [twhere, { OR: [
    { pov: { OR: [{ ownerId: 'u1' }, { team: { members: { some: { userId: 'u1' } } } }] } },
    { members: { some: { userId: 'u1' } } },
  ] }],
}, 'team user'));
test('team: fails closed on a missing userId', () => {
  let threw = false;
  try { scopeTeamLookup(twhere, { userId: '', role: 'USER' }); } catch { threw = true; }
  if (!threw) throw new Error('did not throw');
});
test('team wiring: every prisma.team lookup in task.assign is scoped, and task.create checks a supplied teamId', () => {
  const assign = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/handlers/task/task-assign-handler.ts'), 'utf8');
  const calls = assign.match(/prisma\.team\.find\w*\(\{\s*\n?\s*where:\s*([^\n]*)/g) || [];
  if (calls.length < 4) throw new Error(`expected >= 4 team lookups in task.assign, found ${calls.length}`);
  for (const c of calls) if (!c.includes('scopeTeamLookup(')) throw new Error(`unscoped team lookup: ${c.trim()}`);
  const create = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/handlers/task/task-create-handler.ts'), 'utf8');
  if (!/scopeTeamLookup\(\{ id: teamId \}, user\)/.test(create)) throw new Error('task.create does not check a supplied teamId');
});

// DEPENDENCY-IDS-UNSCOPED (2026-10-31): dependency ids scoped the same way.
const dwhere = { id: { in: ['t1', 't2'] } };
test('deps: ADMIN unchanged', () => eq(scopeTaskIdLookup(dwhere, { userId: 'a', role: 'ADMIN' }), dwhere, 'deps admin'));
test('deps: USER limited to accessible POVs', () => eq(scopeTaskIdLookup(dwhere, { userId: 'u1', role: 'USER' }), {
  AND: [dwhere, { pov: { OR: [{ ownerId: 'u1' }, { team: { members: { some: { userId: 'u1' } } } }] } }],
}, 'deps user'));
test('deps: fails closed on a missing userId', () => {
  let threw = false;
  try { scopeTaskIdLookup(dwhere, { userId: '', role: 'USER' }); } catch { threw = true; }
  if (!threw) throw new Error('did not throw');
});
test('deps wiring: task.create and task.update validate dependencyIds through scopeTaskIdLookup', () => {
  for (const h of ['task-create-handler.ts', 'task-update-handler.ts']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'lib/mcp/tasks/action/handlers/task', h), 'utf8');
    if (/where:\s*\{\s*id:\s*\{\s*in:\s*dependencyIds\s*\}\s*\}/.test(s)) throw new Error(`${h}: unscoped dependencyIds lookup`);
    if (!/where:\s*scopeTaskIdLookup\(\{ id: \{ in: dependencyIds \} \}, user\)/.test(s)) throw new Error(`${h}: no scoped dependencyIds lookup`);
  }
});

// Wiring: every handler file that emits "Found in POVs" must call scopeTaskTitleLookup.
const dir = path.join(__dirname, '..', 'lib', 'mcp', 'tasks', 'action', 'handlers');
const files: string[] = [];
(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(ts|js)$/.test(e.name)) files.push(p);
  }
})(dir);
const emitters = files.filter(f => fs.readFileSync(f, 'utf8').includes('Found in POVs'));
test(`wiring: at least the 3 known emitters exist (found ${emitters.length})`, () => {
  if (emitters.length < 3) throw new Error(`expected >= 3, got ${emitters.length}`);
});
for (const f of emitters) {
  test(`wiring: ${path.basename(f)} scopes its title lookup`, () => {
    const s = fs.readFileSync(f, 'utf8');
    if (!/where:\s*scopeTaskTitleLookup\(/.test(s)) throw new Error('names matching POVs without scopeTaskTitleLookup (X9)');
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
