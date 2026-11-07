/**
 * Leg replay lab — TEXT REACH (network text batch 1, 2026-11-07; Protocol 16 "prove the candidate reaches every arm", LL-24). $0.
 *
 * Found by the Protocol 16 blind read of the NB1 dry run: the architect-only path rendered the PINNED template and dropped the arm's
 * `templateEdits`, so all four derivation_architect cells composed the RELEASED guidance while the dry run passed. This check runs inside
 * every `run` (dry, fake, paid) over the prompts each job will send, and REFUSES on a miss:
 *   protocol edits  every system prompt that composes protocol P (it carries P's base or candidate text verbatim) carries the arm's
 *                   CANDIDATE text verbatim and not the base — a prompt composing neither is out of P's reach (another domain's cell).
 *   template edits  every system prompt whose role is the edit's `role:<x>` carries each op's NEW-only fragment and none of its OLD-only
 *                   WHOLE old string (an exactly-once anchor, so distinctive; the fragment is the op's new minus the common prefix/suffix).
 * The texts are the materialized arm protocols (`protocols/<P>@<v>.<arm>.md` / `.baseline.md`) and the edit files themselves.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ReachPrompt { label: string; role: string | null; system: string }
export interface ReachArm { arm: string; protocols: Array<{ name: string; base: string; candidate: string }>; templateOps: Array<{ role: string; oldOnly: string; newOnly: string; id: string; old: string; new: string }> }

const fragments = (oldS: string, newS: string): { oldOnly: string; newOnly: string } => {
  let p = 0; while (p < oldS.length && p < newS.length && oldS[p] === newS[p]) p++;
  let q = 0; while (q < oldS.length - p && q < newS.length - p && oldS[oldS.length - 1 - q] === newS[newS.length - 1 - q]) q++;
  return { oldOnly: oldS.slice(p, oldS.length - q).trim(), newOnly: newS.slice(p, newS.length - q).trim() };
};

/** The arm's reach spec from the experiment: materialized protocol texts + template-edit fragments. */
export function armReachSpec(dir: string, exp: { baseline: { protocols: Record<string, { file: string }> }; variants: Record<string, { edits?: string[]; templateEdits?: string[] }> }, arm: string): ReachArm {
  const v = exp.variants[arm] ?? {};
  const protocols: ReachArm['protocols'] = [];
  const edited = new Set<string>();
  for (const f of v.edits ?? []) for (const n of (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).appliesTo ?? []) as string[]) edited.add(n);
  for (const name of edited) {
    const b = exp.baseline.protocols[name]; if (!b) continue;
    const candFile = path.join(dir, b.file.replace(/\.baseline\.md$/, `.${arm}.md`));
    if (!fs.existsSync(candFile)) throw new Error(`text-reach: ${arm} edits ${name} but ${path.relative(dir, candFile)} is not materialized (run build-candidates)`);
    protocols.push({ name, base: fs.readFileSync(path.join(dir, b.file), 'utf8'), candidate: fs.readFileSync(candFile, 'utf8') });
  }
  const templateOps: ReachArm['templateOps'] = [];
  for (const f of v.templateEdits ?? []) {
    const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const t of (spec.appliesTo ?? []) as string[]) for (const o of spec.ops ?? []) {
      if (!t.startsWith('role:')) continue;
      const fr = fragments(o.old, o.new);
      templateOps.push({ role: t.slice(5), id: spec.id, old: o.old, new: o.new, ...fr });
    }
  }
  return { arm, protocols, templateOps };
}

export function textReachProblems(spec: ReachArm, prompts: ReachPrompt[]): string[] {
  const out: string[] = [];
  for (const pr of prompts) {
    for (const p of spec.protocols) {
      const hasBase = p.base !== p.candidate && pr.system.includes(p.base);
      const hasCand = pr.system.includes(p.candidate);
      if (hasBase) out.push(`${pr.label}: composes the BASE ${p.name}, not arm ${spec.arm}'s candidate`);
      else if (!hasCand && pr.system.includes(p.base.slice(0, 200))) out.push(`${pr.label}: composes ${p.name}, but neither its base nor arm ${spec.arm}'s candidate verbatim`);
    }
    for (const o of spec.templateOps) {
      if (pr.role !== o.role) continue;
      // Present: the op's NEW-only fragment. Released: the op's WHOLE old string (an exactly-once anchor in the base template, so it is
      // distinctive; a bare old-only fragment can legitimately recur elsewhere in a prompt — P1 / GR4 read false positives on it).
      if (o.newOnly && !pr.system.includes(o.newOnly)) out.push(`${pr.label}: template edit ${o.id} (role:${o.role}) — the candidate fragment is missing (${JSON.stringify(o.newOnly.slice(0, 70))}…)`);
      if (o.old && !o.new.includes(o.old) && pr.system.includes(o.old)) out.push(`${pr.label}: template edit ${o.id} (role:${o.role}) — the RELEASED text is still there (${JSON.stringify((o.oldOnly || o.old).slice(0, 70))}…)`);
    }
  }
  return out;
}

/** NB1 (G15): a template-CONSTRAINT edit reaches the prompt — every row whose candidate value differs from the released one is rendered
 *  with its candidate value, and the released value is gone (both as the row's value string). */
export function constraintReachProblems(label: string, system: string, c: { released: Record<string, unknown> | null; candidate: Record<string, unknown> | null }): string[] {
  const out: string[] = [];
  const flat = (o: Record<string, unknown> | null) => { const m = new Map<string, string>(); const walk = (x: unknown, k: string) => {
    if (typeof x === 'string') m.set(k, x); else if (x && typeof x === 'object') for (const [kk, vv] of Object.entries(x as Record<string, unknown>)) walk(vv, k ? `${k}.${kk}` : kk); };
    walk(o, ''); return m; };
  const r = flat(c.released); const n = flat(c.candidate);
  for (const [k, v] of n) {
    const old = r.get(k);
    if (old === v) continue;
    if (!system.includes(v)) out.push(`${label}: constraint ${k} — the candidate value is not in the prompt (${JSON.stringify(v.slice(0, 70))}…)`);
    if (old && !v.includes(old) && system.includes(old)) out.push(`${label}: constraint ${k} — the RELEASED value is still there (${JSON.stringify(old.slice(0, 70))}…)`);
  }
  return out;
}

