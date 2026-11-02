/**
 * Leg replay lab — L-K-a FILE FIXTURE TIER + L-K-b FIXTURE PLANTS (held-k8s step 1k; LAB-DESIGN-model-evaluation.md §1).
 *
 * WHY. L-K1 measures a k8s Harvester that reads its repo files through `github-service.get_file_contents`. No stored Harvester
 * ever made that call (prod count 0, STEP1-BUILD §4), so the RECORDED tier (recorded-tools.ts) has nothing to serve and every
 * repo read would be stubbed: the path gates would be vacuous and drift unscored. This tier serves those reads from a FIXTURE —
 * the files of the pinned lab repo at one commit, kept in the experiment folder — in the result shape probed on 2026-10-18.
 *
 * WHAT A FIXTURE IS. `<dir>/fixture.json` + `<dir>/files/<repo path>`:
 *   fixture.json  { owner, repo, commit (40 lowercase hex), serviceNames? (default ['github-service']), mimeType?, missingText?,
 *                   listings?: { '<dir path>': '<the listing text the server returned, verbatim>' }, source }
 * Loading refuses: a commit that is not 40 hex; a service that is not a Git file source in the SHIPPING pin table
 * (git-file-source-pin.js), or an owner/repo other than its pin; a file holding a plaintext `kind: Secret` (the SHIPPING G-5
 * predicate — a fixture is shown to a model, and the repo's redaction bait must never be named or served); an empty fixture.
 *
 * WHAT IS SERVED (a `services` call with `action: 'call'` whose inner tool is `get_file_contents`, or whose `targetService` is one
 * of the fixture's service names). The call first passes the SHIPPING call-time policy (`validateServiceCall`, the 1c pin + the
 * blocked-pattern gate) exactly as the hub runs it, then:
 *   fixture-file       the path is a fixture file ⇒ content[0] status text `successfully downloaded text file (SHA: <git blob>)`
 *                      + content[1] `{type:'resource', resource:{uri:'repo://<owner as asked>/<repo as asked>/sha/<commit>/contents/
 *                      <path>', mimeType, text}}` (the URI echoes the caller's spelling — STEP1-BUILD §2 finding 1);
 *   fixture-directory  the path is a directory of the fixture ⇒ content[0] = the listing text, NO resource item (a `listings`
 *                      entry verbatim when present; otherwise a GENERATED listing — reported as such, never as a probed byte);
 *   fixture-missing    any other path in the pinned repo ⇒ the server's not-found shape (`isError: true` + a text item);
 *   fixture-refused    the shipping policy refused the call ⇒ thrown as the hub throws it
 *                      (`Service call blocked by compliance policy: …`), so the loop records a failed call;
 *   unserved-fixture   a fixture-service call this tier cannot model (another inner tool, or a `targetService` that is not
 *                      one of the fixture's names, e.g. a registry id the lab cannot resolve) ⇒ the stub, LOGGED, never silent.
 * Each answer is wrapped in the gateway success envelope as the loop records it (`content[0] = {type:'data', data:{success,
 * targetService, tool, arguments, result, metadata}}`). The envelope's volatile fields (timestamps, executionTime, nextSteps) are
 * the platform's, not the file source's, and are omitted: the G-FIXTURE-ID identity proof compares the INNER result only.
 * Every other call goes to the fallback server (the recorded tier, or the stub), unchanged.
 *
 * VALIDITY (pre-registered, LAB-DESIGN §1 table, "validity"): a sample counts only when 100% of its fixture-service calls were
 * served by this tier (any tier above except unserved-fixture). A sample that made none is valid vacuously (H-NOREPO).
 *
 * L-K-b PLANTS. An EditSpec whose `appliesTo` lists `fixture:<repo path>` targets, applied with the shared exactly-once replace
 * (edits.ts) to an in-memory COPY of the fixture: a drift plant, the injection plant. A target that is not a fixture file, a
 * non-unique anchor or a plant that applies nowhere fails the $0 dry run. A plant cannot add or delete a file (H-MISSING names a
 * path the fixture does not hold). The fixture digest covers the planted bytes, so L-K-c can prove which fixture a sample read.
 *
 * L-NB-a UNPINNED CUSTOMER GIT SERVICE (network text batch 1, B3; LAB-PREREG-L-NB1.md §4). `fixture.json` `unpinned: true` models a
 * customer-registered Git service that declares NO pin (WI-B10: an owned row with no `heldFiles[].gitPin` ⇒ `gitPinForRow` null). Loading
 * then REFUSES a service name that IS in the shipping pin table and an owner/repo equal to any platform pin (that repo would be refused
 * `PINNED_SOURCE_BYPASS` through a non-pinned service — the cell would measure the tripwire, not the text). `refs` maps each ref the
 * repo carries to the 40-hex commit a read at that ref returns; a read without `ref` returns `commit` (the default branch). A ref (or
 * `sha`) the map does not name ⇒ `fixture-missing` (named divergence: the server's bad-ref error text was never probed). The call still
 * passes the SHIPPING `validateServiceCall` (no pin applies to the name; the bypass tripwire and blocked patterns still run). The
 * served shape is the probed github-service shape with the ref's commit in the URI (named divergence: no unpinned Git service exists in
 * production to probe). Capture readiness is not applicable (production holds nothing from an undeclared customer service).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { applyEdits, type EditSpec } from './edits';
import type { RecordedToolServer, ServeLogEntry } from './recorded-tools';
import { gitBlobSha } from '../held-base-check';
import { isPlaintextSecretManifest } from '../../lib/services/held-bytes-capture';
import { extractDeclaredFiles } from '../../lib/agents/harness/held-bytes/extract';
import { buildExecutionResultJson } from '../../lib/services/execution-artifacts';
const { gitPinFor, normaliseRepoPath } = require('../../lib/mcp/server/config/git-file-source-pin');
const { validateServiceCall } = require('../../lib/mcp/server/config/service-call-policy');
const { sanitizeForResponse } = require('../../lib/mcp/server/tools/response-sanitizer');

export const FIXTURE_TOOL = 'get_file_contents';
/** The persist builder logs when it cuts a > 50,000-char record to a preview; the lab has no pino sink, so a silent one. */
export const LAB_PERSIST_LOGGER = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
export const FIXTURE_PLANT_PREFIX = 'fixture:';
export const DEFAULT_FIXTURE_MIME = 'text/plain; charset=utf-8';
/** The not-found text the 2026-10-18 probe recorded (capture suite, held-k8s 1b). A fixture may override it verbatim. */
export const DEFAULT_MISSING_TEXT = 'Failed to get file contents.';

export type FixtureTier = 'fixture-file' | 'fixture-directory' | 'fixture-missing' | 'fixture-refused' | 'unserved-fixture';
export const FIXTURE_SERVED_TIERS: readonly FixtureTier[] = ['fixture-file', 'fixture-directory', 'fixture-missing', 'fixture-refused'];

export interface FixtureSpec {
  owner: string; repo: string; commit: string; source?: string;
  serviceNames?: string[]; mimeType?: string; missingText?: string; listings?: Record<string, string>;
  /** L-NB-a: a customer Git service with NO declared pin (see the header). */ unpinned?: boolean;
  /** L-NB-a: ref → the 40-hex commit a read at that ref returns (unpinned fixtures only). */ refs?: Record<string, string>;
}
export interface FixturePlantReport { id: string; path: string; beforeSha256: string; afterSha256: string; deltaChars: number }
export interface LoadedFixture {
  dir: string; spec: FixtureSpec; serviceNames: string[];
  /** repo path (no leading '/') → text, planted bytes when a plant applied. */
  files: Map<string, string>;
  plants: FixturePlantReport[];
  /** sha256 over the sorted (path, sha256(text)) list + owner/repo/commit — the planted bytes. */
  digest: string;
}

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

function walk(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

export function fixtureDigest(spec: Pick<FixtureSpec, 'owner' | 'repo' | 'commit'>, files: Map<string, string>): string {
  const lines = [...files.keys()].sort().map((p) => `${p}\t${sha256(files.get(p)!)}`);
  return sha256(`${spec.owner.toLowerCase()}/${spec.repo.toLowerCase()}@${spec.commit}\n${lines.join('\n')}`);
}

/** Load `<dir>` (fixture.json + files/), apply the plants (absolute paths of EditSpec files), refuse what must never be served. */
export function loadFileFixture(dir: string, plantFiles: string[] = []): LoadedFixture {
  const spec: FixtureSpec = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
  if (!/^[0-9a-f]{40}$/.test(spec.commit ?? '')) throw new Error(`L-K-a ${dir}: commit must be 40 lowercase hex (got ${JSON.stringify(spec.commit)})`);
  const serviceNames = spec.serviceNames?.length ? spec.serviceNames : ['github-service'];
  if (spec.unpinned) {
    if (!spec.serviceNames?.length) throw new Error(`L-NB-a ${dir}: an unpinned fixture names its customer service(s) explicitly`);
    for (const s of serviceNames) if (gitPinFor(s)) throw new Error(`L-NB-a ${dir}: ${s} is a PINNED Git file source in the shipping table — an unpinned fixture models a customer service with no pin`);
    if (namesPlatformPinnedRepo(spec.owner, spec.repo)) throw new Error(`L-NB-a ${dir}: ${spec.owner}/${spec.repo} is a platform-pinned repo — a non-pinned service reading it is refused PINNED_SOURCE_BYPASS`);
    for (const [r, c] of Object.entries(spec.refs ?? {})) if (!/^[0-9a-f]{40}$/.test(c)) throw new Error(`L-NB-a ${dir}: ref ${r} → ${c} is not 40 lowercase hex`);
  } else {
    if (spec.refs) throw new Error(`L-K-a ${dir}: refs is for unpinned fixtures only (a pinned service refuses every agent-named ref)`);
    for (const s of serviceNames) {
      const pin = gitPinFor(s);
      if (!pin) throw new Error(`L-K-a ${dir}: ${s} is not a Git file source in the shipping pin table`);
      if (String(spec.owner).toLowerCase() !== pin.owner || String(spec.repo).toLowerCase() !== pin.repo) throw new Error(`L-K-a ${dir}: ${spec.owner}/${spec.repo} is not ${s}'s pinned repo`);
    }
  }
  const root = path.join(dir, 'files');
  if (!fs.existsSync(root)) throw new Error(`L-K-a ${dir}: no files/ folder`);
  const files = new Map<string, string>();
  for (const rel of walk(root)) {
    if (normaliseRepoPath(rel) !== rel) throw new Error(`L-K-a ${dir}: ${rel} is not a path the pin accepts`);
    files.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
  }
  if (!files.size) throw new Error(`L-K-a ${dir}: the fixture holds no file`);
  for (const k of Object.keys(spec.listings ?? {})) if (!isDirectory(files, k)) throw new Error(`L-K-a ${dir}: listing "${k}" is not a directory of the fixture`);
  const plants: FixturePlantReport[] = [];
  for (const f of plantFiles) {
    const e: EditSpec = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!e.appliesTo?.length) throw new Error(`L-K-b ${path.basename(f)}: the plant targets nothing`);
    for (const t of e.appliesTo) {
      if (!t.startsWith(FIXTURE_PLANT_PREFIX)) throw new Error(`L-K-b ${e.id}: target ${t} — a fixture plant targets fixture:<repo path> only`);
      const p = t.slice(FIXTURE_PLANT_PREFIX.length);
      if (!files.has(p)) throw new Error(`L-K-b ${e.id}: ${p} is not a fixture file (a plant edits a file; it never adds or deletes one)`);
      const before = files.get(p)!;
      const r = applyEdits(before, [e], t);
      if (!r.applied.length) throw new Error(`L-K-b ${e.id}: did not apply to ${p}`);
      files.set(p, r.text);
      plants.push({ id: e.id, path: p, beforeSha256: sha256(before), afterSha256: sha256(r.text), deltaChars: r.text.length - before.length });
    }
  }
  for (const [p, t] of files) if (isPlaintextSecretManifest(t)) throw new Error(`L-K-a ${dir}: ${p} holds a plaintext Secret manifest — never served to a model (G-5)`);
  return { dir, spec, serviceNames, files, plants, digest: fixtureDigest(spec, files) };
}

const isDirectory = (files: Map<string, string>, rel: string) => [...files.keys()].some((p) => p.startsWith(`${rel}/`));
/** L-NB-a: true when owner/repo equal ANY platform pin (the shipping table's own owner/repo, compared lower-cased). */
function namesPlatformPinnedRepo(owner: string, repo: string): boolean {
  const { GIT_FILE_SOURCE_PINS } = require('../../lib/mcp/server/config/git-file-source-pin');
  const pins = GIT_FILE_SOURCE_PINS ? Object.values(GIT_FILE_SOURCE_PINS) as Array<{ owner: string; repo: string }> : [gitPinFor('github-service')];
  return pins.some((p) => p && p.owner === String(owner).toLowerCase() && p.repo === String(repo).toLowerCase());
}
/** L-NB-a: the commit a read returns — `refs[ref]` (or a `sha` equal to a known commit) on an unpinned fixture, else `commit`; null = unknown ref. */
export function fixtureCommitFor(fx: Pick<LoadedFixture, 'spec'>, innerArgs: Record<string, any>): string | null {
  const ref = typeof innerArgs.ref === 'string' && innerArgs.ref ? innerArgs.ref : null;
  const sha = typeof innerArgs.sha === 'string' && innerArgs.sha ? innerArgs.sha : null;
  if (!fx.spec.unpinned || (!ref && !sha)) return fx.spec.commit;
  const known = new Set([fx.spec.commit, ...Object.values(fx.spec.refs ?? {})]);
  if (sha) return known.has(sha) ? sha : null;
  const bare = ref!.startsWith('refs/heads/') ? ref!.slice('refs/heads/'.length) : ref!.startsWith('refs/tags/') ? ref!.slice('refs/tags/'.length) : ref!;
  if (bare === 'main') return fx.spec.commit;
  return fx.spec.refs?.[bare] ?? null;
}

/** The GENERATED listing (used only when the fixture carries no verbatim one): the entries the probe showed (name, path, type,
 *  sha) plus size. Reported as `listingSource: 'generated'` — a byte claim needs the probe's verbatim text. */
export function generatedListing(files: Map<string, string>, rel: string): string {
  const seen = new Map<string, Record<string, unknown>>();
  for (const [p, t] of files) {
    if (!p.startsWith(`${rel}/`)) continue;
    const rest = p.slice(rel.length + 1);
    const name = rest.split('/')[0];
    if (seen.has(name)) continue;
    seen.set(name, rest.includes('/')
      ? { type: 'dir', size: 0, name, path: `${rel}/${name}` }
      : { type: 'file', size: Buffer.byteLength(t, 'utf8'), name, path: p, sha: gitBlobSha(t) });
  }
  return JSON.stringify([...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))));
}

const parseMaybe = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};
const asObj = (v: unknown): Record<string, any> | null => {
  const p = parseMaybe(v);
  return p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, any> : null;
};

export interface RenderedFixtureResult { kind: 'file' | 'directory' | 'missing'; path: string; inner: Record<string, unknown>; listingSource?: 'verbatim' | 'generated' }

/** The INNER result the file source returns for already pin-checked arguments (what G-FIXTURE-ID compares byte for byte). */
export function renderFixtureResult(fx: LoadedFixture, innerArgs: Record<string, any>): RenderedFixtureResult {
  const rel = normaliseRepoPath(innerArgs.path);
  if (rel === null) throw new Error('L-K-a: render called on a path the pin refuses (the policy check runs first)');
  const file = fx.files.get(rel);
  const commit = fixtureCommitFor(fx, innerArgs);
  if (commit === null) return { kind: 'missing', path: rel, inner: { content: [{ type: 'text', text: fx.spec.missingText ?? DEFAULT_MISSING_TEXT }], isError: true } };
  if (file !== undefined) {
    const uri = `repo://${innerArgs.owner}/${innerArgs.repo}/sha/${commit}/contents/${rel}`;
    return { kind: 'file', path: rel, inner: { content: [
      { type: 'text', text: `successfully downloaded text file (SHA: ${gitBlobSha(file)})` },
      { type: 'resource', resource: { uri, mimeType: fx.spec.mimeType ?? DEFAULT_FIXTURE_MIME, text: file } },
    ] } };
  }
  if (isDirectory(fx.files, rel)) {
    const verbatim = fx.spec.listings?.[rel];
    return { kind: 'directory', path: rel, listingSource: verbatim !== undefined ? 'verbatim' : 'generated',
      inner: { content: [{ type: 'text', text: verbatim ?? generatedListing(fx.files, rel) }] } };
  }
  return { kind: 'missing', path: rel, inner: { content: [{ type: 'text', text: fx.spec.missingText ?? DEFAULT_MISSING_TEXT }], isError: true } };
}

/** The gateway success envelope, as the agent loop records a `services` result (capture suite's probed run2 shape). */
export function fixtureEnvelope(targetService: string, innerArgs: unknown, inner: Record<string, unknown>): Record<string, unknown> {
  return { content: [{ type: 'data', data: { success: true, targetService, tool: FIXTURE_TOOL, arguments: innerArgs, result: inner,
    metadata: { targetServiceId: targetService } } }] };
}

export interface FixtureServeEntry {
  tier: FixtureTier; targetService: string | null; innerTool: string | null;
  owner: string | null; repo: string | null; path: string | null; ref: string | null; sha: string | null;
  kind: 'file' | 'directory' | 'missing' | null; listingSource?: 'verbatim' | 'generated'; refusal: string | null;
}

export interface FixtureToolServer extends RecordedToolServer { fixtureLog: FixtureServeEntry[] }

/** True when this tier answers the call (the rest go to the fallback). */
export function isFixtureCall(fx: Pick<LoadedFixture, 'serviceNames'>, tool: string, args: unknown): boolean {
  if (tool !== 'services') return false;
  const a = asObj(args);
  if (!a || (a.action !== undefined && a.action !== 'call')) return false;
  return a.tool === FIXTURE_TOOL || fx.serviceNames.includes(String(a.targetService));
}

/**
 * One server per SAMPLE. `fallback` (the recorded tier, or null ⇒ `stub`) answers every non-fixture call; its log is SHARED so
 * the log stays one entry per `executeToolOnServer` call, in call order (runHarvesterSample's byte check relies on that).
 */
export function createFixtureToolServer(fx: LoadedFixture, fallback: RecordedToolServer | null, stub: unknown): FixtureToolServer {
  const log: ServeLogEntry[] = fallback ? fallback.log : [];
  const fixtureLog: FixtureServeEntry[] = [];
  return {
    log, fixtureLog,
    async getToolDefinition(name: string) {
      return fallback ? fallback.getToolDefinition(name) : { serverName: 'leg-replay-lab-fixture', tool: { name } };
    },
    async executeToolOnServer(server: string, tool: string, args: unknown) {
      if (!isFixtureCall(fx, tool, args)) {
        if (fallback) return fallback.executeToolOnServer(server, tool, args);
        const a = asObj(args);
        log.push({ tool, action: typeof a?.action === 'string' ? a.action : null, innerTool: typeof a?.tool === 'string' ? a.tool : null, fileTool: false, tier: 'unserved', storedIndex: null });
        return stub;
      }
      const a = asObj(args)!;
      const inner = asObj(a.arguments) ?? {};
      const target = typeof a.targetService === 'string' ? a.targetService : null;
      const entry: FixtureServeEntry = { tier: 'unserved-fixture', targetService: target, innerTool: typeof a.tool === 'string' ? a.tool : null,
        owner: typeof inner.owner === 'string' ? inner.owner : null, repo: typeof inner.repo === 'string' ? inner.repo : null,
        path: typeof inner.path === 'string' ? inner.path : null, ref: typeof inner.ref === 'string' ? inner.ref : null,
        sha: typeof inner.sha === 'string' ? inner.sha : null, kind: null, refusal: null };
      fixtureLog.push(entry);
      const logEntry: ServeLogEntry = { tool, action: 'call', innerTool: entry.innerTool, fileTool: false, tier: 'unserved-fixture', storedIndex: null };
      log.push(logEntry);
      if (!target || !fx.serviceNames.includes(target) || a.tool !== FIXTURE_TOOL) return stub;
      // The hub's call-time policy, as the service-call handler runs it (resolved name = the fixture's service name).
      const policy = validateServiceCall(target, FIXTURE_TOOL, inner, {}, [FIXTURE_TOOL], target);
      if (!policy.allowed) {
        entry.tier = logEntry.tier = 'fixture-refused';
        entry.refusal = policy.violations.map((v: { type: string }) => v.type).join(',');
        const messages = policy.violations.map((v: { message?: string; type: string }) => v.message || v.type).join('; ');
        throw new Error(`Service call blocked by compliance policy: ${sanitizeForResponse(messages)}`);
      }
      const r = renderFixtureResult(fx, inner);
      entry.kind = r.kind;
      if (r.listingSource) entry.listingSource = r.listingSource;
      entry.tier = logEntry.tier = r.kind === 'file' ? 'fixture-file' : r.kind === 'directory' ? 'fixture-directory' : 'fixture-missing';
      return fixtureEnvelope(target, a.arguments, r.inner);
    },
  };
}

export interface FixtureToolsReport {
  calls: number; served: number; unserved: number; tiers: Partial<Record<FixtureTier, number>>;
  generatedListings: number; valid: boolean; reads: FixtureServeEntry[];
}
export function fixtureToolsReport(fixtureLog: FixtureServeEntry[]): FixtureToolsReport {
  const tiers: Partial<Record<FixtureTier, number>> = {};
  for (const e of fixtureLog) tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
  const served = fixtureLog.filter((e) => FIXTURE_SERVED_TIERS.includes(e.tier)).length;
  return { calls: fixtureLog.length, served, unserved: fixtureLog.length - served, tiers,
    generatedListings: fixtureLog.filter((e) => e.listingSource === 'generated').length,
    valid: served === fixtureLog.length, reads: fixtureLog };
}

/**
 * $0 dry-run control: every fixture file, read through this tier and recorded as the loop records it, is HELD by the SHIPPING
 * capture extractor (one file, no refusal, sourceRevision = the commit, path = the file) — the fixture renders in a shape the
 * Git descriptor accepts. `persistTruncated` names the files whose stored toolCall the SHIPPING persist builder cuts to a preview
 * (> 50,000 JSON chars; hub N-5): capture reads the in-memory record and is unaffected, but MI-13 🔴 9/10 and a recorded replay
 * cannot see them.
 */
export async function fixtureCaptureReadiness(fx: LoadedFixture): Promise<{ files: number; held: number; failures: string[]; persistTruncated: string[]; notApplicable?: string }> {
  const failures: string[] = []; const persistTruncated: string[] = [];
  if (fx.spec.unpinned) return { files: fx.files.size, held: 0, failures, persistTruncated, notApplicable: 'unpinned customer Git service — production holds nothing from an undeclared customer row (L-NB-a)' };
  let held = 0;
  const service = fx.serviceNames[0];
  for (const [p, text] of fx.files) {
    const args = { owner: fx.spec.owner, repo: fx.spec.repo, path: p };
    const srv = createFixtureToolServer(fx, null, null);
    const result = await srv.executeToolOnServer('lab', 'services', { action: 'call', targetService: service, tool: FIXTURE_TOOL, arguments: args });
    const rec = { tool: 'services', success: true, arguments: { action: 'call', targetService: service, tool: FIXTURE_TOOL, arguments: args }, result };
    const x = extractDeclaredFiles([rec], undefined, { gitFileSourceLeg: true });
    const f = x.files[0];
    if (x.files.length === 1 && !x.refusals.length && f.sourceRevision === fx.spec.commit && f.path === `/${p}` && f.text === text) held++;
    else failures.push(`${p}: ${x.files.length} file(s), refusals ${x.refusals.map((r) => r.refusal).join(',') || 'none'}${f ? `, revision ${f.sourceRevision}, path ${f.path}, text ${f.text === text ? '=' : '≠'}` : ''}`);
    const rj = buildExecutionResultJson({ taskId: 't', taskTitle: 'lab', agentRole: 'infra_state_harvester', modelUsed: 'lab', finalResponse: '', confidenceScore: null,
      turnCount: 1, maxToolTurns: 1, toolCallResults: [rec] as any, successfulToolCalls: 1, failedToolCalls: 0, executionTime: 0, tokensUsed: 0, correctionTurnUsed: false, logger: LAB_PERSIST_LOGGER } as any);
    const stored = (rj as any).toolCalls?.[0]?.result;
    if (stored && typeof stored === 'object' && stored.truncated === true) persistTruncated.push(p);
  }
  return { files: fx.files.size, held, failures, persistTruncated };
}

// ───────────────────────────── operator commands ($0, read-only) ─────────────────────────────

const ghJson = (endpoint: string): any => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/**
 * `fixture-fetch`: write a fixture from the repo at ONE commit through the operator's own `gh api` (read-only; never the
 * github-service or its token). Each file's git blob id is recomputed and must equal GitHub's (independent agreement, as the
 * K-8 base check does). A file holding a plaintext Secret manifest is REFUSED and never written.
 */
export function fixtureFetch(opts: { repo: string; commit: string; paths: string[]; out: string; date?: string }): { written: string[] } {
  const [owner, repo] = opts.repo.split('/');
  if (!owner || !repo) throw new Error('fixture-fetch: --repo <owner>/<repo>');
  if (!/^[0-9a-f]{40}$/.test(opts.commit)) throw new Error('fixture-fetch: --commit must be 40 lowercase hex (a ref name is refused: the fixture is ONE commit)');
  const commit = ghJson(`repos/${owner}/${repo}/commits/${opts.commit}`);
  if (commit.sha !== opts.commit) throw new Error(`fixture-fetch: ${opts.commit} is not a commit of ${opts.repo}`);
  const written: string[] = [];
  const staged = new Map<string, string>();
  for (const raw of opts.paths) {
    const rel = normaliseRepoPath(raw);
    if (rel === null) throw new Error(`fixture-fetch: ${raw} is not a path the pin accepts`);
    const meta = ghJson(`repos/${owner}/${repo}/contents/${rel}?ref=${opts.commit}`);
    if (Array.isArray(meta) || meta.type !== 'file') throw new Error(`fixture-fetch: ${rel} is not a file at ${opts.commit.slice(0, 12)} (name files; directories are derived from them)`);
    const text = Buffer.from(String(meta.content), 'base64').toString('utf8');
    if (gitBlobSha(text) !== meta.sha) throw new Error(`fixture-fetch: ${rel} — recomputed blob ${gitBlobSha(text).slice(0, 12)} ≠ GitHub's ${String(meta.sha).slice(0, 12)} (not UTF-8 text?)`);
    if (isPlaintextSecretManifest(text)) throw new Error(`fixture-fetch: ${rel} holds a plaintext Secret manifest — REFUSED, nothing written (G-5; a fixture is shown to a model)`);
    staged.set(rel, text);
  }
  fs.mkdirSync(path.join(opts.out, 'files'), { recursive: true });
  for (const [rel, text] of staged) {
    fs.mkdirSync(path.dirname(path.join(opts.out, 'files', rel)), { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'files', rel), text);
    written.push(rel);
  }
  const spec: FixtureSpec = { owner, repo, commit: opts.commit, source: `gh api (operator, read-only) ${opts.date ?? new Date().toISOString().slice(0, 10)}` };
  fs.writeFileSync(path.join(opts.out, 'fixture.json'), JSON.stringify(spec, null, 2) + '\n');
  return { written };
}

/**
 * `fixture-id-check` (G-FIXTURE-ID): compare this tier's INNER render with what an admin `services(action:'call')` returned, case
 * by case, byte for byte (`JSON.stringify`). The probe file is `{ cases: [{ arguments, result }] }`; a `result` that is the whole
 * hub response (it carries `success` + `result`) is unwrapped to its `result`. A case whose arguments the pin refuses is compared
 * as a refusal (the probe must hold an error string). A generated listing never passes: the probe's verbatim text belongs in
 * fixture.json `listings`.
 */
export function fixtureIdCheck(fx: LoadedFixture, probe: { cases: Array<{ arguments: Record<string, any>; result: unknown }> }): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const c of probe.cases) {
    const label = `${c.arguments.path ?? '(no path)'}${c.arguments.ref ? ` @${c.arguments.ref}` : ''}`;
    const service = fx.serviceNames[0];
    const policy = validateServiceCall(service, FIXTURE_TOOL, c.arguments, {}, [FIXTURE_TOOL], service);
    if (!policy.allowed) {
      const same = typeof c.result === 'string' && /blocked by compliance policy/.test(c.result);
      ok = ok && same;
      lines.push(`${same ? '✅' : '❌'} ${label}: refused by the shipping policy (${policy.violations.map((v: { type: string }) => v.type).join(',')})${same ? '' : ' — the probe did not record a refusal'}`);
      continue;
    }
    const want = c.result && typeof c.result === 'object' && 'success' in (c.result as object) && 'result' in (c.result as object) ? (c.result as any).result : c.result;
    const r = renderFixtureResult(fx, c.arguments);
    const same = JSON.stringify(r.inner) === JSON.stringify(want);
    const gen = r.listingSource === 'generated';
    ok = ok && same && !gen;
    lines.push(`${same && !gen ? '✅' : '❌'} ${label}: ${r.kind}${gen ? ' (GENERATED listing — put the probe text in fixture.json listings)' : ''}${same ? ' byte-identical' : ` DIFFERS (fixture ${sha256(JSON.stringify(r.inner)).slice(0, 12)} · probe ${sha256(JSON.stringify(want)).slice(0, 12)})`}`);
  }
  if (!probe.cases.length) { ok = false; lines.push('❌ the probe holds no case'); }
  return { ok, lines };
}
