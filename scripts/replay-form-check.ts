#!/usr/bin/env ts-node
/**
 * replay-form-check.ts — run the SHIPPING package form check over every production `config_change_author`
 * execution and reproduce the plan's partition. READ-ONLY (ssh + psql under default_transaction_read_only),
 * a few seconds. Imports the shipping detector; a reimplementation here would recreate the mistake it guards.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/replay-form-check.ts                 # assert the 2026-10-07 baseline
 *   npx ts-node -r tsconfig-paths/register scripts/replay-form-check.ts --until now     # current corpus, report only
 *   npx ts-node -r tsconfig-paths/register scripts/replay-form-check.ts --file rows.jsonl   # offline (eid, st, fr, …)
 *   … --dump out.jsonl     # also write the fetched rows (for the A.5 correction replay)
 *
 * BASELINE (plan §1 / §7a, corrected 2026-10-07): with the default cutoff the population is 312 and the trigger
 * fires on **15 / 9 / 5 / 1** (all time / since 09-15 / since 09-28 / since 10-05 = terraform-iac 1.12.1), partition
 * 10 hunk-only · 3 hunk+located · 2 located-only · 5 fact-only (unlocated marker / side overflow) · 292 clean, total asserted.
 *
 * ROLE PROOF (agent-execution review F5): rows are SELECTED on the task column, the core GATES on the resolved role
 * (config > template default > task). The replay compares `result.json.agentRole` (what the runtime resolved) with the
 * task column on every row and fails on any difference, so 15/9/5/1 describes what the runtime would have stamped.
 *
 * ⚠️ The PLAN said 16. Its corpus prototype checked the gap rule by index distance only, so `cmsb7rrm4005`
 * (network-provisioning, 2026-08-02, approved) "located" an elision through another block that elides the SAME
 * span — the content exists nowhere in the package. Under the rule the plan STATES ("≥1 non-marker line
 * between") it does not trigger; that is the shipped rule, and the case is pinned as negative control N10.
 * It also shows kill criterion 4 (no attempt on a non-terraform leg) is guarded by the gap rule.
 * Coordinator decision 2026-10-07: expectation 15/9/5/1; do NOT tune the rule toward 16.
 *
 * A mismatch against the baseline is a FINDING (exit 1): read the per-execution list, never adjust the number.
 */

import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { computeFormCheckFact, FORM_CHECK_TRIGGER_KINDS } from '../lib/agents/harness/package-form-check';

const BASELINE_UNTIL = '2026-10-06 23:59:59';
const EXPECT = { population: 312, all: 15, since0915: 9, since0928: 5, since1005: 1 };
const WINDOWS: Array<[keyof typeof EXPECT, string]> = [
  ['all', '2000-01-01'], ['since0915', '2026-09-15'], ['since0928', '2026-09-28'], ['since1005', '2026-10-05'],
];

export interface AuthorRow {
  eid: string; tid: string; st: string; proto: string | null; approved: boolean | null;
  stopReason: string | null; model: string | null; fr: string;
  /** F5 (agent-execution review): the RUNTIME-resolved role the core gated on (result.json), beside the task column. */
  resultRole: string | null; taskRole: string | null;
}

const SQL = (until: string) => `
SELECT row_to_json(t) FROM (
  SELECT e.id eid, c.id tid, to_char(e."startTime",'YYYY-MM-DD"T"HH24:MI:SS.MS') st,
         (SELECT p.metadata->>'protocol' FROM tasks p WHERE p.metadata->>'pipelineStageId' = c.stage_id LIMIT 1) proto,
         (SELECT (ra.content::jsonb)->'reviewerVerdict'->>'approved' FROM tasks rc
            JOIN agent_executions re ON re."taskId" = rc.id
            JOIN agent_artifacts ra ON ra."executionId" = re.id AND ra.name = 'result.json' AND ra.content LIKE '{%'
           WHERE rc.stage_id = c.stage_id AND rc."agentRole" = 'change_reviewer'
           ORDER BY re."startTime" DESC LIMIT 1)::boolean approved,
         (a.content::jsonb)->'toolLoop'->>'finalStopReason' "stopReason",
         e."modelUsed" model,
         (a.content::jsonb)->>'agentRole' "resultRole", c."agentRole" "taskRole",
         (a.content::jsonb)->>'finalResponse' fr
  FROM tasks c JOIN agent_executions e ON e."taskId" = c.id
  JOIN agent_artifacts a ON a."executionId" = e.id AND a.name = 'result.json' AND a.content LIKE '{%'
  WHERE c."agentRole" = 'config_change_author' AND e."startTime" < '${until}'
  ORDER BY e."startTime") t;`;

export function fetchAuthorRows(until: string): AuthorRow[] {
  const remote = 'cd /var/www/paichart-app/current && source .env.production && ' +
    'PGOPTIONS="-c default_transaction_read_only=on" psql "$DATABASE_URL" -At -P pager=off';
  const out = execFileSync('ssh', ['<PROD_USER>@<PROD_HOST>', remote], { input: SQL(until), maxBuffer: 512 * 1024 * 1024 }).toString();
  return out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
}

function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const untilArg = arg('--until');
  const until = !untilArg ? BASELINE_UNTIL : untilArg === 'now' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : untilArg;
  const assertBaseline = !untilArg && !arg('--file');
  const rows: AuthorRow[] = arg('--file')
    ? fs.readFileSync(arg('--file')!, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    : fetchAuthorRows(until);
  if (arg('--dump')) fs.writeFileSync(arg('--dump')!, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  console.log(`🧾 replay-form-check — ${rows.length} config_change_author executions (startTime < ${until})\n`);
  const results = rows.map((r) => {
    // The DETECTOR partition ignores stop reason (the plan measured the text); the stamp arm is counted separately.
    const fact = computeFormCheckFact({ text: r.fr || '', stopReason: 'end_turn' });
    const hm = fact.hits.some((h) => h.kind === 'hunk-count-mismatch');
    const lo = fact.hits.some((h) => h.kind === 'marker-line-located');
    const factOnly = fact.hits.length > 0 && !hm && !lo;
    const bucket = hm && lo ? 'hunk+located' : hm ? 'hunk-only' : lo ? 'located-only' : factOnly ? 'fact-only' : 'clean';
    const stampArm = r.stopReason && r.stopReason !== 'end_turn' ? 'not-end-turn' : (!r.fr || !r.fr.trim()) ? 'empty' : 'checked';
    return { r, fact, bucket, fired: hm || lo, stampArm };
  });

  let mismatch = false;
  const counts: Record<string, number> = {};
  for (const [name, since] of WINDOWS) {
    const w = results.filter((x) => x.r.st >= since);
    const b: Record<string, number> = { 'hunk-only': 0, 'hunk+located': 0, 'located-only': 0, 'fact-only': 0, clean: 0 };
    for (const x of w) b[x.bucket]++;
    const total = Object.values(b).reduce((s, n) => s + n, 0);
    if (total !== w.length) throw new Error(`partition total ${total} != ${w.length} — a row fell out of every bucket`);
    const fired = w.filter((x) => x.fired);
    counts[name] = fired.length;
    const appr = fired.filter((x) => x.r.approved === true).length;
    const ref = fired.filter((x) => x.r.approved === false).length;
    console.log(`${name.padEnd(10)} executions ${String(w.length).padStart(3)} · FIRED ${String(fired.length).padStart(2)} ` +
      `(approved ${appr}, refused ${ref}, no verdict ${fired.length - appr - ref}) · ` +
      Object.entries(b).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · total ${total} ✓`);
  }

  console.log('\nFired (all time):');
  for (const x of results.filter((y) => y.fired)) {
    const kinds = x.fact.hits.filter((h) => FORM_CHECK_TRIGGER_KINDS.includes(h.kind))
      .map((h) => `${h.kind}${h.header ? ' ' + h.header : ''}${h.extraBodyLines ? ` +${h.extraBodyLines}` : ''}${h.marker ? ` '${h.marker}'` : ''}`);
    console.log(`  ${x.r.st.slice(0, 10)} ${x.r.eid} ${(x.r.proto || '?').replace('-protocol', '').padEnd(22)} ` +
      `${x.r.approved === true ? 'approved' : x.r.approved === false ? 'REFUSED ' : 'no-verdict'} ${x.bucket.padEnd(13)} ${kinds.join(' | ')}`);
  }
  const factKinds: Record<string, number> = {};
  for (const x of results) for (const h of x.fact.hits) if (!FORM_CHECK_TRIGGER_KINDS.includes(h.kind)) factKinds[h.kind] = (factKinds[h.kind] ?? 0) + 1;
  console.log(`\nFact-only hits by kind (all time, capped hits): ${JSON.stringify(factKinds)}`);
  const roleDiff = results.filter((x) => x.r.resultRole !== x.r.taskRole);
  console.log(`Role proof (F5): result.json.agentRole === task.agentRole on ${results.length - roleDiff.length}/${results.length} rows` +
    (roleDiff.length ? ` — DIFFERS on ${roleDiff.map((x) => `${x.r.eid}(${x.r.resultRole})`).join(', ')}` : ''));
  if (roleDiff.length) mismatch = true;
  const arms: Record<string, number> = {};
  for (const x of results) arms[x.stampArm] = (arms[x.stampArm] ?? 0) + 1;
  const nonTf = results.filter((x) => x.fired && !(x.r.proto || '').startsWith('terraform'));
  console.log(`\nStamp arms (what Step A would persist): ${JSON.stringify(arms)}`);
  console.log(`Fired on a NON-terraform leg: ${nonTf.length} (since 09-15: ${nonTf.filter((x) => x.r.st >= '2026-09-15').length})`);

  if (assertBaseline) {
    const got = { population: rows.length, ...counts };
    const want = EXPECT as Record<string, number>;
    const diff = Object.keys(want).filter((k) => (got as Record<string, number>)[k] !== want[k]);
    if (diff.length) {
      mismatch = true;
      console.error(`\n🔴 BASELINE MISMATCH — ${diff.map((k) => `${k}: expected ${want[k]}, got ${(got as Record<string, number>)[k]}`).join('; ')}`);
      console.error('   A mismatch is a FINDING. Read the fired list above; do not adjust the expectation to match.');
    } else {
      console.log(`\n✅ Baseline reproduced: population ${rows.length}, fired ${counts.all}/${counts.since0915}/${counts.since0928}/${counts.since1005}`);
    }
  }
  process.exit(mismatch ? 1 : 0);
}

if (require.main === module) main();
