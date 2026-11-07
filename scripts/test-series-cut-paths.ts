/**
 * SERIES-CUT-PATHS-GAP (2026-11-04): `scripts/check-series-cut-owed.sh` CUT_PATHS must cover every module the mechanical nets import
 * (a fact producer), the device-source and held-bytes modules, and the Git pin / call-policy modules (refusal text an agent reads).
 * A hand-kept list rots (CHECK-DESIGN §3): 13 of 22 net imports were missing when push 0 shipped. This derives the population from
 * the nets' own imports, so a new fact producer that is not covered reds here instead of shipping unflagged.
 *
 * Run: npx ts-node scripts/test-series-cut-paths.ts
 */
import * as fs from 'fs';
import * as path from 'path';
const root = path.join(__dirname, '..');
let passed = 0; let failed = 0;
function test(name: string, fn: () => void) { try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); } }
const sh = fs.readFileSync(path.join(root, 'scripts/check-series-cut-owed.sh'), 'utf8');
const m = /^CUT_PATHS='(.*)'$/m.exec(sh);
if (!m) throw new Error('CUT_PATHS not found');
// The shell uses `grep -E`; the pattern is ERE that JavaScript's RegExp reads identically for these constructs.
const CUT = new RegExp(m[1]);
const nets = fs.readFileSync(path.join(root, 'lib/agents/harness/mechanical-nets.ts'), 'utf8');
const imports = [...nets.matchAll(/from '(\.\/[a-z0-9/_-]+|@\/lib\/[a-z0-9/_-]+)'/g)].map((x) => x[1])
  .map((s) => (s.startsWith('./') ? `lib/agents/harness/${s.slice(2)}` : s.slice(2)) + '.ts')
  .filter((f) => fs.existsSync(path.join(root, f)));

test('every module mechanical-nets.ts imports is a cut-relevant path', () => {
  const missing = imports.filter((f) => !CUT.test(f));
  if (imports.length < 10) throw new Error(`import scan found only ${imports.length} modules — the scan broke, not the list`);
  if (missing.length) throw new Error(`not covered: ${missing.join(', ')}`);
});
test('the mechanical-nets registry itself, every held-bytes module and every *-enrichment module are covered', () => {
  const harness = fs.readdirSync(path.join(root, 'lib/agents/harness')).filter((f) => f.endsWith('-enrichment.ts')).map((f) => `lib/agents/harness/${f}`);
  const held = fs.readdirSync(path.join(root, 'lib/agents/harness/held-bytes')).filter((f) => f.endsWith('.ts')).map((f) => `lib/agents/harness/held-bytes/${f}`);
  const missing = ['lib/agents/harness/mechanical-nets.ts', ...harness, ...held].filter((f) => !CUT.test(f));
  if (missing.length) throw new Error(`not covered: ${missing.join(', ')}`);
});
test('agent-read refusal text (the Git pin, the call policy) and the device-source parser are covered', () => {
  const must = ['lib/mcp/server/config/git-file-source-pin.js', 'lib/mcp/server/config/service-call-policy.js', 'lib/agents/harness/device-sources.ts',
    'lib/agents/harness/device-source-facts.ts', 'lib/services/held-bytes-capture.ts', 'scripts/seed-protocol-prompts.ts'];
  const missing = must.filter((f) => !CUT.test(f));
  if (missing.length) throw new Error(`not covered: ${missing.join(', ')}`);
});
test('NEGATIVE CONTROL: an unrelated file is not a cut path (the pattern is not a match-everything)', () => {
  for (const f of ['lib/utils/graph.ts', 'components/Button.tsx', 'cline_docs/x.md', 'lib/agents/harness/held-bytes']) if (CUT.test(f)) throw new Error(`matched ${f}`);
});
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
