/**
 * held-network STEP 3 batch 2b (P3 / S3-A, 2026-10-26) — the ONE strict grammar for a leg's `## Device sources` block.
 *
 * The network-provisioning protocol (1.24.0, `scripts/seed-protocol-prompts.ts` § "Device sources — declared, never inferred")
 * tells the leg harness and the Harvester to read, per device, exactly the source the task DECLARES:
 *
 *   <device>: git-file — service <name | descriptor URL> ; <owner>/<repo>/<path> [@ <branch|tag|commit>]
 *   <device>: device-read — service <name | descriptor URL>
 *   <device>: command-package
 *
 * Until this module, only the LLM harness read those lines. The platform now reads THE SAME LINES, server-side, at capture
 * time, so a device configuration is held only for a device the leg DECLARES `device-read` (an undeclared read can never
 * become a held base — STEP2-TEXT-DRAFT §11, S-NOBLOCK).
 *
 * RULES (owner S3-A, 2026-10-25):
 *   - The block comes from the leg's interface contract (`inputContext.interfaceContract.deviceSources["network-provisioning"]`,
 *     the Program Architect's copy) when present, else from the leg task body (`## Device sources` heading). Both present and
 *     different ⇒ `conflict` (the harness STOPS on that; the platform holds nothing) — never choose one.
 *   - STRICT, FAIL CLOSED: a block with ANY line that does not parse is `unparseable` as a whole, with the first problem named.
 *     Nothing is guessed, normalised into meaning, or inferred: an ASCII hyphen in place of the em dash is a problem, not a
 *     synonym. The tolerated presentation is exactly what the protocol itself prints: one optional list marker (`- ` / `* `)
 *     and one optional pair of enclosing backticks around the whole line.
 *   - A missing block is `absent`, never a source. On a HELD-CAPABLE leg the carrier forces it (`device-sources-absent`, owner D-1
 *     2026-10-26 — the protocol stops a leg whose device has no line); this module only names the state.
 *
 * PURE: no prisma, no logger. Pinned by scripts/test-device-sources.ts, whose fixtures are DERIVED from the protocol text's
 * own template lines (placeholders substituted), so a protocol rewording reds the test instead of drifting from it.
 */

export const DEVICE_SOURCES_GRAMMAR_VERSION = 1;
/** The interface-contract key the Program Architect writes (`deviceSources["network-provisioning"]`). */
export const DEVICE_SOURCES_CONTRACT_KEY = 'network-provisioning';
/** The separator the protocol prints: SPACE, U+2014 EM DASH, SPACE. Nothing else is accepted. */
export const SOURCE_SEPARATOR = ' — ';

export type DeviceSourceKind = 'git-file' | 'device-read' | 'command-package';

export type DeviceSourceLine =
  | { device: string; kind: 'git-file'; service: string; owner: string; repo: string; path: string; ref: string | null }
  | { device: string; kind: 'device-read'; service: string }
  | { device: string; kind: 'command-package' };

export type LineProblem =
  | 'not-a-source-line'       // no `<device>: <kind>` head
  | 'device-name-invalid'
  | 'unknown-kind'
  | 'separator-invalid'       // the ` — service ` part is missing or spelled differently
  | 'service-invalid'
  | 'git-coordinates-invalid'
  | 'ref-invalid'
  | 'trailing-text';          // `command-package` followed by anything

export type BlockProblem = LineProblem
  | 'multiple-blocks' | 'empty-block' | 'duplicate-source' | 'command-package-not-alone' | 'contract-value-not-lines' | 'too-many-lines';

export type DeviceSourcesParse =
  | { state: 'absent' }
  | { state: 'unparseable'; problem: BlockProblem; lineIndex: number | null }
  | { state: 'parsed'; entries: DeviceSourceLine[] };

export type LegDeviceSources =
  | { state: 'absent'; grammarVersion: number }
  | { state: 'unparseable'; grammarVersion: number; source: 'contract' | 'task-body'; problem: BlockProblem; lineIndex: number | null }
  | { state: 'conflict'; grammarVersion: number }
  | { state: 'parsed'; grammarVersion: number; source: 'contract' | 'task-body'; entries: DeviceSourceLine[] };

const MAX_LINES = 256;
const DEVICE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OWNER_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const PATH_SEG_RE = /^[A-Za-z0-9._@+-]{1,255}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const HEAD_RE = /^([^\s:]+):[ ]([a-z-]+)(.*)$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Strip the presentation the protocol itself uses: one list marker, then one pair of enclosing backticks. */
function unwrap(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('- ') || s.startsWith('* ')) s = s.slice(2).trim();
  if (s.length >= 2 && s.startsWith('`') && s.endsWith('`') && !s.slice(1, -1).includes('`')) s = s.slice(1, -1);
  return s;
}

function serviceProblem(svc: string): boolean {
  return svc.length === 0 || svc.length > 512 || svc !== svc.trim() || CONTROL_RE.test(svc) || svc.includes('`') || svc.includes(';')
    || svc.includes(SOURCE_SEPARATOR.trim());
}

/** One line ⇒ one source, or the first problem. Never infers: every token must be where the grammar puts it. */
export function parseDeviceSourceLine(raw: string): { ok: true; line: DeviceSourceLine } | { ok: false; problem: LineProblem } {
  const s = unwrap(raw);
  const head = HEAD_RE.exec(s);
  if (!head) return { ok: false, problem: 'not-a-source-line' };
  const [, device, kind, rest] = head;
  if (!DEVICE_RE.test(device)) return { ok: false, problem: 'device-name-invalid' };
  if (kind === 'command-package') {
    return rest === '' ? { ok: true, line: { device, kind } } : { ok: false, problem: 'trailing-text' };
  }
  if (kind !== 'git-file' && kind !== 'device-read') return { ok: false, problem: 'unknown-kind' };
  const lead = `${SOURCE_SEPARATOR}service `;
  if (!rest.startsWith(lead)) return { ok: false, problem: 'separator-invalid' };
  const body = rest.slice(lead.length);
  if (kind === 'device-read') {
    return serviceProblem(body) ? { ok: false, problem: 'service-invalid' } : { ok: true, line: { device, kind, service: body } };
  }
  // git-file: `<service> ; <owner>/<repo>/<path> [@ <ref>]` — exactly one ` ; `, at most one ` @ `.
  const semi = body.split(' ; ');
  if (semi.length !== 2) return { ok: false, problem: 'git-coordinates-invalid' };
  const service = semi[0];
  if (serviceProblem(service)) return { ok: false, problem: 'service-invalid' };
  const at = semi[1].split(' @ ');
  if (at.length > 2) return { ok: false, problem: 'ref-invalid' };
  const coords = at[0];
  const ref = at.length === 2 ? at[1] : null;
  if (ref !== null && !REF_RE.test(ref)) return { ok: false, problem: 'ref-invalid' };
  const parts = coords.split('/');
  if (parts.length < 3) return { ok: false, problem: 'git-coordinates-invalid' };
  const [owner, repo, ...pathSegs] = parts;
  if (!OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo)) return { ok: false, problem: 'git-coordinates-invalid' };
  if (pathSegs.some((p) => !PATH_SEG_RE.test(p) || p === '.' || p === '..')) return { ok: false, problem: 'git-coordinates-invalid' };
  return { ok: true, line: { device, kind, service, owner, repo, path: pathSegs.join('/'), ref } };
}

/** Lines ⇒ a parse. Every non-blank line must parse; then the per-device rules (command-package alone, one source per kind). */
export function parseDeviceSourceLines(lines: readonly string[]): DeviceSourcesParse {
  const nonBlank = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim() !== '');
  if (nonBlank.length === 0) return { state: 'unparseable', problem: 'empty-block', lineIndex: null };
  if (nonBlank.length > MAX_LINES) return { state: 'unparseable', problem: 'too-many-lines', lineIndex: null };
  const entries: DeviceSourceLine[] = [];
  for (const { l, i } of nonBlank) {
    const p = parseDeviceSourceLine(l);
    if (!p.ok) return { state: 'unparseable', problem: p.problem, lineIndex: i };
    entries.push(p.line);
  }
  const byDevice = new Map<string, DeviceSourceKind[]>();
  for (const e of entries) byDevice.set(e.device, [...(byDevice.get(e.device) ?? []), e.kind]);
  for (const kinds of byDevice.values()) {
    if (kinds.includes('command-package') && kinds.length > 1) return { state: 'unparseable', problem: 'command-package-not-alone', lineIndex: null };
    if (new Set(kinds).size !== kinds.length) return { state: 'unparseable', problem: 'duplicate-source', lineIndex: null };
  }
  return { state: 'parsed', entries };
}

const BLOCK_HEADING_RE = /^#{1,6}[ \t]+Device sources:?[ \t]*$/i;
const ANY_HEADING_RE = /^#{1,6}[ \t]+\S/;

/** The `## Device sources` block in a task body. The block is the run of non-blank lines after the heading (blank lines
 *  directly under the heading are skipped), ending at a blank line, the next heading, or the end. Two headings ⇒ unparseable. */
export function parseDeviceSourcesBlock(text: string | null | undefined): DeviceSourcesParse {
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
  return parseDeviceSourceLines(block);
}

/** The contract's `deviceSources["network-provisioning"]` value: a multi-line string or an array of line strings. */
export function parseDeviceSourcesContractValue(value: unknown): DeviceSourcesParse {
  if (value === undefined || value === null) return { state: 'absent' };
  let lines: string[];
  if (typeof value === 'string') lines = value.split(/\r?\n/);
  else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) lines = (value as string[]).flatMap((v) => v.split(/\r?\n/));
  else return { state: 'unparseable', problem: 'contract-value-not-lines', lineIndex: null };
  // The Program Architect copies the block "exactly from the requirements" — measured 2026-10-26 on prod (2 of 2 contract-carried
  // declarations): its own `## Device sources` heading comes along as the first line. That heading is the block's, not a source,
  // so ONE leading heading line is dropped; a heading anywhere else is still a non-source line (unparseable).
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0 && BLOCK_HEADING_RE.test(lines[first].trim())) lines = [...lines.slice(0, first), '', ...lines.slice(first + 1)];
  return parseDeviceSourceLines(lines);
}

/** Order-insensitive identity of a parsed entry set (contract vs task body). */
function entrySetKey(entries: readonly DeviceSourceLine[]): string {
  return entries.map((e) => JSON.stringify(e.kind === 'git-file'
    ? [e.device, e.kind, e.service, e.owner, e.repo, e.path, e.ref]
    : e.kind === 'device-read' ? [e.device, e.kind, e.service] : [e.device, e.kind])).sort().join('\n');
}

/**
 * The leg's declaration, decided exactly as the protocol tells the harness: the contract's value when present, else the task
 * body's block; both present and not equal ⇒ conflict. An unparseable side is reported as such (the contract first).
 */
export function resolveLegDeviceSources(input: { contractValue: unknown; taskBody: string | null | undefined }): LegDeviceSources {
  const g = DEVICE_SOURCES_GRAMMAR_VERSION;
  const c = parseDeviceSourcesContractValue(input.contractValue);
  const b = parseDeviceSourcesBlock(input.taskBody);
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

// ── held-network step 3 push 2 (O-2, the J1 entry gate — sec-ops batch-2b SF-1): the IMMUTABLE declaration snapshot ──────────
/**
 * An agent with `task.update` can rewrite its own STANDALONE leg's description, and so its own `## Device sources` block — and with
 * it which device configuration the platform holds as a base. So the platform takes the declaration ONCE, at the leg's FIRST
 * execution (`prepare-task-for-execution.ts`, in the same statement as the protocol stamp, before any child exists), and stores the
 * RESOLUTION under `task.metadata.deviceSourcesSnapshot` — an AUDIT_STRIP_KEYS member, so no client surface (MCP included) can write
 * it. Capture and the device facts read the SNAPSHOT (device-sources-read.ts), never the live description:
 *   - no snapshot (a leg first executed before this shipped, or a write that never happened) ⇒ `snapshot-absent`: hold nothing;
 *   - a snapshot that does not validate ⇒ `snapshot-unreadable`: hold nothing;
 *   - the live declaration (contract value + task body, resolved by the SAME grammar) no longer resolves to the snapshot ⇒
 *     `snapshot-changed`: hold nothing, named — an edit after the first execution is never adopted, and never silently ignored.
 * A contract-carried declaration is immutable already (MCP `task.update` refuses `interfaceContract`); the snapshot covers it too,
 * so both sources are read the one way.
 */
export const DEVICE_SOURCES_SNAPSHOT_KEY = 'deviceSourcesSnapshot';
export const DEVICE_SOURCES_SNAPSHOT_VERSION = 1;

export interface DeviceSourcesSnapshot { version: number; takenAt: string; resolution: LegDeviceSources }

export function buildDeviceSourcesSnapshot(resolution: LegDeviceSources, takenAt: string): DeviceSourcesSnapshot {
  return { version: DEVICE_SOURCES_SNAPSHOT_VERSION, takenAt, resolution };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
function validEntry(e: unknown): e is DeviceSourceLine {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const x = e as Record<string, unknown>;
  if (!isStr(x.device) || !DEVICE_RE.test(x.device)) return false;
  if (x.kind === 'command-package') return Object.keys(x).length === 2;
  if (!isStr(x.service) || serviceProblem(x.service)) return false;
  if (x.kind === 'device-read') return Object.keys(x).length === 3;
  if (x.kind !== 'git-file') return false;
  return isStr(x.owner) && OWNER_REPO_RE.test(x.owner) && isStr(x.repo) && OWNER_REPO_RE.test(x.repo) && isStr(x.path)
    && x.path.split('/').every((p) => PATH_SEG_RE.test(p) && p !== '.' && p !== '..')
    && (x.ref === null || (isStr(x.ref) && REF_RE.test(x.ref))) && Object.keys(x).length === 7;
}

/** The stored snapshot, validated strictly (platform-written, but read on the security path): the snapshot, `null` when the key is
 *  absent, or `'unreadable'`. */
export function readDeviceSourcesSnapshot(metadata: unknown): DeviceSourcesSnapshot | null | 'unreadable' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[DEVICE_SOURCES_SNAPSHOT_KEY];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'unreadable';
  const s = raw as Record<string, unknown>;
  if (s.version !== DEVICE_SOURCES_SNAPSHOT_VERSION || !isStr(s.takenAt)) return 'unreadable';
  const r = s.resolution as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.grammarVersion !== DEVICE_SOURCES_GRAMMAR_VERSION) return 'unreadable';
  const src = r.source === 'contract' || r.source === 'task-body';
  if (r.state === 'absent' || r.state === 'conflict') return { version: 1, takenAt: s.takenAt, resolution: { state: r.state, grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION } };
  if (r.state === 'unparseable' && src && isStr(r.problem) && (r.lineIndex === null || typeof r.lineIndex === 'number')) {
    return { version: 1, takenAt: s.takenAt, resolution: { state: 'unparseable', grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION,
      source: r.source as 'contract' | 'task-body', problem: r.problem as BlockProblem, lineIndex: r.lineIndex as number | null } };
  }
  if (r.state === 'parsed' && src && Array.isArray(r.entries) && r.entries.length > 0 && r.entries.length <= MAX_LINES && r.entries.every(validEntry)) {
    return { version: 1, takenAt: s.takenAt, resolution: { state: 'parsed', grammarVersion: DEVICE_SOURCES_GRAMMAR_VERSION,
      source: r.source as 'contract' | 'task-body', entries: r.entries as DeviceSourceLine[] } };
  }
  return 'unreadable';
}

/** Two resolutions declare the same thing: the same state, and for a parsed one the same entry set (order-insensitive; the side
 *  it came from is not part of the identity — the contract wins over an equal body by construction). */
export function sameDeclaration(a: LegDeviceSources, b: LegDeviceSources): boolean {
  if (a.state !== b.state) return false;
  if (a.state === 'parsed' && b.state === 'parsed') return entrySetKey(a.entries) === entrySetKey(b.entries);
  if (a.state === 'unparseable' && b.state === 'unparseable') return a.source === b.source && a.problem === b.problem && a.lineIndex === b.lineIndex;
  return true;
}

/** Is this declared service a descriptor URL (the run registers it) rather than a registered service name? */
export function isDescriptorUrlService(service: string): boolean {
  return /^https?:\/\//i.test(service);
}

/** The contract value at the documented key, or undefined. The contract is a plain object; anything else carries none. */
export function contractDeviceSourcesValue(interfaceContract: unknown): unknown {
  if (!interfaceContract || typeof interfaceContract !== 'object' || Array.isArray(interfaceContract)) return undefined;
  const ds = (interfaceContract as Record<string, unknown>).deviceSources;
  if (ds === undefined || ds === null) return undefined;
  // `deviceSources` must be an object keyed by protocol token. Any other shape is NOT read as lines (that would be inferring
  // which leg it meant) — it is handed on as a non-line value, which parses `contract-value-not-lines`.
  if (typeof ds !== 'object' || Array.isArray(ds)) return { deviceSourcesNotKeyedByToken: true };
  return (ds as Record<string, unknown>)[DEVICE_SOURCES_CONTRACT_KEY];
}
