/**
 * Leg replay lab — NODE INPUT EDITS (L-Z1, 2026-10-10, Z49 lab gate).
 *
 * A node may change what its agents were GIVEN, not only what text they read: `NodeSpec.inputEdits` names an EditSpec
 * (the same exactly-once replace op as candidates and plants) whose `appliesTo` lists any of
 *
 *   leg:description             the owning harness row's description — the OBJECTIVE OF RECORD the in-run requirements
 *                               check reads (`requirementsInputsFromHarnessRow`) and the scorer reads;
 *   author-task:description     the Author child task's description — the brief the Author's §1 renders;
 *   reviewer-task:description   the Reviewer child task's description — the brief (with its reading copy of the
 *                               objective's items) the Reviewer's §1 renders.
 *
 * Every listed target must take the edit exactly once (0 or 2 anchors fail the $0 dry run, like a candidate). The edit
 * is applied to a DEEP COPY of the cached snapshot in memory: the cache file, production, and every other node are
 * untouched. The same copy feeds the prompt rebuild, the in-run check's harness row, and the scorer, so a sample and
 * its score read the same objective. The `children` list's copy of a patched task is patched with it (the snapshot
 * stays internally consistent).
 *
 * WHY a node field and not a variant field: the edited input is a property of the node (Z49 runs the SAME edited
 * objective under both text arms, so the arms still differ in one lever). A variant-level input edit would multiply
 * arms and let an input and a text change ride in one arm.
 *
 * WHAT IT DOES NOT DO: re-run the harness. In production the harness writes the child briefs FROM the objective; the
 * lab cannot replay that step, so the edit writes into each brief what the harness transcribes there (for Z49: the
 * new numbered item, appended after the last item in each copy). That is an approximation, named in every manifest.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, type EditSpec } from './edits';
import type { Snapshot } from './snapshot';

export const INPUT_EDIT_TARGETS = ['leg:description', 'author-task:description', 'reviewer-task:description'] as const;
export type InputEditTarget = typeof INPUT_EDIT_TARGETS[number];

export interface InputEditReport { file: string; edit: string; targets: Record<string, { beforeChars: number; afterChars: number }> }

export function snapshotWithInputEdits(dir: string, node: { id: string; inputEdits?: string }, snap: Snapshot): { snap: Snapshot; report: InputEditReport | null } {
  if (!node.inputEdits) return { snap, report: null };
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.inputEdits), 'utf8'));
  const unknown = spec.appliesTo.filter((t) => !(INPUT_EDIT_TARGETS as readonly string[]).includes(t));
  if (unknown.length) throw new Error(`${node.id}: input edit ${node.inputEdits} targets ${unknown.join(', ')} — allowed: ${INPUT_EDIT_TARGETS.join(', ')}`);
  if (!spec.appliesTo.length) throw new Error(`${node.id}: input edit ${node.inputEdits} targets nothing`);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const targets: InputEditReport['targets'] = {};
  const patch = (target: InputEditTarget, holder: Record<string, any> | null | undefined, what: string) => {
    if (!holder) throw new Error(`${node.id}: input edit targets ${target} but the snapshot has no ${what}`);
    const before = typeof holder.description === 'string' ? holder.description : '';
    const r = applyEdits(before, [spec], target);
    if (!r.applied.length) throw new Error(`${node.id}: input edit ${spec.id} did not apply to ${target}`);
    holder.description = r.text;
    targets[target] = { beforeChars: before.length, afterChars: r.text.length };
    // Keep the snapshot's children list consistent with the patched task row.
    for (const c of copy.children ?? []) if (c.id === holder.id) c.description = r.text;
  };
  for (const t of spec.appliesTo as InputEditTarget[]) {
    if (t === 'leg:description') patch(t, copy.leg, 'harness (leg) row');
    else if (t === 'author-task:description') patch(t, copy.author?.task, 'Author task');
    else patch(t, copy.reviewer?.task, 'Reviewer task');
  }
  return { snap: copy, report: { file: node.inputEdits, edit: spec.id, targets } };
}
