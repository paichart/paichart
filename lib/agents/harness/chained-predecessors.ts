/**
 * chained-predecessors — WHICH predecessor executions an execution was given, and whether they are still the
 * authoritative ones (RWF Stage 1 C.1, 2026-09-26; plan cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §4).
 *
 * Three consumers ask the same question, so they share this module:
 *   - the Reviewer rule at the create chokepoint (C.1). An orchestrator re-execution of a reviewer is refused
 *     only when its inputs are PROVABLY the same: a same-input judge re-roll.
 *   - keep-best on changed input (C.2). A retry whose inputs differ from its target's gets no comparison.
 *   - verdict freshness (C.3). `verdictFresh: yes|no|unknown` on the lean card, plus the leg-synthesize fact.
 *
 * THE RECORD. `agent_executions.context.chainedPredecessors` is written at the chokepoint, derived ONLY from
 * prepareTaskForExecution's own outcome, as a declared state:
 *   { status: 'chained', ids: { <predecessorTaskId>: <executionId> } }
 *   { status: 'not-chained', reason: 'scheduled' | 'skip-chaining' | 'chain-failed' | 'no-deps' | 'nothing-chained' }
 * Own dependency edges only. Entries injected from an owning leg (`inheritedFromLeg`) are NOT this execution's
 * predecessors and are excluded. 'nothing-chained' means dependencies existed but none was chained (all
 * skipped); an empty `ids` would otherwise compare as vacuously "same".
 *
 * Absent record: the execution predates C.1. The LEGACY fallback is the frozen `config.inputContext.chainedFrom`
 * (the post-chain value since 2026-07-17), through the SAME projection. With neither, the createdAt fallback
 * below applies.
 *
 * THE COMPARISON IS THREE-STATE, and "unknown" is never "same" (independent audit N8). A consumer that
 * refuses on "same" therefore refuses only on proof. The createdAt fallback can prove "different" (a
 * predecessor's authoritative run is newer than this execution) but never "same".
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../../services/execution-selection';

export * from './chained-record';
import { readChainedRecord } from './chained-record';

export type InputMatch = 'same' | 'different' | null;

export interface InputComparison {
  /** 'same' only on proof; null = unknown. */
  match: InputMatch;
  basis: 'record' | 'legacy-config' | 'not-chained' | 'createdAt' | 'no-predecessors';
  predecessors: Array<{ taskId: string; reviewedExecutionId: string | null; authoritativeExecutionId: string | null; match: boolean | null }>;
}

type CompareClient = PrismaClient | Prisma.TransactionClient;

/**
 * Were `exec`'s predecessors the ones that are authoritative NOW? The authoritative side is selected with
 * CHAIN_SELECTION_OPTIONS, i.e. exactly what a re-run would be chained.
 */
export async function compareChainedInputs(
  client: CompareClient,
  exec: { taskId: string; createdAt: Date; context: unknown; config: unknown },
): Promise<InputComparison> {
  const { record, source } = readChainedRecord(exec);

  if (record?.status === 'not-chained') return { match: null, basis: 'not-chained', predecessors: [] };

  if (record?.status === 'chained') {
    const predecessors: InputComparison['predecessors'] = [];
    for (const [taskId, reviewedExecutionId] of Object.entries(record.ids)) {
      const { execution } = await selectAuthoritativeExecution(client, taskId, CHAIN_SELECTION_OPTIONS);
      const authoritativeExecutionId = execution?.id ?? null;
      predecessors.push({ taskId, reviewedExecutionId, authoritativeExecutionId, match: authoritativeExecutionId === reviewedExecutionId });
    }
    return {
      match: predecessors.every((p) => p.match) ? 'same' : 'different',
      basis: source === 'legacy-config' ? 'legacy-config' : 'record',
      predecessors,
    };
  }

  // createdAt fallback: proves 'different' only, never 'same'.
  const deps = await client.taskDependency.findMany({ where: { taskId: exec.taskId }, select: { dependsOnId: true }, take: 50 });
  if (deps.length === 0) return { match: null, basis: 'no-predecessors', predecessors: [] };
  const predecessors: InputComparison['predecessors'] = [];
  let newer = false;
  for (const d of deps) {
    const { execution } = await selectAuthoritativeExecution(client, d.dependsOnId, CHAIN_SELECTION_OPTIONS);
    const isNewer = !!execution && execution.createdAt.getTime() > exec.createdAt.getTime();
    if (isNewer) newer = true;
    predecessors.push({ taskId: d.dependsOnId, reviewedExecutionId: null, authoritativeExecutionId: execution?.id ?? null, match: isNewer ? false : null });
  }
  return { match: newer ? 'different' : null, basis: 'createdAt', predecessors };
}


/**
 * Verdict freshness for ONE reviewer execution (RWF C.3; §11 I31 shape; independent audit N8): were the
 * predecessor executions it judged still the authoritative ones? The ONE function behind both the card-time
 * `verdictFresh` and the leg-synthesize `verdictFreshness` stamp, so they cannot disagree about the rule.
 */
export async function computeVerdictFreshness(client: CompareClient, reviewerExecutionId: string): Promise<InputComparison | null> {
  const row = await client.agentExecution.findUnique({
    where: { id: reviewerExecutionId }, select: { taskId: true, createdAt: true, context: true, config: true },
  });
  return row ? compareChainedInputs(client, row) : null;
}

/** Card rendering of a comparison: a derived word, never the stamped field. */
export function freshnessWord(c: InputComparison | null): 'yes' | 'no' | 'unknown' {
  return c?.match === 'same' ? 'yes' : c?.match === 'different' ? 'no' : 'unknown';
}
