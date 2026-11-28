/**
 * POV metadata MERGE — battery pins (no database). Register: POV-UPDATE-METADATA-REPLACES-WHOLE (2026-11-28).
 *
 * MCP pov.update and the web PUT used to write `metadata` WHOLE: `{ isDemo: false }` dropped every other
 * key and the result said "1 field changed". Both now merge through lib/pov/metadata-merge.ts:
 *   set the sent keys · a key sent as null is removed · unsent keys are kept · the result names them.
 *
 *   P*  pure plan / apply / report / result-line (the JS reference of the SQL merge)
 *   S*  the pov.update schema keeps a NESTED null (the remove signal) and skips a top-level null
 *   W*  wiring: no whole-object metadata write left on either surface; the merge runs in SQL inside a tx;
 *       the phase-templates route sets only its key, atomically. The perform tool text is UNCHANGED on purpose (owner 2026-11-28):
 *       pipeline agents read that description from tools/list, so a line there is agent-read text; the result line carries the fact
 *
 * The SQL itself is proven against the dev database by scripts/test-pov-metadata-merge-behavioral.ts
 * (npm run test:pov-metadata-merge-behavioral — out of the battery, it needs a database).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  planPovMetadataPatch,
  applyPovMetadataPlan,
  reportPovMetadataMerge,
  describePovMetadataReport,
  isEmptyPovMetadataPlan,
} from '../lib/pov/metadata-merge';
import { MCPParameterSchemas } from '../lib/validation/mcp-action-validation';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${e instanceof Error ? e.message : String(e)}`); failed++; }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('🔒 POV metadata merge (pure + schema + wiring)\n');

// The 2026-11-12 shape: the seven keys that were lost, plus the access flag.
const STORED = {
  actionId: 'act_1', customer: 'Acme', teamSize: '5', createdBy: 'u1', createdVia: 'mcp',
  successCriteria: 'x', technicalRequirements: 'y', isDemo: true,
};

// ── P: pure ──
test('P1 plan: values set, null removes, undefined ignored', () => {
  const p = planPovMetadataPatch({ a: 1, b: null, c: undefined, d: false, e: 0, f: '' });
  assert(eq(p.set, { a: 1, d: false, e: 0, f: '' }), `set ${JSON.stringify(p.set)}`);
  assert(eq(p.remove, ['b']), `remove ${JSON.stringify(p.remove)}`);
});

test('P2 the incident: { isDemo: false } keeps all seven other keys', () => {
  const after = applyPovMetadataPlan(STORED, planPovMetadataPatch({ isDemo: false }));
  for (const k of ['actionId', 'customer', 'teamSize', 'createdBy', 'createdVia', 'successCriteria', 'technicalRequirements']) {
    assert((after as any)[k] === (STORED as any)[k], `${k} lost`);
  }
  assert(after.isDemo === false, 'isDemo not set to false');
});

test('P3 isDemo: null removes the flag (and a later reader sees it absent, not true)', () => {
  const after = applyPovMetadataPlan(STORED, planPovMetadataPatch({ isDemo: null }));
  assert(!('isDemo' in after), 'isDemo still present');
  assert(Object.keys(after).length === 7, 'other keys touched');
});

test('P4 shallow: a nested object value replaces that key (documented, not deep-merged)', () => {
  const after = applyPovMetadataPlan({ cfg: { a: 1, b: 2 }, k: 1 }, planPovMetadataPatch({ cfg: { a: 9 } }));
  assert(eq(after, { cfg: { a: 9 }, k: 1 }), JSON.stringify(after));
});

test('P5 null / non-object stored metadata is treated as {}', () => {
  assert(eq(applyPovMetadataPlan(null, planPovMetadataPatch({ a: 1 })), { a: 1 }), 'null');
  assert(eq(applyPovMetadataPlan([1, 2], planPovMetadataPatch({ a: 1 })), { a: 1 }), 'array');
});

test('P6 report names changed / same value / removed / not present / kept count', () => {
  const plan = planPovMetadataPatch({ isDemo: false, customer: 'Acme', newKey: 1, teamSize: null, ghost: null });
  const after = applyPovMetadataPlan(STORED, plan);
  const r = reportPovMetadataMerge(STORED, after, plan);
  assert(eq(r.keysChanged, ['isDemo', 'newKey']), `changed ${JSON.stringify(r.keysChanged)}`);
  assert(eq(r.keysUnchanged, ['customer']), `unchanged ${JSON.stringify(r.keysUnchanged)}`);
  assert(eq(r.keysRemoved, ['teamSize']), `removed ${JSON.stringify(r.keysRemoved)}`);
  assert(eq(r.keysAlreadyAbsent, ['ghost']), `absent ${JSON.stringify(r.keysAlreadyAbsent)}`);
  assert(r.keysKeptCount === 5, `kept ${r.keysKeptCount}`); // actionId createdBy createdVia successCriteria technicalRequirements
});

test('P7 result line is a fact list naming the keys', () => {
  const plan = planPovMetadataPatch({ isDemo: false, teamSize: null });
  const r = reportPovMetadataMerge(STORED, applyPovMetadataPlan(STORED, plan), plan);
  const line = describePovMetadataReport(r);
  assert(line === 'metadata: changed isDemo; removed teamSize; 6 other keys kept', line);
  const one = describePovMetadataReport({ keysChanged: ['a'], keysUnchanged: [], keysRemoved: [], keysAlreadyAbsent: [], keysKeptCount: 1 });
  assert(one === 'metadata: changed a; 1 other key kept', one);
});

test('P8 empty patch is an empty plan (writes nothing)', () => {
  assert(isEmptyPovMetadataPlan(planPovMetadataPatch({})), 'empty');
  assert(!isEmptyPovMetadataPlan(planPovMetadataPatch({ a: null })), 'null-only is not empty');
});

// ── S: schema ──
const POV_ID = 'c'.padEnd(25, '1');
test('S1 pov.update keeps a nested null (the remove signal) and isDemo:false', () => {
  const r = MCPParameterSchemas['pov.update'].safeParse({ povId: POV_ID, metadata: { isDemo: false, teamSize: null } });
  assert(r.success, `parse failed: ${!r.success && JSON.stringify(r.error.errors)}`);
  const m = (r as any).data.metadata;
  assert(m.isDemo === false && 'teamSize' in m && m.teamSize === null, JSON.stringify(m));
});

test('S2 pov.update top-level metadata:null is skipped (no write)', () => {
  const r = MCPParameterSchemas['pov.update'].safeParse({ povId: POV_ID, title: 't', metadata: null });
  assert(r.success && (r as any).data.metadata === undefined, 'top-level null not skipped');
});

// ── W: wiring ──
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const handler = strip(read('lib/mcp/tasks/action/handlers/pov/pov-update-handler.ts'));
const put = strip(read('lib/pov/handlers/put.ts'));

test('W1 MCP handler: no whole-object metadata write; merges inside the $transaction', () => {
  assert(!/updateData\.metadata\s*=/.test(handler), 'updateData.metadata = … still present');
  const tx = handler.indexOf('prisma.$transaction(');
  const merge = handler.indexOf('mergePovMetadata(tx,');
  assert(tx > 0 && merge > tx, 'mergePovMetadata(tx, …) not inside the transaction');
  assert(/summary:[\s\S]*metadata: metadataReport/.test(handler), 'result summary does not carry the metadata report');
  assert(/describePovMetadataReport\(metadataReport\)/.test(handler), 'result line does not name the keys');
});

test('W2 web PUT: metadata leaves the whole-row write; merged by the shared helper', () => {
  assert(/delete cleanPovData\.metadata;/.test(put), 'cleanPovData.metadata not removed before povService.update');
  assert(/mergePovMetadata\(tx, povId, plan\)/.test(put), 'put.ts does not call mergePovMetadata');
  assert(put.indexOf('mergePovMetadata(') < put.indexOf('povService.update(povId, cleanPovData)'), 'merge must run before povService.update (lock + fresh re-read)');
  assert(put.indexOf('sanitizePovMetadata(') < put.indexOf('planPovMetadataPatch('), 'MA-1 reserved-key sanitizer must run on the patch first');
});

test('W3 merge SQL is server-side (no JS read-modify-write of the stored object)', () => {
  const src = read('lib/pov/metadata-merge.ts');
  assert(/FOR UPDATE/.test(src), 'no row lock for the report read');
  assert(/- \$\{plan\.remove\}::text\[\]/.test(src) && /\|\| \$\{JSON\.stringify\(plan\.set\)\}::jsonb/.test(src), 'SQL merge shape changed');
  assert(!/from '@\/lib\/prisma'/.test(src), 'helper must take the tx client, not import the base client');
});

test('W4 the perform tool text is unchanged by this fix (agents read it via tools/list; owner 2026-11-28 option a)', () => {
  const ts = read('lib/mcp/server/config/tool-schemas.js');
  assert(!/metadata is MERGED, not replaced/.test(ts), 'the agent-read perform description gained the merge lines; keep the fact in the result line instead');
});

test('W5 phase-templates route sets only its key, atomically', () => {
  const src = strip(read('app/api/pov/[povId]/phase-templates/route.ts'));
  assert(!/data:\s*\{\s*metadata\s*\}/.test(src), 'whole-object metadata write still present');
  assert(/jsonb_build_object\('phaseTemplates'/.test(src), 'atomic single-key write missing');
});

test('W6 no other whole-object POV metadata write in lib/ or app/', () => {
  // Every remaining `metadata` in a pOV.update/updateMany data block would be the same defect.
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); continue; }
      if (!/\.(ts|tsx|js)$/.test(e.name)) continue;
      const s = strip(fs.readFileSync(path.join(root, rel), 'utf8'));
      const re = /\.pOV\.(update|updateMany|upsert)\(\{[\s\S]{0,400}?\}\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) if (/\bmetadata\b/.test(m[0])) hits.push(rel);
    }
  };
  walk('lib'); walk('app');
  assert(hits.length === 0, `whole-object metadata writes: ${hits.join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
