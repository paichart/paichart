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
import { buildNetContext, type BuildNetContextInput } from '@/lib/agents/harness/net-context';
import { isProgramHarnessTask } from '@/lib/agents/harness/program-protocol';

/**
 * The ctx inputs the core computes ONCE and hands the nets, forwarded to `buildNetContext` UNCHANGED (one rest-spread below, never a
 * field-by-field copy). Typed as a Pick of `BuildNetContextInput`, so a field is either here — and then reaches the nets by
 * construction — or absent, and then a caller passing it as a plain property is a compile error.
 *
 * PLATFORM-DRIFT-CALLS-DROPPED (2026-11-16, kubernetes-gitops 1.19.0 canary): `configSources` and `platformDriftCalls` were passed by the
 * core as CONDITIONAL SPREADS (`...(x ? { x } : {})`), which TypeScript does not excess-property-check, while this input declared
 * neither — so the platform's drift call was made and its record dropped here (`gitLiveDrift` read `no-platform-call-record`). Callers
 * pass these as plain properties (null/undefined for "none"); `test:stamp-execution-nets-forward` drives a record through this hop.
 *   owningLeg       — Stage B (A6): the core's one owning-leg resolution; absent (rescue, replays) ⇒ resolved lazily, same function.
 *   deviceSources   — held-network step 3 batch 2b: the core's one read of the leg's declared Device sources; absent ⇒ lazy, same reader.
 *   configSources   — Config sources STEP 2: the core's one read of the leg's declared Config sources; absent ⇒ lazy, same reader.
 *   platformDriftCalls — Config sources STEP 2: the platform's drift call record (`undefined` = no call planned ⇒ NOT_STAMPED). The
 *                     rescue never passes it (a PIPELINE task — no Harvester point applies, and it must never call); a replay passes
 *                     the STORED record.
 *   fileSourceCompare — Config sources STEP 3 P3: the core's file-comparison record (`undefined` = none was made ⇒ the record net is
 *                     NOT_STAMPED and the three facts read `no-compare-record` on a declared leg). The rescue never passes it (a
 *                     PIPELINE task — no Harvester point applies); a replay passes the STORED record (it cannot be recomputed: the
 *                     served text is stored nowhere).
 *   held            — Stage B: the variant stamps built pre-tx (V-5d/V-5g).
 */
export type NetContextPassThrough = Pick<BuildNetContextInput, 'owningLeg' | 'deviceSources' | 'configSources' | 'platformDriftCalls' | 'fileSourceCompare' | 'held'>;

export interface StampExecutionNetsInput extends NetContextPassThrough {
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
  const { task, executionId, logger, agentRole, harnessMode, finalResponse, ...passThrough } = input;
  // Exhaustiveness: everything left after the named fields IS the pass-through. A field added to the input that is neither named above
  // nor a `buildNetContext` input makes this a compile error, never a silent drop.
  const noUnforwardedField: Exclude<keyof typeof passThrough, keyof NetContextPassThrough> extends never ? true : never = true;
  void noUnforwardedField;
  // TIER: resolved ONCE (the stamp-first predicate the completion core uses); every net's tier ARM lives inside its
  // own enrichment — the half a replay runner can exercise.
  const programTier = task.type === 'PIPELINE' && isProgramHarnessTask(task as never);
  const netCtx = buildNetContext({
    prisma: db,
    task: { id: task.id, type: task.type, metadata: task.metadata, inputContext: task.inputContext },
    agentRole: agentRole ?? null,
    harnessMode: harnessMode ?? null,
    finalResponse,
    programTier,
    executionId,
    // VERBATIM-QUOTE-OMISSION (2026-10-13): read off the BUILT resultJson, here, so the core and the rescue cannot hand
    // the nets different tool results (one chokepoint; the builder has already applied the persist truncation).
    toolCalls: resultJson.toolCalls,
    // owningLeg / deviceSources / configSources / platformDriftCalls / fileSourceCompare / held — the core's one reads and records, forwarded whole
    // (buildNetContext normalises absent/null itself, so this is byte-equivalent to the old per-field `?? null` copies).
    ...passThrough,
    // Config-sources network push 1a (EF-S3): the version key `liveEvidence` is stamped on — read off the BUILT resultJson, like
    // toolCalls, so the core and the rescue hand the nets the same value.
    protocolInjection: resultJson.protocolInjection,
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
