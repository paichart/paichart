/**
 * The CAUSE clause of the `INTERFACE_CONTRACT_MISSING` refusal (promotion E, E4; PLAN-v2 §E4, SYNTHESIS §3 C6,
 * agent-execution F5, pipeline-harness L1).
 *
 * PURE and SYNCHRONOUS on purpose: the refusal is thrown OUTSIDE every try in prepare-task-for-execution.ts (pinned,
 * test-cc7-contract-guard B1.4), and this is evaluated inside that throw expression — so it may not await, read the
 * database or throw. Its inputs are fields the guard has ALREADY loaded: the task type, the `requiresInterfaceContract`
 * flag, and `metadata.interfaceContractSource` (stamped by the create arm at task.create, or by the program-plan
 * reviewer arm earlier in the same prepare call).
 *
 * ABSENCE FIRST. The source fact is written at create when a contract was SUPPLIED (the C2-a block) and — since the Q2
 * leg-contract heal (2026-10-17) — when the program's own harness created a PIPELINE child WITHOUT one: the platform then
 * either stores the plan's contract (`arm:'create-absent'`, flagged, so F16 does not fire) or records why it declined
 * (`arm:'create-absent-declined'` + `declineReason`, no contract, no flag — F16 fires and the DECLINE branch below names
 * the reason). A PIPELINE child with NO fact now means: another door (GUI, REST, an external MCP client, another agent),
 * a harness call that fell to the HTTP fallback and lost its execution id, or a child created before the deploy.
 * ONE branch is emitted. Only ENUM fields of the fact are interpolated, each checked against a closed shape;
 * never contract content. The whole message must fit the 1,500-char cap the program reads it through
 * (task-can-never-run-persist.ts truncates the comment) — pinned in test-cc7-contract-guard.ts.
 */
const ENUM_RX = /^[a-z][a-z-]{0,48}$/;
const enumField = (v: unknown): string => (typeof v === 'string' && ENUM_RX.test(v) ? v : 'unrecognised');

export interface InterfaceContractMissingInput {
  taskType: string | null | undefined;
  /** metadata.requiresInterfaceContract === true */
  flagged: boolean;
  /** metadata.interfaceContractSource, as loaded (any shape) */
  sourceFact: unknown;
}

export function interfaceContractMissingCause(input: InterfaceContractMissingInput): string {
  const src = input.sourceFact !== null && typeof input.sourceFact === 'object' && !Array.isArray(input.sourceFact)
    ? (input.sourceFact as Record<string, unknown>) : null;
  if (!src) {
    if (input.taskType === 'PIPELINE' && !input.flagged) {
      return 'Cause: no contract was stored when this child was created, and the platform recorded no reason. The platform ' +
        'stores the program plan\'s contract at create when one is supplied, or when the program\'s own harness run creates ' +
        'the child without one; neither was recorded here: the child came through another door (GUI, REST, an external ' +
        'client or another agent), through a harness call that lost its execution id on the HTTP fallback, or before ' +
        '2026-10-17. Create it with interfaceContract one level deep in the task.create parameters.';
    }
    if (input.taskType === 'PIPELINE') {
      // AE-L1 (E4 review): no source fact does NOT date the child — it is also absent for a child created outside a
      // program stage, or when the plan lookup failed at create (CONTRACT_PLAN_RESOLVE_FAILED). List all three.
      return 'Cause: a contract was stored at create (the child is flagged) and is absent now — a post-create loss. ' +
        'No source fact was recorded (created before 2026-10-04, outside a program stage, or the plan lookup failed ' +
        'at create). Restore it before re-running.';
    }
    return 'Cause: a contract was stored at create (the child is flagged) and is absent now, and no inheritance supplied ' +
      'one: the owning-leg reason is on the CONTRACT_INHERIT_REFUSED / CONTRACT_INHERIT_FAILED log line for this task id.';
  }
  // Q2 leg-contract heal (2026-10-17): the platform DECLINED to supply the plan's contract at create. Placed BEFORE the
  // post-create-loss fallthrough — a declined child never had a contract, so that text would be false for it.
  if (src.arm === 'create-absent-declined') {
    const reason = enumField(src.declineReason);
    const gloss = reason === 'contract-key-seen'
      ? 'an interfaceContract WAS sent in the task.create call but did not reach the validated parameters, so the platform did not supply one'
      : reason.startsWith('stage-legs-')
        ? 'this reason describes the stage\'s OTHER pipeline legs (see the other legs of this stage), not this child'
        : reason === 'plan-unresolved'
          ? `the program plan's contract could not be read (planResolution: ${enumField(src.planResolution)})`
          : 'it names which condition on the creating call failed';
    return `Cause: this child was created without a contract and the platform declined to store the program plan's contract ` +
      `at create (declineReason: ${reason}; ${gloss}). No contract was stored, so none was lost.`;
  }
  if (src.arm === 'inherit') {
    return `Cause: the platform's program-plan inheritance declined for this child (source: ${enumField(src.source)}, ` +
      `planResolution: ${enumField(src.planResolution)} — the reason the plan's contract was not attached), and the ` +
      'contract stored at create was lost afterwards.';
  }
  // AE-L2 (E4 review): a NON-PIPELINE child also ran the owning-leg inheritance before this throw and it declined —
  // point at its log line too (still one branch per input).
  return `Cause: a contract was stored at create (source: ${enumField(src.source)}, planResolution: ` +
    `${enumField(src.planResolution)}) and is absent now — a post-create loss. Restore it before re-running.` +
    // Q2 (2026-10-17): a contract the PLATFORM stored for a harness create that carried none — say so (one branch, one cause).
    (src.arm === 'create-absent' ? ' The platform stored it at create because the creating harness call carried none (arm: create-absent).' : '') +
    (input.taskType === 'PIPELINE' ? '' : ' The owning-leg inheritance did not heal it: its reason is on the ' +
      'CONTRACT_INHERIT_REFUSED / CONTRACT_INHERIT_FAILED log line for this task id.');
}
