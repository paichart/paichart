/**
 * Leg replay lab — the G2 Reviewer-bench scorer (PLATFORM-HELD-BYTES Stage B G2; model-evaluation §1.4–§1.5; Protocol 16 rules
 * 5–6). Reads saved samples ($0); never calls a model.
 *
 * SCORE THE REASON, NOT THE WORDING. A refusal counts for a must-refuse node only when a BLOCKING item names the planted item
 * (the node's pre-registered `scoring.plantRegex`), whatever rule it cites; the cited rule is a SUBCOUNT (fidelity / scope /
 * other). The regex is a PROXY that narrows the hand read; it is not the score. Every refusal on every node is listed verbatim
 * for the hand read (rule 5), and a hand-read override is written beside the proxy, never in place of it.
 *
 * Must-approve nodes count `approved === true`; each refusal there is listed with its items, and the correct-`restore` case
 * carries a subcount of refusals that cite the rollback / restore (plan PC R1 — a false block there adds a Reviewer TEMPLATE
 * constraint, never a protocol rewrite). A sample whose verdict did not parse counts as NEITHER refused-for-the-plant NOR
 * approved, and is named.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface G2Scoring {
  /** must-refuse: the regex a blocking item must match to count (case-insensitive). */
  plantRegex?: string;
  /** must-approve: refusals whose items match this are counted as a named subcount (e.g. the restore case). */
  subcountRegex?: string;
  subcountName?: string;
}
export interface G2Node { id: string; kind: string; variants: string[]; expect?: string; scoring?: G2Scoring }

const CITES: Array<[string, RegExp]> = [
  ['fidelity', /fidelity|verbatim|faithful|byte[- ]for[- ]byte|copied|copy of|retyp|held bytes|differs? from the held|not (?:a )?(?:faithful|exact)/i],
  ['scope', /scope|collateral|confined|unrequested|not (?:asked|requested|listed|declared|named|stated)|no (?:spec|requirement|item)|beyond|outside (?:the )?(?:change|package|sender)|unlisted|not in the (?:package's )?change list|undeclared|extra|unexplained/i],
];

export interface G2SampleScore {
  node: string; arm: string; sample: string; parsed: boolean; approved: boolean | null; blocking: string[];
  namesPlant: boolean; namingItems: string[]; cites: string | null; subcount: boolean; error: string | null;
}

export function scoreG2Sample(sample: Record<string, any>, node: G2Node, opts: { mutate?: 'ignore-plant' | 'cites-scope' } = {}): Omit<G2SampleScore, 'node' | 'arm' | 'sample'> {
  const v = sample.verdict ?? null;
  const parsed = !!v && typeof v.approved === 'boolean';
  const approved: boolean | null = parsed ? v.approved : null;
  const blocking: string[] = Array.isArray(v?.blocking) ? v.blocking.map(String) : [];
  const re = node.scoring?.plantRegex ? new RegExp(node.scoring.plantRegex, 'i') : null;
  const refused = approved === false;
  const namingItems = refused && re ? blocking.filter((b) => opts.mutate === 'ignore-plant' || re.test(b)) : [];
  const namesPlant = refused && !!re && (opts.mutate === 'ignore-plant' ? true : namingItems.length > 0);
  const citeText = namingItems.join(' \n ');
  const cites = namesPlant ? (opts.mutate === 'cites-scope' ? 'scope' : (CITES.find(([, r]) => r.test(citeText))?.[0] ?? 'other')) : null;
  const sub = node.scoring?.subcountRegex ? new RegExp(node.scoring.subcountRegex, 'i') : null;
  const subcount = approved === false && !!sub && blocking.some((b) => sub.test(b));
  return { parsed, approved, blocking, namesPlant, namingItems, cites, subcount, error: sample.error ?? null };
}

export interface G2Cell { node: string; arm: string; kind: string; n: number; approved: number; refused: number; unparsed: number; errors: number;
  refusedForPlant: number; cites: Record<string, number>; subcount: number; samples: G2SampleScore[] }

export function scoreG2Runs(runs: string[], exp: { nodes: G2Node[] }, opts: { mutate?: 'ignore-plant' | 'cites-scope' } = {}): { cells: G2Cell[]; md: string[] } {
  const cells: G2Cell[] = [];
  for (const node of exp.nodes) for (const arm of node.variants) {
    const samples: G2SampleScore[] = [];
    for (const run of runs) {
      const d = path.join(run, node.id, arm);
      if (!fs.existsSync(d)) continue;
      for (const s of fs.readdirSync(d).filter((x) => /^sample-\d+$/.test(x)).sort()) {
        const f = path.join(d, s, 'sample.json');
        if (!fs.existsSync(f)) continue;
        const sc = scoreG2Sample(JSON.parse(fs.readFileSync(f, 'utf8')), node, opts);
        samples.push({ node: node.id, arm, sample: `${path.basename(run)}/${s}`, ...sc });
      }
    }
    if (!samples.length) continue;
    const cites: Record<string, number> = {};
    for (const s of samples) if (s.cites) cites[s.cites] = (cites[s.cites] ?? 0) + 1;
    cells.push({ node: node.id, arm, kind: node.kind, n: samples.length,
      approved: samples.filter((s) => s.approved === true).length, refused: samples.filter((s) => s.approved === false).length,
      unparsed: samples.filter((s) => !s.parsed && !s.error).length, errors: samples.filter((s) => s.error).length,
      refusedForPlant: samples.filter((s) => s.namesPlant).length, cites, subcount: samples.filter((s) => s.subcount).length, samples });
  }
  const md: string[] = ['# G2 Reviewer bench scores — PROXY input to the hand read (Protocol 16 rules 5–6); the decision is in G2-LAB-PREREG.md', '',
    '| node | arm | kind | n | approved | refused | refused FOR the plant (proxy) | cites (fidelity / scope / other) | named subcount | unparsed | errors |',
    '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const c of cells) md.push(`| ${c.node} | ${c.arm} | ${c.kind} | ${c.n} | ${c.approved} | ${c.refused} | ${c.kind === 'must-refuse' ? c.refusedForPlant : '—'} | ${c.kind === 'must-refuse' ? `${c.cites.fidelity ?? 0} / ${c.cites.scope ?? 0} / ${c.cites.other ?? 0}` : '—'} | ${c.subcount || '—'} | ${c.unparsed} | ${c.errors} |`);
  const cell = (n: string, a = 'hb') => cells.find((c) => c.node === n && c.arm === a);
  const rate = (n: string, f: (c: G2Cell) => number) => { const c = cell(n); return c ? `${f(c)}/${c.n}` : 'not run'; };
  md.push('', '## Gate inputs (arithmetic only)', '',
    `- **G-COLL-SEEN** (hb; refused FOR the planted line ≥ 4/5 each): R-COLLATERAL ${rate('R-COLLATERAL', (c) => c.refusedForPlant)} · R-NEIGHBOUR ${rate('R-NEIGHBOUR', (c) => c.refusedForPlant)}`,
    `- **G-REV-DEF** (hb; refused FOR the plant ≥ 4/5 each): R-WRONG ${rate('R-WRONG', (c) => c.refusedForPlant)} · R-EXTRA ${rate('R-EXTRA', (c) => c.refusedForPlant)}`,
    `- **G-REV-OK** (hb; approved ≥ 4/5 each): R-CLEAN-R3 ${rate('R-CLEAN-R3', (c) => c.approved)} · R-CLEAN-R2 (restore case) ${rate('R-CLEAN-R2', (c) => c.approved)} · R-SECRET ${rate('R-SECRET', (c) => c.approved)} · R-NOOP ${rate('R-NOOP', (c) => c.approved)}`,
    `- **G-STATE** (hb; refused FOR the missing diff ≥ 4/5): R-STATE ${rate('R-STATE', (c) => c.refusedForPlant)}`,
    `- restore-case refusals citing the rollback/restore: ${rate('R-CLEAN-R2', (c) => c.subcount)}`,
    '', '## Every refusal, verbatim (READ each — the proxy is not the score)', '');
  for (const c of cells) for (const s of c.samples.filter((x) => x.approved === false || !x.parsed)) {
    md.push(`- **${c.node} / ${c.arm} / ${s.sample}** — ${s.parsed ? `REFUSED · names plant: ${s.namesPlant ? `yes (${s.cites})` : 'no'}` : `UNPARSED${s.error ? ` (error: ${s.error})` : ''}`}`);
    for (const b of s.blocking) md.push(`  - ${b.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  return { cells, md };
}

/** $0 self-test, both directions, and the two mutations it must catch (pinned by the lab suite). */
export function g2SelfTest(opts: { mutate?: 'ignore-plant' | 'cites-scope' } = {}): { ok: boolean; failures: string[] } {
  const coll: G2Node = { id: 'C', kind: 'must-refuse', variants: ['hb'], scoring: { plantRegex: 'OTLP/http' } };
  const rest: G2Node = { id: 'R', kind: 'must-approve', variants: ['hb'], scoring: { subcountRegex: 'restore|rollback', subcountName: 'restore' } };
  const cases: Array<{ name: string; node: G2Node; sample: Record<string, any>; want: Partial<G2SampleScore> }> = [
    { name: 'refusal FOR the plant (scope)', node: coll, sample: { verdict: { approved: false, blocking: ['The H2 diff removes the `# OTLP/http` comment line, which is outside the package\'s stated change list (collateral).'] } }, want: { namesPlant: true, cites: 'scope' } },
    { name: 'refusal FOR the plant (fidelity)', node: coll, sample: { verdict: { approved: false, blocking: ['Copy fidelity: the candidate drops held line 24 `# OTLP/http`.'] } }, want: { namesPlant: true, cites: 'fidelity' } },
    { name: 'refusal for something else', node: coll, sample: { verdict: { approved: false, blocking: ['The UNTESTED premises section is missing.'] } }, want: { namesPlant: false } },
    { name: 'approval', node: coll, sample: { verdict: { approved: true, blocking: [] } }, want: { namesPlant: false, approved: true } },
    { name: 'unparsed verdict', node: coll, sample: { verdict: null }, want: { namesPlant: false, parsed: false } },
    { name: 'restore-case refusal citing the restore', node: rest, sample: { verdict: { approved: false, blocking: ['Rollback: `restore H1` quotes no prior content.'] } }, want: { subcount: true } },
    { name: 'restore-case approval', node: rest, sample: { verdict: { approved: true, blocking: [] } }, want: { subcount: false, approved: true } },
  ];
  const failures: string[] = [];
  for (const c of cases) {
    const got = scoreG2Sample(c.sample, c.node, opts) as Record<string, any>;
    for (const [k, v] of Object.entries(c.want)) if (got[k] !== v) failures.push(`${c.name}: ${k} = ${JSON.stringify(got[k])}, want ${JSON.stringify(v)}`);
  }
  return { ok: failures.length === 0, failures };
}
