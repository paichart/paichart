/**
 * PLATFORM-HELD-BYTES Stage B V-5h — the Author's `edit-application.manifest.json` (plan STAGE-B-PLAN.md v4.1 §3 V-5h; §0.1
 * A3; boundary BV3-2). PURE: returns an OBJECT; the persist passes it through `redactSecretsDeep` and stringifies it (never
 * the plain-text `redactExtraArtifactForPersist`, which misses JSON-escaped secrets).
 *
 * Read ONLY by V-6's Reviewer-side recompute (hidden from `agent.results`, boundary N3-d): per held file
 * `{ handle, path, baseRefId, candidateRefId?, r9Version, viewVersion }`, plus the per-edit list — block index, handle, op,
 * positions (view lines), line counts and refusal names. NEVER SEARCH/REPLACE text, never a hash.
 * Two variants, picked with result.json at persist: on `ROLLBACK TO SAVEPOINT held_package` the BASE rows roll back with the
 * CANDIDATE rows, so the rolled-back variant omits BOTH ref ids (A3) and states `refWrite: 'rolled-back'` — V-6 maps a record
 * without `baseRefId` to `base-not-held`.
 */
import type { EditApplication } from './apply';
import type { RefWrite } from './edit-fact';

export const EDIT_APPLICATION_MANIFEST_NAME = 'edit-application.manifest.json';
export const EDIT_MANIFEST_VERSION = 1;

export interface EditManifestFileInput {
  handle: string;
  path: string;
  baseRefId?: string;
  candidateRefId?: string;
  r9Version: string;
  viewVersion: string;
}

export function buildEditApplicationManifest(app: EditApplication, input: { refWrite: RefWrite; files: EditManifestFileInput[] }): Record<string, unknown> {
  const committed = input.refWrite === 'committed';
  const files = input.files.map((f) => ({
    handle: f.handle, path: f.path,
    ...(committed && f.baseRefId ? { baseRefId: f.baseRefId } : {}),
    ...(committed && f.candidateRefId ? { candidateRefId: f.candidateRefId } : {}),
    r9Version: f.r9Version, viewVersion: f.viewVersion,
  }));
  const byBlock = new Map<number, { block: number; handle: string; op: string; applied: boolean; positions: number[]; searchLines?: number; replaceLines?: number; refusals: string[] }>();
  for (const f of app.files) for (const h of f.hunks ?? []) {
    const e = byBlock.get(h.block) ?? { block: h.block, handle: f.handle, op: f.op, applied: f.state === 'applied', positions: [], refusals: [] };
    e.positions.push(h.start); e.searchLines = h.searchLen; e.replaceLines = h.replace.length;
    byBlock.set(h.block, e);
  }
  for (const r of app.refusals) {
    if (r.block === null) continue;
    const e = byBlock.get(r.block) ?? { block: r.block, handle: r.handle ?? '', op: 'edit', applied: false, positions: [], refusals: [] };
    e.applied = false; e.refusals.push(r.name); byBlock.set(r.block, e);
  }
  return {
    version: EDIT_MANIFEST_VERSION,
    state: app.state,
    refWrite: input.refWrite,
    files,
    // Explicit key order (a manifest is read by key, but its bytes are compared in replays).
    edits: [...byBlock.values()].sort((a, b) => a.block - b.block).map((e) => ({
      block: e.block, handle: e.handle, op: e.op, applied: e.applied, positions: e.positions,
      ...(e.searchLines !== undefined ? { searchLines: e.searchLines } : {}), ...(e.replaceLines !== undefined ? { replaceLines: e.replaceLines } : {}),
      refusals: e.refusals,
    })),
    packageRefusals: app.refusals.filter((r) => r.block === null).map((r) => ({ name: r.name, ...(r.handle ? { handle: r.handle } : {}) })),
    rollback: app.rollback.map((r) => r.handle),
  };
}
