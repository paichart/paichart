#!/usr/bin/env ts-node
/**
 * verdict-mismatch-guard unit tests — TIER + DIRECTION semantics.
 *
 * WHY (T6 finding F-T6-2, 2026-07-17): the guard shipped with NO unit tests. Its premise —
 * "the stamped outcome is DERIVED from this reviewer's verdict, so disagreement ⇒ SYNTHESIZE
 * misread" (the 2026-07-14 incident class) — is true at the PIPELINE tier
 * (`seed-protocol-prompts.ts:1204`) and FALSE at the PROGRAM tier, where the protocol defines the
 * outcome as an AND with the integration reviewer as ONE CONJUNCT (`:2492-2500`).
 *
 * Live proof (program cmro29d65000dyx2a0ynjltvh): Node C approved (cross-leg conformance WAS exact)
 * while a leg escalated on a blocked harvest ⇒ outcome needs-revision. Both were right; the guard
 * flagged a false positive. Unfixed, every program where a leg blocks but integration conforms would
 * pollute the mismatch count the CLAUDE.md quarterly Phase-2 decision is tallied from.
 *
 * The asymmetry is the crux and these tests pin it:
 *   stamped needs-revision + reviewer APPROVED → benign at PROGRAM tier (another conjunct blocked)
 *   stamped approved       + reviewer REJECTED → REAL contradiction at EVERY tier (reviewer approval
 *                                                is a NECESSARY conjunct) — must keep firing.
 * A program-wide exemption would blind the dangerous direction. CI-safe: mocks only, no DB.
 */
import { annotateQualityGateVerdictMismatch } from '../lib/agents/harness/verdict-mismatch-guard';

let passed = 0, failed = 0;
async function test(desc: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`✅ ${desc}`); passed++; }
  catch (e) { console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const STAGE = 'stage-x';
const silentLogger = { warn: () => {}, error: () => {}, info: () => {} };

/** siblingTypes: 'PIPELINE' present ⇒ program tier. reviewerApproved: the transcribed verdict. */
function mockPrisma(siblingTypes: string[], reviewerApproved: boolean) {
  return {
    task: {
      findMany: async () => siblingTypes.map((type, i) => ({ id: `sib-${i}`, type })),
    },
    agentArtifact: {
      findMany: async () => [{
        content: JSON.stringify({
          agentRole: 'change_reviewer',
          reviewerVerdict: { approved: reviewerApproved, blocking: reviewerApproved ? [] : ['a blocker'] },
        }),
      }],
    },
  };
}

async function run(opts: { outcome: string; siblingTypes: string[]; reviewerApproved: boolean }) {
  const pendingMerge: Record<string, any> = {
    pipelineStageId: STAGE,
    qualityGate: { outcome: opts.outcome, reviewerScore: 42 },
  };
  await annotateQualityGateVerdictMismatch(
    mockPrisma(opts.siblingTypes, opts.reviewerApproved) as any,
    'task-under-test', 'PIPELINE', {}, pendingMerge, silentLogger,
  );
  return pendingMerge.qualityGate as Record<string, any>;
}

(async () => {
  console.log('🔒 verdict-mismatch-guard — tier + direction semantics\n');

  // ── PIPELINE tier: unchanged, symmetric (the guard's original, valid premise) ───────────────
  await test('VMG-1 PIPELINE tier · needs-revision + reviewer APPROVED ⇒ MISMATCH (a real misread)', async () => {
    const g = await run({ outcome: 'needs-revision', siblingTypes: ['ACTION', 'ACTION'], reviewerApproved: true });
    assert(g.verdictMismatch === true, 'expected verdictMismatch true at pipeline tier');
    assert(g.verdictMismatchTier === 'pipeline', `expected tier pipeline, got ${g.verdictMismatchTier}`);
  });

  await test('VMG-2 PIPELINE tier · approved + reviewer REJECTED ⇒ MISMATCH', async () => {
    const g = await run({ outcome: 'approved', siblingTypes: ['ACTION'], reviewerApproved: false });
    assert(g.verdictMismatch === true, 'expected verdictMismatch true');
    assert(g.verdictMismatchTier === 'pipeline', 'expected tier pipeline');
  });

  // ── PROGRAM tier: direction-aware (the F-T6-2 fix) ─────────────────────────────────────────
  await test('VMG-3 PROGRAM tier · needs-revision + reviewer APPROVED ⇒ NO mismatch (benign: the outcome is an AND)', async () => {
    const g = await run({ outcome: 'needs-revision', siblingTypes: ['PIPELINE', 'PIPELINE', 'ACTION'], reviewerApproved: true });
    assert(g.verdictMismatch === undefined, `FALSE POSITIVE: verdictMismatch was set (${g.verdictMismatch})`);
  });

  await test('VMG-4 PROGRAM tier · benign divergence STILL annotates reviewerVerdict (the FACT is kept)', async () => {
    const g = await run({ outcome: 'needs-revision', siblingTypes: ['PIPELINE', 'ACTION'], reviewerApproved: true });
    assert(g.reviewerVerdict?.approved === true, 'reviewerVerdict fact must be annotated — T6.6 audits it');
    assert(g.verdictMismatchTier === 'program', `expected tier program, got ${g.verdictMismatchTier}`);
  });

  await test('VMG-5 PROGRAM tier · approved + reviewer REJECTED ⇒ MISMATCH (the DANGEROUS direction stays caught)', async () => {
    const g = await run({ outcome: 'approved', siblingTypes: ['PIPELINE', 'PIPELINE'], reviewerApproved: false });
    assert(g.verdictMismatch === true, 'REGRESSION: a program-wide exemption would blind this — reviewer approval is a NECESSARY conjunct');
    assert(g.verdictMismatchTier === 'program', 'expected tier program');
  });

  // ── invariants that must survive the change ────────────────────────────────────────────────
  await test('VMG-6 agreement ⇒ no annotation at all (facts only)', async () => {
    const g = await run({ outcome: 'approved', siblingTypes: ['PIPELINE'], reviewerApproved: true });
    assert(g.verdictMismatch === undefined && g.reviewerVerdict === undefined, 'agreement must annotate nothing');
  });

  await test('VMG-7 escalated outcome ⇒ early return (no reviewer counterpart)', async () => {
    const g = await run({ outcome: 'escalated', siblingTypes: ['PIPELINE'], reviewerApproved: true });
    assert(g.verdictMismatch === undefined && g.reviewerVerdict === undefined, 'escalated must not be compared');
  });

  await test('VMG-8 tier detection is deterministic: ACTION-only siblings ⇒ pipeline tier', async () => {
    const g = await run({ outcome: 'needs-revision', siblingTypes: ['ACTION', 'ACTION', 'ACTION'], reviewerApproved: true });
    assert(g.verdictMismatchTier === 'pipeline', 'ACTION-only stage must be pipeline tier');
    assert(g.verdictMismatch === true, 'pipeline tier keeps the symmetric comparison');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
