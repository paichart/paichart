/**
 * `ctx` — everything the mechanical nets read, resolved ONCE per persist (stage 2b, 2026-09-12).
 *
 * Before the registry, four of the six stamp sites independently re-derived the same stage id, and
 * `contractApplicability` was computed at the call site and hand-nested onto two facts AFTER they
 * returned. Both are the same shape of problem: a derivation with more than one consumer and no
 * home, which is how the two-extractor drift class starts.
 *
 * ⚠️ WHAT IS DELIBERATELY *NOT* HERE, and why (2026-09-12): the enrichments' OWN stage-children
 * queries are untouched by this migration. `ctx.children()` exists and is correct, but the four
 * enrichments each `select` a different column set, so rewiring them would be a behavioural change
 * to each net's internals that the equivalence gate could only prove on the SHAPES PRESENT IN THE
 * ARCHIVE — and a select difference bites on the shapes that are not. New nets should consume
 * `ctx.children()`; converting the existing four is its own, separately gated change.
 */
import type { PrismaClient } from '@prisma/client';
import { findProgramParentForStage } from './program-protocol';
import type { NetContext } from './net-registry';

/** Mirrors the per-net cap; see `pagination-safety-cap-pattern` and the SEARCH-vs-AGGREGATE note. */
const STAGE_CHILD_SCAN_CAP = 50;

export interface BuildNetContextInput {
  prisma: PrismaClient;
  task: { id: string; type: string | null | undefined; metadata: unknown; inputContext: unknown };
  agentRole: string | null;
  harnessMode: string | null;
  finalResponse: string | null | undefined;
  programTier: boolean;
  /** Surfaced so a lookup failure is a recorded fact rather than silence (the call site logged it). */
  onContractApplicabilityError?: (err: unknown) => void;
}

export function buildNetContext(input: BuildNetContextInput): NetContext {
  const stageIdRaw = (input.task.metadata as Record<string, unknown> | null)?.pipelineStageId;
  const stageId = typeof stageIdRaw === 'string' && stageIdRaw ? stageIdRaw : null;

  let childrenPromise: Promise<Array<{ id: string; title: string; agentRole: string | null }>> | null = null;
  let applicabilityPromise: Promise<Record<string, unknown> | null> | null = null;

  return {
    prisma: input.prisma,
    task: input.task,
    agentRole: input.agentRole,
    harnessMode: input.harnessMode,
    finalResponse: input.finalResponse,
    stageId,
    programTier: input.programTier,

    children() {
      if (!childrenPromise) {
        childrenPromise = stageId
          ? input.prisma.task.findMany({
              where: { stageId },
              select: { id: true, title: true, agentRole: true },
              // SEARCH, not aggregate: every consumer FINDS one child by role, and protocol phase
              // order puts harvest/author children first, so the cap cannot drop what they resolve.
              orderBy: { createdAt: 'asc' },
              take: STAGE_CHILD_SCAN_CAP,
            })
          : Promise.resolve([]);
      }
      return childrenPromise;
    },

    /**
     * CONTRACT APPLICABILITY — computed once, nested by the nets that carry it.
     *
     * A standalone pipeline has NO Program Interface Contract by design, so `dialectLint`'s
     * `no-contract` and `contractPropagation`'s `no-contract-on-leg` cannot be told apart from
     * "expected and missing" without re-deriving the tier. Reviewers graded that by-design absence
     * as a gap on 9 of 37 archived standalone legs, and on 4 of 4 on 2026-09-11 — a false gap
     * teaches a reader to skim the real ones.
     *
     * NEITHER FACT OWNS IT: putting the predicate inside one would force the other to re-derive it.
     * And it is not a NET either — it has no `resultJson` key of its own, so giving it one would
     * make it a top-level sibling of the facts it belongs inside, which `pickResultJsonSummary`
     * silently strips (E3b). Nested, it needs no whitelist change at all.
     *
     * ⚠️ A PROGRAM ROOT NEVER REACHES THE LOOKUP — the tier guard short-circuits first, so
     * `expected:false` can only ever mean STANDALONE, never "root". Source-true but UNOBSERVED in
     * production: every archived program root predates H-3, so it is pinned by test, not asserted.
     * Moving it here makes that branch reachable from a stubbed fixture, which is a strictly better
     * position than the inline call site it came from — but a fixture proves the branch behaves as
     * written, NOT that a real program root reaches it. That observation still needs a live run.
     *
     * ⚠️⚠️ THE STAGE ID HERE IS *NOT* `ctx.stageId`, AND THAT WAS THE BUG (fixed 2026-09-18).
     * `ctx.stageId` is `metadata.pipelineStageId` — the stage this leg OWNS, where its children
     * live — which is right for `children()` and wrong for this. `findProgramParentForStage` asks
     * *who OWNS this stage*, so the argument has to be the stage the leg itself LIVES IN
     * (`tasks.stage_id`). Passing the owned stage could only ever self-match the leg, and the
     * program-protocol filter then rejected the self-match on every leg not itself program-named —
     * so the lookup returned null unconditionally and `basis: 'program-parent'` was stamped
     * 0 times in 611 archived stamps. 30 of the 38 legs carrying `no-program-parent` had one.
     *
     * The leg's own stage is READ HERE rather than threaded through `ExecutionCoreInput.task`,
     * deliberately: threading reproduces this bug's failure mode, because any adapter that omits
     * the field passes `undefined`, lands on the null arm, and restores the fail-open answer with
     * every test green. A read at the point of use cannot be under-plumbed.
     */
    contractApplicability() {
      if (!applicabilityPromise) {
        applicabilityPromise = (async () => {
          if (input.task.type !== 'PIPELINE' || input.harnessMode !== 'SYNTHESIZE') return null;
          if (input.programTier) return null;
          if (!stageId) return null;
          try {
            const own = await input.prisma.task.findUnique({
              where: { id: input.task.id },
              select: { stageId: true },
            });
            // NO STAGE OF ITS OWN ⇒ the tier is UNRESOLVED, which is not the same statement as
            // "no contract expected". Absent applicability is the honest answer; `expected:false`
            // would be the fail-open one.
            if (!own?.stageId) return null;
            // THE F12 LOOKUP, shared — not a second copy of that query (its AND-lift is
            // load-bearing: the stage filter and the protocol filter are BOTH `metadata` filters,
            // and two `metadata` keys in one object literal is last-writer-wins).
            const programParentId = await findProgramParentForStage(input.prisma, own.stageId);
            return programParentId
              ? { expected: true, basis: 'program-parent', programParentId }
              : { expected: false, basis: 'no-program-parent' };
          } catch (err) {
            // ABSENT applicability is honest here: it means the tier could not be resolved, which
            // must NOT read as "no contract expected".
            input.onContractApplicabilityError?.(err);
            return null;
          }
        })();
      }
      return applicabilityPromise;
    },
  };
}
