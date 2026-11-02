/**
 * PLATFORM-HELD-BYTES Stage B V-2 — resolving the held VIEW an entry carries (plan STAGE-B-PLAN.md v4.1 §3 V-2).
 *
 * Two modes, and the default is READ:
 *   read  (default)  SELECT the existing `held_views` row by its full key; none ⇒ `view-not-built`. Every caller except the
 *                    one prepare path uses this mode — replays (`replay-containment`, `replay-completion-anchored`), the
 *                    Reviewer's diff recompute (V-6), the step (V-5c) — so a read never creates state.
 *   write (opt-IN)   read the blob, `buildView`, `upsertHeldView` (autocommit: a single statement that also touches the blob),
 *                    and return the STORED row. Only `prepareTaskForExecution` → `chainDependencyContext(…, { writeViews })`
 *                    asks for it (wired with its consumer, V-6).
 * A demo POV resolves to `demo-pov` before any read (sec-ops NOTE-2 / SF-5: a demo viewer would otherwise read `viewText` on
 * the task's chained context; consistent with `held.get` refusing demo POVs).
 * Never throws: every failure is a named state, so a view problem costs the variant (fail-closed) and never the chain.
 */
import type { Prisma } from '@prisma/client';
import { buildView, HELD_VIEW_VERSION } from '@/lib/agents/harness/held-bytes/view';
import { readHeldView, upsertHeldView, readHeldBlobText, type HeldViewRow } from '@/lib/services/held-bytes-store';

export type HeldViewState = 'demo-pov' | 'view-not-built' | 'view-unavailable' | 'view-line-map-unstable' | 'view-not-rendered';

export type ResolvedHeldView =
  | { state: 'rendered'; view: HeldViewRow; built: boolean }
  | { state: HeldViewState };

type Db = {
  $executeRaw: (q: Prisma.Sql) => Promise<number>;
  $queryRaw: <T = unknown>(q: Prisma.Sql) => Promise<T>;
};

/** A demo POV, by the one rule the access layer uses (`validate-pov-access.ts`: `pov.metadata.isDemo === true`). */
export function isDemoPovMetadata(povMetadata: unknown): boolean {
  return !!povMetadata && typeof povMetadata === 'object' && (povMetadata as Record<string, unknown>).isDemo === true;
}

export async function resolveHeldView(
  db: Db,
  ref: { scope: string; blobSha256: string },
  opts: { writeViews: boolean; demoPov: boolean; r9Version: string },
): Promise<ResolvedHeldView> {
  if (opts.demoPov) return { state: 'demo-pov' };
  const key = { scope: ref.scope, baseSha256: ref.blobSha256, r9Version: opts.r9Version, viewVersion: HELD_VIEW_VERSION };
  try {
    const existing = await readHeldView(db, key);
    if (existing) return { state: 'rendered', view: existing, built: false };
    if (!opts.writeViews) return { state: 'view-not-built' };
    const text = await readHeldBlobText(db, ref.scope, ref.blobSha256);
    if (text === null) return { state: 'view-unavailable' };
    const v = buildView(text, opts.r9Version);
    if (!v.ok) return { state: v.state };
    const w = await upsertHeldView(db, { ...key, viewText: v.viewText, lineCount: v.lineCount, rewrittenLines: v.rewrittenLines });
    return w.ok ? { state: 'rendered', view: w.view, built: w.inserted } : { state: 'view-unavailable' };
  } catch {
    return { state: 'view-unavailable' };
  }
}
