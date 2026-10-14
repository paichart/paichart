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
 * ABSENCE FIRST. The source fact and the flag are written only when a contract was SUPPLIED at create
 * (task-create-handler.ts, the C2-a block), so in the dominant firing case — a PIPELINE child the harness created
 * without a contract — there is no source fact at all, and a diagnosis that starts from the fact points at a red
 * herring. ONE branch is emitted. Only ENUM fields of the fact are interpolated, each checked against a closed shape;
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
      return 'Cause: no contract was supplied when this child was created. The platform copies the program plan\'s ' +
        'contract only when the creating harness supplies one, and never back-fills a PIPELINE child (a child created ' +
        'before 2026-10-04 predates that copy). A program pipeline child must be created with interfaceContract one ' +
        'level deep in the task.create parameters.';
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
  if (src.arm === 'inherit') {
    return `Cause: the platform's program-plan inheritance declined for this child (source: ${enumField(src.source)}, ` +
      `planResolution: ${enumField(src.planResolution)} — the reason the plan's contract was not attached), and the ` +
      'contract stored at create was lost afterwards.';
  }
  // AE-L2 (E4 review): a NON-PIPELINE child also ran the owning-leg inheritance before this throw and it declined —
  // point at its log line too (still one branch per input).
  return `Cause: a contract was stored at create (source: ${enumField(src.source)}, planResolution: ` +
    `${enumField(src.planResolution)}) and is absent now — a post-create loss. Restore it before re-running.` +
    (input.taskType === 'PIPELINE' ? '' : ' The owning-leg inheritance did not heal it: its reason is on the ' +
      'CONTRACT_INHERIT_REFUSED / CONTRACT_INHERIT_FAILED log line for this task id.');
}
