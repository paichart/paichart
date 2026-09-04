#!/usr/bin/env npx ts-node
/**
 * test-protocol-stamp-guards.ts — WS2 Phase A D3: the write-protection pins.
 *
 * THE LOAD-BEARING PIN IS THE ERASE PIN (panel: "nothing in the repo checks this today"):
 * key-presence rejection alone MOVES R1 — `metadata: {}` on a replace surface erased the stamp
 * with no key written and no error. These pins assert the merge semantics AND the guard, both
 * directions (forge AND erase — the two-axes rule).
 *
 * CI-safe: pure-function + source-text only. The prisma import chain needs the fake-cred stub
 * BEFORE imports (feedback_ci_database_url_transitive).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://fake:fake@localhost:5432/fake';

import * as fs from 'fs';
import * as path from 'path';
import { TaskService } from '../lib/tasks/services/task';

// assembleUpdateData is deliberately private; the pins exercise it as a pure function.
const assemble = (TaskService as any).assembleUpdateData.bind(TaskService) as (d: any, j: any) => any;
import { enforceProtocolStampImmutable, PLATFORM_STAMP_KEYS } from '../lib/tasks/services/protected-task-metadata';
import { ProtocolStampImmutableError } from '../lib/errors';
import { CreateTaskSchema, UpdateTaskSchema } from '../lib/validation/task-validation';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf-8');

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const STORED = {
  protocol: 'pov-program-protocol',
  protocolResolvedAt: '2026-08-17T00:00:00.000Z',
  pipelineStageId: 'stage-1',
  qualityGate: { outcome: 'approved' },
  completedWithDependencyOverride: true, // the guard-written genuine audit fact
};
const jsonb = { inputContext: null, mcpContext: null, mcpMetadata: null, metadata: STORED };

// ═══ THE ERASE PIN (assembleUpdateData C5) ══════════════════════════════════════════════════
test('ERASE: an unrelated metadata write PRESERVES every platform key (the pin R1 hinged on)', () => {
  const out = assemble({ metadata: { unrelated: 1 } } as any, jsonb) as any;
  assert(out.metadata.protocol === 'pov-program-protocol', 'protocol survived');
  assert(out.metadata.protocolResolvedAt === STORED.protocolResolvedAt, 'resolvedAt survived');
  assert(out.metadata.pipelineStageId === 'stage-1', 'pipelineStageId survived');
  assert(JSON.stringify(out.metadata.qualityGate) === JSON.stringify(STORED.qualityGate), 'qualityGate survived');
  assert(out.metadata.unrelated === 1, 'the caller\'s own key landed');
});

test('ERASE sibling: the stored GENUINE completedWithDependencyOverride survives a metadata write (the consult §2 split — `= undefined` under merge would have erased it)', () => {
  const out = assemble({ metadata: { x: 1 } } as any, jsonb) as any;
  assert(out.metadata.completedWithDependencyOverride === true, 'guard-written audit fact must survive');
});

test('strip split: a FORGED inbound completedWithDependencyOverride is dropped while the stored one survives', () => {
  const out = assemble({ metadata: { completedWithDependencyOverride: false } } as any, jsonb) as any;
  assert(out.metadata.completedWithDependencyOverride === true, 'inbound forgery dropped, stored preserved');
});

test('strip split: `type` stays delete-ALWAYS (a stale stored metadata.type is removed by the merge)', () => {
  const out = assemble(
    { metadata: { x: 1 } } as any,
    { ...jsonb, metadata: { ...STORED, type: 'STALE_MIRROR' } }
  ) as any;
  assert(!('type' in out.metadata), 'legacy type mirror must not survive a merge');
});

test('D4: top-level metadata: null is a NO-OP, not a clear', () => {
  const out = assemble({ metadata: null } as any, jsonb) as any;
  assert(!('metadata' in out), 'null must not produce a metadata write at all');
});

// ═══ FORGE / ECHO (the guard itself, via assembleUpdateData and directly) ═══════════════════
test('FORGE: a DIFFERING protocol throws PROTOCOL_STAMP_IMMUTABLE (clean 400 shape)', () => {
  let threw: unknown = null;
  try { assemble({ metadata: { protocol: 'terraform-iac-protocol' } } as any, jsonb); }
  catch (e) { threw = e; }
  assert(threw instanceof ProtocolStampImmutableError, 'must throw the typed error');
  assert((threw as ProtocolStampImmutableError).code === 'PROTOCOL_STAMP_IMMUTABLE', 'code');
});

test('FORGE: null over a stamp is a CHANGE, not a clear — throws (clearing is platform re-resolution)', () => {
  let threw = false;
  try { assemble({ metadata: { protocol: null } } as any, jsonb); } catch { threw = true; }
  assert(threw, 'null-over-stamp must throw');
});

test('FORGE: a NOVEL stamp on an unstamped task throws (forge-at-update pre-stamp)', () => {
  let threw = false;
  try { assemble({ metadata: { protocol: 'pov-program-protocol' } } as any, { ...jsonb, metadata: {} }); }
  catch { threw = true; }
  assert(threw, 'novel stamp must throw');
});

test('ECHO: an EQUAL round-trip is accepted silently and the stored value governs', () => {
  const out = assemble(
    { metadata: { protocol: 'pov-program-protocol', protocolResolvedAt: STORED.protocolResolvedAt, other: 2 } } as any,
    jsonb
  ) as any;
  assert(out.metadata.protocol === 'pov-program-protocol' && out.metadata.other === 2, 'echo accepted, merge landed');
});

test('guard unit: strip-warn mode strips the differing key, reports it, never throws (the F5 POV-bulk exception)', () => {
  const incoming: Record<string, unknown> = { protocol: 'evil-protocol', keep: 1 };
  const warns: unknown[] = [];
  const v = enforceProtocolStampImmutable(incoming, { protocol: 'pov-program-protocol' }, 't1', {
    surface: 'pov-bulk-save', onViolation: 'strip-warn', warn: (f) => warns.push(f),
  });
  assert(v.length === 1 && !('protocol' in incoming) && incoming.keep === 1 && warns.length === 1,
    `strip-warn shape wrong: ${JSON.stringify({ v, incoming, warns })}`);
});

test('guard unit: PLATFORM_STAMP_KEYS covers exactly the pair', () => {
  assert(JSON.stringify([...PLATFORM_STAMP_KEYS]) === JSON.stringify(['protocol', 'protocolResolvedAt']), 'key set');
});

// ═══ CREATE-FORGERY (schema layer) ══════════════════════════════════════════════════════════
test('CREATE: CreateTaskSchema rejects metadata.protocol with a usable path (born-forged closed)', () => {
  const r = CreateTaskSchema.safeParse({ title: 'x', povId: 'c'.padEnd(25, '1'), metadata: { protocol: 'pov-program-protocol' } });
  assert(!r.success, 'must fail');
  const paths = (r as any).error.errors.map((e: any) => e.path.join('.'));
  assert(paths.some((p: string) => p.endsWith('protocol')), `path missing: ${paths.join(',')}`);
});

test('CREATE: clean metadata still passes the create schema', () => {
  const r = CreateTaskSchema.safeParse({ title: 'x', povId: 'c'.padEnd(25, '1'), metadata: { anything: 1 } });
  assert(r.success, JSON.stringify((r as any).error?.errors ?? {}));
});

test('LAYERING (deliberate): UpdateTaskSchema does NOT schema-reject the stamp — the HANDLER layer does (echo-equality needs `existing`, which Zod cannot see)', () => {
  const r = UpdateTaskSchema.safeParse({ metadata: { protocol: 'x-protocol' } });
  assert(r.success, 'update schema must pass it through to the handler-layer compare');
});

// ═══ SOURCE-TEXT WIRING (every surface, so a new/missed surface fails the test) ═════════════
test('WIRING: all four update surfaces call the ONE shared guard (no per-site hand copies — the wave-3 lesson)', () => {
  const sites: Array<[string, number]> = [
    ['lib/tasks/services/task.ts', 1],
    ['lib/mcp/tasks/action/handlers/task/task-update-handler.ts', 1],
    ['lib/pov/handlers/put.ts', 3], // update branch + 2 create branches
    ['lib/services/taskBulkService.ts', 1],
  ];
  for (const [f, n] of sites) {
    const c = (read(f).match(/enforceProtocolStampImmutable\(/g) || []).length;
    assert(c === n, `${f}: expected ${n} guard call(s), found ${c}`);
  }
});

test('WIRING §5 (the consult trap): the completion-core caller selects metadata AND the fallback literal carries it', () => {
  const src = read('lib/tasks/services/task.ts');
  const win = src.slice(src.indexOf('completeTaskTerminally(prisma'), src.indexOf('completeTaskTerminally(prisma') + 1600);
  assert(win.includes('mcpMetadata: true, metadata: true'), 'in-tx select must include metadata — else every terminal completion full-erases task.metadata');
  assert(win.includes('mcpMetadata: null, metadata: null'), 'fallback literal must include metadata');
});

test('WIRING: put.ts update write is a MERGE over the stored row + the select fetches metadata', () => {
  const src = read('lib/pov/handlers/put.ts');
  assert(src.includes('status: true, type: true, metadata: true'), 'existingTasks select must fetch metadata');
  assert(src.includes('...((existingRow?.metadata as Record<string, unknown> | null) ?? {}), ...taskMetadata'),
    'the mass-erasure surface must merge, not replace');
});

test('WIRING: bulk merges metadata on BOTH paths (non-terminal per-row + terminal buildUpdateData)', () => {
  const src = read('lib/services/taskBulkService.ts');
  const merges = (src.match(/metaRow\?\.metadata as Record<string, unknown> \| null\) \?\? \{\}\)/g) || []).length;
  assert(merges === 2, `expected 2 bulk metadata merges, found ${merges}`);
});

test('WIRING A-4: the phase-scoped route returns the guard 400 with its code (was an opaque 500)', () => {
  const src = read('app/api/pov/[povId]/phase/[phaseId]/task/[taskId]/route.ts');
  assert(src.includes('ProtocolStampImmutableError') && src.includes("status: 400"), 'typed 400 branch missing');
  assert(src.includes("startsWith('Invalid task data:')"), 'validation-failure 400 branch missing');
});

test('WIRING: engine writers stay guard-EXEMPT by construction (no guard import in the platform writers)', () => {
  for (const f of [
    'lib/services/execution-terminal-persist.ts',
    'lib/agents/harness/prepare-task-for-execution.ts',
  ]) {
    assert(!read(f).includes('enforceProtocolStampImmutable'),
      `${f} must not carry the client-surface guard — platform channels are exempt by construction, not allowlist`);
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
