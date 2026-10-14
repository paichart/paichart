/**
 * Leg replay lab — Z49 SCORER (2026-10-10, Z49 request-path lab gate). $0: no model call, no database.
 *
 *   npm run lab:leg-replay -- z49-self-test --experiment <dir>           # the persisted Z49 failure + planted controls
 *   npm run lab:leg-replay -- z49-score --run <runDir> --experiment <dir> # per-sample proxies + the pre-registered gates
 *
 * WHAT IT READS (proxies that NARROW the hand read; Protocol 16 rule 6 — they are not the score):
 *  - the terraform-iac leg's EXEMPLAR STANZA: every fenced block in the `## Pipeline N objective — … terraform-iac …`
 *    section that carries `"Effect"`. Per statement: its effect and its condition keys. The ADDRESS keys are
 *    `aws:SourceIp` and `aws:VpcSourceIp`. Parsed as JSON when the block (or `[block]`) parses; else by a per-statement
 *    regex split on `"Effect"` (reported as `parse: 'regex'`).
 *  - the leg's FORBIDDEN LIST: the bullet that names "Forbidden" in that section and its indented sub-bullets; the
 *    `aws:*` keys it names.
 *  - every `<token>.request-path` row: the decision-table row (form: declared / derived / forced / OPEN; cited items and
 *    quotes; the rule cell; the options cell) and the owner-block line (tier, options).
 *  - context for the hand read, never gated: lines outside the forbidden list that forbid `aws:VpcSourceIp`, and lines
 *    that pin the policy to `aws:SourceIp` only (e.g. a Node C acceptance check or a validation `jq` written for it).
 *
 * GATES (pre-registered in experiment.json `purpose`; this module computes their inputs):
 *  - G-STANZA (per answered sample): a stanza exists; ≥ 1 Allow statement conditions on `aws:VpcSourceIp`; EVERY
 *    statement that carries an address condition uses `aws:VpcSourceIp` and not `aws:SourceIp` (a Deny on
 *    `NotIpAddress aws:SourceIp` refuses the pods too: on a private-endpoint path the request carries no aws:SourceIp
 *    the Allow could match); and the forbidden list does not name `aws:VpcSourceIp`.
 *  - G-ROW answered: `terraform-iac.request-path` in the table, form declared, citing item 21 with a quote that is ONE
 *    contiguous span of item 21's text. G-ROW zero: `terraform-iac.request-path` OPEN with the options
 *    `direct · private-endpoint · translated` (in that order); `kubernetes-gitops.request-path` listed not-applicable
 *    (owner-block tier `not-applicable`, no answered table row), OR absent everywhere while every
 *    `kubernetes-gitops` authorisation row in the owner block is tier `not-applicable`. Both modes: no request-path row
 *    anywhere is derived or forced.
 *  - G-NOWORSE inputs: the shipping in-run analysis (`analyzeRequirementsForm`) under the arm's own check data, with
 *    findings that name `request-path` and the item-21 clause REMOVED (G-ROW owns them) — author-actionable coverage,
 *    citation findings, dropped clauses, lint hits, program-view size.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadSnapshot } from './snapshot';
import { parsedResult } from './rebuild';
import { applyEdits, type EditSpec } from './edits';
import { snapshotWithInputEdits } from './input-edits';
import { useCheckDataAt } from './check-at';
import { nodeInputs, readOwnerMap, scoreText, SIZE_ALLOWANCE_CHARS } from './score-requirements';
import { analyzeRequirementsForm, isRegistryCausedCoverageFinding } from '../../lib/agents/harness/requirements-form-check';
import type { RequirementsFormInputs } from '../../lib/agents/harness/requirements-form-correction';

export const ADDRESS_KEYS = ['aws:SourceIp', 'aws:VpcSourceIp'] as const;
export const ENDPOINT_KEY = 'aws:VpcSourceIp';
export const REQUEST_PATH_OPTIONS = 'direct · private-endpoint · translated';

// ───────────────────────────── document structure ─────────────────────────────

function sections(text: string): Array<{ heading: string; body: string; start: number }> {
  const lines = text.split('\n');
  const out: Array<{ heading: string; body: string; start: number }> = [];
  let cur: { heading: string; lines: string[]; start: number } | null = null;
  lines.forEach((l, i) => {
    if (/^## /.test(l)) { if (cur) out.push({ heading: cur.heading, body: cur.lines.join('\n'), start: cur.start }); cur = { heading: l, lines: [], start: i + 1 }; }
    else if (cur) cur.lines.push(l);
  });
  if (cur) out.push({ heading: (cur as any).heading, body: (cur as any).lines.join('\n'), start: (cur as any).start });
  return out;
}

export function terraformSection(text: string): string | null {
  const s = sections(text).find((x) => /^## Pipeline \d+ objective\b/i.test(x.heading) && /terraform-iac/i.test(x.heading));
  return s ? s.body : null;
}

interface Statement { effect: string | null; keys: string[] }
function statementsOf(v: any, acc: Statement[]) {
  if (Array.isArray(v)) { v.forEach((x) => statementsOf(x, acc)); return; }
  if (!v || typeof v !== 'object') return;
  if (typeof v.Effect === 'string') {
    const keys: string[] = [];
    if (v.Condition && typeof v.Condition === 'object') for (const op of Object.values<any>(v.Condition)) if (op && typeof op === 'object') keys.push(...Object.keys(op));
    acc.push({ effect: v.Effect, keys });
    return;
  }
  for (const x of Object.values(v)) statementsOf(x, acc);
}

// L10 measure fault (2026-10-10, owner decision (a)): an exemplar written as Terraform HCL (`aws_s3_bucket_policy` +
// `jsonencode({ … Effect = "Allow" … Condition = { IpAddress = { "aws:VpcSourceIp" = [...] } } })`) read as `parse: none`
// — A21/z49/sample-03 was a correct stanza scored as a miss. HCL statements are now read too (`parse: 'hcl'`).
const HCL_EFFECT = /\bEffect\s*=\s*"(\w+)"/;
export function parseStanza(section: string): { blocks: number; parse: 'json' | 'regex' | 'hcl' | 'none'; statements: Statement[] } {
  const blocks: string[] = [];
  const re = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) if (/"Effect"/.test(m[1]) || HCL_EFFECT.test(m[1])) blocks.push(m[1]);
  if (!blocks.length) return { blocks: 0, parse: 'none', statements: [] };
  const statements: Statement[] = [];
  let parse: 'json' | 'regex' | 'hcl' = 'json';
  for (const b of blocks) {
    let parsed: any;
    for (const cand of [b, `[${b}]`]) { try { parsed = JSON.parse(cand); break; } catch { /* next */ } }
    if (parsed !== undefined) { statementsOf(parsed, statements); continue; }
    if (!/"Effect"/.test(b) && HCL_EFFECT.test(b)) {
      parse = 'hcl';
      for (const c of b.split(/(?=\bSid\s*=|\bEffect\s*=)/).filter((x) => HCL_EFFECT.test(x))) {
        const eff = HCL_EFFECT.exec(c)?.[1] ?? null;
        const ci = c.search(/\bCondition\s*=/);
        const keys = ci >= 0 ? [...c.slice(ci).matchAll(/"(aws:[A-Za-z]+|s3:[A-Za-z-]+)"\s*=/g)].map((x) => x[1]) : [];
        statements.push({ effect: eff, keys });
      }
      continue;
    }
    parse = 'regex';
    const chunks = b.split(/(?="Sid"|"Effect")/).filter((c) => /"Effect"/.test(c));
    for (const c of chunks) {
      const eff = /"Effect"\s*:\s*"(\w+)"/.exec(c)?.[1] ?? null;
      const cond = c.slice(Math.max(0, c.indexOf('"Condition"')));
      const keys = c.includes('"Condition"') ? [...cond.matchAll(/"(aws:[A-Za-z]+|s3:[A-Za-z-]+)"\s*:/g)].map((x) => x[1]) : [];
      statements.push({ effect: eff, keys });
    }
  }
  return { blocks: blocks.length, parse, statements };
}

export function forbiddenList(section: string): { found: boolean; keys: string[]; lines: string[] } {
  const lines = section.split('\n');
  const i = lines.findIndex((l) => /^\s*-\s.*\bForbidden\b/i.test(l) || /^\s*\*\*Forbidden\b/i.test(l));
  if (i < 0) return { found: false, keys: [], lines: [] };
  const indent = (l: string) => (/^(\s*)/.exec(l)?.[1].length ?? 0);
  const base = indent(lines[i]);
  const got = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) { if (j + 1 < lines.length && indent(lines[j + 1]) > base && lines[j + 1].trim()) continue; break; }
    if (indent(l) <= base && /^\s*-\s/.test(l)) break;
    if (/^#/.test(l)) break;
    got.push(l);
  }
  const keys = [...new Set(got.join("\n").match(/(?<![\w:])aws:[A-Za-z]+/g) ?? [])];
  return { found: true, keys, lines: got };
}

export interface RequestPathRow { leg: string; table: { options: string; rule: string; source: string; form: string; citations: Array<{ item: number; quote: string }> } | null; owner: { options: string; tier: string } | null }

export function requestPathRows(text: string): RequestPathRow[] {
  const rows = new Map<string, RequestPathRow>();
  const get = (leg: string) => { if (!rows.has(leg)) rows.set(leg, { leg, table: null, owner: null }); return rows.get(leg)!; };
  for (const l of text.split('\n')) {
    const t = /^\|\s*`?([a-z0-9-]+)\.request-path`?\s*\|(.*)\|\s*$/.exec(l);
    if (t) {
      const cells = t[2].split('|').map((c) => c.trim());
      const source = cells[cells.length - 1] ?? '';
      const form = /^\(declared/.test(source) ? 'declared' : /^\(derived/.test(source) ? 'derived' : /^\(forced/.test(source) ? 'forced' : /^OPEN\b/.test(source) ? 'open'
        : /not[- ]applicable/i.test(source) ? 'not-applicable' : 'other';
      const citations = [...source.matchAll(/\(declared — item (\d+): "([^"]*)"\)/g)].map((x) => ({ item: Number(x[1]), quote: x[2] }));
      get(t[1]).table = { options: cells[1] ?? '', rule: cells[2] ?? '', source, form, citations };
      continue;
    }
    const o = /^`?([a-z0-9-]+)\.request-path`?\s+—.*?—\s*options:\s*(.*?)\s+—\s+governs:.*?—\s*tier:\s*([a-z-]+)/.exec(l);
    if (o) get(o[1]).owner = { options: o[2], tier: o[3] };
  }
  return [...rows.values()];
}

/** Owner-block tiers of a leg's AUTHORISATION rows (the auth class keys of the registry, request-path excluded). */
const AUTH_KEYS = ['receiver', 'admitted-principal', 'principal-unseen', 'granted-action', 'existing-grant', 'target-empty', 'enforcer-absent', 'target-absent', 'collateral'];
function ownerTiers(text: string, leg: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of text.split('\n')) {
    const m = new RegExp(`^\`?${leg.replace(/-/g, '\\-')}\\.([a-z-]+)\`?\\s+—.*—\\s*tier:\\s*([a-z-]+)`).exec(l);
    if (m && AUTH_KEYS.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}
function tableHasAuthRow(text: string, leg: string): boolean {
  return text.split('\n').some((l) => new RegExp(`^\\|\\s*\`?${leg.replace(/-/g, '\\-')}\\.(${AUTH_KEYS.join('|')})\`?\\s*\\|`).test(l));
}

// ───────────────────────────── one draft ─────────────────────────────

export interface Z49Score {
  terraformSection: boolean;
  stanza: { blocks: number; parse: string; statements: Statement[]; allowEndpoint: boolean; addressStatements: number; addressStatementsOnEndpointOnly: number; sourceIpStatements: number };
  forbidden: { found: boolean; keys: string[]; endpointForbidden: boolean };
  endpointForbiddenElsewhere: string[];
  sourceIpOnlyPins: string[];
  requestPath: RequestPathRow[];
  gStanza: boolean;
  gRow: { mode: 'answered' | 'zero'; pass: boolean; parts: Record<string, boolean>; derivedOrForced: string[] };
}

export function scoreZ49(text: string, mode: 'answered' | 'zero', objectiveItem21: string | null): Z49Score {
  const sec = terraformSection(text);
  const st = sec ? parseStanza(sec) : { blocks: 0, parse: 'none' as const, statements: [] };
  const addr = st.statements.filter((s) => s.keys.some((k) => (ADDRESS_KEYS as readonly string[]).includes(k)));
  const onEndpointOnly = addr.filter((s) => s.keys.includes(ENDPOINT_KEY) && !s.keys.includes('aws:SourceIp'));
  const allowEndpoint = st.statements.some((s) => s.effect === 'Allow' && s.keys.includes(ENDPOINT_KEY));
  const fb = sec ? forbiddenList(sec) : { found: false, keys: [], lines: [] };
  const fbSet = new Set(fb.lines);
  const forbidWord = /forbid|must not|never|not permitted|banned|prohibit|disallow/i;
  const allLines = text.split('\n');
  const endpointForbiddenElsewhere = allLines.filter((l) => !fbSet.has(l) && l.includes(ENDPOINT_KEY) && forbidWord.test(l));
  const sourceIpOnlyPins = allLines.filter((l) => !fbSet.has(l) && /aws:SourceIp/.test(l) && !l.includes(ENDPOINT_KEY) && (/\bonly\b/i.test(l) || /"aws:SourceIp"\]\]|\.Condition/.test(l)));
  const rp = requestPathRows(text);
  const derivedOrForced = rp.filter((r) => r.table && (r.table.form === 'derived' || r.table.form === 'forced')).map((r) => `${r.leg}:${r.table!.form}`);
  const gStanza = st.statements.length > 0 && allowEndpoint && addr.length > 0 && onEndpointOnly.length === addr.length && !fb.keys.includes(ENDPOINT_KEY);
  const tf = rp.find((r) => r.leg === 'terraform-iac') ?? null;
  const parts: Record<string, boolean> = {};
  if (mode === 'answered') {
    parts.present = !!tf?.table;
    parts.declared = tf?.table?.form === 'declared';
    parts.citesItem21Verbatim = !!tf?.table && !!objectiveItem21 && tf.table.citations.some((c) => c.item === 21 && c.quote.length > 0 && objectiveItem21.includes(c.quote));
    parts.noDerivedOrForced = derivedOrForced.length === 0;
  } else {
    parts.terraformOpen = tf?.table?.form === 'open' && tf.table.source.includes(`options: ${REQUEST_PATH_OPTIONS}`);
    const k8s = rp.find((r) => r.leg === 'kubernetes-gitops') ?? null;
    const k8sNa = !!k8s?.owner && k8s.owner.tier === 'not-applicable' && (!k8s.table || k8s.table.form === 'not-applicable');
    const tiers = ownerTiers(text, 'kubernetes-gitops');
    const k8sAbsentAllNa = !k8s && !tableHasAuthRow(text, 'kubernetes-gitops') && Object.keys(tiers).length > 0 && Object.values(tiers).every((t) => t === 'not-applicable');
    parts.kubernetesNotApplicable = k8sNa || k8sAbsentAllNa;
    parts.noDerivedOrForced = derivedOrForced.length === 0;
  }
  return {
    terraformSection: !!sec,
    stanza: { blocks: st.blocks, parse: st.parse, statements: st.statements, allowEndpoint, addressStatements: addr.length, addressStatementsOnEndpointOnly: onEndpointOnly.length,
      sourceIpStatements: addr.filter((s) => s.keys.includes('aws:SourceIp')).length },
    forbidden: { found: fb.found, keys: fb.keys, endpointForbidden: fb.keys.includes(ENDPOINT_KEY) },
    endpointForbiddenElsewhere, sourceIpOnlyPins, requestPath: rp, gStanza,
    gRow: { mode, pass: Object.values(parts).every(Boolean), parts, derivedOrForced },
  };
}

export function objectiveItem(objective: string, n: number): string | null {
  const m = new RegExp(`^${n}\\. (.*)$`, 'm').exec(objective);
  return m ? m[1] : null;
}

/** G-NOWORSE inputs: the shipping in-run analysis with request-path findings and the item-21 clause removed. */
export function noWorseMeasures(text: string, inputs: RequirementsFormInputs) {
  const a = analyzeRequirementsForm({ draft: text, objective: inputs.objective, ownerRowItemMapParsed: inputs.ownerMap } as any);
  const isRp = (f: Record<string, unknown>) => JSON.stringify(f).includes('request-path');
  const cov = a.coverage.errors.filter((e) => !isRegistryCausedCoverageFinding(e));
  const s = scoreText(text, inputs);
  return {
    coverageAuthorActionable: cov.filter((e) => !isRp(e)).length,
    coverageRequestPath: cov.filter(isRp).length,
    citationFindings: a.citations.findings.length,
    clausesDropped: a.clauses.dropped.filter((d) => d.item !== 21).length,
    item21Dropped: a.clauses.dropped.some((d) => d.item === 21),
    lintHits: a.lint.length,
    view: s.view, sizeWithAllowance: s.sizeWithAllowance, mechanicalPass: s.mechanicalPass, failing: s.failing,
  };
}

// ───────────────────────────── self-test ─────────────────────────────

/** scorer/z49-self-test.json: cases on PERSISTED drafts, each optionally planted (EditSpec appliesTo `draft`). */
export function z49SelfTest(expDir: string): { rows: string[]; mismatches: string[] } {
  const cfg = JSON.parse(fs.readFileSync(path.join(expDir, 'scorer', 'z49-self-test.json'), 'utf8'));
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const rows: string[] = []; const mismatches: string[] = [];
  for (const c of cfg.cases) {
    const nd = exp.nodes.find((x: any) => x.id === c.node);
    const snap = snapshotWithInputEdits(expDir, nd, loadSnapshot(nd.authorExecutionId)).snap;
    let text = parsedResult(snap.author)!.finalResponse;
    if (c.plant) {
      const spec: EditSpec = JSON.parse(fs.readFileSync(path.join(expDir, c.plant), 'utf8'));
      text = applyEdits(text, [spec], 'draft').text;
    }
    const inputs = nodeInputs(snap, readOwnerMap(expDir, nd.ownerRowItemMap));
    const z = scoreZ49(text, c.mode, objectiveItem(inputs.objective, 21));
    useCheckDataAt(c.checkAt ?? null);
    let nw: ReturnType<typeof noWorseMeasures>;
    try { nw = noWorseMeasures(text, inputs); } finally { useCheckDataAt(null); }
    const got: Record<string, unknown> = {
      gStanza: z.gStanza, allowEndpoint: z.stanza.allowEndpoint, sourceIpStatements: z.stanza.sourceIpStatements, endpointForbidden: z.forbidden.endpointForbidden,
      gRow: z.gRow.pass, gRowParts: z.gRow.parts, coverageRequestPath: nw.coverageRequestPath,
    };
    for (const [k, v] of Object.entries(c.expect)) if (JSON.stringify(got[k]) !== JSON.stringify(v)) mismatches.push(`${c.name} ${k}: expected ${JSON.stringify(v)}, scorer ${JSON.stringify(got[k])}`);
    rows.push(`| ${c.name} | ${c.mode} | ${z.stanza.blocks}/${z.stanza.parse} | ${z.stanza.statements.map((s) => `${s.effect}:${s.keys.join('+') || '—'}`).join(' ; ') || '—'} | ${z.forbidden.keys.join(' ') || '—'} | ${z.gStanza ? 'PASS' : 'fail'} | ${z.requestPath.map((r) => `${r.leg}:${r.table?.form ?? '—'}/${r.owner?.tier ?? '—'}`).join(' ') || 'none'} | ${z.gRow.pass ? 'PASS' : 'fail'} ${JSON.stringify(z.gRow.parts)} | cov rp ${nw.coverageRequestPath} · cov ${nw.coverageAuthorActionable} · cit ${nw.citationFindings} · clauses ${nw.clausesDropped}${nw.item21Dropped ? ' (+item 21)' : ''} · lint ${nw.lintHits} · view ${nw.view} |`);
  }
  return { rows, mismatches };
}

// ───────────────────────────── a run ─────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN; };

export function z49ScoreRun(runDirs: string[], expDir: string) {
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const tol = exp.z49?.noWorseTolerance;
  if (!tol) throw new Error('experiment.json carries no z49.noWorseTolerance — the tolerance must be pre-registered');
  const samples: any[] = [];
  for (const runDir of runDirs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
    for (const node of Object.keys(manifest.nodes)) {
      const nd = exp.nodes.find((x: any) => x.id === node);
      const mode: 'answered' | 'zero' = nd.z49Mode;
      const snap = snapshotWithInputEdits(expDir, nd, loadSnapshot(nd.authorExecutionId)).snap;
      const inputs = nodeInputs(snap, readOwnerMap(expDir, nd.ownerRowItemMap));
      const item21 = objectiveItem(inputs.objective, 21);
      const ndir = path.join(runDir, node);
      for (const v of fs.readdirSync(ndir).filter((d) => fs.statSync(path.join(ndir, d)).isDirectory())) {
        useCheckDataAt(exp.variants?.[v]?.requirementsCheckAt ?? null);
        try {
          for (const sd of fs.readdirSync(path.join(ndir, v)).filter((d) => d.startsWith('sample-'))) {
            const dir = path.join(ndir, v, sd);
            const s = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
            const ap = path.join(dir, 'author.md');
            if (s.error || !fs.existsSync(ap)) { samples.push({ node, variant: v, sample: sd, error: s.error ?? 'no author.md' }); continue; }
            const text = fs.readFileSync(ap, 'utf8');
            const z = scoreZ49(text, mode, item21);
            const nw = noWorseMeasures(text, inputs);
            const corr = s.author?.requirementsFormCheck?.correction ?? null;
            const rtext = fs.existsSync(path.join(dir, 'reviewer.md')) ? fs.readFileSync(path.join(dir, 'reviewer.md'), 'utf8') : '';
            const blocking: string[] = s.verdict?.blocking ?? [];
            samples.push({
              node, variant: v, sample: sd, error: null, z49: z, noWorse: nw,
              reviewer: { approved: s.verdict?.approved ?? null, blocking: blocking.length,
                blockingCitesPremiseLine_READ: blocking.filter((b) => /request-path|VpcSourceIp|attribute (that|the declared) path carries|declared path/i.test(b)),
                bodyMentionsRequestPath: /request-path/.test(rtext) },
              correction: corr ? { attempted: !!corr.attempted, adopted: corr.attempted ? !!corr.adopted : null, failingChecks: corr.failingChecks ?? [], notAttemptedReason: corr.notAttemptedReason ?? null } : null,
              registrySha256: s.author?.requirementsFormCheck?.registrySha256 ?? null,
              costUsd: s.costUsd ?? null, authorDurationMs: s.author?.durationMs ?? null,
            });
          }
        } finally { useCheckDataAt(null); }
      }
    }
  }
  const cells: Record<string, any> = {};
  for (const s of samples) { const k = `${s.node}|${s.variant}`; (cells[k] = cells[k] ?? { node: s.node, variant: s.variant, samples: [] as any[] }).samples.push(s); }
  const cellRows = Object.values(cells).map((c: any) => {
    const ok = c.samples.filter((x: any) => !x.error);
    return {
      node: c.node, variant: c.variant, n: c.samples.length, errors: c.samples.length - ok.length,
      gStanza: ok.filter((x: any) => x.z49.gStanza).length, allowEndpoint: ok.filter((x: any) => x.z49.stanza.allowEndpoint).length,
      endpointForbidden: ok.filter((x: any) => x.z49.forbidden.endpointForbidden).length,
      gRow: ok.filter((x: any) => x.z49.gRow.pass).length, derivedOrForced: ok.flatMap((x: any) => x.z49.gRow.derivedOrForced),
      mean: Object.fromEntries(['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits'].map((k) => [k, mean(ok.map((x: any) => x.noWorse[k]))])),
      viewMedian: median(ok.map((x: any) => x.noWorse.view ?? 0)), sizeWithAllowance: ok.filter((x: any) => x.noWorse.sizeWithAllowance).length,
      approved: ok.filter((x: any) => x.reviewer.approved === true).length,
      premiseBlocks_READ: ok.filter((x: any) => x.reviewer.blockingCitesPremiseLine_READ.length).map((x: any) => x.sample),
      correction: { attempted: ok.filter((x: any) => x.correction?.attempted).length, adopted: ok.filter((x: any) => x.correction?.adopted).length },
      registryShas: [...new Set(ok.map((x: any) => x.registrySha256))],
      costMeanUsd: mean(ok.map((x: any) => x.costUsd ?? 0)), authorDurationMaxS: Math.round(Math.max(0, ...ok.map((x: any) => x.authorDurationMs ?? 0)) / 1000),
    };
  });
  // G-NOWORSE per node: z49 − base, against the pre-registered tolerance.
  const noWorse: any[] = [];
  for (const node of [...new Set(cellRows.map((r) => r.node))]) {
    const b = cellRows.find((r) => r.node === node && r.variant === 'base'); const z = cellRows.find((r) => r.node === node && r.variant === 'z49');
    if (!b || !z) continue;
    const d: Record<string, { delta: number; tol: number; ok: boolean }> = {};
    for (const k of ['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits']) {
      const delta = z.mean[k] - b.mean[k]; d[k] = { delta, tol: tol[k], ok: delta <= tol[k] + 1e-9 };
    }
    d.viewMedian = { delta: z.viewMedian - b.viewMedian, tol: tol.viewMedianChars, ok: z.viewMedian - b.viewMedian <= tol.viewMedianChars };
    d.sizeWithAllowance = { delta: z.sizeWithAllowance - b.sizeWithAllowance, tol: -tol.sizePassDrop, ok: z.sizeWithAllowance >= b.sizeWithAllowance - tol.sizePassDrop };
    noWorse.push({ node, pass: Object.values(d).every((x) => x.ok), deltas: d });
  }
  const md = [
    `# Z49 scores — ${runDirs.map((r) => path.basename(r)).join(' + ')}`, '',
    'Proxies narrow the hand read; they are not the score (Protocol 16 rules 5–6). Every G-STANZA / G-ROW verdict is confirmed by reading the sample.', '',
    '| node | arm | n | G-STANZA | Allow on VpcSourceIp | VpcSourceIp forbidden | G-ROW | derived/forced | cov · cit · clauses · lint (means) | view med | size+allow | approved | premise blocks (READ) | corr att/adopt | registry | $ mean | author max s |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...cellRows.map((r) => `| ${r.node} | ${r.variant} | ${r.n - r.errors}${r.errors ? ` (+${r.errors} err)` : ''} | **${r.gStanza}** | ${r.allowEndpoint} | ${r.endpointForbidden} | **${r.gRow}** | ${r.derivedOrForced.join(' ') || '—'} | ${['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits'].map((k) => r.mean[k].toFixed(2)).join(' · ')} | ${r.viewMedian} | ${r.sizeWithAllowance} | ${r.approved} | ${r.premiseBlocks_READ.join(' ') || '—'} | ${r.correction.attempted}/${r.correction.adopted} | ${(r.registryShas as Array<string | null>).map((x) => (x ?? "—").slice(0, 12)).join(',')} | ${r.costMeanUsd.toFixed(2)} | ${r.authorDurationMaxS} |`),
    '', '## G-NOWORSE (z49 − base, per node)', '',
    '| node | pass | coverage | citations | clauses | lint | view median | size+allow passes |', '|---|---|---|---|---|---|---|---|',
    ...noWorse.map((n) => `| ${n.node} | **${n.pass ? 'PASS' : 'MISS'}** | ${['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits', 'viewMedian', 'sizeWithAllowance'].map((k) => `${n.deltas[k].delta >= 0 ? '+' : ''}${Number(n.deltas[k].delta.toFixed(2))} (tol ${n.deltas[k].tol})${n.deltas[k].ok ? '' : ' ✗'}`).join(' | ')} |`),
    '', `Size allowance for the publish view: ${SIZE_ALLOWANCE_CHARS} chars (L-R5).`,
  ];
  return { samples, cells: cellRows, noWorse, md };
}
