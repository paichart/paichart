/**
 * Dialect-lint enrichment — gathers the inputs `runDialectLint` needs and stamps the FACT.
 *
 * WHY A SEPARATE MODULE, from day one: the derivation-containment logic lived inline in
 * `execution-core.ts` for a month, and the only way to observe what it stamped was a rig rebuild
 * plus a 30-50 minute program run with human gates. So it got "verified" by reading source, and
 * three defects shipped that way (wrong reason string, unrendered field, wrong artifact name). It
 * was extracted on 2026-07-30 for exactly that reason. This one starts extracted:
 * `scripts/replay-dialect-lint.ts` runs it against any completed leg in seconds.
 *
 * CONTRACT (mirrors computeDerivationContainmentFact):
 * - NEVER THROWS for a missing input. Every miss is a NAMED reason on a `checked:false` fact.
 *   Absence must never render as a clean pass — that is the failure this whole campaign kept
 *   re-learning. The caller still wraps in try/catch: a throw must never roll back a SUCCESS commit.
 * - Emits a FACT, not a verdict (Protocol 10). It reports which banned tokens appear in
 *   candidate-config blocks and which canonical lines are absent. It does not decide the leg's
 *   outcome; a reviewer or gate does that with this fact in hand.
 */
import type { PrismaClient } from '@prisma/client';
import { runDialectLint } from './dialect-lint';

export interface ComputeDialectLintInput {
  /** The leg's child stage — where the Author task lives. */
  stageId?: unknown;
  /** The binding interface contract, from the leg task's `inputContext.interfaceContract` (CC7). */
  interfaceContract?: unknown;
}

export async function computeDialectLintFact(
  prisma: PrismaClient,
  { stageId, interfaceContract }: ComputeDialectLintInput
): Promise<Record<string, unknown>> {
  if (typeof stageId !== 'string' || !stageId) {
    return { checked: false, reason: 'no-child-stage', tokensConsidered: [], violations: [] };
  }

  const children = await prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
  });
  // Same predicate as the containment enrichment, deliberately — one notion of "the author child".
  const authorChild = children.find(c =>
    (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author'));
  if (!authorChild) {
    return { checked: false, reason: 'no-author-child', tokensConsidered: [], violations: [] };
  }

  // The Author is an ACTION task, so `result.json` is the right artifact name here. Do NOT copy
  // this predicate to a PIPELINE lookup — a PIPELINE writes `pipeline-index.json` instead, which is
  // the same class of defect the containment header records at three separate sites.
  const rows = await prisma.$queryRaw<Array<{ fr: string | null }>>`
    SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts
    WHERE name = 'result.json' AND content LIKE '{%'
      AND (content::jsonb)->>'taskId' = ${authorChild.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  const authorText = rows[0]?.fr ?? null;
  if (!authorText) {
    return { checked: false, reason: 'no-author-text', tokensConsidered: [], violations: [] };
  }

  // runDialectLint owns the remaining named reasons (no-contract / no-banned-token-list /
  // no-fenced-blocks) — do not re-derive them here.
  return runDialectLint(authorText, interfaceContract) as unknown as Record<string, unknown>;
}
