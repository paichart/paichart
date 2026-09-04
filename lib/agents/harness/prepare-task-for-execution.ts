/**
 * Prepare Task For Execution
 *
 * Thin pre-execution step invoked ONCE at the execution-row chokepoint
 * (`createAgentExecution`) so EVERY execution path — explicit `agent.execute`,
 * both task-ready reactors, the pipeline-retrigger reactor, the REST task-execute
 * route, and the SSE stream route — populates `task.inputContext` §6 with
 * full-fidelity chained dependency output before the row is created.
 *
 * Extracted from `createAgentExecution`'s body (architectural-review R1) to keep
 * that wrapper's "validate → create row → audit" single responsibility honest.
 *
 * Contract: NON-FATAL but LOUD. A chaining failure must not block execution (a
 * stage on partial input still beats a stage that won't run), but it must be
 * greppable — a silently-partial downstream stage is the exact bug class this fix
 * eliminates. The benign "no dependencies" path returns null WITHOUT a warn.
 *
 * @created 2026-06-06
 * @see cline_docs/reviews/2026-06-06-pipeline-stage-handoff-truncation/IMPLEMENTATION-PLAN-v2.md (Change 1)
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { CanNeverRunError } from '@/lib/errors';
import { chainDependencyContext, applyChainedContext } from './context-chainer';
import { inheritInterfaceContractIfAbsent } from '@/lib/tasks/services/inputContext';
import { deepStripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { resolveProtocolStamp, programHarnessProtocolFilter } from './program-protocol';

const log = logger.child({ module: 'PrepareTaskForExecution' });

export interface PrepareTaskOptions {
  /** Execution row status. SCHEDULED rows chain at PROCESSING time, not schedule time. */
  status?: string;
  /**
   * Skip chaining entirely (preserves v1 semantics: when an explicit inputContext
   * override was supplied by the caller, do not clobber it with dependency context).
   */
  skipChaining?: boolean;
}

/**
 * Chain completed-dependency outputs into `task.inputContext` before execution.
 *
 * @returns The serialized merged inputContext (so an in-memory caller can adopt it
 *   without a second DB read — the SSE stream route), or null when NO PLATFORM WRITE OCCURRED.
 *
 *   ⚠️ The return no longer means "chaining happened" — since 2026-08-26 a contract INHERITANCE
 *   write also produces a merged value. Both consumers (BC-T6-1 frozen config at
 *   agent-execution-create, and the SSE route's in-memory task adoption) need only "the
 *   authoritative merged row value", which either write genuinely yields. The TYPE is unchanged;
 *   this doc is the part that would otherwise mislead.
 *
 *   EXCEPTION — the skipChaining path still returns null even when inheritance wrote. That path is
 *   the explicit-inputContext override (TS3), and BC-T6-1's invariant is "null leaves the caller's
 *   value untouched"; returning the row would make the frozen config REPLACE the caller's override,
 *   the inverse of its purpose. The row is still updated, and the engine builds prompts from the
 *   row — so nothing is lost except a forensic row/prompt divergence, which is logged.
 */
export async function prepareTaskForExecution(
  taskId: string,
  opts: PrepareTaskOptions = {}
): Promise<Record<string, unknown> | null> {
  // SCHEDULED rows are created long before they run; chaining now would capture a
  // stale upstream snapshot. The future SCHEDULED processor must chain at run time.
  if (opts.status === 'SCHEDULED') return null;

  // ── CONTRACT INHERITANCE (2026-08-26) — write-if-absent, BEFORE everything below ──────────────
  // PLACEMENT IS LOAD-BEARING, and it is why there is no "recompute hasContract" dance here. This
  // write is a single autocommitted statement, so the contractCheck read further down happens
  // strictly AFTER it commits and sees the inherited contract — the snapshot is simply correct, and
  // it doubles as the fresh re-read a concurrent-prepare LOSER would otherwise need. Placing this
  // after that read instead would leave the F16 guard seeing hasContract=false and marking the child
  // FAILED for a contract the platform had just installed: self-inflicted, no second actor required.
  //
  // It also runs BEFORE the skipChaining return, so an explicit-override execution still gets the
  // row updated (see the JSDoc exception on what that path returns).
  //
  // WHY THE PLATFORM DOES THIS AT ALL: the leg harness is an LLM, and it paraphrases the contract
  // into its children's descriptions — 7 of 7 archived legs lost most of the canonical stanza, 0 of
  // N children ever held the structured contract. You cannot fix an LLM's adherence deterministically
  // at the door the LLM itself walks through; execute-prep is the first deterministic touchpoint
  // downstream of it.
  //
  // ⚠️ ASYMMETRY WITH F16, DELIBERATE AND CAPABILITY-DERIVED (not preference): a PIPELINE leg
  // missing its contract FAILS LOUD because the platform holds no deterministic source for it — the
  // value exists only in the Architect's artifact. A NON-PIPELINE child's contract sits one
  // deterministic hop up, so heal-WITH-EVIDENCE beats fail. The evidence is the log line below;
  // without it this would merely institutionalise the harness's paraphrase failure and make
  // adherence regressions invisible. REVISIT TRIGGER: if the Architect's output ever becomes
  // structured enough that the platform CAN supply leg contracts deterministically, this asymmetry
  // loses its justification and must be re-decided rather than treated as settled.
  //
  // The two populations are DISJOINT by construction — inheritance is non-PIPELINE only, the F16
  // structural arm is PIPELINE only — so the guard can never demand a contract this declines to
  // supply. That disjointness is the real invariant and is pinned behaviorally; do not "unify" it.
  let inheritedContext: Record<string, unknown> | null = null;
  try {
    inheritedContext = await inheritInterfaceContractIfAbsent(taskId, {
      sanitize: deepStripDangerousKeys,
      maxBytes: 65536,
      onRefused: (reason, detail) =>
        log.error({ ...detail, errorCode: 'CONTRACT_INHERIT_REFUSED', reason },
          'contract inheritance refused — child runs without the contract, as before'),
      onInherited: (detail) =>
        log.info({ ...detail, errorCode: 'CONTRACT_INHERITED_FROM_LEG' },
          'interface contract inherited from owning leg — the harness brief did not carry it'),
      onDrift: (detail) =>
        log.warn({ ...detail, errorCode: 'INTERFACE_CONTRACT_PARENT_DRIFT' },
          'child holds a FROZEN contract that no longer matches its parent — frozen copy is kept ' +
          'by design; provenanceMatchesQualifiedParent:false would indicate a forged stamp'),
    });
  } catch (err) {
    // Non-fatal by design: a child that does not inherit runs exactly as it does today.
    log.warn({ err, taskId, errorCode: 'CONTRACT_INHERIT_FAILED' },
      'contract inheritance failed — continuing without it');
  }

  // Preserve v1's explicit-path skip (agentTaskService.ts old :253): an explicit
  // inputContext override must not be clobbered by dependency chaining (TS3).
  if (opts.skipChaining) {
    if (inheritedContext) {
      log.info({ taskId, errorCode: 'CONTRACT_INHERITED_ON_OVERRIDE_PATH' },
        'contract inherited on an explicit-override execution — the ROW now carries it but the ' +
        'EXECUTED prompt used the caller override; returning null preserves BC-T6-1');
    }
    return null;
  }

  // CC7 loud-fail consumer (2026-07-15, program-harness design / boundary B1): a program
  // child must NOT execute without its contract — a child designing against a missing/lost
  // addressing plan is the silent-composition-break worst case. DELIBERATELY outside the try
  // below: this must THROW (failing execution creation loudly), never be swallowed into the
  // chain-failed warn+continue path.
  //
  // TWO arms (F12 fix, 2026-07-15 boundary review, APPROVE-WITH-CHANGES@86):
  //   (1) FLAG arm — fast path: metadata.requiresInterfaceContract set but the contract is
  //       absent. Catches POST-create loss (inputContext clobber/merge defects) atomically-
  //       written contracts hit.
  //   (2) STRUCTURAL arm — the authoritative belt, adherence-INDEPENDENT: any PIPELINE task
  //       whose stage is owned by a parent harness running the pov-program protocol, but with
  //       no interfaceContract. This closes the guard HOLE the flag arm cannot: when the harness
  //       never lands the contract at create (e.g. F11 double-nest before the router hoist, or a
  //       future adherence slip), NO flag is set, so arm (1) stays silent and the program would
  //       SILENTLY COMPOSE a contract-less pipeline. Arm (2) derives required-ness from immutable
  //       parent/stage STRUCTURE, not the clobber-prone child flag, and runs at EXECUTE time
  //       (post-gate) when all program wiring is deterministically complete — so it is reliable
  //       regardless of create-time ordering. Discriminator is the PROTOCOL-QUALIFIED two-hop
  //       (NOT bare type==='PIPELINE'): the parent must be a pov-program harness — a standalone
  //       pipeline, a domain-pipeline's own children, and the ACTION-typed producer/Node C/gate/
  //       Architect are all correctly excluded.
  const contractCheck = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, metadata: true, inputContext: true, type: true, stageId: true },
  });

  // ── PROTOCOL STAMP (WS2 Phase A, 2026-08-17) — write-if-absent at the execution chokepoint ──
  // The title token is a CREATE-TIME INPUT, consumed ONCE here at the task's first execution and
  // stamped as the platform fact `metadata.protocol` (canonical library-row name) paired with
  // `metadata.protocolResolvedAt`. Every resolvable token is stamped — leg protocols included
  // (foreclosure FC1); no-token stamps an explicit `protocol: null` (resolution ran, nothing
  // named — distinguishable from never-resolved by the key's presence). NEVER overwrite an
  // existing stamp: after consumption the title is inert to guards (the R1 closure), and a
  // post-stamp rename only produces the disagreement warn below. Written via Postgres-side jsonb
  // concatenation so a concurrent metadata writer is never lost (BC19 class — an app-side
  // read-spread-update here could clobber an interleaved MCP merge).
  // This site is EXEMPT from the task-path write guard by construction (it does not cross the
  // update handlers) — the platform channel the guard design names.
  const taskMeta = (contractCheck?.metadata as Record<string, unknown> | null) ?? {};
  if (contractCheck && !('protocol' in taskMeta)) {
    const resolved = resolveProtocolStamp(contractCheck.title);
    if (resolved.tokenCount > 1) {
      log.warn(
        { taskId, tokenCount: resolved.tokenCount, stamped: resolved.protocol, errorCode: 'PROTOCOL_TOKEN_MULTIPLE' },
        'title carries multiple (protocol: …) tokens — first wins'
      );
    }
    const stampJson = JSON.stringify({
      protocol: resolved.protocol,
      protocolResolvedAt: new Date().toISOString(),
    });
    await prisma.$executeRaw`
      UPDATE tasks SET metadata = COALESCE(metadata, '{}'::jsonb) || ${stampJson}::jsonb
      WHERE id = ${taskId}`;
    taskMeta.protocol = resolved.protocol;
  } else if (contractCheck && typeof taskMeta.protocol === 'string') {
    // Title/stamp disagreement warn (Phase-E live observable): a rename after consumption is
    // legal free text but misleading to humans — say so, move nothing.
    const nowResolved = resolveProtocolStamp(contractCheck.title);
    if (nowResolved.protocol !== taskMeta.protocol) {
      log.warn(
        { taskId, stamped: taskMeta.protocol, titleToken: nowResolved.protocol, errorCode: 'PROTOCOL_TITLE_STAMP_MISMATCH' },
        'task title token disagrees with the authoritative protocol stamp — the stamp governs'
      );
    }
  }

  const requiresContract = taskMeta.requiresInterfaceContract === true;
  const hasContract = !!(contractCheck?.inputContext as Record<string, unknown> | null)?.interfaceContract;

  let structurallyRequiresContract = false;
  if (!hasContract && contractCheck?.type === 'PIPELINE' && contractCheck.stageId) {
    // Is this PIPELINE task's stage owned by a parent harness bound to a PROGRAM protocol?
    // Since WS2 Phase A the discriminator is the parent TASK ROW's `metadata.protocol` STAMP
    // (with a TRANSITIONAL title-token disjunct for pre-stamp parents — an in-flight program's
    // parent may never re-execute to receive one; removal is gated on the recorded backfill).
    // It has never been template metadata: the program harness reuses the generic "Pipeline
    // Harness" template. The stamp read is against the parent TASK row — object discipline per
    // the WS2 panel (same key name exists on templates with different semantics).
    // ⚠️ AND-lift is load-bearing: the stage filter and the protocol filter are BOTH `metadata`
    // filters — two `metadata` keys in one object literal is last-writer-wins and would match
    // every program harness in the POV (pinned).
    const programParent = await prisma.task.findFirst({
      where: {
        type: 'PIPELINE',
        AND: [
          { metadata: { path: ['pipelineStageId'], equals: contractCheck.stageId } },
          programHarnessProtocolFilter(),
        ],
      },
      select: { id: true },
    });
    structurallyRequiresContract = !!programParent;
  }

  if ((requiresContract || structurallyRequiresContract) && !hasContract) {
    // F16 (2026-07-16): typed PERMANENT error — the createAgentExecution chokepoint
    // catches it to mark the task executionStatus=FAILED + escalate the owning program
    // (frozen-cone fix). Message deliberately keeps the INTERFACE_CONTRACT_MISSING
    // string (source pins + log greps key on it).
    throw new CanNeverRunError(
      taskId,
      'missing-interface-contract',
      `INTERFACE_CONTRACT_MISSING: task ${taskId} is a program pipeline child ` +
      `(${requiresContract ? 'flagged requiresInterfaceContract' : 'structurally required by its program-protocol parent'}) ` +
      `but inputContext.interfaceContract is absent — refusing to execute a program child without its ` +
      `binding design constants (silent-composition guard). ` +
      // 2026-08-26: inheritance (inheritInterfaceContractIfAbsent, run earlier in this same
      // function) now backfills a NON-PIPELINE child from its owning leg, so the old advice
      // ("re-create the child with the contract nested at parameters.interfaceContract") is no
      // longer the first thing to check — for those children it is usually WRONG, and sends the
      // reader to rebuild a task when the real answer is one refusal log line away.
      `Diagnose in this order: (1) for a NON-PIPELINE child, inheritance already ran and DECLINED — ` +
      `grep the CONTRACT_INHERIT_REFUSED / CONTRACT_INHERIT_FAILED log for this taskId, whose reason ` +
      `names the cause (no qualified parent in the child's stage, parent holds no object-typed ` +
      `contract, sanitize threw, or contract-too-large); (2) for a PIPELINE child, inheritance does ` +
      `NOT apply by design — the contract must be supplied at task.create, so check it was landed ` +
      `nested at parameters.interfaceContract and not double-nested; (3) only if neither explains it, ` +
      `treat the contract as lost post-create and restore it before re-running.`
    );
  }

  try {
    const chained = await chainDependencyContext(taskId);
    // No dependencies is a benign no-op for CHAINING — but if inheritance wrote, the caller still
    // needs the authoritative merged row. The leg's FIRST child (the harvester) is dep-free and is
    // exactly the child that most needs the contract, so returning null here would have made the
    // whole fix invisible to the SSE route's §6 render and to the frozen-config snapshot.
    if (!chained) return inheritedContext;
    return await applyChainedContext(taskId, chained);
  } catch (err) {
    log.warn(
      { err, taskId, errorCode: 'CONTEXT_CHAINING_FAILED' },
      'context chaining failed — stage will run on partial upstream input'
    );
    return inheritedContext;
  }
}
