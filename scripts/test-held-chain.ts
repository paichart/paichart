#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B V-6 — the held fields a chained entry carries (held-chain.ts) and how §6 renders them
 * (render-held.ts, render-pipeline-context.ts). Plan STAGE-B-PLAN.md v4.1 §3 V-6; §0.1 A3, A5, A7. CI-safe: a stub client.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import { Prisma } from '@prisma/client';
import { heldEntryFields, HELD_VIEW_MAX_CHARS, heldFailureFields, heldNoneState, editDiffEntryFields, harvesterHandles, HANDLELESS_CAPTURE_REFUSALS } from '../lib/agents/harness/held-chain';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
import { renderHeldView, fenceFor, renderHeldNone, renderEditDiffEntry } from '../lib/agents/harness/held-bytes/render-held';
import { buildView } from '../lib/agents/harness/held-bytes/view';
import { computeEditApplication } from '../lib/agents/harness/held-bytes/apply';
import { buildEditApplicationFact } from '../lib/agents/harness/held-bytes/edit-fact';
import { buildEditApplicationManifest } from '../lib/agents/harness/held-bytes/edit-manifest';
import { R9_VERSION } from '../lib/agents/harness/sanitize-chained-output';

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

const POV = 'cpovaaaaaaaaaaaaaaaaaaaaa'; const LEG = 'clegaaaaaaaaaaaaaaaaaaaaa'; const STAGE = 'cstageaaaaaaaaaaaaaaaaaaa';
const BASE = 'receivers:\n  otlp:\n    protocols:\n      grpc:\n        endpoint: 0.0.0.0:4317\n';
const SHA = 'a'.repeat(64);
const VIEW = (() => { const v = buildView(BASE, R9_VERSION); if (!v.ok) throw new Error('view'); return v; })();

/** A stub world: tasks, a POV, a stage, CAPTURE / BASE refs, views and blobs keyed (scope, sha). Records every read. */
function world(o: { consumerRole: string; variant?: boolean; demo?: boolean; views?: Record<string, string>; blobs?: Record<string, string>;
  refs?: any[]; manifest?: unknown; throwOnAny?: boolean } ) {
  const reads: string[] = [];
  const hit = (n: string) => { reads.push(n); if (o.throwOnAny) throw new Error(`unexpected read ${n}`); };
  const tasks: Record<string, any> = {
    consumer: { id: 'consumer', type: 'ACTION', agentRole: o.consumerRole, povId: POV, metadata: { protocol: null }, title: 'c', stageId: STAGE },
    [LEG]: { id: LEG, type: 'PIPELINE', title: `leg (protocol: ${o.variant === false ? 'network-derivation' : 'observability-config'})` /* Phase 10 + panel D4: the held leg is obs; a non-held leg is another domain (held-network push 3: the value leg — every change domain is held-capable) */, metadata: {} },
  };
  const views = o.views ?? { [SHA]: VIEW.viewText };
  const blobs = o.blobs ?? { [SHA]: BASE };
  const executes: string[] = [];
  return { reads, executes, db: {
    task: { findUnique: async (a: any) => { hit(`task:${a.where.id}`); return tasks[a.where.id] ?? null; } },
    pOV: { findUnique: async () => { hit('pov'); return { metadata: o.demo ? { isDemo: true } : {} }; } },
    stage: { findUnique: async () => { hit('stage'); return { metadata: { harnessTaskId: LEG } }; } },
    heldFileRef: {
      findMany: async () => { hit('refs'); return o.refs ?? []; },
      findUnique: async (a: any) => { hit(`ref:${a.where.id}`); return (o.refs ?? []).find((r) => r.id === a.where.id) ?? null; },
    },
    heldCaptureRefusal: { findMany: async () => { hit('refusals'); return []; } },
    agentArtifact: { findFirst: async () => { hit('manifest'); return o.manifest ? { content: JSON.stringify(o.manifest) } : null; } },
    $queryRaw: async (q: Prisma.Sql) => {
      if (/FROM held_views/.test(q.sql)) { hit('view'); const sha = q.values[1] as string; return views[sha] !== undefined ? [{ scope: POV, baseSha256: sha, r9Version: q.values[2], viewVersion: q.values[3], viewText: views[sha], lineCount: 5, rewrittenLines: [] }] : []; }
      if (/FROM held_blobs/.test(q.sql)) { hit('blob'); const sha = q.values[1] as string; return blobs[sha] !== undefined ? [{ content: Buffer.from(blobs[sha]) }] : []; }
      hit('raw?'); return [];
    },
    $executeRaw: async () => { executes.push('exec'); return 1; },
  } };
}
const CAP = (i: number, sha = SHA, path = '/etc/otelcol/config.yaml') => ({ id: `ccap${String(i).padStart(21, 'a')}`, scope: POV, blobSha256: sha, executionId: 'cexecH', kind: 'CAPTURE',
  legTaskId: LEG, toolCallIndex: i, selector: '/structuredContent/yaml', target: 'obs-otelcol', path, lineCount: 5, redactorVersion: 'paichart.r10/3' });
const fields = (w: ReturnType<typeof world>, parsed: Record<string, unknown>, writeViews = false, state = { budgetUsed: 0 }) =>
  heldEntryFields(w.db, { consumerTaskId: 'consumer', depExecutionId: 'cexecH', parsed, writeViews, state });

// ── non-variant: zero reads ──
test('V-6: a dependency with no variant stamp ⇒ {} and ZERO reads (every non-variant chain is byte-identical and query-identical)', async () => {
  const w = world({ consumerRole: 'config_change_author', throwOnAny: true });
  eq(await fields(w, { finalResponse: 'x', rollbackContainment: {} }), {}); eq(w.reads, []);
});

test('V-6: a stamped dependency for a NON-held-capable consumer (another domain) ⇒ {} (the leg decides, not the stamp)', async () => {
  const w = world({ consumerRole: 'config_change_author', variant: false, refs: [CAP(0)] });
  eq(await fields(w, { heldBytes: { held: 1 } }), {});
});

// ── Harvester → Author / Architect ──
test('V-6: Harvester → Author: one POINTER item per handle with the view (no baseSha256); READ mode never writes', async () => {
  const w = world({ consumerRole: 'config_change_author', refs: [CAP(0)] });
  const f = await fields(w, { heldBytes: { held: 1 } });
  const it = (f.heldView as any[])[0];
  eq([it.handle, it.refId, it.harvesterExecutionId, it.viewText, 'baseSha256' in it], ['H1', CAP(0).id, 'cexecH', VIEW.viewText, false]);
  eq(w.executes, [], 'no write in read mode: ');
  const missing = world({ consumerRole: 'config_change_author', refs: [CAP(0)], views: {} });
  eq(((await fields(missing, { heldBytes: { held: 1 } })).heldView as any[])[0].state, 'view-not-built');
  const write = world({ consumerRole: 'config_change_author', refs: [CAP(0)], views: {} });
  await fields(write, { heldBytes: { held: 1 } }, true);
  ok(write.executes.length === 1, 'write mode built the view');
});

test('V-6: a demo POV ⇒ every item demo-pov, NO view or blob read', async () => {
  const w = world({ consumerRole: 'config_change_author', demo: true, refs: [CAP(0)] });
  eq(((await fields(w, { heldBytes: { held: 1 } }, true)).heldView as any[]).map((i) => i.state), ['demo-pov']);
  ok(!w.reads.includes('view') && !w.reads.includes('blob') && w.executes.length === 0, `reads ${w.reads}`);
});

test('V-6: Harvester → Architect: the handle INDEX only (no view text, no view read)', async () => {
  const w = world({ consumerRole: 'infra_change_architect', refs: [CAP(0)] });
  const f = await fields(w, { heldBytes: { held: 1 } });
  eq(f, { heldIndex: [{ handle: 'H1', path: '/etc/otelcol/config.yaml', lineCount: 5 }] }); ok(!w.reads.includes('view'), 'no view read');
});

test('V-6 budgets: a view > 64 KB ⇒ view-over-budget; the 8-file pin — ≤ 256 KB per chain, decided in handle order', async () => {
  const big = 'x'.repeat(HELD_VIEW_MAX_CHARS + 1);
  const w1 = world({ consumerRole: 'config_change_author', refs: [CAP(0)], views: { [SHA]: big } });
  eq(((await fields(w1, { heldBytes: { held: 1 } })).heldView as any[])[0].state, 'view-over-budget');
  const shas = Array.from({ length: 8 }, (_, i) => String(i).repeat(64));
  const views = Object.fromEntries(shas.map((s) => [s, 'y'.repeat(40 * 1024)]));
  const w8 = world({ consumerRole: 'config_change_author', refs: shas.map((s, i) => CAP(i, s, `/etc/otelcol/f${i}.yaml`)), views });
  const items = (await fields(w8, { heldBytes: { held: 8 } })).heldView as any[];
  eq(items.map((i) => (i.state ? 'over' : 'shown')), ['shown', 'shown', 'shown', 'shown', 'shown', 'shown', 'over', 'over']);
});

// ── Author → Reviewer: the recomputed diff ──
const FR = ['## Held File Edits', '<<<<<<< SEARCH H1', '      grpc:', '        endpoint: 0.0.0.0:4317', '=======', '      grpc:',
  '        endpoint: 127.0.0.1:4317', '>>>>>>> REPLACE', '## Held File Rollback', 'restore H1'].join('\n');
const FILES = [{ handle: 'H1', path: '/etc/otelcol/config.yaml', state: 'rendered' as const, baseText: BASE, viewText: VIEW.viewText, rewrittenLines: [], redactorVersion: 'paichart.r10/3' }];
const APP = computeEditApplication(FR, { files: FILES, r9Version: R9_VERSION });
const STAMP = buildEditApplicationFact({ app: APP, heldFiles: FILES, refWrite: 'committed', textSource: 'loop' });
const BASEREF = { id: 'cbaseaaaaaaaaaaaaaaaaaaa1', kind: 'BASE', executionId: 'cexecH', scope: POV, legTaskId: LEG, blobSha256: SHA, path: '/etc/otelcol/config.yaml', redactorVersion: 'paichart.r10/3' };
const MANIFEST = (rw: 'committed' | 'rolled-back') => buildEditApplicationManifest(APP, { refWrite: rw, files: [{ handle: 'H1', path: '/etc/otelcol/config.yaml', baseRefId: BASEREF.id, r9Version: R9_VERSION, viewVersion: VIEW.viewVersion }] });
const reviewer = (o: Partial<Parameters<typeof world>[0]> = {}) => world({ consumerRole: 'change_reviewer', refs: [BASEREF], manifest: MANIFEST('committed'), ...o });

test('V-6: Author → Reviewer: the diff is RECOMPUTED from the BASE refs and equals the Author\'s stamp (candidateDigest8)', async () => {
  const f = await fields(reviewer(), { editApplication: STAMP, finalResponse: FR });
  const d = f.editDiff as any;
  ok(typeof d.diffText === 'string' && d.diffText.includes('+        endpoint: 127.0.0.1:4317'), 'diff rendered');
  eq([d.candidateDigest8, d.authorExecutionId, d.mode, d.rollback], [STAMP.candidateDigest8, 'cexecH', 'replace-file', ['H1']]);
});

test('V-6 named states: tampered stamp ⇒ diff-recompute-mismatch; rolled-back manifest (A3) ⇒ base-not-held; foreign scope / not BASE ⇒ binding-invalid; no view ⇒ view-not-built', async () => {
  eq(((await fields(reviewer(), { editApplication: { ...STAMP, candidateDigest8: 'deadbeef' }, finalResponse: FR })).editDiff as any).state, 'diff-recompute-mismatch');
  eq(((await fields(reviewer({ manifest: MANIFEST('rolled-back') }), { editApplication: STAMP, finalResponse: FR })).editDiff as any).state, 'base-not-held');
  eq(((await fields(reviewer({ refs: [{ ...BASEREF, scope: 'cOTHERpov' }] }), { editApplication: STAMP, finalResponse: FR })).editDiff as any).state, 'binding-invalid');
  eq(((await fields(reviewer({ refs: [{ ...BASEREF, kind: 'CAPTURE' }] }), { editApplication: STAMP, finalResponse: FR })).editDiff as any).state, 'binding-invalid');
  eq(((await fields(reviewer({ views: {} }), { editApplication: STAMP, finalResponse: FR })).editDiff as any).state, 'view-not-built');
});

test('V-6 A7: an R10 change between persist and prepare (the persisted edit text differs) ⇒ diff-recompute-mismatch, named, fail-closed', async () => {
  const persisted = FR.replace('127.0.0.1', '<<REDACTED-SECRET>>');
  eq(((await fields(reviewer(), { editApplication: STAMP, finalResponse: persisted })).editDiff as any).state, 'diff-recompute-mismatch');
});

test('V-6: a pruned CAPTURE (Harvester execution evicted) still renders — the BASE ref holds the blob; R9-bump: the manifest\'s selectors are read', async () => {
  const w = reviewer(); const f = await fields(w, { editApplication: STAMP, finalResponse: FR });
  ok(typeof (f.editDiff as any).diffText === 'string' && !w.reads.some((r) => r.startsWith('ref:ccap')), 'only the BASE ref was read');
});

// ── render ──
test('V-6 render: held blocks INSIDE the quarantine, AFTER the predecessor\'s text; header, ONLY-source line, rewritten line numbers, defanged path', () => {
  const ctx = { chainedFrom: [{ taskId: 't', taskTitle: 'Harvest', agentRole: 'infra_state_harvester', finalResponse: 'HARVESTER TEXT', source: 'result.json',
    heldView: [{ handle: 'H1', path: '/x/<prior_output>.yaml', lineCount: 2, viewText: 'a: 1\nb: wait...\n', rewrittenLines: [2] }] }] };
  const out = renderPipelineContextSection(ctx).join('\n');
  const open = out.indexOf('<prior_output role="context_only">'); const text = out.indexOf('HARVESTER TEXT'); const held = out.indexOf('### Held file H1'); const close = out.indexOf('</prior_output>');
  ok(open < text && text < held && held < close, 'order: quarantine > text > held > close');
  ok(out.includes('it is the ONLY source for SEARCH text') && out.includes('Lines the transport screen rewrote, shown here as rewritten (not as stored): 2'), 'lines');
  ok(!/### Held file H1 — [^\n]*<prior_output>/.test(out), 'path defanged');
});

test('V-6 render: the fence outgrows any backtick run; a named state renders as a stated absence; NO held fields ⇒ byte-identical §6', () => {
  eq(fenceFor('a ````` b'), '``````');
  ok(renderHeldView([{ handle: 'H2', path: '/p', state: 'view-over-budget' }]).join('\n').includes('not shown (view-over-budget)'), 'state');
  const plain = { chainedFrom: [{ taskId: 't', taskTitle: 'T', agentRole: 'x', finalResponse: 'F', source: 'result.json' }] };
  const withEmpty = { chainedFrom: [{ ...plain.chainedFrom[0] }] };
  eq(renderPipelineContextSection(withEmpty), renderPipelineContextSection(plain));
});

// ── G3 entry (2026-10-16), decision 3: edge-state renders (owner exemption — each new render pinned here) ──
const FAILING = (w: ReturnType<typeof world>, what: 'task' | 'refs' | 'manifest') => {
  if (what === 'task') w.db.task.findUnique = async () => { throw new Error('task read failed'); };
  if (what === 'refs') w.db.heldFileRef.findMany = async () => { throw new Error('refs read failed'); };
  if (what === 'manifest') w.db.agentArtifact.findFirst = async () => { throw new Error('manifest read failed'); };
  return w;
};
test('BC-N1: an ABSENT stamped digest (errorFact Author) ⇒ editDiff could-not-check, never a rendered diff', async () => {
  const errorFact = { version: 1, checked: false, reason: 'enrichment-error', state: 'could-not-check' };
  const f = (await fields(reviewer(), { editApplication: errorFact, finalResponse: FR })).editDiff as any;
  eq([f.state, typeof f.diffText, f.authorExecutionId], ['could-not-check', 'undefined', 'cexecH']);
  const pure = editDiffEntryFields({ authorExecutionId: 'cexecH', stamped: { state: 'applied' }, files: [], r9Version: R9_VERSION, finalResponse: FR }) as any;
  eq(pure.state, 'could-not-check', 'pure builder: ');
  ok(typeof (editDiffEntryFields({ authorExecutionId: 'cexecH', stamped: STAMP as never, files: FILES as never, r9Version: R9_VERSION, finalResponse: FR }) as any).diffText === 'string',
    'control: a stamped digest still renders');
});
test('BC-N3: a held-chain failure is ROLE-AWARE — unresolved consumer ⇒ {}; Author ⇒ heldView, Architect ⇒ heldIndex, Reviewer ⇒ editDiff', async () => {
  eq(await fields(FAILING(world({ consumerRole: 'config_change_author', refs: [CAP(0)] }), 'task'), { heldBytes: { held: 1 } }), {}, 'consumer never resolved: ');
  eq(await fields(FAILING(world({ consumerRole: 'change_reviewer' }), 'task'), { editApplication: STAMP, finalResponse: FR }), {}, 'consumer never resolved (author dep): ');
  eq(((await fields(FAILING(world({ consumerRole: 'config_change_author' }), 'refs'), { heldBytes: { held: 1 } })).heldView as any)[0].state, 'view-unavailable');
  const arch = await fields(FAILING(world({ consumerRole: 'infra_change_architect' }), 'refs'), { heldBytes: { held: 1 } });
  ok(Array.isArray(arch.heldIndex) && !('heldView' in arch), `architect gets heldIndex, got ${JSON.stringify(arch)}`);
  eq((arch.heldIndex as any)[0].state, 'view-unavailable');
  eq(((await fields(FAILING(reviewer(), 'manifest'), { editApplication: STAMP, finalResponse: FR })).editDiff as any).state, 'could-not-check');
  eq(heldFailureFields({ role: 'config_change_author', leg: { kind: 'leg', variant: false } as never }, { harvester: true, author: false, depExecutionId: 'x' }), {}, 'non-variant consumer: ');
  eq(heldFailureFields({ role: 'change_reviewer', leg: { kind: 'leg', variant: true } as never }, { harvester: true, author: false, depExecutionId: 'x' }), {}, 'role/dependency mismatch: ');
});
test('PC-P2-3: a variant Harvester that held NO file ⇒ ONE named state (heldNone) for the Author and the Architect, rendered inside the quarantine', async () => {
  for (const role of ['config_change_author', 'infra_change_architect']) {
    eq(await fields(world({ consumerRole: role, refs: [] }), { heldBytes: { held: 0, refused: {}, reason: 'capture-off' } }), { heldNone: { state: 'capture-off' } }, `${role}: `);
  }
  eq([heldNoneState({ reason: 'capture-off' }), heldNoneState({ reason: 'no-files' }), heldNoneState({ held: 0, refused: {}, reason: 'no-capture' }),
    heldNoneState({ held: 0, refWrite: 'rolled-back' }), heldNoneState({ held: 2 }), heldNoneState(null)],
    ['capture-off', 'no-files', 'no-capture', 'capture-rolled-back', 'no-held-refs', 'no-held-refs']);
  const w = world({ consumerRole: 'config_change_author', refs: [] }); w.db.heldCaptureRefusal.findMany = async () => [{ toolCallIndex: 0, selector: null, target: 't', path: '/p' }] as never;
  const withRefusal = await fields(w, { heldBytes: { held: 0, refused: { 'no-scope': 1 } } });
  ok(Array.isArray(withRefusal.heldView) && !('heldNone' in withRefusal), 'a refusal still renders as a per-file item');
  eq(renderHeldNone({ state: 'no-files' }), ['', '### Held files — none held by the platform in this run (no-files)',
    'The platform holds no file from this predecessor, so no file can be edited by reference in this run.']);
  const out = renderPipelineContextSection({ chainedFrom: [{ taskId: 't', taskTitle: 'Harvest', agentRole: 'infra_state_harvester', finalResponse: 'H TEXT', source: 'result.json',
    heldNone: { state: 'capture-off' } }] }).join('\n');
  const open = out.indexOf('<prior_output role="context_only">'); const text = out.indexOf('H TEXT'); const none = out.indexOf('### Held files — none held'); const close = out.indexOf('</prior_output>');
  ok(open < text && text < none && none < close, 'order: quarantine > text > none-state > close');
});
// F-N2-1 (b) (owner 2026-10-26): a device read kept as EVIDENCE (`device-read-evidence-only`, D-1) gets NO handle — not shown to the Author,
// not in the Architect's index — while it keeps CONSUMING its number, so every other handle is unchanged (B-L2: H1 Git, H3 device:ceos2).
test('F-N2-1 (b): an evidence-only device read gets no handle; numbering is unchanged; every other refusal keeps its handle', async () => {
  const GITSHA = 'b'.repeat(64);
  const git = { ...CAP(0, GITSHA, '/network/ceos1.cfg'), target: 'github:paichart:paichart-lab-configs' };
  const dev2 = { ...CAP(2, SHA, '/running-config'), target: 'device:ceos2' };
  const evid = { toolCallIndex: 1, selector: '/hosts/ceos1', target: null, path: null, refusal: 'device-read-evidence-only' };
  const handles = harvesterHandles([git, dev2] as never, [evid]);
  eq(handles.map((h) => `${h.handle}:${h.state}`), ['H1:bound', 'H3:bound'], 'B-L2: ');
  eq(harvesterHandles([git, dev2] as never, [{ ...evid, refusal: undefined }]).map((h) => h.handle), ['H1', 'H2', 'H3'], 'no refusal name ⇒ a handle, as before: ');
  for (const r of ['source-not-pinned', 'git-file-not-declared', 'secret-manifest', 'echo-secret-residual', 'device-config-empty', 'path-invalid']) {
    eq(harvesterHandles([git, dev2] as never, [{ ...evid, refusal: r }]).map((h) => `${h.handle}:${h.state}`), ['H1:bound', 'H2:unheld', 'H3:bound'], `${r} keeps its handle: `);
  }
  // Config-sources network step (execution-facts B2 fix 3, 2026-11-04): `live-read-evidence-only` added BY DECISION — a declared evidence read is
  // never an unheld item shown to the Author. A third member is again a decision, never a sweep.
  eq([...HANDLELESS_CAPTURE_REFUSALS], ['device-read-evidence-only', 'live-read-evidence-only'], 'two members, by decision: ');
  // through the chainer (the production read): Author heldView and Architect heldIndex both omit it
  for (const role of ['config_change_author', 'infra_change_architect']) {
    const w = world({ consumerRole: role, refs: [git, dev2], views: { [GITSHA]: VIEW.viewText, [SHA]: VIEW.viewText }, blobs: { [GITSHA]: BASE, [SHA]: BASE } });
    w.db.heldCaptureRefusal.findMany = async () => [evid] as never;
    const f = await fields(w, { heldBytes: { held: 2 } });
    const items = (f.heldView ?? f.heldIndex) as Array<{ handle: string; state?: string }>;
    eq(items.map((i) => i.handle), ['H1', 'H3'], `${role}: `);
  }
  // ONLY evidence-only refusals and nothing held ⇒ the one named state, never an empty list
  const w = world({ consumerRole: 'config_change_author', refs: [] }); w.db.heldCaptureRefusal.findMany = async () => [evid] as never;
  eq(await fields(w, { heldBytes: { held: 0, refused: { 'device-read-evidence-only': 1 } } }), { heldNone: { state: 'no-held-refs' } });
});

test('PC-P2-7: a predecessor text cut mid-fence is CLOSED (same characters) before the held lines; no held lines ⇒ byte-identical', () => {
  const held = [{ handle: 'H1', path: '/x', lineCount: 1, viewText: 'a: 1\n', rewrittenLines: [] }];
  for (const [fence, cut] of [['```', 'HARVEST\n```yaml\nkey: v'], ['~~~', 'HARVEST\n~~~\nkey: v']]) {
    const out = renderPipelineContextSection({ chainedFrom: [{ taskId: 't', taskTitle: 'H', agentRole: 'infra_state_harvester', finalResponse: cut, source: 'result.json', heldView: held }] }).join('\n');
    const before = out.slice(0, out.indexOf('### Held file H1'));
    ok(before.includes(`key: v\n${fence}\n`), `${fence}: the open fence is closed before the held header`);
    const lines = before.slice(before.indexOf('<prior_output role="context_only">')).split('\n').filter((l) => /^[ \t]{0,3}(```|~~~)/.test(l));
    eq(lines.length % 2, 0, `${fence}: fences balanced before the held header — `);
  }
  const closed = 'HARVEST\n```yaml\nkey: v\n```';
  const plainHeld = renderPipelineContextSection({ chainedFrom: [{ taskId: 't', taskTitle: 'H', agentRole: 'x', finalResponse: closed, source: 'result.json', heldView: held }] }).join('\n');
  ok(plainHeld.includes('key: v\n```\n\n### Held file H1'), 'an already-closed fence is not closed twice');
  const open = { chainedFrom: [{ taskId: 't', taskTitle: 'H', agentRole: 'x', finalResponse: 'HARVEST\n```yaml\nkey: v', source: 'result.json' }] };
  ok(renderPipelineContextSection(open).join('\n').includes('key: v\n</prior_output>'), 'no held lines ⇒ the open fence is left exactly as stored (byte-identical non-variant §6)');
});

test('PC-P2-1: the Reviewer sees refusals — a refused file is NAMED in the diff, one refusal fact line, and "no held-file edit was applied" when nothing applied', () => {
  const OLD_HEADING = '### Held-file edits, as the platform applied them (diff recomputed from the held bytes)';
  const NONE_HEADING = '### Held-file edits — no held-file edit was applied (recomputed from the held bytes)';
  const entryFor = (text: string) => {
    const app = computeEditApplication(text, { files: FILES, r9Version: R9_VERSION });
    const stamped = buildEditApplicationFact({ app, heldFiles: FILES, refWrite: 'committed', textSource: 'loop' });
    return { app, entry: editDiffEntryFields({ authorExecutionId: 'cexecH', stamped, files: FILES, r9Version: R9_VERSION, finalResponse: text }) as any };
  };
  // refused-only: the edit's SEARCH is not in the file
  const missing = FR.replace('        endpoint: 0.0.0.0:4317\n=======', '        endpoint: 9.9.9.9:4317\n=======');
  const r = entryFor(missing);
  eq(r.app.refusals.map((x) => x.name), ['search-not-found'], 'fixture: ');
  const out = renderEditDiffEntry(r.entry);
  eq(out[1], NONE_HEADING, 'refused-only heading: ');
  ok(out.some((l) => l.includes('#### H1 — /etc/otelcol/config.yaml · not applied · refused: search-not-found')), `the refused file is named: ${out.join(' | ')}`);
  ok(out.includes('Refused by the platform (not applied): `search-not-found`×1.'), 'the one refusal fact line');
  // no-edits: an empty diff — the heading is the none-applied line and no empty diff line follows
  const ne = entryFor('# Package\nNothing to change.\n');
  eq(ne.entry.diffText, '', 'no-edits diffText: ');
  // Phase 10 panel F3 (AR-B2 / PC-S1 / EF-S4): an OUT-OF-SCOPE Author (THE predicate, carried as authorOutOfScope) renders what was
  // CHECKED, as facts — no verdict, no imperative inside the quarantine — plus the held-files line the Reviewer needs.
  eq(renderEditDiffEntry(ne.entry), ['', '### Held-file edits — none in this package',
    'The package carries no edit under Held File Edits, so the platform applied nothing and there is no diff.',
    'Files the platform held for this leg: H1 (/etc/otelcol/config.yaml).'], 'no-edits (F3): ');
  eq(renderEditDiffEntry({ authorExecutionId: 'x', authorState: 'no-base', authorOutOfScope: true, state: 'base-not-held' } as never),
    ['', '### Held-file edits — none in this package', 'The Author was handed no held file, so the platform applied nothing and there is no diff.'], 'no-base (F3): ');
  eq(renderEditDiffEntry({ authorExecutionId: 'x', authorState: 'demo-pov', authorOutOfScope: true, state: 'demo-pov' } as never)[2],
    "The Author's held-file state is demo-pov and the package carries no edit by reference, so the platform applied nothing and there is no diff.", 'platform state (F3): ');
  // IN scope (no-base WITH held grammar ⇒ the predicate says false) never gets the out-of-scope render (audit A-S1)
  ok(renderEditDiffEntry({ authorExecutionId: 'x', authorState: 'no-base', state: 'base-not-held' } as never)[1] !== '### Held-file edits — none in this package', 'in-scope no-base keeps the named-state render');
  // without the stamped state (a pre-Phase-10 entry) the empty diff keeps its Stage B heading, byte-identical
  const { authorState: _drop, authorOutOfScope: _drop2, heldFiles: _drop3, ...legacy } = ne.entry as Record<string, unknown>;
  eq(renderEditDiffEntry(legacy as never), ['', NONE_HEADING], 'pre-W5 entry renders the heading only (no empty diff line): ');
  // CONTROLS — byte-identical: an applied package with no refusal, and a restore-only package
  const ap = entryFor(FR);
  eq(renderEditDiffEntry(ap.entry), ['', OLD_HEADING, ap.entry.diffText, 'Rollback by reference: restore H1 (the platform restores the held bytes).'], 'applied control: ');
  eq(renderEditDiffEntry({ diffText: '#### H1 · rollback: restore H1 (no edit applied to this file)', refused: {}, applied: 0, rollback: ['H1'] }),
    ['', OLD_HEADING, '#### H1 · rollback: restore H1 (no edit applied to this file)', 'Rollback by reference: restore H1 (the platform restores the held bytes).'], 'restore-only control: ');
  // an applied package that ALSO carries a package-level refusal keeps the applied heading and adds the fact line
  const mixed = renderEditDiffEntry({ diffText: 'D', refused: { 'restore-outside-rollback': 1, 'edits-outside-section': 2 }, applied: 1 });
  eq(mixed, ['', OLD_HEADING, 'D', 'Refused by the platform (not applied): `edits-outside-section`×2, `restore-outside-rollback`×1.'], 'mixed: ');
});

test('V-6 A15: on a variant leg (its four roles) hoistRollbackContainment\'s `includes(\'author\')` picks the SAME child as the exact-role selector', () => {
  const roles = ['infra_state_harvester', 'infra_change_architect', 'config_change_author', 'change_reviewer'];
  const kids = roles.map((r, i) => ({ id: `k${i}`, title: `Phase ${i}`, agentRole: r }));
  const legacy = kids.find((c) => (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author'));
  const exact = kids.find((c) => c.agentRole === 'config_change_author');
  eq(legacy?.id, exact?.id);
});

(async () => {
  for (const { d, fn } of pending) {
    try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++; }
  }
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
