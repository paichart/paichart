#!/usr/bin/env ts-node
/**
 * Platform-run-keys guard tests (panel 2026-08-19 —
 * cline_docs/reviews/platform-owned-metadata-keys-2026-08-19/SYNTHESIS.md D5, pins P1–P8).
 *
 * The STALE-CLOBBER axis: the POV editor round-trips every task's form-load-time metadata
 * snapshot, and before this guard the stale copy WON at the merge (verified live class: a stale
 * pipelineStageId silently breaks the retrigger reactor's lookup → pipeline hangs). These pins
 * hold the fix's load-bearing properties:
 *   - editor surfaces DROP run keys (stored governs), warn only on STRUCTURAL differ;
 *   - the MCP path keeps writing every run key (the harness's own channel — P4 is the pin that
 *     stops a future "consistency" edit from breaking every pipeline);
 *   - a NEW platform key fails P7 until classified (the list cannot rot silently).
 *
 * CI-safe: stub DATABASE_URL before imports that could reach lib/prisma.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import * as path from 'path';
import {
  PLATFORM_RUN_KEYS,
  PLATFORM_STAMP_KEYS,
  AUDIT_STRIP_KEYS,
  dropPlatformRunKeys,
  stripAuditFacts,
} from '../lib/tasks/services/protected-task-metadata';

let passed = 0, failed = 0;
function test(d: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn)
    .then(() => { console.log(`✅ ${d}`); passed++; })
    .catch((e) => { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; });
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const warns: Array<Record<string, unknown>> = [];
const warn = (f: Record<string, unknown>, _m: string) => { warns.push(f); };

(async () => {

// ── P1: exact key set — the list cannot be weakened (or grown) silently ─────────────────────
await test('P1: PLATFORM_RUN_KEYS is exactly the 19 panel-verified keys', () => {
  const expected = [
    'qualityGate', 'pipelineStageId', 'duplicateHalt', 'cannotRun', 'cannotRunPersistedAt',
    'deliverableSourceTaskId', 'suppressDefaultReportMd', 'programReleasable',
    'programConfidence', 'programConfidenceChildren', 'programConfidenceMissing',
    'blockedByUpstreamFailure', 'failedDependencyTaskId', 'truncationStall',
    'requiresInterfaceContract', 'confidenceScore', 'completionSummary',
    'mcpStorageVersion', 'mcpStorageLocation',
  ].sort();
  assert(JSON.stringify([...PLATFORM_RUN_KEYS].sort()) === JSON.stringify(expected),
    `list drifted: ${JSON.stringify([...PLATFORM_RUN_KEYS].sort())}`);
});

// ── P2: clobber — stale DIFFERING value dropped, stored governs, ONE warn ───────────────────
await test('P2: stale differing qualityGate object → dropped from incoming + one differ-warn with the new code', () => {
  warns.length = 0;
  const incoming: Record<string, unknown> = {
    title: 'x',
    qualityGate: { outcome: 'approved', reviewerScore: 92 },   // stale prior-run copy
    pipelineStageId: 'old-stage',
  };
  const stored = { qualityGate: { outcome: 'needs-revision', reviewerScore: 72 }, pipelineStageId: 'new-stage' };
  const differed = dropPlatformRunKeys(incoming, stored, 't1', { surface: 'test', warn });
  assert(!('qualityGate' in incoming) && !('pipelineStageId' in incoming), 'run keys removed from incoming');
  assert('title' in incoming, 'non-run keys untouched');
  assert(differed.length === 2 && warns.length === 2, `differ warns: ${warns.length}`);
  assert(warns.every(w => w.errorCode === 'PLATFORM_RUN_KEY_STALE_DROP'), 'new error code, never PROTOCOL_STAMP_IMMUTABLE');
});

// ── P3: echo silence — deep-equal, different reference ⇒ NO warn (the noise trap, §6a) ──────
await test('P3: deep-equal different-reference object echo → dropped, ZERO warns (=== would be 100% noise)', () => {
  warns.length = 0;
  const storedGate = { outcome: 'approved', reviewerScore: 95, reviewerPresent: true };
  const incoming: Record<string, unknown> = { qualityGate: JSON.parse(JSON.stringify(storedGate)) };
  const differed = dropPlatformRunKeys(incoming, { qualityGate: storedGate }, 't2', { surface: 'test', warn });
  assert(!('qualityGate' in incoming), 'echo still dropped (stored governs by omission)');
  assert(differed.length === 0 && warns.length === 0, `echo must be SILENT — got ${warns.length} warns`);
});

// ── P4: MCP exemption — mutation-pinned at the source level ─────────────────────────────────
await test('P4: MCP task.update handler does NOT call dropPlatformRunKeys (the harness channel stays open)', () => {
  const src = read('lib/mcp/tasks/action/handlers/task/task-update-handler.ts');
  // Match a CALL or an import — the handler's own comment legitimately NAMES the function
  // while documenting that it must never be called here.
  assert(!/dropPlatformRunKeys\s*\(/.test(src) && !/import[^;]*dropPlatformRunKeys/.test(src),
    'dropPlatformRunKeys appeared in the MCP task-update handler — this BREAKS EVERY PIPELINE (the harness writes qualityGate/pipelineStageId through this path). Remove it; see protected-task-metadata.ts SURFACE MAP.');
  assert(src.includes('stripAuditFacts'), 'audit strip must remain on the MCP surface (class (c) applies there)');
  const complete = read('lib/mcp/tasks/action/handlers/task/task-complete-handler.ts');
  assert(!/dropPlatformRunKeys\s*\(/.test(complete), 'task.complete adapter must stay run-key-open (writes confidenceScore/completionSummary)');
});

// ── P5: pass-through — editor-owned + operator keys survive the drop ────────────────────────
await test('P5: modelParameters / mcpConfiguration / duplicateAcknowledged pass through untouched', () => {
  warns.length = 0;
  const incoming: Record<string, unknown> = {
    modelParameters: { model: 'x' }, mcpConfiguration: { a: 1 }, duplicateAcknowledged: 'stage-123',
  };
  dropPlatformRunKeys(incoming, {}, 't3', { surface: 'test', warn });
  assert('modelParameters' in incoming && 'mcpConfiguration' in incoming && 'duplicateAcknowledged' in incoming,
    'excluded keys must survive (editor core function + operator clearance flow)');
  assert(warns.length === 0, 'no warns for excluded keys');
});

// ── P6: audit-strip centralization equivalence ───────────────────────────────────────────────
await test('P6: stripAuditFacts removes completedWithDependencyOverride; no inline deletes remain outside the module', () => {
  const incoming: Record<string, unknown> = { completedWithDependencyOverride: true, other: 1 };
  const w: unknown[] = [];
  stripAuditFacts(incoming, (f) => w.push(f));
  assert(!('completedWithDependencyOverride' in incoming) && 'other' in incoming, 'strip works');
  assert(w.length === 1, 'presence warns when a sink is given');
  for (const f of ['lib/tasks/services/task.ts', 'lib/pov/handlers/put.ts',
    'lib/services/taskBulkService.ts', 'lib/mcp/tasks/action/handlers/task/task-update-handler.ts']) {
    const src = read(f);
    assert(!/delete\s+\S*completedWithDependencyOverride/.test(src),
      `${f} still carries an inline audit delete — the six-site migration regressed`);
  }
});

// ── Wiring pins: exact drop-call counts per surface file ────────────────────────────────────
await test('WIRING: dropPlatformRunKeys called at exactly the five editor seams (task.ts 1, put.ts 3, bulk 1)', () => {
  const counts: Array<[string, number]> = [
    ['lib/tasks/services/task.ts', 1],
    ['lib/pov/handlers/put.ts', 3],
    ['lib/services/taskBulkService.ts', 1],
  ];
  for (const [f, n] of counts) {
    const c = (read(f).match(/dropPlatformRunKeys\(/g) || []).length;
    assert(c === n, `${f}: expected ${n} dropPlatformRunKeys call(s), found ${c}`);
  }
});

await test('ORDERING: at every seam the stamp guard runs BEFORE the run-key drop (forgery still 400s first)', () => {
  for (const f of ['lib/tasks/services/task.ts', 'lib/pov/handlers/put.ts', 'lib/services/taskBulkService.ts']) {
    const src = read(f);
    let from = 0;
    while (true) {
      const d = src.indexOf('dropPlatformRunKeys(', from);
      if (d === -1) break;
      const before = src.lastIndexOf('enforceProtocolStampImmutable(', d);
      assert(before !== -1 && before < d, `${f}: a drop site has no stamp guard before it`);
      from = d + 1;
    }
  }
});

// ── P7: the new-key classification gate — an unclassified platform key fails until classified ─
await test('P7: every metadata key the seed prescribes or an engine writer touches is classified', () => {
  const CLASSIFIED = new Set<string>([
    ...PLATFORM_RUN_KEYS, ...PLATFORM_STAMP_KEYS, ...AUDIT_STRIP_KEYS,
    'duplicateAcknowledged',                 // OPERATOR clearance (human-written; excluded by design)
    'modelParameters', 'mcpConfiguration',   // EDITOR-owned
  ]);
  const EXEMPT = new Set<string>([
    'harnessTaskId',   // run-key-exempt: STAGE metadata, not task metadata (put.ts:899-908 verified no editor exposure)
    'workflowResult',  // run-key-exempt: written by workflowEngine THROUGH the funnel — listing it would erase its own writer's output (panel V5)
    'type',            // legacy mirror, deleted-always inline at the funnel
  ]);
  // Nested keys covered by their top-level carrier (panel: shallow-only rule):
  const NESTED = new Set<string>(['outcome', 'reviewerScore', 'reviewerPresent', 'existingStage', 'detectedAt']);

  const stripStrings = (s: string) => s.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const found = new Map<string, string>(); // key -> where

  // (1) seed dotted refs + prescription object-literals (strings stripped — 'superseded:' inside
  //     a cannotRun VALUE string is prose, not a key; measured 2026-08-19).
  const seed = read('scripts/seed-protocol-prompts.ts');
  for (const m of seed.matchAll(/metadata\.([a-zA-Z]+)/g)) found.set(m[1], 'seed dotted');
  for (const m of seed.matchAll(/metadata:\s*\{([^}]*)/g)) {
    for (const k of stripStrings(m[1]).matchAll(/([a-zA-Z]+)\s*:/g)) found.set(k[1], 'seed literal');
  }
  // (2) engine/handler writer files, dotted refs.
  for (const f of [
    'lib/services/execution-terminal-persist.ts', 'lib/services/mark-forward-cone.ts',
    'lib/services/task-can-never-run-persist.ts', 'lib/tasks/services/complete-task-terminally.ts',
    'lib/mcp/tasks/action/handlers/task/task-update-handler.ts',
    'lib/mcp/tasks/action/handlers/task/task-create-handler.ts',
    'lib/mcp/tasks/action/handlers/task/task-complete-handler.ts',
  ]) {
    for (const m of read(f).matchAll(/metadata\.([a-zA-Z]+)/g)) found.set(m[1], f);
  }

  const unclassified = [...found.entries()]
    .filter(([k]) => !CLASSIFIED.has(k) && !EXEMPT.has(k) && !NESTED.has(k));
  assert(unclassified.length === 0,
    `UNCLASSIFIED platform metadata key(s): ${unclassified.map(([k, w]) => `${k} (${w})`).join(', ')} — ` +
    `classify each in protected-task-metadata.ts (RUN/STAMP/AUDIT/OPERATOR/EDITOR) or add a reasoned EXEMPT entry here. ` +
    `This gate exists so a new protocol prescription or engine writer cannot mint an unprotected key.`);
  // Bidirectional floor: the extraction must keep finding the known universe (an empty scan = a broken extractor, not a clean tree).
  assert(found.size >= 12, `extraction degraded: only ${found.size} keys found (expected >= 12) — the P7 scanner itself drifted`);
});

// ── P8: the reactor-seam tie — the guarded key is still the consumed key ────────────────────
await test('P8: the retrigger reactor still keys on metadata->>pipelineStageId AND pipelineStageId is in the drop list', () => {
  const reactor = read('lib/services/pipelineRetriggerReactorService.ts');
  assert(/metadata.*pipelineStageId|pipelineStageId/.test(reactor), 'reactor no longer references pipelineStageId — re-verify the hang mechanism and this pin');
  assert((PLATFORM_RUN_KEYS as readonly string[]).includes('pipelineStageId'),
    'pipelineStageId left the drop list — the verified silent-hang clobber (panel §1) is unguarded again');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
