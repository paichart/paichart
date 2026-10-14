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
import { inheritInterfaceContractIfAbsent, writeInterfaceContractIfAbsent } from '@/lib/tasks/services/inputContext';
import {
  resolveInheritDecision,
  stampInterfaceContractSource,
  buildSourceFact,
  carryProgramClearance,
  stampCarryAttempt,
  operatorEventOnce,
} from './plan-spawn-carry';
import { isReviewerSet } from './parse-verdict';
import { deepStripDangerousKeys } from '@/lib/utils/sanitize-keys';
import { resolveProtocolStamp, findProgramParentForStage, resolveOwningLeg } from './program-protocol';
import type { LegInjection } from './context-chainer';
import { recordFromChained, type ChainedRecord } from './chained-predecessors';
import { interfaceContractMissingCause } from './interface-contract-missing';

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
  return (await prepareTaskForExecutionWithRecord(taskId, opts)).context;
}

/**
 * RWF C.1 (2026-09-26): the same preparation, plus WHICH case produced the outcome, as the per-execution
 * chained record (chained-predecessors.ts). The null return above is ambiguous across four cases
 * (scheduled, skip-chaining, chain-failed, no-deps) and chain-failed must never be recorded as "no
 * predecessors". createAgentExecution stamps `record` into the execution's context.
 */
export async function prepareTaskForExecutionWithRecord(
  taskId: string,
  opts: PrepareTaskOptions = {}
): Promise<{ context: Record<string, unknown> | null; record: ChainedRecord }> {
  // SCHEDULED rows are created long before they run; chaining now would capture a
  // stale upstream snapshot. The future SCHEDULED processor must chain at run time.
  if (opts.status === 'SCHEDULED') return { context: null, record: { status: 'not-chained', reason: 'scheduled' } };

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
  // ⚠️ ASYMMETRY WITH F16 — now a POLICY, no longer a capability fact (re-decided 2026-10-04, C2-a):
  // a PIPELINE leg missing its contract FAILS LOUD. Until C2-a the reason was capability (the value
  // existed only in the Architect's artifact). The REVISIT TRIGGER recorded here — "the platform CAN
  // supply leg contracts deterministically" — has FIRED: `plan-spawn-carry.ts` now reads the plan's
  // contract deterministically, stores it at create, and heals reviewer-set children below. It was
  // RE-DECIDED (Q2, C2/C3 plan v2 §1.4.6, cline_docs/reviews/value-chain-post-window-2026-10-04/):
  // leg omission still fails loud, because a leg created without its contract signals BROKEN WIRING,
  // and healing it would hide that. Re-decided again at E, on the Q2 trigger (any
  // INTERFACE_CONTRACT_MISSING on a program leg after ship). A NON-PIPELINE child's contract sits one
  // deterministic hop up, so heal-WITH-EVIDENCE beats fail. The evidence is the log line below;
  // without it this would merely institutionalise the harness's paraphrase failure and make
  // adherence regressions invisible.
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

  // ── ONE early read for both PLAN-SPAWN carries (C2-a reviewer arm, C3-a clearance carry) ─────
  // Read once, after the leg arm. Fail-open: a failed read leaves both carries off, as before.
  let inheritedArm: 'leg' | 'plan' | null = inheritedContext ? 'leg' : null;
  let early: {
    type: string; stageId: string | null; agentRole: string | null; metadata: unknown;
    inputContext: unknown; agentTemplate: { templateType: string | null } | null;
  } | null = null;
  try {
    early = await prisma.task.findUnique({
      where: { id: taskId },
      select: { type: true, stageId: true, agentRole: true, metadata: true, inputContext: true,
        agentTemplate: { select: { templateType: true } } },
    });
  } catch (err) {
    log.warn({ err, taskId, errorCode: 'PLAN_SPAWN_CARRY_READ_FAILED' }, 'early read for the PLAN-SPAWN carries failed — continuing without them');
  }
  const earlyMeta = ((early?.metadata as Record<string, unknown> | null) ?? {});
  const earlyContract = (early?.inputContext as Record<string, unknown> | null)?.interfaceContract;
  const earlyHasObjectContract = earlyContract !== null && typeof earlyContract === 'object' && !Array.isArray(earlyContract);

  // ── C2-a REVIEWER ARM (2026-10-04) — inherit the PROGRAM PLAN's contract, write-if-absent ──────
  // PLACEMENT mirrors the leg arm and is load-bearing for the same reasons: BEFORE the skipChaining
  // return (D2) and BEFORE the contractCheck snapshot (D1), so the F16 flag arm sees the installed
  // contract. Runs only when the leg arm wrote nothing.
  // Acts when: NOT PIPELINE (D5 — the shared writer also enforces it in-statement) → no object
  // contract → reviewer-set (`isReviewerSet`, keyed on the TASK's template ON PURPOSE: the contract
  // persists on the task row across executions, so it must not depend on one execution's
  // agentTemplateId override) → the stage is a PROGRAM stage. Breadth, stated: EVERY reviewer-set child
  // of a program stage (today: the two Node C templates), a GUI-added reviewer included.
  // Inherits only when the plan resolves AND every leg holds that plan (Q5, compared on CONTENT —
  // plan-spawn-carry `legBaseline`). A refusal is a log line plus a stamped fact, NEVER a
  // CanNeverRunError (the createAgentExecution catch would FAIL the task): Node C runs as before.
  if (!inheritedContext && early && early.type !== 'PIPELINE' && early.stageId && !earlyHasObjectContract
      && isReviewerSet(early.agentRole, early.agentTemplate?.templateType ?? null)) {
    let programRoot: string | null = null;
    try {
      programRoot = await findProgramParentForStage(prisma, early.stageId);
      if (programRoot) {
        const decision = await resolveInheritDecision(prisma, early.stageId);
        const base = { taskId, stageId: early.stageId, arm: 'plan' as const, programRootId: programRoot,
          architectTaskId: decision.fact.architectTaskId, architectExecutionId: decision.fact.architectExecutionId,
          planSha256: decision.fact.planSha256 };
        if (decision.action === 'inherit') {
          const merged = await writeInterfaceContractIfAbsent(taskId, decision.contract,
            decision.fact.architectTaskId as string, { interfaceContractSource: decision.fact });
          if (merged) {
            inheritedContext = merged;
            inheritedArm = 'plan';
            // A child FLAGGED requiresInterfaceContract was created WITH a contract and lost it after
            // create — the F16 flag arm used to fail it loudly. Healing must keep that loss measurable.
            const healed = earlyMeta.requiresInterfaceContract === true;
            log.info({ ...base, reason: healed ? 'healed-post-create-loss' : 'omitted-at-create', errorCode: 'CONTRACT_INHERITED_FROM_PLAN' },
              'interface contract inherited from the program plan — the child held none');
          }
          if (decision.operatorEvent && operatorEventOnce(decision.fact.architectExecutionId, decision.fact.planSha256)) {
            log.warn({ securityEvent: true, site: 'C2-inherit', taskId, rewriteClasses: decision.operatorEvent.classes,
              matches: decision.operatorEvent.matches, planSha256: decision.fact.planSha256 },
              'R9 would rewrite the rendered program contract (classified, not applied)');
          }
        } else {
          await stampInterfaceContractSource(prisma, taskId, decision.fact);
          // A legitimately contract-less program (no sibling flagged) must not emit WARN on every Node C
          // execution: no-heading / no-architect drop to INFO there.
          let level: 'warn' | 'info' = 'warn';
          if (decision.reason === 'no-heading' || decision.reason === 'no-architect') {
            const flagged = await prisma.task.count({
              where: { stageId: early.stageId, metadata: { path: ['requiresInterfaceContract'], equals: true } },
            });
            if (flagged === 0) level = 'info';
          }
          log[level]({ ...base, reason: decision.reason, legBaseline: decision.fact.legBaseline, errorCode: 'CONTRACT_INHERIT_FROM_PLAN_REFUSED' },
            'program-plan contract NOT inherited — the child runs without it, as before');
        }
      }
    } catch (err) {
      log.error({ err, taskId, arm: 'plan', errorCode: 'CONTRACT_INHERIT_FAILED' },
        'program-plan contract inheritance failed — continuing without it');
      if (programRoot) {
        try {
          await stampInterfaceContractSource(prisma, taskId,
            buildSourceFact({ source: 'none', arm: 'inherit', planResolution: 'resolver-error' }, new Date().toISOString()));
        } catch (stampErr) {
          log.error({ err: stampErr, taskId, errorCode: 'CONTRACT_INHERIT_FAILED' }, 'resolver-error stamp also failed');
        }
      }
    }
  }

  // ── C3-a CLEARANCE CARRY (2026-10-04) — a program leg's duplicateAcknowledged ⊇ root ∪ prior ─────
  // Before the skipChaining return, independent of contractCheck. Fail-open: a throw logs, stamps
  // `lastAttempt {failed}` best effort, and the leg runs as before. E5 (root has no clearance), a
  // non-program leg and the superset no-op write nothing and stamp nothing.
  if (early && early.type === 'PIPELINE' && early.stageId) {
    try {
      const carry = await carryProgramClearance(prisma, { taskId, stageId: early.stageId, legMetadata: earlyMeta });
      if (carry.outcome === 'wrote') {
        log.info({ taskId, rootTaskId: carry.rootTaskId, added: carry.added, errorCode: 'DUPLICATE_CLEARANCE_CARRIED' },
          'program root clearance + prior pipeline stages appended to this leg\'s duplicateAcknowledged');
      } else if (carry.outcome === 'skipped') {
        log.warn({ taskId, rootTaskId: carry.rootTaskId, reason: carry.reason, errorCode: 'DUPLICATE_CLEARANCE_CARRY_SKIPPED' },
          'program root clearance NOT carried onto this leg');
      }
    } catch (err) {
      log.error({ err, taskId, errorCode: 'DUPLICATE_CLEARANCE_CARRY_FAILED' },
        'clearance carry failed — the leg runs with its own clearance, as before');
      try {
        await stampCarryAttempt(prisma, taskId, { outcome: 'failed', reason: 'carry-error', at: new Date().toISOString() });
      } catch (stampErr) {
        log.error({ err: stampErr, taskId, errorCode: 'DUPLICATE_CLEARANCE_CARRY_FAILED' }, 'carry-error stamp also failed');
      }
    }
  }

  // Preserve v1's explicit-path skip (agentTaskService.ts old :253): an explicit
  // inputContext override must not be clobbered by dependency chaining (TS3).
  if (opts.skipChaining) {
    if (inheritedContext) {
      log.info({ taskId, arm: inheritedArm, errorCode: 'CONTRACT_INHERITED_ON_OVERRIDE_PATH' },
        'contract inherited on an explicit-override execution — the ROW now carries it but the ' +
        'EXECUTED prompt used the caller override; returning null preserves BC-T6-1');
    }
    return { context: null, record: { status: 'not-chained', reason: 'skip-chaining' } };
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
    // `agentRole` is read by the injection EXCLUSION policy below (INJECTION_EXCLUDED_ROLES). Without it
    // every child reads undefined, no role is ever excluded, and the harvest-poisoning case ships
    // silently — a predicate on an unselected column is fail-OPEN (caught 2026-09-16 before ship).
    select: { title: true, metadata: true, inputContext: true, type: true, stageId: true, agentRole: true },
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
    // EXTRACTED 2026-09-11 — the query (and its load-bearing AND-lift) now lives in
    // `findProgramParentForStage`, because the contract-applicability facts need the same answer
    // and a second copy of this would be the two-extractor class. Behaviour is unchanged.
    const programParent = await findProgramParentForStage(prisma, contractCheck.stageId);
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
      // Promotion E (E4, 2026-10-05): the cause is a PURE function of fields already loaded above (task type, the
      // flag, the interfaceContractSource fact) — no await between the condition and this throw, so it stays
      // outside every try by construction. ABSENCE FIRST: the source fact exists only when a contract was supplied at
      // create, so the dominant case (a PIPELINE child created without one) has none. One branch; enum fields only.
      interfaceContractMissingCause({ taskType: contractCheck?.type, flagged: requiresContract,
        sourceFact: taskMeta.interfaceContractSource })
    );
  }

  // ── CROSS-PIPELINE DELIVERY (2026-09-16, Bug Class 84) — resolve the owning leg's entries ──────
  // NON-PIPELINE children only, and AFTER the CC7 throw above (which must stay outside every try —
  // pinned). The leg's own `chainedFrom` is handed to the chainer as `inject`; the chainer copies the
  // cross-pipeline entries VERBATIM into this child's chainedFrom, stamped `inheritedFromLeg`, and
  // keeps them out of every dependency-derived count. Same one-hop shape as the contract inheritance
  // at the top of this function, one payload later: the leg harness is an LLM and paraphrases what it
  // received into child descriptions (3 of 51 edges ever reached a child); this is the deterministic
  // touchpoint downstream of it.
  //
  // SCOPE: an EXCLUSION list (context-chainer `INJECTION_EXCLUDED_ROLES` — harvest-shaped roles + the
  // reviewer for now); the chainer applies it from `childAgentRole`. A null role RECEIVES the injection.
  //
  // FAIL-OPEN, LOUD, and NEVER into notChained: a resolution failure logs and the chain proceeds with
  // nothing to inject — the child runs exactly as it did before this change. An `ambiguous` leg (>1
  // PIPELINE row owning this stage) also injects nothing: choosing one would silently decide WHICH
  // pipeline's deliverable the child receives.
  let inject: LegInjection | null = null;
  if (contractCheck && contractCheck.type !== 'PIPELINE' && contractCheck.stageId) {
    try {
      const leg = await resolveOwningLeg(prisma, contractCheck.stageId);
      if (leg.kind === 'one') {
        inject = { legTaskId: leg.legTaskId, entries: leg.chainedFrom, childAgentRole: contractCheck.agentRole };
      } else if (leg.kind === 'ambiguous') {
        log.warn({ taskId, stageId: contractCheck.stageId, candidates: leg.candidates, errorCode: 'OWNING_LEG_AMBIGUOUS' },
          'more than one PIPELINE row owns this stage — injecting nothing rather than choosing');
      }
    } catch (err) {
      log.warn({ err, taskId, stageId: contractCheck.stageId, errorCode: 'OWNING_LEG_RESOLUTION_FAILED' },
        'owning-leg resolution failed — proceeding without cross-pipeline injection');
    }
  }

  try {
    const chained = await chainDependencyContext(taskId, prisma, { inject });
    // No dependencies AND nothing to inject is a benign no-op for CHAINING — but if inheritance
    // wrote, the caller still needs the authoritative merged row. The leg's FIRST child (the
    // harvester) is dep-free and is exactly the child that most needs the contract, so returning
    // null here would have made the whole fix invisible to the SSE route's §6 render and to the
    // frozen-config snapshot. (With something to inject the chainer no longer returns null for a
    // dep-free child — that is the C4 arm, and the injected-only context takes the normal path.)
    if (!chained) return { context: inheritedContext, record: { status: 'not-chained', reason: 'no-deps' } };
    const context = await applyChainedContext(taskId, chained);
    return { context, record: recordFromChained(chained) };
  } catch (err) {
    log.warn(
      { err, taskId, errorCode: 'CONTEXT_CHAINING_FAILED' },
      'context chaining failed — stage will run on partial upstream input'
    );
    return { context: inheritedContext, record: { status: 'not-chained', reason: 'chain-failed' } };
  }
}
