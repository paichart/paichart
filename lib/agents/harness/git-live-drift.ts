/**
 * Config sources STEP 2 (2026-11-15; plan §3.3, owner Group K1/K2) — `gitLiveDrift`, PURE and CLIENT-SAFE (no imports: the §6
 * render is reachable from a client component, the `live-evidence-render.ts` rule).
 *
 * QUESTION (one): for each Git file a Kubernetes leg KEEPS, which DECLARED fields differ between the file and the live objects it
 * names? The comparison is not made by a model and not made here. The PLATFORM calls the read-only cluster service's
 * `compare_declared_fields` tool (get only) with the REDACTED held bytes, once per held file, at the Harvester's persist, and
 * stores the outcome as `platformDriftCalls`. This module turns that stored record into the fact — so a replay never calls.
 *
 * UNTRUSTED INPUT (sec-ops Layer-1 review F3 / C5): the tool's result is text a service returned about a file from Git. Every field
 * is checked against a CLOSED set or a strict grammar before it is kept; `detail` is never kept; a path is at most 200 characters of
 * the characters a Kubernetes field path can contain (no space, no backtick, no line break); counts are bounded. ANY shape failure
 * makes the whole file `not-checked: result-shape` — never a partial reading.
 *
 * NEVER READS CLEAN WHEN SOMETHING WAS SKIPPED (C2): a file is `no-differences` only when every object was compared, none was
 * absent, and no declared value was skipped as a redaction placeholder. Otherwise the fact lists what it found and what it skipped.
 *
 * A FACT, never a gate: no qualityGate / programReleasable input. Rendered to the Architect and the leg Reviewer (the readers of the
 * network Git-vs-device comparison), who decide what a difference means.
 */
export const GIT_LIVE_DRIFT_VERSION = 1;
export const GIT_LIVE_DRIFT_METHOD = 'k8s-declared-field-compare';
/** The tool's own method string, version included — a result carrying any other is `result-shape`. */
/** /2 (2026-11-16): quantities at quantity-typed paths compared by value. A /1 result is refused (`result-shape` ⇒ not-checked). */
export const COMPARE_TOOL_METHOD = 'k8s-declared-field-compare/2';
export const GIT_LIVE_DRIFT_RENDER_NAME = "the platform's Git-vs-live drift fact";
export const DRIFT_PATHS_SHOWN_CAP = 40;       // differing paths kept per file (the total is always kept)
export const DRIFT_OBJECTS_CAP = 50;           // the tool's own document cap
export const DRIFT_FILES_CAP = 40;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;

const OBJECT_STATES = new Set(['compared', 'absent-live', 'not-compared']);
export const NOT_COMPARED_REASONS = new Set(['not-an-object', 'secret-never-compared', 'kind-not-allowlisted', 'no-name', 'no-namespace',
  'name-or-namespace-invalid', 'live-read-failed', 'too-many-declared-fields']);
const DIFFERENCES = new Set(['value-differs', 'type-differs', 'missing-live']);
/** A Kubernetes field path as the tool prints it: `spec.template.spec.containers[name=api].image`, `metadata.labels["app/name"]`. */
const PATH_RE = /^[A-Za-z0-9_.\-\[\]="'/]{1,200}$/;
const NAME_RE = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const KIND_RE = /^[A-Za-z][A-Za-z0-9]{0,62}$/;
/** The one cluster-scoped kind the compare tool fetches (by name; the service's `_CLUSTER_COMPARE`). It has no namespace. */
const CLUSTER_SCOPED_KIND = 'Namespace';
const SHA_RE = /^[0-9a-f]{64}$/;

/** Why the platform made no call, or could not use what came back. A CLOSED set (the fact renders the word). */
export type DriftNotChecked =
  | 'no-live-read-source'             // a Git-only run: no `live-read` line names a service to compare against
  | 'more-than-one-live-read-source'  // which cluster the file belongs to is not declared
  | 'live-read-service-unresolved'    // the declared service is a descriptor URL this execution never registered
  | 'service-declares-no-compare-tool'
  | 'file-not-held'                   // no held bytes for this line (the leg is forced `git-file-not-held`)
  | 'manifest-too-large'              // the held file is over the compare tool's size limit — no call is made
  | 'redaction-off'                   // R10 is switched off on this install: the held bytes are raw, so they are never sent (F4)
  | 'service-not-owned'               // the declared service row is not the run owner's — held bytes are never sent to it (F2)
  | 'leg-time-budget'                 // the leg's total time for these calls ran out (F3)
  | 'call-refused'                    // the hub refused the call (policy, eligibility, rate limit)
  | 'call-failed'                     // the call threw or timed out
  | 'tool-refused'                    // the service returned an error result (e.g. the manifest is over its limits)
  | 'result-shape'                    // the result did not pass validation
  | 'sha-mismatch'                    // the service did not compare the bytes the platform holds
  | 'source-is-not-the-rendered-object' // every document is a kustomization / values file / non-allowlisted kind
  | 'per-leg-call-cap'
  | 'no-platform-call-record';

export interface ValidatedObject {
  kind: string | null; namespace: string | null; name: string | null;
  state: 'compared' | 'absent-live' | 'not-compared'; reason?: string;
  declaredPaths?: number; differingTotal?: number; differing?: Array<{ path: string; difference: string }>;
  redactedNotComparedTotal?: number;
}

/** The tool's result ⇒ validated objects, or the first reason it is unusable. `expectedSha` = sha256 of the bytes the platform sent. */
export function validateCompareResult(raw: unknown, expectedSha: string): { ok: true; objects: ValidatedObject[] } | { ok: false; reason: DriftNotChecked } {
  if (!isObj(raw) || raw.method !== COMPARE_TOOL_METHOD || !Array.isArray(raw.objects) || raw.objects.length > DRIFT_OBJECTS_CAP) return { ok: false, reason: 'result-shape' };
  if (typeof raw.manifestSha256 !== 'string' || !SHA_RE.test(raw.manifestSha256)) return { ok: false, reason: 'result-shape' };
  if (raw.manifestSha256 !== expectedSha) return { ok: false, reason: 'sha-mismatch' };
  const objects: ValidatedObject[] = [];
  for (const o of raw.objects) {
    if (!isObj(o) || typeof o.state !== 'string' || !OBJECT_STATES.has(o.state)) return { ok: false, reason: 'result-shape' };
    const str = (v: unknown, re: RegExp): string | null | false => (v === undefined || v === null ? null : typeof v === 'string' && re.test(v) ? v : false);
    const kind = str(o.kind, KIND_RE); const namespace = str(o.namespace, NAME_RE); const name = str(o.name, NAME_RE);
    // An object the tool did NOT fetch may echo a name the cluster would refuse; such an echo is dropped, never a shape failure.
    const fetched = o.state !== 'not-compared';
    // A fetched object is named by kind + namespace + name. ONE exception: a `Namespace` is cluster-scoped, so it is fetched by name
    // alone and must carry NO namespace (a Namespace that states one, or any other kind without one, is refused).
    const clusterScoped = kind === CLUSTER_SCOPED_KIND;
    if (fetched && (kind === false || namespace === false || name === false || !kind || !name
      || (clusterScoped ? o.namespace !== undefined && o.namespace !== null : !namespace))) return { ok: false, reason: 'result-shape' };
    const base = { kind: kind || null, namespace: namespace || null, name: name || null };
    if (o.state === 'not-compared') {
      if (typeof o.reason !== 'string' || !NOT_COMPARED_REASONS.has(o.reason)) return { ok: false, reason: 'result-shape' };
      objects.push({ ...base, state: 'not-compared', reason: o.reason });
      continue;
    }
    if (o.state === 'absent-live') { objects.push({ ...base, state: 'absent-live' }); continue; }
    if (!isCount(o.declaredPaths) || !isCount(o.differingTotal) || !Array.isArray(o.differing) || o.differing.length > 200
      || o.differing.length > o.differingTotal || !isCount(o.redactedNotComparedTotal)) return { ok: false, reason: 'result-shape' };
    const differing: Array<{ path: string; difference: string }> = [];
    for (const d of o.differing) {
      if (!isObj(d) || typeof d.path !== 'string' || !PATH_RE.test(d.path) || typeof d.difference !== 'string' || !DIFFERENCES.has(d.difference)) return { ok: false, reason: 'result-shape' };
      differing.push({ path: d.path, difference: d.difference });
    }
    objects.push({ ...base, state: 'compared', declaredPaths: o.declaredPaths, differingTotal: o.differingTotal, differing, redactedNotComparedTotal: o.redactedNotComparedTotal });
  }
  return { ok: true, objects };
}

/** One entry of the stored platform call record (`platformDriftCalls`, operator tail). `result` is the tool's result as returned —
 *  the VALIDATED PROJECTION (platform-drift-run.ts), re-validated on every read; `manifestSha256` / `manifestLength` describe the bytes
 *  SENT (never the bytes). The raw result is never stored — only its size and sha. */
export interface PlatformDriftCall {
  label: string; path: string;
  outcome: 'called' | DriftNotChecked;
  service?: string; manifestSha256?: string; manifestLength?: number; durationMs?: number;
  /** The size and sha of the tool's RAW result (never stored itself); `result` is the validated projection of it. */
  resultBytes?: number; resultSha256?: string; heldSha256?: string;
  result?: unknown;
}

const objName = (o: ValidatedObject): string => (o.kind === CLUSTER_SCOPED_KIND && !o.namespace
  ? `${o.kind} ${o.name ?? '?'}`
  : `${o.kind ?? 'object'} ${o.namespace ?? '?'}/${o.name ?? '?'}`);

/** One held file's entry of the fact, from its call record. */
export function driftFileFromCall(call: PlatformDriftCall): Obj {
  const head = { label: call.label, path: call.path };
  if (call.outcome !== 'called') return { ...head, state: 'not-checked', reason: call.outcome };
  const v = validateCompareResult(call.result, call.manifestSha256 ?? '');
  if (!v.ok) return { ...head, state: 'not-checked', reason: v.reason };
  const compared = v.objects.filter((o) => o.state === 'compared');
  const absentLive = v.objects.filter((o) => o.state === 'absent-live').map(objName);
  const notCompared = v.objects.filter((o) => o.state === 'not-compared').map((o) => ({ object: objName(o), reason: o.reason }));
  const rendered = v.objects.some((o) => o.state !== 'not-compared'
    || !['not-an-object', 'kind-not-allowlisted'].includes(o.reason ?? ''));
  if (v.objects.length === 0 || !rendered) return { ...head, state: 'not-checked', reason: 'source-is-not-the-rendered-object' };
  const all = compared.flatMap((o) => (o.differing ?? []).map((d) => ({ object: objName(o), path: d.path, difference: d.difference })));
  const differingTotal = compared.reduce((n, o) => n + (o.differingTotal ?? 0), 0);
  const redactedNotCompared = compared.reduce((n, o) => n + (o.redactedNotComparedTotal ?? 0), 0);
  const clean = differingTotal === 0 && redactedNotCompared === 0 && absentLive.length === 0 && notCompared.length === 0;
  return {
    ...head, state: 'compared', summary: clean ? 'no-differences' : differingTotal > 0 || absentLive.length > 0 ? 'differences' : 'compared-with-gaps',
    objects: v.objects.length, objectsCompared: compared.length,
    differingTotal, differing: all.slice(0, DRIFT_PATHS_SHOWN_CAP),
    ...(absentLive.length ? { absentLive } : {}),
    ...(notCompared.length ? { notCompared } : {}),
    redactedNotCompared,
  };
}

/** gitLiveDrift from the stored platform call record. `calls` not an array ⇒ `checked:false` (`no-platform-call-record`). */
export function computeGitLiveDrift(calls: unknown): Obj {
  const base = { version: GIT_LIVE_DRIFT_VERSION, method: GIT_LIVE_DRIFT_METHOD, point: 'harvester' };
  if (!Array.isArray(calls)) return { ...base, checked: false, reason: 'no-platform-call-record' };
  const files = (calls as PlatformDriftCall[]).slice(0, DRIFT_FILES_CAP).map(driftFileFromCall);
  return {
    ...base, checked: true, files,
    filesCompared: files.filter((f) => f.state === 'compared').length,
    filesNotChecked: files.filter((f) => f.state === 'not-checked').length,
    ...(calls.length > DRIFT_FILES_CAP ? { filesTotal: calls.length } : {}),
  };
}

// ── §6 render. Facts only: states, counts, paths that passed the grammar — no verdict words. ───────────────────────────────────
const q = (s: unknown): string => String(s).replace(/`/g, "'").replace(/[\r\n\t]+/g, ' ');
const REASON_WORDS: Record<string, string> = {
  'no-live-read-source': 'no live-read source is declared (a Git-only run)',
  'more-than-one-live-read-source': 'more than one live-read source is declared',
  'live-read-service-unresolved': 'the declared live-read service was not registered in this run',
  'service-declares-no-compare-tool': 'the service declares no compare tool',
  'file-not-held': 'the file is not held',
  'manifest-too-large': 'the file is larger than the compare limit',
  'redaction-off': 'secret redaction is switched off on this install, so the file is not sent',
  'service-not-owned': 'the declared service is not owned by the run owner',
  'leg-time-budget': 'the time allowed for this leg\'s comparisons ran out',
  'call-refused': 'the platform call was refused',
  'call-failed': 'the platform call failed',
  'tool-refused': 'the service refused the comparison',
  'result-shape': 'the result could not be read',
  'sha-mismatch': 'the service did not compare the held bytes',
  'source-is-not-the-rendered-object': 'source is not the rendered object',
  'per-leg-call-cap': 'the per-leg call limit was reached',
  'no-platform-call-record': 'no platform call was recorded',
};

// sec-ops slice-3b F5: a STORED fact is re-read on every render (a chained copy can be edited by a human POV writer). Every field
// that reaches the prompt is checked against this module's own sets and grammars; a file entry that fails any check renders as
// `not-checked: the stored fact could not be read` — never its own words.
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OBJECT_RE = /^(?:[A-Za-z][A-Za-z0-9]{0,62} [a-z0-9.?-]{1,253}\/[a-z0-9.?-]{1,253}|Namespace [a-z0-9.?-]{1,253})$/;
const SUMMARIES = new Set(['no-differences', 'differences', 'compared-with-gaps']);
function renderableFile(f: unknown): Obj | null {
  if (!isObj(f) || typeof f.label !== 'string' || !LABEL_RE.test(f.label)) return null;
  if (f.state === 'not-checked') return typeof f.reason === 'string' && f.reason in REASON_WORDS ? f : null;
  if (f.state !== 'compared' || typeof f.summary !== 'string' || !SUMMARIES.has(f.summary)) return null;
  if (!isCount(f.objects) || !isCount(f.objectsCompared) || !isCount(f.differingTotal) || !isCount(f.redactedNotCompared)) return null;
  const diffs = f.differing;
  if (!Array.isArray(diffs) || diffs.length > DRIFT_PATHS_SHOWN_CAP || diffs.length > f.differingTotal) return null;
  for (const d of diffs) {
    if (!isObj(d) || typeof d.object !== 'string' || !OBJECT_RE.test(d.object) || typeof d.path !== 'string' || !PATH_RE.test(d.path)
      || typeof d.difference !== 'string' || !DIFFERENCES.has(d.difference)) return null;
  }
  if (f.absentLive !== undefined && !(Array.isArray(f.absentLive) && f.absentLive.length <= DRIFT_OBJECTS_CAP && f.absentLive.every((a) => typeof a === 'string' && OBJECT_RE.test(a)))) return null;
  if (f.notCompared !== undefined && !(Array.isArray(f.notCompared) && f.notCompared.length <= DRIFT_OBJECTS_CAP
    && f.notCompared.every((n) => isObj(n) && typeof n.object === 'string' && OBJECT_RE.test(n.object) && typeof n.reason === 'string' && NOT_COMPARED_REASONS.has(n.reason)))) return null;
  // the summary must be the one these counts produce — a stored `no-differences` beside a non-zero count is not readable
  const gaps = (Array.isArray(f.absentLive) ? f.absentLive.length : 0) + (Array.isArray(f.notCompared) ? f.notCompared.length : 0);
  const want = f.differingTotal === 0 && f.redactedNotCompared === 0 && gaps === 0 ? 'no-differences'
    : f.differingTotal > 0 || (Array.isArray(f.absentLive) && f.absentLive.length > 0) ? 'differences' : 'compared-with-gaps';
  return f.summary === want ? f : null;
}

export function renderGitLiveDriftForPrompt(fact: Obj | null | undefined): string[] | null {
  if (!fact || typeof fact !== 'object') return null;
  const head = `- **Git vs live — ${GIT_LIVE_DRIFT_RENDER_NAME}** (declared fields only, compared by the read-only service at the platform's request; no model compared them):`;
  if (fact.checked !== true) return [`${head} not-checked: ${q(REASON_WORDS[String(fact.reason)] ?? 'no reason recorded')}.`];
  const files = Array.isArray(fact.files) ? (fact.files as Obj[]) : [];
  if (files.length === 0) return [`${head} no kept Git file to compare.`];
  const out = [head];
  for (const raw of files.slice(0, DRIFT_FILES_CAP)) {
    const f = renderableFile(raw);
    if (!f) { out.push('  - (one file): not-checked: the stored fact could not be read.'); continue; }
    if (f.state !== 'compared') { out.push(`  - \`${q(f.label)}\`: not-checked: ${q(REASON_WORDS[String(f.reason)] ?? 'no reason recorded')}.`); continue; }
    const gaps = [
      Array.isArray(f.absentLive) && f.absentLive.length ? `${f.absentLive.length} declared object(s) absent live` : '',
      Array.isArray(f.notCompared) && f.notCompared.length ? `${f.notCompared.length} document(s) not compared` : '',
      typeof f.redactedNotCompared === 'number' && f.redactedNotCompared > 0 ? `${f.redactedNotCompared} declared value(s) not compared (redacted in the held file)` : '',
    ].filter(Boolean).join('; ');
    out.push(`  - \`${q(f.label)}\`: \`${q(f.summary)}\` — ${q(f.objectsCompared)} of ${q(f.objects)} object(s) compared; ${q(f.differingTotal)} declared field(s) differ${gaps ? `; ${gaps}` : ''}.`);
    const diffs = Array.isArray(f.differing) ? (f.differing as Obj[]) : [];
    for (const d of diffs) out.push(`    - ${q(d.object)}: \`${q(d.path)}\` (${q(d.difference)})`);
    if (typeof f.differingTotal === 'number' && f.differingTotal > diffs.length) out.push(`    - (+${f.differingTotal - diffs.length} more not listed)`);
    for (const a of Array.isArray(f.absentLive) ? (f.absentLive as unknown[]) : []) out.push(`    - ${q(a)}: declared in the file, absent live`);
    for (const n of Array.isArray(f.notCompared) ? (f.notCompared as Obj[]) : []) out.push(`    - ${q(n.object)}: not compared (${q(n.reason)})`);
  }
  return out;
}
