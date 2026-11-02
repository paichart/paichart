/**
 * PLATFORM-HELD-BYTES — the declared-file extractor (Stage A WI-3, 2026-10-14).
 *
 * Walks the RAW tool-call records the loop produced and returns every declared file it can find, plus call-level refusals
 * by name. Pure: it never throws (the caller's try is the backstop), never mutates its input, and reads only
 * `record.tool`, `record.success`, `record.arguments` and `record.result` — NEVER R9's sibling fields (rewritten,
 * sanitized, rewriteClasses) or a pager stash, and it imports nothing from R9 (panel SF-2). What it holds is what the
 * service returned, before any truncation, sanitisation or redaction.
 *
 * Per `services` call, in this order (panel arch S2): IDENTIFY → CLASSIFY → ERRORS → files.
 *   1. Identify (owner decision OA-20; panel BC-A1, BC-A10, BC-N9): the service name AND tool, from the first source that
 *      applies — the success envelope (`identitySource: 'envelope'`, serviceId from the gateway); on a failure reply, the
 *      gateway meta on the RECORD (`'gateway-meta'`, SERVICE_CALL_FAILED / INTERNAL_SERVICE_ERROR only, with the resolved
 *      serviceId — Stage B P1-4, gateway-meta.ts); else the call's own arguments (`'arguments'`) — a
 *      RATE_LIMITED reply carries no service name, and a call that THREW before any reply stores its arguments as the raw
 *      string the model wrote, parsed here once under a try. No identity from any source ⇒ nothing recorded, counted.
 *   2. Classify by (service, tool) against the descriptor table. A pair absent from the table is `not-declared` ONLY on a
 *      SUCCESSFUL call (the service executed a tool nobody declared); a FAILED call to an absent pair (e.g. a mistyped tool
 *      name the gateway passed through) is a context count, never a row (panel arch D-1).
 *   3. Errors are checked only for declared FILE tools, five levels: threw · envelope · data-success (defensive — no
 *      producer in the gateway today) · inner · structured.
 *   4. raw-digest-present: a digest-family key anywhere under the parsed result (never inside a string, never the
 *      selector's own file-name keys) refuses every file of the call — `detail.field` is the family token, never the key
 *      or the value (owner decision Q6; panel SF-4, BC-N6).
 *   5. Files: the selector resolved (a non-string leaf is `descriptor-mismatch`, never coerced), stored as an RFC 6901
 *      JSON Pointer (panel BC-A4); target and path from const / template / the arguments the GATEWAY normalised and the
 *      service received (`data.arguments`, panel BC-A5); `path-invalid` for an unsafe path or target.
 *
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-3. Contract: P3-SERVICE-CONTRACT.md §4.2, §6.
 */
import {
  DESCRIPTOR_VERSION,
  PLATFORM_DEFAULT_DESCRIPTORS,
  DEVICE_READ_DESCRIPTORS,
  GIT_LINE_DESCRIPTORS,
  DEVICE_READ_TARGET_PREFIX,
  DEVICE_READ_PATH,
  findDescriptor,
  serviceHasDescriptors,
  type Descriptor,
  type FileSpec,
  type ValueSource,
} from './descriptors';
import { recordGatewayMetaOf } from '@/lib/services/mcp/gateway-meta';
import { checkGitArguments, checkGitServedUri, pinFromDeclaration, GIT_FILE_SOURCE_PINS } from '@/lib/mcp/server/config/git-file-source-pin';
import * as heldEligibility from '@/lib/mcp/server/config/held-eligibility';
// WI-B10 (2026-10-23): the selector grammar, pathProblem, TARGET_PATTERN and SELECTOR_MAX live in ONE plain-CJS module
// shared with registration (design §9.1 H) — never a second copy here.
import { TARGET_PATTERN, SELECTOR_MAX, pathProblem as declarationPathProblem, BRACKET_SEG, isReservedRegistrantTarget, PLATFORM_DECLARATION_TARGETS } from '@/lib/mcp/server/config/held-file-declaration';
import { GIT_LISTING_ELIDED_TEXT } from './git-status-elision';
import { declaredDevicesFor, declaredGitLinesFor, type DeviceReadScope, type DeviceReadRefusal, type DeclaredGitFileLine } from './device-read-scope';

export type IdentitySource = 'envelope' | 'gateway-meta' | 'arguments';
export type ErrorLevel = 'threw' | 'envelope' | 'data-success' | 'inner' | 'structured';
export type ExtractRefusal = 'not-declared' | 'is-error' | 'raw-digest-present' | 'descriptor-mismatch' | 'path-invalid'
  /** held-k8s: a Git file-source call broke the pin (git-file-source-pin.js); `detail.field` names the component only. */
  | 'source-not-pinned'
  /** held-terraform T-3/T-4 + sec-ops SF-1: the pin refused a state / plan / variables PATH — never holdable by design, so it is
   *  named for what it is and is NOT a pin violation (no G-4 force: no base was lost). */
  | 'state-file' | 'tfvars-file'
  /** TF-PATH-RULE-GAPS: the pin refused a Terraform CLI credentials path (`.terraformrc`, `terraform.rc`, `.terraform.d/…`). */
  | 'credentials-file'
  /** WI-B10: the call was stamped with a registrant declaration sha whose snapshot could not be loaded (never a silent name fallback). */
  | 'declaration-unavailable'
  /** WI-B10: the stamped snapshot fails the grammar under its own grammarVersion. */
  | 'declaration-invalid'
  /** held-network step 3 batch 2b (P3): a device configuration read on a Device-sources leg whose declaration is missing,
   *  does not parse, disagrees between contract and task body, or could not be read — the device lane holds NOTHING (call level). */
  | DeviceReadRefusal
  /** P3: the call's service is not a service the leg declares `device-read` (call level). */
  | 'device-service-not-declared'
  /** P3: a device (host key / registrant target) the leg does not declare `device-read` for this service (file level). */
  | 'device-not-declared'
  /** P4: the getter returned an EMPTY running configuration for a declared device ("the read returned no configuration"). */
  | 'device-config-empty'
  /** push 2 (P8 / S3-E): an UNPINNED Git service the leg declares `git-file` for returned a file that is not ONE of the declared
   *  lines (owner / repo / path / ref, then the served URI); `detail.field` names the first component that differed. Nothing held. */
  | 'git-file-not-declared'
  /** push 2 (owner Phase-0 §4b): a device whose declared Git file IS held this capture — its device read is evidence, not a held
   *  file (file level; the comparison and deviceSourceReads still read it). */
  | 'device-read-evidence-only';

interface CallIdentity {
  serviceName: string;
  serviceId: string | null;
  tool: string;
  identitySource: IdentitySource;
}

/** A declared file whose text the capture helper will check, redact and hold. */
export type StoredEligibility = 'own' | 'granted' | 'install' | 'platform';

/** INTERNAL-FIT IF-3: the ONE place a record's eligibility stamp becomes stored-row fields. */
function stampFields(stamped: { eligibility: string; grantPovId?: string | null } | null): { eligibility: StoredEligibility | null; grantPovId: string | null } {
  if (!stamped || stamped.eligibility === 'foreign') return { eligibility: null, grantPovId: null };
  const e = stamped.eligibility as StoredEligibility;
  return { eligibility: e, grantPovId: e === 'granted' && typeof stamped.grantPovId === 'string' ? stamped.grantPovId : null };
}

export interface ExtractedFile {
  toolCallIndex: number;
  serviceName: string;
  serviceId: string | null;
  identitySource: IdentitySource;
  sourceTool: string;
  selector: string;
  target: string;
  path: string;
  /** C — the text exactly as the service returned it. */
  text: string;
  declaredBy: 'platform-default' | 'registrant';
  /** WI-B10: the held_declarations sha a registrant file/refusal was judged against; null for platform defaults. */
  declarationSha256: string | null;
  /** INTERNAL-FIT IF-3: the eligibility the capture was taken under (own | granted | install | platform; null on replay of an
   *  unstamped record and on every pre-IF-3 row). 'foreign' is never stored — it holds nothing. */
  eligibility: StoredEligibility | null;
  /** IF-3: the ONE POV that granted this call — set exactly when eligibility = 'granted'. */
  grantPovId: string | null;
  descriptorVersion: number;
  /** K-3 (held-k8s): the Git commit (40 lowercase hex) the file was read at, from a revision-declaring descriptor; null
   *  for a source with no revision (the observability rig). Never "unknown": an unparseable revision is refused. */
  sourceRevision: string | null;
}

/** A refusal decided by the extractor (call level, or file level before any text check). */
export interface ExtractedRefusal {
  toolCallIndex: number;
  serviceName: string;
  serviceId: string | null;
  identitySource: IdentitySource;
  sourceTool: string;
  selector: string | null;
  target: string | null;
  path: string | null;
  refusal: ExtractRefusal;
  detail?: Record<string, string | number>;
  declaredBy: 'platform-default' | 'registrant';
  /** WI-B10: the held_declarations sha a registrant file/refusal was judged against; null for platform defaults. */
  declarationSha256: string | null;
  /** INTERNAL-FIT IF-3: the eligibility the capture was taken under (own | granted | install | platform; null on replay of an
   *  unstamped record and on every pre-IF-3 row). 'foreign' is never stored — it holds nothing. */
  eligibility: StoredEligibility | null;
  /** IF-3: the ONE POV that granted this call — set exactly when eligibility = 'granted'. */
  grantPovId: string | null;
  descriptorVersion: number;
}

export interface ExtractResult {
  files: ExtractedFile[];
  refusals: ExtractedRefusal[];
  stats: {
    servicesCalls: number; declaredCalls: number; unidentified: number; undeclaredFailed: number; failedUnmatched: number; notACall: number;
    /** held-k8s: a Git file-source call on a leg outside GIT_FILE_SOURCE_PROTOCOLS (nothing held, no row). */
    outOfScopeLane: number;
    /** held-k8s R4: a directory listing from a Git file source (no resource item, content[0].text a JSON array) — no row. */
    notAFileRead: number;
    /** held-k8s: pin violations; `OnSuccess` = the call itself succeeded (the call-time gate did not stop it) — capture logs a
     *  securityEvent only for those (SYNTHESIS v3 note 23: the call-time gate already logged the others). */
    pinViolations: number;
    pinViolationsOnSuccess: number;
    /** WI-B10 (sec-ops B-1): a call whose row the caller does not own — registrant or default — holds nothing. */
    foreignRowNotHeld: number;
    /** WI-B10 (§10 A-8, applied as written after sec-ops build SF-1): a SUCCESSFUL LIVE call to a declared platform-default
     *  service that carried no eligibility stamp. Holds NOTHING (fail closed — ownership was never decided); the capture logs a
     *  WARN with the count, so a path that stops stamping is loud. 0 by construction: every live path stamps (service-call
     *  handler, after the access check). A failed call keeps its refusal row. */
    unstampedDefaultCall: number;
    /** WI-B10 (§10 A-11d): a successful call to an undeclared tool of a registrant service (no row); the names below. */
    registrantUndeclared: number;
    /** held-network step 3 batch 2b (P4): device-lane calls in which no host carries a config output (another getter) — no row. */
    notAConfigRead: number;
    /** P4: a FAILED call to the device lane's getter (no row: whether config was asked cannot be read off a failure). */
    deviceLaneFailed: number;
    /** push 2 (P8): a FAILED call on the declared-git-line lane (no row). */
    declaredGitFailed: number;
  };
  /** WI-B10: the bounded list of undeclared tool names on registrant services (diagnosis of a mis-declared descriptor). */
  registrantUndeclaredTools: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

// ── 1. identify ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The call's own arguments as an object: the loop stores them PARSED on a completed call and as the RAW string the
 *  model wrote on a call that threw (agentic-tool-loop.ts executeToolTurn). Parsed once, under a try. */
function argsObject(raw: unknown): Obj | null {
  if (isObj(raw)) return raw;
  if (isStr(raw)) {
    try {
      const parsed = JSON.parse(raw);
      return isObj(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function successData(result: unknown): Obj | null {
  if (!isObj(result) || !Array.isArray(result.content)) return null;
  const first = result.content[0];
  if (!isObj(first) || first.type !== 'data' || !isObj(first.data)) return null;
  return first.data;
}

function identify(record: Obj): CallIdentity | null {
  const args = argsObject(record.arguments);
  if (args && args.action !== undefined && args.action !== 'call') return null; // services discover/health: not a call
  const fromArgs = (): CallIdentity | null =>
    args && isStr(args.targetService) && isStr(args.tool)
      ? { serviceName: args.targetService, serviceId: null, tool: args.tool, identitySource: 'arguments' }
      : null;
  if (record.success === false) return fromArgs(); // threw before any reply
  const data = successData(record.result);
  if (data && isStr(data.targetService) && isStr(data.tool)) {
    const meta = isObj(data.metadata) ? data.metadata : {};
    return {
      serviceName: data.targetService,
      serviceId: isStr(meta.targetServiceId) ? meta.targetServiceId : null,
      tool: data.tool,
      identitySource: 'envelope',
    };
  }
  // GATEWAY META (Stage B P1-4, register MCPSERVICE-META-REBUILT (b)): mcpService.callEmbeddedTool rebuilds the result's
  // `_meta`, so the gateway's own facts ride on the RECORD as a non-enumerable property (gateway-meta.ts) — read only
  // when the reply is an error, and only for the two call-failure types, which name the service the gateway RESOLVED
  // (and since P1-4 its id). RATE_LIMITED / VALIDATION and anything else fall to the call's own arguments.
  const result = isObj(record.result) ? record.result : null;
  const gm = recordGatewayMetaOf(record);
  if (result && result.isError === true && gm && isStr(gm.targetService)
    && (gm.errorType === 'SERVICE_CALL_FAILED' || gm.errorType === 'INTERNAL_SERVICE_ERROR')) {
    const tool = isStr(gm.requestedTool) ? gm.requestedTool : args && isStr(args.tool) ? args.tool : null;
    if (tool === null) return null;
    return { serviceName: gm.targetService, serviceId: isStr(gm.targetServiceId) ? gm.targetServiceId : null, tool, identitySource: 'gateway-meta' };
  }
  return fromArgs(); // e.g. RATE_LIMITED / VALIDATION, or no gateway meta
}

// ── 3. errors ────────────────────────────────────────────────────────────────────────────────────────────────────

function errorLevel(record: Obj): ErrorLevel | null {
  if (record.success === false) return 'threw';
  const result = isObj(record.result) ? record.result : null;
  if (result && result.isError === true) return 'envelope';
  const data = successData(record.result);
  if (!data) return 'envelope'; // a completed call with no data envelope cannot be a file read
  if (data.success === false) return 'data-success';
  const inner = isObj(data.result) ? data.result : null;
  if (inner && inner.isError === true) return 'inner';
  if (inner && isObj(inner.structuredContent) && inner.structuredContent.success === false) return 'structured';
  return null;
}

// ── 4. digest keys ───────────────────────────────────────────────────────────────────────────────────────────────

/** The digest family a key name belongs to, or null. Normalised: lower-cased, non-alphanumerics stripped. */
/** The CLOSED token vocabulary a digest refusal may carry in `detail.field` (code review SF-V2: an open `sha<digits>`
 *  could exceed the bindable length and the refusal row would be dropped). */
const SHA_TOKENS = new Set(['sha1', 'sha224', 'sha256', 'sha384', 'sha512']);

export function digestFamily(key: string): string | null {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  // held-k8s (2026-10-18): a bare `sha` key is a digest too — GitHub names its git blob ids exactly `sha`, and P3 §4.3 rule 2
  // forbids git blob ids in a result. Before this, only `sha<digits>` matched, so a server upgrade adding `sha` would have
  // been held silently (found by the step-1b fixture).
  if (k === 'sha') return 'sha';
  const sha = /sha(\d+)/.exec(k);
  if (sha) return SHA_TOKENS.has(`sha${sha[1]}`) ? `sha${sha[1]}` : 'sha';
  if (k.includes('md5')) return 'md5';
  if (k.includes('digest')) return 'digest';
  if (k.includes('checksum')) return 'checksum';
  if (k === 'etag') return 'etag';
  if (k.endsWith('hash')) return 'hash';
  return null;
}

/** First digest-family key under `root` (parsed objects only), skipping the KEYS of the objects at `skipPaths` (the
 *  selector's own file-name maps — a file called `digest` is service data, not a digest). */
function findDigestKey(root: unknown, skipPaths: Set<string>): string | null {
  const walk = (v: unknown, at: string, depth: number): string | null => {
    if (depth > 64) return null;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) { const f = walk(v[i], `${at}[${i}]`, depth + 1); if (f) return f; }
      return null;
    }
    if (!isObj(v)) return null;
    const skipKeys = skipPaths.has(at);
    for (const key of Object.keys(v)) {
      if (!skipKeys) { const fam = digestFamily(key); if (fam) return fam; }
      const f = walk(v[key], at === '' ? key : `${at}.${key}`, depth + 1);
      if (f) return f;
    }
    return null;
  };
  return walk(root, '', 0);
}

// ── 5. files ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** RFC 6901 JSON Pointer from path segments. */
export function toJsonPointer(segments: readonly string[]): string {
  return segments.map((s) => '/' + s.replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

/** Resolve an RFC 6901 JSON Pointer against a root (used by the re-extraction pin and MI-13). */
export function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let v: unknown = root;
  for (const raw of pointer.slice(1).split('/')) {
    const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(v)) {
      // held-k8s (hub SF-2): an array step is a canonical non-negative index — no '-', no leading zero, in range.
      if (!/^(0|[1-9][0-9]*)$/.test(seg) || Number(seg) >= v.length) return undefined;
      v = v[Number(seg)];
      continue;
    }
    if (!isObj(v) || !Object.prototype.hasOwnProperty.call(v, seg)) return undefined;
    v = v[seg];
  }
  return v;
}

/** Re-exported from the shared declaration module (WI-B10) so existing importers keep their path. */
export const pathProblem: (p: string) => string | null = declarationPathProblem;

function resolveSource(src: ValueSource, key: string | null, callArgs: Obj): string | null {
  if ('const' in src) return src.const;
  if ('template' in src) return key === null ? null : src.template.split('{key}').join(key);
  if ('uri' in src) return null; // the served-URI path is resolved by the Git pin in the file loop, never here
  const v = callArgs[src.argument];
  return isStr(v) ? v : null;
}

interface FileCandidate {
  segments: string[]; key: string | null; value: unknown;
  /** the bracket-selected element */ element?: Obj;
  /** WI-B10: the index in `segments` of the star-bound key (trailing star ⇒ segments.length - 1, as before). */
  keyAt?: number;
}

/** Walk fixed (non-star) segments from `start`, or return a mismatch / none. */
function walkFixed(parts: readonly string[], start: unknown, segmentsIn: readonly string[]):
  { v: unknown; segments: string[]; element?: Obj } | { mismatch: string } | { none: true } {
  let v: unknown = start;
  const segments = [...segmentsIn];
  let element: Obj | undefined;
  for (const p of parts) {
    const b = BRACKET_SEG.exec(p);
    if (b) {
      if (!isObj(v) || !Array.isArray(v[b[1]])) return { mismatch: 'absent' };
      const arr = v[b[1]] as unknown[];
      const hits: number[] = [];
      arr.forEach((el, i) => { if (isObj(el) && el[b[2]] === b[3]) hits.push(i); });
      if (hits.length === 0) return { none: true };
      if (hits.length > 1) return { mismatch: 'ambiguous' };
      segments.push(b[1], String(hits[0]));
      v = arr[hits[0]];
      element = v as Obj;
      continue;
    }
    if (!isObj(v)) return { mismatch: 'absent' };
    if (!(p in v)) {
      // held-k8s: inside a bracket-selected element, a missing FINAL key (a binary file: `resource.blob`, no `text`) is a
      // file whose value is not a string — the existing `not-a-string` arm — not an absent file.
      if (element && p === parts[parts.length - 1]) { segments.push(p); v = undefined; continue; }
      return { mismatch: 'absent' };
    }
    segments.push(p);
    v = v[p];
  }
  return { v, segments, ...(element ? { element } : {}) };
}

function selectCandidates(spec: FileSpec, resultRoot: Obj): FileCandidate[] | { mismatch: string } | { none: true } {
  const parts = spec.select.split('.');
  const starAt = parts.indexOf('*');
  if (starAt < 0) {
    const w = walkFixed(parts, resultRoot, []);
    if (!('v' in w)) return w;
    return [{ segments: w.segments, key: null, value: w.v, ...(w.element ? { element: w.element } : {}) }];
  }
  const head = walkFixed(parts.slice(0, starAt), resultRoot, []);
  if (!('v' in head)) return head;
  if (!isObj(head.v)) return { mismatch: 'not-an-object' };
  const map = head.v;
  const tail = parts.slice(starAt + 1);
  const keyAt = head.segments.length;
  if (tail.length === 0) {
    // trailing star (the pre-WI-B10 grammar): byte-identical candidates
    return Object.keys(map).map((k) => ({ segments: [...head.segments, k], key: k, value: map[k], keyAt }));
  }
  // WI-B10: a MID-path star — each key of the map is one file, the rest of the path walked under it. A key whose tail is
  // absent is skipped (that member carries no such file); a tail that hits a non-object is the usual mismatch.
  const out: FileCandidate[] = [];
  for (const k of Object.keys(map)) {
    const w = walkFixed(tail, map[k], [...head.segments, k]);
    if ('none' in w) continue;
    if ('mismatch' in w) { if (w.mismatch === 'absent') continue; return w; }
    out.push({ segments: w.segments, key: k, value: w.v, keyAt, ...(w.element ? { element: w.element } : {}) });
  }
  if (out.length === 0) return { mismatch: 'absent' };
  return out;
}

/** held-k8s R4: a Git file source's directory listing — `content[0].text` parses as a JSON ARRAY. */
function isDirectoryListing(resultRoot: Obj): boolean {
  const c = Array.isArray(resultRoot.content) ? resultRoot.content[0] : null;
  if (!isObj(c) || !isStr(c.text)) return false;
  // held-k8s G-1: a STORED record carries the persist-time placeholder in place of the listing — a replay over it must read
  // the same `notAFileRead` the live capture did (git-status-elision.ts).
  if (c.text === GIT_LISTING_ELIDED_TEXT) return true;
  try { return Array.isArray(JSON.parse(c.text)); } catch { return false; }
}

/** The arguments the SERVICE was called with: the gateway-normalised `data.arguments` on a completed call, else the call's
 *  own `arguments.arguments` (a call that threw or an envelope failure has no data envelope). */
function serviceArgsOf(rec: Obj): Obj {
  const data = successData(rec.result);
  if (data && isObj(data.arguments)) return data.arguments;
  const outer = argsObject(rec.arguments);
  return outer && isObj(outer.arguments) ? outer.arguments : outer && isStr(outer.arguments) ? (argsObject(outer.arguments) ?? {}) : {};
}

// ── the extractor ────────────────────────────────────────────────────────────────────────────────────────────────

/** `table` defaults to the platform default table; tests pass their own to exercise grammar the default table does not
 *  use (an `argument` source). Production callers never pass it in Stage A. */
export function extractDeclaredFiles(
  toolCallResults: readonly unknown[],
  table: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS,
  opts: {
    gitFileSourceLeg?: boolean;
    /** WI-B10: LIVE capture reads each record's server-only eligibility stamp (held-eligibility.js); a replay of STORED
     *  records (no stamps — legacy) matches registrant entries by serviceId instead (§10 A-8). */
    live?: boolean;
    /** WI-B10: snapshot shas the table build could not load / found invalid (named refusals, never a name fallback). */
    unavailableShas?: ReadonlySet<string>;
    invalidShas?: ReadonlySet<string>;
    /** held-network step 3 batch 2b (P3/P4): present ⇔ the owning leg declares Device sources (DEVICE_SOURCE_PROTOCOLS). Absent ⇒
     *  the device-read lane does not exist for this capture (every non-network execution: byte-identical). */
    deviceRead?: DeviceReadScope | null;
  } = {},
): ExtractResult {
  const out: ExtractResult = {
    files: [],
    refusals: [],
    stats: { servicesCalls: 0, declaredCalls: 0, unidentified: 0, undeclaredFailed: 0, failedUnmatched: 0, notACall: 0,
      outOfScopeLane: 0, notAFileRead: 0, pinViolations: 0, pinViolationsOnSuccess: 0,
      foreignRowNotHeld: 0, unstampedDefaultCall: 0, registrantUndeclared: 0, notAConfigRead: 0, deviceLaneFailed: 0, declaredGitFailed: 0 },
    registrantUndeclaredTools: [],
  };
  // WI-B10: ONE table — platform defaults (name-keyed) + registrant entries (serviceId + sha keyed). The default path never
  // sees a registrant entry; a registrant service never falls back to a default (platform names are reserved at registration).
  const defaults = table.filter((d) => d.declaredBy !== 'registrant');
  const registrant = table.filter((d) => d.declaredBy === 'registrant');
  toolCallResults.forEach((rec, toolCallIndex) => {
    if (!isObj(rec) || rec.tool !== 'services') return;
    out.stats.servicesCalls++;
    // services discover/health/registry calls are not tool calls — counted apart so `unidentified` means only calls the
    // extractor could not attribute (code review CR-N4).
    const act = argsObject(rec.arguments)?.action;
    if (act !== undefined && act !== 'call') { out.stats.notACall++; return; }
    const id = identify(rec);
    if (!id) { out.stats.unidentified++; return; }
    // ── WI-B10: which declaration governs this call ──
    const elig = opts.live ? heldEligibility.fromRecord(rec) : null;
    const stamped = elig && id.serviceId && elig.serviceId === id.serviceId ? elig : null;
    let regEntries: Descriptor[] | null = null;
    let regSha: string | null = null;
    if (stamped && stamped.heldFilesSha256) {
      const sha: string = stamped.heldFilesSha256;
      regSha = sha;
      const regBase = { toolCallIndex, serviceName: id.serviceName, serviceId: id.serviceId, identitySource: id.identitySource,
        sourceTool: id.tool, declaredBy: 'registrant' as const, declarationSha256: sha, descriptorVersion: DESCRIPTOR_VERSION,
        ...stampFields(stamped), selector: null, target: null, path: null };
      // IF-3: ONE list decides who a registrant declaration holds for — own · granted (hosted POV grant) · install (self-host).
      if (!heldEligibility.HOLDS.includes(stamped.eligibility)) { out.stats.foreignRowNotHeld++; return; }
      if (opts.invalidShas?.has(sha)) { out.refusals.push({ ...regBase, refusal: 'declaration-invalid' }); return; }
      regEntries = registrant.filter((d) => d.declarationSha256 === sha && d.serviceId === id.serviceId);
      if (regEntries.length === 0 || opts.unavailableShas?.has(sha)) { out.refusals.push({ ...regBase, refusal: 'declaration-unavailable' }); return; }
    } else if (!opts.live && id.serviceId) {
      const reg = registrant.filter((d) => d.serviceId === id.serviceId);
      if (reg.length) { regEntries = reg; regSha = reg[0].declarationSha256 ?? null; }
    }
    const isRegistrant = regEntries !== null;
    // held-network step 3 batch 2b (P3/P4): the DEVICE-READ lane — only on a Device-sources leg, only for a service with no
    // name-keyed default (a platform rig keeps its own entries), only for the lane's getter. Everything else falls through unchanged.
    if (!isRegistrant && opts.deviceRead && !serviceHasDescriptors(id.serviceName, defaults)) {
      const dl = DEVICE_READ_DESCRIPTORS.find((d) => d.tool === id.tool);
      if (dl) { extractDeviceRead(out, rec, toolCallIndex, id, dl, opts.deviceRead, stamped, opts.live === true); return; }
      // push 2 (P8 / S3-E): an UNPINNED Git service the leg declares `git-file` for — the declared LINE is the pin.
      const gl = GIT_LINE_DESCRIPTORS.find((d) => d.tool === id.tool);
      const lines = gl ? declaredGitLinesFor(opts.deviceRead, id.serviceName, id.serviceId) : null;
      if (gl && lines) { extractGitLine(out, rec, toolCallIndex, id, gl, lines, stamped, opts.live === true); return; }
    }
    if (!isRegistrant) {
      if (!serviceHasDescriptors(id.serviceName, defaults)) {
        // not a file lane. A FAILED call lands here too when the agent named the service by its registry id AND no gateway
        // meta named it (RATE_LIMITED / VALIDATION / a throw — since Stage B P1-4 a SERVICE_CALL_FAILED is identified by the
        // gateway's resolved name): context only, never a row (no 🔴 line sees failed calls).
        if (errorLevel(rec) !== null) out.stats.failedUnmatched++;
        return;
      }
      // WI-B10 (sec-ops B-1): a default-named row the caller does not own (a squatted public row) holds nothing.
      if (stamped && stamped.eligibility === 'foreign') { out.stats.foreignRowNotHeld++; return; }
      // §10 A-8 (sec-ops build SF-1): a successful live call with no call-time stamp holds nothing — fail closed.
      if (opts.live && !stamped && errorLevel(rec) === null) { out.stats.unstampedDefaultCall++; return; }
    }
    const lane = isRegistrant ? (regEntries as Descriptor[]) : defaults;
    // held-k8s 1b-scope: a Git file source is a file lane only on a Git-file-source leg; anywhere else it holds nothing.
    const laneIsGit = isRegistrant
      ? lane.some((d) => d.legScope === 'git-file-source')
      : defaults.some((d) => d.service === id.serviceName && d.legScope === 'git-file-source');
    if (laneIsGit && opts.gitFileSourceLeg !== true) {
      out.stats.outOfScopeLane++;
      return;
    }
    const level = errorLevel(rec);
    const desc = isRegistrant ? lane.find((d) => d.tool === id.tool) : findDescriptor(id.serviceName, id.tool, defaults);
    const base = {
      toolCallIndex, serviceName: id.serviceName, serviceId: id.serviceId, identitySource: id.identitySource,
      sourceTool: id.tool, declaredBy: (isRegistrant ? 'registrant' : 'platform-default') as 'registrant' | 'platform-default',
      declarationSha256: isRegistrant ? regSha : null,
      ...stampFields(stamped),
      descriptorVersion: desc ? desc.descriptorVersion : DESCRIPTOR_VERSION, // not-declared: judged against this table version
    };
    if (isRegistrant && !desc) {
      // §10 A-11d: an undeclared tool on a registrant service is a stat naming the tool, never a `not-declared` row (that name
      // keeps its meaning: "the PLATFORM rig grew a tool"). notAFile tools count nothing.
      const naf = (regEntries as Descriptor[])[0]?.notAFileTools ?? [];
      if (level === null && !naf.includes(id.tool)) {
        out.stats.registrantUndeclared++;
        if (out.registrantUndeclaredTools.length < 32 && !out.registrantUndeclaredTools.includes(id.tool)) out.registrantUndeclaredTools.push(id.tool);
      }
      return;
    }
    const callRefusal = (refusal: ExtractRefusal, detail?: Record<string, string | number>): ExtractedRefusal => ({
      ...base, selector: null, target: null, path: null, refusal, ...(detail ? { detail } : {}),
    });
    // 2. classify
    if (!desc) {
      if (level === null && id.identitySource === 'envelope') out.refusals.push(callRefusal('not-declared'));
      else out.stats.undeclaredFailed++;
      return;
    }
    if (desc.notAFile || !desc.files) return;
    out.stats.declaredCalls++;
    // held-k8s: the Git pin, BEFORE the error check — a foreign-repo attempt that also errored (e.g. refused at the call-time
    // gate) is still counted as a pin violation; that tally is the security signal (EF S-3).
    let pinnedPath: string | null = null;
    // WI-B10 (design §9.1 G): a registrant entry's DECLARED pin; a default keys the platform pin by the resolved name.
    const gitSpec = desc.files.find((f) => f.gitPin);
    const pinSrc: unknown = gitSpec && typeof gitSpec.gitPin === 'object' ? pinFromDeclaration(gitSpec.gitPin) : id.serviceName;
    if (gitSpec) {
      const a = checkGitArguments(pinSrc, serviceArgsOf(rec));
      if (!a.ok && a.pathRefusal) { out.refusals.push(callRefusal(a.pathRefusal)); return; } // SF-1: never-holdable, not a violation
      if (!a.ok) {
        out.stats.pinViolations++;
        if (level === null) out.stats.pinViolationsOnSuccess++;
        out.refusals.push(callRefusal('source-not-pinned', { field: a.field }));
        return;
      }
      pinnedPath = a.pinned ? a.path : null;
    }
    // 3. errors (declared file tools only)
    if (level !== null) { out.refusals.push(callRefusal('is-error', { level })); return; }
    // held-network step 3 batch 2b (P3) on the REGISTRANT path: on a Device-sources leg a registrant service's NON-Git files are
    // device configurations, held only when the leg declares that service `device-read` and only as `device:<declared device>` at
    // `/running-config` — the ONE form every consumer reads (the facts, the operator base check; mcp-hub review SF-1). Git-pinned
    // entries (a `git-file` source) are untouched, also inside a mixed entry (the gate is then per file — hub N-4 / sec-ops N-3).
    let regGate: { refusal: ExtractRefusal } | { devices: ReadonlySet<string> } | { gitLines: readonly DeclaredGitFileLine[] } | null = null;
    if (isRegistrant && opts.deviceRead && desc.files.some((f) => !f.gitPin)) {
      const devices = opts.deviceRead.state === 'refuse' ? null : declaredDevicesFor(opts.deviceRead, id.serviceName, id.serviceId);
      // push 2 (P8 / S3-E): a registrant service the leg declares `git-file` (not `device-read`) for — an UNPINNED Git row: its
      // non-gitPin files are held only when they equal ONE declared line (the line is the pin); a gitPin file keeps its own pin.
      const gitLines = !devices && opts.deviceRead.state !== 'refuse' ? declaredGitLinesFor(opts.deviceRead, id.serviceName, id.serviceId) : null;
      const refusal: ExtractRefusal | null = opts.deviceRead.state === 'refuse' ? opts.deviceRead.refusal : devices || gitLines ? null : 'device-service-not-declared';
      if (refusal && desc.files.every((f) => !f.gitPin)) { out.refusals.push(callRefusal(refusal)); return; }
      regGate = refusal ? { refusal } : gitLines ? { gitLines } : { devices: devices as ReadonlySet<string> };
    }
    const data = successData(rec.result) as Obj; // non-null: errorLevel returned null
    const resultRoot = isObj(data.result) ? data.result : {};
    const callArgs = isObj(data.arguments) ? data.arguments : {};
    // 4. digest keys — skip the keys of every star selector's map
    const skip = new Set<string>();
    for (const spec of desc.files) {
      const sp = spec.select.split('.'); const at = sp.indexOf('*');
      if (at > 0) skip.add(sp.slice(0, at).join('.'));
    }
    const digest = findDigestKey(resultRoot, skip);
    // 5. files
    for (const spec of desc.files) {
      const cands = selectCandidates(spec, resultRoot);
      if ('none' in cands) {
        // held-k8s R4: no matching element. A directory listing is NOT a refusal (no row — its handle numbering is never
        // touched); anything else is the old `absent` mismatch, a row (MI-13 🔴 9/10 then read it).
        if (spec.directoryWhenNone === 'content0-json-array' && isDirectoryListing(resultRoot)) { out.stats.notAFileRead++; continue; }
        out.refusals.push({ ...callRefusal('descriptor-mismatch', { reason: 'absent' }), selector: null });
        continue;
      }
      if (!Array.isArray(cands)) {
        out.refusals.push({ ...callRefusal('descriptor-mismatch', { reason: cands.mismatch }), selector: toJsonPointer(spec.select.split('.').filter((p) => p !== '*')) });
        continue;
      }
      for (const c of cands) {
        // A file KEY that cannot be bound inside the transaction (U+0000, a lone surrogate) would make the refusal's own
        // selector unbindable, and the row validator would drop the very refusal that names it (panel CR-B2). Such a row
        // points at the PARENT map instead — the key itself is never stored.
        const full = toJsonPointer(c.segments);
        const keyBindable = c.key === null
          || (full.length <= SELECTOR_MAX && full.indexOf('\u0000') < 0 && full.isWellFormed()); // SF-V1: length too
        const selector = toJsonPointer(keyBindable ? c.segments : c.segments.slice(0, c.keyAt ?? c.segments.length - 1));
        const target = resolveSource(spec.target, c.key, callArgs);
        let path = resolveSource(spec.path, c.key, callArgs);
        let sourceRevision: string | null = null;
        const fileBase = { ...base, selector };
        if (spec.gitPin) {
          // held-k8s: the served URI must agree with the pin and the argument path; it yields the path and the commit (K-3).
          const res = c.element && isObj(c.element.resource) ? c.element.resource : null;
          const u = checkGitServedUri(pinSrc, res ? res.uri : undefined, pinnedPath ?? '');
          if (!u.ok) {
            out.stats.pinViolations++; out.stats.pinViolationsOnSuccess++;
            out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'source-not-pinned', detail: { field: u.field } });
            continue;
          }
          path = u.path; sourceRevision = u.revision;
        }
        if (digest) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'raw-digest-present', detail: { field: digest } });
          continue;
        }
        if (!isStr(c.value)) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'descriptor-mismatch', detail: { reason: 'not-a-string' } });
          continue;
        }
        // push 2 (P8): an unpinned registrant Git file — the declared LINE decides target and path (the registrant's own resolved
        // values are replaced, so they are not judged); a gitPin file keeps its own pin below.
        if (regGate && !spec.gitPin && 'gitLines' in regGate) {
          const res = c.element && isObj(c.element.resource) ? c.element.resource : null;
          const m = matchDeclaredGitLine(regGate.gitLines, isObj(data.arguments) ? data.arguments : serviceArgsOf(rec), res ? res.uri : undefined);
          if (!m.ok) { out.refusals.push({ ...fileBase, target: null, path: null, refusal: m.pathRefusal ?? 'git-file-not-declared', ...(m.pathRefusal ? {} : { detail: { field: m.field } }) }); continue; }
          if (isPlatformGitTarget(m.line.owner, m.line.repo)) { out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'path-invalid', detail: { field: 'target', reason: 'reserved-target' } }); continue; }
          const gTarget = `github:${m.line.owner.toLowerCase()}:${m.line.repo.toLowerCase()}`;
          // sec-ops push-2 N-5: one held file per declared line per call — a second candidate mapping to the same target + path is refused.
          if (out.files.some((f) => f.toolCallIndex === toolCallIndex && f.target === gTarget && f.path === m.path)) {
            out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'descriptor-mismatch', detail: { reason: 'duplicate-line' } }); continue;
          }
          if (pathProblem(m.path) || !TARGET_PATTERN.test(gTarget)) { out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'path-invalid', detail: { field: pathProblem(m.path) ? 'path' : 'target' } }); continue; }
          out.files.push({ ...fileBase, target: gTarget, path: m.path, text: c.value, sourceRevision: m.revision });
          continue;
        }
        if (target === null || path === null) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'descriptor-mismatch',
            detail: { reason: target === null ? 'target-unresolved' : 'path-unresolved' } });
          continue;
        }
        // sec-ops build SF-2: a REGISTRANT entry (no gitPin) may never RESOLVE to a github: or platform target — a `{key}`
        // template expands to whatever the registrant's own service returned, so the resolved value is the one judged.
        if (isRegistrant && !spec.gitPin && isReservedRegistrantTarget(target)) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'path-invalid', detail: { field: 'target', reason: 'reserved-target' } });
          continue;
        }
        const pathBad = pathProblem(path);
        if (pathBad || !TARGET_PATTERN.test(target)) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'path-invalid',
            detail: { field: pathBad ? 'path' : 'target' } });
          continue;
        }
        if (regGate && !spec.gitPin) {
          if ('refusal' in regGate) { out.refusals.push({ ...fileBase, target: null, path: null, refusal: regGate.refusal }); continue; }
          const formOk = target.startsWith(DEVICE_READ_TARGET_PREFIX) && path === DEVICE_READ_PATH;
          if (!formOk || !('devices' in regGate) || !regGate.devices.has(target.slice(DEVICE_READ_TARGET_PREFIX.length))) {
            out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'device-not-declared', ...(formOk ? {} : { detail: { reason: 'target-form' } }) });
            continue;
          }
        }
        out.files.push({ ...fileBase, target, path, text: c.value, sourceRevision });
      }
    }
  });
  return out;
}

// ── held-network step 3 batch 2b (P3 / P4): the DEVICE-READ lane ────────────────────────────────────────────────────
/**
 * One call to the device-read lane's getter on a Device-sources leg. Order (each step holds nothing on its arm):
 *   1. eligibility exactly as the name-keyed defaults (a foreign row holds nothing; a successful LIVE call with no stamp holds
 *      nothing — fail closed, counted);
 *   2. a FAILED call ⇒ `deviceLaneFailed` (no row);
 *   3. SHAPE: no host carries `output.config.running` ⇒ not a config read (another getter) ⇒ `notAConfigRead` (no row);
 *   4. DECLARATION: a refusing scope (absent / unparseable / conflict / unresolved) ⇒ ONE call-level refusal by that name; a
 *      service the leg does not declare `device-read` ⇒ `device-service-not-declared`;
 *   5. per host: undeclared ⇒ `device-not-declared`; digest keys anywhere in the result (the hosts map's own keys skipped) ⇒
 *      `raw-digest-present`; not a string ⇒ `descriptor-mismatch {not-a-string}`; empty ⇒ `device-config-empty`; else held as
 *      target `device:<host>`, path `/running-config`.
 * Several hosts per call, and a config read BUNDLED with other getters (their outputs sit beside `config`), are both captured.
 */
function extractDeviceRead(
  out: ExtractResult, rec: Obj, toolCallIndex: number, id: CallIdentity, desc: Descriptor, scope: DeviceReadScope,
  stamped: { eligibility: string; grantPovId?: string | null } | null, live: boolean,
): void {
  // sec-ops batch-2b N-2: an ALLOWLIST (the registrant HOLDS list + `platform`), so a future eligibility value holds nothing here.
  if (stamped && ![...heldEligibility.HOLDS, 'platform'].includes(stamped.eligibility)) { out.stats.foreignRowNotHeld++; return; }
  const level = errorLevel(rec);
  if (live && !stamped && level === null) { out.stats.unstampedDefaultCall++; return; }
  if (level !== null) { out.stats.deviceLaneFailed++; return; }
  const spec = (desc.files ?? [])[0];
  if (!spec) return;
  const data = successData(rec.result) as Obj; // non-null: errorLevel returned null
  const resultRoot = isObj(data.result) ? data.result : {};
  const cands = selectCandidates(spec, resultRoot);
  if (!Array.isArray(cands) && 'mismatch' in cands && cands.mismatch === 'absent') { out.stats.notAConfigRead++; return; }
  out.stats.declaredCalls++;
  const base = {
    toolCallIndex, serviceName: id.serviceName, serviceId: id.serviceId, identitySource: id.identitySource, sourceTool: id.tool,
    declaredBy: 'platform-default' as const, declarationSha256: null, ...stampFields(stamped), descriptorVersion: desc.descriptorVersion,
  };
  const callRefusal = (refusal: ExtractRefusal, detail?: Record<string, string | number>): ExtractedRefusal =>
    ({ ...base, selector: null, target: null, path: null, refusal, ...(detail ? { detail } : {}) });
  if (!Array.isArray(cands)) {
    out.refusals.push({ ...callRefusal('descriptor-mismatch', { reason: 'mismatch' in cands ? cands.mismatch : 'absent' }),
      selector: toJsonPointer(spec.select.split('.').filter((p) => p !== '*')) });
    return;
  }
  if (scope.state === 'refuse') { out.refusals.push(callRefusal(scope.refusal)); return; }
  const devices = declaredDevicesFor(scope, id.serviceName, id.serviceId);
  if (!devices) { out.refusals.push(callRefusal('device-service-not-declared')); return; }
  const sp = spec.select.split('.'); const at = sp.indexOf('*');
  const digest = findDigestKey(resultRoot, new Set(at > 0 ? [sp.slice(0, at).join('.')] : []));
  for (const c of cands) {
    const full = toJsonPointer(c.segments);
    const keyBindable = c.key === null || (full.length <= SELECTOR_MAX && full.indexOf('\u0000') < 0 && full.isWellFormed());
    const selector = toJsonPointer(keyBindable ? c.segments : c.segments.slice(0, c.keyAt ?? c.segments.length - 1));
    const fileBase = { ...base, selector };
    const refuse = (refusal: ExtractRefusal, detail?: Record<string, string | number>) =>
      out.refusals.push({ ...fileBase, target: null, path: null, refusal, ...(detail ? { detail } : {}) });
    if (c.key === null || !keyBindable || !devices.has(c.key)) { refuse('device-not-declared'); continue; }
    if (digest) { refuse('raw-digest-present', { field: digest }); continue; }
    if (!isStr(c.value)) { refuse('descriptor-mismatch', { reason: 'not-a-string' }); continue; }
    if (c.value.trim() === '') { refuse('device-config-empty'); continue; }
    const target = resolveSource(spec.target, c.key, {});
    const path = resolveSource(spec.path, c.key, {});
    if (target === null || path === null || pathProblem(path) || !TARGET_PATTERN.test(target)) {
      refuse('path-invalid', { field: target === null || !TARGET_PATTERN.test(target) ? 'target' : 'path' });
      continue;
    }
    out.files.push({ ...fileBase, target, path, text: c.value, sourceRevision: null });
  }
}

// ── held-network step 3 push 2 (owner Phase-0 §4b / N-1): ONE held base per device ────────────────────────────────────
/**
 * "Base = the declared Git file, else the device running-config; the device read is evidence" (NETWORK-PHASE0-INVENTORY §4b, N-1):
 * a device that DECLARES a `git-file` line never gets its running config as a held base: the config is moved from `files` to a
 * file-level refusal `device-read-evidence-only` (no blob, no handle — the Author cannot edit it), WHETHER OR NOT the Git file is held
 * in this capture (push 3, owner D-1 + Q1, 2026-10-26: the declared Git file is the base of record. Push 2 moved it only when the Git file
 * was held; a not-held Git file then handed the Author a device base on a leg the carrier always forces `git-file-not-held`). A device
 * with `device-read` and no Git line keeps its config as the base. PURE; capture-only — the device facts read the extractor's own
 * result, so the comparison and deviceSourceReads still see the device text.
 */
export function withDeviceEvidenceOnly(ex: ExtractResult, scope: DeviceReadScope | null | undefined): ExtractResult {
  if (!scope || scope.state !== 'declared' || !scope.gitLines || scope.gitLines.length === 0) return ex;
  const gitDeclared = new Set(scope.gitLines.map((l) => l.device));
  const files: ExtractedFile[] = []; const moved: ExtractedRefusal[] = [];
  for (const f of ex.files) {
    if (f.target.startsWith(DEVICE_READ_TARGET_PREFIX) && gitDeclared.has(f.target.slice(DEVICE_READ_TARGET_PREFIX.length))) {
      const { text: _t, sourceRevision: _r, ...rest } = f; void _t; void _r;
      moved.push({ ...rest, target: null, path: null, refusal: 'device-read-evidence-only' });
    } else files.push(f);
  }
  return moved.length ? { ...ex, files, refusals: [...ex.refusals, ...moved] } : ex;
}

// ── held-network step 3 push 2 (P8 / S3-E): the DECLARED-GIT-LINE lane ─────────────────────────────────────────────────
/**
 * Does a Git read equal ONE declared line? Each line is a pin (`pinFromDeclaration` — owner / repo, and the line's ref or the default
 * branch), checked by the SAME function the call gate and the platform pin use (`checkGitArguments`: owner, repo, no `sha`, ref,
 * path allow-list, never-holdable paths), plus path equality with the line, plus the served URI when the result carries one
 * (`checkGitServedUri` — a CONSISTENCY check: the server echoes the request). The first field that differed is reported.
 */
export function matchDeclaredGitLine(lines: readonly DeclaredGitFileLine[], args: Obj, uri: unknown):
  { ok: true; line: DeclaredGitFileLine; path: string; revision: string } | { ok: false; field: string; pathRefusal?: ExtractRefusal } {
  let field = 'owner';
  for (const line of lines) {
    const pin = pinFromDeclaration({ owner: line.owner, repo: line.repo, ...(line.ref ? { ref: line.ref } : {}) });
    if (!pin) continue;
    const a = checkGitArguments(pin, args);
    if (!a.ok) {
      if (a.pathRefusal) return { ok: false, field: 'path', pathRefusal: a.pathRefusal as ExtractRefusal };
      if (a.field !== 'owner' || field === 'owner') field = a.field;
      continue;
    }
    if (!a.pinned || a.path !== line.path) { field = 'path'; continue; }
    // mcp-hub push-2 SF-1 / sec-ops N-4: an ABSENT served URI is refused, as the platform pin refuses it — a base with no served path
    // and no commit cannot be verified (held.get, the operator's Git base check) and a non-resource selector could hold a status line.
    if (uri === undefined || uri === null) { field = 'uri'; continue; }
    const u = checkGitServedUri(pin, uri, a.path);
    if (!u.ok) { field = u.field; continue; }
    return { ok: true, line, path: u.path, revision: u.revision };
  }
  return { ok: false, field };
}

/** mcp-hub push-2 SF-2: is this Git target a PLATFORM one (a platform pin's repo, or a platform declaration target)? A declared line
 *  naming it on a CUSTOMER service holds nothing — registration refuses such a gitPin (`git-pin-is-platform`) and capture must too. */
export function isPlatformGitTarget(owner: string, repo: string): boolean {
  const o = owner.toLowerCase(); const r = repo.toLowerCase();
  return Object.values(GIT_FILE_SOURCE_PINS as Record<string, { owner: string; repo: string }>).some((pin) => pin.owner.toLowerCase() === o && pin.repo.toLowerCase() === r)
    || (PLATFORM_DECLARATION_TARGETS as readonly string[]).some((t) => t.toLowerCase() === `github:${o}:${r}`);
}

/**
 * One call to the declared-git-line lane's tool. Order (each arm holds nothing): eligibility exactly as the device lane (an allowlist;
 * a successful LIVE call with no stamp holds nothing); a failed call => `declaredGitFailed` (no row); a directory listing =>
 * `notAFileRead` (no row); the declared-line pin (`git-file-not-declared {field}`, or the pin module's never-holdable path name);
 * digest keys => `raw-digest-present`; held as target `github:<owner>:<repo>` (lower-cased, the platform source's form) at the line's
 * path, with the served commit as `sourceRevision`.
 */
function extractGitLine(
  out: ExtractResult, rec: Obj, toolCallIndex: number, id: CallIdentity, desc: Descriptor, lines: readonly DeclaredGitFileLine[],
  stamped: { eligibility: string; grantPovId?: string | null } | null, live: boolean,
): void {
  if (stamped && ![...heldEligibility.HOLDS, 'platform'].includes(stamped.eligibility)) { out.stats.foreignRowNotHeld++; return; }
  const level = errorLevel(rec);
  if (live && !stamped && level === null) { out.stats.unstampedDefaultCall++; return; }
  if (level !== null) { out.stats.declaredGitFailed++; return; }
  const spec = (desc.files ?? [])[0];
  if (!spec) return;
  const data = successData(rec.result) as Obj;
  const resultRoot = isObj(data.result) ? data.result : {};
  const callArgs = isObj(data.arguments) ? data.arguments : serviceArgsOf(rec);
  const cands = selectCandidates(spec, resultRoot);
  if ('none' in cands) { if (isDirectoryListing(resultRoot)) out.stats.notAFileRead++; return; }
  out.stats.declaredCalls++;
  const base = {
    toolCallIndex, serviceName: id.serviceName, serviceId: id.serviceId, identitySource: id.identitySource, sourceTool: id.tool,
    declaredBy: 'platform-default' as const, declarationSha256: null, ...stampFields(stamped), descriptorVersion: desc.descriptorVersion,
  };
  const selector = toJsonPointer(spec.select.split('.').filter((p) => p !== '*'));
  if (!Array.isArray(cands)) { out.refusals.push({ ...base, selector, target: null, path: null, refusal: 'descriptor-mismatch', detail: { reason: cands.mismatch } }); return; }
  const digest = findDigestKey(resultRoot, new Set());
  for (const c of cands) {
    const fileBase = { ...base, selector: toJsonPointer(c.segments) };
    const refuse = (refusal: ExtractRefusal, detail?: Record<string, string | number>) =>
      out.refusals.push({ ...fileBase, target: null, path: null, refusal, ...(detail ? { detail } : {}) });
    const res = c.element && isObj(c.element.resource) ? c.element.resource : null;
    const m = matchDeclaredGitLine(lines, callArgs, res ? res.uri : undefined);
    if (!m.ok) { if (m.pathRefusal) refuse(m.pathRefusal); else refuse('git-file-not-declared', { field: m.field }); continue; }
    if (isPlatformGitTarget(m.line.owner, m.line.repo)) { refuse('path-invalid', { field: 'target', reason: 'reserved-target' }); continue; }
    if (digest) { refuse('raw-digest-present', { field: digest }); continue; }
    if (!isStr(c.value)) { refuse('descriptor-mismatch', { reason: 'not-a-string' }); continue; }
    const target = `github:${m.line.owner.toLowerCase()}:${m.line.repo.toLowerCase()}`;
    if (pathProblem(m.path) || !TARGET_PATTERN.test(target)) { refuse('path-invalid', { field: pathProblem(m.path) ? 'path' : 'target' }); continue; }
    out.files.push({ ...fileBase, target, path: m.path, text: c.value, sourceRevision: m.revision });
  }
}
