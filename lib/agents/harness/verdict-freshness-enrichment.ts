/**
 * verdictFreshness — leg-synthesize net (RWF Stage 1 C.3, 2026-09-26; execution-facts review §4, §11 I31).
 *
 * THE QUESTION: when this leg's outcome was stamped, had its reviewer judged the predecessor executions that
 * were then authoritative? Nothing forces a Reviewer re-run after an Author re-run (the cap only REFUSES a
 * same-input re-roll), so a leg can reach its stamp on a stale verdict. Only a stamp makes that visible
 * downstream and immutable. The read-time card fact (`verdictFresh`, agent.results) answers a different
 * question, "is it fresh NOW", and a later Author re-run would flip it retroactively.
 *
 * SHAPE (Protocol 10: ids and a comparison, three states, no adjective):
 *   { checked, reason, match: 'same'|'different'|null, reviewers: [{ taskId, executionId, match, basis }],
 *     predecessors: [{ reviewerTaskId, taskId, reviewedExecutionId, authoritativeExecutionId, match }] }
 * reason: 'compared' | 'no-reviewer' | 'no-reviewer-verdict' | 'no-chained-record' | 'program-tier'.
 * An unknown comparison (a reviewer from before C.1's record, or one whose chaining was skipped/failed) is
 * `checked: false, reason: 'no-chained-record'` — NOT fresh. Absence is never clean.
 *
 * NO CONSUMER in Stage 1. Whether `different` becomes a gate conjunct is the harness's decision, after data.
 */

import type { PrismaClient } from '@prisma/client';
import { REVIEWER_ROLES } from './parse-verdict';
import { computeVerdictFreshness } from './chained-predecessors';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../../services/execution-selection';

/** Bound on the reviewer scan: a leg stage holds a handful of specialists, and one or two reviewers. */
const REVIEWER_SCAN_CAP = 20;

export async function computeVerdictFreshnessFact(
  prisma: Pick<PrismaClient, 'task' | 'agentExecution' | 'agentArtifact' | 'taskDependency'>,
  { stageId, programTier }: { stageId: unknown; programTier?: boolean },
): Promise<Record<string, unknown>> {
  if (programTier === true) return { checked: false, reason: 'program-tier', match: null };
  if (typeof stageId !== 'string' || !stageId) return { checked: false, reason: 'no-child-stage', match: null };

  const reviewers = await prisma.task.findMany({
    where: { stageId, OR: [{ agentRole: { in: [...REVIEWER_ROLES] } }, { agentTemplate: { templateType: 'REVIEWER' } }] },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: REVIEWER_SCAN_CAP,
  });
  if (reviewers.length === 0) return { checked: false, reason: 'no-reviewer', match: null };

  const perReviewer: Array<Record<string, unknown>> = [];
  const predecessors: Array<Record<string, unknown>> = [];
  let anyUnknown = false; let anyDifferent = false; let anyVerdict = false;
  for (const r of reviewers) {
    const { execution } = await selectAuthoritativeExecution(prisma as any, r.id, CHAIN_SELECTION_OPTIONS);
    if (!execution) continue;
    anyVerdict = true;
    const cmp = await computeVerdictFreshness(prisma as any, execution.id);
    const match = cmp?.match ?? null;
    if (match === null) anyUnknown = true;
    if (match === 'different') anyDifferent = true;
    perReviewer.push({ taskId: r.id, executionId: execution.id, match, basis: cmp?.basis ?? null });
    for (const p of cmp?.predecessors ?? []) predecessors.push({ reviewerTaskId: r.id, ...p });
  }
  if (!anyVerdict) return { checked: false, reason: 'no-reviewer-verdict', match: null };
  // 'different' is proven even if another reviewer is unknown; 'same' needs every reviewer proven same.
  const match = anyDifferent ? 'different' : anyUnknown ? null : 'same';
  return {
    checked: match !== null,
    reason: match !== null ? 'compared' : 'no-chained-record',
    match,
    reviewers: perReviewer,
    predecessors,
  };
}
