#!/usr/bin/env ts-node
/**
 * TEST — retry-band keep-best: score-integrity facts + catastrophic-degradation judgment
 * (cline_docs/reviews/retry-band-keep-best-2026-07-04/ — Phase 1 items 2, 4).
 *
 * Pure-function coverage of the two decision cores:
 *   assessScoreIntegrity  — the recorded-vs-final-mention fact (parse-confidence.ts)
 *   judgeCatastrophicDegradation / extractKeepBestFacts — the conjunctive keep-best rule
 * The DB-touching pieces (selector, self-supersession, prune inversion) are covered by the
 * integration-shaped assertions in test-execution-selection-coverage.ts + live smoke.
 *
 * CI-safe: stub DATABASE_URL before importing (execution-selection reaches lib/prisma).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import { assessScoreIntegrity } from '@/lib/agents/harness/parse-confidence';
import { extractKeepBestFacts, judgeCatastrophicDegradation, selectAuthoritativeExecution } from '@/lib/services/execution-selection';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

(async () => {
console.log('\n🧪 TEST — retry-band keep-best\n');

// ── assessScoreIntegrity — the Run-2 quote-spoof shape ──
{
  // The live incident: quotes "Confidence Score: 90/100" (pattern-priority winner → recorded 90)
  // but ends "Confidence: 45" (positionally-final mention). recorded !== finalMention.
  const text = 'Reviewing the child which had Confidence Score: 90/100 upstream.\nMy own assessment is lower. Confidence: 45/100';
  const si = assessScoreIntegrity(text, 90);
  ok(si.finalMention === 45, 'finalMention = the positionally-last mention (45), not the pattern-priority winner');
  ok(si.recordedIsFinalMention === false, 'recorded 90 != finalMention 45 → contradiction flagged');
  ok(si.mentions >= 2 && si.spread === 45, 'spread datum computed (45), secondary only');
}
{
  // Healthy: a SYNTHESIZE that quotes a child (45) and ends with its OWN score (88) as final.
  const text = 'Child C reported Confidence: 45/100 upstream. Synthesizing across all children.\nOverall Confidence: 88/100';
  const si = assessScoreIntegrity(text, 88);
  ok(si.recordedIsFinalMention === true, 'healthy synthesize: recorded 88 IS the final mention → no contradiction (the spread>30 false-positive avoided)');
  ok(si.spread === 43, 'spread is still 43 here (45 child, 88 own) — proving spread alone would have false-fired');
}
{
  const si = assessScoreIntegrity('No score at all here.', null);
  ok(si.mentions === 0 && si.finalMention === null && si.recordedIsFinalMention === true, 'no mentions → integrity vacuously true (never a lone gate)');
}

// ── judgeCatastrophicDegradation — the conjunctive rule ──
const facts = (deliverableChars: number, fencedBlockCount: number, recordedIsFinalMention: boolean, truncatedNoOutput = false) =>
  ({ deliverableChars, fencedBlockCount, scoreIntegrity: { recordedIsFinalMention }, truncatedNoOutput });

{
  // Replay fixture: original 17 fenced blocks / ~14000 chars vs retry 0 blocks / ~800 chars.
  const target = facts(14000, 17, true);
  const retry = facts(800, 0, false);
  const j = judgeCatastrophicDegradation(retry, target);
  ok(j.superseded === true, 'REPLAY: catastrophic retry (structural collapse + score asymmetry) → superseded');
  ok(j.reasons.some(r => r.includes('structural-collapse')) && j.reasons.some(r => r.includes('score-contradiction')), 'both arms recorded in reasons');
}
{
  // Legit improvement: retry is bigger/richer → keep the retry (not superseded).
  const target = facts(8000, 5, true);
  const better = facts(12000, 9, true);
  ok(judgeCatastrophicDegradation(better, target).superseded === false, 'LEGIT IMPROVEMENT: richer retry is NOT superseded (latest-wins)');
}
{
  // Lone structural-ratio drop WITHOUT fenced-block collapse → NOT superseded (conjunctive arm 1).
  const target = facts(10000, 0, true);
  const retry = facts(1000, 0, true); // ratio 0.1 but target had 0 fenced blocks → arm 1 needs target >=3
  ok(judgeCatastrophicDegradation(retry, target).superseded === false, 'CONJUNCTIVE: size drop without a ≥3→0 fenced collapse does not trip arm 1');
}
{
  // Lone score-contradiction (arm 2) DOES fire — but only as the directional asymmetry
  // (retry inconsistent while target consistent), never as generic quality (AR-3).
  const target = facts(9000, 4, true);
  const retry = facts(9500, 4, false); // same size/blocks, only score integrity differs
  ok(judgeCatastrophicDegradation(retry, target).superseded === true, 'ARM 2: retry recorded!=final while target consistent → superseded');
  // Inverse: target itself inconsistent → asymmetry absent → not superseded on this arm.
  ok(judgeCatastrophicDegradation(facts(9500, 4, false), facts(9000, 4, false)).superseded === false,
    'ARM 2 directional: both inconsistent → no asymmetry → not superseded');
}

{
  // Arm 3 (truncation regression, R3): a truncated-empty retry vs a non-truncated target →
  // superseded, even when the target has FEW fenced blocks (arm 1 would miss it). The finalize
  // note gives a truncated retry ~56 chars, so char-ratio alone is not enough.
  const target = facts(9000, 1, true, false);
  const truncatedRetry = facts(56, 0, true, true);
  const j = judgeCatastrophicDegradation(truncatedRetry, target);
  ok(j.superseded === true, 'ARM 3: truncated-empty retry vs non-truncated target → superseded');
  ok(j.reasons.some(r => r.includes('truncation-regression')), 'arm 3 reason recorded');
  // Both truncated → no asymmetry on this arm → not superseded by arm 3 (latest-wins).
  ok(judgeCatastrophicDegradation(facts(56, 0, true, true), facts(56, 0, true, true)).superseded === false,
    'ARM 3 directional: both truncated → not superseded on arm 3');
  // Non-truncated retry vs truncated target → arm 3 must NOT fire (retry is the recovery).
  ok(judgeCatastrophicDegradation(facts(9000, 4, true, false), facts(56, 0, true, true)).superseded === false,
    'ARM 3 directional: a real retry recovering from a truncated target is NOT superseded');
}
{
  // extract: TRUNCATED_NO_OUTPUT read from top-level errorCategory AND nested executionDegradation.
  const topLevel = extractKeepBestFacts({ finalResponse: 'x', errorCategory: 'TRUNCATED_NO_OUTPUT' });
  ok(topLevel?.truncatedNoOutput === true, 'extract: truncatedNoOutput from top-level errorCategory');
  const nested = extractKeepBestFacts({ keepBestFacts: { deliverableChars: 56, fencedBlockCount: 0 }, executionDegradation: { errorCategory: 'TRUNCATED_NO_OUTPUT' } });
  ok(nested?.truncatedNoOutput === true, 'extract: truncatedNoOutput from nested executionDegradation.errorCategory');
  const clean = extractKeepBestFacts({ finalResponse: 'x', errorCategory: 'EMPTY_DELIVERABLE' });
  ok(clean?.truncatedNoOutput === false, 'extract: a different errorCategory → truncatedNoOutput false');
}

// ── extractKeepBestFacts — persisted vs derived ──
{
  const persisted = extractKeepBestFacts({ keepBestFacts: { deliverableChars: 500, fencedBlockCount: 2, scoreIntegrity: { recordedIsFinalMention: false } } });
  ok(persisted?.deliverableChars === 500 && persisted?.fencedBlockCount === 2 && persisted?.scoreIntegrity.recordedIsFinalMention === false,
    'extract: uses persisted keepBestFacts when present (post-2026-07-04 rows)');
  // Historical target (no keepBestFacts) → derived from finalResponse/confidenceScore.
  const derived = extractKeepBestFacts({ finalResponse: 'a\n```\nx\n```\nb', confidenceScore: 70 });
  ok(derived !== null && derived.fencedBlockCount === 1, 'extract: derives facts for historical targets lacking keepBestFacts');
  ok(extractKeepBestFacts(null) === null, 'extract: null result.json → null');
}

// ── selectAuthoritativeExecution against a fake client (salvaged from an incomplete
// agent-drafted test; re-authored here). Covers the DB-touching selector's four contracts. ──
function makeClient(executions: any[], artifacts: Record<string, { content: string }>) {
  return {
    agentExecution: {
      findMany: async ({ where, take }: any) => {
        let rows = executions.filter((e) =>
          e.taskId === where.taskId && e.status === where.status &&
          (where.supersededById === null ? e.supersededById == null : true));
        rows = [...rows].sort((a, b) => {
          const t = b.createdAt.getTime() - a.createdAt.getTime();
          return t !== 0 ? t : (a.id < b.id ? 1 : -1);
        });
        return rows.slice(0, take ?? rows.length);
      },
    },
    agentArtifact: {
      findFirst: async ({ where }: any) => artifacts[where.executionId] ?? null,
    },
  } as any;
}
const D = (s: string) => new Date(s);

{
  const client = makeClient([
    { id: 'e1', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-01'), supersededById: null },
    { id: 'e2', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-02'), supersededById: null },
    { id: 'e3', taskId: 't1', status: 'FAILED', createdAt: D('2026-07-03'), supersededById: null },
  ], {});
  const r = await selectAuthoritativeExecution(client, 't1');
  ok(r.execution?.id === 'e2', 'SELECTOR S1: newest SUCCESS wins; a newer FAILED row is ignored (BC-4/F2)');
}
{
  const client = makeClient([
    { id: 'orig', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-01'), supersededById: null },
    { id: 'retry', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-02'), supersededById: 'orig' },
  ], {});
  const r = await selectAuthoritativeExecution(client, 't1');
  ok(r.execution?.id === 'orig', 'SELECTOR S2: superseded retry filtered → ORIGINAL authoritative (the incident fix)');
}
{
  const client = makeClient([
    { id: 'orig', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-01'), supersededById: null },
    { id: 'rerun', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-02'), supersededById: null },
  ], {});
  const r = await selectAuthoritativeExecution(client, 't1');
  ok(r.execution?.id === 'rerun', 'SELECTOR S3: unmarked (human) re-run wins — latest-wins by construction (Adj #3)');
}
{
  const client = makeClient([
    { id: 'good', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-01'), supersededById: null },
    { id: 'empty', taskId: 't1', status: 'SUCCESS', createdAt: D('2026-07-02'), supersededById: null },
  ], {
    empty: { content: JSON.stringify({ finalResponse: '' }) },
    good: { content: JSON.stringify({ finalResponse: 'real deliverable' }) },
  });
  const r = await selectAuthoritativeExecution(client, 't1', { requireNonEmptyArtifact: true });
  ok(r.execution?.id === 'good' && r.skipped.length === 1 && r.skipped[0].reason === 'empty-artifact',
    'SELECTOR S4: R8 empty-SUCCESS skipped (recorded), older non-empty selected (BC-6/F6)');
}

console.log(`\n──────────────────────────────────────────────────`);
console.log(`  Passed: ${passed}  Failed: ${failed}`);
console.log(failed === 0 ? '  ✅ keep-best: GREEN' : '  ❌ keep-best: RED');
process.exit(failed === 0 ? 0 : 1);
})();
