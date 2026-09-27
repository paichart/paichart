/** CROSS-PIPELINE DELIVERY (2026-09-16) — resolveOwningLeg on a stubbed $queryRaw: none / one / ambiguous,
 *  plus source pins on the two properties a stub cannot exercise (the JSON-null qualifier, no LIMIT 1). */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveOwningLeg } = require('../lib/agents/harness/program-protocol') as typeof import('../lib/agents/harness/program-protocol');
let failed = 0;
const check = (n: string, ok: boolean, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const db = (rows: unknown[]) => ({ $queryRaw: async () => rows }) as unknown as Parameters<typeof resolveOwningLeg>[0];
(async () => {
  check('none: no PIPELINE row owns the stage', (await resolveOwningLeg(db([]), 'st')).kind === 'none');
  const one = await resolveOwningLeg(db([{ id: 'leg1', chained: [{ taskId: 'u1' }] }]), 'st');
  check('one: legTaskId + the stored chainedFrom array', one.kind === 'one' && one.legTaskId === 'leg1' && one.chainedFrom.length === 1, JSON.stringify(one));
  const noChain = await resolveOwningLeg(db([{ id: 'leg1', chained: null }]), 'st');
  check('one: a leg with no chainedFrom yields an EMPTY array (contract-less / dep-free leg still resolves — A9)', noChain.kind === 'one' && noChain.chainedFrom.length === 0);
  const amb = await resolveOwningLeg(db([{ id: 'a', chained: [] }, { id: 'b', chained: [] }]), 'st');
  check('ambiguous: >1 candidate names both and injects nothing (A9)', amb.kind === 'ambiguous' && amb.candidates.join(',') === 'a,b');
  const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/program-protocol.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export async function resolveOwningLeg'), src.indexOf('\n}', src.indexOf('export async function resolveOwningLeg')));
  check("PIN: qualifier is SQL `metadata->>'protocol' IS NOT NULL` (a stamped protocol:null is excluded; Prisma not:null would over-match)", fn.includes("metadata->>'protocol' IS NOT NULL"));
  check('PIN: no ORDER BY / LIMIT — the resolver never silently picks which deliverable a child receives', !/LIMIT|ORDER BY/.test(fn));
  check('PIN: no interfaceContract conjunct — a contract-LESS leg resolves', !/interfaceContract/.test(fn));
  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\n✅ resolveOwningLeg: none / one / ambiguous'); process.exit(0);
})();
