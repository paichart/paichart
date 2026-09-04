#!/usr/bin/env ts-node
/**
 * TEST-D1: chained-context coverage signal (2026-06-08)
 *
 * Locks in D1 (the 8th agent-output trust signal) + D3 (the chainer's 5MB-marker guard):
 * - deriveChainedContextSignal maps task.inputContext.pipelineMetadata → the signal,
 *   and returns null (happy-path-clean) when nothing was chained.
 * - buildExecutionResultJson emits `chainedContext` ONLY when present (additive, no
 *   control-flow change — the trust-stack pattern).
 * - context-chainer.ts guards the 5MB-truncated upstream before JSON.parse (D3).
 *
 * execution-artifacts.ts is `import type`-only (no prisma reach) → safe to import directly.
 * Run: npm run test:chained-context-signal
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { buildExecutionResultJson, deriveChainedContextSignal } from '../lib/services/execution-artifacts';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  taskId: 't1', taskTitle: 'T', agentRole: 'r', modelUsed: 'm',
  finalResponse: 'hi', confidenceScore: 90,
  turnCount: 1, maxToolTurns: 30,
  toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0,
  executionTime: 100, tokensUsed: 10,
  correctionTurnUsed: false,
  logger: { info: () => {} },
  executionId: 'e1',
  ...overrides,
}) as any;

console.log('\n🧬 TEST-D1 — chained-context coverage signal\n');
console.log('── Part A: deriveChainedContextSignal ──\n');

// A1/A2 — no inputContext / no pipelineMetadata → null
if (deriveChainedContextSignal(undefined) === null && deriveChainedContextSignal({}) === null) pass('A1 no inputContext / no pipelineMetadata → null');
else fail('A1 should be null for missing pipelineMetadata');

// A3 — predecessors 0 → null (clean happy path, no signal noise)
if (deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 0 } }) === null) pass('A3 completedDependencies=0 → null (happy-path-clean)');
else fail('A3 should be null when no predecessors chained');

// A4 — populated → correct mapping (incl. expected denominator)
{
  const s = deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 2, totalDependencies: 2, totalChars: 10000, anyTruncated: false } });
  if (s && s.predecessors === 2 && s.expectedPredecessors === 2 && s.totalChars === 10000 && s.anyTruncated === false) pass('A4 maps pipelineMetadata → {predecessors,expectedPredecessors,totalChars,anyTruncated}');
  else fail('A4 mapping wrong', JSON.stringify(s));
}

// A4b — DROPPED predecessor: chained < expected (D3 skip / missing result.json) is detectable
{
  const s = deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 2, totalDependencies: 4, totalChars: 9000, anyTruncated: false } });
  if (s && s.predecessors === 2 && s.expectedPredecessors === 4) pass('A4b dropped-predecessor case: predecessors(2) < expectedPredecessors(4) is visible');
  else fail('A4b denominator not exposed', JSON.stringify(s));
}

// A5 — anyTruncated reflected
{
  const s = deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 1, totalChars: 130000, anyTruncated: true } });
  if (s && s.anyTruncated === true) pass('A5 anyTruncated=true reflected');
  else fail('A5 anyTruncated not reflected', JSON.stringify(s));
}

// A6 (F19, 2026-07-16) — chainCapablePredecessors + degradedPredecessors flow through.
// T4e run #2 shape: 3 edges, 1 is a never-executing operator hold (chain-capable=2), both
// capable chained (predecessors=2 → count PASSES against chainCapable, would false-block
// against expectedPredecessors=3), 1 chained degraded (report.md promised but missing).
{
  const s = deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 2, totalDependencies: 3, chainCapablePredecessors: 2, degradedPredecessors: 1, totalChars: 9000, anyTruncated: false } });
  if (s && s.chainCapablePredecessors === 2 && s.degradedPredecessors === 1 && s.expectedPredecessors === 3)
    pass('A6 F19 facts flow: chainCapable(2) is the gate denominator; degraded(1) blocks; expected(3) stays raw');
  else fail('A6 F19 facts not exposed', JSON.stringify(s));
}

// A6b (F19) — legacy pipelineMetadata (pre-F19, no new keys) degrades safely:
// chainCapable falls back to predecessors (equality holds), degraded to 0 (no false-block).
{
  const s = deriveChainedContextSignal({ pipelineMetadata: { completedDependencies: 2, totalDependencies: 2, totalChars: 100, anyTruncated: false } });
  if (s && s.chainCapablePredecessors === 2 && s.degradedPredecessors === 0)
    pass('A6b legacy metadata: chainCapable falls back to predecessors, degraded to 0');
  else fail('A6b legacy fallback broken', JSON.stringify(s));
}

console.log('\n── Part B: buildExecutionResultJson emit ──\n');

// B1 — happy-path-clean: no chainedContext field when not provided
{
  const r = buildExecutionResultJson(baseInput());
  if (!('chainedContext' in r)) pass('B1 standalone execution → no chainedContext field (happy-path-clean)');
  else fail('B1 chainedContext should be absent when null/undefined', JSON.stringify(r.chainedContext));
}

// B2 — present + correct when provided
{
  const sig = { predecessors: 2, totalChars: 10000, anyTruncated: true };
  const r = buildExecutionResultJson(baseInput({ chainedContext: sig })) as any;
  if (r.chainedContext && r.chainedContext.predecessors === 2 && r.chainedContext.totalChars === 10000 && r.chainedContext.anyTruncated === true) {
    pass('B2 chained execution → chainedContext emitted with the fact');
  } else fail('B2 chainedContext not emitted/incorrect', JSON.stringify(r.chainedContext));
}

// B3 — additive only: SUCCESS-path control fields unchanged (no errorCategory injected)
{
  const r = buildExecutionResultJson(baseInput({ chainedContext: { predecessors: 1, totalChars: 5, anyTruncated: false } })) as any;
  if (!('errorCategory' in r)) pass('B3 signal is additive — no control-flow field introduced');
  else fail('B3 unexpectedly introduced errorCategory');
}

console.log('\n── Part C: D3 — chainer 5MB-marker guard (static) ──\n');
{
  const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/context-chainer.ts'), 'utf8');
  // Guard must appear BEFORE the JSON.parse of resultArtifact.content
  const guardIdx = src.indexOf("endsWith('[TRUNCATED: exceeded 5MB limit]')");
  const parseIdx = src.indexOf('JSON.parse(resultArtifact.content)');
  if (guardIdx > 0 && parseIdx > 0 && guardIdx < parseIdx) pass('C1 5MB-truncation guard present BEFORE JSON.parse');
  else fail('C1 5MB guard missing or after parse', `guard=${guardIdx} parse=${parseIdx}`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ chained-context signal suite passed\n');
