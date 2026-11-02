/**
 * The gateway's `_meta` on a `services` call, kept for the OPERATOR (PLATFORM-HELD-BYTES Stage B push 1, P1-4, 2026-10-14;
 * register MCPSERVICE-META-REBUILT, owner decision (b)).
 *
 * `mcpService.callEmbeddedTool` rebuilds every embedded result's `_meta` as `{executionTime, serverName, toolName}`, so
 * the gateway's own facts about a call (which service it resolved, which tool, why it failed) never reached a stored
 * record. They now ride BESIDE the result, never IN it:
 *   1. mcpService attaches the FILTERED meta to the result object it returns, through a process-wide WeakMap
 *      (`attachGatewayMeta` / `gatewayMetaOf`). The result's own keys, and `JSON.stringify(result)` -- what the calling
 *      agent reads -- are byte-identical with or without it. The CALLING agent never sees it.
 *   2. The tool loop copies it onto the tool-call RECORD as a NON-ENUMERABLE property (`setRecordGatewayMeta`), so
 *      `JSON.stringify(record)` (SSE cards, toolCalls persistence) cannot carry it.
 *   3. `buildExecutionResultJson` (both paths) moves it to the operator tail key `toolCallGatewayMeta: [{ index, … }]`,
 *      `index` = the record's position in `toolCallResults` = in the persisted `toolCalls[]`. Downstream verbose
 *      `agent.results` readers can page to it; it is past `toolCalls`, so it costs nothing in the 8 KB head.
 *
 * ALLOWLIST (each field validated; a field that fails is DROPPED, never coerced; an empty result attaches nothing):
 *   targetService     a stored service NAME: ^[A-Za-z0-9][A-Za-z0-9 \-]{0,127}$ (prod has `Browser Automation Service`)
 *   requestedTool     an MCP tool name: ^[A-Za-z0-9_.-]{1,128}$
 *   targetServiceId   a registry id, cuid or slug: ^[a-z0-9][a-z0-9-]{0,127}$
 *   errorType         the gateway's closed set: SERVICE_CALL_FAILED | INTERNAL_SERVICE_ERROR | RATE_LIMITED | VALIDATION
 *   retryAfterSec     a finite number 0–86400
 * Everything else the gateway puts in `_meta` (timestamp, executionTime, effectiveTimeout, recentSuccessRate …) is not
 * kept: free text and volatile numbers have no place in a stored operator fact.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-PLAN.md P1-4.
 */

export type GatewayErrorType = 'SERVICE_CALL_FAILED' | 'INTERNAL_SERVICE_ERROR' | 'RATE_LIMITED' | 'VALIDATION';

export interface GatewayMeta {
  targetService?: string;
  requestedTool?: string;
  targetServiceId?: string;
  errorType?: GatewayErrorType;
  retryAfterSec?: number;
}

const SERVICE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,127}$/;
const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;
const SERVICE_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
export const GATEWAY_ERROR_TYPES: readonly GatewayErrorType[] = Object.freeze(
  ['SERVICE_CALL_FAILED', 'INTERNAL_SERVICE_ERROR', 'RATE_LIMITED', 'VALIDATION'] as GatewayErrorType[],
);

/** The allowlisted, validated subset of a gateway `_meta`, or null when nothing survives. Never throws. */
export function filterGatewayMeta(raw: unknown): GatewayMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const out: GatewayMeta = {};
  if (typeof m.targetService === 'string' && SERVICE_NAME_RE.test(m.targetService)) out.targetService = m.targetService;
  if (typeof m.requestedTool === 'string' && TOOL_NAME_RE.test(m.requestedTool)) out.requestedTool = m.requestedTool;
  if (typeof m.targetServiceId === 'string' && SERVICE_ID_RE.test(m.targetServiceId)) out.targetServiceId = m.targetServiceId;
  if (typeof m.errorType === 'string' && (GATEWAY_ERROR_TYPES as readonly string[]).includes(m.errorType)) {
    out.errorType = m.errorType as GatewayErrorType;
  }
  if (typeof m.retryAfterSec === 'number' && Number.isFinite(m.retryAfterSec) && m.retryAfterSec >= 0 && m.retryAfterSec <= 86400) {
    out.retryAfterSec = m.retryAfterSec;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── 1. on the result object (one map per PROCESS) ────────────────────────────────────────────────────────────────
// PROCESS-wide, not module-local (code review agent-execution AE-CR1): paichart-web loads this module TWICE — ts-node at
// startup (server-init.ts, which owns the shared mcpService via globalThis.__mcpService) and webpack for the GUI stream
// route. A module-level map would be written by one copy and read by the other, so GUI runs would silently lose the meta.
// Same idiom as globalThis.__mcpService / __mcpServerManager. Pinned by loading the module twice (test:gateway-meta).
const g = globalThis as unknown as { __paichartGatewayMeta?: WeakMap<object, GatewayMeta> };
const byResult: WeakMap<object, GatewayMeta> = (g.__paichartGatewayMeta ??= new WeakMap<object, GatewayMeta>());

/** Attach filtered meta to a result object. Only `services` calls carry gateway meta; any other tool is a no-op. */
export function attachGatewayMeta(result: unknown, toolName: string, rawMeta: unknown): void {
  if (toolName !== 'services' || !result || typeof result !== 'object') return;
  const meta = filterGatewayMeta(rawMeta);
  if (meta) byResult.set(result as object, meta);
}

/** The gateway meta attached to a result object, or null. */
export function gatewayMetaOf(result: unknown): GatewayMeta | null {
  return result && typeof result === 'object' ? byResult.get(result as object) ?? null : null;
}

// ── 2. on the tool-call record (non-enumerable) ──────────────────────────────────────────────────────────────────
const RECORD_KEY = 'gatewayMeta';

/** Copy meta onto a tool-call record as a NON-ENUMERABLE property (absent from JSON.stringify / spreads / Object.keys). */
export function setRecordGatewayMeta(record: object, meta: GatewayMeta | null): void {
  if (!meta) return;
  Object.defineProperty(record, RECORD_KEY, { value: meta, enumerable: false, writable: false, configurable: true });
}

/** The gateway meta on a tool-call record, or null. Reads the own non-enumerable property only. */
export function recordGatewayMetaOf(record: unknown): GatewayMeta | null {
  if (!record || typeof record !== 'object') return null;
  const d = Object.getOwnPropertyDescriptor(record, RECORD_KEY);
  return d && !d.enumerable && d.value && typeof d.value === 'object' ? (d.value as GatewayMeta) : null;
}

// ── 3. the result.json operator tail key ─────────────────────────────────────────────────────────────────────────
export type ToolCallGatewayMetaEntry = { index: number } & GatewayMeta;

/** `toolCallGatewayMeta` for a list of records: one entry per record that carries meta, `index` = its position. */
export function collectToolCallGatewayMeta(records: readonly unknown[]): ToolCallGatewayMetaEntry[] {
  const out: ToolCallGatewayMetaEntry[] = [];
  records.forEach((r, index) => {
    const m = recordGatewayMetaOf(r);
    if (m) out.push({ index, ...m });
  });
  return out;
}

/** Replay hydration: re-attach persisted `toolCallGatewayMeta` entries onto parsed `toolCalls` by index. Entries that
 *  fail the allowlist, or point past the array, are skipped. Returns how many were attached. */
export function hydrateToolCallGatewayMeta(toolCalls: unknown[], entries: unknown): number {
  if (!Array.isArray(entries)) return 0;
  let n = 0;
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const { index, ...rest } = e as Record<string, unknown>;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= toolCalls.length) continue;
    const rec = toolCalls[index];
    const meta = filterGatewayMeta(rest);
    if (rec && typeof rec === 'object' && meta) { setRecordGatewayMeta(rec, meta); n++; }
  }
  return n;
}
