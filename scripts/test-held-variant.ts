#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B V-5 — the variant predicate, the leaf→leg resolution and (as they land) the step, the
 * registry's NOT_STAMPED arm, the persist pick and the nets. Plan STAGE-B-PLAN.md v4.1 §3 V-5. CI-safe: stubs, no DB.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import {
  HELD_VARIANT_PROTOCOL, HELD_VARIANT_TOKEN, HELD_CAPABLE_PROTOCOLS, isHeldCapableProtocol, isHeldCapableLeg, resolveOwningLegProtocol,
  owningLegMemo, heldBindingState,
  GIT_FILE_SOURCE_PROTOCOLS,
} from '../lib/agents/harness/held-bytes/variant';
import { runEditApplicationStep, recountEditApplication, resolveHeldFilesFromStore, arbitrateReflectionPass, type ResolveHeldFiles } from '../lib/services/held-edit-step';
import { buildView } from '../lib/agents/harness/held-bytes/view';
import { R9_VERSION } from '../lib/agents/harness/sanitize-chained-output';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { decideEditCorrection, buildEditCorrectionPrompt, checkEditCorrectionAdoption, runEditCorrectionTurn, EDIT_CORRECTION_INTENT, foldMachineHeadingTitle } from '../lib/agents/harness/held-edit-correction';
import { computeEditApplication, AUTHOR_CORRECTABLE } from '../lib/agents/harness/held-bytes/apply';
import { reflectionPassSpentBy, buildExecutionResultJson } from '../lib/services/execution-artifacts';
import { buildEditApplicationFact, candidateSetDigest8, EDIT_FACT_MAX } from '../lib/agents/harness/held-bytes/edit-fact';
import { PLATFORM_STATE } from '../lib/agents/harness/held-bytes/apply';
import { buildEditApplicationManifest, EDIT_APPLICATION_MANIFEST_NAME } from '../lib/agents/harness/held-bytes/edit-manifest';
import { buildHeldBytesManifest, HELD_BYTES_MANIFEST_NAME } from '../lib/agents/harness/held-bytes/held-bytes-fact';
import { prepareHeldPackage } from '../lib/services/held-package';
import { validateHeldRow } from '../lib/services/held-bytes-store';

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
export const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

// ── V-5a ──
test('V-5a: HELD_VARIANT_PROTOCOL is the canonical long form of the variant token (a literal mutation is RED)', () => {
  eq(HELD_VARIANT_TOKEN, 'observability-config-held'); eq(HELD_VARIANT_PROTOCOL, 'observability-config-held-protocol');
});

test('Phase 10 W1 + panel D4 + held-k8s step 3 + held-terraform step 3 + held-network push 3: HELD_CAPABLE_PROTOCOLS is exactly obs + kubernetes-gitops + terraform-iac + network-provisioning, canonical form (the retired token is NOT a member; a domain joins only on a file source — PH-11)', () => {
  eq([...HELD_CAPABLE_PROTOCOLS].sort(), ['kubernetes-gitops-protocol', 'network-provisioning-protocol', 'observability-config-protocol', 'terraform-iac-protocol']);
});

test('Phase 10 W1 + D4: isHeldCapableProtocol — obs, short and long; the RETIRED token, other domains, null, empty, a near-name false', () => {
  for (const n of ['observability-config', 'observability-config-protocol', 'kubernetes-gitops', 'kubernetes-gitops-protocol', 'terraform-iac', 'terraform-iac-protocol', 'network-provisioning', 'network-provisioning-protocol']) ok(isHeldCapableProtocol(n), n);
  for (const n of ['observability-config-held', 'observability-config-held-protocol', 'network-derivation', 'network-derivation-protocol', null, undefined, '', 'observability-config-held-lite', 'observability-configs']) ok(!isHeldCapableProtocol(n as never), String(n));
});

test('Phase 10 W1: isHeldCapableLeg — the stamp wins; title fallback only when the key is absent; a present-null stamp is NOT held-capable', () => {
  ok(!isHeldCapableLeg({ title: 'x (protocol: observability-config-held)' }), 'D4: the retired token is not held-capable (base-only leg)');
  ok(isHeldCapableLeg({ title: 'x (protocol: observability-config)' }), 'obs title fallback (the fold)');
  ok(isHeldCapableLeg({ title: 'x', metadata: { protocol: 'observability-config-protocol' } }), 'obs stamp');
  ok(!isHeldCapableLeg({ title: 'x (protocol: observability-config)', metadata: { protocol: null } }), 'present-null key is authoritative');
  ok(!isHeldCapableLeg({ title: 'x (protocol: network-derivation)' }), 'another domain');
  ok(!isHeldCapableLeg({ title: 'x', metadata: { protocol: 'network-derivation-protocol' } }), 'another domain stamp');
});

type Row = Record<string, unknown> | null;
function stubDb(tasks: Record<string, Row>, stages: Record<string, Row>, throwOn?: 'task' | 'stage') {
  const reads: string[] = [];
  return {
    reads,
    db: {
      task: { findUnique: async (a: { where: { id: string } }) => { reads.push(`task:${a.where.id}`); if (throwOn === 'task') throw new Error('x'); return tasks[a.where.id] ?? null; } },
      stage: { findUnique: async (a: { where: { id: string } }) => { reads.push(`stage:${a.where.id}`); if (throwOn === 'stage') throw new Error('x'); return stages[a.where.id] ?? null; } },
    },
  };
}

test('V-5a: resolveOwningLegProtocol — a present-null LEAF under a held-capable leg ⇒ heldCapable; the leaf\'s stage_id is READ, not threaded', async () => {
  const s = stubDb({ leaf: { stageId: 'st1' }, leg: { title: 'L (protocol: observability-config)', metadata: { protocol: 'observability-config-protocol' } } },
    { st1: { metadata: { harnessTaskId: 'leg' } } });
  eq(await resolveOwningLegProtocol(s.db, { id: 'leaf', type: 'ACTION', metadata: { protocol: null } }), { kind: 'leg', legId: 'leg', heldCapable: true, ownStageId: 'st1', gitFileSource: false, deviceSource: false });
  eq(s.reads, ['task:leaf', 'stage:st1', 'task:leg']);
});

test('held-k8s 1b-scope + step 3: a leaf under a kubernetes-gitops leg ⇒ gitFileSource true AND held-capable (the join); held-terraform step 3: a terraform leg ⇒ git-file-source AND held-capable (the join); obs ⇒ held-capable, not a git file source', async () => {
  const k = stubDb({ leaf: { stageId: 'st1' }, leg: { title: 'L (protocol: kubernetes-gitops)', metadata: { protocol: 'kubernetes-gitops-protocol' } } },
    { st1: { metadata: { harnessTaskId: 'leg' } } });
  eq(await resolveOwningLegProtocol(k.db, { id: 'leaf', type: 'ACTION' }), { kind: 'leg', legId: 'leg', heldCapable: true, ownStageId: 'st1', gitFileSource: true, deviceSource: false });
  eq(await resolveOwningLegProtocol(stubDb({}, {}).db, { id: 'L', type: 'PIPELINE', title: 'x (protocol: kubernetes-gitops)' }), { kind: 'self', legId: 'L', heldCapable: true, gitFileSource: true, deviceSource: false });
  eq(await resolveOwningLegProtocol(stubDb({}, {}).db, { id: 'L', type: 'PIPELINE', title: 'x (protocol: terraform-iac)' }), { kind: 'self', legId: 'L', heldCapable: true, gitFileSource: true, deviceSource: false });
  eq([...GIT_FILE_SOURCE_PROTOCOLS], ['kubernetes-gitops-protocol', 'terraform-iac-protocol', 'network-provisioning-protocol']);
  // held-network step 3 batch 2b: a network leg declares Device sources (deviceSource true); push 3 (the join text): it is held-capable.
  eq(await resolveOwningLegProtocol(stubDb({}, {}).db, { id: 'L', type: 'PIPELINE', title: 'x (protocol: network-provisioning)' }), { kind: 'self', legId: 'L', heldCapable: true, gitFileSource: true, deviceSource: true });
});

test('V-5a: a PIPELINE task is its own leg (no read); no stage / no harnessTaskId ⇒ no-leg (positive non-variant)', async () => {
  const none = stubDb({}, {});
  eq(await resolveOwningLegProtocol(none.db, { id: 'L', type: 'PIPELINE', title: 'x (protocol: observability-config)' }), { kind: 'self', legId: 'L', heldCapable: true, gitFileSource: false, deviceSource: false });
  eq(none.reads, []);
  eq((await resolveOwningLegProtocol(stubDb({ leaf: { stageId: null } }, {}).db, { id: 'leaf', type: 'ACTION' })).kind, 'no-leg');
  eq(await resolveOwningLegProtocol(stubDb({ leaf: { stageId: 'st' } }, { st: { metadata: {} } }).db, { id: 'leaf', type: 'ACTION' }),
    { kind: 'no-leg', reason: 'no-harness-task-id', heldCapable: false });
});

test('V-5a: a thrown read or a harnessTaskId naming a missing row ⇒ could-not-check (never non-variant)', async () => {
  eq((await resolveOwningLegProtocol(stubDb({ leaf: { stageId: 'st' } }, { st: { metadata: { harnessTaskId: 'gone' } } }).db, { id: 'leaf' })).kind, 'could-not-check');
  eq(await resolveOwningLegProtocol(stubDb({}, {}, 'stage').db, { id: 'leaf' }), { kind: 'could-not-check', reason: 'task-row-missing', heldCapable: false });
  eq(await resolveOwningLegProtocol(stubDb({ leaf: { stageId: 'st' } }, {}, 'stage').db, { id: 'leaf' }), { kind: 'could-not-check', reason: 'read-threw', heldCapable: false });
});

test('V-5a / A6: the memo returns a primed answer without reading, else resolves ONCE however often it is asked', async () => {
  const s = stubDb({ leaf: { stageId: 'st' } }, { st: { metadata: {} } });
  const primed = owningLegMemo(s.db, { id: 'leaf' }, { kind: 'leg', legId: 'L', heldCapable: true, ownStageId: 'st' });
  eq((await primed()).kind, 'leg'); eq(s.reads, []);
  const lazy = owningLegMemo(s.db, { id: 'leaf' });
  await Promise.all([lazy(), lazy(), lazy()]); eq(s.reads.length, 2, 'one resolution: ');
});

test('Phase 10 W1 + D4: heldBindingState — not held-capable ⇒ null; leaf on obs ⇒ null (the fold); leaf on the retired token ⇒ binding-mismatch; another domain / none ⇒ binding-mismatch; degraded ⇒ variant-protocol-not-injected (stamped vocabulary kept)', () => {
  eq(heldBindingState(false, { protocolNames: [] }), null);
  eq(heldBindingState(true, { protocolNames: ['observability-config-protocol'] }), null);
  eq(heldBindingState(true, { protocolNames: ['observability-config-held-protocol'] }), 'binding-mismatch'); // D4: the retired token binds nothing held
  eq(heldBindingState(true, { protocolNames: ['network-derivation-protocol'] }), 'binding-mismatch');
  eq(heldBindingState(true, null), 'binding-mismatch');
  eq(heldBindingState(true, { protocolNames: ['observability-config-protocol'], degraded: 'PROTOCOL_LOAD_DB_ERROR' }), 'variant-protocol-not-injected');
});

test('Phase 10 panel D3(b): a held-file-written-whole refusal ⇒ NO correction turn (not-correctable), even beside a correctable refusal; no BY-REFERENCE group', () => {
  const base = { version: 1, applied: 0, total: 1, refused: {}, refusedTotal: 2, files: [], rollback: [], editsOutsideSection: 0, restoreOutsideRollback: 0, blocksTotal: 1, rollbackRestores: 0, candidateFiles: 0 };
  const app = { ...base, state: 'refused', refusals: [{ block: null, handle: 'H1', name: 'held-file-written-whole' }, { block: 1, handle: 'H1', name: 'search-not-found' }] } as any;
  const d = decideEditCorrection({ application: app, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false, enabled: true, time: () => { throw new Error('time must not be asked'); } });
  eq([d.attempted, d.notAttemptedReason], [false, 'not-correctable']);
  ok(!Object.values(EDIT_CORRECTION_INTENT).includes('BY-REFERENCE' as never) && !('held-file-written-whole' in EDIT_CORRECTION_INTENT), 'no BY-REFERENCE group');
  const only = { ...base, refusedTotal: 1, state: 'refused', refusals: [{ block: 1, handle: 'H1', name: 'search-not-found' }] } as any;
  ok(decideEditCorrection({ application: only, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false, enabled: false, time: () => ({ remainingMs: 1, estimatedMs: 0 } as any) }).notAttemptedReason === 'flag-off', 'control: an ordinary correctable refusal still reaches the later gates');
});

// ── V-5c: the step ──
const BASE = 'receivers:\n  otlp:\n    protocols:\n      grpc:\n        endpoint: 0.0.0.0:4317\n';
const VIEW = (() => { const v = buildView(BASE, R9_VERSION); if (!v.ok) throw new Error('view'); return v; })();
const ITEM = { handle: 'H1', path: '/etc/otelcol/config.yaml', lineCount: VIEW.lineCount, refId: 'crefA', harvesterExecutionId: 'cexecH',
  r9Version: R9_VERSION, viewVersion: VIEW.viewVersion, viewText: VIEW.viewText, rewrittenLines: VIEW.rewrittenLines };
const ctxWith = (items: unknown[], extraEntries = 0) => ({ chainedFrom: [{ taskId: 'h', heldView: items },
  ...Array.from({ length: extraEntries }, () => ({ taskId: 'h2', heldView: [] }))] });
const FR = ['## Held File Edits', '<<<<<<< SEARCH H1', '      grpc:', '        endpoint: 0.0.0.0:4317', '=======', '      grpc:',
  '        endpoint: 127.0.0.1:4317', '>>>>>>> REPLACE', '## Held File Rollback', 'restore H1'].join('\n');
const LEG = { kind: 'leg' as const, legId: 'cleg', heldCapable: true, ownStageId: 'cstage' };
const PI = { protocolNames: ['observability-config-protocol'] }; // Phase 10: a held leaf runs on obs
const memResolver: ResolveHeldFiles = async (items) => ({
  files: items.map((i) => ({ handle: i.handle, path: i.path, state: 'rendered' as const, baseText: BASE, viewText: VIEW.viewText, rewrittenLines: VIEW.rewrittenLines, redactorVersion: 'paichart.r10/3' })),
  refs: items.map((i) => ({ handle: i.handle, refId: i.refId as string, scope: 'cpov', blobSha256: 'a'.repeat(64), r9Version: R9_VERSION, viewVersion: VIEW.viewVersion, row: {} })),
});
const stepIn = (over: Record<string, unknown> = {}) => ({
  task: { id: 'cauthor', type: 'ACTION', povId: 'cpov', inputContext: ctxWith([ITEM]) }, agentRole: 'config_change_author',
  finalResponse: FR, owningLeg: LEG, protocolInjection: PI, r9Version: R9_VERSION, authorStageId: 'cstage', ...over,
}) as never;

test('V-5c: non-eligible executions get null (another role, a PIPELINE task, a non-variant leg) — their result.json is untouched', async () => {
  eq(await runEditApplicationStep(stepIn({ agentRole: 'change_reviewer' }), memResolver), null);
  eq(await runEditApplicationStep(stepIn({ task: { id: 'x', type: 'PIPELINE', inputContext: {} } }), memResolver), null);
  eq(await runEditApplicationStep(stepIn({ owningLeg: { kind: 'leg', legId: 'l', heldCapable: false } }), memResolver), null);
  eq(await runEditApplicationStep(stepIn({ owningLeg: { kind: 'no-leg', reason: 'no-stage', heldCapable: false } }), memResolver), null);
});

test('V-5c: applied through the injected resolver; refs carried for the persist', async () => {
  const r = await runEditApplicationStep(stepIn(), memResolver);
  ok(r && r.application.state === 'applied' && r.refs.length === 1 && r.textSource === 'loop', JSON.stringify(r?.application.state));
  eq(r!.application.rollback, [{ handle: 'H1', directive: 'restore' }]);
});

test('V-5c: precedence inputs — binding (leaf not on a held-capable protocol / degraded), demo-pov BEFORE any resolver read, could-not-check, namespace', async () => {
  let reads = 0; const counting: ResolveHeldFiles = async (i, c) => { reads++; return memResolver(i, c); };
  // Phase 10: a leaf on obs is BOUND (the fold); a leaf on another domain's protocol is the mismatch.
  eq((await runEditApplicationStep(stepIn({ protocolInjection: { protocolNames: ['network-derivation-protocol'] } }), counting))!.application.state, 'binding-mismatch');
  eq((await runEditApplicationStep(stepIn({ protocolInjection: { ...PI, degraded: 'PROTOCOL_LOAD_DB_ERROR' } }), counting))!.application.state, 'variant-protocol-not-injected');
  eq((await runEditApplicationStep(stepIn({ task: { id: 'a', type: 'ACTION', povId: 'p', inputContext: ctxWith([{ handle: 'H1', path: '/p', state: 'demo-pov' }]) } }), counting))!.application.state, 'demo-pov');
  eq((await runEditApplicationStep(stepIn({ owningLeg: { kind: 'could-not-check', reason: 'read-threw', heldCapable: false } }), counting))!.application.state, 'could-not-check');
  eq((await runEditApplicationStep(stepIn({ task: { id: 'a', type: 'ACTION', povId: 'p', inputContext: ctxWith([ITEM], 1) } }), counting))!.application.state, 'handle-namespace-ambiguous');
  eq(reads, 0, 'none of these reached the resolver: ');
  eq((await runEditApplicationStep(stepIn({ task: { id: 'a', type: 'ACTION', povId: 'p', inputContext: {} } }), counting))!.application.state, 'no-base', 'explicit-inputContext override with no heldView: ');
  const thrower: ResolveHeldFiles = async () => { throw new Error('db'); };
  eq((await runEditApplicationStep(stepIn(), thrower))!.application.state, 'could-not-check', 'a resolver throw never throws: ');
});

test('V-5c: the #90 recount re-runs the PURE applier on the post-#90 text over the same verified files', async () => {
  const r = (await runEditApplicationStep(stepIn(), memResolver))!;
  const re = recountEditApplication(r, FR.replace('127.0.0.1', '10.0.0.1'), R9_VERSION);
  eq(re.textSource, 'diagnostic-retry'); ok(re.application.files[0].candidateText!.includes('10.0.0.1'), 'recount used the new text');
  const dropped = recountEditApplication(r, '# #90 dropped every edit', R9_VERSION);
  eq(dropped.application.state, 'no-edits', 'a #90 that drops the edits: ');
});

test('R10-V8-RESIDUALS (b): the step and the #90 recount both carry persistEchoTokens to the applier (an edit echoing a tool-record secret is refused)', async () => {
  const ECHO = 'Synth3ticTok9x';
  const fr = FR.replace('        endpoint: 127.0.0.1:4317', '        endpoint: 127.0.0.1:4317 # ' + ECHO);
  const tokens = new Set([ECHO]);
  const r = (await runEditApplicationStep(stepIn({ finalResponse: fr, persistEchoTokens: tokens }), memResolver))!;
  ok(r.application.refusals.some((x) => x.name === 'edit-redacted-at-persist'), `step: got ${r.application.state}`);
  const ctl = (await runEditApplicationStep(stepIn({ finalResponse: fr }), memResolver))!;
  eq(ctl.application.state, 'applied', 'control (no tokens): ');
  const re = recountEditApplication(ctl, fr, R9_VERSION, tokens);
  ok(re.application.refusals.some((x) => x.name === 'edit-redacted-at-persist'), `recount: got ${re.application.state}`);
});

// ── V-5c: the production resolver (verified pointers) ──
function storeDb(over: { ref?: Record<string, unknown> | null; harvester?: Record<string, unknown> | null; view?: Record<string, unknown> | null; blob?: string | null } = {}) {
  const seen: string[] = [];
  const ref = over.ref === undefined ? { id: 'crefA', kind: 'CAPTURE', executionId: 'cexecH', scope: 'cpov', legTaskId: 'cleg', blobSha256: 'a'.repeat(64), path: '/etc/otelcol/config.yaml', redactorVersion: 'paichart.r10/3' } : over.ref;
  const view = over.view === undefined ? { scope: 'cpov', baseSha256: 'a'.repeat(64), r9Version: R9_VERSION, viewVersion: VIEW.viewVersion, viewText: VIEW.viewText, lineCount: VIEW.lineCount, rewrittenLines: VIEW.rewrittenLines } : over.view;
  return { seen, db: {
    heldFileRef: { findUnique: async () => ref },
    agentExecution: { findUnique: async () => ({ taskId: 'charv' }) },
    task: { findUnique: async () => (over.harvester === undefined ? { stageId: 'cstage', agentRole: 'infra_state_harvester' } : over.harvester) },
    $queryRaw: async (q: { sql: string; values: unknown[] }) => {
      seen.push(`${/held_views/.test(q.sql) ? 'view' : 'blob'}:${q.values[0]}`);
      if (/held_views/.test(q.sql)) return view ? [view] : [];
      const b = over.blob === undefined ? BASE : over.blob; return b === null ? [] : [{ content: Buffer.from(b) }];
    },
    $executeRaw: async () => 0,
  } };
}
const CTX = { authorTaskId: 'cauthor', authorStageId: 'cstage', scope: 'cpov', legTaskId: 'cleg' };

test('V-5c resolver: a verified CAPTURE ref ⇒ rendered with the server view + base; SAME output as the in-memory resolver', async () => {
  const s = storeDb(); const got = await resolveHeldFilesFromStore(s.db as never)([ITEM], CTX);
  const mem = await memResolver([ITEM], CTX);
  eq(got.files, mem.files.map((f) => ({ ...f })), 'files: ');
  eq(s.seen, ['view:cpov', 'blob:cpov']);
});

test('V-5c resolver: each broken pointer ⇒ binding-invalid (never another POV\'s read); a missing view / blob ⇒ named states', async () => {
  const cases: Array<[string, Parameters<typeof storeDb>[0], object, string]> = [
    ['foreign scope', { ref: { kind: 'CAPTURE', executionId: 'cexecH', scope: 'cOTHERpov', legTaskId: 'cleg', blobSha256: 'a'.repeat(64) } }, {}, 'binding-invalid'],
    ['not a CAPTURE', { ref: { kind: 'BASE', executionId: 'cexecH', scope: 'cpov', legTaskId: 'cleg', blobSha256: 'a'.repeat(64) } }, {}, 'binding-invalid'],
    ['another execution', { ref: { kind: 'CAPTURE', executionId: 'cexecX', scope: 'cpov', legTaskId: 'cleg', blobSha256: 'a'.repeat(64) } }, {}, 'binding-invalid'],
    ['null leg', { ref: { kind: 'CAPTURE', executionId: 'cexecH', scope: 'cpov', legTaskId: null, blobSha256: 'a'.repeat(64) } }, {}, 'binding-invalid'],
    ['Harvester in another stage', { harvester: { stageId: 'cOTHER', agentRole: 'infra_state_harvester' } }, {}, 'binding-invalid'],
    ['not a Harvester', { harvester: { stageId: 'cstage', agentRole: 'config_change_author' } }, {}, 'binding-invalid'],
    ['shown viewText ≠ server view', {}, { viewText: 'tampered' }, 'binding-invalid'],
    ['no view row for the selectors', { view: null }, {}, 'view-not-rendered'],
    ['blob gone', { blob: null }, {}, 'base-not-held'],
  ];
  for (const [what, over, item, want] of cases) {
    const s = storeDb(over); const got = await resolveHeldFilesFromStore(s.db as never)([{ ...ITEM, ...item }], CTX);
    eq(got.files[0].state, want, `${what}: `);
    ok(!s.seen.some((x) => x.endsWith('cOTHERpov')), `${what}: read another POV`);
  }
  void createHash;
});

// ── V-5c-2: the correction turn ──
const FILES = [{ handle: 'H1', path: '/etc/otelcol/config.yaml', state: 'rendered' as const, baseText: BASE, viewText: VIEW.viewText, rewrittenLines: VIEW.rewrittenLines, redactorVersion: 'paichart.r10/3' }];
const appOf = (t: string) => computeEditApplication(t, { files: FILES, r9Version: R9_VERSION });
const BAD = FR.replace('        endpoint: 0.0.0.0:4317\n=======', '        endpoint: 0.0.0.0:9999\n=======');
const TIME = () => ({ remainingMs: 900000, estimatedMs: 1000, estimatedOutputTokens: 1, observedTps: 10 });

// ── F-T2-1 (b) (held-terraform step 3, owner 2026-10-21): the edit step can be PREVIEWED — decision only, no turn — so execution-core
// can reserve the one reflection pass for the held-edit correction before the form correction spends it.
test('F-T2-1 (b): decideOnly returns the attempted decision and never calls the LLM; without it the same input runs the turn', async () => {
  let calls = 0;
  const corr = { enabled: true, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false,
    deadlineAt: Date.now() + 3600_000, loopStartedAt: Date.now() - 1000, currentResponse: { usage: { outputTokens: 10 } }, messageHistory: [],
    totalUsage: { outputTokens: 10 }, prompt: 'p', normalizedLlmConfig: {}, mcpFunctions: [], executionId: 'cexec', userId: 'u',
    generateText: async () => { calls++; return { text: FR, usage: { inputTokens: 1, outputTokens: 1 } }; },
    logger: { info: () => undefined, warn: () => undefined } };
  const preview = (await runEditApplicationStep(stepIn({ finalResponse: BAD, correction: corr, decideOnly: true }), memResolver))!;
  eq([preview.correction.attempted, calls, preview.textSource, preview.application.refusals.map((r) => r.name)], [true, 0, 'loop', ['search-not-found']], 'preview: ');
  const real = (await runEditApplicationStep(stepIn({ finalResponse: BAD, correction: corr }), memResolver))!;
  eq([real.correction.attempted, calls > 0], [true, true], 'real step runs the turn: ');
  const blocked = (await runEditApplicationStep(stepIn({ finalResponse: BAD, correction: { ...corr, formCorrectionAttempted: true } }), memResolver))!;
  eq(blocked.correction.notAttemptedReason, 'prior-pass-used:form-correction', 'the old order still refuses after a form attempt: ');
});
test('F-T2-1 (b): arbitrateReflectionPass reserves the pass ONLY when the form correction would run AND the held-edit correction would take it', async () => {
  const corr = { enabled: true, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false,
    deadlineAt: Date.now() + 3600_000, loopStartedAt: Date.now() - 1000, currentResponse: { usage: { outputTokens: 10 } }, messageHistory: [],
    totalUsage: { outputTokens: 10 }, prompt: 'p', normalizedLlmConfig: {}, mcpFunctions: [], executionId: 'cexec', userId: 'u',
    generateText: async () => { throw new Error('the arbitration must never call the LLM'); }, logger: { info: () => undefined, warn: () => undefined } };
  const fcOn = { correction: { attempted: true } }; const fcOff = { correction: { attempted: false, notAttemptedReason: 'no-trigger-hit' } };
  const arb = (fc: any, over: Record<string, unknown>) => arbitrateReflectionPass(fc, stepIn({ finalResponse: BAD, correction: corr, ...over }), memResolver);
  const r1 = await arb(fcOn, {});
  eq([r1.reserved, (r1.formCheck as any).correction, r1.refusals], [true, { attempted: false, notAttemptedReason: 'prior-pass-reserved:edit-correction' }, ['search-not-found']], 'refused held edit ⇒ reserved: ');
  eq((await arb(fcOff, {})).reserved, false, 'no form attempt ⇒ nothing to reserve: ');
  eq((await arb(fcOn, { finalResponse: FR })).reserved, false, 'held edits apply ⇒ the form correction keeps the pass: ');
  eq((await arb(fcOn, { correction: { ...corr, enabled: false } })).reserved, false, 'held-edit correction flag off ⇒ the form correction keeps the pass: ');
  eq((await arb(fcOn, { agentRole: 'change_reviewer' })).reserved, false, 'not an edit-step-eligible Author ⇒ unchanged: ');
  eq((await arbitrateReflectionPass(fcOn as any, null, memResolver)).reserved, false, 'no held context ⇒ unchanged: ');
  eq(reflectionPassSpentBy({ formCheck: r1.formCheck, editCorrection: { attempted: true } }), 'edit-correction', 'the spender reads edit-correction: ');
});
test('F-T2-1 (b): production and the leg replay lab run the SAME arbitration, BEFORE the form correction (no second copy)', () => {
  for (const [f, form] of [['lib/services/execution-core.ts', 'if (formCheck && formCheck.correction.attempted) {\n      const decision = formCheck;'],
    ['scripts/leg-replay-lab/live.ts', '    if (formCheck.correction?.attempted) {\n      purpose = \'form-correction\';']] as const) {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    const iArb = src.indexOf('arbitrateReflectionPass('); const iForm = src.indexOf(form); const iReal = src.indexOf('runEditApplicationStep(editStepInput(false)');
    ok(iArb > 0 && iForm > iArb && iReal > iForm, `${f}: arbitration(${iArb}) < form correction(${iForm}) < real edit step(${iReal})`);
    ok(!/prior-pass-reserved:edit-correction/.test(src.replace(/\/\/.*$/gm, '')), `${f}: the reason is set only inside arbitrateReflectionPass, never inline`);
  }
  const core = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  eq(core.split('resolveOwningLegProtocol(prisma, task)').length, 2, 'ONE owning-leg resolution: ');
});

test('V-5c-2: the decision order — platform state, no correctable refusal, #89, form correction, budget, flag, time', () => {
  const bad = appOf(BAD); eq(bad.refusals.map((r) => r.name), ['search-not-found']);
  const d = (o: object) => decideEditCorrection({ application: bad, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false, enabled: true, time: TIME, ...o }).notAttemptedReason ?? 'attempted';
  eq(d({ application: computeEditApplication(FR, { files: [], r9Version: R9_VERSION, preState: 'demo-pov' }) }), 'platform-state');
  eq(d({ application: appOf(FR) }), 'no-correctable-refusal');
  eq(d({ correctionTurnUsed: true }), 'prior-pass-used:anti-fabrication'); eq(d({ formCorrectionAttempted: true }), 'prior-pass-used:form-correction');
  eq(d({ budgetFlagged: true }), 'budget-flagged'); eq(d({ enabled: false }), 'flag-off');
  // budget before the flag (the requirements precedent; found by mutation — swapping them was green):
  eq(d({ budgetFlagged: true, enabled: false }), 'budget-flagged'); eq(d({ formCorrectionAttempted: true, enabled: false }), 'prior-pass-used:form-correction');
  eq(d({ time: () => ({ remainingMs: 1000, estimatedMs: 5000, estimatedOutputTokens: 1, observedTps: 1 }) }), 'insufficient-time');
  eq(d({}), 'attempted');
});

test('V-5c-2: every AUTHOR_CORRECTABLE name has exactly one intent; the prompt never carries line TEXT; A18 names ${env:NAME}', () => {
  eq(Object.keys(EDIT_CORRECTION_INTENT).sort(), [...AUTHOR_CORRECTABLE].sort());
  const secretLine = '        password: Synth3ticLEAK9';
  const t = FR.replace('        endpoint: 127.0.0.1:4317', secretLine) + '\n';
  const a = appOf(t); eq(a.refusals[0].name, 'edit-introduces-secret-literal');
  const p = buildEditCorrectionPrompt(a);
  ok(!p.includes('Synth3ticLEAK9') && !p.includes('endpoint: 0.0.0.0'), 'line text leaked into the prompt');
  ok(p.includes('${env:NAME}') && p.includes('a bare $NAME is treated as a literal and refused'), 'A18 sentence');
  ok(p.includes('edit block 1 (H1): edit-introduces-secret-literal'), p);
});

test('V-5c-2 adoption v1: refusals must FALL; applied edits unchanged; outside the sections only body lines of a changed edit may move', () => {
  const before = appOf(BAD);
  eq(checkEditCorrectionAdoption({ original: BAD, corrected: FR, before, after: appOf(FR) }), { adopted: true });
  eq(checkEditCorrectionAdoption({ original: BAD, corrected: BAD, before, after: appOf(BAD) }).notAdoptedReason, 'refusals-did-not-fall');
  const prose = FR + '\n\nValidation: run otelcol validate --config /tmp/x';
  eq(checkEditCorrectionAdoption({ original: BAD, corrected: prose, before, after: appOf(prose) }).notAdoptedReason, 'changed-outside-sections');
  eq(checkEditCorrectionAdoption({ original: BAD, corrected: '', before, after: null }).notAdoptedReason, 'empty-response');
});

test('V-5c-2 adoption: a correction that SPLITS an ambiguous edit into two blocks (a separating blank line + a per-file sub-heading, both inside the edits section) is ADOPTED; prose inside a section still counts', () => {
  const DUP = ['# Package', '', '## Held File Edits', '', '<<<<<<< SEARCH H1', '        allow all;', '=======', '        deny all;', '>>>>>>> REPLACE', '',
    '## Held File Rollback', '', 'restore H1'].join('\n');
  const SPLIT = ['# Package', '', '## Held File Edits', '', '### H1 (ingress)', '', '<<<<<<< SEARCH H1', '    listen 4317;', '', '    location / {', '        allow all;', '=======',
    '    listen 4317;', '', '    location / {', '        deny all;', '>>>>>>> REPLACE', '', '<<<<<<< SEARCH H1', '    listen 4318;', '', '    location / {', '        allow all;', '=======',
    '    listen 4318;', '', '    location / {', '        deny all;', '>>>>>>> REPLACE', '', '## Held File Rollback', '', 'restore H1'].join('\n');
  const base = '# ingress\nserver {\n    listen 4317;\n\n    location / {\n        allow all;\n    }\n}\nserver {\n    listen 4318;\n\n    location / {\n        allow all;\n    }\n}\n';
  const files = [{ handle: 'H1', path: '/etc/nginx/ingress.conf', state: 'rendered' as const, baseText: base, viewText: base, rewrittenLines: [], redactorVersion: 'paichart.r10/3' }];
  const app = (t: string) => computeEditApplication(t, { files, r9Version: R9_VERSION });
  const before = app(DUP); eq(before.refusals.map((r) => r.name), ['search-not-unique']);
  const after = app(SPLIT); eq([after.state, after.applied], ['applied', 2]);
  eq(checkEditCorrectionAdoption({ original: DUP, corrected: SPLIT, before, after }), { adopted: true });
  const prose = SPLIT.replace('### H1 (ingress)', '### H1 (ingress)\nThen run nginx -t on the host.');
  eq(checkEditCorrectionAdoption({ original: DUP, corrected: prose, before, after: app(prose) }).notAdoptedReason, 'changed-outside-sections');
});

test('V-5c-2 adoption A8: a heading-LEVEL-only fix of edits-outside-section is ADOPTED; the same fix that also rewrites a validation command is refused', () => {
  const H = ['# Package', '## Held File Edits', '## H1', '<<<<<<< SEARCH H1', '      grpc:', '        endpoint: 0.0.0.0:4317', '=======', '      grpc:',
    '        endpoint: 127.0.0.1:4317', '>>>>>>> REPLACE', '## Validation', 'promtool check config'].join('\n');
  const before = appOf(H); eq(before.refusals.map((r) => r.name), ['edits-outside-section']);
  const fixed = H.replace('## H1', '### H1');
  eq(checkEditCorrectionAdoption({ original: H, corrected: fixed, before, after: appOf(fixed) }), { adopted: true });
  const both = fixed.replace('promtool check config', 'promtool check rules');
  eq(checkEditCorrectionAdoption({ original: H, corrected: both, before, after: appOf(both) }).notAdoptedReason, 'changed-outside-sections');
});

test('AE-P2-2 (owner decision 4, A8 extension): a retitle to the machine heading is ADOPTED when the old title folds to it (case, whitespace, ONE trailing parenthetical); `## Edits` is NOT; a retitle that also rewrites a validation command is refused', () => {
  const pkg = (heading: string) => ['# Package', heading, '<<<<<<< SEARCH H1', '      grpc:', '        endpoint: 0.0.0.0:4317', '=======', '      grpc:',
    '        endpoint: 127.0.0.1:4317', '>>>>>>> REPLACE', '## Validation', 'otelcol validate --config /etc/otelcol/config.yaml'].join('\n');
  const fixed = pkg('## Held File Edits');
  eq([appOf(fixed).state, appOf(fixed).refusedTotal], ['applied', 0], 'control: the corrected package applies — ');
  const outcome = (heading: string) => {
    const orig = pkg(heading); const before = appOf(orig);
    eq(before.refusals.map((r) => r.name), ['edits-outside-section'], `${heading}: before — `);
    return checkEditCorrectionAdoption({ original: orig, corrected: fixed, before, after: appOf(fixed) });
  };
  eq(outcome('## Held file edits'), { adopted: true }, 'case-only retitle: ');
  eq(outcome('## Held File Edits (H1)'), { adopted: true }, 'trailing-parenthetical retitle: ');
  eq(outcome('##   held   FILE edits  '), { adopted: true }, 'whitespace + case retitle: ');
  eq(outcome('## Edits'), { adopted: false, notAdoptedReason: 'changed-outside-sections' }, 'a different word is NOT forgiven (decided, pinned): ');
  eq(outcome('## Held Edits'), { adopted: false, notAdoptedReason: 'changed-outside-sections' }, 'a dropped word is NOT forgiven: ');
  const orig = pkg('## Held file edits');
  const both = fixed.replace('otelcol validate --config /etc/otelcol/config.yaml', 'otelcol validate --config /tmp/other.yaml');
  eq(checkEditCorrectionAdoption({ original: orig, corrected: both, before: appOf(orig), after: appOf(both) }).notAdoptedReason, 'changed-outside-sections',
    'a retitle that ALSO rewrites a validation command — ');
  eq([foldMachineHeadingTitle('Held File Edits'), foldMachineHeadingTitle('2. held file rollback (all)'), foldMachineHeadingTitle('Held File Edits (H1) (H2)'),
    foldMachineHeadingTitle('Held File Edits for H1'), foldMachineHeadingTitle('Edits')],
    ['Held File Edits', 'Held File Rollback', null, null, null], 'fold: ');
});

test('V-5c-2 the turn: reflection on the SHARED primitive (Opus re-sends tools + functionCall none; Sonnet sends none), C2 removal when not adopted', async () => {
  const seen: any[] = [];
  const mk = (model: string, reply: string) => ({
    text: BAD, before: appOf(BAD), files: FILES, r9Version: R9_VERSION, currentResponse: { text: BAD }, messageHistory: [{ role: 'user', content: 'x' }],
    totalUsage: { inputTokens: 0, outputTokens: 0 }, prompt: 'p', normalizedLlmConfig: { model, maxTokens: 100, provider: 'anthropic_sdk' },
    mcpFunctions: [{ name: 'services' }], executionId: 'e', userId: undefined, timeoutMs: 10000,
    _reply: reply,
  });
  const deps = (reply: string) => ({ generateText: async (_p: string, o: any) => { seen.push(o); return { text: reply, usage: { inputTokens: 1, outputTokens: 1 } }; },
    logger: { info: () => undefined, warn: () => undefined } });
  const opus = mk('claude-opus-5-5', FR); const r1 = await runEditCorrectionTurn(opus as never, deps(FR));
  ok(r1.outcome.adopted && r1.text === FR, 'adopted'); eq([seen[0].functionCall, (seen[0].functions ?? []).length], ['none', 1], 'Opus call: ');
  eq(opus.messageHistory.length, 3, 'adopted keeps the two appended messages: ');
  const sonnet = mk('claude-sonnet-5', BAD); const r2 = await runEditCorrectionTurn(sonnet as never, deps(BAD));
  eq([seen[1].functionCall, (seen[1].functions ?? []).length], ['none', 0], 'Sonnet call: ');
  ok(!r2.outcome.adopted && r2.text === BAD, 'not adopted'); eq(sonnet.messageHistory.length, 1, 'C2 removal: ');
});

test('V-5c-2 goldens (§5 item 3): buildEditCorrectionPrompt output for one fixture per intent is byte-identical to scripts/fixtures/held-edit-correction-golden.json', () => {
  const fixtures: Record<string, string> = {
    're-copy': BAD,
    narrow: FR.replace('      grpc:\n        endpoint: 127.0.0.1:4317', '      grpc:\n        token: <REDACTED-X>'),
    'operator-step': FR.replace('        endpoint: 127.0.0.1:4317', '        password: Synth3ticLEAK9'),
    structure: FR.replace('## Held File Edits', '## Edits'),
  };
  const out: Record<string, string> = {};
  for (const [k, t] of Object.entries(fixtures)) out[k] = createHash('sha256').update(buildEditCorrectionPrompt(appOf(t))).digest('hex');
  const G = join(__dirname, 'fixtures', 'held-edit-correction-golden.json');
  if (process.argv.includes('--update') || !existsSync(G)) writeFileSync(G, JSON.stringify(out, null, 2) + '\n');
  const g = JSON.parse(readFileSync(G, 'utf8')) as Record<string, string>;
  const moved = Object.keys({ ...g, ...out }).filter((k) => g[k] !== out[k]);
  ok(moved.length === 0, `moved: ${moved.join(', ')} (a change after G1 is a §5 event)`);
});

test('V-5c spender (AE S2): precedence #89 > form > requirements > edit > #90; an attempt spends the pass', () => {
  const att = { correction: { attempted: true } };
  eq(reflectionPassSpentBy({ editCorrection: { attempted: true } }), 'edit-correction');
  eq(reflectionPassSpentBy({ editCorrection: { attempted: true }, diagnosticRetryUsed: true }), 'edit-correction');
  eq(reflectionPassSpentBy({ editCorrection: { attempted: true }, requirementsFormCheck: att }), 'requirements-form-correction');
  eq(reflectionPassSpentBy({ editCorrection: { attempted: true }, formCheck: att }), 'form-correction');
  eq(reflectionPassSpentBy({ editCorrection: { attempted: true }, correctionTurnUsed: true }), '#89');
  eq(reflectionPassSpentBy({ editCorrection: { attempted: false }, diagnosticRetryUsed: true }), '#90');
});

test('V-5c spender: a non-variant result.json is BYTE-IDENTICAL with no editCorrection input; an attempt names the spender', () => {
  const base = { taskId: 't', taskTitle: 'T', agentRole: 'config_change_author', modelUsed: 'm', finalResponse: 'x', confidenceScore: 80,
    confidenceCapped: false, originalConfidence: 80, executionDegradation: null, protocolValidation: null, harnessContext: null,
    turnCount: 1, maxToolTurns: 10, toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0, executionTime: 1, tokensUsed: 1,
    mcpFunctions: [], correctionTurnUsed: false, logger: { warn: () => undefined, info: () => undefined } as never, executionId: 'e' };
  const j = (o: unknown) => JSON.stringify({ ...(o as object), generatedAt: '<clock>' }); // the one wall-clock field
  const plain = j(buildExecutionResultJson(base as never));
  eq(j(buildExecutionResultJson({ ...base, editCorrection: null } as never)), plain, 'null input: ');
  eq(j(buildExecutionResultJson({ ...base, editCorrection: { attempted: false } } as never)), plain, 'not attempted: ');
  const spent = buildExecutionResultJson({ ...base, editCorrection: { attempted: true } } as never) as { toolLoop: { reflectionPassSpentBy?: string } };
  eq(spent.toolLoop.reflectionPassSpentBy, 'edit-correction');
});

// ── V-5g: the digest ──
const four = (fourth: string) => ['a', 'b', 'c', 'd'].map((x, i) => ({ handle: `H${i + 1}`, path: `/etc/otelcol/${x}.yaml`, state: 'rendered' as const,
  baseText: `k: ${x}\n`, viewText: `k: ${x}\n`, rewrittenLines: [], redactorVersion: 'paichart.r10/3' })).map((f, i) => (i === 3 ? { ...f, baseText: `k: ${fourth}\n`, viewText: `k: ${fourth}\n` } : f));
const editAll = ['## Held File Edits', ...['a', 'b', 'c', 'd'].flatMap((x, i) => [`<<<<<<< SEARCH H${i + 1}`, i === 3 ? 'k: SEARCH4' : `k: ${x}`, '=======', `k: ${x}2`, '>>>>>>> REPLACE'])].join('\n');

test('V-5g A1: candidateSetDigest8 covers EVERY held file — a 4-file package differing only in file 4 digests differently', () => {
  const f1 = four('d'); const f2 = four('e');
  const a1 = computeEditApplication(editAll.replace('SEARCH4', 'd'), { files: f1, r9Version: R9_VERSION });
  const a2 = computeEditApplication(editAll.replace('SEARCH4', 'e').replace('k: d2', 'k: e2'), { files: f2, r9Version: R9_VERSION });
  eq([a1.state, a2.state], ['applied', 'applied']);
  ok(candidateSetDigest8(a1, f1) !== candidateSetDigest8(a2, f2), 'file 4 alone must move the digest');
  const unchanged = computeEditApplication(['## Held File Edits', '<<<<<<< SEARCH H1', 'k: a', '=======', 'k: a2', '>>>>>>> REPLACE'].join('\n'), { files: f1, r9Version: R9_VERSION });
  ok(candidateSetDigest8(unchanged, f1) !== candidateSetDigest8(a1, f1), 'unchanged vs edited files differ');
});

test('V-5g: ≤ 1,024 at MAX inputs (every refusal name, 256 files); the fallback keeps state, refWrite, candidateFiles, candidateDigest8; no 64-hex run', () => {
  const files = Array.from({ length: 256 }, (_, i) => ({ handle: `H${i + 1}`, path: `/etc/otelcol/${'x'.repeat(200)}${i}.yaml`, state: 'rendered' as const,
    baseText: 'k: v\n', viewText: 'k: v\n', rewrittenLines: [], redactorVersion: 'paichart.r10/3' }));
  const app = computeEditApplication(editAll, { files, r9Version: R9_VERSION });
  for (const n of [...AUTHOR_CORRECTABLE]) app.refused[n as never] = 999 as never;
  const big = buildEditApplicationFact({ app, heldFiles: files, refWrite: 'committed', textSource: 'loop', correction: { attempted: true, adopted: false, notAdoptedReason: 'changed-outside-sections', refusedBefore: 999, refusedAfter: 999 } });
  ok(JSON.stringify(big).length <= EDIT_FACT_MAX, `${JSON.stringify(big).length}`);
  eq(Object.keys(big).sort(), ['candidateDigest8', 'candidateFiles', 'digestTruncated', 'refWrite', 'refusedTotal', 'state', 'version']);
  ok(typeof big.candidateDigest8 === 'string' && (big.candidateDigest8 as string).length === 8, 'a truncated stamp still compares');
  const ok1 = buildEditApplicationFact({ app: appOf(FR), heldFiles: FILES, refWrite: 'committed', textSource: 'loop', baseShaByHandle: { H1: 'f'.repeat(64) } });
  ok(!/[0-9a-f]{64}/.test(JSON.stringify(ok1)) && JSON.stringify(ok1).length <= EDIT_FACT_MAX, 'no full hash');
  eq((ok1.hashes as unknown[])[0], { handle: 'H1', baseHash8: 'ffffffff', candidateHash8: (appOf(FR).files[0].candidateSha256 as string).slice(0, 8) });
});

test('V-5g: redactorVersion none ⇒ no hashes; paths are R9-defanged; PLATFORM states still stamp a digest', () => {
  const none = FILES.map((f) => ({ ...f, redactorVersion: 'paichart.r10/3' }));
  const f = buildEditApplicationFact({ app: appOf(FR), heldFiles: [{ ...none[0], redactorVersion: 'none' }], refWrite: 'none', textSource: 'loop' });
  eq(f.hashes, []);
  const p = buildEditApplicationFact({ app: { ...appOf(FR), files: [{ ...appOf(FR).files[0], path: '/x/<prior_output>​.yaml' }] }, heldFiles: FILES, refWrite: 'committed', textSource: 'loop' });
  ok(!JSON.stringify(p.files).includes('<prior_output>') && !JSON.stringify(p.files).includes('​'), JSON.stringify(p.files));
  for (const st of PLATFORM_STATE) {
    const a = computeEditApplication(FR, { files: [{ handle: 'H1', path: '/p', state: st }], r9Version: R9_VERSION });
    eq(buildEditApplicationFact({ app: a, heldFiles: [], refWrite: 'none', textSource: 'loop' }).state, st);
  }
});

// ── V-5h: manifests ──
test('V-5h Author manifest: committed carries both ref ids; ROLLED-BACK omits BOTH (A3); never edit text or a 64-hex run', () => {
  const app = appOf(FR);
  const files = [{ handle: 'H1', path: '/etc/otelcol/config.yaml', baseRefId: 'cbase', candidateRefId: 'ccand', r9Version: R9_VERSION, viewVersion: VIEW.viewVersion }];
  const c = buildEditApplicationManifest(app, { refWrite: 'committed', files });
  eq((c.files as any[])[0], { handle: 'H1', path: '/etc/otelcol/config.yaml', baseRefId: 'cbase', candidateRefId: 'ccand', r9Version: R9_VERSION, viewVersion: VIEW.viewVersion });
  const r = buildEditApplicationManifest(app, { refWrite: 'rolled-back', files });
  ok(!('baseRefId' in (r.files as any[])[0]) && !('candidateRefId' in (r.files as any[])[0]) && r.refWrite === 'rolled-back', 'A3');
  const j = JSON.stringify(c);
  ok(!j.includes('127.0.0.1') && !j.includes('0.0.0.0') && !/[0-9a-f]{64}/.test(j), 'no edit text, no hash');
  eq((c.edits as any[])[0], { block: 1, handle: 'H1', op: 'edit', applied: true, positions: [4], searchLines: 2, replaceLines: 2, refusals: [] });
  const bad = buildEditApplicationManifest(appOf(BAD), { refWrite: 'none', files });
  eq((bad.edits as any[])[0].refusals, ['search-not-found']);
});

test('V-5h Harvester manifest: keyed by (toolCallIndex, selector), handles agree with assignHandles, NO ref ids or hashes', () => {
  const ref = (i: number, sel: string, path: string) => ({ scope: 'p', blobSha256: 'a'.repeat(64), executionId: 'e', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
    serviceId: 's', serviceName: 'n', sourceTool: 'get_ingress_config', toolCallIndex: i, selector: sel, target: 'obs-proxy', path, declaredBy: 'platform-default',
    descriptorVersion: 1, declarationSha256: null, eligibility: null, grantPovId: null, hashBasis: 'h', decodeVersion: 'd', redactorVersion: 'r', redactedCount: 0, lineCount: 1, newline: null, bom: null, finalNewline: null,
    serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: 0, sourceRevision: null });
  const m = buildHeldBytesManifest({ refs: [ref(1, '/z', '/b.conf'), ref(1, '/a', '/a.conf'), ref(3, '/a', '/a.conf')], refusals: [], storedBytes: 3 });
  eq(m.objects.map((o) => [o.handleIndex, o.handle, o.toolCallIndex, o.selector, o.path]), [[0, 'H1', 1, '/a', '/a.conf'], [1, 'H2', 1, '/z', '/b.conf'], [2, 'H1', 3, '/a', '/a.conf']]);
  const j = JSON.stringify(m); ok(!/[0-9a-f]{64}/.test(j) && !j.includes('refId') && !j.includes('blobSha256'), 'no ids, no hashes');
});

// ── V-5d: prepareHeldPackage ──
const CAP_ROW = { id: 'crefaaaaaaaaaaaaaaaaaaaa1', kind: 'CAPTURE', executionId: 'cexecH', scope: 'cpov', legTaskId: 'cleg', blobSha256: 'a'.repeat(64), serviceId: 'svc', serviceName: 'observability-readonly',
  target: 'obs-otelcol', path: '/etc/otelcol/config.yaml', hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/3',
  redactedCount: 0, lineCount: 5, newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: 0 };
const stepOf = (text: string) => {
  const application = appOf(text);
  return { application, textSource: 'loop' as const, files: FILES, text, correction: { attempted: false },
    refs: [{ handle: 'H1', refId: 'crefaaaaaaaaaaaaaaaaaaaa1', scope: 'cpov', blobSha256: 'a'.repeat(64), r9Version: R9_VERSION, viewVersion: VIEW.viewVersion, row: CAP_ROW }] };
};
function pkgDb(o: { missing?: boolean; touchThrows?: boolean; upsertThrows?: boolean } = {}) {
  const calls: string[] = [];
  return { calls, db: {
    $queryRaw: async (q: { sql: string }) => { calls.push('touch'); if (o.touchThrows) throw Object.assign(new Error('x'), { meta: { code: '40P01' } }); return o.missing ? [] : [{ scope: 'cpov', sha256: 'a'.repeat(64) }]; },
    $executeRaw: async () => { calls.push('upsert'); if (o.upsertThrows) throw new Error('x'); return 1; },
  } };
}
const prep = (db: unknown, text = FR) => prepareHeldPackage(db as never, { executionId: 'cexecA', step: stepOf(text) as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });

test('V-5d: applied ⇒ BASE + CANDIDATE rows (valid, BASE→CAPTURE, CANDIDATE→BASE), candidate blob upserted pre-tx', async () => {
  const d = pkgDb(); const p = await prep(d.db);
  eq(p.application.state, 'applied'); eq(d.calls, ['touch', 'upsert']);
  eq(p.rows.map((r) => r.kind), ['BASE', 'CANDIDATE']);
  ok(p.rows.every((r) => validateHeldRow('ref', r)), 'rows valid');
  eq([p.rows[0].fromRefId, p.rows[1].fromRefId, p.rows[1].hashBasis, p.rows[1].blobSha256], ['crefaaaaaaaaaaaaaaaaaaaa1', p.rows[0].id, 'platform-candidate-text', p.application.files[0].candidateSha256]);
  eq(p.baseRefIdByHandle.H1, p.rows[0].id); eq(p.candidateRefIdByHandle.H1, p.rows[1].id);
});

test('K-3 (held-k8s, DB SF-1): sourceRevision is inherited CAPTURE → BASE → CANDIDATE (incl. a create); an obs CAPTURE (none) gives null', async () => {
  const REV = 'c'.repeat(40);
  const withRev = (text: string) => { const st = stepOf(text); return { ...st, refs: st.refs.map((r) => ({ ...r, row: { ...CAP_ROW, sourceRevision: REV } })) }; };
  const p = await prepareHeldPackage(pkgDb().db as never, { executionId: 'cexecA', step: withRev(FR) as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });
  eq(p.rows.map((r) => [r.kind, r.sourceRevision]), [['BASE', REV], ['CANDIDATE', REV]]);
  ok(p.rows.every((r) => validateHeldRow('ref', r)), 'rows valid with a revision');
  const CR = FR.replace('## Held File Rollback', '<<<<<<< create H2 on H1 /etc/otelcol/extra.yaml\nk: 1\n>>>>>>> create\n## Held File Rollback');
  const pc = await prepareHeldPackage(pkgDb().db as never, { executionId: 'cexecA', step: { ...withRev(CR), application: computeEditApplication(CR, { files: FILES, r9Version: R9_VERSION }) } as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });
  const created = pc.rows.find((r) => r.kind === 'CANDIDATE' && r.fromRefId === null);
  ok(created, `a create CANDIDATE row (state ${pc.application.state})`);
  eq(created!.sourceRevision, REV, 'a create inherits its onHandle base\'s revision');
  const obs = await prep(pkgDb().db);
  eq(obs.rows.map((r) => r.sourceRevision), [null, null], 'obs CAPTURE row has no sourceRevision ⇒ null, never undefined');
});

test('V-5d: a refused package writes BASE rows only (no candidate blob); a vanished base ⇒ base-not-held, no rows', async () => {
  const d = pkgDb(); const p = await prep(d.db, BAD);
  eq(p.application.state, 'refused'); eq(d.calls, ['touch']); eq(p.rows.map((r) => r.kind), ['BASE']);
  const g = await prep(pkgDb({ missing: true }).db);
  eq([g.application.state, g.rows.length], ['base-not-held', 0]);
});

test('V-5d A2: a PARTIAL package (one file applied, one refused) writes NO candidate — BASE rows only (found by mutation)', async () => {
  const B2 = 'k: 2\n'; const V2 = buildView(B2, R9_VERSION); if (!V2.ok) throw new Error('v');
  const files = [...FILES, { handle: 'H2', path: '/etc/otelcol/b.yaml', state: 'rendered' as const, baseText: B2, viewText: V2.viewText, rewrittenLines: [], redactorVersion: 'paichart.r10/3' }];
  const text = FR.replace('## Held File Rollback', '<<<<<<< SEARCH H2\nnope\n=======\nk: 3\n>>>>>>> REPLACE\n## Held File Rollback');
  const application = computeEditApplication(text, { files, r9Version: R9_VERSION });
  eq(application.state, 'partial');
  const ref2 = { handle: 'H2', refId: 'crefbbbbbbbbbbbbbbbbbbbb2', scope: 'cpov', blobSha256: 'b'.repeat(64), r9Version: R9_VERSION, viewVersion: V2.viewVersion, row: { ...CAP_ROW, id: 'crefbbbbbbbbbbbbbbbbbbbb2', path: '/etc/otelcol/b.yaml' } };
  const step = { ...stepOf(text), application, files, refs: [stepOf(text).refs[0], ref2] };
  const d = { calls: [] as string[], db: { $queryRaw: async () => { d.calls.push('touch'); return [{ scope: 'cpov', sha256: 'a'.repeat(64) }, { scope: 'cpov', sha256: 'b'.repeat(64) }]; },
    $executeRaw: async () => { d.calls.push('upsert'); return 1; } } };
  const p = await prepareHeldPackage(d.db as never, { executionId: 'cexecA', step: step as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });
  eq([p.application.state, p.rows.map((r) => r.kind), d.calls], ['partial', ['BASE', 'BASE'], ['touch']]);
});

test('V-5d: a touch fault, an upsert fault, a planted-invalid CANDIDATE ⇒ unheld, no rows, never a throw', async () => {
  for (const o of [{ touchThrows: true }, { upsertThrows: true }]) { const p = await prep(pkgDb(o).db); eq([p.application.state, p.rows.length, p.application.candidateFiles], ['unheld', 0, 0]); }
  const bad = stepOf(FR); (bad.application.files[0] as { path: string }).path = '/p'; bad.refs[0] = { ...bad.refs[0], row: { ...CAP_ROW, path: 'a\u0000b' } };
  const p = await prepareHeldPackage(pkgDb().db as never, { executionId: 'cexecA', step: bad as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });
  eq([p.application.state, p.rows.length], ['unheld', 0], 'planted-invalid row: ');
});

test('DB-P2-3: a candidate over the per-file cap (or the package over the execution cap) ⇒ unheld, no rows, no upsert', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { HELD_FILE_CAP } = require('../lib/agents/harness/held-bytes/caps');
  const big = stepOf(FR); (big.application.files[0] as { candidateText: string }).candidateText = 'x'.repeat(HELD_FILE_CAP + 1);
  const d = pkgDb();
  const p = await prepareHeldPackage(d.db as never, { executionId: 'cexecA', step: big as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null });
  eq([p.application.state, p.rows.length, d.calls], ['unheld', 0, ['touch']]);
  const atCap = stepOf(FR); (atCap.application.files[0] as { candidateText: string }).candidateText = 'x'.repeat(HELD_FILE_CAP);
  eq((await prepareHeldPackage(pkgDb().db as never, { executionId: 'cexecA', step: atCap as never, r9Version: R9_VERSION, legTaskId: 'cleg', rootTaskId: null })).application.state, 'applied', 'at the cap: ');
});

// ── V-5 core wiring: SOURCE ORDER pins (execution-core.ts) ──
test('V-5 core: ONE owning-leg resolution; step after requirements & before onStoringResults; #90 disqualified; recount after #90; editCorrection threaded; variant I/O before the nets', () => {
  const src = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  const at = (n: string) => { const i = src.indexOf(n); if (i < 0) throw new Error(`missing: ${n}`); return i; };
  eq((src.match(/resolveOwningLegProtocol\(/g) ?? []).length, 1, 'one owning-leg resolution: ');
  // F-T2-1 (b): the REAL step (editStepInput(false)) keeps its position; the decide-only preview before the form correction is pinned separately
  ok(at('runRequirementsFormStep(') < at('runEditApplicationStep(editStepInput(false)') && at('runEditApplicationStep(editStepInput(false)') < at('observers.onStoringResults?.('), 'step position');
  ok(at('formCorrectionAttempted = formCorrectionAttempted || editStep.correction.attempted') < at('runDiagnosticRetry({'), '#90 disqualifier set before #90');
  ok(at('runDiagnosticRetry({') < at('recountEditApplication(editStep'), 'recount after #90');
  ok(at('editCorrection: editStep.correction') < at('const truncationStalled'), 'editCorrection threaded into buildExecutionResultJson');
  ok(at('prepareHeldPackage(') < at('await stampExecutionNets(') && at('variantLeaf ? await captureHeldFiles(') < at('await stampExecutionNets('), 'variant I/O before the nets');
  // held-network step 3 batch 2b: the core's ONE Device sources read rides between them (network leaves only)
  ok(/owningLeg,\s*\n(\s*\.\.\.\(legDeviceSources \? \{ deviceSources: legDeviceSources \} : \{\}\),\s*\n)?\s*\.\.\.\(heldStamps \? \{ held: heldStamps \} : \{\}\)/.test(src), 'the nets receive the core\'s owningLeg and the built stamps');
});

test('V-5c core: the held-edit block reassigns the deliverable ONLY when the correction was adopted (textSource edit-correction)', () => {
  const src = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  const s0 = src.indexOf('// PLATFORM-HELD-BYTES Stage B V-5a/V-5c'); const s1 = src.indexOf('await observers.onStoringResults');
  ok(s0 > 0 && s1 > s0, 'block located');
  const block = src.slice(s0, s1);
  const a0 = block.indexOf("if (editStep.textSource === 'edit-correction') {");
  ok(a0 > 0, 'adopted branch present');
  const adopted = block.slice(a0, block.indexOf('\n      }\n', a0));
  ok(/finalResponse = editStep\.text;/.test(adopted) && /currentResponse = editStep\.currentResponse;/.test(adopted), 'adopted branch takes the correction');
  const outside = block.replace(adopted, '').replace(/\/\/.*$/gm, '');
  for (const v of ['finalResponse', 'currentResponse']) ok(!new RegExp(`\\b${v}\\s*=(?!=)`).test(outside), `${v} assigned outside the adopted branch`);
});

test('BC-P2-3: a Reviewer entry counts as REVIEWED only when this run\'s server-written chained record chained that Author', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { reviewedEditDiffFromContext } = require('../lib/agents/harness/held-bytes-nets');
  const ic = (o: Record<string, unknown> = {}) => ({ chainedFrom: [{ taskId: 't-author', executionId: 'ex-a', editDiff: { diffText: 'd', authorExecutionId: 'ex-a', candidateDigest8: 'abcd1234' }, ...o }] });
  const chained = { status: 'chained', ids: { 't-author': 'ex-a' } };
  eq(reviewedEditDiffFromContext(ic(), chained).state, 'rendered');
  for (const [name, ctx, rec] of [
    ['no record (planted inputContext, no-deps prepare)', ic(), null],
    ['record not-chained', ic(), { status: 'not-chained', reason: 'no-deps' }],
    ['record chained ANOTHER execution of the Author task', ic(), { status: 'chained', ids: { 't-author': 'ex-older' } }],
    ['record chained another task only', ic(), { status: 'chained', ids: { 't-other': 'ex-a' } }],
    ['entry execution ≠ the diff\'s authorExecutionId', ic({ executionId: 'ex-b' }), { status: 'chained', ids: { 't-author': 'ex-b' } }],
  ] as Array<[string, unknown, unknown]>) eq(reviewedEditDiffFromContext(ctx, rec).state, 'not-chained-this-run', `${name}: `);
  eq(reviewedEditDiffFromContext(ic()).state, 'rendered', 'record undefined = not checked (no production caller)');
  const nets = readFileSync(join(__dirname, '..', 'lib', 'agents', 'harness', 'mechanical-nets.ts'), 'utf8');
  ok(/reviewedEditDiffFromContext\(ctx\.task\.inputContext, exec \? readChainedRecord\(exec\)\.record : null\)/.test(nets), 'the production net always passes the record (null when absent)');
});

test('BC-P2-4 / AE-P2-1 core gates: the package + stamps only on a RESOLVED variant leaf; the heldBytes stamp only for a Harvester', () => {
  const core = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  ok(/if \(editStep && variantLeaf\) \{\s*heldPackage = await prepareHeldPackage/.test(core), 'prepareHeldPackage gated on variantLeaf (could-not-check writes nothing)');
  ok(/if \(variantLeaf && editStep && heldPackage\) \{/.test(core), 'editApplication overlay gated on variantLeaf (the net errorFact stands on could-not-check)');
  ok(/\} else if \(variantLeaf && heldCaptures && heldPlan && HARVEST_LEAF_ROLE_RE\.test\(agentRole \?\? ''\)\) \{/.test(core), 'heldBytes stamp + manifest for Harvesters only');
  // PC-P2-3 (G3 entry): a variant Harvester with NO plan names why — switch off ⇒ capture-off, else no-files — and writes nothing.
  ok(/\} else if \(variantLeaf && !heldPlan && HARVEST_LEAF_ROLE_RE\.test\(agentRole \?\? ''\)\) \{\s*(\/\/[^\n]*\n\s*)*heldStamps = \{ heldBytes: \{ held: 0, refused: \{\}, reason: isHeldCaptureEnabled\(\) \? 'no-files' : 'capture-off' \} \};\s*\}/.test(core),
    'PC-P2-3: a planless variant Harvester stamps a named reason (no heldVariant, so no rows and no manifest)');
});

test('AE-P2-3: recountEditApplication carries the post-#90 text (prepareHeldPackage re-derives from step.text)', () => {
  const prior = { application: computeEditApplication('old', { files: [], r9Version: R9_VERSION }), textSource: 'loop', files: [], refs: [],
    correction: { attempted: false } as never, text: 'old' } as never;
  eq((recountEditApplication(prior, 'the #90 deliverable', R9_VERSION) as { text: string }).text, 'the #90 deliverable');
});

test('V-5h (BC-P2-2): agent.results hides both held manifests at the select (the lean card and the verbose envelope see neither)', () => {
  const r = readFileSync(join(__dirname, '..', 'lib', 'mcp', 'tasks', 'action', 'handlers', 'agent', 'agent-results-handler.ts'), 'utf8');
  ok(/notIn: \[\.\.\.REQUIREMENTS_OPERATOR_ARTIFACTS, \.\.\.HELD_OPERATOR_ARTIFACTS\]/.test(r), 'the select excludes the held set');
  ok(/HELD_OPERATOR_ARTIFACTS: readonly string\[\] = \[EDIT_APPLICATION_MANIFEST_NAME, HELD_BYTES_MANIFEST_NAME\]/.test(r), 'the held set names both manifests');
  eq([EDIT_APPLICATION_MANIFEST_NAME, HELD_BYTES_MANIFEST_NAME], ['edit-application.manifest.json', 'held-bytes.manifest.json']);
});

test('AE-P2-4 (V-5d rescue pin 1): a throw after the loop writes NO held row — the package writer is reached only inside the terminal SUCCESS tx, and the rescue path hands no held stamps', () => {
  const persist = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-terminal-persist.ts'), 'utf8');
  const rescue = readFileSync(join(__dirname, '..', 'lib', 'services', 'execution-completion-anchored.ts'), 'utf8');
  const callers = [persist.match(/insertHeldPackageRows\(/g)?.length ?? 0, rescue.includes('insertHeldPackageRows') ? 1 : 0];
  eq(callers, [1, 0], 'exactly one writer call, in the terminal persist; none in the rescue: ');
  const tx = persist.slice(persist.indexOf('export async function runTerminalSuccessTx'));
  ok(tx.includes('insertHeldPackageRows(tx,'), 'the one call sits inside runTerminalSuccessTx (a rethrown loop never reaches it)');
  for (const k of ['heldVariant', 'packageRows', 'owningLeg', 'held:']) ok(!rescue.includes(k), `the rescue path passes no ${k}`);
});

test('AE-P2-4 (V-5d rescue pin 2): a RESCUED variant leg hoists the STORED Author state — the leg-synthesize net built as the rescue builds it (no owningLeg, no held)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildNetContext } = require('../lib/agents/harness/net-context');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MECHANICAL_NETS } = require('../lib/agents/harness/mechanical-nets');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { authoritativeReadStub } = require('./fixtures/authoritative-read-stub');
  const stored = { version: 1, state: 'partial', candidateDigest8: 'abcd1234', refWrite: 'committed' };
  const db: any = { ...authoritativeReadStub([{ id: 'cexAuthor', taskId: 't-author', createdAt: new Date(1_700_000_000_000),
    result: { agentRole: 'config_change_author', finalResponse: 'pkg', editApplication: stored } }]),
    task: { findMany: async () => [{ id: 't-author', title: 'Author', agentRole: 'config_change_author', type: 'ACTION' }] } };
  const ctx = buildNetContext({ prisma: db, task: { id: 'leg-v', type: 'PIPELINE', title: 'Ingress (protocol: observability-config)',
    metadata: { protocol: 'observability-config-protocol', pipelineStageId: 'stage-v' }, inputContext: null },
    agentRole: 'pipeline_harness_orchestrator', harnessMode: 'SYNTHESIZE', finalResponse: 'synth', programTier: false, executionId: 'cexLeg' });
  const net = MECHANICAL_NETS.find((n: any) => n.name === 'editApplication' && n.point === 'leg-synthesize');
  ok(net.appliesTo(ctx), 'applies to the rescued variant leg');
  const f = await net.enrich(ctx);
  eq([f.state, f.candidateDigest8, f.source, f.authorExecutionId], ['partial', 'abcd1234', 't-author', 'cexAuthor']);
});

if (require.main === module) (async () => {
  for (const { d, fn } of pending) {
    try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++; }
  }
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
