/**
 * PLATFORM-HELD-BYTES Stage B V-5g — the `editApplication` DIGEST (the stamped fact) and the A1 candidate-set digest (plan
 * STAGE-B-PLAN.md v4.1 §3 V-5g, §0.1 A1, A2). PURE.
 *
 * BOUNDED BY CONSTRUCTION: ≤ 1,024 serialised characters for every input — sparse refusal counts, ≤ 3 file rows + `omitted`,
 * ≤ 3 hash8 pairs + omitted, paths R9-defanged and ≤ 128 chars, then a final guard that falls back to
 * `{ state, refWrite, refusedTotal, candidateFiles, candidateDigest8, digestTruncated: true }` — never dropping state,
 * refWrite, candidateFiles or the candidate digest (a truncated stamp still compares, A1). Built THROUGH the builder with
 * `refWrite` an INPUT, so the guard sees the persist pick's fields.
 * NO 64-hex run anywhere (C5/P3-B1: a full hash beside a redacted line is a dictionary oracle) — hashes are 8 hex.
 */
import { heldPackageOutOfScope } from './scope';
import { createHash } from 'crypto';
import { sanitizeChainedOutput } from '../sanitize-chained-output';
import type { EditApplication, HeldFileInput } from './apply';
import type { EditCorrectionFact } from '../held-edit-correction';

export const EDIT_FACT_MAX = 1024;
export const EDIT_FACT_FILE_ROWS = 3;
export const EDIT_FACT_PATH_MAX = 128;
export type RefWrite = 'committed' | 'rolled-back' | 'none' | 'lab-not-written';

const sha8 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 8);
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ');

/**
 * A1: ONE function, used by the Author's stamp AND by V-6's Reviewer-side recompute. sha8 over the HANDLE-SORTED list of
 * `(handle, candidateSha256 | 'refused' | 'unchanged')` for EVERY held file of the package (and every create), uncapped —
 * so two packages that differ only in their fourth file digest differently (pinned).
 */
export function candidateSetDigest8(app: EditApplication, heldFiles: readonly (Pick<HeldFileInput, 'handle'> & { state?: HeldFileInput['state'] })[]): string {
  const by = new Map<string, string>();
  // F-N2-1: once the applier JUDGED the package's edits (it did not stop at precedence 1–6), an entry that is not rendered took no part
  // — the package did not name it — and the Reviewer's recompute never holds it (its files are the edit manifest's verified bases), so
  // it is not a file of the candidate set. Before F-N2-1 a judged package never had such an entry (any one stopped it at precedence 6),
  // so every stored digest is unchanged by construction.
  const judged = app.state === 'applied' || app.state === 'partial' || app.state === 'refused' || app.state === 'no-edits';
  for (const f of heldFiles) if (!judged || f.state === undefined || f.state === 'rendered') by.set(f.handle, 'unchanged');
  for (const f of app.files) by.set(f.handle, f.state === 'applied' && f.candidateSha256 ? f.candidateSha256 : f.state === 'refused' ? 'refused' : 'unchanged');
  const list = [...by.entries()].sort(([a], [b]) => (a.length - b.length) || a.localeCompare(b));
  return sha8(JSON.stringify(list));
}

export interface EditFactInput {
  app: EditApplication;
  heldFiles: readonly HeldFileInput[];
  refWrite: RefWrite;
  textSource: 'loop' | 'edit-correction' | 'diagnostic-retry';
  correction?: EditCorrectionFact | null;
  /** handle → the verified base ref's sha256 (R10 text), for baseHash8. */
  baseShaByHandle?: Record<string, string>;
}

export function buildEditApplicationFact(input: EditFactInput, maxChars: number = EDIT_FACT_MAX): Record<string, unknown> {
  const { app } = input;
  const candidateDigest8 = candidateSetDigest8(app, input.heldFiles);
  const redactorNone = input.heldFiles.some((f) => f.redactorVersion === 'none');
  const applied = app.files.filter((f) => f.state === 'applied');
  const hashes = redactorNone ? [] : applied.map((f) => ({
    handle: f.handle,
    ...(f.op === 'edit' && input.baseShaByHandle?.[f.handle] ? { baseHash8: input.baseShaByHandle[f.handle].slice(0, 8) } : {}),
    ...(f.candidateSha256 ? { candidateHash8: f.candidateSha256.slice(0, 8) } : {}),
  }));
  const rows = app.files.map((f) => ({ handle: f.handle, path: oneLine(sanitizeChainedOutput(f.path).text).slice(0, EDIT_FACT_PATH_MAX) }));
  const byClass: Record<string, number> = {};
  for (const r of app.refusals) if (r.name === 'replace-not-reviewable' && r.rewriteClass) byClass[r.rewriteClass] = (byClass[r.rewriteClass] ?? 0) + 1;
  const c = input.correction;
  const fact: Record<string, unknown> = {
    version: 1,
    state: app.state,
    refWrite: input.refWrite,
    applied: app.applied,
    total: app.total,
    refused: app.refused,
    refusedTotal: app.refusedTotal,
    candidateFiles: app.candidateFiles,
    candidateDigest8,
    textSource: input.textSource,
    ...(Object.keys(byClass).length ? { notReviewableByClass: byClass } : {}),
    ...(app.editsOutsideSection ? { editsOutsideSection: app.editsOutsideSection } : {}),
    ...(app.restoreOutsideRollback ? { restoreOutsideRollback: app.restoreOutsideRollback } : {}),
    // Phase 10 §1a (scope.ts): the grammar counts the out-of-scope predicate reads; zero ⇒ omitted (same convention as above).
    ...(app.blocksTotal ? { blocksTotal: app.blocksTotal } : {}),
    ...(app.rollbackRestores ? { rollbackRestores: app.rollbackRestores } : {}),
    ...(app.rollback.length ? { rollback: app.rollback.map((r) => r.handle) } : {}),
    ...(app.files.some((f) => f.mode === 'diff-only' && f.state === 'applied') ? { diffOnlyFiles: applied.filter((f) => f.mode === 'diff-only').length } : {}),
    hashes: hashes.slice(0, EDIT_FACT_FILE_ROWS),
    ...(hashes.length > EDIT_FACT_FILE_ROWS ? { hashesOmitted: hashes.length - EDIT_FACT_FILE_ROWS } : {}),
    files: rows.slice(0, EDIT_FACT_FILE_ROWS),
    ...(rows.length > EDIT_FACT_FILE_ROWS ? { filesOmitted: rows.length - EDIT_FACT_FILE_ROWS } : {}),
    ...(c ? { correction: {
      attempted: c.attempted,
      ...(c.notAttemptedReason ? { notAttemptedReason: c.notAttemptedReason } : {}),
      ...(c.adopted !== undefined ? { adopted: c.adopted } : {}),
      ...(c.notAdoptedReason ? { notAdoptedReason: c.notAdoptedReason } : {}),
      ...(typeof c.refusedBefore === 'number' ? { refusedBefore: c.refusedBefore } : {}),
      ...(typeof c.refusedAfter === 'number' ? { refusedAfter: c.refusedAfter } : {}),
    } } : {}),
  };
  // Phase 10 panel F17 (EF-S7 / audit A-M3): THE out-of-scope predicate's answer, stamped as the platform's scope decision so every
  // card reader (Node C, pov-program SYNTHESIZE via the leg hoist) sees the same fact. The carrier and MI-13 RECOMPUTE it from the
  // counts and never read this field (independence). Present only when true; a truncated fact never carries it (fail-closed).
  if (heldPackageOutOfScope(fact)) fact.outOfScope = true;
  if (JSON.stringify(fact).length <= maxChars) return fact;
  return { version: 1, state: app.state, refWrite: input.refWrite, refusedTotal: app.refusedTotal, candidateFiles: app.candidateFiles, candidateDigest8, digestTruncated: true };
}
