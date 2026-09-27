/**
 * test:assignee-resolver — the pure matching core behind task.assign / task.create name resolution
 * (N2-f1, 2026-09-25). No database: chooseAssignee takes the user list.
 *
 * Pins: an ambiguous name THROWS naming every candidate (never first-match); the POV's own people are
 * preferred over the rest of the user table; multi-word names require EVERY word (the old stage OR-ed
 * them, so "Josh Allen" matched anyone named Josh OR Allen).
 */
// lib/prisma throws at module load without DATABASE_URL (CI has none); the resolver module imports it.
// A stub URL is enough — nothing here connects. MUST precede the require below.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chooseAssignee } = require('../lib/mcp/tasks/action/utilities/assignee-resolver') as typeof import('../lib/mcp/tasks/action/utilities/assignee-resolver');

type U = { id: string; name: string | null; email: string };
const users: U[] = [
  { id: 'u-steve1', name: 'Steve Terry', email: 'steveterry66@example.com' },
  { id: 'u-steve2', name: 'Steve Terry', email: 'steve.terry@example.com' },
  { id: 'u-josh', name: 'Josh Allen', email: 'josh.allen@example.com' },
  { id: 'u-josh2', name: 'Josh Smith', email: 'jsmith@example.com' },
  { id: 'u-bob', name: 'Bob Allen', email: 'bob@example.com' },
  { id: 'u-jacob', name: 'Jacob Wilcox', email: 'jacob.wilcox@example.com' },
  { id: 'u-noname', name: null, email: 'svc@example.com' },
];

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function eq(a: unknown, b: unknown, m: string) { if (a !== b) throw new Error(`${m}: expected ${String(b)}, got ${String(a)}`); }
function throwsWith(fn: () => unknown, parts: string[], m: string) {
  try { fn(); } catch (e) {
    const msg = (e as Error).message;
    for (const p of parts) if (!msg.includes(p)) throw new Error(`${m}: error lacks "${p}" — got: ${msg}`);
    return;
  }
  throw new Error(`${m}: expected a throw, got a result`);
}

test('exact email resolves even when the name is shared', () =>
  eq(chooseAssignee('steve.terry@example.com', users).id, 'u-steve2', 'email'));
test('exact email is case-insensitive', () =>
  eq(chooseAssignee('Steve.Terry@Example.com', users).id, 'u-steve2', 'email case'));
test('a duplicated exact name is AMBIGUOUS and names both emails (never first-match)', () =>
  throwsWith(() => chooseAssignee('Steve Terry', users), ['ambiguous', 'steveterry66@example.com', 'steve.terry@example.com', 'Use the email'], 'dup name'));
test('a unique exact name resolves', () =>
  eq(chooseAssignee('jacob wilcox', users).id, 'u-jacob', 'exact name'));
test('a partial that matches one user resolves', () =>
  eq(chooseAssignee('Jacob', users).id, 'u-jacob', 'partial'));
test('a partial matching several users is AMBIGUOUS', () =>
  throwsWith(() => chooseAssignee('Josh', users), ['ambiguous', 'Josh Allen', 'Josh Smith'], 'partial dup'));
test("the POV's own people win: 'Josh' resolves to the team's Josh", () =>
  eq(chooseAssignee('Josh', users, new Set(['u-josh', 'u-jacob'])).id, 'u-josh', 'team preference'));
test('two matches inside the team are still AMBIGUOUS (scope narrows, never guesses)', () =>
  throwsWith(() => chooseAssignee('Josh', users, new Set(['u-josh', 'u-josh2'])), ['ambiguous', "this POV's owner and team"], 'team dup'));
test('no team match falls back to all users', () =>
  eq(chooseAssignee('Bob', users, new Set(['u-jacob'])).id, 'u-bob', 'fallback'));
test("multi-word names need EVERY word: 'Josh Allen' is not 'Josh Smith' or 'Bob Allen'", () =>
  eq(chooseAssignee('allen josh', users).id, 'u-josh', 'every word'));
test("a multi-word name no one carries in full is NOT FOUND (the old OR matched 'Josh ...' or '... Allen')", () =>
  throwsWith(() => chooseAssignee('Josh Wilcox', users), ['User not found'], 'no OR match'));
test('an unknown name is not found', () =>
  throwsWith(() => chooseAssignee('Zelda', users), ['User not found: "Zelda"'], 'not found'));
test('an empty query throws', () =>
  throwsWith(() => chooseAssignee('   ', users), ['empty'], 'empty'));
test('a user with no name is reachable by email', () =>
  eq(chooseAssignee('svc@example.com', users).id, 'u-noname', 'null name'));

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
