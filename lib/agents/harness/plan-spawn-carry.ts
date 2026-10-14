/**
 * plan-spawn-carry — the platform's two PLAN-SPAWN carries (C2-a + C3-a, 2026-10-04).
 *
 * Plan: cline_docs/reviews/value-chain-post-window-2026-10-04/C2-C3-IMPLEMENTATION-PLAN-v2.md
 * (decisions: register "C DECIDED", "Group 1–3 DECIDED", "Group A DECIDED", "Group B DECIDED").
 *
 * PLAN-SPAWN is performed by an LLM (the program harness). Two things it does by hand were measured
 * lossy: it TRANSCRIBES the Program Architect's interface contract into every child's `task.create`
 * (23 of 55 rosters since 08-28 not byte-equal to the plan — 4 dropped keys, 19 paraphrased), and it
 * CARRIES the root's duplicate clearance onto every leg (2 of 16 skipped). The platform holds a
 * deterministic source for both, so it now does both itself:
 *
 *   C2-a  the stored contract is the PLAN's (read from the Architect's authoritative finalResponse by
 *         the SAME section-bounded block rule the marker parser uses — one parser, never a second).
 *         Provenance and whether the model's copy matched are recorded (`interfaceContractSource`).
 *         A reviewer child with no contract inherits the plan's at execution prep (closes "Node C has
 *         no contract"), but only when every leg holds the same plan (Q5, compared on CONTENT).
 *   C3-a  at a program leg's execution prep, `duplicateAcknowledged` becomes a superset of the root's
 *         clearance and the prior `Pipeline:` stages in the phase (`duplicateAcknowledgedCarry`).
 *
 * FAIL-OPEN EVERYWHERE (Q1): no failure of either enrichment can refuse a create or an execution. A
 * failure stores / runs exactly what it would have before this module existed, and says so in a fact.
 *
 * DESIGN RULES a later edit must keep:
 *  - CLIENT-FREE by `Pick<>` clients (tests import it with no DATABASE_URL): the only `@prisma/client`
 *    import is the `Prisma` namespace for `Prisma.sql` composition, as in program-protocol.ts. It
 *    imports neither `@/lib/prisma`, nor `inputContext.ts` (which does), nor `CanNeverRunError`: a
 *    refusal here is a log line plus a stamp, NEVER a can-never-run (the createAgentExecution catch
 *    would FAIL the task). All three are pinned by scripts/test-plan-spawn-carry.ts.
 *  - NO RE-TYPED GRAMMAR: the heading regex, the section rule and the fence grammar come from
 *    `derivation-containment.ts`. A fence literal in this file is a pin failure.
 *  - FACTS NOT VERDICTS (Protocol 10): every stamp is something the platform did or measured. The
 *    platform never MATCHES a clearance against a duplicate — it appends a human's decision and the
 *    prior stages by a named rule (`basis`); the same-stage duplicate decision stays the model's.
 *  - UNRENDERED: neither fact reaches §6, the lean card, the Harness Context or the task.create result
 *    (no agent-facing text may move in this batch; the measured population must not see its meter).
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  markerHeadingRegex,
  markerSectionEnd,
  FENCE_LINE_RE,
  FENCED_JSON_BLOCK_RE,
} from './derivation-containment';
import { deepStripDangerousKeys } from '../../utils/sanitize-keys';
import { sanitizeChainedOutput, isR9OperatorEvent } from './sanitize-chained-output';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { findProgramParentForStage } from './program-protocol';

// ── Constants ───────────────────────────────────────────────────────────────────────────────────

/** The heading the Program Architect's guidance mandates as the LITERAL FIRST content of its plan.
 *  Coupled to ROLE_GUIDANCE_LIBRARY.program_architect / .value_chain_architect (pinned, the
 *  VERDICT_MARKER precedent): renaming either side without the other makes every plan unresolvable. */
export const INTERFACE_CONTRACT_MARKER = '## Interface Contract';

/** Cap on the stored contract, in UTF-8 BYTES — the same measure as the leg arm
 *  (`inheritInterfaceContractIfAbsent`: `Buffer.byteLength`), so a contract this reader copies onto a
 *  leg is always inheritable by that leg's children. (The create-time validation refine counts UTF-16
 *  units; 96% of contracts are non-ASCII, so the two measures differ.) */
export const PLAN_CONTRACT_MAX_BYTES = 65536;
/** The bounded `## Interface Contract` section, measured BEFORE any JSON.parse. */
export const PLAN_SECTION_MAX_BYTES = 65536;
/** The whole Architect finalResponse, measured before any regex work (a 48K-token output ≈ 200 KB). */
export const PLAN_RESPONSE_MAX_BYTES = 262144;
/** `deepStripDangerousKeys` stops stripping past depth 20 (`MAX_STRIP_DEPTH`), so a `__proto__` at
 *  depth 21 would survive the strip. A deeper plan is refused (fail-open) rather than half-stripped. */
export const PLAN_CONTRACT_MAX_DEPTH = 20;
export const RESOLVER_VERSION = 1;
/** Bound on every stage-scoped scan (a program stage holds ≤ 8 legs plus a handful of children; a phase holds
 *  tens of stages). Far above any real population, so it never truncates a measurement — it bounds a
 *  pathological one (pagination rule). */
const STAGE_SCAN_BOUND = 500;

/** cuid grammar for the clearance token rule. A comma-joined string is split ONLY when every part is
 *  a cuid; anything else is one opaque name (a stage NAME may legitimately contain a comma). */
const CUID_RE = /^c[a-z0-9]{24}$/;
/** The same rule as a Postgres ARE (whole-string cuid list), bound as a parameter in the carry SQL. */
const CUID_LIST_SQL_RE = '^\\s*c[a-z0-9]{24}\\s*(,\\s*c[a-z0-9]{24}\\s*)*$';

export const CARRY_BASIS = 'program-root-clearance+prior-phase-pipeline-stages';

const utf8Bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

// ── Types ───────────────────────────────────────────────────────────────────────────────────────

/** The CLOSED reason set (v2 §1.3). `resolved` is the only success. */
export type PlanResolution =
  | 'resolved'
  | 'no-architect'
  | 'ambiguous-architect'
  | 'no-authoritative-execution'
  | 'no-final-response'
  | 'response-oversize'
  | 'section-oversize'
  | 'no-heading'
  | 'heading-not-first'
  | 'heading-not-atx'
  | 'unclosed-fence'
  | 'blocks-not-one'
  | 'json-invalid'
  | 'not-object'
  | 'empty-object'
  | 'too-deep'
  | 'sanitize-threw'
  | 'oversize'
  | 'not-storable'
  | 'resolver-error';

/** Q5 comparand reasons (the legs' stored contracts vs the current plan). */
export type ComparandReason = 'plan-differs-from-legs' | 'legs-disagree' | 'leg-without-contract' | 'no-leg-baseline';

export type PlanDb = Pick<
  Prisma.TransactionClient,
  'task' | 'stage' | 'agentExecution' | 'agentArtifact' | '$queryRaw' | '$executeRaw'
>;

export type ContractParse =
  | { ok: true; contract: Record<string, unknown> }
  | { ok: false; reason: PlanResolution };

export interface PlanContractResult {
  status: PlanResolution;
  contract: Record<string, unknown> | null;
  planSha256: string | null;
  architectTaskId: string | null;
  architectExecutionId: string | null;
}

export interface LegBaseline {
  legCount: number;
  /** Distinct canonical shas among the legs that HOLD an object contract (sorted). */
  distinctShas: string[];
  /** null when there are no legs; true only when every leg holds a contract equal to the plan. */
  equalsPlan: boolean | null;
}

export interface R9Fact {
  wouldRewriteClasses: string[];
  applied: false;
  input: 'rendered-contract';
}

export interface InterfaceContractSourceFact {
  source: 'plan' | 'supplied' | 'plan-inherited' | 'none';
  arm: 'create' | 'inherit';
  planResolution: PlanResolution | ComparandReason;
  architectTaskId: string | null;
  architectExecutionId: string | null;
  planSha256: string | null;
  /** True-WHEN-WRITTEN. Compare to the LIVE contract's canonical sha for true-now. */
  storedAtWriteSha256: string | null;
  suppliedSha256: string | null;
  suppliedMatched: boolean | null;
  suppliedDiffPaths: string[] | null;
  suppliedDiffPathCount: number | null;
  legBaseline: LegBaseline | null;
  r9: R9Fact | null;
  resolverVersion: number;
  at: string;
}

/** Every key of the fact, in order — the shape pin and the builder share it. */
export const INTERFACE_CONTRACT_SOURCE_KEYS: ReadonlyArray<keyof InterfaceContractSourceFact> = [
  'source', 'arm', 'planResolution', 'architectTaskId', 'architectExecutionId', 'planSha256',
  'storedAtWriteSha256', 'suppliedSha256', 'suppliedMatched', 'suppliedDiffPaths', 'suppliedDiffPathCount',
  'legBaseline', 'r9', 'resolverVersion', 'at',
];

export interface CarryAttempt {
  outcome: 'wrote' | 'skipped' | 'failed';
  reason: string | null;
  at: string;
}

export interface DuplicateAcknowledgedCarryFact {
  fromTaskId: string | null;
  basis: string | null;
  rootClearance: unknown;
  rootClearanceSha256: string | null;
  priorPipelineStageIds: string[] | null;
  /** CUMULATIVE across carries. */
  added: string[] | null;
  lastAdded: string[] | null;
  carries: number | null;
  firstAt: string | null;
  at: string | null;
  lastAttempt: CarryAttempt | null;
}

export const DUPLICATE_ACK_CARRY_KEYS: ReadonlyArray<keyof DuplicateAcknowledgedCarryFact> = [
  'fromTaskId', 'basis', 'rootClearance', 'rootClearanceSha256', 'priorPipelineStageIds', 'added',
  'lastAdded', 'carries', 'firstAt', 'at', 'lastAttempt',
];

// ── Plan reader: the acceptance rules (v2 §1.3 (a)–(h)) ─────────────────────────────────────────

/** True when `s` holds U+0000 or an unpaired UTF-16 surrogate — both accepted by JSON.parse, both
 *  rejected by Postgres jsonb. The stored contract must never be LESS storable than the supplied one. */
function unstorableString(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) { i++; continue; }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** Max container depth, 0 = the top object. ITERATIVE (no recursion on attacker-shaped nesting). */
function maxContainerDepth(root: unknown, stopAbove: number): number {
  let max = 0;
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d > max) max = d;
    if (max > stopAbove) return max;
    const children = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>);
    for (const c of children) if (c !== null && typeof c === 'object') stack.push([c, d + 1]);
  }
  return max;
}

/** Any key or string value unstorable? ITERATIVE. */
function hasUnstorableString(root: unknown): boolean {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === 'string') { if (unstorableString(v)) return true; continue; }
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) { for (const c of v) stack.push(c); continue; }
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
      if (unstorableString(k)) return true;
      stack.push(c);
    }
  }
  return false;
}

/** Rule (g): the stored contract's compact serialization exceeds the cap, in UTF-8 BYTES. Effectively
 *  dominated by `section-oversize` today (a section always holds at least its contract's text), and kept
 *  on purpose: it is the guarantee — in the leg arm's own measure — that a stored contract is inheritable. */
export function exceedsContractCap(contract: Record<string, unknown>): boolean {
  return utf8Bytes(JSON.stringify(contract)) > PLAN_CONTRACT_MAX_BYTES;
}

/**
 * Read the interface contract out of a Program Architect's finalResponse. PURE.
 *
 * Stricter than the shared marker rule on purpose — this copy lands in a BINDING block:
 *   (a) raw size bounds first (`response-oversize`, then after the heading `section-oversize`);
 *   (b) the FIRST heading match is the first non-whitespace content (`heading-not-first`) and a real
 *       ATX heading — contains `##`, does not start with `>` (`heading-not-atx`). The shared regex
 *       accepts a blockquote or a bare un-hashed line, tuned for Author marker placement;
 *   (c) the section (`markerSectionEnd`) holds exactly ONE fenced block: two fence lines
 *       (`unclosed-fence` on an odd count, `blocks-not-one` otherwise), extracted with
 *       `FENCED_JSON_BLOCK_RE` (a non-json-shaped fence → `json-invalid`);
 *   (d) a JSON OBJECT (`json-invalid` incl. RangeError, `not-object`, `empty-object`);
 *   (e) nesting ≤ PLAN_CONTRACT_MAX_DEPTH (`too-deep`); (f) `deepStripDangerousKeys` (`sanitize-threw`);
 *   (g) ≤ PLAN_CONTRACT_MAX_BYTES in UTF-8 bytes (`oversize`); (h) storable in jsonb (`not-storable`).
 * Nothing is copied on any failure, and nothing is ever truncated.
 */
export function parsePlanContractText(text: string): ContractParse {
  if (utf8Bytes(text) > PLAN_RESPONSE_MAX_BYTES) return { ok: false, reason: 'response-oversize' };

  // A FRESH regex (markerHeadingRegex never shares one) — first match only.
  const re = markerHeadingRegex(INTERFACE_CONTRACT_MARKER);
  const m = re.exec(text);
  if (!m) return { ok: false, reason: 'no-heading' };
  if (text.slice(0, m.index).trim() !== '') return { ok: false, reason: 'heading-not-first' };
  if (!m[0].includes('##') || m[0].trimStart().startsWith('>')) return { ok: false, reason: 'heading-not-atx' };

  const section = text.slice(m.index, markerSectionEnd(text, m.index));
  if (utf8Bytes(section) > PLAN_SECTION_MAX_BYTES) return { ok: false, reason: 'section-oversize' };

  let fenceLines = 0;
  for (const line of section.split('\n')) if (FENCE_LINE_RE.test(line)) fenceLines++;
  if (fenceLines % 2 === 1) return { ok: false, reason: 'unclosed-fence' };
  if (fenceLines !== 2) return { ok: false, reason: 'blocks-not-one' };
  const fence = section.match(FENCED_JSON_BLOCK_RE);
  if (!fence) return { ok: false, reason: 'json-invalid' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(fence[1]);
  } catch {
    return { ok: false, reason: 'json-invalid' }; // SyntaxError and RangeError alike
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'not-object' };
  if (Object.keys(parsed as Record<string, unknown>).length === 0) return { ok: false, reason: 'empty-object' };
  if (maxContainerDepth(parsed, PLAN_CONTRACT_MAX_DEPTH) > PLAN_CONTRACT_MAX_DEPTH) return { ok: false, reason: 'too-deep' };

  let stripped: Record<string, unknown>;
  try {
    stripped = deepStripDangerousKeys(parsed as Record<string, unknown>);
  } catch {
    return { ok: false, reason: 'sanitize-threw' };
  }
  if (exceedsContractCap(stripped)) return { ok: false, reason: 'oversize' };
  if (hasUnstorableString(stripped)) return { ok: false, reason: 'not-storable' };
  return { ok: true, contract: stripped };
}

// ── Canonicalisation + diff ─────────────────────────────────────────────────────────────────────

const CANON_MAX_DEPTH = 64;

function sortKeysDeep(v: unknown, depth: number): unknown {
  if (depth > CANON_MAX_DEPTH) throw new Error('canonicalContractSha: nesting exceeds bound');
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => sortKeysDeep(x, depth + 1));
  const out: Record<string, unknown> = {};
  // Default sort = UTF-16 code-unit order (never localeCompare: locale-dependent).
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortKeysDeep((v as Record<string, unknown>)[k], depth + 1);
  }
  return out;
}

/**
 * The ONE canonical hash of a contract: `deepStripDangerousKeys` → recursive key sort by UTF-16 code
 * unit → compact `JSON.stringify` → sha256 hex. The create site, `legBaseline`, Q5 and the replay all
 * call this. ⚠️ It is NOT reproducible from SQL `contract::text` (jsonb orders keys by length then
 * bytes, and adds spacing): compare jsonb VALUES in SQL, hashes only through this function.
 */
export function canonicalContractSha(contract: unknown): string {
  const stripped = contract !== null && typeof contract === 'object' && !Array.isArray(contract)
    ? deepStripDangerousKeys(contract as Record<string, unknown>)
    : contract;
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(stripped, 0))).digest('hex');
}

/** RFC 6901 JSON Pointer token escaping (`~` → `~0`, `/` → `~1`; `.` is literal). */
export function jsonPointerToken(k: string): string {
  return k.replace(/~/g, '~0').replace(/\//g, '~1');
}

const DIFF_MAX_PATHS = 25;
const DIFF_MAX_PATH_CHARS = 200;
const DIFF_MAX_DEPTH = 32;

/** The JSON Pointer paths where two contracts differ (canonical comparison), ≤25 paths of ≤200 chars,
 *  plus the full count. Depth-bounded: below DIFF_MAX_DEPTH a differing subtree is one path. */
export function diffContractPaths(a: unknown, b: unknown): { paths: string[]; count: number } {
  const paths: string[] = [];
  let count = 0;
  const record = (p: string) => {
    count++;
    if (paths.length < DIFF_MAX_PATHS) paths.push(p.length > DIFF_MAX_PATH_CHARS ? p.slice(0, DIFF_MAX_PATH_CHARS) : p);
  };
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const walk = (x: unknown, y: unknown, p: string, depth: number) => {
    if (depth > DIFF_MAX_DEPTH) {
      if (JSON.stringify(sortKeysDeep(x, 0)) !== JSON.stringify(sortKeysDeep(y, 0))) record(p);
      return;
    }
    if (isObj(x) && isObj(y)) {
      const keys = Array.from(new Set([...Object.keys(x), ...Object.keys(y)])).sort();
      for (const k of keys) {
        const child = `${p}/${jsonPointerToken(k)}`;
        if (!(k in x) || !(k in y)) record(child);
        else walk(x[k], y[k], child, depth + 1);
      }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) {
        if (i >= x.length || i >= y.length) record(`${p}/${i}`);
        else walk(x[i], y[i], `${p}/${i}`, depth + 1);
      }
      return;
    }
    if (x !== y) record(p === '' ? '' : p);
  };
  walk(a, b, '', 0);
  return { paths, count };
}

// ── R9 classification of the RENDERED contract (Q8: classify, never apply) ──────────────────────

/**
 * Classify what R9 WOULD rewrite in the bytes a child is shown: `JSON.stringify(contract, null, 2)`,
 * exactly as `render-pipeline-context.ts` renders the BINDING block. Nothing is applied (Q8). This is
 * the FIRST R9 observation this content has ever had — the contract never passed R9 site A.
 *
 * ⚠️ `ansi`, `control` and `emptied` are ZERO BY CONSTRUCTION on this form: JSON.stringify re-escapes
 * every control character (so they are harmless to the child as well). A zero for them is not a
 * measurement. Matches are returned for the operator log ONLY — never stamped into a fact.
 */
export function classifyRenderedContract(contract: Record<string, unknown>): {
  fact: R9Fact;
  operatorEvent: boolean;
  matches: string[];
} {
  const r = sanitizeChainedOutput(JSON.stringify(contract, null, 2));
  return {
    fact: { wouldRewriteClasses: [...r.rewriteClasses], applied: false, input: 'rendered-contract' },
    operatorEvent: isR9OperatorEvent(r.rewriteClasses),
    matches: r.neutralizedInjections.slice(0, 5).map((n) => n.match.slice(0, 60)),
  };
}

const operatorEventKeys = new Set<string>();
/** At most one operator-event warn per (architectExecutionId, contract sha) per process. The worst case
 *  across processes is one duplicate line. */
export function operatorEventOnce(executionId: string | null, sha: string | null): boolean {
  const key = `${executionId ?? '-'}:${sha ?? '-'}`;
  if (operatorEventKeys.has(key)) return false;
  operatorEventKeys.add(key);
  return true;
}

// ── Architect lookup + plan resolution ──────────────────────────────────────────────────────────

const isSuperseded = (meta: unknown): boolean => {
  const c = (meta as Record<string, unknown> | null)?.cannotRun;
  return typeof c === 'string' && c.startsWith('superseded:');
};

/**
 * The program stage's Architect: the ONE task in the stage whose template has templateType ARCHITECT,
 * excluding a superseded (`metadata.cannotRun` 'superseded:…') or terminal-FAILED one. Uniqueness
 * comes from STAGE SCOPING, not the type (ARCHITECT is shared by nine templates; leg architects live
 * in leg child stages) — so a GUI-added Solution Architect in a program stage reads
 * `ambiguous-architect` (fail-open).
 */
export async function findProgramArchitect(
  db: Pick<PlanDb, 'task'>,
  programStageId: string,
): Promise<{ status: 'resolved'; taskId: string } | { status: 'no-architect' | 'ambiguous-architect' }> {
  const rows = await db.task.findMany({
    where: { stageId: programStageId, agentTemplate: { templateType: 'ARCHITECT' } },
    select: { id: true, metadata: true, executionStatus: true },
    take: STAGE_SCAN_BOUND,
  });
  const live = rows.filter((r) => !isSuperseded(r.metadata) && r.executionStatus !== 'FAILED');
  if (live.length === 0) return { status: 'no-architect' };
  if (live.length > 1) return { status: 'ambiguous-architect' };
  return { status: 'resolved', taskId: live[0].id };
}

/** Resolve the CURRENT plan contract of a program stage. Throws only on infrastructure errors — the
 *  callers wrap it (resolver-error). */
export async function resolvePlanContract(db: PlanDb, programStageId: string): Promise<PlanContractResult> {
  const empty = (status: PlanResolution, architectTaskId: string | null = null, architectExecutionId: string | null = null): PlanContractResult =>
    ({ status, contract: null, planSha256: null, architectTaskId, architectExecutionId });
  const arch = await findProgramArchitect(db, programStageId);
  if (arch.status !== 'resolved') return empty(arch.status);
  const read = await readAuthoritativeResultField(db, arch.taskId, 'finalResponse');
  if (read.executionId === null) return empty('no-authoritative-execution', arch.taskId);
  if (read.value === null) return empty('no-final-response', arch.taskId, read.executionId);
  const parsed = parsePlanContractText(read.value);
  if (!parsed.ok) return empty(parsed.reason, arch.taskId, read.executionId);
  return {
    status: 'resolved',
    contract: parsed.contract,
    planSha256: canonicalContractSha(parsed.contract),
    architectTaskId: arch.taskId,
    architectExecutionId: read.executionId,
  };
}

// ── Q5 comparand: the legs' stored contracts ────────────────────────────────────────────────────

/**
 * What the program stage's legs were GIVEN: the canonical sha of each currently stored contract on its
 * PIPELINE tasks (excluding `excludeTaskId` and superseded legs; HALTED legs count). Content, not the
 * `planSha256` stamp — content covers pre-deploy legs, fail-open legs and post-create mutations by
 * construction, and it reads no client-writable fact (a forged `interfaceContractSource` cannot steer it).
 */
export async function legBaseline(
  db: Pick<PlanDb, 'task'>,
  programStageId: string,
  excludeTaskId: string | null,
  planSha256: string | null,
): Promise<{ baseline: LegBaseline; comparand: ComparandReason | null }> {
  const rows = await db.task.findMany({
    where: { stageId: programStageId, type: 'PIPELINE', ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}) },
    select: { id: true, metadata: true, inputContext: true },
    take: STAGE_SCAN_BOUND,
  });
  const legs = rows.filter((r) => !isSuperseded(r.metadata));
  let without = 0;
  const shas = new Set<string>();
  for (const l of legs) {
    const c = (l.inputContext as Record<string, unknown> | null)?.interfaceContract;
    if (c !== null && typeof c === 'object' && !Array.isArray(c)) shas.add(canonicalContractSha(c));
    else without++;
  }
  const distinctShas = Array.from(shas).sort();
  const legCount = legs.length;
  let comparand: ComparandReason | null = null;
  if (legCount === 0) comparand = 'no-leg-baseline';
  else if (without > 0) comparand = 'leg-without-contract';
  else if (distinctShas.length > 1) comparand = 'legs-disagree';
  else if (distinctShas[0] !== planSha256) comparand = 'plan-differs-from-legs';
  return {
    baseline: { legCount, distinctShas, equalsPlan: legCount === 0 ? null : comparand === null },
    comparand,
  };
}

// ── Fact builder ────────────────────────────────────────────────────────────────────────────────

/** Build an `interfaceContractSource` fact with EVERY key present (explicit null where empty). */
export function buildSourceFact(
  p: Partial<InterfaceContractSourceFact> & Pick<InterfaceContractSourceFact, 'source' | 'arm' | 'planResolution'>,
  at: string,
): InterfaceContractSourceFact {
  return {
    source: p.source,
    arm: p.arm,
    planResolution: p.planResolution,
    architectTaskId: p.architectTaskId ?? null,
    architectExecutionId: p.architectExecutionId ?? null,
    planSha256: p.planSha256 ?? null,
    storedAtWriteSha256: p.storedAtWriteSha256 ?? null,
    suppliedSha256: p.suppliedSha256 ?? null,
    suppliedMatched: p.suppliedMatched ?? null,
    suppliedDiffPaths: p.suppliedDiffPaths ?? null,
    suppliedDiffPathCount: p.suppliedDiffPathCount ?? null,
    legBaseline: p.legBaseline ?? null,
    r9: p.r9 ?? null,
    resolverVersion: RESOLVER_VERSION,
    at,
  };
}

const safeSha = (v: unknown): string | null => { try { return canonicalContractSha(v); } catch { return null; } };
const safeR9 = (c: Record<string, unknown>) => { try { return classifyRenderedContract(c); } catch { return null; } };

// ── C2 create site ──────────────────────────────────────────────────────────────────────────────

export interface CreateContractDecision {
  stored: Record<string, unknown>;
  sourceFact: InterfaceContractSourceFact | null;
  /** For the caller's logs only. */
  signals: {
    suppliedMismatch: boolean;
    divergesFromLegs: boolean;
    resolveError: unknown | null;
    operatorEvent: { matches: string[]; classes: string[] } | null;
  };
}

/**
 * The create-site decision, PURE (v2 §1.1, QS6 = option (ii) FACT-ONLY):
 *  - not a program stage → the supplied contract, NO key written;
 *  - plan unresolved → the supplied contract, `source:'supplied'` + the reason (Q1 fail-open);
 *  - plan resolved → the PLAN's contract, `source:'plan'` + `suppliedMatched` (+ diff paths). When
 *    existing legs hold something other than this plan, it STILL stores the plan and stamps
 *    `legBaseline.equalsPlan:false` (QS6 (ii): no fail-open cascade — a later child never inherits an
 *    earlier child's paraphrase). Restoring the siblings' contract instead is E's design, not this.
 */
export function decideCreateContract(input: {
  supplied: Record<string, unknown>;
  programRootId: string | null;
  plan: PlanContractResult | null;
  legBaseline: LegBaseline | null;
  resolveError?: unknown;
  at: string;
}): CreateContractDecision {
  const { supplied, programRootId, plan, at } = input;
  const signals: CreateContractDecision['signals'] = {
    suppliedMismatch: false, divergesFromLegs: false, resolveError: input.resolveError ?? null, operatorEvent: null,
  };
  const r9Of = (c: Record<string, unknown>) => {
    const r = safeR9(c);
    if (r?.operatorEvent) signals.operatorEvent = { matches: r.matches, classes: r.fact.wouldRewriteClasses };
    return r?.fact ?? null;
  };

  if (input.resolveError !== undefined && input.resolveError !== null) {
    return {
      stored: supplied,
      sourceFact: buildSourceFact({
        source: 'supplied', arm: 'create', planResolution: 'resolver-error',
        storedAtWriteSha256: safeSha(supplied), suppliedSha256: safeSha(supplied), r9: r9Of(supplied),
      }, at),
      signals,
    };
  }
  if (!programRootId) return { stored: supplied, sourceFact: null, signals };

  if (!plan || plan.status !== 'resolved' || !plan.contract) {
    return {
      stored: supplied,
      sourceFact: buildSourceFact({
        source: 'supplied', arm: 'create', planResolution: plan?.status ?? 'resolver-error',
        architectTaskId: plan?.architectTaskId, architectExecutionId: plan?.architectExecutionId,
        storedAtWriteSha256: safeSha(supplied), suppliedSha256: safeSha(supplied), r9: r9Of(supplied),
      }, at),
      signals,
    };
  }

  const suppliedSha256 = canonicalContractSha(supplied);
  const matched = suppliedSha256 === plan.planSha256;
  const diff = matched ? { paths: [], count: 0 } : diffContractPaths(deepStripDangerousKeys(supplied), plan.contract);
  signals.suppliedMismatch = !matched;
  const lb = input.legBaseline;
  signals.divergesFromLegs = !!lb && lb.legCount > 0 && lb.equalsPlan !== true;
  return {
    stored: plan.contract,
    sourceFact: buildSourceFact({
      source: 'plan', arm: 'create', planResolution: 'resolved',
      architectTaskId: plan.architectTaskId, architectExecutionId: plan.architectExecutionId,
      planSha256: plan.planSha256, storedAtWriteSha256: plan.planSha256,
      suppliedSha256, suppliedMatched: matched, suppliedDiffPaths: diff.paths, suppliedDiffPathCount: diff.count,
      legBaseline: lb, r9: r9Of(plan.contract),
    }, at),
    signals,
  };
}

/**
 * The create-site call: ONE try/catch around the whole resolution (v2 T1). ANY throw — the F12 lookup,
 * the Architect lookup, the authoritative read (its `content::jsonb` cast throws on a lone-surrogate
 * artifact), a walker — stores the supplied value exactly as today, stamped `resolver-error`. No
 * failure mode of this enrichment can refuse a create.
 */
export async function resolveCreateContract(
  db: PlanDb,
  stageId: string,
  supplied: Record<string, unknown>,
  now: () => string = () => new Date().toISOString(),
): Promise<CreateContractDecision> {
  try {
    const programRootId = await findProgramParentForStage(db, stageId);
    if (!programRootId) return decideCreateContract({ supplied, programRootId: null, plan: null, legBaseline: null, at: now() });
    const plan = await resolvePlanContract(db, stageId);
    const lb = plan.status === 'resolved' ? (await legBaseline(db, stageId, null, plan.planSha256)).baseline : null;
    return decideCreateContract({ supplied, programRootId, plan, legBaseline: lb, at: now() });
  } catch (err) {
    return decideCreateContract({ supplied, programRootId: null, plan: null, legBaseline: null, resolveError: err ?? new Error('unknown'), at: now() });
  }
}

// ── C2 reviewer arm (execution prep) ────────────────────────────────────────────────────────────

export type InheritDecision =
  | { action: 'inherit'; contract: Record<string, unknown>; fact: InterfaceContractSourceFact; operatorEvent: { matches: string[]; classes: string[] } | null }
  | { action: 'refuse'; reason: PlanResolution | ComparandReason; fact: InterfaceContractSourceFact };

/**
 * Should a contract-less reviewer-set child of a program stage inherit the plan? Inherit ONLY when the
 * plan resolves AND at least one leg exists AND every leg holds an object contract equal to the plan
 * (Q5, compared on CONTENT). Otherwise refuse with the named reason. An empty leg set NEVER falls back
 * to the current plan — that fallback is exactly the deploy-straddle break.
 */
export async function resolveInheritDecision(
  db: PlanDb,
  programStageId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<InheritDecision> {
  const plan = await resolvePlanContract(db, programStageId);
  if (plan.status !== 'resolved' || !plan.contract) {
    return {
      action: 'refuse', reason: plan.status,
      fact: buildSourceFact({
        source: 'none', arm: 'inherit', planResolution: plan.status,
        architectTaskId: plan.architectTaskId, architectExecutionId: plan.architectExecutionId,
      }, now()),
    };
  }
  const { baseline, comparand } = await legBaseline(db, programStageId, null, plan.planSha256);
  if (comparand) {
    return {
      action: 'refuse', reason: comparand,
      fact: buildSourceFact({
        source: 'none', arm: 'inherit', planResolution: comparand,
        architectTaskId: plan.architectTaskId, architectExecutionId: plan.architectExecutionId,
        planSha256: plan.planSha256, legBaseline: baseline,
      }, now()),
    };
  }
  const r9 = safeR9(plan.contract);
  return {
    action: 'inherit',
    contract: plan.contract,
    operatorEvent: r9?.operatorEvent ? { matches: r9.matches, classes: r9.fact.wouldRewriteClasses } : null,
    fact: buildSourceFact({
      source: 'plan-inherited', arm: 'inherit', planResolution: 'resolved',
      architectTaskId: plan.architectTaskId, architectExecutionId: plan.architectExecutionId,
      planSha256: plan.planSha256, storedAtWriteSha256: plan.planSha256, legBaseline: baseline, r9: r9?.fact ?? null,
    }, now()),
  };
}

/** Stamp `metadata.interfaceContractSource` with ONE in-statement jsonb `||` (overwrite-latest,
 *  idempotent). Used for the reviewer arm's REFUSALS; a successful inherit is stamped by the write
 *  that won (`writeInterfaceContractIfAbsent`'s metadata patch), never by a second statement. */
export async function stampInterfaceContractSource(
  db: Pick<PlanDb, '$executeRaw'>,
  taskId: string,
  fact: InterfaceContractSourceFact,
): Promise<number> {
  const patch = JSON.stringify({ interfaceContractSource: fact });
  return db.$executeRaw`
    UPDATE "tasks" SET metadata = COALESCE(metadata, '{}'::jsonb) || ${patch}::jsonb
     WHERE id = ${taskId}`;
}

// ── C3: clearance token rule + carry ────────────────────────────────────────────────────────────

/** Tokens of one string element: a comma-separated list is split ONLY when every part is a cuid;
 *  otherwise the string is one opaque name, kept VERBATIM. Mirrors the SQL rule in the carry. */
export function clearanceStringTokens(s: string): string[] {
  const parts = s.split(',').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => CUID_RE.test(p)) ? parts : [s];
}

/**
 * The coverage tokens of a `duplicateAcknowledged` value (v2 §1.4.4 token rule). For COVERAGE only —
 * the platform never rewrites a human's value. JSON null / absent → []; a string → its tokens; an
 * array → the tokens of each string element (a non-string element as its JSON text). Any other shape
 * → null (not tokenizable — the carry skips it as `existing-shape`).
 */
export function clearanceTokens(value: unknown): string[] | null {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return clearanceStringTokens(value);
  if (Array.isArray(value)) {
    return value.flatMap((el) => (typeof el === 'string' ? clearanceStringTokens(el) : [JSON.stringify(el)]));
  }
  return null;
}

/**
 * `agent.status` `resolved` for a duplicate halt (v2 §1.6, QS1 decided NARROWED). Today's rule —
 * `duplicateAcknowledged != null` — assumes the key is present only because a human answered the halt.
 * C3 breaks that premise for a leg the platform CARRIED a clearance onto. So where the platform actually
 * carried (`duplicateAcknowledgedCarry.carries >= 1`), the halt counts as resolved only if the halted
 * stage is a member of the clearance. Everywhere else — no carry object, or one holding only a skipped
 * or failed `lastAttempt` — the result is byte-identical to today. Set membership on two stamped strings,
 * not a duplicate judgement. A halt naming the stage by NAME while the list holds ids reads
 * `resolved:false` — the conservative direction (the recommendation stays visible).
 */
export function isDuplicateHaltResolved(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  const ack = m.duplicateAcknowledged;
  if (ack === null || ack === undefined) return false;
  const carry = m.duplicateAcknowledgedCarry as Record<string, unknown> | null | undefined;
  const carries = carry && typeof carry === 'object' && typeof carry.carries === 'number' ? carry.carries : 0;
  if (!(carries >= 1)) return true;
  const halt = m.duplicateHalt as Record<string, unknown> | null | undefined;
  const existing = halt && typeof halt === 'object' ? halt.existingStage : undefined;
  const tokens = clearanceTokens(ack) ?? [];
  return typeof existing === 'string' && tokens.includes(existing);
}

/** A carry fact skeleton: every key present, null where empty (shape pin). */
export function carrySkeleton(): DuplicateAcknowledgedCarryFact {
  return {
    fromTaskId: null, basis: null, rootClearance: null, rootClearanceSha256: null, priorPipelineStageIds: null,
    added: null, lastAdded: null, carries: null, firstAt: null, at: null, lastAttempt: null,
  };
}

export type CarryResult =
  | { outcome: 'not-program' }
  | { outcome: 'no-root-clearance'; rootTaskId: string }
  | { outcome: 'skipped'; reason: 'root-clearance-unbound' | 'existing-shape'; rootTaskId: string }
  | { outcome: 'noop'; rootTaskId: string }
  | { outcome: 'wrote'; rootTaskId: string; added: string[]; after: unknown };

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/**
 * Stamp ONLY `duplicateAcknowledgedCarry.lastAttempt` (skipped / failed). Touches none of the
 * cumulative fields: an existing carry object keeps them; an absent one becomes the skeleton (every key
 * null) plus the attempt. One in-statement jsonb write.
 */
export async function stampCarryAttempt(
  db: Pick<PlanDb, '$executeRaw'>,
  taskId: string,
  attempt: CarryAttempt,
): Promise<number> {
  const skeleton = JSON.stringify(carrySkeleton());
  const att = JSON.stringify(attempt);
  return db.$executeRaw`
    UPDATE "tasks"
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('duplicateAcknowledgedCarry',
             (CASE WHEN jsonb_typeof(metadata->'duplicateAcknowledgedCarry') = 'object'
                   THEN metadata->'duplicateAcknowledgedCarry' ELSE ${skeleton}::jsonb END)
             || jsonb_build_object('lastAttempt', ${att}::jsonb))
     WHERE id = ${taskId}`;
}

export type CarryPlan =
  | { outcome: 'not-program' }
  | { outcome: 'no-root-clearance'; rootTaskId: string }
  | { outcome: 'skipped'; reason: 'root-clearance-unbound' | 'existing-shape'; rootTaskId: string }
  | { outcome: 'carry'; rootTaskId: string; rootAck: unknown; rootTokens: string[]; priorPipelineStageIds: string[]; target: string[] };

/**
 * The READ-ONLY half of C3-a: decide whether and what to carry onto a program leg. No writes — the replay
 * (scripts/replay-plan-contract.ts --carry) calls this against prod, and `carryProgramClearance` acts on it.
 * Decided rules (v2 §1.4.4; S7 = register "Group A DECIDED"):
 *  - acts only when the root holds a non-empty string/array clearance in METADATA (a `PRE-FLIGHT
 *    CLEARANCE:` description block is NOT carried — parsing prose into ids would be a platform verdict);
 *  - S7: at least one root token must name a REAL STAGE IN THE POV (id or exact name), else
 *    `root-clearance-unbound` (fails toward today's behaviour);
 *  - the leg's existing value must be string / array / null / absent, else `existing-shape`;
 *  - prior = stages in the program stage's phase named `Pipeline:…` created BEFORE the program stage (Q4);
 *  - target = root tokens ∪ prior (deduplicated, root order first).
 */
export async function planProgramClearanceCarry(
  db: Pick<PlanDb, 'task' | 'stage'>,
  input: { stageId: string; legMetadata: Record<string, unknown> | null },
): Promise<CarryPlan> {
  const rootTaskId = await findProgramParentForStage(db, input.stageId);
  if (!rootTaskId) return { outcome: 'not-program' };

  const root = await db.task.findUnique({ where: { id: rootTaskId }, select: { metadata: true } });
  const rootAck = (root?.metadata as Record<string, unknown> | null)?.duplicateAcknowledged;
  const rootIsCarriable = (typeof rootAck === 'string' && rootAck.trim() !== '') || (Array.isArray(rootAck) && rootAck.length > 0);
  if (!rootIsCarriable) return { outcome: 'no-root-clearance', rootTaskId };
  const rootTokens = Array.from(new Set((clearanceTokens(rootAck) ?? []).filter((t) => t.trim() !== '')));
  if (rootTokens.length === 0) return { outcome: 'no-root-clearance', rootTaskId };

  const programStage = await db.stage.findUnique({
    where: { id: input.stageId },
    select: { id: true, phaseId: true, createdAt: true, phase: { select: { povId: true } } },
  });
  if (!programStage) return { outcome: 'not-program' };

  const bound = await db.stage.findFirst({
    where: {
      phase: { povId: programStage.phase.povId },
      OR: [{ id: { in: rootTokens } }, { name: { in: rootTokens } }],
    },
    select: { id: true },
  });
  if (!bound) return { outcome: 'skipped', reason: 'root-clearance-unbound', rootTaskId };
  if (clearanceTokens(input.legMetadata?.duplicateAcknowledged) === null) return { outcome: 'skipped', reason: 'existing-shape', rootTaskId };

  const prior = await db.stage.findMany({
    where: { phaseId: programStage.phaseId, name: { startsWith: 'Pipeline:' }, createdAt: { lt: programStage.createdAt } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: STAGE_SCAN_BOUND,
  });
  const priorPipelineStageIds = prior.map((s) => s.id);
  return {
    outcome: 'carry', rootTaskId, rootAck, rootTokens, priorPipelineStageIds,
    target: Array.from(new Set([...rootTokens, ...priorPipelineStageIds])),
  };
}

/**
 * C3-a: make a program LEG's `duplicateAcknowledged` a superset of its root's clearance and the prior
 * `Pipeline:` stages of the phase, at the leg's execution prep (`planProgramClearanceCarry` decides).
 *  - existing elements are kept VERBATIM and in order; missing tokens are APPENDED; a string is folded
 *    into a one-element array; JSON null is absent; never `jsonb_agg(DISTINCT)` (it reorders);
 *  - ONE statement: the no-op test, the append, `added` (from the row's PRE-IMAGE — SET expressions see
 *    the pre-update row, re-read after a lock wait) and the carry fact all inside it. A no-op writes
 *    nothing and bumps no `updated_at`;
 *  - a skip stamps ONLY `lastAttempt` (E5 / not-program / no-op stay keyless).
 * Throws on infrastructure errors; the caller catches (`carry-error`, fail-open).
 */
export async function carryProgramClearance(
  db: PlanDb,
  input: { taskId: string; stageId: string; legMetadata: Record<string, unknown> | null; now?: string },
): Promise<CarryResult> {
  const now = input.now ?? new Date().toISOString();
  const plan = await planProgramClearanceCarry(db, input);
  if (plan.outcome === 'not-program' || plan.outcome === 'no-root-clearance') return plan;
  if (plan.outcome === 'skipped') {
    await stampCarryAttempt(db, input.taskId, { outcome: 'skipped', reason: plan.reason, at: now });
    return plan;
  }
  const { rootTaskId, rootAck, priorPipelineStageIds, target } = plan;

  const targetJson = JSON.stringify(target);
  const priorJson = JSON.stringify(priorPipelineStageIds);
  const rootClearanceJson = JSON.stringify(rootAck);
  const rootClearanceSha256 = sha256(JSON.stringify(sortKeysDeep(rootAck, 0)));
  const attemptJson = JSON.stringify({ outcome: 'wrote', reason: null, at: now } satisfies CarryAttempt);

  // The CURRENT leg value as an array (string folded, null/absent → []), its coverage tokens, and the
  // target tokens it is MISSING — all expressions over the row being updated, so in SET they read its
  // PRE-IMAGE (re-read after a lock wait). Composed once, used in SET and WHERE alike.
  const curArr = Prisma.sql`(CASE jsonb_typeof(t.metadata->'duplicateAcknowledged')
      WHEN 'array' THEN t.metadata->'duplicateAcknowledged'
      WHEN 'string' THEN jsonb_build_array(t.metadata->'duplicateAcknowledged')
      ELSE '[]'::jsonb END)`;
  const curTokens = Prisma.sql`(SELECT COALESCE(jsonb_agg(x.tok), '[]'::jsonb)
      FROM jsonb_array_elements_text(${curArr}) e(v),
           LATERAL (SELECT btrim(s) AS tok FROM regexp_split_to_table(e.v, ',') s WHERE e.v ~ ${CUID_LIST_SQL_RE}
                    UNION ALL SELECT e.v WHERE e.v !~ ${CUID_LIST_SQL_RE}) x)`;
  const missing = Prisma.sql`(SELECT COALESCE(jsonb_agg(to_jsonb(g.v) ORDER BY g.ord), '[]'::jsonb)
      FROM jsonb_array_elements_text(${targetJson}::jsonb) WITH ORDINALITY g(v, ord)
     WHERE NOT (${curTokens} ? g.v))`;
  const prevCarry = Prisma.sql`t.metadata->'duplicateAcknowledgedCarry'`;

  const rows = await db.$queryRaw<Array<{ after: unknown; lastAdded: unknown }>>(Prisma.sql`
    UPDATE "tasks" t
       SET metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
             'duplicateAcknowledged', ${curArr} || ${missing},
             'duplicateAcknowledgedFrom',
               CASE WHEN t.metadata ? 'duplicateAcknowledgedFrom' THEN t.metadata->'duplicateAcknowledgedFrom'
                    ELSE to_jsonb(${rootTaskId}::text) END,
             'duplicateAcknowledgedCarry', jsonb_build_object(
               'fromTaskId', ${rootTaskId}::text,
               'basis', ${CARRY_BASIS}::text,
               'rootClearance', ${rootClearanceJson}::jsonb,
               'rootClearanceSha256', ${rootClearanceSha256}::text,
               'priorPipelineStageIds', ${priorJson}::jsonb,
               'added',
                 (CASE WHEN jsonb_typeof(${prevCarry}->'added') = 'array' THEN ${prevCarry}->'added' ELSE '[]'::jsonb END)
                 || ${missing},
               'lastAdded', ${missing},
               'carries',
                 (CASE WHEN jsonb_typeof(${prevCarry}->'carries') = 'number'
                       THEN (${prevCarry}->>'carries')::numeric ELSE 0 END) + 1,
               'firstAt',
                 COALESCE(CASE WHEN jsonb_typeof(${prevCarry}->'firstAt') = 'string' THEN ${prevCarry}->'firstAt' END,
                          to_jsonb(${now}::text)),
               'at', ${now}::text,
               'lastAttempt', ${attemptJson}::jsonb)),
           "updated_at" = now()
     WHERE t.id = ${input.taskId}
       AND t.type = 'PIPELINE'
       AND (jsonb_typeof(t.metadata->'duplicateAcknowledged') IS NULL
            OR jsonb_typeof(t.metadata->'duplicateAcknowledged') IN ('array', 'string', 'null'))
       AND NOT (${curTokens} @> ${targetJson}::jsonb)
     RETURNING t.metadata->'duplicateAcknowledged' AS after,
               t.metadata->'duplicateAcknowledgedCarry'->'lastAdded' AS "lastAdded"`);
  if (rows.length === 0) return { outcome: 'noop', rootTaskId };
  const lastAdded = Array.isArray(rows[0].lastAdded) ? (rows[0].lastAdded as string[]) : [];
  return { outcome: 'wrote', rootTaskId, added: lastAdded, after: rows[0].after };
}
