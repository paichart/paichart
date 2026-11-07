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
/** L-7 (PLATFORM-HELD-BYTES Stage B): `harvester-toolcall:<executionId>:<index>` edits ONE string leaf of a stored Harvester tool
 *  result BEFORE capture — the raw bytes the shipping capture (L-1) then holds, redacts (R10) and views (R9). The leaf is the one
 *  string in that result containing the anchor; it must be exactly one leaf and exactly one occurrence. */
export const HARVESTER_TOOLCALL_TARGET_RE = /^harvester-toolcall:([a-z0-9]{20,40}):(\d{1,3})$/;
/** L-NB-b (network text batch 1, B5 Author half): `author-chained:<executionId>` edits the `finalResponse` of the Author's chained
 *  entry for that upstream execution — in EVERY copy the snapshot carries (`author.exec.config.inputContext`, the frozen copy the
 *  prompt rebuild reads, and `author.task.inputContext`) — then re-reads each copy. It stands in for upstream text the Author would
 *  receive if the persist redactor had not recognised a secret (named in the manifest); it never edits a tool result. */
export const AUTHOR_CHAINED_TARGET_RE = /^author-chained:([a-z0-9]{20,40})$/;
/** L-CS-N ADDENDUM (e) (2026-11-05, owner's over-block cell): `contract:interfaceContract` edits the leg's stored PROGRAM INTERFACE
 *  CONTRACT — in EVERY copy the snapshot carries (`leg.inputContext`, the one the platform's live-evidence fact reads; the Author's and
 *  the Reviewer's task row and frozen `exec.config.inputContext`, the ones their prompts render). Each op is an exactly-once replace on
 *  the copy's COMPACT JSON (`JSON.stringify`); the result must parse as an object. Every copy is re-read afterwards: the op's new text
 *  present and its old text gone, and all copies equal — a copy the walk missed would render an unplanted contract. */
export const CONTRACT_TARGET = 'contract:interfaceContract';
export type InputEditTarget = typeof INPUT_EDIT_TARGETS[number];

export interface InputEditReport { file: string; edit: string; targets: Record<string, { beforeChars: number; afterChars: number; copies?: string[] }> }

export function snapshotWithInputEdits(dir: string, node: { id: string; inputEdits?: string }, snap: Snapshot): { snap: Snapshot; report: InputEditReport | null } {
  if (!node.inputEdits) return { snap, report: null };
  const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(dir, node.inputEdits), 'utf8'));
  const unknown = spec.appliesTo.filter((t) => !(INPUT_EDIT_TARGETS as readonly string[]).includes(t) && !HARVESTER_TOOLCALL_TARGET_RE.test(t) && !AUTHOR_CHAINED_TARGET_RE.test(t) && t !== CONTRACT_TARGET);
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
    const hm = HARVESTER_TOOLCALL_TARGET_RE.exec(t);
    if (hm) { targets[t] = patchHarvesterToolCall(copy, hm[1], Number(hm[2]), spec, t, node.id); continue; }
    const cm = AUTHOR_CHAINED_TARGET_RE.exec(t);
    if (cm) { targets[t] = patchAuthorChained(copy, cm[1], spec, t, node.id); continue; }
    if ((t as string) === CONTRACT_TARGET) { targets[t] = patchInterfaceContract(copy, spec, t, node.id); continue; }
    if (t === 'leg:description') patch(t, copy.leg, 'harness (leg) row');
    else if (t === 'author-task:description') patch(t, copy.author?.task, 'Author task');
    else patch(t, copy.reviewer?.task, 'Reviewer task');
  }
  return { snap: copy, report: { file: node.inputEdits, edit: spec.id, targets } };
}

/** L-7: edit the one string leaf of `toolCalls[index].result` that holds the anchor — in EVERY copy of that execution's stored
 *  result.json the snapshot carries: the stage artifact (`childArtifacts`, what the L-1 held store reads for an Author's Harvester)
 *  AND the subject block's own `resultJson` when the execution IS the node's subject (`author`, `reviewer`; what the recorded-tool
 *  server serves a harvesterOnly node from). L-K2 defect (2026-10-19): only the artifact copy was patched, so a harvesterOnly node's
 *  recorded server served the UNPLANTED result and nothing failed. Now every copy is patched, each must take the edit exactly
 *  once, and each copy is re-read afterwards: the planted text must be present and every op's `old` absent (unless its `new`
 *  contains it) — otherwise the dry run REFUSES. Refuses zero or several candidate leaves per copy. */
function patchHarvesterToolCall(copy: Snapshot, executionId: string, index: number, spec: EditSpec, target: string, nodeId: string): { beforeChars: number; afterChars: number; copies: string[] } {
  const holders: Array<{ name: string; get: () => string; set: (t: string) => void }> = [];
  const art = copy.childArtifacts.find((a) => a.executionId === executionId && a.name === 'result.json');
  if (art) holders.push({ name: 'childArtifacts', get: () => art.content, set: (t) => { art.content = t; } });
  for (const role of ['author', 'reviewer'] as const) {
    const b = (copy as any)[role];
    if (b?.exec?.id === executionId && typeof b.resultJson === 'string') holders.push({ name: `${role}.resultJson`, get: () => b.resultJson, set: (t) => { b.resultJson = t; } });
  }
  if (!holders.length) throw new Error(`${nodeId}: ${target} — no stored result.json for ${executionId} in the snapshot`);
  const anchors = spec.ops.map((o) => o.old);
  let sizes: { beforeChars: number; afterChars: number } | null = null;
  for (const h of holders) {
    const rj = JSON.parse(h.get());
    const call = rj.toolCalls?.[index];
    if (!call || call.result === undefined) throw new Error(`${nodeId}: ${target} — no tool call ${index} in ${h.name}`);
    const leaves: Array<{ holder: any; key: string | number; text: string }> = [];
    const walk = (holder: any, key: string | number) => {
      const v = holder[key];
      if (typeof v === 'string') { if (anchors.some((a) => v.includes(a))) leaves.push({ holder, key, text: v }); }
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v, Array.isArray(v) ? Number(k) : k);
    };
    walk(call, 'result');
    if (leaves.length !== 1) throw new Error(`${nodeId}: ${target} — the anchor is in ${leaves.length} string leaves of call ${index} in ${h.name} (must be exactly 1)`);
    const r = applyEdits(leaves[0].text, [spec], target);
    if (!r.applied.length) throw new Error(`${nodeId}: input edit ${spec.id} did not apply to ${target} (${h.name})`);
    leaves[0].holder[leaves[0].key] = r.text;
    // A JSON-text leaf is often MIRRORED as an object in the same result (MCP `structuredContent` beside `content[].text` — the
    // L-K2 NOWIT case: the annotation stayed in `structuredContent` and was served). Every object deep-equal to the leaf's OLD
    // parse is replaced by its NEW parse, so the two forms never disagree; a JSON-text leaf whose edit no longer parses is refused.
    let oldObj: unknown = undefined; try { oldObj = JSON.parse(leaves[0].text); } catch { /* not JSON text: no mirror */ }
    if (oldObj && typeof oldObj === 'object') {
      let newObj: unknown;
      try { newObj = JSON.parse(r.text); } catch { throw new Error(`${nodeId}: ${target} — the edited leaf was JSON text and no longer parses (${h.name})`); }
      const key = JSON.stringify(oldObj);
      const mirror = (holder: any, k: string | number) => {
        const v = holder[k];
        if (v && typeof v === 'object') { if (v !== leaves[0].holder && JSON.stringify(v) === key) { holder[k] = JSON.parse(JSON.stringify(newObj)); return; } for (const kk of Object.keys(v)) mirror(v, Array.isArray(v) ? Number(kk) : kk); }
      };
      mirror(call, 'result');
    }
    h.set(JSON.stringify(rj));
    sizes = sizes ?? { beforeChars: leaves[0].text.length, afterChars: r.text.length };
  }
  // Re-read every copy: the plant must be what each copy now holds (a copy the walk missed would serve the unplanted bytes).
  for (const h of holders) {
    const res = JSON.stringify(JSON.parse(h.get()).toolCalls[index].result);
    for (const o of spec.ops) {
      const enc = (t: string) => JSON.stringify(t).slice(1, -1);
      if (!o.new.includes(o.old) && res.includes(enc(o.old))) throw new Error(`${nodeId}: ${target} — after the edit, ${h.name} still holds the op's old text (the plant did not take)`);
      // The mirror check: the op's old text, if it is a JSON fragment, must not survive as a key/value in a structured mirror either.
      const frag = /^,?"([^"]+)":/.exec(o.old)?.[1];
      if (frag && !o.new.includes(frag) && res.includes(enc(`"${frag}":`)) === false && res.includes(`"${frag}":`)) throw new Error(`${nodeId}: ${target} — after the edit, a structured copy in ${h.name} still holds the key ${frag}`);
      if (o.new && !res.includes(enc(o.new))) throw new Error(`${nodeId}: ${target} — after the edit, ${h.name} does not hold the op's new text`);
    }
  }
  return { ...sizes!, copies: holders.map((h) => h.name) };
}

/** ADDENDUM (e): patch every stored copy of the leg's interface contract (see CONTRACT_TARGET). */
function patchInterfaceContract(copy: Snapshot, spec: EditSpec, target: string, nodeId: string): { beforeChars: number; afterChars: number; copies: string[] } {
  const c: any = copy;
  const holders: Array<{ name: string; owner: any; key: string }> = [];
  const add = (name: string, owner: any, key: string) => { if (owner && owner[key] !== undefined && owner[key] !== null) holders.push({ name, owner, key }); };
  add('leg.inputContext', c.leg, 'inputContext');
  add('author.task.inputContext', c.author?.task, 'inputContext');
  add('author.exec.config.inputContext', c.author?.exec?.config, 'inputContext');
  add('reviewer.task.inputContext', c.reviewer?.task, 'inputContext');
  add('reviewer.exec.config.inputContext', c.reviewer?.exec?.config, 'inputContext');
  const read = (h: { owner: any; key: string }) => (typeof h.owner[h.key] === 'string' ? JSON.parse(h.owner[h.key]) : h.owner[h.key]);
  const write = (h: { owner: any; key: string }, ic: any) => { h.owner[h.key] = typeof h.owner[h.key] === 'string' ? JSON.stringify(ic) : ic; };
  const withContract = holders.filter((h) => { const ic = read(h); return ic && typeof ic === 'object' && ic.interfaceContract && typeof ic.interfaceContract === 'object'; });
  if (!withContract.some((h) => h.name === 'leg.inputContext')) throw new Error(`${nodeId}: ${target} — the leg row carries no interface contract (the live-evidence fact reads that copy)`);
  let sizes: { beforeChars: number; afterChars: number } | null = null;
  for (const h of withContract) {
    const ic = read(h);
    const before = JSON.stringify(ic.interfaceContract);
    const r = applyEdits(before, [spec], target);
    if (!r.applied.length) throw new Error(`${nodeId}: input edit ${spec.id} did not apply to ${target} (${h.name})`);
    let parsed: unknown;
    try { parsed = JSON.parse(r.text); } catch { throw new Error(`${nodeId}: ${target} — the edited contract no longer parses (${h.name})`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${nodeId}: ${target} — the edited contract is not an object (${h.name})`);
    ic.interfaceContract = parsed;
    write(h, ic);
    sizes = sizes ?? { beforeChars: before.length, afterChars: r.text.length };
  }
  const after = withContract.map((h) => JSON.stringify(read(h).interfaceContract));
  if (new Set(after).size !== 1) throw new Error(`${nodeId}: ${target} — after the edit the contract copies differ (${withContract.map((h) => h.name).join(', ')})`);
  for (const o of spec.ops.filter((x) => !x.appliesTo || x.appliesTo.includes(target))) {
    if (!o.new.includes(o.old) && after[0].includes(o.old)) throw new Error(`${nodeId}: ${target} — after the edit the contract still holds the op's old text`);
    if (o.new && !after[0].includes(o.new)) throw new Error(`${nodeId}: ${target} — after the edit the contract does not hold the op's new text`);
  }
  return { ...sizes!, copies: withContract.map((h) => h.name) };
}

/** L-NB-b: patch the chained entry's `finalResponse` in every copy of the Author's input context; refuse a copy that does not take
 *  the edit exactly once, and re-read every copy afterwards (LK11: a missed copy would render the unplanted text). */
function patchAuthorChained(copy: Snapshot, executionId: string, spec: EditSpec, target: string, nodeId: string): { beforeChars: number; afterChars: number; copies: string[] } {
  const a: any = (copy as any).author;
  const holders: Array<{ name: string; ctx: () => any; save: (c: any) => void }> = [];
  if (a?.exec?.config?.inputContext && typeof a.exec.config.inputContext === 'object') holders.push({ name: 'author.exec.config.inputContext', ctx: () => a.exec.config.inputContext, save: (c) => { a.exec.config.inputContext = c; } });
  const tic = a?.task?.inputContext;
  if (tic) {
    const isStr = typeof tic === 'string';
    holders.push({ name: 'author.task.inputContext', ctx: () => (isStr ? JSON.parse(a.task.inputContext) : a.task.inputContext), save: (c) => { a.task.inputContext = isStr ? JSON.stringify(c) : c; } });
  }
  if (!holders.length) throw new Error(`${nodeId}: ${target} — the snapshot carries no Author input context`);
  let sizes: { beforeChars: number; afterChars: number } | null = null;
  const done: string[] = [];
  for (const h of holders) {
    const c = h.ctx();
    const e = Array.isArray(c?.chainedFrom) ? c.chainedFrom.find((x: any) => x?.executionId === executionId) : null;
    if (!e) { if (h.name === 'author.exec.config.inputContext') throw new Error(`${nodeId}: ${target} — no chained entry for ${executionId} in ${h.name}`); continue; }
    if (typeof e.finalResponse !== 'string') throw new Error(`${nodeId}: ${target} — the chained entry carries no finalResponse (${h.name})`);
    const r = applyEdits(e.finalResponse, [spec], target);
    if (!r.applied.length) throw new Error(`${nodeId}: input edit ${spec.id} did not apply to ${target} (${h.name})`);
    sizes = sizes ?? { beforeChars: e.finalResponse.length, afterChars: r.text.length };
    e.finalResponse = r.text;
    h.save(c);
    done.push(h.name);
  }
  for (const h of holders.filter((x) => done.includes(x.name))) {
    const fr: string = h.ctx().chainedFrom.find((x: any) => x?.executionId === executionId).finalResponse;
    for (const o of spec.ops) {
      if (!o.new.includes(o.old) && fr.includes(o.old)) throw new Error(`${nodeId}: ${target} — after the edit, ${h.name} still holds the op's old text`);
      if (o.new && !fr.includes(o.new)) throw new Error(`${nodeId}: ${target} — after the edit, ${h.name} does not hold the op's new text`);
    }
  }
  return { ...sizes!, copies: done };
}
