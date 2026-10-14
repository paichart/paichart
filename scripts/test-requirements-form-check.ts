/**
 * Unit pins for the requirements form check (2026-10-09) — the parts the PARITY test cannot cover because they have no
 * Python counterpart or are properties of the TS side alone:
 *   1. the read limits equal the live read mechanism in agentic-tool-loop.ts (a cap change there must fail HERE);
 *   2. the delivered estimator on ground truth (Run 14: measured 67,093; this estimator 67,009 — do not "fix" it);
 *   3. per-section size attribution is additive (Σ sections + 4 + ENVELOPE === deliveredEstimate) on every trial draft;
 *   4. residue: placeholders, 🗑, and every author-addressed opening is found in the REAL skeleton (so the list matches
 *      the text it names) and in a draft that copied it; a clean document counts zero;
 *   5. the fact: eligibility by exact role, unchecked arms carry nulls, gen 9's known numbers, item-map source stamped.
 * Run: npm run test:requirements-form-check
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { MAX_TOOL_RESULT_LENGTH, READ_MORE_WINDOW_BOUNDS } from '../lib/agents/harness/agentic-tool-loop';
import { createPagerState } from '../lib/agents/harness/agentic-tool-loop';
import { DEFAULT_READ_BUDGET, PROGRAM_ARCHITECT_READ_BUDGET, readBudgetFor } from '../lib/agents/role-read-budget';
import { expectedMaxToolTurns } from '../lib/agents/role-model-params';
import { FIRST_WINDOW, PAGE_MAX, PAGES_PER_DOC, PAGES_PER_RUN, ENVELOPE, PER_FILE_MAX, PHYSICAL_MAX, READ_MARGIN, deliveredEstimate, programView } from '../lib/agents/harness/requirements-size-lint';
import {
  AUTHOR_ADDRESSED_OPENINGS, computeRequirementsFormCheckFact, countResidue, isRequirementsFormCheckEligible,
  sectionSizes, sectionSizesSumToDelivered,
} from '../lib/agents/harness/requirements-form-check';

let passed = 0, failed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
};
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, what: string) => { if (!c) throw new Error(what); };

const ROOT = join(__dirname, '..');
const TRIAL = join(ROOT, '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09');
const draft = (d: string) => readFileSync(join(TRIAL, d, 'report.md'), 'utf8');
const objective = (d: string) => readFileSync(join(TRIAL, d, 'objective.txt'), 'utf8');
const ANSWERS = readFileSync(join(TRIAL, 'answers.md'), 'utf8');
const DRAFTS = ['draft-zero', 'draft-answered', 'draft-answered-2', 'draft-answered-3', 'draft-answered-4', 'draft-answered-5',
  'draft-answered-6', 'draft-answered-7', 'draft-answered-8'];

// 1. limits
t('read limits equal agentic-tool-loop.ts (first window, page max, per-origin pages, per-run pages)', () => {
  eq(FIRST_WINDOW, MAX_TOOL_RESULT_LENGTH, 'FIRST_WINDOW');
  eq(PAGE_MAX, READ_MORE_WINDOW_BOUNDS.max, 'PAGE_MAX');
  // The page caps are per role since 2026-10-12 (R1, lib/agents/role-read-budget.ts). The size checks measure against
  // the PROGRAM ARCHITECT's budget — the role that reads the whole spec — and the role key the engine resolves for it.
  eq(PAGES_PER_DOC, PROGRAM_ARCHITECT_READ_BUDGET.pagesPerDocument, 'PAGES_PER_DOC');
  eq(PAGES_PER_RUN, PROGRAM_ARCHITECT_READ_BUDGET.pagesPerRun, 'PAGES_PER_RUN');
  eq(readBudgetFor('program_architect'), PROGRAM_ARCHITECT_READ_BUDGET, 'program_architect reads the budget the checks use');
  ok(PAGES_PER_DOC > DEFAULT_READ_BUDGET.pagesPerDocument, 'the checks must not measure against the default budget');
  eq(PHYSICAL_MAX, 71000, 'PHYSICAL_MAX (8,000 + 9 x 7,000)');
  eq(READ_MARGIN, PAGE_MAX, 'READ_MARGIN is one page');
  eq(PER_FILE_MAX, 64000, 'PER_FILE_MAX (owner R1: ~64,000 checked, ~7K margin)');
});
t('a document AT the checked limit is readable to its end by the Architect\'s pager, with one page to spare', () => {
  const need = Math.ceil((PER_FILE_MAX - FIRST_WINDOW) / PAGE_MAX);
  eq(need, 8, 'pages a 64,000 document needs');
  ok(need < PAGES_PER_DOC, 'one page of reserve per document');
  const pager = createPagerState(48, PROGRAM_ARCHITECT_READ_BUDGET);
  eq(pager.pagesPerDocument, PAGES_PER_DOC, 'pager per-document cap');
  ok(need + 2 <= pager.maxPagerTurns, 'spec at the limit + a 2-page topology fit the run cap at 48 turns');
});
// The per-run cap is min(pagesPerRun, 25% of maxToolTurns): 12 needs >= 48 turns on the Program Architect template
// (owner option A, 2026-10-12; ff55c7fa: role-model-params.ts PROGRAM_ARCHITECT_MAX_TOOL_TURNS, spread into the row by
// both owning seeds). Without it the Architect gets 7 per run, and a spec passing this check with a topology may not be
// readable — so the checks' per-run number is pinned to the turn cap the seeds actually write.
t('the Program Architect\'s seeded tool-turn cap grants the per-run pages the checks assume', () => {
  for (const role of ['program_architect', 'value_chain_architect']) {
    const turns = expectedMaxToolTurns(role);
    ok(turns !== undefined, `${role}: no maxToolTurns in role-model-params.ts — the default 30 grants 7 pages per run`);
    eq(createPagerState(turns!, readBudgetFor(role)).maxPagerTurns, PAGES_PER_RUN, `${role} pages per run at ${turns} turns`);
  }
  for (const f of ['seed-program-templates.ts', 'seed-value-chain-templates.ts']) {
    ok(/roleToolTurnParams\(/.test(readFileSync(join(__dirname, f), 'utf8')), `${f} does not write the role's maxToolTurns`);
  }
});

// 2. estimator ground truth
const PUBLIC = process.env.PAICHART_PUBLIC_REPO || join(os.homedir(), 'paichart');
const RUN14 = join(PUBLIC, 'program-artifacts', 'telemetry-export-genspec-t1zero-v2', 'requirements.md');
t('delivered estimator on Run 14 ground truth: 67,009 body (measured 67,093) — the escaping estimator, unchanged', () => {
  if (!existsSync(RUN14)) { console.log('     (SKIPPED by name: public repo not present)'); return; }
  const text = readFileSync(RUN14, 'utf8');
  eq(Array.from(text).length, 63435, 'raw');
  eq(deliveredEstimate(text) - ENVELOPE, 67009, 'estimate body');
});
t('gen 9 program view: 51,725 under the old view (the publish refusal the retrospective records), 48,322 since group 3a', () => {
  eq(deliveredEstimate(programView(draft('draft-answered-8'))!.view), 48322);
});
const RUN3 = join(__dirname, '..', '.claude', 'skills', 'requirements-spec', 'work', 'telemetry-collector-namespace-senders-2026-10-11', 'draft-answered2', 'report.md');
t('group 3a: Phase 4 attempt 1 run 3 — 56,413 under the old view, 51,744 now (still over; the 14 not-applicable owner rows leave the view)', () => {
  const pv = programView(readFileSync(RUN3, 'utf8'))!.view;
  eq(deliveredEstimate(pv), 51744);
  ok(pv.includes('*Program view.* 14 rows ruled not applicable'), 'one replacement line');
  ok(!/tier: `?not-applicable/.test(pv), 'no not-applicable row left in the view');
});
t('group 3a: a document with no not-applicable rows has an unchanged owner section', () => {
  const doc = '# S\n\n## Decisions needed from the owner\n\nnone\n\n## Writing rules\n\nx\n';
  ok(programView(doc)!.view.includes('## Decisions needed from the owner\n\nnone\n'), 'unchanged');
});

// 3. attribution
t('per-section sizes sum to the delivered estimate on all 9 trial drafts (and their program views)', () => {
  for (const d of DRAFTS) {
    const text = draft(d);
    ok(sectionSizesSumToDelivered(text), `${d} raw`);
    const pv = programView(text);
    if (pv) ok(sectionSizesSumToDelivered(pv.view), `${d} view`);
  }
});
t('section attribution names the program view\'s largest sections (gen 9)', () => {
  const s = sectionSizes(programView(draft('draft-answered-8'))!.view);
  ok(s.length >= 8, `sections ${s.length}`);
  ok(s.some(x => x.section.startsWith('Writing rules — omitted')), 'reading-notes section present');
});

// 4. residue
const SKELETON = readFileSync(join(__dirname, 'seed-data', 'requirements-skeleton.tmpl'), 'utf8');
t('every author-addressed opening is found in the REAL skeleton (the list matches the text it names)', () => {
  const r = countResidue(SKELETON);
  const found = new Set(r.hits.filter(h => h.what === 'author-addressed').map(h => h.id));
  const missing = AUTHOR_ADDRESSED_OPENINGS.map(o => o.id).filter(id => !found.has(id));
  eq(missing, [], 'openings not found in the skeleton:');
  ok(r.placeholders > 100, `skeleton placeholders ${r.placeholders}`);
});
t('residue: a clean document counts zero; a placeholder, a 🗑 and a re-bolded opening are counted with their section', () => {
  eq(countResidue('# S\n\n## Acceptance\n\nNode C checks the value.\n').hits, []);
  const r = countResidue('# S\n\n## Pipeline 1 objective\n\nUse {{TOKEN}} here.\n> **🗑 AUTHORING NOTE** gone\n\n## Approvals\n\n**Approvers are   DECLARED,** never chosen.\n');
  eq([r.placeholders, r.deleteMarks, r.authorAddressed], [1, 1, 1]);
  eq(r.hits.map(h => `${h.what}@${h.section}`), ['placeholder@Pipeline 1 objective', 'delete-mark@Pipeline 1 objective', 'author-addressed@Approvals']);
});
t('residue on gen 9: author-addressed sentences survive (PC §1.4 / Z41), no placeholder, no 🗑', () => {
  const r = countResidue(programView(draft('draft-answered-8'))!.view);
  eq([r.placeholders, r.deleteMarks], [0, 0]);
  ok(r.authorAddressed >= 5, `authorAddressed ${r.authorAddressed}`);
});

// 5. the fact
t('eligibility: exact role, never a PIPELINE task, never config_change_author', () => {
  eq([isRequirementsFormCheckEligible('requirements_author', 'ACTION'), isRequirementsFormCheckEligible('requirements_author', 'PIPELINE'),
    isRequirementsFormCheckEligible('config_change_author', 'ACTION'), isRequirementsFormCheckEligible('requirements_reviewer', 'ACTION')], [true, false, false, false]);
});
t('unchecked arms carry nulls, never zeros', () => {
  const f = computeRequirementsFormCheckFact({ draft: 'x', objective: '', stopReason: 'max_tokens' });
  eq([f.checked, f.reason, f.size, f.coverage, f.citations, f.clauses, f.lint, f.residue], [false, 'not-end-turn', null, null, null, null, null, null]);
  eq(computeRequirementsFormCheckFact({ draft: '  \n', objective: '', stopReason: 'end_turn' }).reason, 'empty-deliverable');
});
t('gen 9 fact: fits since group 3a (48,322; 51,725 before), 8 coverage errors (4 + 2 predating request-path + 2 predating enforcer-scope), citations clean, no dropped clause (owner map)', () => {
  const f = computeRequirementsFormCheckFact({ draft: draft('draft-answered-8'), objective: objective('draft-answered-8'), ownerRowItemMap: ANSWERS, stopReason: 'end_turn' });
  eq([f.checked, f.size!.measured, f.size!.programViewDelivered, f.size!.headroom < 0], [true, 'program-view', 48322, false]);
  // Z49 (2026-10-10): +2 — gen 9 predates `request-path` (one missing row per authorisation leg); group 4 (2026-10-12):
  // +2 — it predates `enforcer-scope` the same way. The other 4 unchanged in count; B-2 re-reads its 3 invented rows as
  // restatements of items 18 / 21 / 21, which are now Author-actionable (authorActionableTotal 7 = 8 minus the Z17 one).
  eq([f.coverage!.errorsTotal, f.citations!.findingsTotal, f.clauses!.itemMapSource, f.clauses!.droppedTotal], [8, 0, 'owner-map', 0]);
  eq((f.coverage!.errors as any[]).filter((x: any) => x.what === 'missing auth row' && x.key === 'request-path').length, 2);
  eq((f.coverage!.errors as any[]).filter((x: any) => x.what === 'missing auth row' && x.key === 'enforcer-scope').length, 2);
  eq((f.coverage!.errors as any[]).filter((x: any) => String(x.what).startsWith('invented key restates item')).length, 3);
  eq(f.coverage!.authorActionableTotal, 7);
  ok(/^[0-9a-f]{64}$/.test(f.registrySha256) && /^[0-9a-f]{64}$/.test(f.templateSha256), 'shas stamped');
});
t('gen 6 fact: the owner map finds Z44 (item 21); without it the source is stamped draft-citations', () => {
  const withMap = computeRequirementsFormCheckFact({ draft: draft('draft-answered-5'), objective: objective('draft-answered-5'), ownerRowItemMap: ANSWERS, stopReason: 'end_turn' });
  eq(withMap.clauses!.dropped.map(d => d.item), [21]);
  const noMap = computeRequirementsFormCheckFact({ draft: draft('draft-answered-5'), objective: objective('draft-answered-5'), stopReason: 'end_turn' });
  eq([noMap.clauses!.itemMapSource, noMap.clauses!.droppedTotal], ['draft-citations', 0]); // the measured fail-open (PORT-NOTE §3)
  ok(noMap.coverage!.errorsTotal >= 10, 'the same draft fails coverage loudly (non-protocol tokens)');
});
t('findings are capped on the fact with the full count beside them', () => {
  const f = computeRequirementsFormCheckFact({ draft: draft('draft-answered'), objective: objective('draft-answered'), stopReason: 'end_turn' });
  ok(f.coverage!.errorsTotal > f.coverage!.errors.length && f.coverage!.errors.length === 12, `${f.coverage!.errorsTotal}/${f.coverage!.errors.length}`);
});

console.log(`\n✅ Passed: ${passed}`);
if (failed) { console.log(`❌ Failed: ${failed}`); process.exit(1); }
