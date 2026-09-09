/**
 * H-1 (2026-09-09): the self-provision TEARDOWN must be an instruction on BOTH branches of SYNTHESIZE.
 * The 2026-07-08 fix landed only inside the escalate branch (and a trailing domain sentence anchored on
 * "ESCALATE"), so on devext two APPROVED legs left their registrations ACTIVE while the escalated leg tore
 * down. This pins: base Step 5 carries teardown BEFORE task.complete and a **Teardown:** comment slot; each
 * self-provisioning domain protocol carries the ordered override above its status bullets, byte-identical;
 * and no teardown sentence anywhere is anchored only on the escalate case.
 */
import * as fs from 'fs';
const SEED = fs.readFileSync('scripts/seed-protocol-prompts.ts', 'utf8');
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; };
// 1. base Step 5
const s5 = SEED.indexOf('### Step 5: Complete Yourself'); const s5end = SEED.indexOf('**Composing the Final deliverable pointer', s5);
const step5 = SEED.slice(s5, s5end);
check('base Step 5 exists', s5 > 0 && s5end > s5);
check('base Step 5.0 domain cleanup on EVERY outcome is present', /Step 5\.0 — Domain cleanup, on EVERY outcome/.test(step5));
check('teardown delete appears BEFORE the first task.complete in Step 5', step5.indexOf("registry(action:'delete'") > 0 && step5.indexOf("registry(action:'delete'") < step5.indexOf('task.complete'));
check('final-comment template carries the **Teardown:** slot', /\*\*Teardown:\*\* <service name> deleted \| delete failed/.test(step5));
check('escalation comment carries the **Teardown:** line too', /escalation comment carries the same \\`\*\*Teardown:\*\*\\` line/.test(SEED));
// 2. domain overrides
const heads = [...SEED.matchAll(/## SYNTHESIZE — aggregate into the final change package/g)].map(m => m.index as number);
check('three self-provisioning domain SYNTHESIZE sections', heads.length === 3);
const bodies: string[] = [];
for (const h of heads) {
  const sec = SEED.slice(h, SEED.indexOf('\n`;', h)); // the REAL terminator is at line start — the clause itself contains \`task.complete\`;
  const o = sec.indexOf('**Order at SYNTHESIZE (overrides base Step 5):**');
  const approvedBullet = sec.indexOf('- **\\`approved\\`**');
  check(`section @${h}: ordered override present, ABOVE the approved bullet`, o > 0 && approvedBullet > o);
  check(`section @${h}: override names delete on EVERY outcome`, /registry\(action:'delete'[^\n]*on EVERY outcome \(approved, needs-revision, escalated\)/.test(sec));
  bodies.push(sec.slice(o, sec.indexOf('\n\n', o)));
}
check('the three override clauses are byte-identical', bodies.length === 3 && bodies.every(b => b === bodies[0]));
// 3. negative pin: every teardown sentence also names the approved case
const bad = SEED.split('\n').filter(l => /teardown/i.test(l) && /escalat/i.test(l) && !/approv/i.test(l));
check(`no teardown sentence is anchored only on the escalate case (${bad.length} offenders)`, bad.length === 0);
if (bad.length) bad.forEach(l => console.log('   offender:', l.slice(0, 160)));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\n✅ teardown is an instruction on both branches');
