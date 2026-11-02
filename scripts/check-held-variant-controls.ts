#!/usr/bin/env ts-node
/**
 * check-held-variant-controls.ts — reduce each positive control's (plain vs variant) replay difference to NAMED MOVERS and
 * compare them with the build step's recorded expectation. Called by replay-held-variant.sh; pure over its report files.
 *
 * A mover key is `<agentRole of the replayed task>|<surface>`:
 *   title                       the task's header line (the control leg's own title — always expected)
 *   net:<name>.<json path>      a stamped fact field (`▶ <name>` block), compared as parsed JSON, leaf by leaf
 *   net:<name>                  a fact present on one side only
 *   card                        the lean-card line
 *   entry:<pred role>.<key>     a chained entry's top-level key (entries matched by predecessor taskId)
 *   meta.<key>                  pipelineMetadata (chainedAt masked upstream)
 *   §6                          any rendered §6 line
 * Keys are role-scoped (never task ids), so one expectation serves every control leg of the same shape.
 *
 * Expectation file: scripts/fixtures/held-variant-control-expected.json — `{ "<step>": { "movers": [...] } }`. A step's
 * movers are the V-0 set plus what that step is predicted to move (plan §3). PASS = every control's mover set equals the
 * step's; an EMPTY set fails regardless (an inert control proves nothing). `--record` writes the observed union for the
 * step (use only when the plan predicts the change; state it in the commit). When the legs' sets DIFFER (a net that depends on
 * the leg's own contract — V-8b's PRESENCE half moves only where a canonical stanza exists), `--record` also writes `byLeg`, and
 * each leg is then compared, exactly, with its own recorded set (V-10, 2026-10-15).
 *
 *   npx ts-node scripts/check-held-variant-controls.ts --step V-0 --out <dir> <legId> [<legId> ...] [--record]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

type AnyRec = Record<string, unknown>;
type Block = { role: string; header: string; nets: Map<string, unknown>; card: string | null; entries: Map<string, AnyRec>; meta: AnyRec | null; s6: string[] };

export function parseReport(text: string): Map<string, Block> {
  const out = new Map<string, Block>();
  const lines = text.split('\n');
  let cur: Block | null = null; let curId = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(c[a-z0-9]{24})  \[/.exec(l);
    if (h) {
      curId = h[1];
      const role = /^role=(\S+)/.exec(lines[i + 1] ?? '')?.[1] ?? '?';
      cur = { role, header: l, nets: new Map(), card: null, entries: new Map(), meta: null, s6: [] };
      out.set(curId, cur);
      continue;
    }
    if (!cur || l.startsWith('CONTROL ')) continue;
    const net = /^  ▶ (\S+)$/.exec(l);
    if (net) {
      const buf: string[] = [];
      for (i++; i < lines.length && lines[i].startsWith('    '); i++) buf.push(lines[i].slice(4));
      i--;
      try { cur.nets.set(net[1], JSON.parse(buf.join('\n'))); } catch { cur.nets.set(net[1], buf.join('\n')); }
      continue;
    }
    if (l.startsWith('  CARD: ')) { cur.card = l; continue; }
    const e = /^  ENTRY\[\d+\] (.*)$/.exec(l);
    if (e) { const o = JSON.parse(e[1]) as AnyRec; cur.entries.set(String(o.taskId), o); continue; }
    if (l.startsWith('  META ')) { cur.meta = JSON.parse(l.slice(7)) as AnyRec; continue; }
    if (l.startsWith('  §6')) { cur.s6.push(l); continue; }
    // A rendered §6 element may span lines (an entry's finalResponse); continuation lines belong to §6.
    if (cur.s6.length && !l.startsWith('  ')) cur.s6.push(l);
  }
  return out;
}

function leafDiffs(a: unknown, b: unknown, path: string, out: Set<string>) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a as AnyRec), ...Object.keys(b as AnyRec)])) leafDiffs((a as AnyRec)[k], (b as AnyRec)[k], path ? `${path}.${k}` : k, out);
    return;
  }
  out.add(path);
}

export function movers(plain: Map<string, Block>, variant: Map<string, Block>): string[] {
  const m = new Set<string>();
  for (const id of new Set([...plain.keys(), ...variant.keys()])) {
    const a = plain.get(id), b = variant.get(id);
    if (!a || !b) { m.add(`${(a ?? b)!.role}|task-missing-on-one-side`); continue; }
    const r = a.role;
    if (a.header !== b.header) m.add(`${r}|title`);
    for (const n of new Set([...a.nets.keys(), ...b.nets.keys()])) {
      if (!a.nets.has(n) || !b.nets.has(n)) { m.add(`${r}|net:${n}`); continue; }
      const d = new Set<string>(); leafDiffs(a.nets.get(n), b.nets.get(n), '', d);
      for (const p of d) m.add(`${r}|net:${n}.${p}`);
    }
    if (a.card !== b.card) m.add(`${r}|card`);
    for (const t of new Set([...a.entries.keys(), ...b.entries.keys()])) {
      const ea = a.entries.get(t), eb = b.entries.get(t);
      const pr = String((ea ?? eb)!.agentRole ?? '?');
      if (!ea || !eb) { m.add(`${r}|entry:${pr}`); continue; }
      for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) if (JSON.stringify(ea[k]) !== JSON.stringify(eb[k])) m.add(`${r}|entry:${pr}.${k}`);
    }
    if (JSON.stringify(a.meta) !== JSON.stringify(b.meta)) {
      for (const k of new Set([...Object.keys(a.meta ?? {}), ...Object.keys(b.meta ?? {})])) {
        if (JSON.stringify((a.meta ?? {})[k]) !== JSON.stringify((b.meta ?? {})[k])) m.add(`${r}|meta.${k}`);
      }
    }
    if (a.s6.join('\n') !== b.s6.join('\n')) m.add(`${r}|§6`);
  }
  return [...m].sort();
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const step = arg('--step'), out = arg('--out'), record = argv.includes('--record');
  const legs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--step' && argv[i - 1] !== '--out');
  if (!step || !out || !legs.length) { console.error('usage: --step <V-n> --out <dir> <legId>…'); process.exit(2); }
  const FIX = join(__dirname, 'fixtures', 'held-variant-control-expected.json');
  const fix = existsSync(FIX) ? (JSON.parse(readFileSync(FIX, 'utf8')) as Record<string, { movers: string[]; byLeg?: Record<string, string[]>; note?: string }>) : {};
  const perLeg: Record<string, string[]> = {};
  let fail = 0; const union = new Set<string>();
  for (const leg of legs) {
    const read = (s: string) => parseReport(readFileSync(join(out, `control-${leg}.${s}`), 'utf8'));
    const got = movers(read('plain'), read('variant'));
    got.forEach((k) => union.add(k)); perLeg[leg] = [...got].sort();
    const want = fix[step]?.byLeg?.[leg] ?? fix[step]?.movers;
    console.log(`control ${leg}: ${got.length} mover(s)`);
    for (const k of got) console.log(`   ${want && !want.includes(k) ? '❌ UNEXPECTED' : '·'} ${k}`);
    if (want) for (const k of want) if (!got.includes(k)) { console.log(`   ❌ EXPECTED, NOT MOVED ${k}`); fail++; }
    if (want && got.some((k) => !want.includes(k))) fail++;
    if (!got.length) { console.log('   ❌ INERT CONTROL'); fail++; }
    if (!want && !record) { console.log(`   ❌ no expectation recorded for step ${step}`); fail++; }
  }
  if (record) {
    const all = [...union].sort();
    const differ = Object.values(perLeg).some((m) => JSON.stringify(m) !== JSON.stringify(all));
    const { byLeg: _old, ...rest } = fix[step] ?? { movers: [] }; void _old;
    fix[step] = { ...rest, movers: all, ...(differ ? { byLeg: perLeg } : {}) };
    writeFileSync(FIX, JSON.stringify(fix, null, 2) + '\n');
    console.log(`recorded ${union.size} mover(s) for ${step} → ${FIX}`);
    process.exit(0);
  }
  console.log(fail ? `❌ controls differ from the ${step} expectation` : `✅ controls match the ${step} expectation`);
  process.exit(fail ? 1 : 0);
}
