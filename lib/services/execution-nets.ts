/**
 * stampExecutionNets — the ONE production call site of the mechanical-net registry (COMPLETE-THEN-FAIL build review
 * EF-F2, 2026-10-05).
 *
 * Two production paths stamp the nets onto a built result: the normal happy path (`execution-core.ts`) and the
 * completion-anchored rescue (`execution-completion-anchored.ts`). Until this helper existed the rescue hand-copied the
 * core's `buildNetContext` literal and ran only `leg-synthesize`. They were equal (the acceptance replay proved it) but
 * nothing HELD them equal: the next field added to one ctx literal, or a leaf-persist net that applies to a harness,
 * would silently fork the rescued row's facts (the Bug Class 75 shape). One function, both call sites, so equality is
 * structural.
 *
 * Runs BOTH invocation points of the registry loop, in order: `leaf-persist` then `leg-synthesize`. On the rescue path
 * (always a PIPELINE task) no leaf-persist entry applies — every leaf-persist `appliesTo` requires `type !== 'PIPELINE'`
 * — so running it there is a no-op today and stays correct if that ever changes.
 *
 * Everything load-bearing about the registry call is unchanged: PRE-tx, NON-THROWING per net (the loop stamps the net's
 * `errorFact()` on a throw), FACTS never verdicts.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import { runNetsAtPoint } from '@/lib/agents/harness/net-registry';
import { MECHANICAL_NETS } from '@/lib/agents/harness/mechanical-nets';
import { buildNetContext } from '@/lib/agents/harness/net-context';
import { isProgramHarnessTask } from '@/lib/agents/harness/program-protocol';

export interface StampExecutionNetsInput {
  task: { id: string; type?: string | null; metadata: Prisma.JsonValue | null; inputContext?: unknown };
  agentRole: string | null;
  harnessMode: string | null;
  finalResponse: string | null | undefined;
  executionId: string;
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

/** Stamp every applicable net onto `resultJson` (mutated in place). Resolves when both points have run. */
export async function stampExecutionNets(
  db: PrismaClient,
  input: StampExecutionNetsInput,
  resultJson: Record<string, unknown>,
): Promise<void> {
  const { task, executionId, logger } = input;
  // TIER: resolved ONCE (the stamp-first predicate the completion core uses); every net's tier ARM lives inside its
  // own enrichment — the half a replay runner can exercise.
  const programTier = task.type === 'PIPELINE' && isProgramHarnessTask(task as never);
  const netCtx = buildNetContext({
    prisma: db,
    task: { id: task.id, type: task.type, metadata: task.metadata, inputContext: task.inputContext },
    agentRole: input.agentRole ?? null,
    harnessMode: input.harnessMode ?? null,
    finalResponse: input.finalResponse,
    programTier,
    executionId,
    // VERBATIM-QUOTE-OMISSION (2026-10-13): read off the BUILT resultJson, here, so the core and the rescue cannot hand
    // the nets different tool results (one chokepoint; the builder has already applied the persist truncation).
    toolCalls: resultJson.toolCalls,
    onContractApplicabilityError: (err) =>
      logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) },
        'contract-applicability lookup failed — facts stamped without it'),
  });
  const stampNet = (name: string, fact: Record<string, unknown>) => { resultJson[name] = fact; };
  const netError = (name: string, err: unknown) =>
    logger.warn({ executionId, net: name, err: err instanceof Error ? err.message : String(err) },
      `${name} enrichment failed — fact recorded as checked:false`);
  // TWO INVOCATION POINTS OF ONE LOOP, not two loops. `rollbackContainment` registers at both with different
  // implementations: computed at the Author leaf's persist so the chainer carries it into the Reviewer's §6 BEFORE the
  // review, then HOISTED (never recomputed) at the leg's SYNTHESIZE.
  await runNetsAtPoint('leaf-persist', netCtx, MECHANICAL_NETS, stampNet, netError);
  await runNetsAtPoint('leg-synthesize', netCtx, MECHANICAL_NETS, stampNet, netError);
}
