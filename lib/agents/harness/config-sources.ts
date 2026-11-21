/**
 * Config sources STEP 2 (2026-11-15; plan STEPS-2-4-PLAN.md §2.2 / §3.2, owner decision (b)) — the ONE strict grammar for a leg's
 * `## Config sources` block. It generalises `device-sources.ts` (network) to the domains that keep a FILE rather than a device:
 * Kubernetes first, observability and Terraform at their own steps.
 *
 *   <file label>: git-file — service <registered name> ; <owner>/<repo>/<path> [@ <branch>]
 *   <cluster>: live-read — service <name | descriptor URL>
 *   <cluster>: supplied
 *   <file label>: service-held — service <registered name>          (STEP 3: a file kept from the read-only service, not from Git)
 *
 * WHAT IS SHARED, WHAT IS SEPARATE:
 *   - A `git-file` or `live-read` line is parsed by the SAME function as a network line (`parseSourceLineCore`), so the two grammars
 *     cannot drift on a separator, a service name, Git coordinates or a ref.
 *   - The KINDS are per protocol (`CONFIG_SOURCE_KINDS_BY_PROTOCOL`). A network kind (`device-read`, `command-package`) is
 *     `unknown-kind` here, and `supplied` is `unknown-kind` in a `## Device sources` block.
 *   - The block heading (`## Config sources`), the contract field (`interfaceContract.configSources["<token>"]`), the snapshot key
 *     (`configSourcesSnapshot`) and the lane table (`variant.ts` CONFIG_SOURCE_LANES) are this module's own. Nothing here reads or
 *     writes `deviceSources`, and no network consumer reads this module.
 *
 * RULES (the network rules, unchanged):
 *   - The block comes from the leg's interface contract when present, else from the leg task body. Both present and different ⇒
 *     `conflict` — never choose one.
 *   - STRICT, FAIL CLOSED: any line that does not parse makes the whole block `unparseable`, with the first problem named.
 *   - A missing block is `absent`, never a source. (Kubernetes: the harness stops such a leg — owner D1.)
 *   - ONE line per label. A file label names one kept file; a cluster is either read live or supplied, never both.
 *     (STEP 3, a protocol whose `pairing` is `base-plus-live-read`: one BASE line per label — `git-file` XOR `service-held` — and at
 *     most one `live-read` on the same label, only beside a `git-file`. The pair rule keys on that per-protocol property, never on
 *     the presence of a kind. Kubernetes and Terraform: `pairing: 'none'`, unchanged.)
 *   - GRAMMAR VERSION: 1, and 2 only for a PARSED block that uses `service-held` or a pair. Every stored snapshot is version 1.
 *   - A block with no `git-file` line keeps no file. A block with no `live-read` line is a Git-only run (stated by `liveEvidence`).
 *
 * The network API is re-exported unchanged, so a caller that needs both grammars imports one module.
 *
 * PURE: no prisma, no logger. Pinned by scripts/test-config-sources.ts.
 */
import { isSourceLabel, parseSourceLineCore, sourceLineHead, type LineProblem } from './device-sources';
import { canonicalProtocolName } from './program-protocol';
import { heldPathRefusal } from '../../mcp/server/config/git-file-source-pin';

export * from './device-sources';

export const CONFIG_SOURCES_GRAMMAR_VERSION = 1;
/** STEP 3 (plan W6): a parsed block that uses `service-held`, or pairs a `live-read` with a base on one label, is version 2. The
 *  constant above stays 1 — it is what every non-parsed state and every block of the version-1 kinds carries. */
export const CONFIG_SOURCES_GRAMMAR_VERSION_PAIRED = 2;
export const CONFIG_SOURCES_GRAMMAR_VERSIONS: readonly number[] = Object.freeze([CONFIG_SOURCES_GRAMMAR_VERSION, CONFIG_SOURCES_GRAMMAR_VERSION_PAIRED]);
export const CONFIG_SOURCES_SNAPSHOT_KEY = 'configSourcesSnapshot';
export const CONFIG_SOURCES_SNAPSHOT_VERSION = 1;

export type ConfigSourceKind = 'git-file' | 'live-read' | 'supplied' | 'service-held';
/** Every kind, in grammar order — the kind-exhaustiveness pin walks THIS list through every kind switch. */
export const CONFIG_SOURCE_KINDS: readonly ConfigSourceKind[] = Object.freeze(['git-file', 'live-read', 'supplied', 'service-held']);
/** The kinds each protocol's block admits (canonical long name). A protocol absent here declares no Config sources. */
export const CONFIG_SOURCE_KINDS_BY_PROTOCOL: Readonly<Record<string, readonly ConfigSourceKind[]>> = Object.freeze({
  [canonicalProtocolName('kubernetes-gitops')]: Object.freeze(['git-file', 'live-read', 'supplied'] as ConfigSourceKind[]),
  // Config sources STEP 4 (2026-11-17): Terraform — `git-file` = a kept `.tf` file; `live-read` = the state, read as evidence through the
  // read-only service's render tools (never a state FILE); `supplied` = the engineer gave the state in the task.
  [canonicalProtocolName('terraform-iac')]: Object.freeze(['git-file', 'live-read', 'supplied'] as ConfigSourceKind[]),
  // Config sources STEP 3 (2026-11-21, slice P1): observability — a file kept from Git, a file kept from the read-only service, the
  // served file read as evidence. No `supplied`. This table says what the GRAMMAR admits; whether the protocol's legs declare
  // anything today is the lane table's answer (variant.ts CONFIG_SOURCE_LANES minus CONFIG_SOURCE_AWAITING_TEXT).
  [canonicalProtocolName('observability-config')]: Object.freeze(['git-file', 'service-held', 'live-read'] as ConfigSourceKind[]),
});
/** How a protocol's lines may share a label (plan W6). `none`: one line per label. `base-plus-live-read`: one base line per label
 *  (`git-file` XOR `service-held`) and at most one `live-read` beside a `git-file`. The pair rule keys on THIS property. */
export type ConfigPairing = 'none' | 'base-plus-live-read';
export const CONFIG_SOURCE_PAIRING_BY_PROTOCOL: Readonly<Record<string, ConfigPairing>> = Object.freeze({
  [canonicalProtocolName('kubernetes-gitops')]: 'none',
  [canonicalProtocolName('terraform-iac')]: 'none',
  [canonicalProtocolName('observability-config')]: 'base-plus-live-read',
});
export function configPairingOf(protocol: string): ConfigPairing {
  return CONFIG_SOURCE_PAIRING_BY_PROTOCOL[canonicalProtocolName(protocol)] ?? 'none';
}
/** Protocols whose labels must resolve against the platform's file targets (owner decision 10) — the check itself is
 *  `resolveConfigLabels` (held-bytes/config-label.ts), run ONCE when the snapshot is taken; this names the table it used. */
export const CONFIG_LABEL_TABLE_BY_PROTOCOL: Readonly<Record<string, string>> = Object.freeze({
  [canonicalProtocolName('observability-config')]: 'platform-file-targets/1',
});
export function configLabelTableOf(protocol: string): string | null {
  return CONFIG_LABEL_TABLE_BY_PROTOCOL[canonicalProtocolName(protocol)] ?? null;
}

export type ConfigSourceLine =
  /** A file in Git the platform KEEPS and the change edits by reference. */
  | { label: string; kind: 'git-file'; service: string; owner: string; repo: string; path: string; ref: string | null }
  /** The live system read as EVIDENCE — never held, never edited, never forced. */
  | { label: string; kind: 'live-read'; service: string }
  /** The engineer supplied the current state in the task: nothing is read, nothing is held. */
  | { label: string; kind: 'supplied' }
  /** STEP 3: a file the platform KEEPS from the read-only service (the label names the platform target — its split is DERIVED by
   *  `configLabelParts`, never stored here, so the stored field counts stay 7 / 3 / 2 and this kind's is 3). */
  | { label: string; kind: 'service-held'; service: string };

/** Exhaustiveness helper for kind switches: a new kind that reaches this is a compile error and, at runtime, a throw. */
export function assertNeverConfigKind(k: never): never { throw new Error(`unhandled config source kind: ${String(k)}`); }

/** A `git-file` line whose path the ONE never-held predicate refuses (`heldPathRefusal`: state, plan, tfvars, CLI credentials, an
 *  inventory). Config sources STEP 4 (plan §5.3, build decision D-T2): refused at RESOLUTION, for every Config-sources protocol, so the
 *  harness stops the leg rather than letting capture refuse and the carrier force — the call gate refuses the read on any route too. */
export type ConfigLineProblem = LineProblem | 'path-never-held';

/** The problems the block-level LABEL check can name (held-bytes/config-label.ts). A closed set: the snapshot reader accepts no
 *  other name in `labelCheck.problem`. `path-never-held` is shared with the line parser (a resolved service path the ONE never-held
 *  predicate refuses). */
export const CONFIG_LABEL_PROBLEMS = Object.freeze(['label-target-not-supported', 'label-key-invalid', 'label-path-not-resolvable', 'path-never-held'] as const);
export type ConfigLabelProblem = (typeof CONFIG_LABEL_PROBLEMS)[number];

export type ConfigBlockProblem = ConfigLineProblem | ConfigLabelProblem
  | 'multiple-blocks' | 'empty-block' | 'duplicate-label' | 'contract-value-not-lines' | 'too-many-lines' | 'protocol-declares-no-config-sources'
  /** STEP 3 pair rule: a `live-read` beside a `service-held` base (the base IS the served file) · a `live-read` with no base line. */
  | 'redundant-live-read' | 'live-read-without-base';

export type ConfigSourcesParse =
  | { state: 'absent' }
  | { state: 'unparseable'; problem: ConfigBlockProblem; lineIndex: number | null }
  | { state: 'parsed'; entries: ConfigSourceLine[] };

export type LegConfigSources =
  | { state: 'absent'; grammarVersion: number }
  | { state: 'unparseable'; grammarVersion: number; source: 'contract' | 'task-body'; problem: ConfigBlockProblem; lineIndex: number | null }
  | { state: 'conflict'; grammarVersion: number }
  | { state: 'parsed'; grammarVersion: number; source: 'contract' | 'task-body'; entries: ConfigSourceLine[] };

const MAX_LINES = 256;

function kindsOf(protocol: string): readonly ConfigSourceKind[] {
  return CONFIG_SOURCE_KINDS_BY_PROTOCOL[canonicalProtocolName(protocol)] ?? [];
}

/** One line ⇒ one source, or the first problem. Never infers: every token must be where the grammar puts it. */
export function parseConfigSourceLine(raw: string, protocol: string): { ok: true; line: ConfigSourceLine } | { ok: false; problem: ConfigLineProblem } {
  const kinds = kindsOf(protocol);
  const head = sourceLineHead(raw);
  if (!head) return { ok: false, problem: 'not-a-source-line' };
  if (!isSourceLabel(head.label)) return { ok: false, problem: 'device-name-invalid' };
  const kind = head.kind as ConfigSourceKind;
  if (!kinds.includes(kind)) return { ok: false, problem: 'unknown-kind' };
  switch (kind) {
    case 'supplied':
      return head.rest === '' ? { ok: true, line: { label: head.label, kind } } : { ok: false, problem: 'trailing-text' };
    case 'service-held': {
      // The same shape as `live-read` (`— service <name>`), parsed by the SAME function so a separator or a service name cannot
      // drift between the two: the line is handed to it with the kind token swapped.
      const p = parseSourceLineCore(`${head.label}: live-read${head.rest}`, true);
      if (!p.ok) return p;
      return p.line.kind === 'live-read' ? { ok: true, line: { label: p.line.device, kind: 'service-held', service: p.line.service } } : { ok: false, problem: 'unknown-kind' };
    }
    case 'git-file':
    case 'live-read': {
      // The network grammar parses these two kinds; `live-read` is passed as ON because a Config-sources protocol's kind table —
      // not the network kind gate — decides whether the kind exists here.
      const p = parseSourceLineCore(raw, true);
      if (!p.ok) return p;
      const l = p.line;
      if (l.kind === 'git-file') {
        if (heldPathRefusal(l.path) !== null) return { ok: false, problem: 'path-never-held' };
        return { ok: true, line: { label: l.device, kind: 'git-file', service: l.service, owner: l.owner, repo: l.repo, path: l.path, ref: l.ref } };
      }
      if (l.kind === 'live-read') return { ok: true, line: { label: l.device, kind: 'live-read', service: l.service } };
      return { ok: false, problem: 'unknown-kind' };
    }
    default: return assertNeverConfigKind(kind);
  }
}

/** The block rule over parsed entries, in order: the index (into `entries`) of the first entry that breaks it, with the problem —
 *  or null. `pairing: 'none'`: ONE line per label. `base-plus-live-read`: per label one base (`git-file` XOR `service-held`) and at
 *  most one `live-read`, which needs a `git-file` base on the same label (in either order). Shared by the line parser and the
 *  snapshot reader, so a stored snapshot can never hold what the grammar would refuse. */
export function configBlockRuleProblem(entries: readonly ConfigSourceLine[], protocol: string):
  { index: number; problem: 'duplicate-label' | 'redundant-live-read' | 'live-read-without-base' } | null {
  const pairing = configPairingOf(protocol);
  const seen = new Map<string, { base: ConfigSourceKind | null; live: boolean; liveIndex: number }>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const cur = seen.get(e.label);
    switch (pairing) {
      case 'none':
        if (cur) return { index: i, problem: 'duplicate-label' };
        seen.set(e.label, { base: e.kind, live: false, liveIndex: -1 });
        break;
      case 'base-plus-live-read': {
        const st = cur ?? { base: null, live: false, liveIndex: -1 };
        if (e.kind === 'live-read') {
          if (st.live) return { index: i, problem: 'duplicate-label' };
          if (st.base === 'service-held') return { index: i, problem: 'redundant-live-read' };
          st.live = true; st.liveIndex = i;
        } else {
          if (st.base !== null) return { index: i, problem: 'duplicate-label' };
          if (st.live && e.kind !== 'git-file') return { index: st.liveIndex, problem: 'redundant-live-read' };
          st.base = e.kind;
        }
        seen.set(e.label, st);
        break;
      }
      default: { const never: never = pairing; throw new Error(`unhandled config pairing: ${String(never)}`); }
    }
  }
  if (pairing === 'base-plus-live-read') {
    for (const st of seen.values()) if (st.live && st.base === null) return { index: st.liveIndex, problem: 'live-read-without-base' };
  }
  return null;
}

/** The grammar version a PARSED block carries: 2 when it uses `service-held` or puts two lines on one label (a pair), else 1. */
export function grammarVersionOfConfigEntries(entries: readonly ConfigSourceLine[]): number {
  const labels = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'service-held' || labels.has(e.label)) return CONFIG_SOURCES_GRAMMAR_VERSION_PAIRED;
    labels.add(e.label);
  }
  return CONFIG_SOURCES_GRAMMAR_VERSION;
}

/** Lines ⇒ a parse. Every non-blank line must parse; then the protocol's block rule (one line per label, or the pair rule). */
export function parseConfigSourceLines(lines: readonly string[], protocol: string): ConfigSourcesParse {
  if (kindsOf(protocol).length === 0) return { state: 'unparseable', problem: 'protocol-declares-no-config-sources', lineIndex: null };
  const nonBlank = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim() !== '');
  if (nonBlank.length === 0) return { state: 'unparseable', problem: 'empty-block', lineIndex: null };
  if (nonBlank.length > MAX_LINES) return { state: 'unparseable', problem: 'too-many-lines', lineIndex: null };
  const entries: ConfigSourceLine[] = [];
  const at: number[] = [];
  for (const { l, i } of nonBlank) {
    const p = parseConfigSourceLine(l, protocol);
    if (!p.ok) return { state: 'unparseable', problem: p.problem, lineIndex: i };
    entries.push(p.line); at.push(i);
    // Checked as each line is added, so the FIRST offending line is named (for `pairing: 'none'` exactly as before).
    const bad = configBlockRuleProblem(entries, protocol);
    if (bad && bad.problem !== 'live-read-without-base') return { state: 'unparseable', problem: bad.problem, lineIndex: at[bad.index] };
  }
  const bad = configBlockRuleProblem(entries, protocol);
  if (bad) return { state: 'unparseable', problem: bad.problem, lineIndex: at[bad.index] };
  return { state: 'parsed', entries };
}

const BLOCK_HEADING_RE = /^#{1,6}[ \t]+Config sources:?[ \t]*$/i;
const ANY_HEADING_RE = /^#{1,6}[ \t]+\S/;

/** The `## Config sources` block in a task body: the run of non-blank lines after the heading, ending at a blank line, the next
 *  heading, or the end. Two headings ⇒ unparseable. (The `## Device sources` rule, for this heading.) */
export function parseConfigSourcesBlock(text: string | null | undefined, protocol: string): ConfigSourcesParse {
  if (typeof text !== 'string' || text.length === 0) return { state: 'absent' };
  const lines = text.split(/\r?\n/);
  const heads = lines.map((l, i) => (BLOCK_HEADING_RE.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  if (heads.length === 0) return { state: 'absent' };
  if (heads.length > 1) return { state: 'unparseable', problem: 'multiple-blocks', lineIndex: heads[1] };
  let i = heads[0] + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  const block: string[] = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || ANY_HEADING_RE.test(t)) break;
    block.push(lines[i]);
  }
  return parseConfigSourceLines(block, protocol);
}

/** The contract's `configSources["<token>"]` value: a multi-line string or an array of line strings. ONE leading
 *  `## Config sources` heading line is dropped (the Program Architect copies the block with its heading — measured for network). */
export function parseConfigSourcesContractValue(value: unknown, protocol: string): ConfigSourcesParse {
  if (value === undefined || value === null) return { state: 'absent' };
  let lines: string[];
  if (typeof value === 'string') lines = value.split(/\r?\n/);
  else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) lines = (value as string[]).flatMap((v) => v.split(/\r?\n/));
  else return { state: 'unparseable', problem: 'contract-value-not-lines', lineIndex: null };
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0 && BLOCK_HEADING_RE.test(lines[first].trim())) lines = [...lines.slice(0, first), '', ...lines.slice(first + 1)];
  return parseConfigSourceLines(lines, protocol);
}

/** Order-insensitive identity of one entry. `live-read` is keyed WITH its service: an edit of the evidence service is a change. */
function entryKey(e: ConfigSourceLine): unknown[] {
  switch (e.kind) {
    case 'git-file': return [e.label, e.kind, e.service, e.owner, e.repo, e.path, e.ref];
    case 'live-read': return [e.label, e.kind, e.service];
    case 'supplied': return [e.label, e.kind];
    case 'service-held': return [e.label, e.kind, e.service];
    default: return assertNeverConfigKind(e);
  }
}
function entrySetKey(entries: readonly ConfigSourceLine[]): string {
  return entries.map((e) => JSON.stringify(entryKey(e))).sort().join('\n');
}

/** The leg's declaration: the contract's value when present, else the task body's block; both present and not equal ⇒ conflict. */
export function resolveLegConfigSources(input: { protocol: string; contractValue: unknown; taskBody: string | null | undefined }): LegConfigSources {
  const g = CONFIG_SOURCES_GRAMMAR_VERSION;
  const c = parseConfigSourcesContractValue(input.contractValue, input.protocol);
  const b = parseConfigSourcesBlock(input.taskBody, input.protocol);
  if (c.state === 'unparseable') return { state: 'unparseable', grammarVersion: g, source: 'contract', problem: c.problem, lineIndex: c.lineIndex };
  if (c.state === 'parsed') {
    if (b.state === 'absent') return { state: 'parsed', grammarVersion: grammarVersionOfConfigEntries(c.entries), source: 'contract', entries: c.entries };
    if (b.state === 'unparseable' || entrySetKey(b.entries) !== entrySetKey(c.entries)) return { state: 'conflict', grammarVersion: g };
    return { state: 'parsed', grammarVersion: grammarVersionOfConfigEntries(c.entries), source: 'contract', entries: c.entries };
  }
  if (b.state === 'unparseable') return { state: 'unparseable', grammarVersion: g, source: 'task-body', problem: b.problem, lineIndex: b.lineIndex };
  if (b.state === 'parsed') return { state: 'parsed', grammarVersion: grammarVersionOfConfigEntries(b.entries), source: 'task-body', entries: b.entries };
  return { state: 'absent', grammarVersion: g };
}

/** Two resolutions declare the same thing (the `sameDeclaration` rule of device-sources.ts, for this grammar). */
export function sameConfigDeclaration(a: LegConfigSources, b: LegConfigSources): boolean {
  if (a.state !== b.state) return false;
  if (a.state === 'parsed' && b.state === 'parsed') return entrySetKey(a.entries) === entrySetKey(b.entries);
  if (a.state === 'unparseable' && b.state === 'unparseable') return a.source === b.source && a.problem === b.problem && a.lineIndex === b.lineIndex;
  return true;
}

/** The contract value at `configSources["<key>"]`, or undefined. `configSources` must be an object keyed by protocol token; any
 *  other shape is handed on as a non-line value (`contract-value-not-lines`) — reading it as lines would be inferring a leg. */
export function contractConfigSourcesValue(interfaceContract: unknown, contractKey: string): unknown {
  if (!interfaceContract || typeof interfaceContract !== 'object' || Array.isArray(interfaceContract)) return undefined;
  const cs = (interfaceContract as Record<string, unknown>).configSources;
  if (cs === undefined || cs === null) return undefined;
  if (typeof cs !== 'object' || Array.isArray(cs)) return { configSourcesNotKeyedByToken: true };
  return (cs as Record<string, unknown>)[contractKey];
}

// ── The immutable declaration snapshot (the deviceSourcesSnapshot rule): taken ONCE at the leg's first execution, stored under
// `task.metadata.configSourcesSnapshot` (an AUDIT_STRIP_KEYS member — no client surface can write it), and read from there by
// capture and the facts, never from the live description. It names its protocol, so its entries are validated against THAT
// protocol's kinds.
/** STEP 3 (plan §13 A1): the outcome of the block-level LABEL check, made ONCE when the snapshot is taken and stored BESIDE the
 *  resolution — never inside it. The stored `resolution` stays what the grammar gives (`parsed`); the governing read returns the
 *  named problem from this field. (Stored as an `unparseable` resolution, the live re-parse — which never consults the label table —
 *  would read `parsed`, and the leg would be forced `snapshot-changed`: the wrong name.) Absent on a protocol with no label table —
 *  every Kubernetes and Terraform snapshot, the 9 stored ones included. */
export type ConfigLabelCheck =
  | { table: string; state: 'resolved' }
  | { table: string; state: 'problem'; problem: ConfigLabelProblem; lineIndex: number | null };
export interface ConfigSourcesSnapshot { version: number; takenAt: string; protocol: string; resolution: LegConfigSources; labelCheck?: ConfigLabelCheck }

export function buildConfigSourcesSnapshot(protocol: string, resolution: LegConfigSources, takenAt: string, labelCheck?: ConfigLabelCheck | null): ConfigSourcesSnapshot {
  return { version: CONFIG_SOURCES_SNAPSHOT_VERSION, takenAt, protocol: canonicalProtocolName(protocol), resolution, ...(labelCheck ? { labelCheck } : {}) };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
/** A stored entry is valid when printing it as a line and parsing that line gives the same entry back — the parser is the only
 *  authority on what a valid entry is, so the snapshot reader cannot accept something the grammar would refuse. */
function printLine(e: ConfigSourceLine): string {
  switch (e.kind) {
    case 'git-file': return `${e.label}: git-file — service ${e.service} ; ${e.owner}/${e.repo}/${e.path}${e.ref === null ? '' : ` @ ${e.ref}`}`;
    case 'live-read': return `${e.label}: live-read — service ${e.service}`;
    case 'supplied': return `${e.label}: supplied`;
    case 'service-held': return `${e.label}: service-held — service ${e.service}`;
    default: return assertNeverConfigKind(e);
  }
}
/** The stored field count per kind (label + kind + the kind's own fields). A `Record` over the kind union: a new kind fails to
 *  compile here until its count is stated. */
const ENTRY_FIELD_COUNT: Readonly<Record<ConfigSourceKind, number>> = Object.freeze({ 'git-file': 7, 'live-read': 3, 'supplied': 2, 'service-held': 3 });
function validEntry(e: unknown, protocol: string): e is ConfigSourceLine {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const x = e as Record<string, unknown>;
  if (!isStr(x.label) || !CONFIG_SOURCE_KINDS.includes(x.kind as ConfigSourceKind)) return false;
  if (Object.keys(x).length !== ENTRY_FIELD_COUNT[x.kind as ConfigSourceKind]) return false;
  if (x.kind === 'git-file' && !(isStr(x.service) && isStr(x.owner) && isStr(x.repo) && isStr(x.path) && (x.ref === null || isStr(x.ref)))) return false;
  if ((x.kind === 'live-read' || x.kind === 'service-held') && !isStr(x.service)) return false;
  const line = printLine(x as unknown as ConfigSourceLine);
  if (/[\r\n]/.test(line)) return false;
  const back = parseConfigSourceLine(line, protocol);
  return back.ok && JSON.stringify(entryKey(back.line)) === JSON.stringify(entryKey(x as unknown as ConfigSourceLine));
}

function readLabelCheck(raw: unknown): ConfigLabelCheck | null | 'invalid' {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'invalid';
  const c = raw as Record<string, unknown>;
  if (!isStr(c.table) || c.table.length === 0 || c.table.length > 64) return 'invalid';
  if (c.state === 'resolved' && Object.keys(c).length === 2) return { table: c.table, state: 'resolved' };
  if (c.state === 'problem' && Object.keys(c).length === 4 && (CONFIG_LABEL_PROBLEMS as readonly unknown[]).includes(c.problem)
    && (c.lineIndex === null || (typeof c.lineIndex === 'number' && Number.isInteger(c.lineIndex) && c.lineIndex >= 0))) {
    return { table: c.table, state: 'problem', problem: c.problem as ConfigLabelProblem, lineIndex: c.lineIndex as number | null };
  }
  return 'invalid';
}

/** The stored snapshot, validated strictly: the snapshot, `null` when the key is absent, or `'unreadable'`.
 *  STEP 3 (plan W6, §13 A1): the reader ACCEPTS grammar versions 1 and 2 and CARRIES the stored version (it used to rewrite it with
 *  the constant); a parsed resolution's version must be the one its entries give. It CARRIES `labelCheck`, validated against the closed
 *  problem set. On a protocol that HAS a label table a parsed snapshot MUST carry it, under that table's name (else `unreadable` —
 *  fail closed); on a protocol with none it must be absent (all 9 stored snapshots: read as before).
 *  It never consults the label table itself — a later table edit cannot move a stored snapshot. */
export function readConfigSourcesSnapshot(metadata: unknown): ConfigSourcesSnapshot | null | 'unreadable' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[CONFIG_SOURCES_SNAPSHOT_KEY];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'unreadable';
  const s = raw as Record<string, unknown>;
  if (s.version !== CONFIG_SOURCES_SNAPSHOT_VERSION || !isStr(s.takenAt) || !isStr(s.protocol)) return 'unreadable';
  if (kindsOf(s.protocol).length === 0 || canonicalProtocolName(s.protocol) !== s.protocol) return 'unreadable';
  const r = s.resolution as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.grammarVersion !== 'number' || !CONFIG_SOURCES_GRAMMAR_VERSIONS.includes(r.grammarVersion)) return 'unreadable';
  const g = r.grammarVersion;
  const label = readLabelCheck(s.labelCheck);
  const labelTable = configLabelTableOf(s.protocol);
  if (label === 'invalid' || (label !== null && (labelTable === null || r.state !== 'parsed'))) return 'unreadable';
  // FAIL CLOSED (review fix, architectural F1): on a protocol WITH a label table the writer always stores the check beside a parsed
  // resolution, under that table's name. A parsed snapshot that lacks it, or names another table, was not written by this code —
  // reading it as "labels fine" would let an unchecked label govern.
  if (labelTable !== null && r.state === 'parsed' && (label === null || label.table !== labelTable)) return 'unreadable';
  const base = { version: CONFIG_SOURCES_SNAPSHOT_VERSION, takenAt: s.takenAt, protocol: s.protocol };
  const tail = label ? { labelCheck: label } : {};
  const src = r.source === 'contract' || r.source === 'task-body';
  // Only a PARSED block can be version 2 (the resolver gives every other state the constant).
  if (r.state !== 'parsed' && g !== CONFIG_SOURCES_GRAMMAR_VERSION) return 'unreadable';
  if (r.state === 'absent' || r.state === 'conflict') return { ...base, resolution: { state: r.state, grammarVersion: g } };
  if (r.state === 'unparseable' && src && isStr(r.problem) && (r.lineIndex === null || typeof r.lineIndex === 'number')) {
    return { ...base, resolution: { state: 'unparseable', grammarVersion: g, source: r.source as 'contract' | 'task-body',
      problem: r.problem as ConfigBlockProblem, lineIndex: r.lineIndex as number | null } };
  }
  if (r.state === 'parsed' && src && Array.isArray(r.entries) && r.entries.length > 0 && r.entries.length <= MAX_LINES
    && r.entries.every((e) => validEntry(e, s.protocol as string))
    && configBlockRuleProblem(r.entries as ConfigSourceLine[], s.protocol) === null
    && grammarVersionOfConfigEntries(r.entries as ConfigSourceLine[]) === g) {
    return { ...base, resolution: { state: 'parsed', grammarVersion: g, source: r.source as 'contract' | 'task-body', entries: r.entries as ConfigSourceLine[] }, ...tail };
  }
  return 'unreadable';
}

/** The `git-file` lines of a parsed declaration — the files this leg keeps. Empty for every other state. */
export function declaredGitFiles(r: LegConfigSources): Array<Extract<ConfigSourceLine, { kind: 'git-file' }>> {
  return r.state === 'parsed' ? r.entries.filter((e): e is Extract<ConfigSourceLine, { kind: 'git-file' }> => e.kind === 'git-file') : [];
}
