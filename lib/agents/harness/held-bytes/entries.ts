/**
 * PLATFORM-HELD-BYTES Stage B — the chained-entry contract for held files (plan STAGE-B-PLAN.md v4.1 §3 V-5c, V-6). PURE.
 *
 * A Harvester's chained entry, as an AUTHOR receives it, carries `heldView`: an ARRAY of per-handle items (a Harvester may
 * hold several files; the plan writes one item's fields). Items are POINTERS the step VERIFIES server-side (V-5c): nothing
 * in an item is trusted as bytes or as identity — `refId` must name a CAPTURE row of `harvesterExecutionId`, in the Author's
 * POV and leg, from a Harvester in the Author's own stage; `r9Version` and `viewVersion` are SELECTORS of a view row read by
 * its full key; `viewText` is what the Author is SHOWN (and may be compared with the server's view by hash). There is no
 * `baseSha256` on an item (the verified ref supplies it). An item whose view is not available carries a named `state`
 * instead of `viewText`.
 */
export type HeldEntryState =
  | 'demo-pov' | 'view-not-built' | 'view-unavailable' | 'view-line-map-unstable' | 'view-not-rendered' | 'view-over-budget'
  | 'handle-ambiguous' | 'unheld';

export interface HeldViewItem {
  handle: string;
  path: string;
  lineCount?: number;
  refId?: string;
  harvesterExecutionId?: string;
  r9Version?: string;
  viewVersion?: string;
  /** What the Author is shown. Absent when `state` is set. */
  viewText?: string;
  /** View line numbers R9 rewrote (rendered as numbers, PC N-14). */
  rewrittenLines?: number[];
  state?: HeldEntryState;
}

/** The chained entries that carry `heldView`, and their items, in entry order. */
export function collectHeldViewItems(inputContext: unknown): { entries: number; items: HeldViewItem[] } {
  const chained = (inputContext as { chainedFrom?: unknown } | null)?.chainedFrom;
  if (!Array.isArray(chained)) return { entries: 0, items: [] };
  let entries = 0; const items: HeldViewItem[] = [];
  for (const e of chained) {
    const hv = (e as { heldView?: unknown } | null)?.heldView;
    if (!Array.isArray(hv)) continue;
    entries++;
    for (const it of hv) if (it && typeof it === 'object') items.push(it as HeldViewItem);
  }
  return { entries, items };
}
