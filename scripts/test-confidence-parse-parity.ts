#!/usr/bin/env ts-node
/**
 * TEST-A: confidence-parse parity (2026-06-09)
 *
 * Locks the shared `parseConfidenceScore` + `applyConfidenceCap` (lib/agents/harness/parse-confidence.ts) and
 * makes engine⇄stream drift STRUCTURALLY IMPOSSIBLE.
 *  - Layer 1 (structural): both execution paths import the shared fns; neither keeps an inline confidence
 *    `matchAll` loop; the 6-regex signature lives in exactly ONE file. This is the anti-drift lock.
 *  - Layer 2 (golden): behavioral fixtures on the pure functions (boundary-contract E1-E16 + cap cases).
 * Pure module → CI-safe, NO DATABASE_URL stub.
 *
 * Run: npm run test:confidence-parse-parity
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';
import { parseConfidenceScore, applyConfidenceCap } from '../lib/agents/harness/parse-confidence';

let passed = 0, failed = 0;
const failures: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; const m = `${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`; failures.push(m); console.log(`  ❌ ${m}`); }
};
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('\n🎯 TEST-A — confidence-parse parity\n');

console.log('── Layer 2: parseConfidenceScore golden fixtures (boundary-contract E1-E16) ──\n');
eq('E1 empty → null', parseConfidenceScore(''), null);
eq('E2 null → null', parseConfidenceScore(null), null);
eq('E3 undefined → null', parseConfidenceScore(undefined), null);
eq('E4 no-match → null', parseConfidenceScore('no score here at all'), null);
eq('E5 quoted-predecessor → LAST wins (93)', parseConfidenceScore('child Confidence: 95/100 ... my Confidence: 93/100'), 93);
eq('E6 "Confidence Score: 85/100" → 85', parseConfidenceScore('Confidence Score: 85/100'), 85);
eq('E7 "confidence: 72%" → 72', parseConfidenceScore('confidence: 72%'), 72);
eq('E8 "Confidence: 88" → 88', parseConfidenceScore('Confidence: 88'), 88);
eq('E9 "**Confidence**: 77" → 77', parseConfidenceScore('**Confidence**: 77'), 77);
eq('E10 "Confidence level: 64" → 64', parseConfidenceScore('Confidence level: 64'), 64);
eq('E11 "90/100 confidence" → 90', parseConfidenceScore('90/100 confidence'), 90);
eq('E12 ">100 → null (range guard)"', parseConfidenceScore('Confidence: 200'), null);
eq('E13 "Confidence: 0" → 0 (NOT null!)', parseConfidenceScore('Confidence: 0'), 0);
eq('E14 false-positive: "95% coverage. Confidence: 60" → 60', parseConfidenceScore('We had 95% test coverage. Confidence: 60.'), 60);
eq('E15 legit number-first: "95% confidence" → 95', parseConfidenceScore('95% confidence in the data'), 95);
eq('E16 case-insensitive "CONFIDENCE: 85/100" → 85', parseConfidenceScore('CONFIDENCE: 85/100'), 85);

console.log('\n── Layer 2: applyConfidenceCap golden fixtures ──\n');
eq('C1 >50% fail + score>60 → cap to 60', applyConfidenceCap(85, 4, 3), { score: 60, capped: true, original: 85 });
eq('C2 <50% fail → unchanged', applyConfidenceCap(85, 4, 1), { score: 85, capped: false, original: 85 });
eq('C3 score ≤60 → NOT capped (even if all fail)', applyConfidenceCap(55, 4, 3), { score: 55, capped: false, original: 55 });
eq('C4 score exactly 60 → NOT capped', applyConfidenceCap(60, 4, 4), { score: 60, capped: false, original: 60 });
eq('C5 null score → unchanged null', applyConfidenceCap(null, 4, 3), { score: null, capped: false, original: null });
eq('C6 zero tool calls → no cap (div-guard)', applyConfidenceCap(90, 0, 0), { score: 90, capped: false, original: 90 });
eq('C7 exactly 50% fail → NOT capped (>0.5 strict)', applyConfidenceCap(85, 4, 2), { score: 85, capped: false, original: 85 });

console.log('\n── Layer 1: structural drift-lock (shared parser imported by the consumers, no inline copy) ──\n');
{
  const ENGINE = 'lib/services/agentExecutionEngine.ts';
  const STREAM = 'app/api/pov/agent/execute/stream/route.ts';
  // Phase 6: the ENGINE path's confidence parsing moved into the shared core; the engine now DELEGATES.
  const CORE = 'lib/services/execution-core.ts';
  const MODULE = 'lib/agents/harness/parse-confidence.ts';
  // Distinctive literal substring of the 6-regex parser (pattern 5) — appears verbatim ONLY where the inline
  // parser lives. Use String.includes (not RegExp) so the literal `\s`/`(?:...)` source chars match exactly.
  const SIGNATURE = '(?:level|rating|assessment)';
  // Phase 6b: the ONLY parse-confidence consumer is now the core — BOTH adapters delegate.
  for (const f of [CORE]) {
    eq(`L1 ${path.basename(f)} imports parse-confidence`, read(f).includes('parse-confidence'), true);
  }
  // Both adapters delegate to the core — no direct parser import, no inline loop.
  for (const f of [ENGINE, STREAM]) {
    eq(`L1 ${path.basename(f)} delegates to the core (no direct parse-confidence import)`, read(f).includes('parse-confidence'), false);
    eq(`L1 ${path.basename(f)} calls runExecutionCore`, read(f).includes('runExecutionCore('), true);
  }
  // No inline regex loop anywhere (engine, stream, core).
  for (const f of [ENGINE, STREAM, CORE]) {
    eq(`L1 ${path.basename(f)} has NO inline confidence regex loop`, read(f).includes(SIGNATURE), false);
  }
  // the 6-regex signature must live in exactly ONE file (the module)
  const count = [ENGINE, STREAM, CORE, MODULE].filter(f => read(f).includes(SIGNATURE)).length;
  eq('L1 6-regex signature in exactly ONE file (the module)', count, 1);
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ confidence-parse parity (behavioral + structural drift-lock) passed\n');
