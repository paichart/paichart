#!/usr/bin/env ts-node
/**
 * TEST — Axis 3 context-builder parity (2026-07-07).
 *
 * The structural no-regression proof for the merged `buildContextSummary`: the ENGINE task shape (DIRECT
 * pov/phase/stage) and the STREAM task shape (nested stage.phase.pov) built from the SAME data must produce a
 * BYTE-IDENTICAL `${contextualInformation}` block — that's what "one shared builder, both paths converge" means.
 * Also pins the exact golden string so a future edit that drops/reorders a line is caught.
 *
 * CI-safe: stub DATABASE_URL (the builder is DB-free, but the module chain may reach lib/prisma).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import { buildContextSummary } from '@/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

console.log('\n🧪 TEST — Axis 3 context-builder parity\n');

// Same underlying data, two hydration shapes.
const pov = { id: 'pov-1', title: 'Meridian Trading Fabric', status: 'ACTIVE', customerName: 'Meridian Capital', objective: 'Prove low-latency fabric', solution: 'Arista + EVPN' };
const phase = { id: 'phase-1', name: 'Validation & Handover', type: 'REVIEW' };
const stage = { id: 'stage-1', name: 'Cutover Runbook', order: 3 };
const taskCore = { id: 'task-1', title: 'Draft cutover steps', description: 'Write the runbook', priority: 'HIGH', assignee: { name: 'Steve Terry' } };

// ENGINE shape: direct pov/phase/stage; stage has NO nested phase (canonical select = id/name/order).
const engineTask = { ...taskCore, pov, phase, stage };
// STREAM shape: nested stage.phase.pov full row; NO direct pov/phase.
const streamTask = { ...taskCore, stage: { ...stage, phase: { ...phase, pov } } };

const GOLDEN = [
  '**Task Context:**',
  '- **Your Task ID**: `task-1` ← use this literal string in tool calls',
  '- **Your Stage ID**: `stage-1`',
  '- **Your Phase ID**: `phase-1`',
  '- **Your POV ID**: `pov-1`',
  '- **POV**: Meridian Trading Fabric (ACTIVE)',
  '- **Customer**: Meridian Capital',
  '- **Objective**: Prove low-latency fabric',
  '- **Solution**: Arista + EVPN',
  '- **Phase**: Validation & Handover (REVIEW)',
  '- **Stage**: Cutover Runbook [position 3]',
  '- **Task**: Draft cutover steps (Priority: HIGH)',
  '- **Description**: Write the runbook',
  '- **Assignee**: Steve Terry',
].join('\n');

console.log('── parity: engine-shape === stream-shape (the convergence proof) ──');
const engineOut = buildContextSummary(engineTask);
const streamOut = buildContextSummary(streamTask);
ok(engineOut === streamOut, 'ENGINE (direct relations) and STREAM (nested stage.phase.pov) produce a BYTE-IDENTICAL block');

console.log('\n── golden string (pins the exact block + order) ──');
ok(engineOut === GOLDEN, 'engine output === golden');
if (engineOut !== GOLDEN) console.log('--- got ---\n' + engineOut + '\n--- want ---\n' + GOLDEN);
ok(streamOut === GOLDEN, 'stream output === golden');

console.log('\n── the anti-hallucination ID block is present on BOTH paths (the parked-regression guard) ──');
ok(engineOut.includes('**Your Task ID**: `task-1` ← use this literal string'), 'engine gained the framed Task ID block');
ok(engineOut.includes('**Your Phase ID**: `phase-1`') && engineOut.includes('**Your POV ID**: `pov-1`'), 'engine gained Phase + POV IDs');
ok(engineOut.includes('**Customer**: Meridian Capital'), 'stream/engine both carry the business lines');
ok(engineOut.includes('**Phase**: Validation & Handover (REVIEW)'), 'phase.type renders the real enum (not "(Unknown)")');

console.log('\n── dropped lines never render ──');
const dropped = ['Revenue', 'Technical Team', 'Session', 'Available Tools', 'Owner (SE)'];
for (const d of dropped) ok(!engineOut.includes(d), `dropped: no "${d}" line`);

console.log('\n── guards: partial/empty inputs skip gracefully ──');
ok(buildContextSummary({ id: 'x', title: 'Bare' }) === '**Task Context:**\n- **Your Task ID**: `x` ← use this literal string in tool calls\n- **Task**: Bare', 'minimal task → only guarded lines render');
ok(buildContextSummary({}) === 'Context will be provided during task execution.', 'empty task → fallback sentinel');
// optional-field omission (no status/type/order/priority/customer) still renders cleanly
const lean = buildContextSummary({ id: 't', title: 'T', pov: { id: 'p', title: 'P' }, phase: { id: 'ph', name: 'Ph' }, stage: { id: 's', name: 'S' } });
ok(!lean.includes('(') && !lean.includes('[position'), 'no status/type/order/priority → no stray "( )" or "[position]" annotations');

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ context-builder-parity: GREEN\n');
