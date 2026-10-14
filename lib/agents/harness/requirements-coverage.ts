/**
 * Requirements COVERAGE check — TypeScript port of scripts/check-requirements-coverage.py (2026-10-09).
 *
 * The Python script is the operator/skill tool and the rule source; this port is the in-run copy. They are held
 * together by scripts/test-requirements-form-check-parity.ts, which requires IDENTICAL `{errors, read, stats}` over
 * the trial drafts, every published spec and the Python suite's fixtures. Read the Python file's docstring for what
 * each rule is and which Reviewer check (8.1 / 8.2 / 8.3 / 8.6) it makes mechanical; the comments here only mark
 * where a JS idiom would have changed the meaning.
 *
 * PURE: text + registry in, findings out. The registry comes from requirements-form-check.generated.ts (a generated
 * constant, drift-pinned against DESIGN-DECISION-QUESTIONS.md), never from the filesystem at run time.
 */
import { pyFinditer, pyLstrip, pyMatch, pyRe, pySearch, pyStrip, cpSlice, reEscape } from './requirements-pysem';

export const LEG_TOKENS = ['network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config'] as const;
const FORCE_ELIGIBLE = ['target-absent', 'inputs-empty'];
const TIER_FOR: Record<string, string> = { open: 'blocking', derived: 'confirm', forced: 'default' };
const OWNER_LINE = pyRe('^\\s*(?:[-*]\\s+)?`?([a-z0-9][a-z0-9-]*(?:\\.[a-z0-9][a-z0-9-]*)+)`?\\s*—(.*)$');
const TIER_RE = pyRe('\\btier:\\s*`?(blocking|confirm|default|not-applicable)\\b`?');
/** B-2 item row `<token>.item-<N>` (a letter suffix: two decisions from one item) and the declared leading citation
 *  (the clause scorer's LEAD_CITE, declared only). */
const ITEM_KEY = pyRe('^item-(\\d+)[a-z]?$');
const LEAD_ITEM = pyRe('^[(*\\s]*declared\\s+—\\s+items?\\s+(\\d+)', { i: true });
const ROW_ID = pyRe('^[a-z0-9][a-z0-9-]*(\\.[a-z0-9][a-z0-9-]*)+$');
const CLASS_CRITERION: Record<string, string> = {
  producer: 'the leg derives no value another leg consumes',
  auth: 'the leg neither grants nor removes access on its target (no sender/principal is allowed, denied, '
    + 'admitted or restricted, and no chained value lands in a source/allow/admit/policy/selector field)',
  routing: 'the leg adds no advertised covering route and suppresses, filters, withdraws or replaces no routes',
};

/** The parsed REGISTRY-TABLE: `{class: [keys]}` for the leg-scoped classes + the options cell per key (last row wins). */
export interface RequirementsRegistry {
  classes: Record<string, string[]>;
  /** [key, options cell] in first-insertion order; a later row with the same key overwrites the cell (Python dict). */
  options: Array<[string, string]>;
}

/** Port of `load_registry` — used by the generator and the drift test, never on the hot path. */
export function parseRegistry(text: string): RequirementsRegistry {
  const start = text.indexOf('REGISTRY-TABLE');
  if (start < 0) throw new Error('registry parse failed: no REGISTRY-TABLE marker');
  const classes: Record<string, string[]> = {};
  const options = new Map<string, string>();
  let any = false;
  const rowRe = pyRe('^\\|\\s*`([^`]+)`\\s*\\|\\s*([a-z]+)\\s*\\|');
  for (const line of text.slice(start).split('\n')) {
    const m = pyMatch(rowRe, line);
    if (!m) {
      if (any && pyStrip(line) === '') break;
      continue;
    }
    const rid = m[1], cls = m[2];
    const cells = pyStrip(pyStrip(line), '|').split('|').map(c => pyStrip(c));
    if (cells.length >= 4) {
      const parts = rid.split('.');
      options.set(cls === 'gate' ? parts[parts.length - 1] : rid.slice(rid.indexOf('.') + 1), cells[3]);
      any = true;
    }
    if (cls === 'gate') continue;
    (classes[cls] ||= []).push(rid.slice(rid.indexOf('.') + 1));
    any = true;
  }
  if (!classes.leg || !classes.auth || options.size === 0) {
    throw new Error(`registry parse failed (classes found: ${Object.keys(classes).sort().join(', ')})`);
  }
  return { classes, options: Array.from(options.entries()) };
}

export type CoverageFinding = Record<string, string | string[] | number>;
export interface CoverageStats {
  legs: string[]; gates: string[]; rows: number;
  forms: { declared: number; derived: number; forced: number; open: number; other: number };
  owner_block: 'none' | number; not_applicable: number;
}
export interface CoverageResult { errors: CoverageFinding[]; read: CoverageFinding[]; stats: CoverageStats | Record<string, never> }

/** Port of `section(text, heading_re)` (re.M). Returns the body after the heading line up to the next `## `. */
export function mdSection(text: string, headingRe: RegExp): string | null {
  const m = pySearch(headingRe, text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const n = pySearch(NEXT_H2, rest);
  return n ? rest.slice(0, n.index) : rest;
}
const NEXT_H2 = pyRe('^## ', { m: true });
export const DD_HEADING = pyRe('^## Design decisions\\b.*$', { m: true });
export const OWNER_HEADING = pyRe('^## Decisions needed from the owner\\b.*$', { m: true });

export type SourceForm = 'declared' | 'derived' | 'forced' | 'open' | 'other';
const SF = {
  declared: pyRe('^\\(\\s*declared\\b', { i: true }),
  derived: pyRe('^\\(\\s*derived\\b', { i: true }),
  forced: pyRe('^\\(\\s*forced\\b', { i: true }),
  open: pyRe('^OPEN\\b'),
};
export function sourceForm(cell: string): SourceForm {
  const c = pyStrip(pyStrip(pyStrip(cell), '*'));
  if (pyMatch(SF.declared, c)) return 'declared';
  if (pyMatch(SF.derived, c)) return 'derived';
  if (pyMatch(SF.forced, c)) return 'forced';
  if (pyMatch(SF.open, c)) return 'open';
  return 'other';
}

export interface TableRow { id: string; source: string; form: SourceForm; options: string | null }
export function parseTableRows(dd: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of dd.split('\n')) {
    if (!pyLstrip(line).startsWith('|')) continue;
    const cells = pyStrip(pyStrip(line), '|').split('|').map(c => pyStrip(c));
    const rid = pyStrip(pyStrip(cells[0], '`'));
    if (!pyMatch(ROW_ID, rid)) continue;
    const src = cells[cells.length - 1];
    rows.push({ id: rid, source: src, form: sourceForm(src), options: cells.length >= 5 ? cells[2] : null });
  }
  return rows;
}
export interface OwnerLine { id: string; tier: string | null; reason: string; line: string }
const NONE_RE = pyRe('^\\*?none\\b', { i: true });
export function parseOwnerBlock(ob: string | null): { lines: OwnerLine[] | null; isNone: boolean } {
  if (ob === null) return { lines: null, isNone: false };
  if (pyMatch(NONE_RE, pyStrip(ob))) return { lines: [], isNone: true };
  const out: OwnerLine[] = [];
  for (const line of ob.split('\n')) {
    const m = pyMatch(OWNER_LINE, line);
    if (!m) continue;
    const t = pySearch(TIER_RE, m[2]);
    const reason = t ? pyStrip(m[2].slice(t.index + t[0].length), ' —-') : '';
    out.push({ id: m[1], tier: t ? t[1] : null, reason, line: pyStrip(line) });
  }
  return { lines: out, isNone: false };
}

function opt(reg: RequirementsRegistry, key: string | null): string | undefined {
  if (key === null) return undefined;
  for (const [k, v] of reg.options) if (k === key) return v;
  return undefined;
}

const OPT_HEAD = pyRe('\\s*\\(.*\\)\\s*$');
function head(x: string): string {
  const s = pyStrip(pyStrip(pyStrip(x), '`'));
  const m = pySearch(OPT_HEAD, s);
  return m ? s.slice(0, m.index) + s.slice(m.index + m[0].length) : s;
}
function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Port of `check(draft_text, registry)`. */
export function checkCoverage(draftText: string, registry: RequirementsRegistry): CoverageResult {
  const errors: CoverageFinding[] = [], read: CoverageFinding[] = [];
  const dd = mdSection(draftText, DD_HEADING);
  const ob = mdSection(draftText, OWNER_HEADING);
  if (dd === null) return { errors: [{ what: 'no "## Design decisions" section' }], read: [], stats: {} };
  const rows = parseTableRows(dd);
  let { lines: owner, isNone: ownerNone } = parseOwnerBlock(ob);
  if (owner === null) {
    errors.push({ what: 'no "## Decisions needed from the owner" section' });
    owner = [];
  }

  const byId = new Map<string, TableRow>();
  for (const r of rows) {
    if (byId.has(r.id)) errors.push({ what: 'duplicate row', id: r.id });
    byId.set(r.id, r);
  }
  const na = new Map<string, OwnerLine>();
  for (const o of owner) if (o.tier === 'not-applicable') na.set(o.id, o);

  const cls = registry.classes;
  const legKeys = new Set<string>(['leg', 'producer', 'auth', 'routing'].flatMap(c => cls[c] || []));
  const legs = new Set<string>(), gates = new Set<string>();
  for (const rid of [...byId.keys(), ...na.keys()]) {
    const parts = rid.split('.');
    if (parts[0] === 'approver' && parts.length === 2) gates.add(parts[1]);
    else if (parts[0] === 'gate' && parts.length === 3 && parts[2] === 'position') gates.add(parts[1]);
    else if ((LEG_TOKENS as readonly string[]).includes(parts[0]) && parts.length === 2) {
      legs.add(parts[0]);
      const item = pyMatch(ITEM_KEY, parts[1]);
      const r = byId.get(rid);
      if (item) {
        if (r === undefined) errors.push({ what: 'item row listed not-applicable', id: rid });   // item rows are never deleted
        else {
          const lead = pyMatch(LEAD_ITEM, pyStrip(r.source));
          if (r.form !== 'declared') errors.push({ what: 'item row is not declared', id: rid, form: r.form });
          else if (!lead || parseInt(lead[1], 10) !== parseInt(item[1], 10)) errors.push({ what: 'item row cites another item', id: rid });
          if (!['—', ''].includes(cpSlice(pyStrip(pyStrip(pyStrip(r.options || ''), '`*')), 1))) errors.push({ what: 'item row options are not "—"', id: rid });
        }
      } else if (!legKeys.has(parts[1])) {
        // B-2 / R2 (2026-10-12): an invented key is sorted mechanically — mirrors check-requirements-coverage.py.
        const lead = r !== undefined && r.form === 'declared' ? pyMatch(LEAD_ITEM, pyStrip(r.source)) : null;
        if (lead) errors.push({ what: `invented key restates item ${lead[1]} — key it ${parts[0]}.item-${lead[1]}`, id: rid });
        else errors.push({ what: 'invented key asks a decision no key or item asks (owner decision; registry candidate)', id: rid });
      }
    } else errors.push({ what: 'row keyed on an unknown token or shape', id: rid });
  }
  // An item row for an item a registry row of the same leg also cites: a READ. (Since adoption rule 4, Z66, deleting it
  // is refused only when the registry row's quote does not cover the same item words — READ vs ERROR is register Z68.)
  const regCites = new Map<string, string[]>();
  for (const [rid, r] of byId) {
    const parts = rid.split('.');
    if ((LEG_TOKENS as readonly string[]).includes(parts[0]) && parts.length === 2 && legKeys.has(parts[1]) && r.form === 'declared') {
      const lead = pyMatch(LEAD_ITEM, pyStrip(r.source));
      if (lead) {
        const k = `${parts[0]} ${parseInt(lead[1], 10)}`;
        if (!regCites.has(k)) regCites.set(k, []);
        regCites.get(k)!.push(rid);
      }
    }
  }
  for (const rid of byId.keys()) {
    const parts = rid.split('.');
    const item = (LEG_TOKENS as readonly string[]).includes(parts[0]) && parts.length === 2 ? pyMatch(ITEM_KEY, parts[1]) : null;
    const k = item ? `${parts[0]} ${parseInt(item[1], 10)}` : '';
    if (item && regCites.has(k)) {
      read.push({ what: 'item row for an item a registry row of that leg also cites — confirm it records a decision that row does not', id: rid, rows: regCites.get(k)! });
    }
  }
  for (const t of LEG_TOKENS) {
    const re = pyRe(`^## Pipeline \\d+ objective\\b.*\\b${reEscape(t)}\\b`, { m: true, i: true });
    if (pySearch(re, draftText)) legs.add(t);
  }

  const accounted = (rid: string) => byId.has(rid) || na.has(rid);
  const absent = new Map<string, string[]>();
  for (const leg of [...legs].sort()) {
    if (!accounted(`${leg}.target`)) errors.push({ what: 'missing row', leg, key: 'target' });
    for (const c of ['producer', 'auth', 'routing']) {
      const keys = cls[c] || [];
      const have = keys.filter(k => accounted(`${leg}.${k}`));
      if (have.length === 0) {
        if (!absent.has(c)) absent.set(c, []);
        absent.get(c)!.push(leg);
        continue;
      }
      for (const k of keys) if (!accounted(`${leg}.${k}`)) errors.push({ what: `missing ${c} row`, leg, key: k });
      if (c === 'auth') {
        const real = keys.filter(k => byId.has(`${leg}.${k}`));
        let deleted = keys.filter(k => na.has(`${leg}.${k}`));
        // Z49 (2026-10-10): `request-path` is asked only when `admitted-principal` admits by address. It may be listed
        // not-applicable ONLY when the leg's admitted-principal row is DECLARED and its source names no address and no
        // combination (an OPEN or derived principal still requires the question). Mirrors check-requirements-coverage.py.
        const ap = byId.get(`${leg}.admitted-principal`);
        if (deleted.includes('request-path') && ap && ap.form === 'declared' && !/address|combination/i.test(ap.source)) {
          deleted = deleted.filter(k => k !== 'request-path');
        }
        if (real.length && deleted.length) {
          errors.push({ what: 'authorisation leg lists authorisation rows not-applicable (8.1: deleting ANY is blocking)', leg, keys: deleted });
        }
      }
    }
    const isRouting = (cls.routing || []).some(k => byId.has(`${leg}.${k}`));
    if (isRouting && na.has(`${leg}.must-stay-reachable`)) errors.push({ what: 'must-stay-reachable is never deleted on a routing leg', leg });
  }

  for (const c of ['producer', 'auth', 'routing']) {
    const l = absent.get(c);
    if (l && l.length) read.push({ what: `no ${c} rows — confirm for each leg: ${CLASS_CRITERION[c]}`, legs: l });
  }
  for (const g of [...gates].sort()) {
    if (!accounted(`approver.${g}`)) errors.push({ what: 'gate without approver row', gate: g });
    if (!g.includes('plan') && !accounted(`gate.${g}.position`)) errors.push({ what: 'non-plan gate without position row', gate: g });
  }
  if (![...gates].some(g => g.includes('plan'))) errors.push({ what: 'no program plan gate approver row (approver.<…plan…>)' });

  for (const r of rows) {
    const parts = r.id.split('.');
    const key = parts[0] === 'gate' ? parts[parts.length - 1] : (parts.length === 2 ? parts[1] : null);
    const reg = opt(registry, key);
    const got = pyStrip(pyStrip(pyStrip(r.options || ''), '`*'));
    if (reg === undefined || r.options === null || reg.startsWith('per enforcer')) continue;
    if (reg.startsWith('—')) {
      if (!got.startsWith('—')) errors.push({ what: 'options cell differs from the registry', id: r.id, registry: reg, got: cpSlice(got, 80) });
    } else {
      const want = new Set(reg.split('·').map(head));
      const have = new Set(got.split('·').map(head));
      if (!setEq(want, have)) errors.push({ what: 'options cell differs from the registry', id: r.id, registry: reg, got: cpSlice(got, 80) });
    }
  }

  for (const r of rows) {
    if (r.form === 'other') errors.push({ what: 'source is not one of the four forms', id: r.id, source: cpSlice(r.source, 120) });
    if (r.form === 'forced' && !FORCE_ELIGIBLE.includes(r.id.split('.').pop()!)) errors.push({ what: 'forced on an ineligible key (8.3)', id: r.id });
  }

  // 8.6 — owner block vs table, as sets, with tiers
  const expected = new Map<string, string>();
  for (const r of rows) if (r.form in TIER_FOR) expected.set(r.id, TIER_FOR[r.form]);
  const got = new Map<string, string | null>();
  for (const o of owner) if (o.tier !== 'not-applicable') got.set(o.id, o.tier);
  if (ownerNone && expected.size) errors.push({ what: 'owner block reads "none" but the table has non-declared rows', ids: [...expected.keys()].sort() });
  for (const [rid, tier] of expected) {
    if (!got.has(rid) && !ownerNone) errors.push({ what: 'non-declared row missing from the owner block', id: rid, expected_tier: tier });
    else if (got.has(rid) && got.get(rid) !== tier) errors.push({ what: 'wrong tier in owner block', id: rid, expected: tier, got: got.get(rid) as string });
  }
  for (const rid of got.keys()) {
    if (!expected.has(rid)) {
      if (byId.has(rid) && byId.get(rid)!.form === 'other') continue;
      const why = byId.has(rid) ? 'declared in the table' : 'no such row in the table';
      errors.push({ what: `owner-block line not owed (${why})`, id: rid });
    }
  }
  for (const [rid, o] of na) {
    if (byId.has(rid)) errors.push({ what: 'row is both in the table and listed not-applicable', id: rid });
    read.push({ what: 'not-applicable — read the reason (a reason stating today\'s state is a defect)', id: rid, line: cpSlice(o.line, 200) });
  }

  const forms = { declared: 0, derived: 0, forced: 0, open: 0, other: 0 };
  for (const r of rows) forms[r.form]++;
  return {
    errors, read,
    stats: { legs: [...legs].sort(), gates: [...gates].sort(), rows: rows.length, forms, owner_block: ownerNone ? 'none' : owner.length, not_applicable: na.size },
  };
}

/** Exported for the fact's section attribution: every `## ` heading line index → its title. */
export function h2Spans(text: string): Array<{ title: string; start: number; end: number }> {
  const heads = pyFinditer(pyRe('^## (.*)$', { m: true }), text);
  return heads.map((h, i) => ({ title: h[1], start: h.index, end: i + 1 < heads.length ? heads[i + 1].index : text.length }));
}
