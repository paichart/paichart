/**
 * Leg replay lab — the ONE edit operation every candidate, plant and input edit uses: exactly-once replace.
 * Moved out of lab.ts (2026-10-10, Z49) so input-edits.ts and the scorers can share it without a circular import;
 * lab.ts re-exports it unchanged.
 */
/** `ops[].appliesTo` (2026-10-12, group 4 lab): an op may name a SUBSET of the spec's targets, for an input edit whose
 *  anchor reads differently in one copy (the harness paraphrases the items in the Reviewer's brief). Absent = every
 *  target, exactly as before. Each op still applies exactly once to every target it names. */
export interface EditSpec { id: string; appliesTo: string[]; ops: Array<{ type: 'replace'; old: string; new: string; appliesTo?: string[] }> }

export function applyEdits(text: string, edits: EditSpec[], protocolName: string): { text: string; applied: string[] } {
  let out = text;
  const applied: string[] = [];
  for (const e of edits) {
    if (!e.appliesTo.includes(protocolName)) continue;
    for (const op of e.ops) {
      if (op.appliesTo) {
        const stray = op.appliesTo.filter((t) => !e.appliesTo.includes(t));
        if (stray.length) throw new Error(`edit ${e.id}: an op names ${stray.join(', ')}, which the spec does not apply to`);
        if (!op.appliesTo.includes(protocolName)) continue;
      }
      const n = out.split(op.old).length - 1;
      if (n !== 1) throw new Error(`edit ${e.id} on ${protocolName}: anchor occurs ${n} times (must be exactly 1): ${op.old.slice(0, 90)}…`);
      out = out.replace(op.old, () => op.new);
    }
    applied.push(e.id);
  }
  return { text: out, applied };
}
