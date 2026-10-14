/**
 * leg-reviewers — the ONE query for "which reviewer tasks live in this leg's child stage?".
 *
 * Extracted UNCHANGED from `verdict-freshness-enrichment.ts` (WARNINGS-INVISIBLE, 2026-10-08) so a second
 * leg-synthesize net does not fork a second locator (execution-facts F1). ⚠️ The selection is deliberately the
 * WIDE reviewer set — `agentRole ∈ REVIEWER_ROLES` OR an agent template of type REVIEWER — exactly as freshness
 * always selected (audit A1): it also returns `publication_reviewer`. A consumer that needs only the roles that
 * emit a terminal VERDICT block (and so a `reviewerVerdict`) filters to `REVIEWER_ROLES` ITSELF; changing this
 * query would change verdictFreshness, which is pinned by `test:verdict-freshness` and the net equivalence gate.
 *
 * Order is (createdAt asc) and the scan is bounded, as before. `agentRole` is selected additionally (a select
 * column changes no row choice).
 */

import type { PrismaClient } from '@prisma/client';
import { REVIEWER_ROLES } from './parse-verdict';

/** Bound on the reviewer scan: a leg stage holds a handful of specialists, and one or two reviewers. */
export const REVIEWER_SCAN_CAP = 20;

export async function findLegReviewerTasks(
  prisma: Pick<PrismaClient, 'task'>,
  stageId: string,
): Promise<Array<{ id: string; agentRole: string | null; createdAt: Date }>> {
  return prisma.task.findMany({
    where: { stageId, OR: [{ agentRole: { in: [...REVIEWER_ROLES] } }, { agentTemplate: { templateType: 'REVIEWER' } }] },
    select: { id: true, agentRole: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: REVIEWER_SCAN_CAP,
  });
}
