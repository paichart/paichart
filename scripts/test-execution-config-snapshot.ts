#!/usr/bin/env ts-node
/**
 * Execution Config Snapshot Tests — convergence Phase 5b-iii gate (I-10)
 *
 * The model-parameter precedence chain now resolves ONCE, inside
 * createAgentExecution, and freezes into `execution.config` — both paths read
 * the frozen row. This gate pins:
 *   1. The chain semantics (pure resolveExecutionModelParams): task-meta wins;
 *      a bare `{}` FALLS THROUGH (the 506ddd91 GUI-blocker class); explicit
 *      caller params beat the template; template params via
 *      buildTemplateModelParameters; nothing → {} (fail-loud downstream).
 *   2. Merge idempotence for pre-resolved callers: `{...resolved, ...config}`
 *      leaves a rich-builder config byte-equal (its flat keys came from the
 *      same chain), so the five rich callers are unaffected by the chokepoint.
 *   3. Source pins: the create chokepoint freezes `frozenConfig`; the stream
 *      reads `execution.config` and carries NO live chain (no
 *      buildTemplateModelParameters, no nonEmptyParams); engine untouched.
 *
 * CI-safe: stub DATABASE_URL before imports that reach lib/prisma.
 *
 * Created: 2026-07-05
 * Plan: phase-5-confidence-assessment.md §5b-iii (template-system Q3a ruling)
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import * as path from 'path';
import { resolveExecutionModelParams, buildTemplateModelParameters } from '../lib/services/llm/template-model-params';

console.log('🧪 Execution Config Snapshot Tests (Phase 5b-iii / I-10 gate)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; }
  catch (e) { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
function assertEq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual); const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}:\n   expected ${b}\n   actual   ${a}`);
}

const TEMPLATE = {
  promptTemplate: 'You are a specialist.',
  maxRetries: 5,
  timeout: 600,
  metadata: { modelParameters: { model: 'claude-sonnet-5', temperature: 0.2 } },
};

// ── 1. Chain semantics ────────────────────────────────────────────────────────

test('tier 1: non-empty task.metadata.modelParameters wins outright', () => {
  const r = resolveExecutionModelParams({
    taskMetadata: { modelParameters: { model: 'claude-haiku-4-5', temperature: 0.9 } },
    explicitParams: { model: 'ignored' },
    template: TEMPLATE,
  });
  assertEq(r, { model: 'claude-haiku-4-5', temperature: 0.9 }, 'task meta wins');
});

test('506ddd91 class: bare {} at BOTH upper tiers falls through to the template', () => {
  const r = resolveExecutionModelParams({
    taskMetadata: { modelParameters: {} },
    explicitParams: {},
    template: TEMPLATE,
  });
  assertEq(r, buildTemplateModelParameters(TEMPLATE), 'template chain output');
  assert(r.model === 'claude-sonnet-5', 'template-level model resolves (the GUI-blocker regression case)');
  assert(r.maxRetries === 5 && r.timeout === 600, 'template maxRetries/timeout carried');
});

test('tier 2: explicit caller params beat the template when task meta is absent', () => {
  const r = resolveExecutionModelParams({
    taskMetadata: null,
    explicitParams: { model: 'claude-opus-4-8' },
    template: TEMPLATE,
  });
  assertEq(r, { model: 'claude-opus-4-8' }, 'explicit params win over template');
});

test('no meta, no explicit, no template → {} (normalizeModelConfig fails loud downstream, never silent)', () => {
  assertEq(resolveExecutionModelParams({ taskMetadata: null, explicitParams: undefined, template: null }), {}, 'empty resolution');
});

test('hostile shapes: array/string metadata and array explicit params are ignored, not crashed on', () => {
  const r = resolveExecutionModelParams({ taskMetadata: ['x'], explicitParams: ['y'], template: TEMPLATE });
  assertEq(r, buildTemplateModelParameters(TEMPLATE), 'arrays fall through');
  const r2 = resolveExecutionModelParams({ taskMetadata: 'junk', explicitParams: 'junk', template: null });
  assertEq(r2, {}, 'strings fall through to empty');
});

// ── 2. Merge idempotence for the five pre-resolved (rich) callers ─────────────

test('idempotence: a rich-builder config passes through the chokepoint merge byte-equal', () => {
  // Replicate what buildRichExecutionConfig produces: the SAME chain output spread
  // flat into a wider config. The chokepoint merge {...resolved, ...config} must
  // leave it identical — the rich callers pre-resolved from the same inputs.
  const chainOut = resolveExecutionModelParams({ taskMetadata: null, explicitParams: null, template: TEMPLATE });
  const richConfig = {
    agentRole: 'specialist',
    prompt: 'do the thing',
    maxRetries: 3,          // task-level value deliberately DIFFERENT from template's 5
    timeout: 300000,
    ...chainOut,
    mcpContext: null,
    metadata: { triggeredBy: 'task-ready-reactor' },
  };
  const frozen = { ...chainOut, ...richConfig };
  // Value-idempotence, key-order-insensitive: execution.config is JSONB (Postgres
  // does not preserve key order) and every consumer reads by key.
  const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  assertEq(sortKeys(frozen), sortKeys(richConfig), 'caller config wins every collision — value-idempotent');
});

test('raw-GUI config gains the resolved flat keys without losing its own fields', () => {
  const rawGuiConfig = { role: 'technical_consultant', prompt: 'Design it.', parameters: {} };
  const resolved = resolveExecutionModelParams({ taskMetadata: {}, explicitParams: rawGuiConfig.parameters, template: TEMPLATE });
  const frozen: Record<string, any> = { ...resolved, ...rawGuiConfig };
  assert(frozen.model === 'claude-sonnet-5' && frozen.systemPrompt === 'You are a specialist.', 'chain keys frozen in');
  assert(frozen.role === 'technical_consultant' && frozen.prompt === 'Design it.', 'raw fields preserved');
});

// ── 3. Source pins ────────────────────────────────────────────────────────────

const createSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agent-execution-create.ts'), 'utf8');
const streamSrc = fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');
const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');

test('chokepoint: create resolves once and writes the FROZEN config to the row', () => {
  assert(createSrc.includes('const resolved = resolveExecutionModelParams({'), 'create does not call the resolver');
  assert(createSrc.includes('frozenConfig = { ...resolved, ...args.config };'), 'merge rule (caller wins) missing');
  assert(createSrc.includes('config: frozenConfig as any,'), 'row write does not use the frozen config');
  assert(!createSrc.includes('config: args.config as any,'), 'raw args.config write survives — the snapshot is bypassable');
});

test('stream: live chain retired — reads execution.config, no buildTemplateModelParameters / nonEmptyParams', () => {
  assert(streamSrc.includes('(execution.config as Record<string, any> | null) ?? {}'), 'stream does not read the frozen config');
  assert(!streamSrc.includes('buildTemplateModelParameters'), 'stream live template resolution re-introduced (506ddd91 class returns)');
  assert(!streamSrc.includes('nonEmptyParams'), 'stream local chain helper re-introduced');
});

test('engine: untouched — still normalizes the frozen execution config', () => {
  assert(engineSrc.includes('normalizeModelConfig(config'), 'engine no longer reads execution.config chain');
  assert(!engineSrc.includes('resolveExecutionModelParams'), 'engine must not re-resolve — the row is frozen');
});

// ── BC-T6-1 (T6 boundary audit, 2026-07-17): the frozen config must not misrepresent the run ──────
// The frozen snapshot said "no chainedFrom" while the execution's runtime prompt demonstrably carried
// §6, because `{...resolved, ...args.config}` let a caller's PRE-chain inputContext win (the
// reactor-task-ready caller copies pre-chain; the retrigger reactor copies post-chain — they
// DISAGREED). A forensic audit keying on the frozen config concludes the execution never received
// chained context — during the T6 audit that reading would have FALSELY REFUTED the round's core
// claim. LOW functional / MEDIUM forensic.

test('BC-T6-1: frozen config adopts prepareTaskForExecution\'s authoritative post-chain inputContext', () => {
  assert(createSrc.includes('inputContext: chainedInputContext'),
    'the frozen config no longer overrides inputContext with the post-chain value — a caller\'s pre-chain copy can win again');
});

test('BC-T6-1: the override runs AFTER the args-config-wins merge (order is the whole fix)', () => {
  const mergeIdx = createSrc.indexOf('frozenConfig = { ...resolved, ...args.config }');
  const fixIdx = createSrc.indexOf('inputContext: chainedInputContext');
  assert(mergeIdx !== -1, 'the args-config-wins merge vanished — re-check this pin');
  assert(fixIdx > mergeIdx, 'the inputContext override must come AFTER the merge, else args.config wins again');
});

test('BC-T6-1: the override is guarded on chainedInputContext (no chaining ⇒ caller value untouched)', () => {
  assert(createSrc.includes('if (chainedInputContext) {'),
    'the override must be guarded — an unguarded spread would null out inputContext on skipChaining/no-deps runs');
});

test('BC-T6-1: the override lands before the execution row is created (the snapshot is what persists)', () => {
  const fixIdx = createSrc.indexOf('inputContext: chainedInputContext');
  // Match the CALL, not the doc-comment above it that also names the symbol (that comment sits at the
  // top of the file and made an indexOf('prisma.agentExecution.create') match resolve before the fix).
  const createIdx = createSrc.indexOf('await prisma.agentExecution.create({');
  assert(fixIdx !== -1 && createIdx !== -1 && fixIdx < createIdx,
    'the override must precede agentExecution.create — otherwise the stale copy is what gets frozen');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
