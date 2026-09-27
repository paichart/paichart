#!/usr/bin/env ts-node
/**
 * X11 (2026-09-27): a cut through an emoji's UTF-16 surrogate pair left a LONE surrogate in a persisted pipeline-index.json
 * (`cmugva9aw006gyxa722697ijv`) — invalid jsonb, so every query casting the table `::jsonb` threw. The writer was
 * sanitizeForResponse's 197-unit cap on a task description ("no unstripped 🗑..."), echoed by task.list into an agent's
 * tool result. Fixed at the generators (surrogate-safe cuts) and at the persist boundary (well-formed serialisation).
 *
 * "Invalid jsonb" is checked the way Postgres sees it: JSON.stringify writes a lone surrogate as a `\udXXX` escape with
 * no partner, and Postgres rejects exactly that. No DB.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub?sslmode=disable';
}
import * as fs from 'fs';
import * as path from 'path';
import { sliceSurrogateSafe, stringifyWellFormed } from '@/lib/utils/surrogate-safe';
import { sanitizeForResponse } from '@/lib/mcp/server/tools/response-sanitizer';
import { truncateForActivity } from '@/lib/validation/activity-validation';
import { buildExecutionResultJson, TOOL_RESULT_PREVIEW_BYTES, MAX_STORED_TOOL_RESULT_BYTES } from '@/lib/services/execution-artifacts';
import { buildErrorJson } from '@/lib/services/execution-terminal-persist';

let passed = 0; const failed: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed.push(name); console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
/** What Postgres rejects in jsonb: a \uD800-\uDBFF escape not followed by a \uDC00-\uDFFF one, or a lone low escape. */
const LONE_ESCAPE = /\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})|(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}/i;
const jsonbSafe = (json: string) => !LONE_ESCAPE.test(json);
const BIN = '\u{1F5D1}'; // 🗑 — two code units
/** A string whose emoji straddles code-unit position `cut` (high surrogate at cut-1, low at cut). */
const straddling = (cut: number, total = 400) => 'a'.repeat(cut - 1) + BIN + 'b'.repeat(total - cut - 1);
const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

console.log('\n🧪 X11 — surrogate-safe cuts and well-formed JSON artifacts\n');

test('S0 the premise: a naive slice at the straddle point DOES produce a jsonb-invalid string', () => {
  const s = straddling(197).slice(0, 197);
  assert(!s.isWellFormed() && !jsonbSafe(JSON.stringify(s)), 'fixture does not reproduce the defect');
});
test('S1 sliceSurrogateSafe never ends mid-pair, never exceeds end, and is exact when no pair is split', () => {
  for (let cut = 1; cut < 12; cut++) {
    const s = 'x'.repeat(5) + BIN + BIN + 'y'.repeat(5);
    const r = sliceSurrogateSafe(s, cut);
    assert(r.isWellFormed() && r.length <= cut && s.startsWith(r), `cut ${cut}: ${JSON.stringify(r)}`);
  }
  assert(sliceSurrogateSafe('abcdef', 3) === 'abc' && sliceSurrogateSafe('ab', 5) === 'ab' && sliceSurrogateSafe('ab', 0) === '', 'plain cuts');
});
test('S2 THE INCIDENT: sanitizeForResponse on a description with 🗑 at the 197 cap returns well-formed, jsonb-safe text', () => {
  const r = sanitizeForResponse(straddling(197));
  assert(r.isWellFormed() && jsonbSafe(JSON.stringify({ text: r })), `lone surrogate survives: …${JSON.stringify(r.slice(-8))}`);
  assert(r.endsWith('...') && r.length <= 200, `cap changed: ${r.length}`);
});
test('S3 activity metadata (jsonb): truncateForActivity cut at 200 is well-formed', () => {
  const r = truncateForActivity({ note: straddling(191) }) as string; // the JSON text puts the emoji across unit 200
  assert(r.length <= 203 && r.isWellFormed(), `activity: …${JSON.stringify(r.slice(-8))}`);
});
test('S4 persisted tool-result preview: a pair straddling the preview cut is not split', () => {
  // A result object whose serialisation puts the emoji across TOOL_RESULT_PREVIEW_BYTES, and exceeds the store cap.
  const text = straddling(TOOL_RESULT_PREVIEW_BYTES - '{"text":"'.length, MAX_STORED_TOOL_RESULT_BYTES + 10);
  const rj = buildExecutionResultJson({
    taskId: 't', taskTitle: 't', agentRole: 'r', modelUsed: 'm', finalResponse: 'done', confidenceScore: 80,
    turnCount: 1, maxToolTurns: 30, successfulToolCalls: 1, failedToolCalls: 0, executionTime: 1, tokensUsed: 1,
    correctionTurnUsed: false, logger: silentLogger, executionId: 'e',
    toolCallResults: [{ tool: 'project', server: 'paichart', success: true, result: { text } } as any],
  } as any);
  const preview = ((rj.toolCalls as any[])[0].result as any).preview as string;
  assert(typeof preview === 'string' && preview.isWellFormed(), `preview: …${JSON.stringify(String(preview).slice(-8))}`);
});
test('S5 stringifyWellFormed: lone surrogates in values AND keys, nested — repaired, counted, key ORDER preserved', () => {
  const lone = 'x\uD83D';
  const { json, repaired } = stringifyWellFormed({ a: 1, [lone]: 2, z: { deep: [lone, 'ok', { q: lone }] }, last: true }, 2);
  assert(jsonbSafe(json), `still has a lone escape: ${json}`);
  assert(repaired === 3, `repaired ${repaired}`); // one key + two values
  assert(Object.keys(JSON.parse(json)).join() === `a,x�,z,last`, `order: ${Object.keys(JSON.parse(json))}`);
});
test('S6 stringifyWellFormed is byte-identical to JSON.stringify on well-formed input (no drift for the 99.9%)', () => {
  const v = { a: 'plain', b: [1, 'two', BIN, null], c: { d: new Date(0), e: undefined, f: 'é' }, g: BIN + BIN };
  const r = stringifyWellFormed(v, 2);
  assert(r.json === JSON.stringify(v, null, 2) && r.repaired === 0, 'output differs from JSON.stringify');
});
test('S7 error.json (buildErrorJson) is jsonb-safe when the error message carries a lone surrogate', () => {
  const j = buildErrorJson({ errorMessage: straddling(50).slice(0, 50), source: 'x', taskId: 't', timestamp: new Date(0) });
  assert(jsonbSafe(j) && JSON.parse(j).error.endsWith('�'), j.slice(0, 120));
});
test('S8 the terminal persist serialises the JSON artifact through stringifyWellFormed (source check)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-terminal-persist.ts'), 'utf8');
  assert(/stringifyWellFormed\(persistRedaction\.resultJson, 2\)/.test(src), 'JSON artifact not serialised well-formed');
  assert(!/JSON\.stringify\(persistRedaction\.resultJson/.test(src), 'a raw JSON.stringify of the artifact remains');
  assert(/content: truncate\(wellFormed\.json\)/.test(src), 'the artifact content is not the well-formed JSON');
});

console.log(`\n📊 Results: ${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
