/**
 * Config sources STEP 2 (2026-11-15) — what a Config-sources leg may HOLD, and what it must hold. PURE.
 *
 * Until this step a Kubernetes leg held every file it read through the pinned Git service. From its Config-sources text version a
 * leg holds a Git file only when BOTH are true (READING-MAP §a rule 6 — "undeclared never held"):
 *   1. the pin admitted the read (unchanged — the call gate and the extractor), AND
 *   2. the file IS a `git-file` line of the leg's governing declaration (target + path; the line's ref must be one the platform pin
 *      admits, else the file held at that target + path is another revision — the network rule, `platformPinRefusesRef`).
 * A Git file the pin admits but no line declares is moved from `files` to the handleless refusal `git-file-not-declared`
 * (`detail.field = 'declaration'`) — never a base, never a handle. That is the in-pin-undeclared negative control.
 *
 * And the D-1 force (plan §3.8 rule 4), in the same push as the slot: every declared `git-file` line must have a held CAPTURE ref
 * in the leg's authoritative Harvester's capture, else the leg is forced `git-file-not-held` (`gitFilesNotHeld` names the labels).
 * A declaration that is not `parsed` forces by its own name (`config-sources-<state>`): no block (owner D1), unparseable, conflict,
 * a missing / unreadable / changed snapshot, or a read that could not be made.
 *
 * `live-read` and `supplied` lines never hold and never force.
 */
import type { LegConfigSourcesResolution } from '../config-sources-read';
import { CONFIG_SOURCE_KINDS_BY_PROTOCOL, declaredGitFiles, type ConfigSourceLine } from '../config-sources';
import { isSourceLabel } from '../device-sources';
import { serviceMatcher } from '../device-source-facts';
import { canonicalProtocolName } from '../program-protocol';
import { isFileOfGitLine } from './device-read-scope';
import { platformLabelTargets, resolveConfigLabel } from './config-label';
import type { ExtractResult, ExtractedFile, ExtractedRefusal } from './extract';

import { GIT_FILE_SOURCE_PINS, heldPathRefusal } from '@/lib/mcp/server/config/git-file-source-pin';

type GitLine = Extract<ConfigSourceLine, { kind: 'git-file' }>;
export const GIT_TARGET_PREFIX = 'github:';
export const CONFIG_FILES_NOT_HELD_CAP = 20;

/** A declared line on a PLATFORM pin's repo whose ref that pin never admits (the line's ref, else `main`) can never have been held AT
 *  THAT REF, so a file held at the same target + path never satisfies it (held-edit-carrier.ts `platformPinRefusesRef`, same rule). */
export function configPinRefusesRef(l: { owner: string; repo: string; ref: string | null }): boolean {
  const o = l.owner.toLowerCase(); const rp = l.repo.toLowerCase();
  return Object.values(GIT_FILE_SOURCE_PINS as Record<string, { owner: string; repo: string; refs: readonly string[] }>)
    .some((pin) => pin.owner.toLowerCase() === o && pin.repo.toLowerCase() === rp && !pin.refs.includes(l.ref ?? 'main'));
}

function lineOf(f: { target: string; path: string }, lines: readonly GitLine[]): GitLine | null {
  return lines.find((l) => !configPinRefusesRef(l) && isFileOfGitLine(f, l)) ?? null;
}

/** Capture scope. `sources` null/undefined or `not-config-source-leg` ⇒ the result unchanged (every leg that is not a Config-sources
 *  leg: byte-identical). Otherwise every Git-lane file must be a declared line; a declaration that is not `parsed` declares none. */
export function withConfigSourcesScope(ex: ExtractResult, sources: LegConfigSourcesResolution | null | undefined): ExtractResult {
  if (!sources || sources.state === 'not-config-source-leg') return ex;
  const lines = sources.state === 'parsed' ? declaredGitFiles(sources) : [];
  const files: ExtractedFile[] = []; const moved: ExtractedRefusal[] = [];
  for (const f of ex.files) {
    if (!f.target.startsWith(GIT_TARGET_PREFIX) || lineOf(f, lines)) { files.push(f); continue; }
    const { text: _t, sourceRevision: _r, ...rest } = f; void _t; void _r;
    moved.push({ ...rest, target: null, path: null, refusal: 'git-file-not-declared',
      detail: { field: 'declaration', ...(sources.state === 'parsed' ? {} : { state: sources.state }) } });
  }
  return moved.length ? { ...ex, files, refusals: [...ex.refusals, ...moved] } : ex;
}

// ── Config sources STEP 3 P2 (plan W8): capture is an ALLOW-LIST on a declared leg of a protocol whose block can name SERVICE files ──

/** A file a declared leg's service returned that NO line of the block declares (file level, handle-less, never held). */
export const SERVICE_FILE_NOT_DECLARED = 'service-file-not-declared';
/** A served file whose label has a `git-file` base and a `live-read` line: it is EVIDENCE for the Git-vs-served comparison, never a
 *  held base (file level, handle-less). A name of its own — `live-read-evidence-only` keeps its network meaning untouched (plan W10). */
export const SERVED_FILE_EVIDENCE_ONLY = 'served-file-evidence-only';
/** The two refusals this scope produces. They are NOT held candidates: capture never counts them toward the per-execution held
 *  counters (`seen`, `executionBytes`) — counting a file that was never going to be stored could push a later DECLARED file past the
 *  cap and force the leg for it (sec-ops ruling on evidence caps, condition E3; the same door stands open for an undeclared sibling). */
export const DECLARED_SCOPE_REFUSALS: ReadonlySet<string> = new Set([SERVICE_FILE_NOT_DECLARED, SERVED_FILE_EVIDENCE_ONLY]);
/** `detail.case` on a `service-file-not-declared` row — a CLOSED set (plan §13 B2). */
export const DECLARED_FILE_CASES = Object.freeze(['no-label', 'label-has-git-base-no-live-read', 'wrong-service', 'declaration-not-parsed', 'text-reverted'] as const);
export type DeclaredFileCase = (typeof DECLARED_FILE_CASES)[number];

/** Does this protocol's block name files a SERVICE holds (it has the `service-held` kind)? Only then is capture an allow-list. */
export function protocolDeclaresServiceFiles(protocol: string | null | undefined): boolean {
  return !!protocol && (CONFIG_SOURCE_KINDS_BY_PROTOCOL[canonicalProtocolName(protocol)] ?? []).includes('service-held');
}

/** The KEY of a served file at (target, path) on a platform target whose path is a template over `{key}`, or null: the target is
 *  not such a target, the path does not fit the template, or the key is not a legal label key. Derived by inverting the template —
 *  plain string slicing, no pattern over service text. Exported for the comparison's `returnedKeys` (file-source-compare.ts). */
export function servedKeyOf(target: string, path: string): string | null {
  const spec = platformLabelTargets().get(target);
  if (!spec || !('template' in spec.path)) return null;
  const at = spec.path.template.indexOf('{key}');
  if (at < 0) return null;
  const pre = spec.path.template.slice(0, at); const post = spec.path.template.slice(at + '{key}'.length);
  if (path.length < pre.length + post.length || !path.startsWith(pre) || !path.endsWith(post)) return null;
  const key = path.slice(pre.length, path.length - post.length);
  return isSourceLabel(`${target}.${key}`) ? key : null;
}

/** The label that WOULD name a served file at (target, path) on a platform target, or null when no label can: the target is not a
 *  platform target, or the key the service returned is not a legal label (a space, a slash, over-long, `.` / `..`). */
function labelForServedFile(target: string, path: string): string | null {
  const spec = platformLabelTargets().get(target);
  if (!spec) return null;
  let label: string;
  if ('const' in spec.path) { if (spec.path.const !== path) return null; label = target; }
  else if ('template' in spec.path) {
    const key = servedKeyOf(target, path);
    if (key === null) return null;
    label = `${target}.${key}`;
  } else return null;
  if (!isSourceLabel(label)) return null;
  const back = resolveConfigLabel(label);
  // a never-held name resolves to a problem, not a path: it IS a nameable file (capture refuses it by its own name), so keep the label
  return (back.ok && back.target === target && back.path === path) || (!back.ok && back.problem === 'path-never-held') ? label : null;
}

/**
 * Capture scope, the SERVICE-file half (plan W8). Chained after `withConfigSourcesScope` in `prepareHeldCapture`.
 *
 * FIRST LINE: the input is returned UNCHANGED when there is no scope, the scope is `not-config-source-leg`, or the protocol's block
 * cannot name a service file. So every Kubernetes, Terraform and network leg, and every observability leg that declares nothing, is
 * byte-identical to before.
 *
 * ON A DECLARED LEG there is NO target-prefix exemption: every extracted file is claimed by exactly ONE rule —
 *   1. a Git-lane file: it is a declared `git-file` line (the Config scope above already moved every other one to
 *      `git-file-not-declared`; re-checked here so nothing with a Git target passes unjudged);
 *   2. a file whose (target, path) a declared `service-held` label names, read from THAT line's service ⇒ held;
 *   3. a file whose label has a `git-file` base and a `live-read` line, read from the `live-read` line's service ⇒ EVIDENCE:
 *      refused `served-file-evidence-only` (target and path kept — the comparison needs them);
 *   4. anything else ⇒ refused `service-file-not-declared`, `detail.case` saying why (the closed set above).
 * The match is on the EXTRACTED file's (target, path), whichever descriptor table produced it, and on the call's resolved service
 * (the shipping `serviceMatcher`: a registered name, or the rows registered for a descriptor URL). A file under a never-held name
 * is left for capture's own never-held check, so it keeps that name on every row. A served file on a platform target whose key is
 * not a legal label is DROPPED and COUNTED (`stats.serviceKeyNotALabel`) — never a row, never a log value: its key is service text.
 * The new rows keep `target` and `path` only because the extractor's own target and path checks ran BEFORE this scope (sec-ops (d)).
 */
export function withDeclaredFilesScope(ex: ExtractResult, sources: LegConfigSourcesResolution | null | undefined, toolCalls: readonly unknown[] | null | undefined,
  protocol: string | null | undefined): ExtractResult {
  // STEP 3 P3 (P2 sec-ops F4 / architectural F1 — LL-CS-116): a governing scope that arrives WITHOUT its protocol is judged as the
  // strictest protocol — the allow-list is ON. Before P3 an absent protocol meant "no allow-list", so a caller that hand-rolled two
  // of `captureScopesFor`'s three values held files production refuses. Production's two callers always pass all three.
  const strict = protocol === null || protocol === undefined || protocol === '';
  if (!sources || sources.state === 'not-config-source-leg' || (!strict && !protocolDeclaresServiceFiles(protocol))) return ex;
  const parsed = sources.state === 'parsed';
  const notParsedCase: DeclaredFileCase = sources.state === 'snapshot-text-reverted' ? 'text-reverted' : 'declaration-not-parsed';
  const gitLines = parsed ? declaredGitFiles(sources) : [];
  // label → its base line, its live-read line, and the platform (target, path) it names
  const byPair = new Map<string, { base: ConfigSourceLine | null; live: Extract<ConfigSourceLine, { kind: 'live-read' }> | null }>();
  if (parsed) {
    for (const e of sources.entries) {
      const r = resolveConfigLabel(e.label);
      if (!r.ok) continue;   // a governing `parsed` declaration has no label problem (it would govern as `unparseable`); a miss names nothing
      const k = JSON.stringify([r.target, r.path]);
      const g = byPair.get(k) ?? { base: null, live: null };
      if (e.kind === 'live-read') g.live = e; else g.base = e;
      byPair.set(k, g);
    }
  }
  const matches = serviceMatcher(Array.isArray(toolCalls) ? toolCalls : []);
  const fromService = (declared: string, f: ExtractedFile) => matches(declared, { service: f.serviceName, serviceId: f.serviceId });
  const files: ExtractedFile[] = []; const moved: ExtractedRefusal[] = []; let notALabel = 0;
  // STEP 3 P3 (plan §13 B2): the evidence files WITH their text — in memory only, for the comparison (see ExtractResult.evidence).
  const evidence: ExtractedFile[] = [];
  const refuse = (f: ExtractedFile, refusal: typeof SERVICE_FILE_NOT_DECLARED | typeof SERVED_FILE_EVIDENCE_ONLY, detail?: { case: DeclaredFileCase }) => {
    const { text: _t, sourceRevision: _r, ...rest } = f; void _t; void _r;
    moved.push({ ...rest, refusal, ...(detail ? { detail } : {}) });
  };
  for (const f of ex.files) {
    if (f.target.startsWith(GIT_TARGET_PREFIX)) {                       // rule 1
      if (lineOf(f, gitLines)) files.push(f);
      else { const { text: _t, sourceRevision: _r, ...rest } = f; void _t; void _r;
        moved.push({ ...rest, target: null, path: null, refusal: 'git-file-not-declared', detail: { field: 'declaration', ...(parsed ? {} : { state: sources.state }) } }); }
      continue;
    }
    if (heldPathRefusal(f.path.replace(/^\/+/, '')) !== null) { files.push(f); continue; }   // capture refuses it by its never-held name
    // A served key that is not a legal label is DROPPED and COUNTED on EVERY governed leg — parsed or not (P3: P2 architectural F5;
    // before, a not-parsed or text-reverted leg stored a row carrying the service's own key text in its path).
    if (platformLabelTargets().has(f.target) && labelForServedFile(f.target, f.path) === null) { notALabel++; continue; }
    if (!parsed) { refuse(f, SERVICE_FILE_NOT_DECLARED, { case: notParsedCase }); continue; }
    const g = byPair.get(JSON.stringify([f.target, f.path]));
    if (!g || !g.base) { refuse(f, SERVICE_FILE_NOT_DECLARED, { case: 'no-label' }); continue; }
    if (g.base.kind === 'service-held') {                               // rule 2
      if (fromService(g.base.service, f)) files.push(f); else refuse(f, SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' });
      continue;
    }
    if (g.base.kind === 'git-file') {                                   // rule 3
      if (!g.live) refuse(f, SERVICE_FILE_NOT_DECLARED, { case: 'label-has-git-base-no-live-read' });
      else if (fromService(g.live.service, f)) { refuse(f, SERVED_FILE_EVIDENCE_ONLY); evidence.push(f); }
      else refuse(f, SERVICE_FILE_NOT_DECLARED, { case: 'wrong-service' });
      continue;
    }
    refuse(f, SERVICE_FILE_NOT_DECLARED, { case: 'no-label' });        // a base of another kind names no file
  }
  if (!moved.length && !notALabel) return ex;
  return { ...ex, files, refusals: [...ex.refusals, ...moved], stats: notALabel ? { ...ex.stats, serviceKeyNotALabel: notALabel } : ex.stats,
    ...(evidence.length ? { evidence } : {}) };
}

export interface ConfigForce { reason: string; gitFilesNotHeld?: string[]; gitFilesNotHeldTotal?: number;
  /** STEP 3 P2 (plan W10): the declared `service-held` labels with no held CAPTURE ref at the (target, path) the label names. */
  serviceFilesNotHeld?: string[]; serviceFilesNotHeldTotal?: number }

/**
 * THE Config-sources force (plan W10; was `configGitFileForce`). `captureRefs` = the CAPTURE refs of the leg's authoritative
 * Harvester. Null = nothing to force. Precedence: the declaration's own state > `git-file-not-held` > `service-held-not-held`.
 * BOTH lists are returned whenever non-empty; `reason` is the first by precedence. For a Kubernetes or Terraform declaration (no
 * `service-held` kind) the result is exactly what it was.
 */
export function configSourceForce(sources: LegConfigSourcesResolution, captureRefs: ReadonlyArray<{ target?: string; path?: string }>,
  captureSnapshotRefusal: string | null = null): ConfigForce | null {
  if (captureSnapshotRefusal) return { reason: captureSnapshotRefusal };
  if (sources.state === 'not-config-source-leg') return null;
  if (sources.state !== 'parsed') return { reason: `config-sources-${sources.state}` };
  const held = (l: GitLine) => !configPinRefusesRef(l)
    && captureRefs.some((x) => typeof x.target === 'string' && typeof x.path === 'string' && isFileOfGitLine({ target: x.target, path: x.path }, l));
  const gitNotHeld = declaredGitFiles(sources).filter((l) => !held(l)).map((l) => l.label);
  const serviceNotHeld = sources.entries.filter((e) => e.kind === 'service-held').filter((e) => {
    const r = resolveConfigLabel(e.label);
    return !r.ok || !captureRefs.some((x) => x.target === r.target && x.path === r.path);
  }).map((e) => e.label);
  if (!gitNotHeld.length && !serviceNotHeld.length) return null;
  return {
    reason: gitNotHeld.length ? 'git-file-not-held' : 'service-held-not-held',
    ...(gitNotHeld.length ? { gitFilesNotHeld: gitNotHeld.slice(0, CONFIG_FILES_NOT_HELD_CAP), gitFilesNotHeldTotal: gitNotHeld.length } : {}),
    ...(serviceNotHeld.length ? { serviceFilesNotHeld: serviceNotHeld.slice(0, CONFIG_FILES_NOT_HELD_CAP), serviceFilesNotHeldTotal: serviceNotHeld.length } : {}),
  };
}

/** The name this function had before STEP 3 P2 (the lab and the golden set import it). The SAME function. */
export const configGitFileForce = configSourceForce;

/** Two labels of one declaration that name the SAME file — the same Git file, or the same platform (target, path). The grammar's
 *  pair rule allows one base per LABEL; this is the cross-label check (plan W10). ONE definition: the `--config-lane` corpus
 *  (scripts/replay-held-capture.ts `labelCollisions`) counts THIS function's pairs, and test FO4 pins it. */
export function configLabelCollisions(sources: LegConfigSourcesResolution): Array<[string, string]> {
  if (sources.state !== 'parsed') return [];
  const out: Array<[string, string]> = [];
  const git = declaredGitFiles(sources);
  for (let i = 0; i < git.length; i++) for (let j = i + 1; j < git.length; j++) {
    if (isFileOfGitLine({ target: `${GIT_TARGET_PREFIX}${git[j].owner}:${git[j].repo}`, path: `/${git[j].path}` }, git[i])) out.push([git[i].label, git[j].label]);
  }
  const seen = new Map<string, string>();
  for (const label of new Set(sources.entries.map((e) => e.label))) {
    const r = resolveConfigLabel(label);
    if (!r.ok) continue;
    const k = JSON.stringify([r.target, r.path]);
    const prior = seen.get(k);
    if (prior !== undefined) out.push([prior, label]); else seen.set(k, label);
  }
  return out;
}
