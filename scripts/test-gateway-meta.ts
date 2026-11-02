#!/usr/bin/env ts-node
/**
 * test-gateway-meta.ts — PLATFORM-HELD-BYTES Stage B push 1, P1-4 (register MCPSERVICE-META-REBUILT, owner decision (b)).
 *
 * The gateway's `_meta` on a `services` call rides BESIDE the result (module-private WeakMap), then on the tool-call record
 * (non-enumerable), then in the result.json operator tail key `toolCallGatewayMeta: [{ index, … }]`. What the calling agent
 * reads, and every serialization of the record, is byte-identical with or without it.
 *
 * Pins: the allowlist (each field, both directions; prod-shaped stored names); the accessor is non-enumerable; the result
 * text the loop sends the model is byte-identical; both builder paths' shared builder emits the tail key LAST, index-aligned,
 * and only when present; no toolCalls[i] carries it; replay hydration round-trips; the raw-tool witness ignores it; static
 * wiring (mcpService attaches only through the accessor; the loop sets it on the record; the SSE card copies named fields).
 * CI-safe: no DB. Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-PLAN.md P1-4.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci_stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // no DB is touched; lib/prisma's eager $connect would process.exit(1) on the stub (a race)
import * as fs from 'fs';
import * as path from 'path';
import {
  filterGatewayMeta, attachGatewayMeta, gatewayMetaOf, setRecordGatewayMeta, recordGatewayMetaOf,
  collectToolCallGatewayMeta, hydrateToolCallGatewayMeta, GATEWAY_ERROR_TYPES,
} from '../lib/services/mcp/gateway-meta';
import { buildExecutionResultJson, orderResultJsonForPersist, RESULT_JSON_OPERATOR_TAIL_KEYS } from '../lib/services/execution-artifacts';
import { extractRawToolDocuments } from '../lib/agents/harness/raw-tool-witness';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('🧭 gateway meta (Stage B P1-4)');

// ── allowlist ──────────────────────────────────────────────────────────────────────────────────────────────────────
const full = {
  tool: 'services', timestamp: '2026-10-14T00:00:00Z', errorType: 'SERVICE_CALL_FAILED', executionTime: 12,
  targetService: 'observability-readonly', targetServiceId: 'cmv5t9tgo009fyxghmn7axqse', requestedTool: 'get_otel_config',
  effectiveTimeout: 30000, timeoutClamped: false, recentSuccessRate: 97, recentSuccessRateBasis: 'free text',
};
check('allowlist keeps exactly targetService, requestedTool, targetServiceId, errorType (drops timestamp/free text/volatile numbers)',
  JSON.stringify(filterGatewayMeta(full)) === JSON.stringify({ targetService: 'observability-readonly', requestedTool: 'get_otel_config', targetServiceId: 'cmv5t9tgo009fyxghmn7axqse', errorType: 'SERVICE_CALL_FAILED' }));
for (const name of ['Browser Automation Service', 'pAIchart Project Service', 'observability-readonly', 'cloudflare-service']) {
  check(`stored-name shape accepts '${name}'`, filterGatewayMeta({ targetService: name })?.targetService === name);
}
for (const bad of ['', ' leading', 'a'.repeat(129), 'x<script>', 'a\nb', 'naïve', 'a_b']) {
  check(`stored-name shape refuses ${JSON.stringify(bad.slice(0, 20))}`, filterGatewayMeta({ targetService: bad }) === null);
}
for (const id of ['cmv5t9tgo009fyxghmn7axqse', 'browser-automation-service', 'paichart-kpi-service']) {
  check(`targetServiceId accepts ${id}`, filterGatewayMeta({ targetServiceId: id })?.targetServiceId === id);
}
for (const bad of ['Has Space', 'UPPER', '-lead', 'a'.repeat(129), 'x/y']) check(`targetServiceId refuses ${JSON.stringify(bad.slice(0, 20))}`, filterGatewayMeta({ targetServiceId: bad }) === null);
check('requestedTool: MCP tool-name grammar, ≤ 128', filterGatewayMeta({ requestedTool: 'get_otel_config' }) !== null
  && filterGatewayMeta({ requestedTool: 'a b' }) === null && filterGatewayMeta({ requestedTool: 'x'.repeat(129) }) === null);
check('errorType: the closed gateway set only', GATEWAY_ERROR_TYPES.every((t) => filterGatewayMeta({ errorType: t })?.errorType === t)
  && filterGatewayMeta({ errorType: 'OTHER' }) === null && GATEWAY_ERROR_TYPES.length === 4);
check('retryAfterSec: finite 0–86400 only', filterGatewayMeta({ retryAfterSec: 30 })?.retryAfterSec === 30
  && [-1, 86401, NaN, Infinity, '30'].every((v) => filterGatewayMeta({ retryAfterSec: v }) === null));
check('non-object / array / null ⇒ null', [null, undefined, 'x', 3, [], [{ errorType: 'RATE_LIMITED' }]].every((v) => filterGatewayMeta(v) === null));

// ── on the result: WeakMap, never in it ──────────────────────────────────────────────────────────────────────────────
const result = { content: [{ type: 'text', text: '❌ failed' }], isError: true, _meta: { executionTime: 1, serverName: 'paichart-embedded-mcp', toolName: 'services' } };
const before = JSON.stringify(result, null, 2);
attachGatewayMeta(result, 'services', full);
check('attach: the result\'s JSON (what the loop sends the model) is byte-identical', JSON.stringify(result, null, 2) === before);
check('attach: no own key added to the result', Object.getOwnPropertyNames(result).join() === 'content,isError,_meta');
check('gatewayMetaOf reads it back', gatewayMetaOf(result)?.errorType === 'SERVICE_CALL_FAILED');
const other = { content: [] };
attachGatewayMeta(other, 'project', full);
check('attach is a no-op for any tool but services', gatewayMetaOf(other) === null);
const empty = { content: [] };
attachGatewayMeta(empty, 'services', { timestamp: 'x', executionTime: 3 });
check('nothing allowlisted ⇒ nothing attached', gatewayMetaOf(empty) === null);

// ── two module copies (AE-CR1): paichart-web loads this module under ts-node AND under webpack ─────────────────────────
{
  const modPath = require.resolve('../lib/services/mcp/gateway-meta');
  const copyA = require(modPath);
  delete require.cache[modPath];
  const copyB = require(modPath);
  const r = { content: [] };
  copyA.attachGatewayMeta(r, 'services', { errorType: 'RATE_LIMITED', targetService: 'observability-readonly' });
  check('two module copies: B is a DIFFERENT module instance yet reads what A attached (process-wide map)',
    copyA !== copyB && copyB.gatewayMetaOf(r)?.errorType === 'RATE_LIMITED');
}

// ── on the record: non-enumerable ────────────────────────────────────────────────────────────────────────────────────
const rec = { turn: 1, tool: 'services', server: 'paichart', arguments: { action: 'call' }, result, success: true, durationMs: 3, timestamp: 't' };
const recJson = JSON.stringify(rec);
setRecordGatewayMeta(rec, gatewayMetaOf(result));
const d = Object.getOwnPropertyDescriptor(rec, 'gatewayMeta');
check('record property exists and is NOT enumerable', !!d && d.enumerable === false);
check('JSON.stringify(record), spread and Object.keys unchanged', JSON.stringify(rec) === recJson && !('gatewayMeta' in { ...rec }) && !Object.keys(rec).includes('gatewayMeta'));
check('recordGatewayMetaOf ignores an ENUMERABLE look-alike (a forged field in stored JSON)', recordGatewayMetaOf({ gatewayMeta: { errorType: 'RATE_LIMITED' } }) === null);

// ── the shared builder: tail key, index-aligned, last, only when present ─────────────────────────────────────────────
const plain = { turn: 1, tool: 'project', server: 'paichart', arguments: {}, result: { content: [] }, success: true, durationMs: 1, timestamp: 't' };
const base = {
  taskId: 't', taskTitle: 'T', agentRole: 'infra_state_harvester', modelUsed: 'm', finalResponse: 'ok', confidenceScore: 80,
  turnCount: 1, maxToolTurns: 5, successfulToolCalls: 2, failedToolCalls: 0, executionTime: 1, tokensUsed: 1, mcpFunctions: null,
  correctionTurnUsed: false, logger: { info: () => undefined }, executionId: 'e',
} as unknown as Parameters<typeof buildExecutionResultJson>[0];
const withMeta = buildExecutionResultJson({ ...base, toolCallResults: [plain, rec] } as never);
const without = buildExecutionResultJson({ ...base, toolCallResults: [plain, { ...rec }] } as never); // a spread drops the meta
const gm = withMeta.toolCallGatewayMeta as Array<Record<string, unknown>>;
check('builder: toolCallGatewayMeta = [{ index: 1, … }] (index = position in toolCallResults = toolCalls)', Array.isArray(gm) && gm.length === 1 && gm[0].index === 1 && gm[0].errorType === 'SERVICE_CALL_FAILED');
check('builder: absent when no record carries meta (every other result.json byte-unchanged)', !('toolCallGatewayMeta' in without));
check('builder: no toolCalls[i] carries gatewayMeta', !JSON.stringify(withMeta.toolCalls).includes('targetServiceId'));
const keys = Object.keys(orderResultJsonForPersist(withMeta));
check('persist order: toolCallGatewayMeta is the LAST key (operator tail, after toolCalls)', keys[keys.length - 1] === 'toolCallGatewayMeta' && keys.indexOf('toolCalls') < keys.indexOf('toolCallGatewayMeta'));
check('RESULT_JSON_OPERATOR_TAIL_KEYS carries it after applyBlockPlaceholder (validationToolCalls appended after it, 2026-10-23; deviceSourceReads + gitDeviceComparison, 2026-10-26)', JSON.stringify(RESULT_JSON_OPERATOR_TAIL_KEYS) === JSON.stringify(['applyBlockPlaceholder', 'toolCallGatewayMeta', 'validationToolCalls', 'deviceSourceReads', 'gitDeviceComparison']));
check('collect: one entry per record with meta, in order', JSON.stringify(collectToolCallGatewayMeta([plain, rec, plain, rec]).map((e) => e.index)) === '[1,3]');

// ── replay hydration ─────────────────────────────────────────────────────────────────────────────────────────────────
const stored = JSON.parse(JSON.stringify({ toolCalls: [plain, rec], toolCallGatewayMeta: gm }));
check('hydrate: re-attaches by index, non-enumerably', hydrateToolCallGatewayMeta(stored.toolCalls, stored.toolCallGatewayMeta) === 1
  && recordGatewayMetaOf(stored.toolCalls[1])?.targetServiceId === 'cmv5t9tgo009fyxghmn7axqse' && recordGatewayMetaOf(stored.toolCalls[0]) === null
  && !Object.keys(stored.toolCalls[1]).includes('gatewayMeta'));
const junk = [{}, {}];
check('hydrate: out-of-range / non-integer / non-allowlisted entries skipped', hydrateToolCallGatewayMeta(junk, [{ index: 5, errorType: 'RATE_LIMITED' }, { index: 0.5 }, { index: 0, foo: 'x' }, 'x']) === 0);
check('hydrate: a missing tail key is a no-op', hydrateToolCallGatewayMeta(junk, undefined) === 0);

// ── other record readers ignore it ───────────────────────────────────────────────────────────────────────────────────
const docsA = JSON.stringify(extractRawToolDocuments([plain, { ...rec }]));
const docsB = JSON.stringify(extractRawToolDocuments([plain, rec]));
check('extractRawToolDocuments output identical with or without the record meta', docsA === docsB);

// ── static wiring ────────────────────────────────────────────────────────────────────────────────────────────────────
const mcp = read('lib/services/mcp/mcpService.ts');
const sm = read('lib/services/mcp/serverManager.ts');
check('serverManager.executeToolOnServer hands back mcpService\'s result OBJECT unchanged (the map is keyed on it; BN-3)',
  /const result = await mcpService\.callTool\(serverName, toolName, arguments_, options\);[\s\S]{0,200}return result;/.test(sm));
check('mcpService: attaches through the accessor, once, beside the rebuilt _meta (never merges it)',
  (mcp.match(/attachGatewayMeta\(result, toolName, response\._meta\)/g) || []).length === 1 && !/\.\.\.response\._meta/.test(mcp));
const loop = read('lib/agents/harness/agentic-tool-loop.ts');
check('loop: setRecordGatewayMeta(record, gatewayMetaOf(toolResult)) on the success record', loop.includes('setRecordGatewayMeta(record, gatewayMetaOf(toolResult));'));
// BS-1: capture and the builder read the SAME records on both persist paths (the tail-key index = the refusal toolCallIndex).
const core = read('lib/services/execution-core.ts');
check('core: prepareHeldCapture and buildExecutionResultJson both take the loop\'s toolCallResults, never reassigned between',
  /prepareHeldCapture\(\{ toolCallResults,/.test(core) && /buildExecutionResultJson\(\{[\s\S]{0,1200}\btoolCallResults,/.test(core)
  && !/\btoolCallResults\s*=[^=]/.test(core.slice(core.indexOf('prepareHeldCapture('), core.indexOf('buildExecutionResultJson('))));
const anch = read('lib/services/execution-completion-anchored.ts');
check('anchored rescue: capture reads input.partial.toolCallResults and the builder partial.toolCallResults (the same array)',
  /prepareHeldCapture\(\{\s*toolCallResults: input\.partial\?\.toolCallResults \?\? \[\]/.test(anch)
  && /const \{ executionId, task, partial,[^}]*\} = input;\s*const toolCallResults = partial\?\.toolCallResults \?\? \[\];/.test(anch));
const card = read('app/api/pov/agent/execute/stream/route.ts');
const cardBlock = card.slice(card.indexOf("type: 'tool_result_card'"), card.indexOf("type: 'tool_result_card'") + 500);
check('SSE tool_result_card copies named fields only (never spreads the record)', cardBlock.length > 0 && !/\.\.\.record\b/.test(cardBlock));
const gw = read('lib/mcp/server/tools/hub/service-call-handler.js');
check('gateway: targetServiceId on SERVICE_CALL_FAILED, INTERNAL_SERVICE_ERROR and RATE_LIMITED; requestedTool on SERVICE_CALL_FAILED',
  /errorType: 'INTERNAL_SERVICE_ERROR',[\s\S]{0,200}targetServiceId: targetServiceForInternalCheck\.id/.test(gw)
  && /errorType: 'RATE_LIMITED', retryAfterSec, targetService: targetService\.name, targetServiceId: targetService\.id/.test(gw)
  && /errorType: 'SERVICE_CALL_FAILED',[\s\S]{0,200}targetServiceId: targetService\.id,[\s\S]{0,120}requestedTool: validatedArgs\.tool/.test(gw));

console.log(`\n📊 ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
