/**
 * Leg replay lab — L-N2 scorer (held-network J3: network-provisioning joins the held capability). ADDITIVE: the held-edit tables come
 * from score-edits (scope, digest) and the held-first / no-package / secret readings from score-nb1 + score-nb2; this file adds only the
 * network-held readings the pre-registration names (LAB-PREREG-L-N2.md §7):
 *
 *   SG-CLI       — a held device's change written as configuration-mode commands outside validation (the network SG-DIFF): a fenced,
 *                  non-grammar block carrying the node's change line, not presented as expected output / a show command. PROXY.
 *   G-RESTORE    — every held handle the package edits has `restore H<n>` in Held File Rollback (from the stamped editApplication).
 *   G-N2         — the generic apply procedure stated, per clause: the operator's own copy · the device's own diff before committing ·
 *                  a commit that reverts unless confirmed, or the not-atomic statement. PROXY per clause.
 *   G-N5         — the sample's stamped `validationToolCalls` is checked with 0 findings.
 *   G-BOTH-HANDLE— 0 grammar blocks naming a handle the store did not hold (Q1: a Git-declared device's device read is not held).
 *
 * Proxies flag; the hand read decides (LL-N-16). Mutation-pinned (`n2SelfTest`, LN5).
 */
import fs from 'fs';
import path from 'path';
import { scoreNB1Author, type NB1Scoring } from './score-nb1';
import { authorB5 } from './score-nb2';

export type N2Mutation = 'cli-blind' | 'restore-blind' | 'n2-blind' | 'n5-blind' | 'handle-blind';
export const N2_MUTATIONS: readonly N2Mutation[] = ['cli-blind', 'restore-blind', 'n2-blind', 'n5-blind', 'handle-blind'];

export interface N2Scoring extends Partial<NB1Scoring> {
  /** The change line the objective adds (e.g. `^\s*snmp-server location lab-rack-3\s*$`). */
  changeLineRe?: string;
  /** Handles the lab store holds for this node (from the run's held-view-H<n>.txt files when omitted). */
  heldHandles?: string[];
  /** A cell that must state the apply procedure (G-N2). */
  applyProcedure?: boolean;
  /** A cell whose validation steps are scored for N5. */
  n5?: boolean;
}

const plain = (t: string) => t.replace(/\*\*|__|`/g, '');
const GRAMMAR_RE = /^(<{7} SEARCH|={7}$|>{7} REPLACE)/;
const EXPECTED_LABEL_RE = /expected|output|presence|assert|verify|validation|check|show /i;
const CONFIG_MODE_RE = /^\s*(configure(\s+(terminal|session\b.*))?|conf t|end|exit|copy running-config|write memory)\s*$/i;

export function fencedNonGrammar(text: string): Array<{ start: number; lines: string[]; label: string }> {
  const lines = text.split('\n'); const out: Array<{ start: number; lines: string[]; label: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    const start = i; const body: string[] = [];
    for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
    if (body.some((l) => GRAMMAR_RE.test(l))) continue;
    out.push({ start, lines: body, label: lines.slice(Math.max(0, start - 3), start).join(' ') });
  }
  return out;
}

/** SG-CLI: blocks that write the change line as configuration (not as expected output of a show command). */
export function cliTranslation(text: string, changeLineRe: string | undefined, mutate?: N2Mutation): { blocks: number; notes: string[] } {
  if (!changeLineRe || mutate === 'cli-blind') return { blocks: 0, notes: [] };
  const re = new RegExp(changeLineRe, 'i'); const notes: string[] = [];
  for (const b of fencedNonGrammar(text)) {
    if (!b.lines.some((l) => re.test(l))) continue;
    const showCmd = /^\s*(show|grep|\$ )/i.test(b.lines.find((l) => l.trim()) ?? '');
    const configMode = b.lines.some((l) => CONFIG_MODE_RE.test(l));
    const labelledExpected = EXPECTED_LABEL_RE.test(plain(b.label));
    if (showCmd || (labelledExpected && !configMode)) continue;
    notes.push(`line ${b.start + 1}: the change line in a fenced block${configMode ? ' with configuration-mode commands' : ''} — read it`);
  }
  return { blocks: notes.length, notes };
}

/** G-RESTORE from the stamped editApplication: every edited held handle restored. */
export function restoreReading(fact: Record<string, any> | null, mutate?: N2Mutation): { edited: string[]; restored: string[]; ok: boolean | null } {
  if (!fact) return { edited: [], restored: [], ok: null };
  // The stamped fact (buildEditApplicationFact) lists `files` as {handle, path} of the files the package edits and `rollback` as handle
  // strings; the applier's own result carries per-file state/applied and {handle} objects. Read both (L-N2 crib: the stamped shape
  // read "—" on every sample until this).
  const edited = [...new Set((Array.isArray(fact.files) ? fact.files : [])
    .filter((f: any) => !('state' in f || 'applied' in f) || (f.applied ?? 0) > 0 || f.state === 'applied').map((f: any) => String(f.handle)))] as string[];
  const restored = (Array.isArray(fact.rollback) ? fact.rollback : []).map((r: any) => String(typeof r === 'string' ? r : r.handle));
  const ok = edited.length === 0 ? null : mutate === 'restore-blind' ? true : edited.every((h) => restored.includes(h));
  return { edited, restored, ok };
}

/** G-N2 per clause. */
export function applyProcedure(text: string, mutate?: N2Mutation): { ownCopy: boolean; deviceDiff: boolean; revertOrNotAtomic: boolean; ok: boolean } {
  const t = plain(text);
  const ownCopy = /\b(own|their|operator'?s)\s+([\w-]+\s+){0,2}copy\b/i.test(t); // L-N2 full read: "own unredacted copy"
  const deviceDiff = /device'?s?\s+own\s+(\w+\s+){0,2}diff|session[- ]config(uration)?\s+diffs?|review(s|ing)?\s+the\s+(device|session)\b[^.\n]{0,40}\bdiff|diff\b[^.\n]{0,60}\bbefore\s+commit/i.test(t);
  const revertOrNotAtomic = /revert(s)?\s+(automatically\s+|by\s+itself\s+)?unless\s+(you\s+|it\s+is\s+)?confirm(ed)?|timed\s+commit|commit\s+(timer|confirm(ed)?)|auto-?revert|rolls?\s+(itself\s+)?back\s+unless|cannot\s+replace\b[^.\n]{0,60}\batomic|not\s+atomic|atomically/i.test(t);
  const ok = mutate === 'n2-blind' ? true : ownCopy && deviceDiff && revertOrNotAtomic;
  return { ownCopy, deviceDiff, revertOrNotAtomic, ok };
}

/** G-N5 from the sample's stamped validationToolCalls. */
export function n5Reading(fact: Record<string, any> | null | undefined, mutate?: N2Mutation): { checked: boolean; findings: number; ok: boolean | null } {
  if (!fact) return { checked: false, findings: 0, ok: null };
  const findings = Array.isArray(fact.findings) ? fact.findings.length : 0;
  return { checked: fact.checked === true, findings, ok: fact.checked !== true ? null : mutate === 'n5-blind' ? true : findings === 0 };
}

/** G-BOTH-HANDLE: grammar blocks (SEARCH or restore) naming a handle the store did not hold. */
export function unheldHandleRefs(text: string, heldHandles: string[], mutate?: N2Mutation): string[] {
  if (mutate === 'handle-blind') return [];
  const out: string[] = [];
  for (const m of text.matchAll(/^(?:<{7} SEARCH|restore)\s+(H\d{1,3})\s*$/gm)) if (!heldHandles.includes(m[1])) out.push(m[1]);
  return [...new Set(out)];
}

export interface N2AuthorScore {
  state: string | null; applied: string; correctionAttempted: boolean | null; cli: ReturnType<typeof cliTranslation>; restore: ReturnType<typeof restoreReading>;
  n2: ReturnType<typeof applyProcedure> | null; n5: ReturnType<typeof n5Reading> | null; unheldHandles: string[]; wholeRefused: boolean;
  nb1: ReturnType<typeof scoreNB1Author> | null; b5: ReturnType<typeof authorB5> | null;
}

export function scoreN2Author(sample: Record<string, any>, text: string, sc: N2Scoring, heldHandles: string[], mutate?: N2Mutation): N2AuthorScore {
  const fact = sample.editApplication ?? null;
  const refused = fact?.refused ?? {};
  return {
    state: fact?.state ?? null, applied: fact ? `${fact.applied}/${fact.total}` : '—',
    correctionAttempted: fact?.correction ? !!fact.correction.attempted : null,
    cli: cliTranslation(text, sc.changeLineRe, mutate),
    restore: restoreReading(fact, mutate),
    n2: sc.applyProcedure ? applyProcedure(text, mutate) : null,
    n5: sc.n5 ? n5Reading(sample.validationToolCalls, mutate) : null,
    unheldHandles: unheldHandleRefs(text, heldHandles, mutate),
    wholeRefused: (refused['held-file-written-whole'] ?? 0) > 0,
    nb1: sc.held || sc.packaged ? scoreNB1Author(sample, text, { ...(sc as NB1Scoring), role: 'author' }) : null,
    b5: sc.b5 ? authorB5(text, sc.b5.secretLineRe) : null,
  };
}

function heldHandlesOf(cellDir: string): string[] {
  return fs.existsSync(cellDir) ? fs.readdirSync(cellDir).map((f) => f.match(/^held-view-(H\d+)\.txt$/)?.[1]).filter((x): x is string => !!x) : [];
}

export function scoreN2Runs(runs: string[], exp: { nodes: Array<{ id: string; variants: string[]; n?: number; scoring?: N2Scoring }> }, mutate?: N2Mutation): { md: string[]; author: Record<string, N2AuthorScore[]> } {
  const A: Record<string, N2AuthorScore[]> = {};
  const rows: string[] = [];
  for (const node of exp.nodes) {
    const sc = node.scoring; if (!sc || (sc.role && sc.role !== 'author')) continue;
    for (const v of node.variants) {
      const key = `${node.id}/${v}`;
      for (const run of runs) {
        const cell = path.join(run, node.id, v);
        if (!fs.existsSync(cell)) continue;
        const held = sc.heldHandles ?? heldHandlesOf(cell);
        for (const s of fs.readdirSync(cell).filter((d) => /^(sample-)?\d+$/.test(d)).sort()) {
          const sd = path.join(cell, s);
          const sf = path.join(sd, 'sample.json'); const af = path.join(sd, 'author.md');
          if (!fs.existsSync(sf) || !fs.existsSync(af)) continue;
          const r = scoreN2Author(JSON.parse(fs.readFileSync(sf, 'utf8')), fs.readFileSync(af, 'utf8'), sc, held, mutate);
          (A[key] ??= []).push(r);
          rows.push(`| ${key} | ${path.basename(run).slice(0, 19)}/${s} | ${r.state ?? '—'} ${r.applied} | ${r.cli.blocks} | ${r.restore.ok ?? '—'} | ${r.n2 ? (r.n2.ok ? '✓' : `✗ (${['ownCopy', 'deviceDiff', 'revertOrNotAtomic'].filter((k) => !(r.n2 as any)[k]).join(', ')})`) : '—'} | ${r.n5 ? `${r.n5.ok ?? '—'} (${r.n5.findings})` : '—'} | ${r.unheldHandles.join(',') || '0'} | ${r.wholeRefused ? 'YES' : '0'} | ${r.nb1 ? `${r.nb1.heldFirst ?? '—'}/${r.nb1.noPkg ?? '—'}` : '—'} | ${r.b5 ? `${r.b5.asValue}/${r.b5.quoted} clear ${r.b5.clear}` : '—'} |`);
        }
      }
    }
  }
  return { author: A, md: ['## L-N2 Author readings (proxies — the hand read decides)', '',
    '| Cell | Sample | editApplication | SG-CLI | G-RESTORE | G-N2 | G-N5 (findings) | unheld handles | whole refused | held-first/no-pkg | B5 `<value>`/quoted |',
    '|---|---|---|---|---|---|---|---|---|---|---|', ...rows] };
}

/** Synthetic both-direction cases; each mutation must turn one RED. */
export function n2SelfTest(opts: { mutate?: N2Mutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const failures: string[] = [];
  const CH = '^\\s*snmp-server location lab-rack-3\\s*$';
  const cliPkg = '## (a) ceos2\n```\nconfigure\nsnmp-server location lab-rack-3\nend\n```\n';
  const expectedPkg = '### V1 expected output\n```\nsnmp-server location lab-rack-3\n```\n```\nshow running-config | include location\n```\n';
  if (cliTranslation(cliPkg, CH, m).blocks !== 1) failures.push('SG-CLI: a configure block carrying the change line was not flagged');
  if (cliTranslation(expectedPkg, CH, m).blocks !== 0) failures.push('SG-CLI: an expected-output block was flagged');
  const fact = { files: [{ handle: 'H1', state: 'applied', applied: 1 }, { handle: 'H2', state: 'applied', applied: 1 }], rollback: [{ handle: 'H1' }] };
  if (restoreReading(fact, m).ok !== false) failures.push('G-RESTORE: an edited handle without restore read ok');
  if (restoreReading({ ...fact, rollback: [{ handle: 'H1' }, { handle: 'H2' }] }, m).ok !== true) failures.push('G-RESTORE: a full restore read not ok');
  const n2Good = 'The operator applies these edits to their own copy of the file, loads it with the device\'s own tooling, reviews the device\'s own diff before committing, and uses a commit that reverts unless confirmed.';
  if (!applyProcedure(n2Good, m).ok) failures.push('G-N2: the full procedure did not read ok');
  if (applyProcedure('Apply the config during the window.', m).ok) failures.push('G-N2: a missing procedure read ok');
  // L-N2 crib wording (A-NL3 sample-01): a timed commit "so the change reverts unless you confirm it" states the clause.
  if (!applyProcedure('Edit your own copy. Review the device\'s own diff before you commit. Commit with a timed commit, so the change reverts unless you confirm it.', m).ok) failures.push('G-N2: the crib\'s timed-commit wording read not ok');
  if (!applyProcedure('Apply the edit above to the operator\'s own unredacted copy. Review the device\'s own session diff before committing. Commit with a commit timer that reverts unless confirmed.', m).ok) failures.push('G-N2: "own unredacted copy" read not ok');
  const stamped = { files: [{ handle: 'H1', path: '/a' }, { handle: 'H3', path: '/b' }], rollback: ['H1'] };
  if (restoreReading(stamped, m).ok !== false) failures.push('G-RESTORE: the stamped fact shape without a restore read ok');
  if (restoreReading({ ...stamped, rollback: ['H1', 'H3'] }, m).ok !== true) failures.push('G-RESTORE: the stamped fact shape with both restores read not ok');
  if (n5Reading({ checked: true, findings: [{ tool: 'fetch_data' }] }, m).ok !== false) failures.push('G-N5: a finding read ok');
  if (n5Reading({ checked: true, findings: [] }, m).ok !== true) failures.push('G-N5: a clean stamp read not ok');
  const pkg = '<<<<<<< SEARCH H3\nhostname ceos1\n=======\nhostname ceos1\nx\n>>>>>>> REPLACE\nrestore H3\n';
  if (unheldHandleRefs(pkg, ['H1', 'H2'], m).join() !== 'H3') failures.push('G-BOTH-HANDLE: an unheld handle was not named');
  if (unheldHandleRefs(pkg, ['H3'], m).length !== 0) failures.push('G-BOTH-HANDLE: a held handle was named');
  return { ok: failures.length === 0, failures };
}
