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
 *      applies — the success envelope (`identitySource: 'envelope'`, serviceId from the gateway); a gateway failure
 *      envelope carrying `_meta.targetService` (`'gateway-meta'`); else the call's own arguments (`'arguments'`) — a
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
  findDescriptor,
  serviceHasDescriptors,
  type Descriptor,
  type FileSpec,
  type ValueSource,
} from './descriptors';

export type IdentitySource = 'envelope' | 'gateway-meta' | 'arguments';
export type ErrorLevel = 'threw' | 'envelope' | 'data-success' | 'inner' | 'structured';
export type ExtractRefusal = 'not-declared' | 'is-error' | 'raw-digest-present' | 'descriptor-mismatch' | 'path-invalid';

interface CallIdentity {
  serviceName: string;
  serviceId: string | null;
  tool: string;
  identitySource: IdentitySource;
}

/** A declared file whose text the capture helper will check, redact and hold. */
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
  declaredBy: 'platform-default';
  descriptorVersion: number;
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
  declaredBy: 'platform-default';
  descriptorVersion: number;
}

export interface ExtractResult {
  files: ExtractedFile[];
  refusals: ExtractedRefusal[];
  stats: { servicesCalls: number; declaredCalls: number; unidentified: number; undeclaredFailed: number; failedUnmatched: number; notACall: number };
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
  // DEFENSIVE — UNREACHABLE TODAY (panel CR-B1): the gateway's failure envelopes carry `_meta.targetService` /
  // `requestedTool`, but mcpService.callEmbeddedTool rebuilds every embedded result's `_meta` as
  // {executionTime, serverName, toolName} before the loop records it, so in production a failed call is identified from
  // the call's own arguments below. Kept so an envelope that does carry the gateway's fields is identified by them.
  const result = isObj(record.result) ? record.result : null;
  const meta = result && isObj(result._meta) ? result._meta : null;
  if (result && result.isError === true && meta && isStr(meta.targetService)) {
    const tool = isStr(meta.requestedTool) ? meta.requestedTool : args && isStr(args.tool) ? args.tool : null;
    if (tool === null) return null;
    return { serviceName: meta.targetService, serviceId: null, tool, identitySource: 'gateway-meta' };
  }
  return fromArgs(); // e.g. RATE_LIMITED: no service name in the reply
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
    if (!isObj(v) || !Object.prototype.hasOwnProperty.call(v, seg)) return undefined;
    v = v[seg];
  }
  return v;
}

const TARGET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,252}$/;
/** = the store's in-tx string bound (HELD_STRING_MAX): a selector longer than this could not be bound. */
const SELECTOR_MAX = 2048;
const MAX_PATH = 1024;

/** Why a path is unsafe, or null — P3 §4.2 plus the contract's "R9-safe rendering" (code review SF-V3): no C0 or C1
 *  control (incl. TAB and ESC), no U+2028/U+2029 line or paragraph separator, no bidi override, no '..' / '.' / empty
 *  segment. A path is shown to people later (Stage B); nothing that can lie about itself when rendered is held. */
export function pathProblem(p: string): string | null {
  if (!p.startsWith('/')) return 'not-absolute';
  if (p.length > MAX_PATH) return 'too-long';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(p)) return 'control-character';
  if (/[\u2028\u2029]/.test(p)) return 'line-separator';
  if (/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/.test(p)) return 'bidi-control';
  if (!p.isWellFormed()) return 'lone-surrogate';
  const segs = p.split('/').slice(1);
  if (segs.includes('..')) return 'dot-dot-segment';
  if (segs.some((s, i) => s === '.' || (s === '' && i < segs.length - 1))) return 'empty-or-dot-segment';
  return null;
}

function resolveSource(src: ValueSource, key: string | null, callArgs: Obj): string | null {
  if ('const' in src) return src.const;
  if ('template' in src) return key === null ? null : src.template.split('{key}').join(key);
  const v = callArgs[src.argument];
  return isStr(v) ? v : null;
}

interface FileCandidate { segments: string[]; key: string | null; value: unknown }

function selectCandidates(spec: FileSpec, resultRoot: Obj): FileCandidate[] | { mismatch: string } {
  const parts = spec.select.split('.');
  const star = parts[parts.length - 1] === '*';
  const fixed = star ? parts.slice(0, -1) : parts;
  let v: unknown = resultRoot;
  for (const p of fixed) {
    if (!isObj(v) || !(p in v)) return { mismatch: 'absent' };
    v = v[p];
  }
  if (!star) return [{ segments: fixed, key: null, value: v }];
  if (!isObj(v)) return { mismatch: 'not-an-object' };
  return Object.keys(v).map((k) => ({ segments: [...fixed, k], key: k, value: (v as Obj)[k] }));
}

// ── the extractor ────────────────────────────────────────────────────────────────────────────────────────────────

/** `table` defaults to the platform default table; tests pass their own to exercise grammar the default table does not
 *  use (an `argument` source). Production callers never pass it in Stage A. */
export function extractDeclaredFiles(
  toolCallResults: readonly unknown[],
  table: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS,
): ExtractResult {
  const out: ExtractResult = {
    files: [],
    refusals: [],
    stats: { servicesCalls: 0, declaredCalls: 0, unidentified: 0, undeclaredFailed: 0, failedUnmatched: 0, notACall: 0 },
  };
  toolCallResults.forEach((rec, toolCallIndex) => {
    if (!isObj(rec) || rec.tool !== 'services') return;
    out.stats.servicesCalls++;
    // services discover/health/registry calls are not tool calls — counted apart so `unidentified` means only calls the
    // extractor could not attribute (code review CR-N4).
    const act = argsObject(rec.arguments)?.action;
    if (act !== undefined && act !== 'call') { out.stats.notACall++; return; }
    const id = identify(rec);
    if (!id) { out.stats.unidentified++; return; }
    if (!serviceHasDescriptors(id.serviceName, table)) {
      // not a file lane. A FAILED call lands here too when the agent named the service by its registry id (the table
      // keys on the name): context only, never a row (panel CR-B1 — no 🔴 line sees failed calls).
      if (errorLevel(rec) !== null) out.stats.failedUnmatched++;
      return;
    }
    const level = errorLevel(rec);
    const desc = findDescriptor(id.serviceName, id.tool, table);
    const base = {
      toolCallIndex, serviceName: id.serviceName, serviceId: id.serviceId, identitySource: id.identitySource,
      sourceTool: id.tool, declaredBy: 'platform-default' as const, descriptorVersion: desc ? desc.descriptorVersion : DESCRIPTOR_VERSION, // not-declared: judged against this table version
    };
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
    // 3. errors (declared file tools only)
    if (level !== null) { out.refusals.push(callRefusal('is-error', { level })); return; }
    const data = successData(rec.result) as Obj; // non-null: errorLevel returned null
    const resultRoot = isObj(data.result) ? data.result : {};
    const callArgs = isObj(data.arguments) ? data.arguments : {};
    // 4. digest keys — skip the keys of every star selector's map
    const skip = new Set<string>();
    for (const spec of desc.files) {
      if (spec.select.endsWith('.*')) skip.add(spec.select.slice(0, -2));
    }
    const digest = findDigestKey(resultRoot, skip);
    // 5. files
    for (const spec of desc.files) {
      const cands = selectCandidates(spec, resultRoot);
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
        const selector = toJsonPointer(keyBindable ? c.segments : c.segments.slice(0, -1));
        const target = resolveSource(spec.target, c.key, callArgs);
        const path = resolveSource(spec.path, c.key, callArgs);
        const fileBase = { ...base, selector };
        if (digest) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'raw-digest-present', detail: { field: digest } });
          continue;
        }
        if (!isStr(c.value)) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'descriptor-mismatch', detail: { reason: 'not-a-string' } });
          continue;
        }
        if (target === null || path === null) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'descriptor-mismatch',
            detail: { reason: target === null ? 'target-unresolved' : 'path-unresolved' } });
          continue;
        }
        const pathBad = pathProblem(path);
        if (pathBad || !TARGET_PATTERN.test(target)) {
          out.refusals.push({ ...fileBase, target: null, path: null, refusal: 'path-invalid',
            detail: { field: pathBad ? 'path' : 'target' } });
          continue;
        }
        out.files.push({ ...fileBase, target, path, text: c.value });
      }
    }
  });
  return out;
}
