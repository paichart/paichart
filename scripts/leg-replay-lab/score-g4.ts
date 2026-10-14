/**
 * Leg replay lab — GROUP 4 SCORER (2026-10-12, group 4 registry lab gate; LAB-PREREG in
 * cline_docs/reviews/group4-registry-batch-2026-10-12/). $0: no model call, no database.
 *
 *   npm run lab:leg-replay -- g4-self-test --experiment <dir>                     # persisted + planted drafts (P9)
 *   npm run lab:leg-replay -- g4-score --run <runDir>[,<runDir>] --experiment <dir>   # per-sample proxies + the gates
 *   npm run lab:leg-replay -- g4-noworse-dump --experiment <dir> --out <file>     # P8: G-NOWORSE findings, this tree's code
 *
 * WHAT IT READS (proxies that NARROW the hand read; Protocol 16 rules 5–6 — they are not the score):
 *  - ITEM ROWS `<token>.item-<N>[a-z]` (G-ITEM-SAFE): declared · leading citation is item N · one citation span ·
 *    the quote a verbatim span of item N · options `—` · not in the owner block. The two INVENTED kinds and the overlap
 *    READ come from the shipping coverage module (G's classifier — see `requireG4Classifier`).
 *  - `<authLeg>.enforcer-scope` (G-SCOPE): form, options cell, chosen option, citations; the sealed part identifiers in
 *    the row and in every line that cites it, OUTSIDE a quoted verbatim span of an owner item (inside one: a subcount).
 *  - the consumer leg's EMPTY-upstream branch (G-EMPTY): lines citing `<producer>.inputs-empty` in its Pipeline section;
 *    the "§6 does not carry it" escalation line; deny-all-on-empty candidates for the hand read.
 *  - the PREMISE branch (G-PREMISE): the *Admitted-principal premise* bullet; its contradiction arm; the shipping
 *    citations check's premise ✓.
 *  - `<authLeg>.collateral` (G-COLL): options cell and chosen option.
 *  - LA only: the Z49 stanza (score-z49.ts G-STANZA).
 *  - G-NOWORSE: ONE instrument — this tree's analysis under the arm's own check data, with every finding class the
 *    batch changes REMOVED by one predicate that reads the same in both codes (`changedClass`).
 * Attempt-1 nodes (TZ, TA) are blind (LAB-PREREG rule 6): this module prints row ids, item NUMBERS, forms and option
 * names only — never a rule cell or a quote. The TA expectation and the part names live in the gitignored sealed file.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { loadSnapshot } from './snapshot';
import { parsedResult } from './rebuild';
import { applyEdits, type EditSpec } from './edits';
import { snapshotWithInputEdits } from './input-edits';
import { useCheckDataAt } from './check-at';
import { nodeInputs, readOwnerMap, scoreText } from './score-requirements';
import { scoreZ49, objectiveItem } from './score-z49';
import { analyzeRequirementsForm } from '../../lib/agents/harness/requirements-form-check';
import { mdSection, DD_HEADING, OWNER_HEADING, parseTableRows, parseOwnerBlock } from '../../lib/agents/harness/requirements-coverage';
import { citationItems, quoteOk } from '../../lib/agents/harness/requirements-citations';
import type { RequirementsFormInputs } from '../../lib/agents/harness/requirements-form-correction';

export const ENFORCER_SCOPE_OPTIONS = 'all-reaching-the-protected-thing · exemption-by-property · gap';
export const PROXY_COLLATERAL_OPTIONS = 'confined-to-block · whole-listener · gap';
const SCOPE_OPTS = ['all-reaching-the-protected-thing', 'exemption-by-property', 'gap'];
const AUTH_KEYS = ['receiver', 'admitted-principal', 'request-path', 'principal-unseen', 'granted-action', 'existing-grant', 'target-empty',
  'enforcer-absent', 'target-absent', 'collateral', 'enforcer-scope'];

export interface G4NodeCfg { mode: 'zero' | 'answered'; authLeg: string; producerLeg: string; nonAuthLegs: string[]; enforcer: 'proxy' | 'bucket'; enforcerScopeItem?: number; z49?: boolean }
export interface Sealed { TA?: { enforcerScope: { leg: string; form: string; option: string; selectingItems: number[] } }; parts?: Record<string, string[]> }

/** The batch's classifier must be the one scoring: under the release code an invented row reads `unknown key`, and the
 *  item-row checks do not exist, so every G-ITEM proxy would read 0 by construction. Fail loud, never score blind. */
export function requireG4Classifier(): void {
  const probe = '## Design decisions\n\n| id | question | options | rule or named target | source |\n|---|---|---|---|---|\n'
    + '| terraform-iac.item-3 | q | — | r | OPEN — x |\n| terraform-iac.made-up | q | — | r | (declared — item 4: "x") |\n\n## Decisions needed from the owner\n\nnone\n';
  const a = analyzeRequirementsForm({ draft: probe, objective: '' } as any);
  const w = a.coverage.errors.map((e) => String(e.what));
  if (!w.some((x) => x.startsWith('item row is not declared')) || !w.some((x) => x.startsWith('invented key restates item 4'))) {
    throw new Error('the g4 scorer needs the group 4 coverage classifier (commit G); this tree does not carry it — run g4-score/g4-self-test from the main tree');
  }
}

// ───────────────────────────── document structure ─────────────────────────────

interface Row { id: string; question: string; options: string; rule: string; source: string; form: string; line: string }
function tableRows(text: string): Row[] {
  const dd = mdSection(text, DD_HEADING) ?? '';
  const forms = new Map(parseTableRows(dd).map((r) => [r.id, r.form]));
  const out: Row[] = [];
  for (const line of dd.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    const id = cells[0].replace(/`/g, '');
    if (!forms.has(id)) continue;
    const src = cells[cells.length - 1];
    const form = /not[- ]applicable/i.test(src) && forms.get(id) === 'other' ? 'not-applicable' : forms.get(id)!;
    out.push({ id, question: cells[1] ?? '', options: cells.length >= 5 ? cells[2] : '', rule: cells.length >= 5 ? cells[3] : '', source: src, form, line });
  }
  return out;
}
const ownerLines = (text: string) => parseOwnerBlock(mdSection(text, OWNER_HEADING)).lines ?? [];
const normOpts = (s: string) => s.replace(/`/g, '').replace(/\s+/g, ' ').trim();
const CITE = /\(\s*declared\s+—\s+items?\s+(\d+)\s*:\s*"([^"]*)"/g;
const citesOf = (cell: string) => [...cell.matchAll(CITE)].map((m) => ({ item: Number(m[1]), quote: m[2] }));
const leadItem = (cell: string) => { const m = /^[(*\s]*declared\s+—\s+items?\s+(\d+)/i.exec(cell.replace(/`/g, '')); return m ? Number(m[1]) : null; };

function legSection(text: string, leg: string): string {
  const lines = text.split('\n'); let on = false; const out: string[] = [];
  for (const l of lines) {
    if (/^## /.test(l)) on = /^## Pipeline \d+ objective\b/i.test(l) && l.includes(leg);
    else if (on) out.push(l);
  }
  return out.join('\n');
}
/** A bullet and its continuation lines (deeper indent or non-bullet), for every bullet whose first line matches. */
function bullets(section: string, re: RegExp): string[] {
  const lines = section.split('\n'); const out: string[] = [];
  const ind = (l: string) => (/^(\s*)/.exec(l)?.[1].length ?? 0);
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    const base = ind(lines[i]); const got = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || /^#/.test(l) || (ind(l) <= base && /^\s*([-*]|\d+\.)\s/.test(l))) break;
      got.push(l);
    }
    out.push(got.join('\n'));
  }
  return out;
}
/** Remove every double-quoted span that is a verbatim span of SOME owner item; return what is left and what was removed. */
function stripOwnerQuotes(line: string, items: Map<number, string>): { rest: string; quoted: string[] } {
  const quoted: string[] = [];
  const rest = line.replace(/"([^"]+)"/g, (m, q) => ([...items.values()].some((it) => quoteOk(q, it) === null) ? (quoted.push(q), '""') : m));
  return { rest, quoted };
}
const partRe = (p: string) => (/^\d+$/.test(p) ? new RegExp(`(?<![\\d.:])${p}(?![\\d])`) : new RegExp(`(?<![\\w.-])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`));

// ───────────────────────────── one draft ─────────────────────────────

export interface G4Score {
  itemRows: { ids: string[]; violations: Array<{ id: string; why: string }> };
  invented: { restates: number; asks: number; asksScope: string[]; overlapReads: number; restateIds: string[]; askIds: string[] };
  citedItems: number[];
  enforcerScope: {
    authLeg: { present: boolean; form: string | null; optionsExact: boolean; option: string | null; citations: Array<{ item: number; ok: boolean }>; inOwnerBlock: string | null };
    nonAuth: Record<string, boolean>;
    partHits: string[]; partHitsInOwnerQuote: string[];
    sealedMatch: boolean | null;
    laItem22: boolean | null;
  };
  empty: { citingLines: number; noChange: boolean; absentValueLine: boolean; anyEmptyBranch: boolean; denyAllOnEmpty_READ: string[] };
  premise: { slot: boolean; contradictionArm: boolean; citesPrincipalUnseen: boolean; citationsCheck: boolean | null; actsOnContradiction_READ: string[] };
  collateral: { present: boolean; form: string | null; options: string; proxySetExact: boolean; kubernetesOnly: boolean; option: string | null; bucketAsserts: boolean };
  z49Stanza: boolean | null;
}

export function scoreG4(text: string, cfg: G4NodeCfg, objective: string, ownerMap: unknown, sealed: Sealed, nodeId: string): G4Score {
  const items = citationItems(objective);
  const rows = tableRows(text); const byId = new Map(rows.map((r) => [r.id, r]));
  const owner = ownerLines(text);
  const a = analyzeRequirementsForm({ draft: text, objective, ownerRowItemMapParsed: ownerMap ?? null } as any);
  // Item rows.
  const itemIds = rows.filter((r) => /\.item-\d+[a-z]?$/.test(r.id)).map((r) => r.id);
  const violations: Array<{ id: string; why: string }> = [];
  for (const id of itemIds) {
    const r = byId.get(id)!; const n = Number(/\.item-(\d+)/.exec(id)![1]);
    if (r.form !== 'declared') violations.push({ id, why: `form ${r.form}` });
    else {
      const lead = leadItem(r.source); const cs = citesOf(r.source);
      if (lead !== n) violations.push({ id, why: `cites item ${lead}` });
      if (cs.length !== 1) violations.push({ id, why: `${cs.length} citation spans` });
      for (const c of cs) if (c.item === n && (!items.has(n) || quoteOk(c.quote, items.get(n)!) !== null)) violations.push({ id, why: 'quote not a verbatim span of the item' });
    }
    if (normOpts(r.options) !== '—') violations.push({ id, why: 'options not —' });
  }
  for (const o of owner) if (/\.item-\d+[a-z]?$/.test(o.id)) violations.push({ id: o.id, why: 'in the owner block' });
  // Invented kinds + overlap READ (shipping classifier).
  const errs = a.coverage.errors.map((e: any) => ({ what: String(e.what), id: String(e.id ?? '') }));
  const restateIds = errs.filter((e) => e.what.startsWith('invented key restates item')).map((e) => e.id);
  const askIds = errs.filter((e) => e.what.startsWith('invented key asks a decision')).map((e) => e.id);
  const asksScope = askIds.filter((id) => /scope|which (parts|blocks|server blocks|listeners)|in scope|forwarding block|description/i.test(`${id} ${byId.get(id)?.question ?? ''}`));
  const overlapReads = a.coverage.read.filter((r: any) => String(r.what).startsWith('item row for an item a registry row')).length;
  const citedItems = [...new Set([...text.matchAll(/\bdeclared\s+—\s+items?\s+(\d+)/gi)].map((m) => Number(m[1])))].sort((x, y) => x - y);
  // enforcer-scope.
  const esId = `${cfg.authLeg}.enforcer-scope`; const es = byId.get(esId) ?? null;
  const optionOf = (r: Row | null, opts: string[]) => {
    if (!r || r.form === 'open') return null;
    const hit = opts.filter((o) => new RegExp(`(^|[^\\w-])${o}([^\\w-]|$)`).test(r.rule));
    return hit.length === 1 ? hit[0] : hit.length ? `ambiguous:${hit.join('+')}` : 'none';
  };
  const esCites = es ? citesOf(es.source).map((c) => ({ item: c.item, ok: items.has(c.item) && quoteOk(c.quote, items.get(c.item)!) === null })) : [];
  const esOwner = owner.find((o) => o.id === esId) ?? null;
  const optionsExact = !!es && (normOpts(es.options) === ENFORCER_SCOPE_OPTIONS || (es.form === 'open' && normOpts(es.source).includes(`options: ${ENFORCER_SCOPE_OPTIONS}`) && normOpts(es.options) === ENFORCER_SCOPE_OPTIONS));
  const nonAuth: Record<string, boolean> = {};
  for (const leg of cfg.nonAuthLegs) {
    const r = byId.get(`${leg}.enforcer-scope`); const o = owner.find((x) => x.id === `${leg}.enforcer-scope`);
    const listedNa = !!o && o.tier === 'not-applicable' && (!r || r.form === 'not-applicable');
    const tiers = owner.filter((x) => AUTH_KEYS.includes(x.id.slice(leg.length + 1)) && x.id.startsWith(`${leg}.`));
    const absentAllNa = !r && !o && !rows.some((x) => x.id.startsWith(`${leg}.`) && AUTH_KEYS.includes(x.id.slice(leg.length + 1)))
      && tiers.length > 0 && tiers.every((x) => x.tier === 'not-applicable');
    nonAuth[leg] = listedNa || absentAllNa;
  }
  const parts = sealed.parts?.[nodeId] ?? [];
  const partHits: string[] = []; const partHitsInOwnerQuote: string[] = [];
  const scopeLines = [es?.line, esOwner?.line, ...text.split('\n').filter((l) => l.includes(esId) && l !== es?.line && l !== esOwner?.line)].filter(Boolean) as string[];
  for (const l of scopeLines) {
    const { rest, quoted } = stripOwnerQuotes(l, items);
    for (const p of parts) {
      if (partRe(p).test(rest)) partHits.push(p);
      if (quoted.some((q) => partRe(p).test(q))) partHitsInOwnerQuote.push(p);
    }
  }
  const esOption = optionOf(es, SCOPE_OPTS);
  let sealedMatch: boolean | null = null;
  const sx = nodeId === 'TA' ? sealed.TA?.enforcerScope : undefined;
  if (sx) sealedMatch = !!es && es.form === sx.form && esOption === sx.option && esCites.some((c) => c.ok && sx.selectingItems.includes(c.item));
  let laItem22: boolean | null = null;
  if (cfg.enforcerScopeItem) {
    const n = cfg.enforcerScopeItem; const cs = es ? citesOf(es.source).filter((c) => c.item === n) : [];
    laItem22 = !!es && es.form === 'declared' && leadItem(es.source) === n && cs.length === 1 && items.has(n) && quoteOk(cs[0].quote, items.get(n)!) === null
      && esOption === 'all-reaching-the-protected-thing';
  }
  // Empty upstream.
  const sec = legSection(text, cfg.authLeg);
  const inputsEmpty = `${cfg.producerLeg}.inputs-empty`;
  const citing = bullets(sec, new RegExp(inputsEmpty.replace(/[.-]/g, (c) => `\\${c}`)));
  const noChange = citing.some((b) => /no change|makes no change|changes nothing|authors? nothing|leaves? .{0,60}unchanged|writes? nothing/i.test(b));
  const emptyish = /inputs-empty|upstream-empty|no sender set|publishes no|nothing (is )?published|arrives empty|empty (set|list|value|host list)|is empty|published no/i;
  const anyEmptyBranch = bullets(sec, emptyish).some((b) => /no change|makes no change|changes nothing|authors? nothing|unchanged|gap/i.test(b));
  const denyAllOnEmpty_READ = sec.split('\n').filter((l) => emptyish.test(l) && /deny[- ]?all|deny everything|deny for everything|deny-everything/i.test(l) && !/\b(never|not|no)\b[^.]{0,60}deny/i.test(l)).map((l) => l.trim().slice(0, 160));
  const absentValueLine = /§6 does not carry|does not carry the upstream|does not carry it/i.test(sec);
  // Premise.
  const pb = bullets(sec, /Admitted-principal premise/i);
  const p = pb.join('\n');
  const contradictionArm = /(another|other|different|second|a different) path|path other than|other than the declared|by a path|arriv\w* (by|via|through|on) (a|another)|contradict/i.test(p)
    && /no change|makes no change|changes nothing|authors? nothing|report/i.test(p);
  const prem = a.citations.premise.find(([t]: [string, boolean]) => t === cfg.authLeg);
  const actsOnContradiction_READ = p.split(/(?<=[.;])\s+/).filter((s) => /contradict|other path|another path|path other than/i.test(s) && /\b(apply|applies|acts?|proceed|writes?)\b/i.test(s) && !/no change|makes no change|never|not\b/i.test(s)).map((s) => s.trim().slice(0, 160));
  // Collateral.
  const col = byId.get(`${cfg.authLeg}.collateral`) ?? null;
  const colOpts = col ? normOpts(col.options) : '';
  const colOption = optionOf(col, ['confined-to-block', 'whole-listener', 'gap', 'allow-named-ports', 'deny', 'leave-to-workload-manifests']);
  const bucketAsserts = cfg.enforcer === 'bucket' && !!col && (/confined-to-block|whole-listener/.test(colOpts + col.rule)
    || (/allow-named-ports/.test(colOpts) && !/per enforcer/i.test(colOpts)) || /allow-named-ports|leave-to-workload-manifests/.test(col.rule));
  // Z49 stanza (LA).
  const z49Stanza = cfg.z49 ? scoreZ49(text, 'answered', objectiveItem(objective, 21)).gStanza : null;
  return {
    itemRows: { ids: itemIds, violations },
    invented: { restates: restateIds.length, asks: askIds.length, asksScope, overlapReads, restateIds, askIds },
    citedItems,
    enforcerScope: {
      authLeg: { present: !!es, form: es?.form ?? null, optionsExact, option: esOption, citations: esCites, inOwnerBlock: esOwner?.tier ?? null },
      nonAuth, partHits: [...new Set(partHits)], partHitsInOwnerQuote: [...new Set(partHitsInOwnerQuote)], sealedMatch, laItem22,
    },
    empty: { citingLines: citing.length, noChange, absentValueLine, anyEmptyBranch, denyAllOnEmpty_READ },
    premise: { slot: pb.length > 0, contradictionArm, citesPrincipalUnseen: p.includes(`${cfg.authLeg}.principal-unseen`), citationsCheck: prem ? prem[1] : null, actsOnContradiction_READ },
    collateral: { present: !!col, form: col?.form ?? null, options: colOpts, proxySetExact: colOpts === PROXY_COLLATERAL_OPTIONS,
      kubernetesOnly: /allow-named-ports/.test(colOpts) && !/confined-to-block/.test(colOpts), option: colOption, bucketAsserts },
    z49Stanza,
  };
}

// ───────────────────────────── G-NOWORSE (one instrument) ─────────────────────────────

/** The finding classes group 4 changes, by one predicate that reads the same under the release code and G's:
 *  `unknown key …` (release) / `invented key …` (G) / `item row …` (G) / anything naming `enforcer-scope`. */
export const changedClass = (f: Record<string, unknown>) => {
  const w = String(f.what ?? '');
  return w.startsWith('unknown key') || w.startsWith('invented key') || w.startsWith('item row') || JSON.stringify(f).includes('enforcer-scope');
};
/** Registry-caused in BOTH codes once the changed classes are gone (the Z17 arm); stated here, not imported, because
 *  the shipping predicate differs between the two trees by construction. */
const registryCausedBoth = (f: Record<string, unknown>) => String(f.what ?? '').startsWith('authorisation leg lists authorisation rows not-applicable');

export function noWorseFindings(text: string, inputs: RequirementsFormInputs) {
  const a = analyzeRequirementsForm({ draft: text, objective: inputs.objective, ownerRowItemMapParsed: inputs.ownerMap } as any);
  const cov = a.coverage.errors.filter((e: any) => !changedClass(e));
  return {
    coverage: cov.map((e: any) => JSON.stringify(e)).sort(),
    coverageAuthorActionable: cov.filter((e: any) => !registryCausedBoth(e)).length,
    citations: [...a.citations.findings].sort(),
    clausesDropped: a.clauses.dropped.map((d: any) => JSON.stringify(d)).sort(),
    lint: a.lint.map((h: any) => JSON.stringify(h)).sort(),
  };
}
export function noWorseMeasures(text: string, inputs: RequirementsFormInputs) {
  const f = noWorseFindings(text, inputs); const s = scoreText(text, inputs);
  return { coverageAuthorActionable: f.coverageAuthorActionable, citationFindings: f.citations.length, clausesDropped: f.clausesDropped.length,
    lintHits: f.lint.length, view: s.view, sizeWithAllowance: s.sizeWithAllowance, failing: s.failing };
}

// ───────────────────────────── shared loading ─────────────────────────────

export function loadSealed(expDir: string, exp: any): { sealed: Sealed; sha256: string | null; matches: boolean } {
  const rel = exp.g4?.sealedFile; if (!rel) return { sealed: {}, sha256: null, matches: false };
  const p = path.resolve(expDir, rel);
  if (!fs.existsSync(p)) throw new Error(`sealed file ${rel} is missing — the TA gate and the named-part stop cannot be read`);
  const raw = fs.readFileSync(p); const sha = crypto.createHash('sha256').update(raw).digest('hex');
  return { sealed: JSON.parse(raw.toString('utf8')), sha256: sha, matches: sha === exp.g4.sealedSha256 };
}
function nodeContext(expDir: string, exp: any, id: string) {
  const nd = exp.nodes.find((x: any) => x.id === id);
  const snap = snapshotWithInputEdits(expDir, nd, loadSnapshot(nd.authorExecutionId, { reviewerExecutionId: nd.reviewerExecutionId ?? null })).snap;
  const inputs = nodeInputs(snap, readOwnerMap(expDir, nd.ownerRowItemMap));
  return { nd, snap, inputs, cfg: exp.g4.nodes[id] as G4NodeCfg };
}

// ───────────────────────────── self-test (P9) ─────────────────────────────

export function g4SelfTest(expDir: string): { rows: string[]; mismatches: string[] } {
  requireG4Classifier();
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const cfgT = JSON.parse(fs.readFileSync(path.join(expDir, 'scorer', 'g4-self-test.json'), 'utf8'));
  const { sealed: sealedFile } = loadSealed(expDir, exp);
  const rows: string[] = []; const mismatches: string[] = [];
  for (const c of cfgT.cases) {
    // A case may name its own part list (a blind-safe stand-in for the sealed one, on the published LA node).
    const sealed: Sealed = c.parts ? { ...sealedFile, parts: { ...(sealedFile.parts ?? {}), [c.node]: c.parts } } : sealedFile;
    const { nd, snap, inputs, cfg } = nodeContext(expDir, exp, c.node);
    let text = parsedResult(snap.author)!.finalResponse;
    for (const f of [].concat(c.plant ?? [])) text = applyEdits(text, [JSON.parse(fs.readFileSync(path.join(expDir, f), 'utf8')) as EditSpec], 'draft').text;
    useCheckDataAt(c.checkAt ?? exp.variants?.[c.arm ?? 'g4']?.requirementsCheckAt ?? null);
    let s: G4Score; let nw: ReturnType<typeof noWorseMeasures>;
    try { s = scoreG4(text, cfg, inputs.objective, inputs.ownerMap, sealed, nd.id); nw = noWorseMeasures(text, inputs); } finally { useCheckDataAt(null); }
    const got: Record<string, unknown> = {
      itemRows: s.itemRows.ids.length, itemRowViolations: s.itemRows.violations.map((v) => v.why), restates: s.invented.restates, asks: s.invented.asks,
      asksScope: s.invented.asksScope.length, overlapReads: s.invented.overlapReads,
      esPresent: s.enforcerScope.authLeg.present, esForm: s.enforcerScope.authLeg.form, esOptionsExact: s.enforcerScope.authLeg.optionsExact, esOption: s.enforcerScope.authLeg.option,
      esNonAuth: Object.values(s.enforcerScope.nonAuth).every(Boolean), partHits: s.enforcerScope.partHits.length, partHitsInOwnerQuote: s.enforcerScope.partHitsInOwnerQuote.length,
      sealedMatch: s.enforcerScope.sealedMatch, laItem22: s.enforcerScope.laItem22,
      emptyCites: s.empty.citingLines > 0, emptyNoChange: s.empty.noChange, denyAllOnEmpty: s.empty.denyAllOnEmpty_READ.length, absentValueLine: s.empty.absentValueLine,
      premiseArm: s.premise.contradictionArm, premiseCheck: s.premise.citationsCheck, actsOnContradiction: s.premise.actsOnContradiction_READ.length,
      collProxyExact: s.collateral.proxySetExact, collK8sOnly: s.collateral.kubernetesOnly, collBucketAsserts: s.collateral.bucketAsserts, z49Stanza: s.z49Stanza,
      nwCoverage: nw.coverageAuthorActionable, nwCitations: nw.citationFindings, nwClauses: nw.clausesDropped, nwLint: nw.lintHits,
    };
    for (const [k, v] of Object.entries(c.expect)) if (JSON.stringify(got[k]) !== JSON.stringify(v)) mismatches.push(`${c.name} ${k}: expected ${JSON.stringify(v)}, scorer ${JSON.stringify(got[k])}`);
    rows.push(`| ${c.name} | ${s.itemRows.ids.length}/${s.itemRows.violations.length} | ${s.invented.restates}/${s.invented.asks} | ${s.enforcerScope.authLeg.form ?? '—'}:${s.enforcerScope.authLeg.option ?? '—'} | parts ${s.enforcerScope.partHits.length}+${s.enforcerScope.partHitsInOwnerQuote.length}q | empty ${s.empty.citingLines}/${s.empty.noChange ? 'nc' : '—'} | premise ${s.premise.contradictionArm ? 'arm' : '—'} | coll ${s.collateral.form ?? '—'} | nw ${nw.coverageAuthorActionable}·${nw.citationFindings}·${nw.clausesDropped}·${nw.lintHits} |`);
  }
  return { rows, mismatches };
}

// ───────────────────────────── P8 dump ─────────────────────────────

/** G-NOWORSE findings (changed classes removed) for the stored drafts + the three persisted nodes, under ONE check-data
 *  commit, from THIS tree's code. Run in both trees; the two files must be identical (LAB-PREREG P8). */
export function g4NoWorseDump(expDir: string, checkAt: string): Record<string, ReturnType<typeof noWorseFindings>> {
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const repo = path.resolve(__dirname, '..', '..');
  const work = path.join(repo, '.claude', 'skills', 'requirements-spec', 'work');
  const out: Record<string, ReturnType<typeof noWorseFindings>> = {};
  useCheckDataAt(checkAt);
  try {
    for (const run of fs.readdirSync(work).filter((d) => fs.statSync(path.join(work, d)).isDirectory()).sort()) {
      for (const d of fs.readdirSync(path.join(work, run)).filter((x) => x.startsWith('draft-')).sort()) {
        const rp = path.join(work, run, d, 'report.md'); if (!fs.existsSync(rp)) continue;
        const objF = path.join(work, run, /zero/.test(d) ? 'objective-zero.txt' : 'objective-answered.txt');
        const objective = fs.existsSync(objF) ? fs.readFileSync(objF, 'utf8') : '';
        out[`${run}/${d}`] = noWorseFindings(fs.readFileSync(rp, 'utf8'), { objective, objectiveResolved: true, harnessTaskId: null, ownerMap: null, ownerMapState: 'absent' } as any);
      }
    }
    for (const nd of exp.nodes) {
      const { snap, inputs } = nodeContext(expDir, exp, nd.id);
      out[`node/${nd.id}`] = noWorseFindings(parsedResult(snap.author)!.finalResponse, inputs);
    }
  } finally { useCheckDataAt(null); }
  return out;
}

// ───────────────────────────── a run ─────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
/** A refusal whose every blocking item is the stubbed-tool artifact (LAB-PREREG D6) counts as an approval, subcounted. */
const STUB = /objective of record|could not (fetch|retrieve|read) the objective|no objective (of record|available|returned)|unverifiable.{0,40}objective/i;

export function g4ScoreRun(runDirs: string[], expDir: string) {
  requireG4Classifier();
  const exp = JSON.parse(fs.readFileSync(path.join(expDir, 'experiment.json'), 'utf8'));
  const tol = exp.g4?.noWorseTolerance; if (!tol) throw new Error('experiment.json carries no g4.noWorseTolerance');
  const { sealed, sha256: sealedSha, matches } = loadSealed(expDir, exp);
  if (!matches) throw new Error(`sealed file sha256 ${sealedSha} != experiment.json g4.sealedSha256 ${exp.g4.sealedSha256} (P11)`);
  const samples: any[] = [];
  for (const runDir of runDirs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
    for (const node of Object.keys(manifest.nodes)) {
      const { nd, inputs, cfg } = nodeContext(expDir, exp, node);
      const ndir = path.join(runDir, node);
      for (const v of fs.readdirSync(ndir).filter((d) => fs.statSync(path.join(ndir, d)).isDirectory())) {
        useCheckDataAt(exp.variants?.[v]?.requirementsCheckAt ?? null);
        try {
          for (const sd of fs.readdirSync(path.join(ndir, v)).filter((d) => d.startsWith('sample-')).sort()) {
            const dir = path.join(ndir, v, sd);
            const s = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
            const ap = path.join(dir, 'author.md');
            if (s.error || !fs.existsSync(ap)) { samples.push({ node, variant: v, sample: sd, error: s.error ?? 'no author.md' }); continue; }
            const text = fs.readFileSync(ap, 'utf8');
            const pre = fs.existsSync(path.join(dir, 'author.pre-correction.md')) ? fs.readFileSync(path.join(dir, 'author.pre-correction.md'), 'utf8') : null;
            const g = scoreG4(text, cfg, inputs.objective, inputs.ownerMap, sealed, nd.id);
            const gPre = pre ? scoreG4(pre, cfg, inputs.objective, inputs.ownerMap, sealed, nd.id) : null;
            const blocking: string[] = s.verdict?.blocking ?? [];
            const stubOnly = s.verdict?.approved === false && blocking.length > 0 && blocking.every((b) => STUB.test(b));
            const corr = s.author?.requirementsFormCheck?.correction ?? null;
            samples.push({
              node, variant: v, sample: sd, error: null, g4: g, preCorrection: gPre ? { itemRows: gPre.itemRows.ids.length, restates: gPre.invented.restates, asks: gPre.invented.asks } : null,
              noWorse: noWorseMeasures(text, inputs),
              reviewer: { approved: s.verdict?.approved ?? null, approvedCountingStub: s.verdict?.approved === true || stubOnly, stubOnly, blocking: blocking.length,
                blocksNamingItemRow_READ: blocking.filter((b) => /\.item-\d+/.test(b)).length, blocksNamingEmptyUpstream_READ: blocking.filter((b) => /empty[- ]upstream|inputs-empty/i.test(b)).length },
              correction: corr ? { attempted: !!corr.attempted, adopted: corr.attempted ? !!corr.adopted : null, adoptionArm: corr.adoptionArm ?? null, failingChecks: corr.failingChecks ?? [], notAttemptedReason: corr.notAttemptedReason ?? null, notAdoptedReason: corr.notAdoptedReason ?? null } : null,
              registrySha256: s.author?.requirementsFormCheck?.registrySha256 ?? null, templateSha256: s.author?.requirementsFormCheck?.templateSha256 ?? null,
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
    const cnt = (f: (x: any) => boolean) => ok.filter(f).length;
    return {
      node: c.node, variant: c.variant, n: c.samples.length, errors: c.samples.length - ok.length,
      itemRowViolationSamples: cnt((x) => x.g4.itemRows.violations.length > 0), itemRowsMean: mean(ok.map((x: any) => x.g4.itemRows.ids.length)),
      restatesZero: cnt((x) => x.g4.invented.restates === 0), asksZero: cnt((x) => x.g4.invented.asks === 0), overlapLe1: cnt((x) => x.g4.invented.overlapReads <= 1),
      asksScopeSamples: cnt((x) => x.g4.invented.asksScope.length > 0),
      esPresent: cnt((x) => x.g4.enforcerScope.authLeg.present), esOptionsExact: cnt((x) => x.g4.enforcerScope.authLeg.optionsExact),
      esDerivedOrForced: cnt((x) => ['derived', 'forced'].includes(x.g4.enforcerScope.authLeg.form)), esOpen: cnt((x) => x.g4.enforcerScope.authLeg.form === 'open'),
      esDeclared: cnt((x) => x.g4.enforcerScope.authLeg.form === 'declared'), esNonAuth: cnt((x) => Object.values(x.g4.enforcerScope.nonAuth).every(Boolean)),
      sealedMatch: cnt((x) => x.g4.enforcerScope.sealedMatch === true), laItem22: cnt((x) => x.g4.enforcerScope.laItem22 === true),
      partHitSamples: cnt((x) => x.g4.enforcerScope.partHits.length > 0), partHitsInOwnerQuote: cnt((x) => x.g4.enforcerScope.partHitsInOwnerQuote.length > 0),
      emptyBranch: cnt((x) => x.g4.empty.citingLines > 0 && x.g4.empty.noChange), anyEmptyBranch: cnt((x) => x.g4.empty.anyEmptyBranch),
      absentValueLine: cnt((x) => x.g4.empty.absentValueLine), denyAllOnEmpty_READ: cnt((x) => x.g4.empty.denyAllOnEmpty_READ.length > 0),
      premiseArm: cnt((x) => x.g4.premise.contradictionArm), premiseCheck: cnt((x) => x.g4.premise.citationsCheck === true), premisePU: cnt((x) => x.g4.premise.citesPrincipalUnseen),
      actsOnContradiction_READ: cnt((x) => x.g4.premise.actsOnContradiction_READ.length > 0),
      collProxyExact: cnt((x) => x.g4.collateral.proxySetExact), collK8sOnly: cnt((x) => x.g4.collateral.kubernetesOnly), collOpen: cnt((x) => x.g4.collateral.form === 'open'),
      collBucketAsserts: cnt((x) => x.g4.collateral.bucketAsserts), z49Stanza: cnt((x) => x.g4.z49Stanza === true),
      mean: Object.fromEntries(['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits'].map((k) => [k, mean(ok.map((x: any) => x.noWorse[k]))])),
      viewMedian: median(ok.map((x: any) => x.noWorse.view ?? 0)), sizeWithAllowance: cnt((x) => x.noWorse.sizeWithAllowance),
      approved: cnt((x) => x.reviewer.approved === true), approvedCountingStub: cnt((x) => x.reviewer.approvedCountingStub), stubOnly: cnt((x) => x.reviewer.stubOnly),
      correction: { attempted: cnt((x) => x.correction?.attempted), adopted: cnt((x) => x.correction?.adopted) },
      registryShas: [...new Set(ok.map((x: any) => x.registrySha256))], templateShas: [...new Set(ok.map((x: any) => x.templateSha256))],
      costUsd: ok.reduce((t: number, x: any) => t + (x.costUsd ?? 0), 0), authorDurationMaxS: Math.round(Math.max(0, ...ok.map((x: any) => x.authorDurationMs ?? 0)) / 1000),
    };
  });
  const noWorse: any[] = [];
  for (const node of [...new Set(cellRows.map((r) => r.node))]) {
    const b = cellRows.find((r) => r.node === node && r.variant === 'base'); const g = cellRows.find((r) => r.node === node && r.variant === 'g4');
    if (!b || !g) continue;
    const d: Record<string, { delta: number; tol: number; ok: boolean }> = {};
    for (const k of ['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits']) { const delta = g.mean[k] - b.mean[k]; d[k] = { delta, tol: tol[k], ok: delta <= tol[k] + 1e-9 }; }
    d.viewMedian = { delta: g.viewMedian - b.viewMedian, tol: tol.viewMedianChars, ok: g.viewMedian - b.viewMedian <= tol.viewMedianChars };
    d.sizeWithAllowance = { delta: g.sizeWithAllowance - b.sizeWithAllowance, tol: -tol.sizePassDrop, ok: g.sizeWithAllowance >= b.sizeWithAllowance - tol.sizePassDrop };
    d.approvals = { delta: g.approvedCountingStub - b.approvedCountingStub, tol: -tol.approvalDrop, ok: g.approvedCountingStub >= b.approvedCountingStub - tol.approvalDrop };
    noWorse.push({ node, pass: Object.values(d).every((x) => x.ok), deltas: d });
  }
  // G-ITEM-SAFE 3: an owner item cited in EVERY base sample of a node and in NO g4 sample of it (a READ candidate).
  const deleted: Record<string, number[]> = {};
  for (const node of [...new Set(samples.map((s) => s.node))]) {
    const bs = samples.filter((s) => s.node === node && s.variant === 'base' && !s.error); const gs = samples.filter((s) => s.node === node && s.variant === 'g4' && !s.error);
    if (!bs.length || !gs.length) continue;
    const inAllBase = bs.map((s) => new Set<number>(s.g4.citedItems)).reduce((acc, x) => new Set([...acc].filter((i) => x.has(i))));
    deleted[node] = [...inAllBase].filter((i) => gs.every((s) => !s.g4.citedItems.includes(i)));
  }
  const md = [
    `# Group 4 scores — ${runDirs.map((r) => path.basename(r)).join(' + ')}`, '',
    'Proxies narrow the hand read; they are not the score (Protocol 16 rules 5–6). Row ids and item numbers only (blindness, LAB-PREREG rule 6).', '',
    `Sealed file sha256 ${sealedSha} (matches experiment.json).`, '',
    '| node | arm | n | item-row viol. samples | restates=0 | asks=0 | overlap≤1 | scope-asks | ES present | ES options exact | ES open/decl/der-forced | ES non-auth ok | sealed | LA item 22 | part hits (+owner-quote) | empty branch | any empty | §6 line | deny-all? | premise arm | premise ✓ | acts-on-contradiction? | coll proxy-exact | coll k8s-only | coll bucket-asserts | Z49 stanza |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...cellRows.map((r) => `| ${r.node} | ${r.variant} | ${r.n - r.errors}${r.errors ? ` (+${r.errors} err)` : ''} | ${r.itemRowViolationSamples} | ${r.restatesZero} | ${r.asksZero} | ${r.overlapLe1} | ${r.asksScopeSamples} | ${r.esPresent} | ${r.esOptionsExact} | ${r.esOpen}/${r.esDeclared}/${r.esDerivedOrForced} | ${r.esNonAuth} | ${r.sealedMatch} | ${r.laItem22} | ${r.partHitSamples} (+${r.partHitsInOwnerQuote}) | ${r.emptyBranch} | ${r.anyEmptyBranch} | ${r.absentValueLine} | ${r.denyAllOnEmpty_READ} | ${r.premiseArm} | ${r.premiseCheck} | ${r.actsOnContradiction_READ} | ${r.collProxyExact} | ${r.collK8sOnly} | ${r.collBucketAsserts} | ${r.z49Stanza} |`),
    '', '| node | arm | cov · cit · clauses · lint (means) | view med | size+allow | approved (counting stub-only; stub-only) | corr att/adopt | registry | template | $ total | author max s |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...cellRows.map((r) => `| ${r.node} | ${r.variant} | ${['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits'].map((k) => r.mean[k].toFixed(2)).join(' · ')} | ${r.viewMedian} | ${r.sizeWithAllowance} | ${r.approved} (${r.approvedCountingStub}; ${r.stubOnly}) | ${r.correction.attempted}/${r.correction.adopted} | ${(r.registryShas as Array<string | null>).map((x) => (x ?? '—').slice(0, 12)).join(',')} | ${(r.templateShas as Array<string | null>).map((x) => (x ?? '—').slice(0, 12)).join(',')} | ${r.costUsd.toFixed(2)} | ${r.authorDurationMaxS} |`),
    '', '## G-NOWORSE (g4 − base, per node; one instrument, changed classes removed)', '',
    '| node | pass | coverage | citations | clauses | lint | view median | size+allow passes | approvals |', '|---|---|---|---|---|---|---|---|---|',
    ...noWorse.map((n) => `| ${n.node} | **${n.pass ? 'PASS' : 'MISS'}** | ${['coverageAuthorActionable', 'citationFindings', 'clausesDropped', 'lintHits', 'viewMedian', 'sizeWithAllowance', 'approvals'].map((k) => `${n.deltas[k].delta >= 0 ? '+' : ''}${Number(n.deltas[k].delta.toFixed(2))} (tol ${n.deltas[k].tol})${n.deltas[k].ok ? '' : ' ✗'}`).join(' | ')} |`),
    '', `Owner items cited in every base sample and in no g4 sample (G-ITEM-SAFE 3 READ candidates): ${Object.entries(deleted).map(([k, v]) => `${k}: ${v.join(', ') || 'none'}`).join(' · ') || 'n/a (one arm only)'}`,
  ];
  return { samples, cells: cellRows, noWorse, deleted, md };
}
