/**
 * `planWitness` — the platform's check of a Terraform Author's `Plan witness` block (terraform-witness step-back, owner decisions
 * W1/W2 + the four CORPUS-W2-W4 refinements, 2026-11-18). PURE and import-free at runtime (type imports only), so the §6 render and
 * any client bundle can import it.
 *
 * Why it exists: lab L-CS-T showed agents PRODUCE the witness reliably (34 of 34 live Authors carry the stop sentence byte for byte)
 * and VERIFY it by eye unreliably (a Reviewer approved an altered stop sentence in 2 of 7 samples and a witness missing its attribute
 * in 1 of 5). Every one of those checks is decidable from bytes the platform holds, so the platform states them.
 *
 * Three parts:
 *   1. THE STOP SENTENCE — one constant per protocol version (`PLAN_WITNESS_STOP_SENTENCES`), imported by the seed, never retyped.
 *      `stopSentence: verbatim | altered | absent`. The held-edit carrier FORCES needs-revision on altered / absent (owner W1).
 *   2. THE KEY READ (`computePlanWitnessKeys`) — which attributes and map keys each applied held edit sets, read from the held file's
 *      view and the applier's hunks (the SHIPPING applier's output; no second edit parser). It runs in the pre-transaction held-edit
 *      step, where the file text is in memory, and its result is STAMPED on the fact (`edits`), so a replay needs no held blob.
 *      Each edit is `read` or `unreadable(<closed reason>)` — never a guess. The reader tracks brackets from the top of the file; it
 *      does not infer structure from indentation.
 *   3. THE COMPARISON — `missing[]` (a name an edit sets or removes that the witness block does not contain), `missingResources[]`,
 *      `wholeValueKeys[]` (an unchanged sibling key the block gives a value for), `realigned[]` (lines whose only change is spacing).
 *      FACTS for the Reviewer. Nothing here is forced: the corpus is 6 HCL shapes on a 54-line estate (CORPUS-W2-W4.md).
 *
 * `missing: []` never reads as complete while an edit is unreadable: `listsCover` says which edits the lists cover, and the render
 * says so in words.
 *
 * VERSION-KEYED on the persisting execution's own `protocolInjection.delta`: terraform-iac ≥ 1.17.0. Below it — every stored leg —
 * the net returns NOT_STAMPED and nothing here runs.
 */
import type { EditApplication, HeldFileInput } from './held-bytes/apply';

export const PLAN_WITNESS_VERSION = 1 as const;
export const PLAN_WITNESS_READER = 'paichart.hcl-keys/1';
export const PLAN_WITNESS_HEADING = 'Plan witness';

import { TERRAFORM_PROTOCOL, canonical, PLAN_WITNESS_STOP_SENTENCES, planWitnessStopSentenceFor } from './plan-witness-stop-sentence';
export { PLAN_WITNESS_STOP_SENTENCES, planWitnessStopSentenceFor };

type Semver = [number, number, number];
const semver = (v: unknown): Semver | null => {
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a: Semver, b: Semver) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/** The sentence entry for a protocol at a version: the greatest released entry ≤ that version, or null (no witness at that version). */
export function planWitnessSentenceEntry(protocol: unknown, version: unknown): { protocol: string; sentenceVersion: string; sentence: string } | null {
  if (typeof protocol !== 'string' || !protocol) return null;
  const name = canonical(protocol);
  const table = Object.prototype.hasOwnProperty.call(PLAN_WITNESS_STOP_SENTENCES, name) ? PLAN_WITNESS_STOP_SENTENCES[name] : null;
  const have = semver(version);
  if (!table || !have) return null;
  let best: string | null = null;
  for (const v of Object.keys(table)) {
    const s = semver(v);
    if (s && cmp(s, have) <= 0 && (best === null || cmp(s, semver(best) as Semver) > 0)) best = v;
  }
  return best ? { protocol: name, sentenceVersion: best, sentence: table[best] } : null;
}

/** Does this protocol (short or `-protocol` form) have a stop sentence at any version? The carrier's cheap population test. */
export function planWitnessProtocolHasSentence(protocol: unknown): boolean {
  return typeof protocol === 'string' && protocol !== '' && Object.prototype.hasOwnProperty.call(PLAN_WITNESS_STOP_SENTENCES, canonical(protocol));
}

/** The entry for an execution's own stamped `protocolInjection` (`delta {name, version}`), or null — a population answer. */
export function planWitnessApplies(protocolInjection: unknown): ReturnType<typeof planWitnessSentenceEntry> {
  const pi = protocolInjection && typeof protocolInjection === 'object' ? (protocolInjection as Record<string, unknown>) : null;
  const delta = pi && pi.delta && typeof pi.delta === 'object' ? (pi.delta as Record<string, unknown>) : null;
  if (!delta) return null;
  return planWitnessSentenceEntry(delta.name, delta.version);
}

// ── 1. the stop sentence ─────────────────────────────────────────────────────────────────────────────────────────────

export type StopSentenceState = 'verbatim' | 'altered' | 'absent';

/**
 * WHAT IS NORMALISED before the comparison, on both sides, and nothing else:
 *   (a) a Markdown blockquote marker (`>` and one optional space) at the start of a line is dropped;
 *   (b) the Markdown emphasis characters `*` and `_` are dropped (the sentence contains neither);
 *   (c) every run of whitespace, line breaks included, becomes one space.
 * Letters, digits, punctuation, dashes and apostrophes are compared exactly: a missing or changed word, or a hyphen in place of the
 * em dash, is `altered`.
 */
export function normaliseForStopSentence(text: string): string {
  return text.replace(/^[ \t]*(?:>[ \t]?)+/gm, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
}

/** How many leading words identify "a sentence that begins like the stop sentence" (the `altered` anchor). */
export const STOP_SENTENCE_ANCHOR_WORDS = 6;

export function stopSentenceState(text: string, sentence: string): { state: StopSentenceState; form?: 'byte-exact' | 'normalised' } {
  if (text.includes(sentence)) return { state: 'verbatim', form: 'byte-exact' };
  const t = normaliseForStopSentence(text); const s = normaliseForStopSentence(sentence);
  if (t.includes(s)) return { state: 'verbatim', form: 'normalised' };
  const anchor = s.split(' ').slice(0, STOP_SENTENCE_ANCHOR_WORDS).join(' ');
  return { state: t.includes(anchor) ? 'altered' : 'absent' };
}

// ── the witness block ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The text under the `Plan witness` heading: an ATX heading whose title contains the words (to the next heading of the same or a
 * higher level), or a line that is only the bold words (to the next ATX heading or bold-only line). Null when there is none.
 */
export function planWitnessBlock(text: string): string | null {
  const lines = text.split('\n');
  const atx = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
  const boldOnly = /^[ \t]*(?:\*\*|__)[^*_]+(?:\*\*|__)[ \t]*:?[ \t]*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = atx.exec(lines[i]);
    if (m && m[2].toLowerCase().includes(PLAN_WITNESS_HEADING.toLowerCase())) {
      const level = m[1].length; let j = i + 1;
      for (; j < lines.length; j++) { const n = atx.exec(lines[j]); if (n && n[1].length <= level) break; }
      return lines.slice(i + 1, j).join('\n');
    }
    if (!m && boldOnly.test(lines[i]) && lines[i].toLowerCase().includes(PLAN_WITNESS_HEADING.toLowerCase())) {
      let j = i + 1;
      for (; j < lines.length; j++) if (atx.test(lines[j]) || boldOnly.test(lines[j])) break;
      return lines.slice(i + 1, j).join('\n');
    }
  }
  return null;
}

// ── 2. the key read ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Why an edit could not be read. CLOSED: a new reason is a deliberate addition with a fixture. */
export const PLAN_WITNESS_UNREADABLE_REASONS = [
  'edit-not-applied',        // the platform refused the edit block: there is no candidate to read
  'view-unavailable',        // no view of the held file reached the step
  'not-hcl-file',            // the held file is not a `.tf` file
  'block-comment',           // the file carries a `/* … */` comment (not tracked)
  'brackets-unbalanced',     // the bracket tracker lost its place before or inside the edit
  'edit-too-large',          // the edit is larger than the alignment budget
  'non-resource-block',      // a `variable`, `locals`, `module`, `provider`, `output`, `data`, `terraform` … block: its effect is on other resources
  'meta-argument',           // `count`, `for_each`, `depends_on`, `provider`, `lifecycle`, a provisioner: a plan shows no attribute for it
  'dynamic-block',           // a `dynamic` block: the blocks it generates are not in the file
  'block-set-element',       // one of several sibling nested blocks of the same name: no key identifies which
  'one-line-collection',     // a map or block written on one line
  'expression-in-map',       // an expression added to or removed from a map's construction (for example a `merge(…)` argument)
  'unrecognised-line',       // a changed line the reader has no rule for
] as const;
export type PlanWitnessUnreadableReason = (typeof PLAN_WITNESS_UNREADABLE_REASONS)[number];

export const PLAN_WITNESS_NAME_CAP = 40;
export const PLAN_WITNESS_EDIT_CAP = 20;
export const PLAN_WITNESS_ALIGN_BUDGET = 250_000;

export interface PlanWitnessResource {
  /** `<type>.<name>` of the `resource` block. */
  address: string;
  /** What the EDIT does to the block in the file: lines changed inside it, the block added, or the block removed. Not the plan's
   *  action — the platform does not know whether a changed argument forces a replacement. */
  change: 'edit' | 'create' | 'remove';
  /** Dotted names whose value an added or changed line sets (`tags.owner`, `versioning_configuration.status`, `policy`). A document
   *  held in one attribute (`jsonencode(…)`, a heredoc) and a list are named whole, by the attribute. */
  sets: string[];
  /** Dotted names a removed line carried and no added line sets. */
  removes: string[];
  /** Dotted names of lines whose only change is spacing (`terraform fmt` column alignment). They set nothing. */
  realigned: string[];
  /** Keys in the same map or nested block as a name in `sets` / `removes` that the edits leave unchanged. */
  unchanged: string[];
}
export interface PlanWitnessEdit {
  /** The edit block's 1-based index in the package (the number the platform's diff prints). */
  block: number;
  handle: string;
  state: 'read' | 'unreadable';
  reason?: PlanWitnessUnreadableReason;
  resources: PlanWitnessResource[];
}
export interface PlanWitnessKeys {
  reader: typeof PLAN_WITNESS_READER;
  /** The package's edit-application state when the keys were read. */
  packageState: string;
  edits: PlanWitnessEdit[];
  editsTotal: number;
  /** Counts of what the caps cut (absent when nothing was cut). */
  cut?: { edits?: number; names?: number };
}

interface Frame { id: number; parent: number; kind: 'block' | 'obj' | 'list' | 'call' | 'paren' | 'heredoc'; name: string; labels?: string[]; attr?: string }
type Head =
  | { type: 'blank' }
  | { type: 'attr'; key: string; inlineObject: boolean; /** the line opens a multi-line map whose keys are named one by one */ opensKeyed?: boolean }
  | { type: 'block-open'; name: string; labels: string[]; oneLine: boolean }
  | { type: 'heredoc-body' }
  | { type: 'other' };
interface LineInfo {
  stack: Frame[];
  /** Comment-stripped, whitespace collapsed outside strings. Equal `code` ⇒ the same code. */
  code: string;
  /** `code` without brackets and commas outside strings (a line that only moves a bracket has the same key). */
  contentKey: string;
  /** The raw line with whitespace collapsed (comments kept): equal ⇒ a spacing-only difference. */
  wsKey: string;
  head: Head;
  bad: boolean;
}
interface Scan { lines: LineInfo[]; blockComment: boolean; siblings: Map<string, number> }

const META_ARGUMENTS = new Set(['count', 'for_each', 'depends_on', 'provider']);
const META_BLOCKS = new Set(['lifecycle', 'provisioner', 'connection']);
/** Calls whose object arguments are the attribute's own map keys. Any other call makes the attribute a whole value. */
const MAP_CALLS = new Set(['merge', 'tomap']);
const BLOCK_RE = /^([A-Za-z_][\w-]*)((?:\s+(?:"[^"]*"|[A-Za-z_][\w-]*))*)\s*\{(.*)$/;
const ATTR_RE = /^(?:([A-Za-z_][\w-]*)|"([^"]+)")\s*=(?!=)\s*(.*)$/;
const MAP_COLON_RE = /^(?:([A-Za-z_][\w-]*)|"([^"]+)")\s*:\s*(.*)$/;

/** Scan an HCL file line by line, tracking brackets from the top. Never throws; a lost place marks every later line `bad`. */
function scanHcl(fileLines: string[]): Scan {
  const out: LineInfo[] = []; const siblings = new Map<string, number>();
  let stack: Frame[] = []; let nextId = 1; let bad = false; let blockComment = false;
  let heredoc: { end: string; frame: Frame } | null = null;
  for (const raw of fileLines) {
    const wsKey = raw.replace(/\s+/g, ' ').trim();
    if (heredoc) {
      out.push({ stack: [...stack], code: raw, contentKey: raw.trim() === '' ? '' : raw, wsKey, head: { type: 'heredoc-body' }, bad });
      if (raw.trim() === heredoc.end) { stack = stack.filter((f) => f !== heredoc!.frame); heredoc = null; }
      continue;
    }
    // ── character pass: strings, templates, comments; the events are the brackets outside strings ──
    const modes: Array<{ m: 'str' } | { m: 'tpl'; depth: number }> = [];
    let code = ''; let content = '';
    const events: Array<{ ch: string; ident: string; at: number }> = [];
    let heredocEnd: string | null = null;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]; const top = modes[modes.length - 1];
      if (top?.m === 'str') {
        code += c; content += c;
        if (c === '\\') { if (i + 1 < raw.length) { code += raw[i + 1]; content += raw[i + 1]; i++; } continue; }
        if (c === '"') { modes.pop(); continue; }
        if ((c === '$' || c === '%') && raw[i + 1] === '{' && raw[i - 1] !== c) { code += '{'; content += '{'; i++; modes.push({ m: 'tpl', depth: 1 }); }
        continue;
      }
      if (top?.m === 'tpl') {
        code += c; content += c;
        if (c === '"') modes.push({ m: 'str' });
        else if (c === '{') top.depth++;
        else if (c === '}') { top.depth--; if (top.depth === 0) modes.pop(); }
        continue;
      }
      if (c === '#' || (c === '/' && raw[i + 1] === '/')) break;
      if (c === '/' && raw[i + 1] === '*') { blockComment = true; break; }
      if (c === '<' && raw[i + 1] === '<') {
        const h = /^<<-?([A-Za-z_][\w-]*)\s*$/.exec(raw.slice(i));
        if (h) { heredocEnd = h[1]; code += raw.slice(i).trim(); content += raw.slice(i).trim(); break; }
      }
      if (c === '"') { modes.push({ m: 'str' }); code += c; content += c; continue; }
      if (c === '{' || c === '[' || c === '(' || c === '}' || c === ']' || c === ')') {
        const ident = c === '(' ? (/([A-Za-z_][\w-]*)\s*$/.exec(code)?.[1] ?? '') : '';
        events.push({ ch: c, ident, at: code.length });
        code += c; continue;
      }
      if (/\s/.test(c)) { if (!/\s$/.test(code)) code += ' '; if (!/\s$/.test(content)) content += ' '; continue; }
      code += c; if (c !== ',') content += c;
    }
    if (modes.length) bad = true; // a string left open at the end of a line
    code = code.trim(); const contentKey = content.replace(/\s+/g, ' ').trim();
    const snapshot = [...stack];
    let head: Head = { type: 'other' };
    const blockM = BLOCK_RE.exec(code); const attrM = ATTR_RE.exec(code);
    const inObject = snapshot.length > 0 && snapshot[snapshot.length - 1].kind !== 'block';
    const colonM = !attrM && inObject ? MAP_COLON_RE.exec(code) : null;
    if (code === '') head = { type: 'blank' };
    else if (attrM || colonM) {
      const m = (attrM ?? colonM) as RegExpExecArray;
      head = { type: 'attr', key: m[1] ?? m[2], inlineObject: false };
    } else if (blockM && events.length && events[0].ch === '{') {
      const labels = (blockM[2].match(/"[^"]*"|[A-Za-z_][\w-]*/g) ?? []).map((l) => l.replace(/^"|"$/g, ''));
      head = { type: 'block-open', name: blockM[1], labels, oneLine: false };
    }
    // ── apply the bracket events ──
    let first = true; const depthBefore = stack.length; let minDepth = depthBefore;
    for (const e of events) {
      if (e.ch === '{' || e.ch === '[' || e.ch === '(') {
        const parent = stack.length ? stack[stack.length - 1].id : 0;
        let f: Frame;
        if (head.type === 'block-open' && first) {
          f = { id: nextId++, parent, kind: 'block', name: head.name, labels: head.labels };
          const k = `${parent}|${head.name}|${head.labels.join('|')}`; siblings.set(k, (siblings.get(k) ?? 0) + 1);
        } else {
          const kind: Frame['kind'] = e.ch === '{' ? 'obj' : e.ch === '[' ? 'list' : e.ident ? 'call' : 'paren';
          f = { id: nextId++, parent, kind, name: e.ident, ...(head.type === 'attr' && first ? { attr: head.key } : {}) };
        }
        stack = [...stack, f]; first = false;
      } else {
        if (!stack.length) { bad = true; continue; }
        const topF = stack[stack.length - 1];
        const want = topF.kind === 'block' || topF.kind === 'obj' ? '}' : topF.kind === 'list' ? ']' : ')';
        if (e.ch !== want) { bad = true; continue; }
        stack = stack.slice(0, -1); if (stack.length < minDepth) minDepth = stack.length;
      }
    }
    if (events.length && stack.length === depthBefore && minDepth === depthBefore) {
      // everything the line opened it also closed
      if (head.type === 'block-open') head = { ...head, oneLine: true };
      if (head.type === 'attr' && events[0].ch === '{') head = { ...head, inlineObject: true };
    }
    if (head.type === 'attr' && stack.length > depthBefore) {
      const opened = stack[depthBefore];
      if (opened.attr !== undefined && (opened.kind === 'obj' || (opened.kind === 'call' && MAP_CALLS.has(opened.name)))) head = { ...head, opensKeyed: true };
    }
    if (heredocEnd) {
      const parent = stack.length ? stack[stack.length - 1].id : 0;
      const f: Frame = { id: nextId++, parent, kind: 'heredoc', name: heredocEnd, ...(head.type === 'attr' ? { attr: head.key } : {}) };
      stack = [...stack, f]; heredoc = { end: heredocEnd, frame: f };
    }
    out.push({ stack: snapshot, code, contentKey, wsKey, head, bad });
  }
  return { lines: out, blockComment, siblings };
}

type Named =
  | { kind: 'name'; root: Frame; address: string; name: string; container: string }
  | { kind: 'skip' }
  | { kind: 'unreadable'; reason: PlanWitnessUnreadableReason };

/** What a changed line names, from its position in the file. */
function nameOf(line: LineInfo, scan: Scan): Named {
  const h = line.head;
  if (h.type === 'blank') return { kind: 'skip' };
  if (line.bad) return { kind: 'unreadable', reason: 'brackets-unbalanced' };
  const S = line.stack;
  if (S.length === 0) {
    if (h.type === 'block-open') return h.name === 'resource' && h.labels.length === 2 ? { kind: 'skip' } : { kind: 'unreadable', reason: 'non-resource-block' };
    if (line.contentKey === '') return { kind: 'skip' };
    return { kind: 'unreadable', reason: 'non-resource-block' };
  }
  const root = S[0];
  if (root.kind !== 'block' || root.name !== 'resource' || (root.labels ?? []).length !== 2) return { kind: 'unreadable', reason: 'non-resource-block' };
  const address = `${root.labels![0]}.${root.labels![1]}`;
  const names: string[] = []; let whole = false; let inMapCall = false;
  for (const f of S.slice(1)) {
    if (whole) continue;
    if (f.kind === 'block') {
      if (META_BLOCKS.has(f.name)) return { kind: 'unreadable', reason: 'meta-argument' };
      if (f.name === 'dynamic') return { kind: 'unreadable', reason: 'dynamic-block' };
      if ((scan.siblings.get(`${f.parent}|${f.name}|${(f.labels ?? []).join('|')}`) ?? 0) > 1) return { kind: 'unreadable', reason: 'block-set-element' };
      names.push(f.name); inMapCall = false;
    } else if (f.kind === 'obj') {
      if (f.attr !== undefined) names.push(f.attr);
      else if (!inMapCall && names.length === 0) return { kind: 'unreadable', reason: 'unrecognised-line' };
      inMapCall = false;
    } else if (f.kind === 'call' && MAP_CALLS.has(f.name) && f.attr !== undefined) {
      names.push(f.attr); inMapCall = true;
    } else {
      // a list, any other call, a parenthesised expression, a heredoc: the attribute is one whole value
      if (f.attr !== undefined) names.push(f.attr);
      if (names.length === 0) return { kind: 'unreadable', reason: 'unrecognised-line' };
      whole = true;
    }
  }
  const container = names.join('.');
  if (whole) return line.contentKey === '' ? { kind: 'skip' } : { kind: 'name', root, address, name: container, container: '' };
  if (h.type === 'block-open') {
    if (META_BLOCKS.has(h.name)) return { kind: 'unreadable', reason: 'meta-argument' };
    if (h.name === 'dynamic') return { kind: 'unreadable', reason: 'dynamic-block' };
    return h.oneLine ? { kind: 'unreadable', reason: 'one-line-collection' } : { kind: 'skip' };
  }
  if (h.type === 'attr') {
    if (names.length === 0 && META_ARGUMENTS.has(h.key)) return { kind: 'unreadable', reason: 'meta-argument' };
    if (h.inlineObject) return { kind: 'unreadable', reason: 'one-line-collection' };
    if (h.opensKeyed) return { kind: 'skip' }; // `tags = {` names nothing itself: its keys do
    return { kind: 'name', root, address, name: [...names, h.key].join('.'), container };
  }
  if (line.contentKey === '') return { kind: 'skip' }; // only brackets / commas
  if (inMapCall || names.length > 0) return { kind: 'unreadable', reason: 'expression-in-map' };
  return { kind: 'unreadable', reason: 'unrecognised-line' };
}

/** In-order alignment of two line lists on `key`; returns for each side the index it pairs with, or -1. */
function align(a: string[], b: string[]): { pa: number[]; pb: number[] } {
  const n = a.length; const m = b.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pa = new Array<number>(n).fill(-1); const pb = new Array<number>(m).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { pa[i] = j; pb[j] = i; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return { pa, pb };
}

const bodyOf = (text: string): string[] => { const ls = text.split('\n'); if (text.endsWith('\n')) ls.pop(); return text === '' ? [] : ls; };
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Read which names each held edit sets. `finalBlocks` = the 1-based indexes of the package's edit blocks inside `Held File Edits`
 * (the applier's `total`); `app.files[].hunks` are the applied ones. Never throws: an error is `unrecognised-line` on the edit.
 */
export function computePlanWitnessKeys(app: EditApplication, files: readonly Pick<HeldFileInput, 'handle' | 'path' | 'viewText'>[]): PlanWitnessKeys {
  const edits: PlanWitnessEdit[] = [];
  const cut = { names: 0 };
  const capNames = (xs: string[]) => { const u = uniq(xs); if (u.length > PLAN_WITNESS_NAME_CAP) { cut.names += u.length - PLAN_WITNESS_NAME_CAP; return u.slice(0, PLAN_WITNESS_NAME_CAP); } return u; };
  const viewOf = new Map(files.map((f) => [f.handle, f]));
  const seenBlocks = new Set<number>();
  for (const fa of app.files ?? []) {
    if (fa.state !== 'applied') continue;
    const isTf = /\.tf$/i.test(fa.path ?? '');
    if (fa.op === 'create') {
      const block = 0; // a `create` file block: the application carries no block index for it; the handle identifies it
      if (!isTf) { edits.push({ block, handle: fa.handle, state: 'unreadable', reason: 'not-hcl-file', resources: [] }); continue; }
      const scan = scanHcl(bodyOf(fa.candidateText ?? ''));
      let reason: PlanWitnessUnreadableReason | null = scan.blockComment ? 'block-comment' : null;
      const created: PlanWitnessResource[] = [];
      for (const l of scan.lines) {
        if (l.bad) { reason = reason ?? 'brackets-unbalanced'; break; }
        if (l.stack.length === 0 && l.head.type !== 'blank') {
          if (l.head.type === 'block-open' && l.head.name === 'resource' && l.head.labels.length === 2) {
            created.push({ address: `${l.head.labels[0]}.${l.head.labels[1]}`, change: 'create', sets: [], removes: [], realigned: [], unchanged: [] });
          } else reason = reason ?? 'non-resource-block';
        }
      }
      edits.push({ block, handle: fa.handle, state: reason ? 'unreadable' : 'read', ...(reason ? { reason } : {}), resources: created });
      continue;
    }
    const hunks = [...(fa.hunks ?? [])].sort((a, b) => a.start - b.start);
    const view = viewOf.get(fa.handle);
    const fail = (reason: PlanWitnessUnreadableReason) => { for (const h of hunks) { seenBlocks.add(h.block); edits.push({ block: h.block, handle: fa.handle, state: 'unreadable', reason, resources: [] }); } };
    if (!view || typeof view.viewText !== 'string') { fail('view-unavailable'); continue; }
    if (!isTf) { fail('not-hcl-file'); continue; }
    const base = bodyOf(view.viewText);
    // the candidate's lines, and where each hunk's REPLACE lines sit in it
    const cand: string[] = []; const at: number[] = []; let n = 1;
    for (const h of hunks) {
      for (; n < h.start; n++) cand.push(base[n - 1]);
      at.push(cand.length); cand.push(...h.replace); n = h.start + h.searchLen;
    }
    for (; n <= base.length; n++) cand.push(base[n - 1]);
    const sb = scanHcl(base); const sn = scanHcl(cand);
    if (sb.blockComment || sn.blockComment) { fail('block-comment'); continue; }
    const perEdit: Array<{ h: (typeof hunks)[number]; reason: PlanWitnessUnreadableReason | null; res: Map<string, PlanWitnessResource> }> = [];
    hunks.forEach((h, hi) => {
      seenBlocks.add(h.block);
      const res = new Map<string, PlanWitnessResource>();
      let reason: PlanWitnessUnreadableReason | null = null;
      const note = (r: PlanWitnessUnreadableReason) => { reason = reason ?? r; };
      const entry = (address: string, change: PlanWitnessResource['change']) => {
        let e = res.get(address);
        if (!e) { e = { address, change, sets: [], removes: [], realigned: [], unchanged: [] }; res.set(address, e); }
        else if (change !== 'edit' && e.change === 'edit') e.change = change;
        return e;
      };
      const B = sb.lines.slice(h.start - 1, h.start - 1 + h.searchLen); const N = sn.lines.slice(at[hi], at[hi] + h.replace.length);
      const rawB = base.slice(h.start - 1, h.start - 1 + h.searchLen); const rawN = h.replace;
      if (B.length * N.length > PLAN_WITNESS_ALIGN_BUDGET) { perEdit.push({ h, reason: 'edit-too-large', res }); return; }
      const { pa, pb } = align(B.map((l) => l.code), N.map((l) => l.code));
      // a line that only moved a bracket or a comma: pair the leftovers by content
      const leftN = new Map<string, number[]>();
      N.forEach((l, j) => { if (pb[j] < 0 && l.head.type === 'other' && l.contentKey !== '') leftN.set(l.contentKey, [...(leftN.get(l.contentKey) ?? []), j]); });
      B.forEach((l, i) => {
        if (pa[i] >= 0 || l.head.type !== 'other' || l.contentKey === '') return;
        const q = leftN.get(l.contentKey); if (q && q.length) { const j = q.shift() as number; pa[i] = j; pb[j] = i; }
      });
      // the same code under another name (a line moved to another map or block) is a removal and an addition, not an unchanged line
      B.forEach((l, i) => {
        const j = pa[i]; if (j < 0) return;
        const x = nameOf(l, sb); const y = nameOf(N[j], sn);
        if (x.kind === 'name' && y.kind === 'name' && (x.address !== y.address || x.name !== y.name)) { pa[i] = -1; pb[j] = -1; }
      });
      const createdRoots = new Set<number>(); const removedRoots = new Set<number>();
      N.forEach((l, j) => {
        if (pb[j] >= 0 || l.stack.length !== 0 || l.head.type !== 'block-open') return;
        if (l.head.name === 'resource' && l.head.labels.length === 2) {
          entry(`${l.head.labels[0]}.${l.head.labels[1]}`, 'create');
          // the frame this header opened is the root of the lines that follow it
          const next = sn.lines[at[hi] + j + 1]; if (next && next.stack.length > 0) createdRoots.add(next.stack[0].id);
        }
      });
      B.forEach((l, i) => {
        if (pa[i] >= 0 || l.stack.length !== 0 || l.head.type !== 'block-open') return;
        if (l.head.name === 'resource' && l.head.labels.length === 2) {
          entry(`${l.head.labels[0]}.${l.head.labels[1]}`, 'remove');
          const next = sb.lines[h.start - 1 + i + 1]; if (next && next.stack.length > 0) removedRoots.add(next.stack[0].id);
        }
      });
      const removedNames: Array<{ address: string; name: string; container: string }> = [];
      B.forEach((l, i) => {
        if (pa[i] >= 0) return;
        if (l.stack.length > 0 && removedRoots.has(l.stack[0].id)) return;
        const nm = nameOf(l, sb);
        if (nm.kind === 'unreadable') note(nm.reason);
        else if (nm.kind === 'name') removedNames.push(nm);
      });
      N.forEach((l, j) => {
        if (l.stack.length > 0 && createdRoots.has(l.stack[0].id)) return;
        if (pb[j] >= 0) {
          // unchanged code: a spacing-only difference is listed, a comment-only one is not
          if (rawB[pb[j]] !== rawN[j] && B[pb[j]].wsKey === l.wsKey) {
            const nm = nameOf(l, sn);
            if (nm.kind === 'name') entry(nm.address, 'edit').realigned.push(nm.name);
          }
          return;
        }
        const nm = nameOf(l, sn);
        if (nm.kind === 'unreadable') { note(nm.reason); return; }
        if (nm.kind !== 'name') return;
        entry(nm.address, 'edit').sets.push(nm.name);
      });
      for (const r of removedNames) {
        const e = entry(r.address, 'edit');
        if (!e.sets.includes(r.name)) e.removes.push(r.name);
      }
      perEdit.push({ h, reason, res });
    });
    // unchanged siblings: name lines of the candidate in a container an edit touched, that no edit of this file sets
    const allSets = new Map<string, Set<string>>(); const containers = new Map<string, Set<string>>();
    for (const pe of perEdit) for (const r of pe.res.values()) {
      const s = allSets.get(r.address) ?? new Set<string>(); const c = containers.get(r.address) ?? new Set<string>();
      for (const nme of [...r.sets, ...r.removes]) { s.add(nme); const i = nme.lastIndexOf('.'); if (i > 0) c.add(nme.slice(0, i)); }
      allSets.set(r.address, s); containers.set(r.address, c);
    }
    const unchanged = new Map<string, string[]>();
    for (const l of sn.lines) {
      if (l.head.type !== 'attr' || l.bad) continue;
      const nm = nameOf(l, sn);
      if (nm.kind !== 'name' || !nm.container) continue;
      if (containers.get(nm.address)?.has(nm.container) && !allSets.get(nm.address)?.has(nm.name)) unchanged.set(nm.address, [...(unchanged.get(nm.address) ?? []), nm.name]);
    }
    for (const pe of perEdit) {
      const resources = [...pe.res.values()].map((r) => {
        const touched = new Set([...r.sets, ...r.removes].map((x) => x.slice(0, Math.max(0, x.lastIndexOf('.')))).filter(Boolean));
        return {
          address: r.address, change: r.change, sets: capNames(r.sets), removes: capNames(r.removes), realigned: capNames(r.realigned),
          unchanged: capNames((unchanged.get(r.address) ?? []).filter((u) => touched.has(u.slice(0, u.lastIndexOf('.'))))),
        };
      });
      edits.push({ block: pe.h.block, handle: fa.handle, state: pe.reason ? 'unreadable' : 'read', ...(pe.reason ? { reason: pe.reason } : {}), resources });
    }
  }
  // an edit block the platform refused has no candidate
  for (const r of app.refusals ?? []) {
    if (typeof r.block === 'number' && r.block > 0 && !seenBlocks.has(r.block)) {
      seenBlocks.add(r.block); edits.push({ block: r.block, handle: r.handle ?? '', state: 'unreadable', reason: 'edit-not-applied', resources: [] });
    }
  }
  // one entry per edit block: a block applied at several places (`count`) reads as one edit
  const merged: PlanWitnessEdit[] = [];
  for (const e of edits.sort((a, b) => a.block - b.block)) {
    const prev = merged[merged.length - 1];
    if (!prev || e.block === 0 || prev.block !== e.block || prev.handle !== e.handle) { merged.push(e); continue; }
    if (e.state === 'unreadable' && prev.state === 'read') { prev.state = 'unreadable'; prev.reason = e.reason; }
    for (const r of e.resources) {
      const p0 = prev.resources.find((x) => x.address === r.address);
      if (!p0) { prev.resources.push(r); continue; }
      if (r.change !== 'edit') p0.change = r.change;
      p0.sets = uniq([...p0.sets, ...r.sets]); p0.removes = uniq([...p0.removes, ...r.removes].filter((x) => !p0.sets.includes(x)));
      p0.realigned = uniq([...p0.realigned, ...r.realigned]); p0.unchanged = uniq([...p0.unchanged, ...r.unchanged]);
    }
  }
  edits.length = 0; edits.push(...merged);
  const editsTotal = edits.length; const kept = edits.slice(0, PLAN_WITNESS_EDIT_CAP);
  const cutOut = { ...(editsTotal > kept.length ? { edits: editsTotal - kept.length } : {}), ...(cut.names ? { names: cut.names } : {}) };
  return { reader: PLAN_WITNESS_READER, packageState: String(app.state), edits: kept, editsTotal, ...(Object.keys(cutOut).length ? { cut: cutOut } : {}) };
}

/** Never throws: the step's wrapper. An error reads as "no key read", named. */
export function planWitnessKeysOrNull(app: EditApplication | null | undefined, files: readonly Pick<HeldFileInput, 'handle' | 'path' | 'viewText'>[] | null | undefined): PlanWitnessKeys | null {
  if (!app) return null;
  try { return computePlanWitnessKeys(app, files ?? []); } catch { return null; }
}

// ── 3. the fact ──────────────────────────────────────────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A stored or handed-over key read, validated to the shape above. Anything else ⇒ null (the fact then says no key read). */
export function readPlanWitnessKeys(v: unknown): PlanWitnessKeys | null {
  if (!isObj(v) || v.reader !== PLAN_WITNESS_READER || !Array.isArray(v.edits)) return null;
  const edits: PlanWitnessEdit[] = [];
  for (const e of v.edits) {
    if (!isObj(e) || typeof e.block !== 'number' || (e.state !== 'read' && e.state !== 'unreadable')) return null;
    const reason = (PLAN_WITNESS_UNREADABLE_REASONS as readonly string[]).includes(String(e.reason)) ? (e.reason as PlanWitnessUnreadableReason) : undefined;
    if (e.state === 'unreadable' && !reason) return null;
    const resources: PlanWitnessResource[] = [];
    for (const r of Array.isArray(e.resources) ? e.resources : []) {
      if (!isObj(r) || typeof r.address !== 'string' || (r.change !== 'edit' && r.change !== 'create' && r.change !== 'remove')) return null;
      resources.push({ address: r.address, change: r.change, sets: strs(r.sets), removes: strs(r.removes), realigned: strs(r.realigned), unchanged: strs(r.unchanged) });
    }
    edits.push({ block: e.block, handle: typeof e.handle === 'string' ? e.handle : '', state: e.state, ...(e.state === 'unreadable' ? { reason } : {}), resources });
  }
  return {
    reader: PLAN_WITNESS_READER, packageState: typeof v.packageState === 'string' ? v.packageState : 'unknown', edits,
    editsTotal: typeof v.editsTotal === 'number' ? v.editsTotal : edits.length, ...(isObj(v.cut) ? { cut: v.cut as PlanWitnessKeys['cut'] } : {}),
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Is `name` in the text as a whole token (not inside a longer identifier)? */
const hasToken = (text: string, name: string) => new RegExp(`(?<![A-Za-z0-9_-])${esc(name)}(?![A-Za-z0-9_-])`).test(text);
const leaf = (name: string) => name.slice(name.lastIndexOf('.') + 1);

export type ListsCover = 'all-edits' | 'read-edits-only' | 'no-edit-read' | 'not-checked';

export interface PlanWitnessFact {
  version: typeof PLAN_WITNESS_VERSION;
  checked: true;
  protocol: string;
  sentenceVersion: string;
  stopSentence: StopSentenceState;
  /** Present on `verbatim`: whether the bytes matched as written or only after the stated normalisation. */
  stopSentenceForm?: 'byte-exact' | 'normalised';
  witnessBlock: 'present' | 'absent';
  /** The key read: `checked:false` with a reason when the held-edit step handed none. */
  keys: { checked: true; reader: string; packageState: string; editsTotal: number; editsRead: number; editsUnreadable: number; cut?: PlanWitnessKeys['cut'] }
    | { checked: false; reason: 'no-key-read' };
  edits: PlanWitnessEdit[];
  /** Which edits `missing`, `missingResources` and `wholeValueKeys` were computed over. An empty list is "none found" ONLY for
   *  `all-edits`; for `read-edits-only` the unreadable edits are not covered; for the other two nothing was compared. */
  listsCover: ListsCover;
  /** `<address>: <name>` an edit that was read sets or removes and the witness block does not contain. */
  missing: string[];
  /** A resource address an edit that was read touches and the witness block does not contain. */
  missingResources: string[];
  /** `<address>: <name>` of an unchanged sibling key the witness block gives a value for. */
  wholeValueKeys: string[];
  /** `<address>: <name>` of lines whose only change is spacing. */
  realigned: string[];
}

/**
 * The fact for one Author package. `keys` = the held-edit step's key read (or its stored transcription on a replay); null ⇒ the
 * comparison is not made and says so. Pure.
 */
export function computePlanWitness(finalResponse: string, entry: { protocol: string; sentenceVersion: string; sentence: string }, keysIn: unknown): PlanWitnessFact {
  const text = typeof finalResponse === 'string' ? finalResponse : '';
  const ss = stopSentenceState(text, entry.sentence);
  const blockRaw = planWitnessBlock(text);
  const keys = readPlanWitnessKeys(keysIn);
  const base = {
    version: PLAN_WITNESS_VERSION, checked: true as const, protocol: entry.protocol, sentenceVersion: entry.sentenceVersion,
    stopSentence: ss.state, ...(ss.form ? { stopSentenceForm: ss.form } : {}), witnessBlock: blockRaw === null ? 'absent' as const : 'present' as const,
  };
  if (!keys) return { ...base, keys: { checked: false, reason: 'no-key-read' }, edits: [], listsCover: 'not-checked', missing: [], missingResources: [], wholeValueKeys: [], realigned: [] };
  const read = keys.edits.filter((e) => e.state === 'read'); const unreadable = keys.edits.length - read.length + Math.max(0, keys.editsTotal - keys.edits.length);
  const realigned = uniq(keys.edits.flatMap((e) => e.resources.flatMap((r) => r.realigned.map((n) => `${r.address}: ${n}`))));
  const keyFact = { checked: true as const, reader: keys.reader, packageState: keys.packageState, editsTotal: keys.editsTotal, editsRead: read.length, editsUnreadable: unreadable, ...(keys.cut ? { cut: keys.cut } : {}) };
  const listsCover: ListsCover = blockRaw === null ? 'not-checked' : read.length === 0 ? 'no-edit-read' : unreadable > 0 ? 'read-edits-only' : 'all-edits';
  const missing: string[] = []; const missingResources: string[] = []; const whole: string[] = [];
  if (blockRaw !== null) {
    // the stop sentence's own words (`action`, `attribute`, `provider` …) are not the witness's names
    // (whitespace collapsed on both sides for the removal; names keep their underscores)
    const ws = (t: string) => t.replace(/^[ \t]*(?:>[ \t]?)+/gm, '').replace(/\s+/g, ' ');
    const block = ws(blockRaw).split(ws(entry.sentence).trim()).join(' ');
    for (const e of read) for (const r of e.resources) {
      if (!hasToken(block, r.address)) missingResources.push(r.address);
      for (const n of [...r.sets, ...r.removes]) if (!hasToken(block, n) && !hasToken(block, leaf(n))) missing.push(`${r.address}: ${n}`);
      for (const u of r.unchanged) {
        if (new RegExp(`(?<![A-Za-z0-9_-])${esc(leaf(u))}(?![A-Za-z0-9_-])["'\`]?\\s*(?:=(?!=)|:\\s*["\`])`).test(block)) whole.push(`${r.address}: ${u}`);
      }
    }
  }
  return { ...base, keys: keyFact, edits: keys.edits, listsCover, missing: uniq(missing), missingResources: uniq(missingResources), wholeValueKeys: uniq(whole), realigned };
}

/** The key read a stored fact carries (`keys` + `edits`), in the shape the net takes — what a replay hands back as
 *  `ctx.held.planWitnessKeys`. Null when the stored fact had no key read (it then reproduces `no-key-read`). */
export function planWitnessKeysFromFact(fact: unknown): PlanWitnessKeys | null {
  if (!isObj(fact) || !isObj(fact.keys) || fact.keys.checked !== true) return null;
  return readPlanWitnessKeys({ reader: fact.keys.reader, packageState: fact.keys.packageState, edits: fact.edits, editsTotal: fact.keys.editsTotal,
    ...(isObj(fact.keys.cut) ? { cut: fact.keys.cut } : {}) });
}

// ── the force (read by the held-edit carrier) ────────────────────────────────────────────────────────────────────────

export const PLAN_WITNESS_FORCE_REASONS = Object.freeze({
  altered: 'stop-sentence-altered', absent: 'stop-sentence-absent', incomplete: 'witness-incomplete', wholeValue: 'witness-whole-value',
} as const);

/**
 * The carrier's forcing reason for a stamped fact, or null. A fact that is not `checked:true` (an enrichment error) never forces.
 * In order:
 *   1. the stop sentence — `altered` / `absent` (owner W1);
 *   2. `witness-incomplete` — `missing` is non-empty, and
 *   3. `witness-whole-value` — `wholeValueKeys` is non-empty (owner decision 2026-11-18, after the re-lab: a Reviewer approved 5 of
 *      20 such packages with the correct fact in its prompt). BOTH only where `listsCover` is `all-edits`: every edit was read, so
 *      the list is the whole answer. Under `read-edits-only` / `no-edit-read` / `not-checked` no list forces — the Reviewer's by-eye
 *      check stands for what the platform did not read.
 * `missingResources` and `realigned` never force. The order is fact-first (a sentence is one string compare), then the two lists in
 * the order the render prints them; one reason is stamped, and a package with both list faults reads `witness-incomplete`.
 */
export function planWitnessForceReason(fact: unknown): string | null {
  if (!isObj(fact) || fact.checked !== true || fact.version !== PLAN_WITNESS_VERSION) return null;
  if (fact.stopSentence === 'altered') return PLAN_WITNESS_FORCE_REASONS.altered;
  if (fact.stopSentence === 'absent') return PLAN_WITNESS_FORCE_REASONS.absent;
  if (fact.listsCover !== 'all-edits') return null;
  if (strs(fact.missing).length > 0) return PLAN_WITNESS_FORCE_REASONS.incomplete;
  if (strs(fact.wholeValueKeys).length > 0) return PLAN_WITNESS_FORCE_REASONS.wholeValue;
  return null;
}

// ── the §6 render (the leg Reviewer reads this) ──────────────────────────────────────────────────────────────────────

const q = (s: unknown) => String(s ?? '').replace(/[`\r\n\t]+/g, ' ').slice(0, 160);
const list = (xs: string[]) => xs.map((x) => `\`${q(x)}\``).join(', ');

export const PLAN_WITNESS_RENDER_HEAD = '- **Plan witness — platform check** (computed by the platform from the package text and its kept-file edits; no model checked it):';
export const PLAN_WITNESS_REASON_WORDS: Readonly<Record<PlanWitnessUnreadableReason, string>> = Object.freeze({
  'edit-not-applied': 'the platform did not apply this edit',
  'view-unavailable': 'the kept file was not available to the check',
  'not-hcl-file': 'the kept file is not a .tf file',
  'block-comment': 'the file carries a /* */ comment',
  'brackets-unbalanced': 'the brackets of the file could not be followed',
  'edit-too-large': 'the edit is larger than the check reads',
  'non-resource-block': 'the edit is in a block that is not a resource',
  'meta-argument': 'the edit sets a meta-argument',
  'dynamic-block': 'the edit is in a dynamic block',
  'block-set-element': 'the edit is in one of several nested blocks of the same name',
  'one-line-collection': 'the edit changes a map or block written on one line',
  'expression-in-map': 'the edit changes an expression a map is built from',
  'unrecognised-line': 'the edit has a line the check has no rule for',
});

/** How many faults the fact states: the stop sentence (0/1), a missing block (0/1), and every entry of the three lists. */
export function planWitnessFaultCount(fact: Record<string, unknown>): number {
  return (fact.stopSentence === 'verbatim' ? 0 : 1) + (fact.witnessBlock === 'present' ? 0 : 1)
    + strs(fact.missingResources).length + strs(fact.missing).length + strs(fact.wholeValueKeys).length;
}

export const PLAN_WITNESS_WHOLE_VALUE_NOTE = 'the edits leave its value unchanged; the block states a value for it';
export const PLAN_WITNESS_WHOLE_VALUE_NOTE_RESPACED = 'the edits leave its value unchanged — its line is only re-spaced; the block states a value for it';

/**
 * The §6 lines (reworded 2026-11-18 after the re-lab: a Reviewer read the gap list as a list of what IS covered, and excused a
 * whole-value entry because the same name was on the spacing-only line). So: the OUTCOME is the first line; every list line carries
 * its count; a whole-value entry carries its own reason, and says so when its line is also re-spaced; the last line says whether
 * the platform itself returns the package. Every string is a fixed template (pinned in test:plan-witness R).
 */
export function renderPlanWitnessForPrompt(fact: Record<string, unknown> | null | undefined): string[] | null {
  if (!isObj(fact)) return null;
  if (fact.checked !== true) return [`${PLAN_WITNESS_RENDER_HEAD} not-checked: the platform could not run this check (${q(fact.reason ?? 'no reason recorded')}). Check the Plan witness block and its stop sentence yourself.`];
  const out = [PLAN_WITNESS_RENDER_HEAD];
  const keys = isObj(fact.keys) ? fact.keys : {};
  const cover = String(fact.listsCover);
  const n = planWitnessFaultCount(fact);
  const notRead = Number(keys.editsUnreadable) || 0;
  const found = n === 0 ? 'no fault found' : `${n} fault(s) found — listed below`;
  out.push(keys.checked !== true ? `  - Result: ${found}; the kept-file edits were NOT read — check the block against the diff yourself.`
    : fact.witnessBlock !== 'present' ? `  - Result: ${found}; the edits' names were not compared (there is no block).`
      : Number(keys.editsTotal) === 0 ? `  - Result: ${found}; the package applies no kept-file edit.`
        : cover === 'all-edits' ? `  - Result: ${found}; every edit was read.`
          : `  - Result: ${n === 0 ? 'no fault found in what was read' : `${n} fault(s) found in what was read — listed below`}; ${notRead} edit(s) NOT read — check those against the diff yourself.`);
  out.push(fact.stopSentence === 'verbatim' ? '  - Stop sentence: `verbatim`.'
    : fact.stopSentence === 'altered' ? '  - Stop sentence: `altered` — the package has a sentence that begins like the protocol\'s stop sentence and is not that sentence word for word.'
      : '  - Stop sentence: `absent` — the package does not contain the protocol\'s stop sentence.');
  out.push(`  - \`Plan witness\` block: ${fact.witnessBlock === 'present' ? 'present' : 'absent'}.`);
  const forced = planWitnessForceReason(fact);
  const closing = () => {
    if (n === 0) return;
    out.push(forced && keys.checked === true && keys.packageState === 'applied'
      ? `  - The platform returns this package for revision on this ground, whatever the review concludes: \`${forced}\`.`
      : '  - The platform does not return this package for revision on the fault(s) above; block on them in your review.');
  };
  if (keys.checked !== true) {
    out.push('  - Kept-file edits: not read — the platform has no reading of which attributes the edits set. Check the block against the diff yourself.');
    closing(); return out;
  }
  const edits = Array.isArray(fact.edits) ? (fact.edits as PlanWitnessEdit[]) : [];
  if (Number(keys.editsTotal) === 0) out.push('  - Kept-file edits: none applied in this package.');
  for (const e of edits) {
    const label = Number(e.block) === 0 ? `  - New file (${q(e.handle)})` : `  - Edit block ${Number(e.block)} (${q(e.handle)})`;
    const res = (Array.isArray(e.resources) ? e.resources : []).map((r) => {
      const parts = [
        r.change === 'create' ? 'block added (action only)' : r.change === 'remove' ? 'block removed (action only)' : 'edited',
        r.sets?.length ? `sets ${list(r.sets)}` : '', r.removes?.length ? `removes ${list(r.removes)}` : '',
        r.realigned?.length ? `re-spaced lines, which change no value: ${list(r.realigned)}` : '',
      ].filter(Boolean);
      return `\`${q(r.address)}\` ${parts.join('; ')}`;
    }).join(' · ');
    if (e.state === 'read') out.push(`${label}: read — ${res || 'sets nothing'}.`);
    else out.push(`${label}: not read (${q(PLAN_WITNESS_REASON_WORDS[e.reason as PlanWitnessUnreadableReason] ?? e.reason)}) — the platform does not know which attributes this edit sets; check this edit against the diff yourself.`);
  }
  if (cover === 'not-checked') { out.push('  - Names compared with the block: not compared — there is no `Plan witness` block.'); closing(); return out; }
  if (cover === 'no-edit-read') { out.push('  - Names compared with the block: not compared — no edit was read.'); closing(); return out; }
  const mr = strs(fact.missingResources); const mi = strs(fact.missing); const wv = strs(fact.wholeValueKeys);
  const respaced = new Set(strs(fact.realigned));
  out.push(`  - Resources the block does not name (${mr.length}): ${mr.length ? `${list(mr)} — the edits touch each of these and the block does not name it` : 'none'}.`);
  out.push(`  - Missing from the block (${mi.length}): ${mi.length ? `${list(mi)} — the edits set or remove each of these and the block does not contain it` : 'none'}.`);
  out.push(`  - Unchanged keys the block gives a value for (${wv.length}): ${wv.length
    ? wv.map((x) => `\`${q(x)}\` (${respaced.has(x) ? PLAN_WITNESS_WHOLE_VALUE_NOTE_RESPACED : PLAN_WITNESS_WHOLE_VALUE_NOTE})`).join(', ') : 'none'}.`);
  closing();
  return out;
}
