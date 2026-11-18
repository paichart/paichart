/**
 * Config sources STEP 2 (2026-11-15; plan STEPS-2-4-PLAN.md §2.2 / §3.2, owner decision (b)) — the ONE strict grammar for a leg's
 * `## Config sources` block. It generalises `device-sources.ts` (network) to the domains that keep a FILE rather than a device:
 * Kubernetes first, observability and Terraform at their own steps.
 *
 *   <file label>: git-file — service <registered name> ; <owner>/<repo>/<path> [@ <branch>]
 *   <cluster>: live-read — service <name | descriptor URL>
 *   <cluster>: supplied
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
export const CONFIG_SOURCES_SNAPSHOT_KEY = 'configSourcesSnapshot';
export const CONFIG_SOURCES_SNAPSHOT_VERSION = 1;

export type ConfigSourceKind = 'git-file' | 'live-read' | 'supplied';
/** Every kind, in grammar order — the kind-exhaustiveness pin walks THIS list through every kind switch. */
export const CONFIG_SOURCE_KINDS: readonly ConfigSourceKind[] = Object.freeze(['git-file', 'live-read', 'supplied']);
/** The kinds each protocol's block admits (canonical long name). A protocol absent here declares no Config sources. */
export const CONFIG_SOURCE_KINDS_BY_PROTOCOL: Readonly<Record<string, readonly ConfigSourceKind[]>> = Object.freeze({
  [canonicalProtocolName('kubernetes-gitops')]: Object.freeze(['git-file', 'live-read', 'supplied'] as ConfigSourceKind[]),
  // Config sources STEP 4 (2026-11-17): Terraform — `git-file` = a kept `.tf` file; `live-read` = the state, read as evidence through the
  // read-only service's render tools (never a state FILE); `supplied` = the engineer gave the state in the task.
  [canonicalProtocolName('terraform-iac')]: Object.freeze(['git-file', 'live-read', 'supplied'] as ConfigSourceKind[]),
});

export type ConfigSourceLine =
  /** A file in Git the platform KEEPS and the change edits by reference. */
  | { label: string; kind: 'git-file'; service: string; owner: string; repo: string; path: string; ref: string | null }
  /** The live system read as EVIDENCE — never held, never edited, never forced. */
  | { label: string; kind: 'live-read'; service: string }
  /** The engineer supplied the current state in the task: nothing is read, nothing is held. */
  | { label: string; kind: 'supplied' };

/** Exhaustiveness helper for kind switches: a new kind that reaches this is a compile error and, at runtime, a throw. */
export function assertNeverConfigKind(k: never): never { throw new Error(`unhandled config source kind: ${String(k)}`); }

/** A `git-file` line whose path the ONE never-held predicate refuses (`heldPathRefusal`: state, plan, tfvars, CLI credentials, an
 *  inventory). Config sources STEP 4 (plan §5.3, build decision D-T2): refused at RESOLUTION, for every Config-sources protocol, so the
 *  harness stops the leg rather than letting capture refuse and the carrier force — the call gate refuses the read on any route too. */
export type ConfigLineProblem = LineProblem | 'path-never-held';

export type ConfigBlockProblem = ConfigLineProblem
  | 'multiple-blocks' | 'empty-block' | 'duplicate-label' | 'contract-value-not-lines' | 'too-many-lines' | 'protocol-declares-no-config-sources';

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

/** Lines ⇒ a parse. Every non-blank line must parse; then ONE line per label. */
export function parseConfigSourceLines(lines: readonly string[], protocol: string): ConfigSourcesParse {
  if (kindsOf(protocol).length === 0) return { state: 'unparseable', problem: 'protocol-declares-no-config-sources', lineIndex: null };
  const nonBlank = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim() !== '');
  if (nonBlank.length === 0) return { state: 'unparseable', problem: 'empty-block', lineIndex: null };
  if (nonBlank.length > MAX_LINES) return { state: 'unparseable', problem: 'too-many-lines', lineIndex: null };
  const entries: ConfigSourceLine[] = [];
  const seen = new Set<string>();
  for (const { l, i } of nonBlank) {
    const p = parseConfigSourceLine(l, protocol);
    if (!p.ok) return { state: 'unparseable', problem: p.problem, lineIndex: i };
    if (seen.has(p.line.label)) return { state: 'unparseable', problem: 'duplicate-label', lineIndex: i };
    seen.add(p.line.label);
    entries.push(p.line);
  }
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
    if (b.state === 'absent') return { state: 'parsed', grammarVersion: g, source: 'contract', entries: c.entries };
    if (b.state === 'unparseable' || entrySetKey(b.entries) !== entrySetKey(c.entries)) return { state: 'conflict', grammarVersion: g };
    return { state: 'parsed', grammarVersion: g, source: 'contract', entries: c.entries };
  }
  if (b.state === 'unparseable') return { state: 'unparseable', grammarVersion: g, source: 'task-body', problem: b.problem, lineIndex: b.lineIndex };
  if (b.state === 'parsed') return { state: 'parsed', grammarVersion: g, source: 'task-body', entries: b.entries };
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
export interface ConfigSourcesSnapshot { version: number; takenAt: string; protocol: string; resolution: LegConfigSources }

export function buildConfigSourcesSnapshot(protocol: string, resolution: LegConfigSources, takenAt: string): ConfigSourcesSnapshot {
  return { version: CONFIG_SOURCES_SNAPSHOT_VERSION, takenAt, protocol: canonicalProtocolName(protocol), resolution };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
/** A stored entry is valid when printing it as a line and parsing that line gives the same entry back — the parser is the only
 *  authority on what a valid entry is, so the snapshot reader cannot accept something the grammar would refuse. */
function printLine(e: ConfigSourceLine): string {
  switch (e.kind) {
    case 'git-file': return `${e.label}: git-file — service ${e.service} ; ${e.owner}/${e.repo}/${e.path}${e.ref === null ? '' : ` @ ${e.ref}`}`;
    case 'live-read': return `${e.label}: live-read — service ${e.service}`;
    case 'supplied': return `${e.label}: supplied`;
    default: return assertNeverConfigKind(e);
  }
}
function validEntry(e: unknown, protocol: string): e is ConfigSourceLine {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const x = e as Record<string, unknown>;
  if (!isStr(x.label) || !CONFIG_SOURCE_KINDS.includes(x.kind as ConfigSourceKind)) return false;
  const want = x.kind === 'git-file' ? 7 : x.kind === 'live-read' ? 3 : 2;
  if (Object.keys(x).length !== want) return false;
  if (x.kind === 'git-file' && !(isStr(x.service) && isStr(x.owner) && isStr(x.repo) && isStr(x.path) && (x.ref === null || isStr(x.ref)))) return false;
  if (x.kind === 'live-read' && !isStr(x.service)) return false;
  const line = printLine(x as unknown as ConfigSourceLine);
  if (/[\r\n]/.test(line)) return false;
  const back = parseConfigSourceLine(line, protocol);
  return back.ok && JSON.stringify(entryKey(back.line)) === JSON.stringify(entryKey(x as unknown as ConfigSourceLine));
}

/** The stored snapshot, validated strictly: the snapshot, `null` when the key is absent, or `'unreadable'`. */
export function readConfigSourcesSnapshot(metadata: unknown): ConfigSourcesSnapshot | null | 'unreadable' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[CONFIG_SOURCES_SNAPSHOT_KEY];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'unreadable';
  const s = raw as Record<string, unknown>;
  if (s.version !== CONFIG_SOURCES_SNAPSHOT_VERSION || !isStr(s.takenAt) || !isStr(s.protocol)) return 'unreadable';
  if (kindsOf(s.protocol).length === 0 || canonicalProtocolName(s.protocol) !== s.protocol) return 'unreadable';
  const r = s.resolution as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.grammarVersion !== CONFIG_SOURCES_GRAMMAR_VERSION) return 'unreadable';
  const g = CONFIG_SOURCES_GRAMMAR_VERSION;
  const base = { version: CONFIG_SOURCES_SNAPSHOT_VERSION, takenAt: s.takenAt, protocol: s.protocol };
  const src = r.source === 'contract' || r.source === 'task-body';
  if (r.state === 'absent' || r.state === 'conflict') return { ...base, resolution: { state: r.state, grammarVersion: g } };
  if (r.state === 'unparseable' && src && isStr(r.problem) && (r.lineIndex === null || typeof r.lineIndex === 'number')) {
    return { ...base, resolution: { state: 'unparseable', grammarVersion: g, source: r.source as 'contract' | 'task-body',
      problem: r.problem as ConfigBlockProblem, lineIndex: r.lineIndex as number | null } };
  }
  if (r.state === 'parsed' && src && Array.isArray(r.entries) && r.entries.length > 0 && r.entries.length <= MAX_LINES
    && r.entries.every((e) => validEntry(e, s.protocol as string))
    && new Set((r.entries as ConfigSourceLine[]).map((e) => e.label)).size === r.entries.length) {
    return { ...base, resolution: { state: 'parsed', grammarVersion: g, source: r.source as 'contract' | 'task-body', entries: r.entries as ConfigSourceLine[] } };
  }
  return 'unreadable';
}

/** The `git-file` lines of a parsed declaration — the files this leg keeps. Empty for every other state. */
export function declaredGitFiles(r: LegConfigSources): Array<Extract<ConfigSourceLine, { kind: 'git-file' }>> {
  return r.state === 'parsed' ? r.entries.filter((e): e is Extract<ConfigSourceLine, { kind: 'git-file' }> => e.kind === 'git-file') : [];
}
