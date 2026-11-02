/**
 * PLATFORM-HELD-BYTES Stage B V-5f — the held-variant NETS' enrichments and the ONE child selector the hoist, V-6 and the
 * carrier share (plan STAGE-B-PLAN.md v4.1 §3 V-5f, V-9; §0.1 A1, A5, A15). Read-only; they TRANSCRIBE, never recompute.
 *
 *   editApplication@leaf-persist    the variant Author's stamp, built by the core through `buildEditApplicationFact` and
 *                                   handed in on ctx (the persist's `overlay('committed')` is the SAME object — AE S2).
 *   heldBytes@leaf-persist          the variant Harvester's capture digest, handed in the same way.
 *   reviewedEditDiff@leaf-persist   the variant Reviewer's: what its PREPARED snapshot carried — the chained Author entry's
 *                                   `editDiff` (V-6). `state: 'rendered'` ONLY when `diffText` reached the entry uncut (A5).
 *   editApplication@leg-synthesize  the hoist: the selected Author's stamp, or `no-author-stamp` (fails closed).
 * Each is CONDITIONAL (`not-variant-leg`): a non-variant task returns NOT_STAMPED — a population answer, never a fact.
 *
 * THE CHILD SELECTOR (EF n3-2, A15): `selectLegChildStamp` takes the leg's child with the EXACT role and reads its stamp
 * through `readAuthoritativeResultField` (the execution the chainer hands on). `hoistRollbackContainment` keeps its
 * `includes('author')` predicate (moving it would change non-variant selection); a pin asserts the two pick the same child
 * on variant legs.
 */
import { createHash } from 'crypto';
import { readAuthoritativeResultField, type AuthoritativeReadClient } from './authoritative-result-read';
import type { ChainedRecord } from './chained-record';

export const HELD_EDIT_REVIEWER_ROLE = 'change_reviewer';
const STAGE_CHILD_SCAN_CAP = 50;
const sha8 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 8);

type SelectorDb = AuthoritativeReadClient & {
  task: { findMany: (a: { where: { stageId: string }; select: { id: true; title: true; agentRole: true }; orderBy: { createdAt: 'asc' }; take: number }) => Promise<Array<{ id: string; title: string; agentRole: string | null }>> };
};

export type ChildStamp =
  | { state: 'ok'; taskId: string; executionId: string; fact: Record<string, unknown> }
  | { state: 'no-child-stage' | 'no-child' | 'no-stamp' | 'unparseable'; taskId?: string; executionId?: string | null };

/** The leg's child with the EXACT role, and its stamp `field`, from the execution the chainer hands on. Throws on a read
 *  error (the caller maps a throw to its could-not-check arm — never to "no stamp"). */
export async function selectLegChildStamp(db: SelectorDb, legStageId: unknown, role: string, field: 'editApplication' | 'reviewedEditDiff' | 'heldBytes'): Promise<ChildStamp> {
  if (typeof legStageId !== 'string' || !legStageId) return { state: 'no-child-stage' };
  const children = await db.task.findMany({ where: { stageId: legStageId }, select: { id: true, title: true, agentRole: true }, orderBy: { createdAt: 'asc' }, take: STAGE_CHILD_SCAN_CAP });
  const child = children.find((c) => c.agentRole === role);
  if (!child) return { state: 'no-child' };
  const read = await readAuthoritativeResultField(db, child.id, field);
  if (!read.value || !read.executionId) return { state: 'no-stamp', taskId: child.id, executionId: read.executionId };
  try {
    const fact = JSON.parse(read.value) as Record<string, unknown>;
    return { state: 'ok', taskId: child.id, executionId: read.executionId, fact };
  } catch { return { state: 'unparseable', taskId: child.id, executionId: read.executionId }; }
}

export const selectLegEditApplication = (db: SelectorDb, legStageId: unknown) => selectLegChildStamp(db, legStageId, 'config_change_author', 'editApplication');
export const selectLegReviewedDiff = (db: SelectorDb, legStageId: unknown) => selectLegChildStamp(db, legStageId, HELD_EDIT_REVIEWER_ROLE, 'reviewedEditDiff');
/** held-k8s step 3 (G-4): the leg's AUTHORITATIVE Harvester execution, read through its `heldBytes` stamp (Harvesters of held-capable
 *  legs carry one). Its `executionId` scopes the carrier's `source-not-pinned` read to THIS run's harvest, never an older one. */
export const HELD_HARVESTER_ROLE = 'infra_state_harvester';
export const selectLegHarvesterHeldBytes = (db: SelectorDb, legStageId: unknown) => selectLegChildStamp(db, legStageId, HELD_HARVESTER_ROLE, 'heldBytes');

/** The hoisted fact (leg-synthesize): the selected Author's stamp with its source, or `no-author-stamp` (fails closed). */
export function hoistedEditApplication(sel: ChildStamp): Record<string, unknown> {
  if (sel.state === 'ok') return { ...sel.fact, source: sel.taskId, authorExecutionId: sel.executionId };
  return { version: 1, state: 'no-author-stamp', reason: sel.state, ...(sel.taskId ? { source: sel.taskId } : {}) };
}

/** The Author's state as the carrier reads it (V-9) — a missing stamp is `no-author-stamp`, never "applied". */
export function legEditApplicationState(sel: ChildStamp): string {
  return sel.state === 'ok' && typeof sel.fact.state === 'string' ? (sel.fact.state as string) : 'no-author-stamp';
}

/** The variant Reviewer's fact, from its PREPARED snapshot (V-6's `editDiff` on the chained Author entry).
 *  `record` = this execution's server-stamped `context.chainedPredecessors` (push-2 code review BC-P2-3): `inputContext` is
 *  writable through `agent.configure` / `task.create` and a no-deps / chain-failed prepare leaves the stored one standing, so an
 *  entry counts as REVIEWED only when this run's chokepoint chained exactly that Author task → execution. Absent or not-chained
 *  ⇒ `not-chained-this-run` (forces). `undefined` = not checked (no production caller passes that). */
export function reviewedEditDiffFromContext(inputContext: unknown, record?: ChainedRecord | null): Record<string, unknown> {
  const chained = (inputContext as { chainedFrom?: unknown } | null)?.chainedFrom;
  const entries = Array.isArray(chained) ? chained : [];
  const withDiff = entries.filter((e) => e && typeof e === 'object' && (e as { editDiff?: unknown }).editDiff && typeof (e as { editDiff?: unknown }).editDiff === 'object');
  if (withDiff.length === 0) return { version: 1, state: 'no-edit-diff-entry' };
  if (withDiff.length > 1) return { version: 1, state: 'several-edit-diff-entries' };
  const entry = withDiff[0] as { editDiff: Record<string, unknown>; taskId?: unknown; executionId?: unknown };
  const d = entry.editDiff;
  const authorExecutionId = typeof d.authorExecutionId === 'string' ? d.authorExecutionId : null;
  const candidateDigest8 = typeof d.candidateDigest8 === 'string' ? d.candidateDigest8 : undefined;
  if (record !== undefined) {
    const chainedThisRun = record?.status === 'chained' && typeof entry.taskId === 'string' && typeof entry.executionId === 'string'
      && record.ids[entry.taskId] === entry.executionId && authorExecutionId === entry.executionId;
    if (!chainedThisRun) return { version: 1, state: 'not-chained-this-run', authorExecutionId, ...(candidateDigest8 ? { candidateDigest8 } : {}) };
  }
  // A5: 'rendered' only when the diff text reached the entry whole. The chainer trims finalResponse, never diffText; a
  // `diffTextCut` mark (or a missing text) is a named state, so a cut diff can never read as a reviewed one.
  if (typeof d.diffText === 'string' && d.diffTextCut !== true) {
    return { version: 1, state: 'rendered', authorExecutionId, ...(candidateDigest8 ? { candidateDigest8 } : {}), diffSha8: sha8(d.diffText) };
  }
  return { version: 1, state: typeof d.state === 'string' ? d.state : d.diffTextCut === true ? 'diff-cut' : 'no-diff-text', authorExecutionId,
    ...(candidateDigest8 ? { candidateDigest8 } : {}) };
}
