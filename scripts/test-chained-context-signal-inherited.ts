#!/usr/bin/env ts-node
/**
 * A11 (cross-pipeline delivery, 2026-09-16) — a dep-free child that RECEIVED an injected upstream-leg
 * entry must still emit the `chainedContext` block in result.json.
 *
 * WHY THIS FILE EXISTS, AND WHY IT WAS WRITTEN RED FIRST. `deriveChainedContextSignal` returns null at
 * `completedDependencies <= 0 && chainCapablePredecessors <= 0` — the honest zeroed counts of exactly
 * the population the injection serves (every leg's Phase-0 harvester, 52/198). Under that early-out
 * the injection would be delivered with NO block in result.json, no card line, nothing: absence reads
 * as clean (Register Pattern 1), in the same function whose comment records the 2026-09-10 F-A fix
 * for the identical shape. Three reviewers found the absence of this observable independently.
 *
 * It is the observable that distinguishes "delivered" from "the dep-free arm threw into the
 * CONTEXT_CHAINING_FAILED catch and warned". If this test does not fail BEFORE the signal change, it
 * proves nothing after it.
 *
 * OWNER: execution-facts-specialist (the denominator fields + the signal). The chainer side emits
 * `pipelineMetadata.inheritedPredecessors` / `legCrossPipelineEntries` / `inheritedSkipped` /
 * `inheritedFromLeg`; this asserts the signal READS them. Not in test:all-validation until green.
 */
import { deriveChainedContextSignal } from '../lib/services/execution-artifacts';

let failed = 0;
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`);
  if (!ok) failed++;
};

// A11 — dep-free child, one injected entry: honest zeros on the dependency-derived counts.
const depFreeInjected = {
  pipelineMetadata: {
    totalDependencies: 0, completedDependencies: 0, chainCapablePredecessors: 0,
    allDependenciesMet: true, notChained: [], degradedPredecessors: 0,
    anyTruncated: false, anySanitized: false, totalChars: 7000,
    inheritedFromLeg: 'leg1', inheritedPredecessors: 1, legCrossPipelineEntries: 1, inheritedSkipped: [],
  },
};
const s = deriveChainedContextSignal(depFreeInjected) as (Record<string, unknown> | null);
check('A11a: signal is EMITTED for a dep-free child with an injection (not null)', s !== null, 'got null');
check('A11b: predecessors stays 0 — the injection never counts as a predecessor', (s?.predecessors ?? -1) === 0, JSON.stringify(s));
check('A11c: chainCapablePredecessors stays 0 (predecessors === chainCapablePredecessors holds)', (s?.chainCapablePredecessors ?? -1) === 0, JSON.stringify(s));
check('A11d: inheritedPredecessors is carried', s?.inheritedPredecessors === 1, JSON.stringify(s));
check('A11e: the denominator legCrossPipelineEntries is carried (no silent zero)', s?.legCrossPipelineEntries === 1, JSON.stringify(s));

// A12 — leg had entries, none inherited, skips recorded → the skip list reaches the signal.
const allSkipped = { pipelineMetadata: { ...depFreeInjected.pipelineMetadata, completedDependencies: 1, chainCapablePredecessors: 1, totalDependencies: 1,
  inheritedPredecessors: 0, legCrossPipelineEntries: 1, inheritedSkipped: [{ taskId: 'u1', reason: 'own-edge-wins' }] } };
const s2 = deriveChainedContextSignal(allSkipped) as (Record<string, unknown> | null);
check('A12: legCrossPipelineEntries > 0 with inheritedPredecessors 0 carries the recorded skip reason',
  Array.isArray(s2?.inheritedSkipped) && (s2!.inheritedSkipped as Array<{ reason: string }>)[0]?.reason === 'own-edge-wins', JSON.stringify(s2));

// CONTROL — genuinely predecessor-less AND nothing injected stays null (the F-A contract is unchanged).
const clean = { pipelineMetadata: { totalDependencies: 0, completedDependencies: 0, chainCapablePredecessors: 0, inheritedPredecessors: 0, legCrossPipelineEntries: 0 } };
check('CONTROL: predecessor-less, nothing injected → null (unchanged)', deriveChainedContextSignal(clean) === null);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\n✅ chained-context signal carries inherited-entry facts');
process.exit(0);
