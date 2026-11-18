/**
 * planWitness FACT LEVER (L-CS-T re-lab, 2026-11-18; owed by the execution-facts hand-over, PLAN-WITNESS-BUILD.md §7).
 *
 * Production (execution-core.ts, the pre-transaction held-edit step): on a terraform-iac ≥ 1.17.0 Author the core reads which names
 * each applied held edit sets — `planWitnessKeysOrNull(pkg.application, step.files)` — and hands it to the nets as
 * `held.planWitnessKeys`; the leaf net `planWitness` computes the fact from the package text and that key read; the chainer carries
 * the stamp from the Author's leaf entry to PLAN_WITNESS_READERS (the leg Reviewer) and §6 renders it; the held-edit carrier forces an
 * approved leg whose fact reads the stop sentence `altered` / `absent`, or (second build, 2026-11-18, PLAN-WITNESS-BUILD.md §8b) — where
 * every edit was read — a name `Missing from the block` (`witness-incomplete`) or an unchanged key the block gives a value for
 * (`witness-whole-value`). ONE shipping function decides all four (`planWitnessForceReason`); the lever never names a reason itself.
 *
 * The lab does the same with the SAME shipping functions, never a hand-built fact:
 *   - `planWitnessHeldInput`  — the key read, version-keyed on the arm's protocol injection exactly as the core keys it (`{}` on every
 *     arm below terraform-iac 1.17.0, so every earlier replay's net ctx is byte-identical);
 *   - the net itself runs in nets.ts `runAuthorLeafNets` (the shipping registry entry), unchanged;
 *   - `planWitnessForEntry`   — the chainer's carry rule (an object stamp, to a PLAN_WITNESS_READERS role only);
 *   - `planWitnessLegForce`   — the carrier's reason for one sample. The carrier's own composition is a private tail of
 *     `applyHeldEditCarrier` (it needs a database), so the lab composes the two EXPORTED shipping pieces — `heldEditVerdict` and
 *     `planWitnessForceReason` — under the carrier's precedence: a run-level reason, then the package's own reason, then the stop
 *     sentence, which fires only where nothing else forces and the package is in scope. That precedence line is the one thing copied;
 *     test LCT10 pins the shipping source line it copies (a drift point, named).
 */
import type { EditApplication } from '../../lib/agents/harness/held-bytes/apply';
import { planWitnessApplies, planWitnessKeysOrNull, planWitnessForceReason } from '../../lib/agents/harness/plan-witness';
import { PLAN_WITNESS_READERS } from '../../lib/agents/harness/context-chainer';
import { heldEditVerdict } from '../../lib/agents/harness/held-edit-carrier';

type KeyFiles = Parameters<typeof planWitnessKeysOrNull>[1];

/** The `held.planWitnessKeys` input, as the core builds it. `{}` when the arm's composed protocol has no stop sentence. */
export function planWitnessHeldInput(protocolInjection: unknown, app: EditApplication | null | undefined, files: KeyFiles): { planWitnessKeys?: unknown } {
  if (!planWitnessApplies(protocolInjection)) return {};
  return { planWitnessKeys: planWitnessKeysOrNull(app ?? null, files) };
}

/** The chainer's carry rule (context-chainer.ts): an object stamp, from the Author's leaf entry, to a PLAN_WITNESS_READERS role only. */
export function planWitnessForEntry(stamped: unknown, consumerRole: string | null | undefined): Record<string, unknown> | null {
  if (!stamped || typeof stamped !== 'object' || Array.isArray(stamped)) return null;
  return PLAN_WITNESS_READERS.has(consumerRole ?? '') ? stamped as Record<string, unknown> : null;
}

export interface PlanWitnessLegForce {
  /** The reason the carrier would stamp on this leg (null = nothing forces). */
  reason: string | null;
  /** True when the reason is the Plan-witness FACT's own — any of the four `planWitnessForceReason` returns (`stop-sentence-altered`,
   *  `stop-sentence-absent`, `witness-incomplete`, `witness-whole-value`). */
  byWitnessFact: boolean;
  /** What the fact alone would force, whatever else forces (reported, so a masked fact reason is visible). */
  witnessFactReason: string | null;
  /** Lever version 2 = the four-reason carrier (§8b). A sample without it was written by the two-reason lever (the stop sentence only:
   *  its fields were `byStopSentence` / `stopSentenceReason`), and its recorded force is the force of ITS day. */
  leverVersion: 2;
  inScope: boolean;
  state: string;
}

/** The carrier's verdict for one lab sample. `runLevelReason`: a reason decided by inputs the cell holds fixed (the Config force,
 *  a pin refusal) — it outranks every package-level reason, as in the carrier. The Reviewer is taken to have seen the platform's
 *  rendering of THIS Author (true by construction in the lab: it chains its own Author to its Reviewer; golden-set.ts reads it so). */
export function planWitnessLegForce(args: { fact: unknown; editApplication: Record<string, unknown> | null | undefined; authorExecutionId: string; runLevelReason?: string | null }): PlanWitnessLegForce {
  const ea = args.editApplication && typeof args.editApplication === 'object' ? args.editApplication : null;
  const author = ea ? { state: 'ok' as const, taskId: 'lab', executionId: args.authorExecutionId, fact: ea } : null;
  const digest = ea?.candidateDigest8;
  const reviewer = { state: 'ok' as const, taskId: 'lab', executionId: 'lab-r', fact: { state: 'rendered', authorExecutionId: args.authorExecutionId, ...(typeof digest === 'string' ? { candidateDigest8: digest } : {}) } };
  const base = heldEditVerdict(author, reviewer);
  const witnessFactReason = planWitnessForceReason(args.fact);
  // The carrier's tail: `witnessReason && !readError && base.reason === null && base.inScope ? { ...base, reason: witnessReason } : base`
  const witness = witnessFactReason && base.reason === null && base.inScope ? witnessFactReason : null;
  const reason = args.runLevelReason ?? base.reason ?? witness;
  return { reason, byWitnessFact: reason !== null && reason === witness, witnessFactReason, leverVersion: 2, inScope: base.inScope, state: base.state };
}

/** Read a sample's recorded `planWitnessForce`, whichever lever wrote it. `v2` false = the two-reason lever of the first re-lab (RL-1..RL-4):
 *  that record is the force of its day (the list reasons did not exist), and is never judged against a four-reason expectation. */
export function readSampleForce(rec: unknown): { reason: string | null; byFact: boolean; v2: boolean } {
  if (!rec || typeof rec !== 'object') return { reason: null, byFact: false, v2: false };
  const r = rec as Record<string, unknown>;
  const v2 = r.leverVersion === 2;
  return { reason: typeof r.reason === 'string' ? r.reason : null, byFact: (v2 ? r.byWitnessFact : r.byStopSentence) === true, v2 };
}
