/**
 * Rollback-containment ENRICHMENT — the DB-reading half of mechanical net #3.
 *
 * The pure scoping/matching lives in `rollback-containment.ts`; this module resolves the harvest
 * this leg actually witnessed and hands back the fact.
 *
 * ── WHERE IT RUNS, AND WHY THAT IS THE WHOLE POINT ────────────────────────────────────────────
 * Computed at the AUTHOR LEAF's terminal persist, NOT at the leg's SYNTHESIZE.
 *
 * A fact stamped at SYNTHESIZE lands AFTER that leg's Reviewer has already run — which is exactly
 * the structural blindness this net exists to end, reproduced one layer up. H-4 (`markerPresence`)
 * hit the same wall and solved it the same way: stamp on the leaf, let the chainer carry it, and
 * the next leaf's §6 renders it where the Reviewer actually reads.
 *
 * At the Author's persist the harvest sibling is already terminal (it is phase 0 of the same
 * stage), so a READ COMMITTED read sees its artifact — the same precondition the derivation-
 * containment enrichment already relies on.
 *
 * The leg's SYNTHESIZE then HOISTS this stamp rather than recomputing it (`hoistRollbackContainment`
 * below). Recomputing would let the Reviewer and the program gate see different numbers for the
 * same package; a hoist cannot.
 *
 * NON-THROWING is the CALLER's contract, not this module's: execution-core wraps the call in the
 * try/catch that degrades to a named `enrichment-error` fact WITH a blocking disposition (G3 — the
 * one arm meaning "things went wrong" must never render clean).
 */

import type { Prisma } from '@prisma/client';
import {
  scopeRestoreLines,
  checkRollbackContainment,
  computeRollbackDisposition,
  isDesiredStateLane,
  ROLLBACK_SCOPE_NOTE,
} from './rollback-containment';
import { resolveTaskProtocol } from './program-protocol';

/** Same narrow surface, same three reasons, as `ContainmentPrisma` — see that module's note. */
export type RollbackPrisma = Pick<Prisma.TransactionClient, 'task' | 'stage' | '$queryRaw'>;

/**
 * Bound on the stage-children scan (the `validate:pagination` gate blocked deploy `34550802714`
 * on the two unbounded reads below). A leg stage holds a handful of specialists; the harvest and
 * author children are the EARLIEST-created (protocol phase order), so `orderBy createdAt asc` +
 * this cap cannot drop them. Mirrors `CHILD_SCAN_CAP` in contract-propagation-enrichment.
 */
const STAGE_CHILD_SCAN_CAP = 50;

export interface ComputeRollbackContainmentInput {
  /**
   * The AUTHOR task's id. The stage is resolved HERE rather than threaded in, deliberately:
   * `ExecutionCoreInput.task` carries no `stageId`, and adding one would mean editing the core's
   * input contract plus BOTH adapters that build it — a two-wiring-site change for a value this
   * module can read in one indexed lookup. Wiring it from a field the core does not have would
   * have stamped `no-child-stage` on every Author forever: a net that gates nothing while
   * appearing fully wired, which is precisely the `extractBannedTokens` /banned/i defect.
   */
  taskId: string;
  /** The Author's final response: the change package a human would receive. */
  deliverable: string | null | undefined;
}

/**
 * Resolve the rollback-containment fact for an Author leaf.
 * Reads the DB, returns the fact; stamps nothing, logs nothing, never throws by design.
 */
export async function computeRollbackContainmentFact(
  prisma: RollbackPrisma,
  { taskId, deliverable }: ComputeRollbackContainmentInput
): Promise<Record<string, unknown>> {
  const withDisposition = (fact: Record<string, unknown>): Record<string, unknown> => {
    // NESTED under the fact, never a sibling — `pickResultJsonSummary` is a strict whitelist and a
    // sibling is stripped at the hoist, leaving it invisible on the card and ABSENT at the gate (E3b).
    fact.rollbackDisposition = computeRollbackDisposition(fact);
    return fact;
  };

  // Scope is computed FIRST because it is PURE and every arm below reports it — but it does NOT
  // decide the outcome first. See the precedence note on the lane check.
  const scope = scopeRestoreLines(deliverable);

  const self = await prisma.task.findUnique({ where: { id: taskId }, select: { stageId: true } });
  const stageId = self?.stageId ?? null;

  // ── LANE CHECK, AND IT RUNS BEFORE THE CONTENT ARMS (precedence ruled 2026-09-11) ────────────
  //
  // WHERE THE LANE LIVES. The protocol binding is on the LEG, not on this Author: measured in prod,
  // an Author child carries `metadata.protocol` as a PRESENT-BUT-NULL key, and the resolution
  // ladder treats a present key as authoritative (the R1 closure), so asking the Author its own
  // protocol returns null for every leg in every lane. The Stage carries `metadata.harnessTaskId`
  // pointing back at the leg, which makes this two indexed PK lookups rather than a JSON-path scan.
  //
  // WHY LANE-FIRST. This arm was originally last, and the first live HCL leg exposed the ordering:
  // a kubernetes-gitops package whose rollback is procedural (git revert, no fenced restore block)
  // stamped `no-restore-blocks`, not `lane-not-supported`. Both are benign so nothing was wrong at
  // the gate — but the reason string was the wrong TRUE statement, and three things follow from it:
  //   1. `lane-not-supported` is a statement about OUR scope and is true regardless of what the
  //      package contains; the content reasons are statements about the PACKAGE. The claim that
  //      holds either way is the one to report.
  //   2. `no-restore-blocks` on an HCL leg actively misleads: it implies that adding a restore block
  //      would get the package adjudicated. It would not — this lane is never adjudicated.
  //   3. Corpus arithmetic. Lane-first puts every HCL leg in ONE bucket, so "how many legs did the
  //      platform decline to adjudicate" is answerable without re-deriving the lane per package.
  //      That measurement is due again at the context-entry panel.
  //
  // ⚠️ `no-child-stage` is deliberately NOT hoisted with this. It is not in the benign allowlist, so
  // running it before the content arms would flip a stage-less package with no rollback section from
  // benign to BLOCKING — a real regression in the wrong direction. An unresolvable stage simply
  // skips the lane test and falls through, exactly as an unresolvable LEG does.
  //
  // COST: two PK reads now run on every Author persist rather than only on the ones that reach the
  // harvest. That is one extra indexed lookup pair per leg, which is nothing against being able to
  // say truthfully why a package was not checked.
  if (stageId) {
    const stage = await prisma.stage.findUnique({ where: { id: stageId }, select: { metadata: true } });
    const legId = (stage?.metadata as Record<string, unknown> | null)?.harnessTaskId;
    if (typeof legId === 'string' && legId) {
      const leg = await prisma.task.findUnique({
        where: { id: legId }, select: { title: true, metadata: true },
      });
      const protocol = leg ? resolveTaskProtocol(leg).protocol : null;
      if (isDesiredStateLane(protocol)) {
        return withDisposition({
          checked: false, reason: 'lane-not-supported', lane: protocol,
          blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
        });
      }
    }
  }
  // An UNRESOLVABLE leg falls through and is adjudicated, deliberately — see DESIRED_STATE_LANES:
  // a coverage gap must surface as visible escalation, never as silence.

  // ── CONTENT ARMS. Existence-first (derivation-containment's finding (f)): a package that quotes
  // nothing needs no harvest, and reporting `no-harvest-text` for it would blame the wrong layer.
  if (scope.blocksScanned.restore === 0) {
    return withDisposition({
      checked: false, reason: 'no-restore-blocks',
      blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
    });
  }
  if (scope.lines.length === 0) {
    // Restore blocks exist but quote nothing adjudicable — an INVERSE rollback (`no `-forms), a
    // procedure, or verification only. Every excluded line is named in `excluded`.
    return withDisposition({
      checked: false, reason: 'no-restore-form-lines',
      restoreLinesFound: 0, restoreLinesTotal: 0,
      blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
    });
  }

  if (!stageId) {
    return withDisposition({
      checked: false, reason: 'no-child-stage',
      blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
    });
  }

  const siblings = await prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });
  // The SAME harvest predicate as derivation-containment-enrichment — one notion of "the harvest
  // child" across this domain, deliberately. A second predicate is the two-extractor drift class.
  const harvestChild = siblings.find(c =>
    (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest'));
  if (!harvestChild) {
    return withDisposition({
      checked: false, reason: 'no-harvest-child',
      blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
    });
  }

  // The harvest child is an ACTION task, so `result.json` is the RIGHT name. Do NOT copy this
  // predicate to a PIPELINE lookup — a PIPELINE writes `pipeline-index.json`, which is the same
  // class of defect recorded at three separate sites in the containment enrichment's header.
  const rows = await prisma.$queryRaw<Array<{ fr: string | null }>>`
    SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts
    WHERE name = 'result.json' AND content LIKE '{%'
      AND (content::jsonb)->>'taskId' = ${harvestChild.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  const harvestText = rows[0]?.fr ?? null;
  if (!harvestText) {
    // The check SHOULD have run and could not: the package quotes restore content and the witnessed
    // evidence is unreadable. This is the arm that FAILS CLOSED (blocking, via the disposition).
    return withDisposition({
      checked: false, reason: 'no-harvest-text', harvestSource: harvestChild.id,
      blocksScanned: scope.blocksScanned, excluded: scope.excluded, scope: ROLLBACK_SCOPE_NOTE,
    });
  }

  const check = checkRollbackContainment(scope.lines, harvestText);
  return withDisposition({
    checked: true,
    ...check,
    excluded: scope.excluded,
    blocksScanned: scope.blocksScanned,
    harvestSource: harvestChild.id,
    matching: 'trimmed-exact-line',
    scope: ROLLBACK_SCOPE_NOTE,
  });
}

/**
 * The leg's SYNTHESIZE view: HOIST the Author child's stamp, never recompute it.
 *
 * Two consumers must agree — the Reviewer (via §6, one leaf earlier) and the program gate (via the
 * lean card). Recomputing here could yield different numbers for the same package if anything about
 * scoping changed between the two persists; a hoist is identical by construction. `source` records
 * which child it came from so the attribution is never inferred.
 */
/**
 * H-3 tier arm, MOVED INSIDE the enrichment 2026-09-12 (stage 2b). It was a ternary at the
 * execution-core call site, which put it in the one half a replay runner cannot exercise — so the
 * only way to see what a program parent stamps was a live program run. `derivationContainment`
 * already decided its tier here; the registry picks that shape for all of them. The literal below
 * is transcribed VERBATIM from the call site: the equivalence gate compares serialized bytes, so
 * a "tidier" object is a behavioural change wearing a refactor's clothes.
 */
export async function hoistRollbackContainment(
  prisma: RollbackPrisma,
  { stageId, programTier }: { stageId: unknown; programTier?: boolean }
): Promise<Record<string, unknown>> {
  if (programTier === true) {
    return {
      checked: false, reason: 'program-tier', tier: 'program', applicable: false,
      rollbackDisposition: {
        disposition: 'benign', reason: 'program-tier',
        inputs: { reason: 'program-tier', missingCount: 0, restoreLinesTotal: 0 },
      },
    };
  }
  const miss = (reason: string): Record<string, unknown> => {
    const fact: Record<string, unknown> = { checked: false, reason, scope: ROLLBACK_SCOPE_NOTE };
    fact.rollbackDisposition = computeRollbackDisposition(fact);
    return fact;
  };
  if (typeof stageId !== 'string' || !stageId) return miss('no-child-stage');

  const children = await prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });
  const authorChild = children.find(c =>
    (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author'));
  if (!authorChild) return miss('no-author-child');

  const rows = await prisma.$queryRaw<Array<{ rc: string | null }>>`
    SELECT (content::jsonb)->>'rollbackContainment' AS rc FROM agent_artifacts
    WHERE name = 'result.json' AND content LIKE '{%'
      AND (content::jsonb)->>'taskId' = ${authorChild.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  const raw = rows[0]?.rc ?? null;
  // `no-author-stamp` is a COULD-NOT-CHECK arm and therefore fails closed. Expect it briefly for
  // legs whose Author persisted before this net shipped, and for any leg mid-flight across the
  // deploy: those genuinely were not checked, so a visible token is the honest rendering. It gates
  // nothing in v1 (no programReleasable conjunct — see the plan's §3.6a).
  if (!raw) return miss('no-author-stamp');
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { ...parsed, source: authorChild.id };
  } catch {
    return miss('author-stamp-unparseable');
  }
}
