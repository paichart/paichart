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
}

export function patchReviewerContext(snap: Snapshot, r: ReplayedAuthorResult): Record<string, any> {
  const frozen = snap.reviewer?.exec.config?.inputContext;
  if (!frozen || !Array.isArray(frozen.chainedFrom)) throw new Error('reviewer has no frozen chainedFrom');
  const idx = frozen.chainedFrom.findIndex((e: any) => e.executionId === snap.author.exec.id);
  if (idx < 0) throw new Error(`reviewer's frozen chainedFrom carries no entry for author execution ${snap.author.exec.id}`);
  const old = frozen.chainedFrom[idx];

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
  };
  for (const k of ['sanitized', 'rewritten', 'rewriteClasses', 'neutralizedCount', 'strippedControlChars']) delete entry[k];
  if (r9) Object.assign(entry, {
    sanitized: r9.strippedControlChars > 0 || r9.neutralizedInjections.length > 0,
    rewritten: r9.rewritten, rewriteClasses: r9.rewriteClasses,
    neutralizedCount: r9.neutralizedInjections.length, strippedControlChars: r9.strippedControlChars,
  });
  const chainedFrom = [...frozen.chainedFrom];
  chainedFrom[idx] = entry;
  return { ...frozen, chainedFrom };
}
