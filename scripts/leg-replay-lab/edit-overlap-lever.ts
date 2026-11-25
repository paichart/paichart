/**
 * Leg replay lab — the AUTHOR POINT of the file comparison (Config sources STEP 3 slice L; plan §3.4, §5.1 "the base-sha fact",
 * §13 C2 / C4; STEP3-P3-BUILD.md §8 item 4).
 *
 * Production (execution-core.ts, the pre-transaction held-edit step), on a leg whose protocol the PLATFORM compares
 * (`gitLiveDriftPlatformCompares(owningLeg.configSourceProtocol)` — observability at ≥ 1.12.0): the core reads, for each held file
 * the edit step resolved, its capture identity, the sha of the BASE the step used and the base line ranges of its applied hunks —
 * `editHunkFilesOrNull(pkg.application, step.refs, pkg.baseShaByHandle)` — and hands it to the nets as `held.editHunkFiles`. The
 * Author's `gitLiveDrift` transcription then adds, per compared file, `baseMatch` (same / differs / no-base) and `editOverlap`
 * (does an applied hunk touch a differing line). Without the input the fact reads `no-edit-record`.
 *
 * The lab hands the SAME shipping function the lab's own application:
 *   - `editHunkHeldInput`     — for a package the lab APPLIED (a live Author sample, a lab-sample pure re-stamp). `{}` on every arm
 *                               that reads no Config sources and on every protocol the platform does not compare, so every earlier
 *                               replay's net ctx is byte-identical.
 *   - `storedEditFactsInput`  — for a PERSISTED Author of a leg that ran on the Config-sources text: nothing stored can rebuild the
 *                               hunk positions, so the Author's STORED per-label `baseMatch` / `editOverlap` are handed back and
 *                               the fact's reader re-validates them (net-registry.ts `storedEditFacts`, "REPLAY ONLY").
 *
 * ONE LAB DIFFERENCE, NAMED: production's ref row carries `target`; the lab's resolver row does not (held-store.ts
 * `labResolveHeldFiles` — adding it there would move every stored lab sample's ref rows). The lever takes each file's target from
 * the lab STORE's ref of the same id, which is the capture's own value. The base sha is the ref's blob sha: the lab's edit step and
 * its capture read ONE store, so the base the step used IS the captured file (production's `baseShaByHandle` exists for the case
 * where they differ — a re-read between capture and edit — which a lab cell cannot have; a `baseMatch: differs` cell is therefore
 * built by handing a different sha on purpose, `baseShaOverride`, never by accident).
 */
import { editHunkFilesOrNull } from '../../lib/services/file-source-compare-run';
import { gitLiveDriftPlatformCompares } from '../../lib/agents/harness/git-live-drift';
import type { EditHunkFile } from '../../lib/agents/harness/file-source-compare';
import { armReadsConfigSources, configLegOf } from './config-sources-arm';
import type { LabHeldStore } from './held-store';

type LegRow = Parameters<typeof configLegOf>[0];
type App = Parameters<typeof editHunkFilesOrNull>[0];
interface RefLike { handle: string; refId: string; blobSha256: string; row: Record<string, unknown> }

/** Does this arm's leg get the Author-point inputs? (the core's own test, asked per arm) */
export function armPlatformCompares(leg: LegRow, protocolInjection: unknown): boolean {
  return armReadsConfigSources(leg, protocolInjection) && gitLiveDriftPlatformCompares(configLegOf(leg)!.protocol);
}

/** `held.editHunkFiles`, as the core builds it — `{}` off a platform-compare arm, and when no application exists. */
export function editHunkHeldInput(leg: LegRow, protocolInjection: unknown, app: App | null | undefined, refs: readonly RefLike[], store: LabHeldStore,
  baseShaOverride: Readonly<Record<string, string>> = {}): { editHunkFiles?: EditHunkFile[] } {
  if (!armPlatformCompares(leg, protocolInjection) || !app) return {};
  const targetOf = new Map(store.refs.map((r) => [r.id, r.target]));
  const rowed = refs.map((r) => {
    const target = targetOf.get(r.refId);
    if (typeof target !== 'string' || !target) throw new Error(`edit-overlap lever: ref ${r.refId} (${r.handle}) is not a ref of the lab store — its target is unknown`);
    return { handle: r.handle, blobSha256: r.blobSha256, row: { ...r.row, target } };
  });
  const files = editHunkFilesOrNull(app, rowed, baseShaOverride);
  return files ? { editHunkFiles: files } : {};
}

/** `held.storedEditFacts`, from a persisted Author's own stored `gitLiveDrift` — `{}` off a platform-compare arm and when the stored
 *  Author carries no file-method fact (a leg that ran before the Config-sources text: its fact then reads `no-edit-record`, named). */
export function storedEditFactsInput(leg: LegRow, protocolInjection: unknown, storedAuthorResult: Record<string, unknown> | null | undefined):
  { storedEditFacts?: ReadonlyMap<string, { baseMatch?: unknown; editOverlap?: unknown }> } {
  if (!armPlatformCompares(leg, protocolInjection)) return {};
  const d = storedAuthorResult?.gitLiveDrift;
  const files = d && typeof d === 'object' && !Array.isArray(d) && Array.isArray((d as Record<string, unknown>).files) ? ((d as Record<string, unknown>).files as Array<Record<string, unknown>>) : null;
  if (!files) return {};
  const m = new Map<string, { baseMatch?: unknown; editOverlap?: unknown }>();
  for (const f of files) if (f && typeof f.label === 'string') m.set(f.label, { ...(f.baseMatch !== undefined ? { baseMatch: f.baseMatch } : {}), ...(f.editOverlap !== undefined ? { editOverlap: f.editOverlap } : {}) });
  return { storedEditFacts: m };
}
