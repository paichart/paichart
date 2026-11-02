/**
 * Leg replay lab — put a replayed Author package into the Reviewer's §6 the way the chainer would.
 *
 * The chainer (`context-chainer.ts chainDependencyContext`) builds each `chainedFrom` entry INLINE from the
 * predecessor's authoritative result.json; there is no pure entry builder to import. So the lab does not build an
 * entry: it takes the Reviewer's FROZEN entry for this Author (config.inputContext, the authoritative record of
 * what the Reviewer was given) and replaces exactly the fields the chainer derives from the Author's result.json,
 * with the same transforms in the same order:
 *
 *   finalResponse   R9 `sanitizeChainedOutput` when CONNECTED_OUTPUT_SANITIZE_ENABLED=true (prod: on), then the
 *                   PER_PREDECESSOR_SOFT_CAP cut with the chainer's truncation marker
 *   R9 facts        sanitized / rewritten / rewriteClasses / neutralizedCount / strippedControlChars (only when R9 ran)
 *   facts           markerPresence, rollbackContainment (lane guard: carried only when the frozen entry carried one),
 *                   derivationContainment, confidenceScore, qualityMetrics — from the replay's own stamps
 *   truncated, originalChars, executionId
 *
 * Every other field (taskId, title, role, source, degraded, ordering, pipelineMetadata, the contract) is unchanged,
 * because none of it depends on the Author's text.
 *
 * PINNED by the identity test (scripts/test-leg-replay-lab.ts): patching with the PERSISTED Author output and its
 * PERSISTED stamps must render a Reviewer prompt byte-identical to the one rebuilt from the frozen context.
 */
import { sanitizeChainedOutput } from '../../lib/agents/harness/sanitize-chained-output';
import { PER_PREDECESSOR_SOFT_CAP } from '../../lib/agents/harness/context-chainer';
import type { Snapshot } from './snapshot';

export interface ReplayedAuthorResult {
  executionId: string;
  finalResponse: string;
  confidenceScore: number | null;
  qualityMetrics: Record<string, unknown> | null;
  markerPresence: Record<string, unknown> | null;
  rollbackContainment: Record<string, unknown> | null;
  derivationContainment: Record<string, unknown> | null;
  /** L-4 (PLATFORM-HELD-BYTES Stage B): the Author entry's `editDiff`, built by the SHIPPING pure builder
   *  (held-chain.ts `editDiffEntryFields`). Absent ⇒ no key, exactly as the chainer writes for a non-variant Author. */
  editDiff?: Record<string, unknown> | null;
  /** L-N2 (2026-10-26): the replayed Author's own leaf stamps the chainer carries on its entry — `validationToolCalls` (any object;
   *  context-chainer.ts) and `gitDeviceComparison` (only when `checked`, and only to the Architect / leg Reviewer, which are the only
   *  consumers of a patched entry here). Undefined ⇒ the frozen entry's value stands (no replayed stamp to substitute). */
  validationToolCalls?: Record<string, unknown> | null;
  gitDeviceComparison?: Record<string, unknown> | null;
}

export function patchReviewerContext(snap: Snapshot, r: ReplayedAuthorResult): Record<string, any> {
  const frozen = snap.reviewer?.exec.config?.inputContext;
  if (!frozen || !Array.isArray(frozen.chainedFrom)) throw new Error('reviewer has no frozen chainedFrom');
  const idx = frozen.chainedFrom.findIndex((e: any) => e.executionId === snap.author.exec.id);
  if (idx < 0) throw new Error(`reviewer's frozen chainedFrom carries no entry for author execution ${snap.author.exec.id}`);
  const chainedFrom = [...frozen.chainedFrom];
  chainedFrom[idx] = chainEntryFromResult(frozen.chainedFrom[idx], r);
  return { ...frozen, chainedFrom };
}

/** The chainer's derived fields over a frozen entry (every other field kept). Shared by the Reviewer patch and L-K-c. */
export function chainEntryFromResult(old: Record<string, any>, r: ReplayedAuthorResult): Record<string, any> {
  const r9 = process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED === 'true' ? sanitizeChainedOutput(r.finalResponse) : null;
  let finalResponse = r9 ? r9.text : r.finalResponse;
  let truncated = false;
  if (finalResponse.length > PER_PREDECESSOR_SOFT_CAP) {
    // Same marker text as the chainer's private truncationMarker().
    finalResponse = finalResponse.slice(0, PER_PREDECESSOR_SOFT_CAP) + `\n\n[CHAINED CONTEXT TRUNCATED: ${PER_PREDECESSOR_SOFT_CAP} of ${r.finalResponse.length} chars]`;
    truncated = true;
  }
  const entry: Record<string, any> = {
    ...old,
    confidenceScore: r.confidenceScore,
    qualityMetrics: r.qualityMetrics,
    markerPresence: r.markerPresence,
    derivationContainment: r.derivationContainment,
    // Lane guard: the chainer carries the stamp only when the predecessor's lane is adjudicated; the frozen entry
    // already records that decision for this task (null ⇒ not carried).
    rollbackContainment: old.rollbackContainment == null ? null : r.rollbackContainment,
    finalResponse,
    executionId: r.executionId,
    truncated,
    originalChars: r.finalResponse.length,
    ...(r.editDiff ? { editDiff: r.editDiff } : {}),
  };
  if (r.validationToolCalls !== undefined) {
    delete entry.validationToolCalls;
    if (r.validationToolCalls && typeof r.validationToolCalls === 'object') entry.validationToolCalls = r.validationToolCalls;
  }
  if (r.gitDeviceComparison !== undefined) {
    delete entry.gitDeviceComparison;
    if (r.gitDeviceComparison && typeof r.gitDeviceComparison === 'object' && (r.gitDeviceComparison as { checked?: unknown }).checked === true) entry.gitDeviceComparison = r.gitDeviceComparison;
  }
  for (const k of ['sanitized', 'rewritten', 'rewriteClasses', 'neutralizedCount', 'strippedControlChars']) delete entry[k];
  if (r9) Object.assign(entry, {
    sanitized: r9.strippedControlChars > 0 || r9.neutralizedInjections.length > 0,
    rewritten: r9.rewritten, rewriteClasses: r9.rewriteClasses,
    neutralizedCount: r9.neutralizedInjections.length, strippedControlChars: r9.strippedControlChars,
  });
  return entry;
}

/**
 * L-K-c (held-k8s step 1k): a consumer's (the Architect's) frozen context with its ONE Harvester entry rebuilt from a REPLAYED
 * harvest — an L-K1 lab sample or a frozen hand-written fallback (harvester-source.ts) — by the same field rules as the Reviewer
 * patch. Refused when the frozen entry carries held fields (`heldIndex` / `heldView`): those describe the PRODUCTION harvest's
 * captures, which a replayed harvest does not share (k8s is not held-capable before step 3, so none is expected).
 */
export function patchHarvesterEntry(exec: { config?: Record<string, any> | null; id: string }, r: ReplayedAuthorResult): { ctx: Record<string, any>; frozenEntry: Record<string, any> } {
  const frozen = exec.config?.inputContext;
  if (!frozen || !Array.isArray(frozen.chainedFrom)) throw new Error(`${exec.id}: no frozen chainedFrom`);
  const idx = frozen.chainedFrom.findIndex((e: any) => e?.agentRole === 'infra_state_harvester');
  if (idx < 0) throw new Error(`${exec.id}: no frozen Harvester entry`);
  if (frozen.chainedFrom.filter((e: any) => e?.agentRole === 'infra_state_harvester').length !== 1) throw new Error(`${exec.id}: more than one frozen Harvester entry`);
  const old = frozen.chainedFrom[idx];
  const held = ['heldIndex', 'heldView'].filter((k) => k in old);
  if (held.length) throw new Error(`${exec.id}: the frozen Harvester entry carries ${held.join(', ')} — a replayed harvest cannot inherit the production capture`);
  const chainedFrom = [...frozen.chainedFrom];
  chainedFrom[idx] = chainEntryFromResult(old, r);
  return { ctx: { ...frozen, chainedFrom }, frozenEntry: old };
}

/**
 * L-3 / L-8b (PLATFORM-HELD-BYTES Stage B): the Author's (or the Architect's) frozen Harvester entry plus the held fields the
 * chainer would add for a VARIANT consumer — `heldView` for the Author, `heldIndex` for the Architect — built by the SHIPPING
 * pure builders (held-chain.ts) over the lab's in-memory store (held-store.ts). Every other field is the frozen entry's; the
 * §6 render is the shipping renderer's (render-held.ts), reached through rebuildPrompt.
 */
export function patchHeldConsumerContext(exec: { config?: Record<string, any> | null; id: string }, fields: Record<string, unknown>): Record<string, any> {
  const frozen = exec.config?.inputContext;
  if (!frozen || !Array.isArray(frozen.chainedFrom)) throw new Error(`${exec.id}: no frozen chainedFrom`);
  const idx = frozen.chainedFrom.findIndex((e: any) => e?.agentRole === 'infra_state_harvester');
  if (idx < 0) throw new Error(`${exec.id}: no frozen Harvester entry`);
  if (frozen.chainedFrom.filter((e: any) => e?.agentRole === 'infra_state_harvester').length !== 1) throw new Error(`${exec.id}: more than one frozen Harvester entry`);
  const chainedFrom = [...frozen.chainedFrom];
  chainedFrom[idx] = { ...frozen.chainedFrom[idx], ...fields };
  return { ...frozen, chainedFrom };
}

export const patchAuthorContext = (snap: Snapshot, heldViewFields: Record<string, unknown>) => patchHeldConsumerContext(snap.author.exec as any, heldViewFields);
