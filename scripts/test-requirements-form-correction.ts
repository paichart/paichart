#!/usr/bin/env ts-node
/**
 * Requirements form check + correction — the 2b WIRING (2026-10-09, requirements-author retrospective).
 *
 * Part 1 (units, pure): eligibility, the flag, the owner ROW-ITEM map parse (metadata shape fixed with the coordinator),
 * the decision precedence, the time budget, the adoption rule, the message's vocabulary, residue never triggering.
 * Part 2 (the REAL `runExecutionCore`, I/O stubbed exactly as test-form-correction-core.ts does): the fact is stamped
 * on every eligible execution (flag OFF = zero calls, text untouched), the map source is recorded, flag ON = ONE turn +
 * the adoption rule, the budget skip, the #90 disqualifier, an LLM throw, a non-eligible role untouched.
 *
 * Fixtures: the committed trial drafts (gen 9 = draft-answered-8, padded in its rationale section so its program view is
 * over the read limit after group 3a; re-keyed for B-2 (2026-10-12): 1 coverage error, Z17; padded further for R1
 * (2026-10-12): the limit is the Program Architect's 64,000, so the pad is 200 sentences, not 36).
 * Record: cline_docs/reviews/requirements-author-retrospective-2026-10-09/WIRING-NOTE-2B.md.
 * Run: npm run test:requirements-form-correction
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
// 2b (2026-10-09): the core now READS the DB for a requirements_author execution (the owning harness). The fake
// credentials make lib/prisma.ts's eager $connect exit(1) asynchronously — a race the longer run can lose. Skip it.
process.env.PAICHART_SKIP_DB_CONNECT = process.env.PAICHART_SKIP_DB_CONNECT || 'true';

import * as fs from 'fs';
import * as path from 'path';

const loopMod = require('../lib/agents/harness/agentic-tool-loop');
const llmMod = require('../lib/services/llm/llm-service');
const netsMod = require('../lib/services/execution-nets');
const selMod = require('../lib/services/execution-selection');
const persistMod = require('../lib/services/execution-terminal-persist');
const rq = require('../lib/agents/harness/requirements-form-correction');
const rfc = require('../lib/agents/harness/requirements-form-check');
// Z49 (2026-10-10): every fixture in this file is a HISTORICAL draft (trial gen 9, VT-33 run 2) written before the
// `<token>.request-path` row existed. Under today's registry each gains one Author-actionable "missing auth row" per
// authorisation leg, which would change what these tests are about (and the byte-pinned messages) by construction.
// So the fixtures are evaluated against the registry they were written under (request-path removed), and the
// current-registry behaviour is pinned separately ("Z49 CURRENT REGISTRY" below). If both prompt pins stay green
// under the frozen registry, Z49 changed no correction-message wording.
const REG_MOD = require('../lib/agents/harness/requirements-form-check.generated');
const Z49_AUTH = [...REG_MOD.REQUIREMENTS_REGISTRY.classes.auth];
const Z49_OPTS = [...REG_MOD.REQUIREMENTS_REGISTRY.options];
// Group 4 (2026-10-12): the same holds for `<token>.enforcer-scope` — every fixture predates it too, so the frozen registry
// drops both keys.
const POST_FIXTURE_KEYS = ['request-path', 'enforcer-scope'];
function registryPreZ49(): void {
  REG_MOD.REQUIREMENTS_REGISTRY.classes.auth = Z49_AUTH.filter((k: string) => !POST_FIXTURE_KEYS.includes(k));
  REG_MOD.REQUIREMENTS_REGISTRY.options = Z49_OPTS.filter((o: [string, string]) => !POST_FIXTURE_KEYS.includes(o[0]));
}
function registryCurrent(): void {
  REG_MOD.REQUIREMENTS_REGISTRY.classes.auth = [...Z49_AUTH];
  REG_MOD.REQUIREMENTS_REGISTRY.options = [...Z49_OPTS];
}
registryPreZ49();
const { rowItemMapFromAnswers } = require('../lib/agents/harness/requirements-clauses');
const { runExecutionCore } = require('../lib/services/execution-core');
const { LLMProvider } = require('../lib/services/llm/types');

let passed = 0;
let failed = 0;
async function test(d: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const TRIAL = path.join(__dirname, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09');
// Group 3a (2026-10-12): the program view no longer carries the owner section's not-applicable rows, so the real gen 9
// (51,725 before) now FITS (48,322). The size-failing case these tests need is made explicit: gen 9 with neutral filler
// in the rationale section, which gen9Trimmed() empties — so the trimmed draft is exactly the real gen 9 minus that body.
const GEN9_RAW = fs.readFileSync(path.join(TRIAL, 'draft-answered-8', 'report.md'), 'utf8');
const SIZE_PAD = Array(200).fill('This paragraph is filler added by the test so that the draft exceeds the read limit.').join(' ');
const GEN9_INVENTED = GEN9_RAW.replace(/^(## Why this is sequenced[^\n]*\n)/m, `$1\n${SIZE_PAD}\n`);
/** B-2 (2026-10-12): gen 9 as written carries three Author-INVENTED rows, each a declared restatement of an owner item
 *  (18, 21, 21). Since B-2 those are Author-actionable coverage findings ("invented key restates item N — key it
 *  <token>.item-<N>") and trigger the correction, which would change what the tests below are about by construction.
 *  So the default fixture is gen 9 RE-KEYED the way B-2 asks (and the correction can adopt): each row renamed to its
 *  item number (item-18 / item-21 / item-21a, every reference in the body too) with options `—`. Its only coverage
 *  finding is then the Z17 one (registry-caused). The as-written draft (GEN9_INVENTED) is pinned separately below. */
function rekeyB2(text: string): string {
  const ids: Array<[string, string]> = [['terraform-iac.policy-managers-multiple', 'terraform-iac.item-18'],
    ['terraform-iac.deny-others', 'terraform-iac.item-21'], ['terraform-iac.tag-drift', 'terraform-iac.item-21a']];
  let t = text;
  for (const [a, b] of ids) t = t.split(a).join(b);
  return t.split('\n').map((l) => /^\| terraform-iac\.item-\d+a? \|/.test(l)
    ? l.replace(/^(\|[^|]*\|[^|]*\|)[^|]*\|/, '$1 — |') : l).join('\n');
}
const GEN9 = rekeyB2(GEN9_INVENTED);
const OBJ9 = fs.readFileSync(path.join(TRIAL, 'draft-answered-8', 'objective.txt'), 'utf8');
const ANSWERS = fs.readFileSync(path.join(TRIAL, 'answers.md'), 'utf8');

/** The launch-time metadata shape, built FROM answers.md's ROW-ITEM-MAP (backticks + "(added …)" notes stripped). */
function metadataMapFromAnswers(answers: string): { version: number; source: string; items: Record<string, string[]> } {
  const items: Record<string, string[]> = {};
  for (const line of answers.slice(answers.indexOf('ROW-ITEM-MAP')).split('\n')) {
    const m = /^\|\s*`([^`]+)`[^|]*\|\s*(\d+)\s*\|/.exec(line);
    if (m) (items[m[2]] ??= []).push(m[1]);
  }
  return { version: 1, source: 'answers.md', items };
}
const META_MAP = metadataMapFromAnswers(ANSWERS);

/** Gen 9 with the rationale section's body emptied (heading kept): size passes, nothing else moves. */
function gen9Trimmed(text: string): string {
  const L = text.split('\n');
  const a = L.findIndex((l) => l.startsWith('## Why this is sequenced'));
  const b = L.findIndex((l) => l.startsWith('## Approvals'));
  return [...L.slice(0, a + 1), ...L.slice(b)].join('\n');
}
const GEN9_TRIM = gen9Trimmed(GEN9);

const INPUTS_OK = {
  objective: OBJ9, objectiveResolved: true, harnessTaskId: 'harness-1',
  ownerMap: rq.parseOwnerRowItemMap(META_MAP).map, ownerMapState: 'present',
};
const factOf = (text: string, inputs = INPUTS_OK) =>
  rq.computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'loop', inputs });

// ── Core harness (mirrors test-form-correction-core.ts) ─────────────────────────────────────────────────────────
const cfg = {
  maxTokens: 64000, temperature: 0.3, topP: undefined, stopSequences: undefined, systemPrompt: 'sys',
  provider: LLMProvider.ANTHROPIC_SDK, model: 'test-model', apiKey: 'sk-test-FAKE-req', webSearch: undefined,
  cacheControl: undefined, thinkingBudgetTokens: undefined,
};
const silent = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

interface Run { llmCalls: any[]; persisted: any | null; netsText: string | null; events: string[]; finalUsage: any; resolverCalls: number }

function loopResult(text: string, over: Record<string, unknown> = {}) {
  const currentResponse = { text, stopReason: 'end_turn', usage: { inputTokens: 1000, outputTokens: 500 },
    rawContentBlocks: [{ type: 'text', text }], metadata: { model: 'test-model' } };
  return {
    currentResponse, toolCallResults: [], messageHistory: [{ role: 'user', content: 'author the spec' }],
    totalUsage: { inputTokens: 1000, outputTokens: 500 }, turnCount: 1, hitMaxTurns: false,
    correctionTurnUsed: false, budgetFailFastUsed: false, truncationRetryUsed: false, truncationRetryRecovered: false,
    truncationRetryStopReason: null, truncationRetryDiscardedChars: null, truncationRetrySkippedReason: null,
    truncationRetryMaxTokens: null, finalStopReason: 'end_turn', assembledText: text, ...over,
  };
}

const realResolve = rq.resolveRequirementsFormInputs;
const realLoop = loopMod.runAgenticToolLoop;
async function runCore(opts: {
  text: string; role?: string; flag?: boolean; llm?: any[]; loopOver?: Record<string, unknown>;
  inputs?: any; timeoutMs?: number; withObservers?: boolean;
}): Promise<Run> {
  const run: Run = { llmCalls: [], persisted: null, netsText: null, events: [], finalUsage: null, resolverCalls: 0 };
  const lr = loopResult(opts.text, opts.loopOver);
  const replies = [...(opts.llm ?? [])];
  loopMod.runAgenticToolLoop = async () => lr;
  llmMod.llmService.generateText = async (_p: string, o: any) => {
    run.llmCalls.push(o);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    if (r && typeof r.__delayMs === 'number') { await new Promise((res) => setTimeout(res, r.__delayMs)); }
    if (!r) throw new Error('unexpected LLM call');
    return r;
  };
  rq.resolveRequirementsFormInputs = async () => { run.resolverCalls++; return opts.inputs ?? INPUTS_OK; };
  netsMod.stampExecutionNets = async (_db: unknown, ctx: { finalResponse: string }) => { run.netsText = ctx.finalResponse; };
  selMod.computeSelfSupersession = async () => null;
  persistMod.persistTerminalSuccess = async (_db: unknown, p: any) => { run.persisted = p; run.finalUsage = { ...p.usage }; return { createdArtifacts: [] }; };
  const prev = process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED;
  if (opts.flag) process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED = 'true'; else delete process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED;
  try {
    await runExecutionCore({
      executionId: 'exec-req-1', execution: { id: 'exec-req-1', createdAt: new Date(), context: {} },
      task: { id: 'task-req-1', type: 'ACTION', metadata: {}, povId: null, title: 'Author the requirements', inputContext: null },
      config: {}, userId: 'u1', prompt: 'author the spec', normalizedLlmConfig: cfg, mcpFunctions: [],
      agentRole: opts.role ?? 'requirements_author', resolvedTemplate: { id: 't', name: 'Requirements Author' },
      harnessContext: null, protocolInjection: null, maxToolTurns: 30, executionTimeoutMs: opts.timeoutMs ?? 1_080_000,
      startTime: new Date(), buildSuccessLogs: () => ['ok'], prune: true, fireReactors: true, logger: silent,
    }, opts.withObservers ? {
      requirementsFormCorrection: {
        onRequirementsCorrectionStart: (f: string[]) => { run.events.push(`rq-start:${f.join(',')}`); },
        onRequirementsCorrectionComplete: (r: { adopted: boolean; notAdoptedReason?: string }) => { run.events.push(`rq-done:${r.adopted ? 'adopted' : r.notAdoptedReason}`); },
      },
      onStoringResults: () => { run.events.push('storing'); },
      diagnosticRetry: { onDiagnosticRetryStart: () => { run.events.push('diag-start'); } },
    } : {});
  } finally {
    if (prev === undefined) delete process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED; else process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED = prev;
    rq.resolveRequirementsFormInputs = realResolve;
  }
  return run;
}
const resp = (text: string, over: Record<string, unknown> = {}) =>
  ({ text, stopReason: 'end_turn', usage: { inputTokens: 300, outputTokens: 200 }, rawContentBlocks: [{ type: 'text', text }], metadata: { model: 'test-model' }, ...over });
const rqOf = (r: Run) => r.persisted?.resultJson?.toolLoop?.requirementsFormCheck;

(async () => {
  // ══ Part 1 — units ══════════════════════════════════════════════════════════════════════════════════════════
  await test('ELIGIBILITY: exact role requirements_author, non-PIPELINE only', () => {
    ok(rfc.isRequirementsFormCheckEligible('requirements_author', 'ACTION'), 'requirements_author/ACTION not eligible');
    ok(!rfc.isRequirementsFormCheckEligible('requirements_author', 'PIPELINE'), 'PIPELINE eligible');
    for (const r of ['config_change_author', 'Requirements_Author', 'requirements_author_x', 'requirements_reviewer', null]) {
      ok(!rfc.isRequirementsFormCheckEligible(r, 'ACTION'), `${r} eligible`);
    }
  });
  await test('FLAG: default OFF; only the literal "true" enables', () => {
    ok(!rq.isRequirementsFormCorrectionEnabled({}), 'unset enabled');
    for (const v of ['1', 'TRUE', 'yes', 'True']) ok(!rq.isRequirementsFormCorrectionEnabled({ REQUIREMENTS_FORM_CORRECTION_ENABLED: v }), `"${v}" enabled`);
    ok(rq.isRequirementsFormCorrectionEnabled({ REQUIREMENTS_FORM_CORRECTION_ENABLED: 'true' }), '"true" did not enable');
    ok(!rq.isRequirementsFormCorrectionEnabled({ FORM_CORRECTION_ENABLED: 'true' }), 'the terraform flag enabled the requirements turn');
  });
  await test('OWNER MAP: the metadata shape converts to EXACTLY the map answers.md yields (rowItemMapFromAnswers)', () => {
    const p = rq.parseOwnerRowItemMap(META_MAP);
    ok(p.state === 'present' && p.map, `state ${p.state}`);
    const viaText = rowItemMapFromAnswers(ANSWERS);
    const norm = (m: Map<number, Set<string>>) => JSON.stringify([...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, [...v].sort()]));
    ok(norm(p.map) === norm(viaText), 'metadata map differs from the answers.md map');
    ok(p.map.get(21).has('terraform-iac.collateral') && p.map.size === 21, `size ${p.map.size}`);
  });
  await test('OWNER MAP: missing / malformed / version≠1 are ABSENT, each with its own state', () => {
    ok(rq.parseOwnerRowItemMap(undefined).state === 'absent' && rq.parseOwnerRowItemMap(null).state === 'absent', 'absent');
    ok(rq.parseOwnerRowItemMap({ ...META_MAP, version: 2 }).state === 'version-unsupported', 'version 2');
    ok(rq.parseOwnerRowItemMap({ items: META_MAP.items }).state === 'version-unsupported', 'version missing');
    for (const bad of ['x', [1], { version: 1 }, { version: 1, items: [] }, { version: 1, items: { one: ['a'] } },
      { version: 1, items: { 1: 'a' } }, { version: 1, items: { 1: ['a', 3] } }, { version: 1, items: { 1: [' '] } }]) {
      const r = rq.parseOwnerRowItemMap(bad);
      ok(r.state === 'malformed' && r.map === null && r.detail, `${JSON.stringify(bad)} → ${r.state}`);
    }
  });
  await test('INPUTS: requirementsInputsFromHarnessRow — map present/absent, empty description unresolved', () => {
    const a = rq.requirementsInputsFromHarnessRow({ id: 'h', description: OBJ9, metadata: { requirementsRowItemMap: META_MAP } });
    ok(a.objectiveResolved && a.ownerMapState === 'present' && a.harnessTaskId === 'h', JSON.stringify({ ...a, ownerMap: undefined }));
    const b = rq.requirementsInputsFromHarnessRow({ id: 'h', description: OBJ9, metadata: {} });
    ok(b.objectiveResolved && b.ownerMapState === 'absent' && b.ownerMap === null, 'absent');
    const c = rq.requirementsInputsFromHarnessRow({ id: 'h', description: '  ', metadata: {} });
    ok(!c.objectiveResolved && c.objectiveUnresolvedReason === 'empty-description', 'empty');
    ok(rq.requirementsInputsFromHarnessRow(null).objectiveUnresolvedReason === 'no-owning-harness', 'null row');
  });
  await test('INPUTS: resolveRequirementsFormInputs over a stub db — one / none / ambiguous / no-stage / read-error', async () => {
    const db = (stageId: string | null, rows: unknown[], harness: unknown, throwAt?: string) => ({
      task: { findUnique: async (args: any) => {
        if (throwAt === 'find') throw new Error('db down');
        return args.select.stageId ? (stageId ? { stageId } : null) : harness;
      } },
      $queryRaw: async () => rows,
    });
    const one = await realResolve(db('st', [{ id: 'h1', chained: [] }], { id: 'h1', description: OBJ9, metadata: { requirementsRowItemMap: META_MAP } }), 't');
    ok(one.objectiveResolved && one.harnessTaskId === 'h1' && one.ownerMapState === 'present', JSON.stringify({ ...one, ownerMap: undefined }));
    ok((await realResolve(db('st', [], null), 't')).objectiveUnresolvedReason === 'no-owning-harness', 'none');
    ok((await realResolve(db('st', [{ id: 'a' }, { id: 'b' }], null), 't')).objectiveUnresolvedReason === 'ambiguous-owning-harness', 'ambiguous');
    ok((await realResolve(db(null, [], null), 't')).objectiveUnresolvedReason === 'no-stage', 'no-stage');
    ok((await realResolve(db('st', [], null, 'find'), 't')).objectiveUnresolvedReason === 'read-error', 'read-error');
  });
  await test('DECISION precedence: not-checked > no-failing-check > #89 > budget > flag-off > objective > time', () => {
    const f = factOf(GEN9);
    const time = () => ({ remainingMs: 1000, estimatedMs: 10, estimatedOutputTokens: 1, observedTps: 90 });
    const d = (o: any) => rq.decideRequirementsFormCorrection({ fact: f, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: true, time, ...o });
    ok(d({ fact: { ...f, checked: false } }).notAttemptedReason === 'not-checked', 'not-checked');
    ok(d({ fact: factOf(GEN9_TRIM) }).notAttemptedReason === 'no-failing-check', 'trimmed gen 9: its only coverage findings are registry-caused (stage A (b)) — nothing for the Author to correct');
    ok(d({ correctionTurnUsed: true, budgetFlagged: true, enabled: false }).notAttemptedReason === 'prior-pass-used:anti-fabrication', '#89');
    ok(d({ budgetFlagged: true, enabled: false }).notAttemptedReason === 'budget-flagged', 'budget');
    const off = d({ enabled: false, objectiveResolved: false });
    ok(off.notAttemptedReason === 'flag-off' && !('timeBudget' in off), `flag-off: ${JSON.stringify(off)}`);
    ok(d({ objectiveResolved: false }).notAttemptedReason === 'objective-unresolved', 'objective');
    const late = d({ time: () => ({ remainingMs: 10, estimatedMs: 1000, estimatedOutputTokens: 1, observedTps: 90 }) });
    ok(late.notAttemptedReason === 'insufficient-time' && late.timeBudget.remainingMs === 10, 'time');
    const go = d({});
    ok(go.attempted === true && go.failingChecks.join(',') === 'size', `go (registry-caused coverage excluded): ${JSON.stringify(go.failingChecks)}`);
  });
  await test('RESIDUE (Steve 2026-10-09): `{{` and 🗑 TRIGGER; author-addressed sentences alone never do', () => {
    const f = factOf(GEN9);
    const clean = { ...f, size: { ...f.size, headroom: 10 }, coverage: { ...f.coverage, errorsTotal: 0 } };
    const dec = (residue: any) => rq.decideRequirementsFormCorrection({ fact: { ...clean, residue }, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: true, time: () => ({ fits: true } as any) });
    const live = dec({ placeholders: 1, deleteMarks: 0, authorAddressed: 0, hits: [] });
    ok(live.attempted === true && (live.failingChecks || []).includes('residuePlaceholders' as any), JSON.stringify(live));
    const del = dec({ placeholders: 0, deleteMarks: 2, authorAddressed: 0, hits: [] });
    ok((del.failingChecks || []).includes('residueDeleteMarks' as any), JSON.stringify(del));
    const aa = rq.decideRequirementsFormCorrection({ fact: { ...clean, residue: { placeholders: 0, deleteMarks: 0, authorAddressed: 11, hits: [] } }, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: true, time: () => { throw new Error('time read'); } });
    ok(aa.notAttemptedReason === 'no-failing-check', JSON.stringify(aa));
  });
  await test('STAGE A (b): registry-caused coverage findings (Z17 class inference; B-2 new decisions) never trigger and never reach the message', () => {
    // B-2 (2026-10-12): the re-keyed gen 9's only coverage finding is Z17 — recorded, never actionable. Numbers below are the
    // re-keyed fixture's (shorter row ids: 51,387 → 51,292 delivered; R1 pad 36 → 200: 65,232 against 64,000).
    const f = factOf(GEN9);
    ok(f.coverage!.errorsTotal === 1 && f.coverage!.authorActionableTotal === 0, `gen 9 re-keyed: 1 recorded (Z17), 0 actionable — ${JSON.stringify(f.coverage)}`);
    const fits = { ...f, size: { ...f.size!, headroom: 10 } };
    const d = rq.decideRequirementsFormCorrection({ fact: fits as any, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: true, time: () => { throw new Error('time read'); } });
    ok(d.notAttemptedReason === 'no-failing-check', `a gen-9 draft that fits must not be corrected for registry gaps: ${JSON.stringify(d)}`);
    const a = rfc.analyzeRequirementsForm({ draft: GEN9, objective: OBJ9 } as any);
    const p = rq.buildRequirementsCorrectionPrompt(f, a);
    ok(!p.includes('deleting ANY') && !p.includes('Coverage:'), 'registry-caused findings must not appear in the message');
    ok(p.includes('1,232 over'), 'the size finding still reaches the message');
  });
  await test('B-2 (2026-10-12): an invented row that RESTATES item N is Author-actionable — it triggers and reaches the message; Z17 still does not', () => {
    const f = factOf(GEN9_INVENTED);
    ok(f.coverage!.errorsTotal === 4 && f.coverage!.authorActionableTotal === 3, `gen 9 as written: 4 recorded, 3 actionable — ${JSON.stringify(f.coverage)}`);
    const fits = { ...f, size: { ...f.size!, headroom: 10 } };
    const d = rq.decideRequirementsFormCorrection({ fact: fits as any, correctionTurnUsed: false, budgetFlagged: false, enabled: true, objectiveResolved: true, time: () => ({ fits: true } as any) });
    ok(d.attempted === true && (d.failingChecks || []).join(',') === 'coverage', `restatements alone must trigger: ${JSON.stringify(d)}`);
    const p = rq.buildRequirementsCorrectionPrompt(f, rfc.analyzeRequirementsForm({ draft: GEN9_INVENTED, objective: OBJ9 } as any));
    ok(p.includes('invented key restates item 18 — key it terraform-iac.item-18') && p.includes('id: terraform-iac.tag-drift'), 'each restatement reaches the message');
    ok(!p.includes('deleting ANY'), 'Z17 still never reaches the message');
    const g = factOf(GEN9_INVENTED.replace(/^\| terraform-iac\.tag-drift \|[^|]*\|[^|]*\|([^|]*)\|[^\n]*$/m, '| terraform-iac.tag-drift | which tags | a · b |$1| OPEN — which tags; options: a · b |'));
    // The OPEN row is a new decision (registry-caused, excluded); it also now owes an owner-block line, which IS the Author's.
    ok(g.coverage!.errors.filter((e: any) => rfc.isRegistryCausedCoverageFinding(e)).map((e: any) => String(e.what).slice(0, 28)).join(',') === 'invented key asks a decision,authorisation leg lists auth',
      `an OPEN invented row is a new decision — registry-caused, never actionable: ${JSON.stringify(g.coverage)}`);
  });
  await test('STAGE A (b): a genuine Author coverage finding still triggers', () => {
    ok(!rfc.isRegistryCausedCoverageFinding({ what: 'source is not one of the four forms' }), 'four-forms is the Author\'s');
    ok(!rfc.isRegistryCausedCoverageFinding({ what: 'options cell differs from the registry' }), 'options is the Author\'s');
    ok(!rfc.isRegistryCausedCoverageFinding({ what: 'invented key restates item 18 — key it terraform-iac.item-18' }), 'a restatement is the Author\'s (B-2)');
    ok(!rfc.isRegistryCausedCoverageFinding({ what: 'item row is not declared' }), 'a malformed item row is the Author\'s (B-2)');
    ok(!rfc.isRegistryCausedCoverageFinding({ what: 'unknown key for a known token' }), 'the pre-B-2 string is no longer emitted, and no longer excluded');
    ok(rfc.isRegistryCausedCoverageFinding({ what: 'invented key asks a decision no key or item asks (owner decision; registry candidate)' }) && rfc.isRegistryCausedCoverageFinding({ what: 'authorisation leg lists authorisation rows not-applicable (8.1: deleting ANY is blocking)' }), 'the two registry-caused types');
  });
  await test('TIME estimate: R4 constants — tokens = max(last turn, chars/3), floor tps when unmeasurable, safety added', () => {
    const t = rq.estimateRequirementsCorrectionTime({ deadlineAt: 1_000_000, now: 400_000, loopStartedAt: 400_000, draftChars: 51_000, lastTurnOutputTokens: 0, totalOutputTokens: 0 });
    ok(t.observedTps === 90 && t.estimatedOutputTokens === 17_000, JSON.stringify(t));
    ok(t.estimatedMs === Math.round(30_000 + (17_000 / (90 * 0.85)) * 1000) && t.remainingMs === 600_000, JSON.stringify(t));
    const m = rq.estimateRequirementsCorrectionTime({ deadlineAt: 1_080_000, now: 400_000, loopStartedAt: 0, draftChars: 51_000, lastTurnOutputTokens: 20_000, totalOutputTokens: 40_000 });
    ok(m.observedTps === 100 && m.estimatedOutputTokens === 20_000, JSON.stringify(m));
    const short = rq.estimateRequirementsCorrectionTime({ deadlineAt: 1_080_000, now: 5_000, loopStartedAt: 0, draftChars: 51_000, lastTurnOutputTokens: 500, totalOutputTokens: 500 });
    ok(short.observedTps === 90, `a <10 s loop is not a throughput sample: ${JSON.stringify(short)}`);
  });
  await test('ADOPTION rule: adopt / regressed (new failure class) / no-improvement / sections / confidence / unchecked', () => {
    const b = factOf(GEN9);
    const chk = (corrected: string, over: any = {}) => rq.checkRequirementsCorrectionAdoption({ original: GEN9, corrected, stopReason: 'end_turn', before: b, after: factOf(corrected), ...over });
    const a = chk(GEN9_TRIM);
    ok(a.adopted && a.improvedChecks.join(',') === 'size', JSON.stringify(a));
    const reg = chk(GEN9_TRIM.replace('## Open questions', '## Open questions\n\n🗑 x'));
    ok(!reg.adopted && reg.notAdoptedReason === 'regressed' && reg.regressedMeasures.includes('residueDeleteMarks'), JSON.stringify(reg));
    const reg2 = chk(GEN9_TRIM.replace('## Open questions', '## Open questions\n\nitem 99: "nothing"'));
    ok(!reg2.adopted && reg2.notAdoptedReason === 'regressed', `citation regression: ${JSON.stringify(reg2)}`);
    ok(chk(GEN9 + '\n').notAdoptedReason === 'no-improvement', 'unchanged text adopted');
    ok(chk(GEN9_TRIM.replace('## Open questions', '## Questions')).notAdoptedReason === 'sections-changed', 'heading rename');
    ok(chk(GEN9_TRIM.replace(/Confidence: 82\s*$/, 'Confidence: 90')).notAdoptedReason === 'confidence-changed', 'confidence');
    ok(chk(GEN9_TRIM.replace(/Confidence: 82\s*$/, '')).notAdoptedReason === 'confidence-missing', 'confidence missing');
    ok(chk(GEN9_TRIM, { stopReason: 'max_tokens' }).notAdoptedReason === 'not-end-turn', 'stop');
    ok(chk(GEN9_TRIM, { after: null }).notAdoptedReason === 'recheck-unchecked', 'unchecked');
  });
  await test('MESSAGE is facts only: sizes per section, each finding, residue (placeholders/🗑 defects; author-addressed not blocking); no design verbs', () => {
    const f = factOf(GEN9);
    const a = rfc.analyzeRequirementsForm({ draft: GEN9, objective: OBJ9, ownerRowItemMapParsed: INPUTS_OK.ownerMap });
    const p = rq.buildRequirementsCorrectionPrompt(f, a);
    ok(p.includes('65,232') && p.includes('64,000') && p.includes('1,232 over'), 'size numbers');   // R1 (2026-10-12): pad 36 → 200 under the Architect's 64,000 limit (was 51,292 / 50,000; B-2 before that 51,387)
    ok(p.includes('- Design decisions: 9,051'), 'per-section size');   // B-2 re-keyed fixture (was 9,123)
    ok(!p.includes('unknown key for a known token') && !p.includes('terraform-iac.deny-others'), 'registry-caused coverage findings never reach the message (stage A (b))');
    ok(p.includes('Template residue:') && p.includes('(each is a defect)') && p.includes('(counted, not blocking)'), 'residue line');
    ok(p.includes('Every decision stays as the objective states it.'), 'decision clause');
    for (const w of [/\bcut\b/i, /\bshorten\b/i, /\bremove\b/i, /\bshould\b/i, /\brecommend/i, /\bconsider\b/i]) ok(!w.test(p), `design verb ${w}`);
    ok(!p.includes('Citations:') && !p.includes('Objective clauses:'), 'a passing check was listed');
  });

  // ══ Part 2 — through the REAL core ══════════════════════════════════════════════════════════════════════════
  await test('FLAG OFF (default): fact stamped (size + coverage failing), flag-off, ZERO LLM calls, text untouched', async () => {
    const r = await runCore({ text: GEN9 });
    ok(r.llmCalls.length === 0 && r.resolverCalls === 1, `calls ${r.llmCalls.length} resolver ${r.resolverCalls}`);
    ok(r.persisted.finalText === GEN9 && r.netsText === GEN9, 'deliverable changed');
    const f = rqOf(r);
    ok(f && f.checked && f.textSource === 'loop' && f.size.programViewDelivered === 65232 && f.coverage.errorsTotal === 1, JSON.stringify(f?.size?.programViewDelivered));
    ok(f.correction.attempted === false && f.correction.notAttemptedReason === 'flag-off' && !('timeBudget' in f.correction), JSON.stringify(f.correction));
    ok(f.inputs.objective === 'owning-harness' && f.inputs.ownerRowItemMap === 'present' && f.clauses.itemMapSource === 'owner-map', JSON.stringify(f.inputs));
    const keys = Object.keys(r.persisted.resultJson.toolLoop);
    ok(keys.indexOf('requirementsFormCheck') > keys.indexOf('toolErrorResultCount'), 'not last-but-reflectionErrors in toolLoop');
    const rjKeys = Object.keys(r.persisted.resultJson);
    ok(rjKeys.indexOf('toolLoop') < rjKeys.indexOf('finalResponse'), 'toolLoop must precede finalResponse (head-slice contract)');
    ok(!('preCorrectionDraft' in r.persisted), 'G1 B: no attempt ⇒ no pre-correction artifact handed to persist');
    ok(!('reflectionPassSpentBy' in r.persisted.resultJson.toolLoop), 'G6: no pass spent ⇒ key absent (bytes unchanged)');
    ok(!('preCorrection' in f.correction) && !('before' in f.correction), 'G1 B: no attempt ⇒ no pointer, no before-lists');
  });
  await test('MAP SOURCE recorded: absent ⇒ draft-citations; malformed / version ⇒ their own state, fallback used', async () => {
    for (const [meta, state] of [[undefined, 'absent'], [{ version: 1, items: [] }, 'malformed'], [{ ...META_MAP, version: 2 }, 'version-unsupported']] as const) {
      const inputs = rq.requirementsInputsFromHarnessRow({ id: 'h', description: OBJ9, metadata: meta === undefined ? {} : { requirementsRowItemMap: meta } });
      const r = await runCore({ text: GEN9, inputs });
      const f = rqOf(r);
      ok(f.inputs.ownerRowItemMap === state && f.clauses.itemMapSource === 'draft-citations', `${state}: ${JSON.stringify(f.inputs)} ${f.clauses.itemMapSource}`);
      ok(state === 'absent' ? !('ownerRowItemMapDetail' in f.inputs) : typeof f.inputs.ownerRowItemMapDetail === 'string', 'detail');
    }
  });
  await test('ADOPT: flag ON → ONE reflection call, corrected text persisted + netted, re-check + decision counts, tokens folded', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)], withObservers: true });
    ok(r.llmCalls.length === 1 && r.llmCalls[0].functionCall === 'none', `calls ${r.llmCalls.length}`);
    ok(r.persisted.finalText === GEN9_TRIM && r.netsText === GEN9_TRIM && r.persisted.resultJson.finalResponse === GEN9_TRIM, 'corrected text not persisted everywhere');
    const f = rqOf(r);
    ok(f.textSource === 'requirements-form-correction' && f.size.headroom >= 0 && f.coverage.errorsTotal === 1, 'top-level fact is not the re-check');
    const c = f.correction;
    ok(c.attempted && c.adopted && c.improvedChecks.join(',') === 'size' && c.failingChecks.join(',') === 'size', JSON.stringify(c));
    ok(c.measuresBefore.size === 1232 && c.measuresAfter.size === 0 && c.decision.sizeDelivered === 65232, 'before/after');
    ok(c.timeBudget && c.timeBudget.estimatedMs <= c.timeBudget.remainingMs, 'time budget not stamped');
    ok(c.inputTokens === 300 && c.outputTokens === 200 && typeof c.durationMs === 'number', 'tokens');
    ok(r.finalUsage.inputTokens === 1300 && r.finalUsage.outputTokens === 700, `usage ${JSON.stringify(r.finalUsage)}`);
    ok(r.events.join('|') === 'rq-start:size|rq-done:adopted|storing', r.events.join('|'));
    const msg = r.llmCalls[0].messages.at(-1).content[0].text;
    ok(msg.startsWith('**Publish checks on your draft (platform, mechanical).**'), 'the correction message is not the last user turn');
    // G1 B: the ORIGINAL goes to persist as its own artifact; the fact carries the pointer, the before-lists and the
    // per-section sizes; the whole requirements fact stays small enough for the result.json head slice.
    ok(r.persisted.preCorrectionDraft === GEN9, 'G1 B: the original draft must reach persist on an adopted attempt');
    const sha = require('crypto').createHash('sha256').update(GEN9, 'utf8').digest('hex');
    ok(c.preCorrection.artifact === 'requirements.pre-correction.md' && c.preCorrection.sha256 === sha && c.preCorrection.chars === GEN9.length, JSON.stringify(c.preCorrection));
    ok(Array.isArray(c.before.coverageErrors) && c.before.coverageErrors.length === 1 && Array.isArray(c.before.droppedClauses), JSON.stringify(Object.keys(c.before)));
    ok(c.sectionSizes.before.length > 0 && c.sectionSizes.after.length === c.sectionSizes.before.length, 'per-section sizes before/after');
    const rsec = (xs: any[]) => xs.find((s: any) => s.section.startsWith('Why this is sequenced'));
    ok(rsec(c.sectionSizes.after).delivered < rsec(c.sectionSizes.before).delivered, 'the emptied section shows its shrink');
    const bytes = JSON.stringify(f).length;
    ok(bytes < 16_000, `requirementsFormCheck fact is ${bytes} chars — keep it well under the head-slice budget`);
    ok(c.adoptionRuleVersion === 4 && c.adoptionArm === 'no-regression', 'adoption rule version + arm stamped');
    ok(r.persisted.resultJson.toolLoop.reflectionPassSpentBy === 'requirements-form-correction', `G6 spender: ${r.persisted.resultJson.toolLoop.reflectionPassSpentBy}`);
  });
  await test('REJECT (regressed): ORIGINAL persisted by reference, reason + measures stamped, tokens still folded', async () => {
    const bad = GEN9_TRIM.replace('## Open questions', '## Open questions\n\n🗑 x');
    const r = await runCore({ text: GEN9, flag: true, llm: [resp(bad)] });
    ok(r.llmCalls.length === 1 && r.persisted.finalText === GEN9, 'original not kept');
    const f = rqOf(r);
    ok(f.textSource === 'loop' && f.correction.adopted === false && f.correction.notAdoptedReason === 'regressed', JSON.stringify(f.correction));
    ok(f.correction.regressedMeasures.join(',') === 'residueDeleteMarks', JSON.stringify(f.correction.regressedMeasures));
    ok(r.finalUsage.inputTokens === 1300, 'spent tokens not folded on a rejection');
    ok(r.persisted.preCorrectionDraft === GEN9 && f.correction.preCorrection, 'G1 B: the original is persisted on EVERY attempt, refused ones too');
  });
  await test('G1 B SOURCE PINS: persisted as its own redacted artifact (non-PIPELINE), excluded from agent.results, never chained', () => {
    const persist = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-terminal-persist.ts'), 'utf8');
    ok(/redactExtraArtifactForPersist\(input\.preCorrectionDraft\)/.test(persist), 'the draft must pass the R10 redactor');
    ok(/input\.preCorrectionDraft\.length > 0 && task\.type !== 'PIPELINE'/.test(persist), 'non-PIPELINE only');
    ok(/name: REQUIREMENTS_PRE_CORRECTION_ARTIFACT/.test(persist), 'artifact name from the shared constant');
    const results = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mcp', 'tasks', 'action', 'handlers', 'agent', 'agent-results-handler.ts'), 'utf8');
    // 1b (2026-10-12): the exclusion is a LIST (pre-correction + not-adopted correction), so a second operator artifact
    // cannot reach a reasoner through the lean card's ".md = report" picker or the verbose envelope.
    ok(/where: \{ name: \{ notIn: \[\.\.\.REQUIREMENTS_OPERATOR_ARTIFACTS\] \} \}/.test(results), 'agent.results must exclude every operator artifact at the select');
    const namesSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'requirements-artifact-names.ts'), 'utf8');
    ok(/REQUIREMENTS_OPERATOR_ARTIFACTS[^=]*= \[REQUIREMENTS_PRE_CORRECTION_ARTIFACT, REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT\]/.test(namesSrc), 'the exclusion list names both artifacts');
    ok(persist.includes('name: REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT') && /correctionNotAdoptedText[\s\S]{0,200}task\.type !== 'PIPELINE'/.test(persist), 'the not-adopted text is persisted as its own artifact, non-PIPELINE only');
    const chainer = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'context-chainer.ts'), 'utf8');
    ok(!chainer.includes('pre-correction') && !chainer.includes('REQUIREMENTS_PRE_CORRECTION_ARTIFACT'), 'the chainer must never read it');
    ok(!chainer.includes('correction-not-adopted') && !chainer.includes('REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT') && !chainer.includes('REQUIREMENTS_OPERATOR_ARTIFACTS'), 'the chainer must never read the not-adopted text');
    const names = require('../lib/agents/harness/requirements-artifact-names');
    ok(names.REQUIREMENTS_PRE_CORRECTION_ARTIFACT === 'requirements.pre-correction.md', 'name');
    const red = require('../lib/agents/harness/redact-artifact-secrets');
    const prev = process.env.ARTIFACT_SECRET_REDACT_ENABLED;
    delete process.env.ARTIFACT_SECRET_REDACT_ENABLED;
    try {
      const out = red.redactExtraArtifactForPersist('snmp-server community S3cr3t RO');
      ok(out.redactedCount >= 1 && out.text.includes('<<REDACTED-SECRET>>') && !out.text.includes('S3cr3t'), `redaction default-on: ${JSON.stringify(out)}`);
    } finally { if (prev === undefined) delete process.env.ARTIFACT_SECRET_REDACT_ENABLED; else process.env.ARTIFACT_SECRET_REDACT_ENABLED = prev; }
  });
  await test('BUDGET SKIP: watchdog time left cannot fit a re-emission → insufficient-time, ZERO calls, estimate stamped', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)], timeoutMs: 60_000 });
    ok(r.llmCalls.length === 0 && r.persisted.finalText === GEN9, `calls ${r.llmCalls.length}`);
    const c = rqOf(r).correction;
    ok(c.notAttemptedReason === 'insufficient-time' && c.timeBudget.estimatedMs > c.timeBudget.remainingMs, JSON.stringify(c));
  });
  await test('#90 DISQUALIFIER: an attempt spends the pass — 50-69 confidence afterwards makes NO #90 call (control: flag off → #90)', async () => {
    const low = (t: string) => t.replace(/Confidence: 82\s*$/, 'Confidence: 60');
    const a = await runCore({ text: low(GEN9), flag: true, llm: [resp(low(GEN9_TRIM))], withObservers: true });
    ok(a.llmCalls.length === 1 && !a.events.includes('diag-start'), `attempted: calls ${a.llmCalls.length} ${a.events.join('|')}`);
    const c = await runCore({ text: low(GEN9), llm: [resp(low(GEN9) + '\n')], withObservers: true });
    ok(c.llmCalls.length === 1 && c.events.includes('diag-start'), `control: #90 did not fire with the flag off (calls ${c.llmCalls.length})`);
    ok(rqOf(c).textSource === 'diagnostic-retry' && rqOf(c).correction.notAttemptedReason === 'flag-off', 'the #90 recount was not stamped');
  });
  await test('OBJECTIVE UNRESOLVED + flag ON → fact stamped unresolved, objective-unresolved, ZERO calls', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)],
      inputs: { objective: '', objectiveResolved: false, objectiveUnresolvedReason: 'no-owning-harness', harnessTaskId: null, ownerMap: null, ownerMapState: 'absent' } });
    const f = rqOf(r);
    ok(r.llmCalls.length === 0 && f.correction.notAttemptedReason === 'objective-unresolved' && f.inputs.objectiveUnresolvedReason === 'no-owning-harness', JSON.stringify(f.inputs));
  });
  await test('LLM THROW → non-fatal: original persisted, llm-error, reflectionErrors site requirements_form_correction', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [new Error('provider 529 overloaded')] });
    ok(r.persisted.finalText === GEN9 && rqOf(r).correction.notAdoptedReason === 'llm-error', JSON.stringify(rqOf(r).correction));
    const re = r.persisted.resultJson.toolLoop.reflectionErrors;
    ok(Array.isArray(re) && re[0].site === 'requirements_form_correction', JSON.stringify(re));
  });
  await test('#89 RAN / BUDGET-FLAGGED → not attempted with the flag ON, zero calls', async () => {
    const a = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)], loopOver: { correctionTurnUsed: true } });
    ok(a.llmCalls.length === 0 && rqOf(a).correction.notAttemptedReason === 'prior-pass-used:anti-fabrication', JSON.stringify(rqOf(a).correction));
    const b = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)], loopOver: { budgetFailFastUsed: true } });
    ok(b.llmCalls.length === 0 && rqOf(b).correction.notAttemptedReason === 'budget-flagged', JSON.stringify(rqOf(b).correction));
  });
  await test('NON-ELIGIBLE role (config_change_author / change_reviewer / requirements_reviewer) → no key, no resolver read, zero calls', async () => {
    for (const role of ['config_change_author', 'change_reviewer', 'requirements_reviewer']) {
      const r = await runCore({ text: GEN9, role, flag: true, llm: [resp(GEN9_TRIM)] });
      ok(r.llmCalls.length === 0 && r.resolverCalls === 0 && r.persisted.finalText === GEN9, `${role}: touched`);
      ok(!('requirementsFormCheck' in (r.persisted.resultJson.toolLoop ?? {})), `${role}: carries requirementsFormCheck`);
    }
  });
  await test('SOURCE PIN: the core reassigns the deliverable ONLY inside the adopted branch; the block sits before onStoringResults and #90', () => {
    const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
    const s = core.indexOf('// REQUIREMENTS FORM CHECK + CORRECTION');
    const st = core.indexOf('await observers.onStoringResults');
    const fc = core.indexOf('runFormCorrection({');
    const d = core.indexOf('runDiagnosticRetry({');
    ok(fc > 0 && fc < s && s < st && st < d, `order ${[fc, s, st, d].join(' < ')}`);
    const block = core.slice(s, st);
    const a0 = block.indexOf('if (_rq.stamp.correction.adopted === true) {');
    const adopted = block.slice(a0, block.indexOf('}', a0) + 1);
    ok(a0 > 0 && /finalResponse = _rq\.text;/.test(adopted) && /currentResponse = _rq\.currentResponse;/.test(adopted), 'adopted branch does not take the correction');
    const outside = block.replace(adopted, '').replace(/\/\/.*$/gm, '');
    for (const v of ['finalResponse', 'currentResponse']) ok(!new RegExp(`\\b${v}\\s*=(?!=)`).test(outside), `${v} assigned outside the adopted branch`);
    ok((core.match(/runRequirementsFormStep\(/g) ?? []).length === 1 && /enabled: isRequirementsFormCorrectionEnabled\(\),/.test(block), 'one call site; flag read via the helper, never a literal');
    ok(/formCorrectionAttempted = formCorrectionAttempted \|\| _rq\.attempted;/.test(block), '#90 disqualifier not taken from the step outcome');
  });
  await test('NOT end_turn deliverable → not-checked (nulls), zero calls', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [resp(GEN9_TRIM)], loopOver: { finalStopReason: 'max_tokens',
      currentResponse: { text: GEN9, stopReason: 'max_tokens', usage: {}, rawContentBlocks: [], metadata: {} } } });
    const f = rqOf(r);
    ok(r.llmCalls.length === 0 && f.checked === false && f.size === null && f.correction.notAttemptedReason === 'not-checked', JSON.stringify(f.correction));
  });

  // ══ Part 3 — the leg replay lab runs the SAME step ($0: scripted model) ═══════════════════════════════════════
  await test('LAB: runLive on a requirements_author prompt stamps requirementsFormCheck and runs the turn (flag ON) from snap.leg', async () => {
    loopMod.runAgenticToolLoop = realLoop; // Part 2 stubbed the loop; the lab must run the shipping one
    const { runLive } = require('./leg-replay-lab/live');
    const replies = [GEN9, GEN9_TRIM];
    const fake = async () => {
      const text = replies.shift() ?? GEN9;
      return { text, stopReason: 'end_turn', functionCalls: [], rawContentBlocks: [{ type: 'text', text }],
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, metadata: { model: 'claude-opus-5-5' } };
    };
    const p = { role: 'requirements_author', model: 'claude-opus-5-5', system: 'sys', systemBlocks: [], user: 'author the spec', tools: [], toolNames: [],
      fact: null, maxTokens: 64000, temperature: undefined, llmConfigSource: { model: 'claude-opus-5-5', maxTokens: 64000 }, maxToolTurns: 30,
      inputContextSource: 'none', hashes: {}, notes: [] };
    const prev = process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED;
    process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED = 'true';
    try {
      const a = await runLive(p, { executionId: 'lab-x', taskId: 'lab-t', taskType: 'ACTION', apiKey: 'sk-test-FAKE-lab',
        requirementsHarnessRow: { id: 'h', description: OBJ9, metadata: { requirementsRowItemMap: META_MAP } }, generateTextOverride: fake });
      const f = a.requirementsFormCheck;
      ok(f && f.checked, `lab fact unchecked: ${f?.reason}`);
      ok(f.inputs.ownerRowItemMap === 'present' && f.clauses.itemMapSource === 'owner-map', `lab inputs: ${JSON.stringify(f?.inputs)}`);
      ok(f.correction.attempted && f.correction.adopted && a.finalResponse === GEN9_TRIM, `lab correction: ${JSON.stringify(f.correction.notAdoptedReason ?? f.correction.notAttemptedReason)}`);
      ok(a.calls.map((c: { purpose: string }) => c.purpose).join(',') === 'loop,requirements-form-correction', a.calls.map((c: { purpose: string }) => c.purpose).join(','));
      delete process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED;
      replies.splice(0, replies.length, GEN9);
      const b = await runLive(p, { executionId: 'lab-y', taskId: 'lab-t', taskType: 'ACTION', apiKey: 'sk-test-FAKE-lab', requirementsHarnessRow: null, generateTextOverride: fake });
      ok(b.requirementsFormCheck.correction.notAttemptedReason === 'flag-off' && b.requirementsFormCheck.inputs.objective === 'unresolved' && b.calls.length === 1, 'lab flag-off');
    } finally {
      if (prev === undefined) delete process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED; else process.env.REQUIREMENTS_FORM_CORRECTION_ENABLED = prev;
    }
  });

  // ── G1 A (2026-10-10): the adoption PROBES, through the SHIPPING `runRequirementsFormCorrection` (frozen map,
  //    uncapped clause identity), on the VT-33 run-2 draft. P2–P4 are pinned ADOPTED on purpose — a known blind spot.
  const PR = require('./requirements-adoption-probes');
  for (const pr of PR.probes()) {
    await test(`ADOPTION PROBE ${pr.id} → ${pr.expectAdopted ? 'adopted' : `refused (${pr.expectReason})`}`, async () => {
      const inputs = { objective: PR.PROBE_OBJECTIVE, objectiveResolved: true, harnessTaskId: 'h',
        ownerMap: pr.ownerMap ? rq.parseOwnerRowItemMap(PR.PROBE_MAP).map : null, ownerMapState: pr.ownerMap ? 'present' : 'absent' };
      const original = PR.padded(PR.PROBE_DRAFT);
      const before = rq.computeRequirementsFormCheckStamp({ text: original, stopReason: 'end_turn', textSource: 'loop', inputs });
      ok(rq.failingTriggerChecks(before).includes('size'), 'the padded original must fail size');
      const r = await rq.runRequirementsFormCorrection({
        text: original, before, inputs, currentResponse: { text: original }, messageHistory: [],
        totalUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, prompt: 'p',
        normalizedLlmConfig: cfg, mcpFunctions: undefined, executionId: 'probe', userId: undefined, timeoutMs: 1000,
      }, { generateText: async () => ({ text: pr.corrected, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } }), logger: silent });
      ok(r.outcome.adoptionRuleVersion === 4, 'adoptionRuleVersion 4 stamped');
      ok(r.outcome.adopted === pr.expectAdopted, `adopted=${r.outcome.adopted} reason=${r.outcome.notAdoptedReason} regressed=${JSON.stringify(r.outcome.regressedMeasures)}`);
      if (pr.expectReason) ok(r.outcome.notAdoptedReason === pr.expectReason, `reason ${r.outcome.notAdoptedReason}`);
      ok(r.text === (pr.expectAdopted ? pr.corrected : original), 'persisted text = adopted correction, else the original');
    });
  }
  // ── G3 step 0 (2026-10-10): FULL-TEXT pins on the SHIPPING correction message, before any wording change ──────
  // ⚠️ ANY change to these hashes is a WORDING CHANGE to an agent-facing message. The live evidence for this text is the
  // VT-33 three-run test; the G3 batch changes it ONLY through the Protocol 16 lab (cline_docs/follow-ups/
  // m-b-correction-fidelity-paid-options-2026-10-10.md). Update a pin only with that lab's result recorded. Same
  // discipline as the terraform M2 pins (test:form-correction). The builder is pure: one hash per shape pins every byte.
  {
    const sha = (t: string) => require('crypto').createHash('sha256').update(t).digest('hex');
    const msg = (text: string, objective: string, map: any) => {
      const inputs = { objective, objectiveResolved: true, harnessTaskId: 'h', ownerMap: map, ownerMapState: map ? 'present' : 'absent' };
      const f = rq.computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'loop', inputs });
      return rq.buildRequirementsCorrectionPrompt(f, rfc.analyzeRequirementsForm({ draft: text, objective, ownerRowItemMapParsed: map }));
    };
    await test('PROMPT PIN: trial gen 9 as written (size over, its 3 restatements listed, Z17 excluded) message is byte-pinned', () => {
      const m = msg(GEN9_INVENTED, OBJ9, null);
      // Re-pinned 2026-10-12 (group 3a, owner decision 3a; Phase 4 DECISION-RECORD §12-13): the PROGRAM VIEW measure changed and
      // the fixture is gen 9 padded so it stays over the limit — no wording did. Rendered from the old and new code, the only
      // diff is four numbers: size 51,725 → 51,387 (1,725 → 1,387 over), owner section 3,738 → 231 (its not-applicable rows
      // leave the view), rationale 2,007 → 5,072 (the test's filler), reading notes 1,108 → 1,212 (one added sentence).
      // Re-pinned 2026-10-12 (group 4 / B-2, owner Q4; build commit G, lab-gated by cline_docs/reviews/group4-registry-batch-
      // 2026-10-12/LAB-PREREG.md before any push): no wording changed. Rendered from HEAD and G's code on the same fixture under
      // the same frozen registry, the only diff is one added numbered item — "2. Coverage: 3 findings against the decision
      // registry:" and the three lines "invented key restates item 18 / 21 / 21 — key it terraform-iac.item-<N>; id: …" —
      // because a restatement is Author-actionable since B-2 (it was the excluded "unknown key for a known token").
      // Re-pinned 2026-10-12 (R1 size-check half, owner decision R1; the Z48/3a precedent): no wording changed. The limit is
      // now the Program Architect's 64,000 and the fixture's pad 36 → 200 so it stays over. Rendered from HEAD 377d66e8 and
      // the new code under the same frozen registry (HEAD reproduced the old sha), the only diff is two lines of numbers:
      // size 51,387 / 50,000 / 1,387 over → 65,327 / 64,000 / 1,327 over, rationale 5,072 → 19,012 (the filler).
      ok(sha(m) === '93e165c88c930d6f39c5ffd23d9f52241b0c7767c25df1e094d03b2aeb788817', `message changed (sha ${sha(m)}, ${m.length} chars) — lab-gated; see the pin comment`);
    });
    await test('PROMPT PIN: VT-33 run-2 shape (size over + clause findings, owner map) message is byte-pinned', () => {
      const m = msg(PR.padded(PR.PROBE_DRAFT), PR.PROBE_OBJECTIVE, rq.parseOwnerRowItemMap(PR.PROBE_MAP).map);
      // Re-pinned 2026-10-10 (Z48 measure fix, owner decision (a) after lab L10): the CLAUSE FACT changed, no wording did —
      // rendered under the old and fixed scorer from the same builder, the only diff is the removed false-positive line
      // (item 13 "publishes them") and the counts 2/6 → 1/4. Record: cline_docs/reviews/z49-request-path-2026-10-10/LAB-RESULT.md.
      // Re-pinned 2026-10-12 (group 3a): numbers only — size 53,772 → 50,152 (still over), owner section 3,955 → 231,
      // reading notes 1,108 → 1,212. No wording changed.
      // Re-pinned 2026-10-12 (group 4 / B-2): no wording changed — the same diff as the gen 9 pin above: an added "2. Coverage:
      // 3 findings" item listing the restatements of items 13, 15, 20 (`kubernetes-gitops.writes`, `terraform-iac.policy-
      // managers-multiple`, `terraform-iac.tags`), and the clause item renumbered 2 → 3.
      // Re-pinned 2026-10-12 (R1): numbers only, same method as above — probe pad 70 → 230; size 50,152 / 50,000 / 152 over →
      // 65,323 / 64,000 / 1,323 over, rationale 7,986 → 23,157. No wording changed.
      ok(sha(m) === '269649e5e602df3e71e5874a91e268794c206beff1c9856068fda9f3af6175cc', `message changed (sha ${sha(m)}, ${m.length} chars) — lab-gated; see the pin comment`);
    });
    await test('Z49 CURRENT REGISTRY: a draft missing the request-path row gets an Author-actionable finding on the address-admitting leg, and it reaches the message', () => {
      registryCurrent();
      try {
        const map = rq.parseOwnerRowItemMap(PR.PROBE_MAP).map;
        const inputs = { objective: PR.PROBE_OBJECTIVE, objectiveResolved: true, harnessTaskId: 'h', ownerMap: map, ownerMapState: 'present' };
        const f = rq.computeRequirementsFormCheckStamp({ text: PR.PROBE_DRAFT, stopReason: 'end_turn', textSource: 'loop', inputs });
        const miss = f.coverage.errors.filter((e: any) => e.what === 'missing auth row' && e.key === 'request-path');
        ok(miss.some((e: any) => e.leg === 'terraform-iac'), `terraform-iac must be missing request-path: ${JSON.stringify(miss)}`);
        ok(f.coverage.authorActionableTotal >= 1, 'a missing row is the Author\'s to add (not registry-caused)');
        ok(msg(PR.PROBE_DRAFT, PR.PROBE_OBJECTIVE, map).includes('request-path'), 'the finding reaches the correction message');
      } finally { registryPreZ49(); }
    });
  }
  await test('G6: reflectionPassSpentBy precedence (#89 > form > requirements > #90), and at most ONE correction step per (role, type)', () => {
    const arts = require('../lib/services/execution-artifacts');
    const att = { correction: { attempted: true } }, no = { correction: { attempted: false } };
    ok(arts.reflectionPassSpentBy({}) === null, 'nothing spent');
    ok(arts.reflectionPassSpentBy({ correctionTurnUsed: true, formCheck: att, diagnosticRetryUsed: true }) === '#89', '#89 first');
    ok(arts.reflectionPassSpentBy({ formCheck: att, requirementsFormCheck: att }) === 'form-correction', 'form before requirements');
    ok(arts.reflectionPassSpentBy({ formCheck: no, requirementsFormCheck: att, diagnosticRetryUsed: false }) === 'requirements-form-correction', 'requirements');
    ok(arts.reflectionPassSpentBy({ formCheck: no, diagnosticRetryUsed: true }) === '#90', '#90 last');
    const pfc = require('../lib/agents/harness/package-form-check');
    const roles = ['config_change_author', 'requirements_author', 'change_reviewer', 'requirements_reviewer', 'artifact_harvester',
      'infra_change_architect', 'program_architect', 'technical_writer', 'data_analyst', null, ''];
    const types = ['ACTION', 'PIPELINE', 'APPROVAL', 'REVIEW', null];
    for (const role of roles) for (const type of types) {
      const n = [pfc.isFormCheckEligible(role, type), rfc.isRequirementsFormCheckEligible(role, type)].filter(Boolean).length;
      ok(n <= 1, `${role}/${type}: ${n} correction steps eligible — the run has ONE reflection pass`);
    }
  });
  await test('G5 endTime: the persisted duration INCLUDES the correction turn (a 1.2 s turn ⇒ executionTime ≥ 1200)', async () => {
    const r = await runCore({ text: GEN9, flag: true, llm: [{ ...resp(GEN9_TRIM), __delayMs: 1200 }] });
    ok(rqOf(r).correction.adopted === true, 'the turn ran');
    const et = r.persisted.resultJson.executionTime;
    ok(typeof et === 'number' && et >= 1200, `executionTime ${et} excludes the correction turn`);
    ok(r.persisted.endTime.getTime() - 1200 >= 0 && et >= rqOf(r).correction.durationMs, 'endTime taken after the cascade');
  });
  await test('G5 time gate: compared against min(time left, the 600 s turn cap) — a 650 s estimate with 700 s left is skipped', () => {
    const f = factOf(GEN9);
    const d = (remainingMs: number, estimatedMs: number) => rq.decideRequirementsFormCorrection({ fact: f, correctionTurnUsed: false, budgetFlagged: false,
      enabled: true, objectiveResolved: true, time: () => ({ remainingMs, estimatedMs, estimatedOutputTokens: 1, observedTps: 90 }) });
    const over = d(700_000, 650_000);
    ok(over.notAttemptedReason === 'insufficient-time' && over.timeBudget.boundMs === 600_000, JSON.stringify(over));
    const under = d(700_000, 590_000);
    ok(under.attempted === true && under.timeBudget.boundMs === 600_000, JSON.stringify(under));
    const tight = d(300_000, 310_000);
    ok(tight.notAttemptedReason === 'insufficient-time' && tight.timeBudget.boundMs === 300_000, JSON.stringify(tight));
  });
  await test('G5 abort fold: a thrown turn carrying partial usage folds it into the run total', async () => {
    const err: any = new Error('aborted'); err.usage = { inputTokens: 40, outputTokens: 60 };
    const r = await runCore({ text: GEN9, flag: true, llm: [err] });
    ok(rqOf(r).correction.notAdoptedReason === 'llm-error', 'llm-error');
    ok(r.finalUsage.inputTokens === 1040 && r.finalUsage.outputTokens === 560, `partial usage not folded: ${JSON.stringify(r.finalUsage)}`);
  });
  await test('G5 NO-GATE PIN: the correction facts are read only by their producers and the lean card — never by a gate', () => {
    // The anti-pattern "gating release on the turn's outcome" (pattern doc). A new reader of formCheck /
    // requirementsFormCheck must be a DECISION (add it here with its reason), never a drive-by. The lean card is allowed
    // because it TRANSCRIBES the terraform fact (and must never word `adopted` as "repaired"); requirements is not rendered.
    const { execSync } = require('child_process');
    const out: string = execSync(`grep -rlE "formCheck|requirementsFormCheck|FormCheck" lib app --include=*.ts --include=*.tsx --include=*.js || true`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    const files = out.split('\n').filter(Boolean).sort();
    const allowed = new Set([
      'lib/agents/harness/form-correction.ts', 'lib/agents/harness/package-form-check.ts',
      'lib/agents/harness/requirements-form-check.ts', 'lib/agents/harness/requirements-form-correction.ts',
      'lib/mcp/server/tools/advanced/lean-card-facts.js', 'lib/services/execution-artifacts.ts', 'lib/services/execution-core.ts',
    ]);
    const extra = files.filter((f) => !allowed.has(f));
    ok(extra.length === 0, `new reader(s) of the correction facts: ${extra.join(', ')} — decide and record before adding`);
    const card = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mcp', 'server', 'tools', 'advanced', 'lean-card-facts.js'), 'utf8');
    ok(!card.includes('requirementsFormCheck'), 'G5 card decision: the requirements fact is NOT rendered (reviewer-blind rule)');
    ok(!/repaired/i.test(card), 'the card never words `adopted` as "repaired"');
    // Rule 3 (2026-10-12, audit A7): the new fields (adoptionArm, clausesNewlyDropped, notAdoptedText) are read by no
    // gate and no card. The PUBLISH script reads the correction record for PROVENANCE and for the owner's correction
    // diff read (owner decision P2 = c', which triggers from the ARTIFACTS, not the fact) — it is Python, so this grep
    // of lib/app cannot see it; recorded here as a decision, not a drive-by.
    const g = execSync(`grep -rlE "adoptionArm|clausesNewlyDropped|notAdoptedText|qualityGate[^\\n]*correction" lib app --include=*.ts --include=*.tsx --include=*.js || true`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).split('\n').filter(Boolean);
    // execution-core.ts: reads the STEP result's `notAdoptedText` only to hand it to the persist (1b) — wiring, not a gate.
    const rule3Allowed = new Set(['lib/agents/harness/requirements-form-correction.ts', 'lib/services/execution-core.ts']);
    ok(g.every((f: string) => rule3Allowed.has(f)), `rule-3 fields read outside their producer: ${g.join(', ')}`);
    const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
    ok(!/adoptionArm|clausesNewlyDropped/.test(core), 'execution-core never reads the rule-3 decision fields');
  });
  await test('E3b + BUDGET (rule 3): the new fields survive the result.json summary NESTED, and a capped worst case stays under 16K', () => {
    const ea = require('../lib/services/execution-artifacts');
    const d = (i: number) => ({ item: i, leg: 'observability-config', clause: 'reports a gap naming what was absent on this leg exactly as stated by the owner', anchor: 'naming what', missing: ['naming what'] });
    const twelve = Array.from({ length: 12 }, (_, i) => d(i + 1));
    const base = factOf(GEN9);
    const fact = { ...base, correction: { attempted: true, adopted: true, adoptionRuleVersion: 3, adoptionArm: 'unwaivable-cleared',
      regressedMeasures: ['clauses', 'clausesNewlyDropped'], clearedChecks: ['size'], clausesNewlyDropped: twelve, clausesNewlyDroppedTotal: 12,
      before: { coverageErrors: base.coverage.errors, citationFindings: [], droppedClauses: twelve, lintHits: [] },
      after: { coverageErrors: base.coverage.errors, citationFindings: [], droppedClauses: twelve, lintHits: [] },
      preCorrection: { artifact: 'requirements.pre-correction.md', sha256: 'a'.repeat(64), chars: 51000, redactedCount: 0 },
      notAdoptedText: { artifact: 'requirements.correction-not-adopted.md', sha256: 'b'.repeat(64), chars: 43000, redactedCount: 0 } } };
    const picked = ea.pickResultJsonSummary({ toolLoop: { requirementsFormCheck: fact } });
    const c = picked?.toolLoop?.requirementsFormCheck?.correction;
    ok(c && c.adoptionArm === 'unwaivable-cleared' && c.clausesNewlyDropped.length === 12 && c.clearedChecks[0] === 'size'
      && c.notAdoptedText.artifact === 'requirements.correction-not-adopted.md', 'nested rule-3 fields survive pickResultJsonSummary');
    const bytes = JSON.stringify(fact).length;
    ok(bytes < 16_000, `worst-case rule-3 fact is ${bytes} chars — keep it under the head-slice budget`);
  });
  await test('FROZEN MAP: the re-check keeps the ORIGINAL row↔item map (no owner map + a deleted row keeps its obligation)', () => {
    const inputs = { objective: PR.PROBE_OBJECTIVE, objectiveResolved: true, harnessTaskId: 'h', ownerMap: null, ownerMapState: 'absent' };
    const original = PR.padded(PR.PROBE_DRAFT);
    // Z48 fix (2026-10-10): P5 deletes item 13's row, whose only obligation ("publishes them") is a pronoun object and is
    // correctly no longer anchored, so it no longer exercises the frozen map. Item 20's rows carry two checkable
    // obligations ("names this effect…", "lists the existing statements…"): delete those rows instead. P5 itself is a
    // pre-registered probe and is unchanged (still refused, on citations).
    const p5 = original.split('\n').filter((l: string) => !/^\| terraform-iac\.(collateral|tags) \|/.test(l)).join('\n');
    const a0 = rfc.analyzeRequirementsForm({ draft: original, objective: PR.PROBE_OBJECTIVE });
    const thawed = rq.computeRequirementsFormCheckStamp({ text: p5, stopReason: 'end_turn', textSource: 'requirements-form-correction', inputs });
    const frozen = rq.computeRequirementsFormCheckStamp({ text: p5, stopReason: 'end_turn', textSource: 'requirements-form-correction', inputs,
      frozenRowItemMap: { map: a0.rowItemMap, source: a0.itemMapSource } });
    ok(frozen.clauses.itemMapSource === 'draft-citations', `source still named: ${frozen.clauses.itemMapSource}`);
    ok(frozen.clauses.checked > thawed.clauses.checked, `frozen keeps the deleted row's obligation: frozen ${frozen.clauses.checked} vs thawed ${thawed.clauses.checked}`);
  });
  await test('ADOPTION RULE v2 units: no-fall denominators, all coverage guarded, clause identity swap refused', () => {
    const base = factOf(GEN9);
    const mk = (o: any) => ({ ...base, ...o });
    const run = (b: any, a: any, extra: any = {}) => rq.checkRequirementsCorrectionAdoption({ original: GEN9, corrected: GEN9, stopReason: 'end_turn', before: b, after: a, ...extra });
    const fixedSize = { ...base.size, headroom: 10 };
    const r1 = run(base, mk({ size: fixedSize, citations: { ...base.citations, total: base.citations.total - 1 } }));
    ok(!r1.adopted && r1.regressedMeasures.includes('citationsTotal'), `citations.total fell: ${JSON.stringify(r1)}`);
    const r2 = run(base, mk({ size: fixedSize, coverage: { ...base.coverage, errorsTotal: base.coverage.errorsTotal + 1 } }));
    ok(!r2.adopted && r2.regressedMeasures.includes('coverageErrorsTotal'), `registry-shaped finding added: ${JSON.stringify(r2)}`);
    const d = (item: number) => ({ item, leg: 'terraform-iac', clause: `c${item}`, anchor: 'a', missing: ['w'] });
    // Rule 3 (2026-10-12): a swap that rides a CLEARED size failure is the unwaivable-cleared arm — adopted, the
    // regression kept on the record, the new flag listed for the enforced publish read.
    const r3 = run(base, mk({ size: fixedSize }), { droppedBefore: [d(1)], droppedAfter: [d(2)] });
    ok(r3.adopted && r3.adoptionArm === 'unwaivable-cleared' && r3.regressedMeasures.includes('clausesNewlyDropped')
      && r3.clausesNewlyDropped.length === 1 && r3.clearedChecks.includes('size'), `v3: a swap on a cleared size failure adopts: ${JSON.stringify(r3)}`);
    const r4 = run(base, mk({ size: fixedSize }), { droppedBefore: [d(1)], droppedAfter: [d(1)] });
    ok(r4.adopted && r4.adoptionArm === 'no-regression', `size-only repair with the same dropped clause still adopts: ${JSON.stringify(r4)}`);
  });
  await test('ADOPTION RULE v3 (owner P1 = C): the unwaivable-cleared arm, both directions', () => {
    const base = factOf(GEN9);   // size over (padded gen 9), no dropped clause
    const mk = (o: any) => ({ ...base, ...o });
    const run = (b: any, a: any, extra: any = {}) => rq.checkRequirementsCorrectionAdoption({ original: GEN9, corrected: GEN9, stopReason: 'end_turn', before: b, after: a, ...extra });
    const d = (item: number) => ({ item, leg: 'terraform-iac', clause: `c${item}`, anchor: 'a', missing: ['w'] });
    const cleared = { ...base.size, headroom: 10 };
    const improvedOnly = { ...base.size, headroom: -100 };
    const flagged = (n: number) => ({ ...base.clauses, droppedTotal: n, dropped: Array.from({ length: n }, (_, i) => d(i + 2)) });
    // count may RISE (0 → 1): the case group 2 makes common — adopted
    const a1 = run(base, mk({ size: cleared, clauses: flagged(1) }));
    ok(a1.adopted && a1.adoptionArm === 'unwaivable-cleared' && a1.regressedMeasures.join(',') === 'clauses,clausesNewlyDropped', `0→1 on cleared size adopts: ${JSON.stringify(a1)}`);
    // at most ONE new flag (K = 1)
    const r1 = run(base, mk({ size: cleared, clauses: flagged(2) }));
    ok(!r1.adopted && r1.notAdoptedReason === 'regressed' && r1.clausesNewlyDropped.length === 2, `2 new flags refused: ${JSON.stringify(r1)}`);
    // CLEARED, never merely improved
    const r2 = run(base, mk({ size: improvedOnly, clauses: flagged(1) }));
    ok(!r2.adopted && r2.notAdoptedReason === 'regressed', `size improved but not cleared, plus a new flag, refused: ${JSON.stringify(r2)}`);
    // any OTHER regression refuses: citations fall, lint rises
    const r3 = run(base, mk({ size: cleared, clauses: flagged(1), citations: { ...base.citations, total: base.citations.total - 1 } }));
    ok(!r3.adopted && r3.regressedMeasures.includes('citationsTotal'), `citations fell: ${JSON.stringify(r3)}`);
    const r4 = run(base, mk({ size: cleared, clauses: flagged(1), lint: { ...base.lint, hitsTotal: base.lint.hitsTotal + 1 } }));
    ok(!r4.adopted && r4.regressedMeasures.includes('lint'), `lint rose: ${JSON.stringify(r4)}`);
    // the arm needs an UNWAIVABLE failure: a residue repair alongside a new flag is refused (residue is not in the set)
    const resBefore = mk({ size: cleared, residue: { ...base.residue, placeholders: 1 } });
    const r5 = run(resBefore, mk({ size: cleared, clauses: flagged(1), residue: { ...base.residue, placeholders: 0 } }));
    ok(!r5.adopted && r5.notAdoptedReason === 'regressed', `residue repair + new flag refused: ${JSON.stringify(r5)}`);
    // the set is closed: size only
    ok(JSON.stringify(rq.REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS) === '["size"]' && rq.REQUIREMENTS_ADOPTION_MAX_NEW_CLAUSE_FLAGS === 1
      && rq.REQUIREMENTS_ADOPTION_RULE_VERSION === 4, 'constants');
  });
  // Z66 (2026-10-12): attempt 2's correction (prod cmv4v3b2w0024yx9kl3xb9fg3) re-keyed six restating rows to
  // `<token>.item-<N>` and merged the two item-6 rows into one; rule 3 refused it (citationsTotal 27 → 26). Rule 4 guards
  // citations by identity on (scope, item), so the merge is neutral and a dropped or de-verbatimed citation still refuses.
  await test('ADOPTION RULE v4 (Z66): a merge of two rows citing one item adopts; a lost or non-verbatim citation still refuses', () => {
    const W = path.join(__dirname, '..', '.claude', 'skills', 'requirements-spec', 'work', 'telemetry-collector-namespace-senders-2026-10-11');
    const D = path.join(W, 'draft-answered3');
    const objective = fs.readFileSync(path.join(D, 'objective.txt'), 'utf8');
    const original = fs.readFileSync(path.join(D, 'requirements.pre-correction.md'), 'utf8');
    const corrected = fs.readFileSync(path.join(D, 'requirements.correction-not-adopted.md'), 'utf8');
    registryCurrent();   // the fixture postdates group 4 (enforcer-scope); restored to the frozen registry below
    try {
      const parsed = rq.parseOwnerRowItemMap(JSON.parse(fs.readFileSync(path.join(W, 'row-item-map.json'), 'utf8')));
      ok(parsed.state === 'present', `owner map: ${parsed.state}`);
      const inputs = { objective, objectiveResolved: true, harnessTaskId: 'h', ownerMap: parsed.map, ownerMapState: 'present' };
      const before = rq.computeRequirementsFormCheckStamp({ text: original, stopReason: 'end_turn', textSource: 'loop', inputs });
      const a0 = rfc.analyzeRequirementsForm({ draft: original, objective, ownerRowItemMapParsed: parsed.map });
      const frozenRowItemMap = { map: a0.rowItemMap, source: a0.itemMapSource };
      const decide = (text: string, identity = true) => {
        const after = rq.computeRequirementsFormCheckStamp({ text, stopReason: 'end_turn', textSource: 'requirements-form-correction', inputs, frozenRowItemMap });
        const a1 = rfc.analyzeRequirementsForm({ draft: text, objective, frozenRowItemMap });
        return rq.checkRequirementsCorrectionAdoption({ original, corrected: text, stopReason: 'end_turn', before, after,
          droppedBefore: a0.clauses.dropped, droppedAfter: a1.clauses.dropped,
          ...(identity ? { citedBefore: a0.citations.cited, citedAfter: a1.citations.cited } : {}) });
      };
      // the stored measures reproduce (the fixture is the refused correction itself)
      const mb = rq.requirementsMeasures(before);
      ok(mb.coverage === 6 && mb.citationsTotal === 27 && mb.citationsVerbatim === 27, `before: ${JSON.stringify(mb)}`);
      // (a) the attempt-2 shape ⇒ ADOPTED, and under the rule-3 count guard it is the stored refusal
      const a = decide(corrected);
      ok(a.adopted && a.adoptionArm === 'no-regression' && !a.regressedMeasures && a.improvedChecks.join(',') === 'coverage'
        && a.measuresAfter.citationsTotal === 26 && a.measuresAfter.coverage === 0, `(a) merge adopts: ${JSON.stringify({ ...a, measuresAfter: undefined })}`);
      const legacy = decide(corrected, false);
      ok(!legacy.adopted && legacy.regressedMeasures.join(',') === 'citationsTotal,citationsVerbatim', `rule-3 count guard: ${JSON.stringify(legacy.regressedMeasures)}`);
      // (b) the merged row's item-6 citation removed (the row's source cell keeps the word, so it stays a declared row)
      const item6Row = /^\| kubernetes-gitops\.item-6 \|.*$/m;
      ok(item6Row.test(corrected), 'fixture carries the merged item-6 row');
      const dropped = corrected.replace(item6Row, (l) => l.replace(/\(declared — item 6: "[^"]*"\)/, '(declared)'));
      const b = decide(dropped);
      ok(!b.adopted && b.notAdoptedReason === 'regressed' && b.regressedMeasures.includes('citationsNewlyUncited'), `(b) item 6 uncited: ${JSON.stringify(b.regressedMeasures)}`);
      // (c) the merged row's quote made non-verbatim
      const bent = corrected.replace(item6Row, (l) => l.replace('Nothing maintains the set after the program")', 'Nothing maintains the set after the program ends")'));
      ok(bent !== corrected, 'fixture edit (c) applied');
      const c = decide(bent);
      ok(!c.adopted && c.notAdoptedReason === 'regressed' && c.regressedMeasures.includes('citationsNewlyNotVerbatim')
        && c.regressedMeasures.includes('citations'), `(c) non-verbatim: ${JSON.stringify(c.regressedMeasures)}`);
      // Z66 review F1: half of item 6 dropped while another quote of item 6 stays in the leg. "Nothing maintains the set
      // after the program" is not a clause-checked obligation, so only the covered-words guard sees it.
      const currencyRow = '| kubernetes-gitops.currency | as of when the sender set is valid | — | point-in-time as of the leg\'s harvest; the deliverable states the harvest time | (declared — item 6: "The sender set is point-in-time as of the leg\'s harvest; the deliverable states the harvest time") |';
      const n3 = corrected.replace(item6Row, currencyRow);   // N3: .maintenance deleted outright, .currency kept
      const n1b = corrected.replace(item6Row, currencyRow.replace('kubernetes-gitops.currency', 'kubernetes-gitops.item-6'));   // N1b: merged row keeps only the first half
      const bodyLine = 'The deliverable states the harvest time, and states that nothing maintains the set after the program (`kubernetes-gitops.item-6`).';
      ok(corrected.includes(bodyLine), 'fixture carries the item-6 body sentence');
      const n1 = n1b.replace(bodyLine, 'The deliverable states the harvest time (`kubernetes-gitops.item-6`).');   // N1: and the body loses it
      ok(!/nothing maintains the set/i.test(n1), 'N1: the half appears nowhere');
      for (const [id, t] of [['N1', n1], ['N1b', n1b], ['N3', n3]] as const) {
        const r = decide(t);
        ok(!r.adopted && r.notAdoptedReason === 'regressed' && r.regressedMeasures.includes('citationsNarrowed'), `${id} refused, narrowed: ${JSON.stringify(r.regressedMeasures ?? r.notAdoptedReason)}`);
      }
    } finally { registryPreZ49(); }
  });
  await test('ADOPTION RULE v4 units: identity on (scope, item, covered words) — duplicates collapse, a swap, a move or a narrowing regresses', () => {
    const u = (item: number, scope: string, verbatim = true) => ({ item, scope, verbatim });
    const R = rq.citationIdentityRegressions;
    ok(R([u(6, 'row:k'), u(6, 'row:k')], [u(6, 'row:k')]).length === 0, 'two cites of one item in one scope → one: neutral');
    ok(R([u(6, 'row:k'), u(6, 'row:k', false)], [u(6, 'row:k')]).length === 0, 'the non-verbatim duplicate removed: neutral');
    ok(R([u(6, 'row:k')], [u(7, 'row:k')]).join() === 'citationsNewlyUncited', 'a swap (6 → 7) regresses');
    ok(R([u(6, 'row:k')], [u(6, 'row:o')]).join() === 'citationsNewlyUncited', 'a move to another leg regresses');
    ok(R([u(6, 'row:k'), u(6, 'section:P1')], [u(6, 'row:k')]).join() === 'citationsNewlyUncited', 'a prose cite lost while the row keeps it regresses');
    ok(R([u(6, 'row:k')], [u(6, 'row:k', false)]).join() === 'citationsNewlyNotVerbatim', 'verbatim → not');
    ok(R([u(6, 'row:k', false)], [u(6, 'row:k', false)]).length === 0, 'non-verbatim stays non-verbatim: not this guard (the citations check counts it)');
    // covered words (Z66 review F1): the UNION per (scope, item) may not shrink
    const w = (item: number, scope: string, words: [number, number]) => ({ item, scope, verbatim: true, words });
    ok(R([w(6, 'row:k', [0, 5]), w(6, 'row:k', [5, 4])], [w(6, 'row:k', [0, 9])]).length === 0, 'two quotes merged into one spanning both: neutral');
    ok(R([w(6, 'row:k', [0, 9])], [w(6, 'row:k', [0, 5]), w(6, 'row:k', [5, 4])]).length === 0, 'one quote split across two: neutral (the union)');
    ok(R([w(6, 'row:k', [0, 5]), w(6, 'row:k', [5, 4])], [w(6, 'row:k', [0, 5])]).join() === 'citationsNarrowed', 'half the item dropped: narrowed');
    ok(R([w(6, 'row:k', [0, 9])], [w(6, 'row:k', [0, 9]), u(6, 'row:k', false)]).length === 0, 'an extra non-verbatim cite adds no coverage and removes none');
    ok(JSON.stringify(rq.CITATION_IDENTITY_REGRESSIONS) === '["citationsNewlyUncited","citationsNewlyNotVerbatim","citationsNarrowed"]', 'markers');
    // the scope of a table row is its leg token; a prose cite is its section
    const cr = require('../lib/agents/harness/requirements-citations').checkCitations(
      '1. Alpha beta gamma.\n2. Delta epsilon.\n',
      '## Design decisions\n\n| id | q | o | a | source |\n|---|---|---|---|---|\n| `kubernetes-gitops.item-1` | q | — | a | (declared — item 1: "Alpha beta") |\n\n## Pipeline 1 objective — x\n\nSee (declared — item 2: "Delta epsilon").\n');
    ok(JSON.stringify(cr.cited) === JSON.stringify([w(1, 'row:kubernetes-gitops', [0, 2]), w(2, 'section:Pipeline 1 objective — x', [0, 2])]), `scopes + words: ${JSON.stringify(cr.cited)}`);
    ok(cr.total === cr.cited.length && cr.verbatim === cr.cited.filter((x: any) => x.verbatim).length, 'cited agrees with the counts');
  });
  await test('CROSS-FILE PIN: each unwaivable check is a no-recourse STOP in the publish script, and the clause key matches', () => {
    const py = fs.readFileSync(path.join(__dirname, 'publish-generated-spec.py'), 'utf8');
    const m = /^NON_WAIVABLE = \(([^)]*)\)/m.exec(py);
    ok(m, 'publish-generated-spec.py declares NON_WAIVABLE');
    const pySet = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    ok(JSON.stringify(pySet) === JSON.stringify([...rq.REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS]), `sets differ: py ${pySet} vs ts ${rq.REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS}`);
    // Checker fix 2 review (2026-10-12): keyed by item:leg:anchor, so one read dismisses one flag.
    ok(/def clause_key\(d\):\s*\n\s*return f"\{d\['item'\]\}:\{d\['leg'\]\}:\{d\['anchor'\]\}"/.test(py), 'the publish read keys a clause by item:leg:anchor');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
