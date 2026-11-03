#!/usr/bin/env ts-node
/**
 * test-read-json-body — zod alert #305 / GHSA-mrhx-c7xc-m3w5 (2026-11-03). Pins the web API's JSON body bound:
 *   R1 a normal body parses; R2 malformed and empty bodies throw SyntaxError (as request.json() did);
 *   R3 a declared Content-Length over the byte cap is refused 413 before reading; R4 a STREAMED body with no Content-Length is
 *   refused once it passes the cap; R5 the value cap: 20,000 values pass, 20,001 are refused 413;
 *   R6 the attack shape from the grading (a bulk body of many tiny values under 1 MB) is refused fast, before any zod parse;
 *   R7 GUARD: no `await request.json()` / `await req.json()` remains in app/api or lib (every route goes through readJsonBody);
 *   R8 the MCP hub and the web API share ONE cap function; R9 summarizeZodIssues bounds what is logged and echoed.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import { execSync } from 'child_process';
import { join } from 'path';
import { z } from 'zod';
import { readJsonBody, JSON_BODY_MAX_BYTES, JSON_BODY_MAX_VALUES } from '../lib/utils/read-json-body';
import { exceedsArgumentNodeCap as shared } from '../lib/utils/json-node-cap';
import { summarizeZodIssues } from '../lib/utils/zod-issue-summary';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`✅ ${name}`); } catch (e: any) { failed++; console.log(`❌ ${name}\n   ${e?.message || e}`); }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }
const req = (body: string, headers: Record<string, string> = {}) => new Request('http://x/api', { method: 'POST', body, headers });
function streamed(chunks: string[]): Request {
  const enc = new TextEncoder(); let i = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { if (i < chunks.length) c.enqueue(enc.encode(chunks[i++])); else c.close(); } });
  return new Request('http://x/api', { method: 'POST', body: stream, duplex: 'half' } as any);
}
async function rejects(p: Promise<unknown>, check: (e: any) => boolean, m: string) {
  try { await p; } catch (e) { ok(check(e), `${m}: wrong error ${(e as any)?.code || (e as any)?.name}`); return; }
  throw new Error(`${m}: did not reject`);
}
const is413 = (e: any) => e?.code === 'PAYLOAD_TOO_LARGE' && e?.statusCode === 413;

(async () => {
  await test('R1 a normal body parses', async () => {
    const v = await readJsonBody(req(JSON.stringify({ a: [1, 2, { b: 'c' }] })));
    ok(JSON.stringify(v) === '{"a":[1,2,{"b":"c"}]}', JSON.stringify(v));
  });
  await test('R2 malformed and empty bodies throw SyntaxError, as request.json() did', async () => {
    await rejects(readJsonBody(req('{bad')), (e) => e instanceof SyntaxError, 'malformed');
    await rejects(readJsonBody(req('')), (e) => e instanceof SyntaxError, 'empty');
  });
  await test('R3 a declared Content-Length over the cap is refused 413', async () => {
    await rejects(readJsonBody(req('{}', { 'content-length': String(JSON_BODY_MAX_BYTES + 1) })), is413, 'content-length');
  });
  await test('R4 a streamed body with NO Content-Length is refused once past the byte cap', async () => {
    const chunk = 'x'.repeat(256 * 1024);
    await rejects(readJsonBody(streamed(['"', chunk, chunk, chunk, chunk, chunk, '"'])), is413, 'stream');
  });
  await test(`R5 value cap: ${JSON_BODY_MAX_VALUES} values pass, ${JSON_BODY_MAX_VALUES + 1} are refused 413`, async () => {
    const atCap = Array.from({ length: JSON_BODY_MAX_VALUES - 1 }, () => 0);      // + the array itself = cap
    await readJsonBody(req(JSON.stringify(atCap)));
    await rejects(readJsonBody(req(JSON.stringify([...atCap, 0]))), is413, 'over cap');
  });
  await test('R6 the graded attack shape (bulk body, many tiny values, < 1 MB) is refused fast, before zod', async () => {
    const body = JSON.stringify({ taskIds: Array.from({ length: 200_000 }, () => 1), updates: {} });
    ok(body.length < JSON_BODY_MAX_BYTES, `body ${body.length}`);
    const t = Date.now(); const before = process.memoryUsage().rss;
    await rejects(readJsonBody(req(body)), is413, 'attack');
    const ms = Date.now() - t; const mb = (process.memoryUsage().rss - before) / 1048576;
    console.log(`   (refused in ${ms} ms, RSS +${mb.toFixed(0)} MB)`);
    ok(ms < 2000, `took ${ms} ms`);
  });
  // sec-ops C-1 (2026-11-03): every request-side body reader, ts AND js, with a negative control so the guard can fail.
  const BODY_READER = /\b(request|req|_req|r)\.(json|text|formData|arrayBuffer|blob)\(\)/;
  const COMMENT = /^[^:]+:\d+:\s*(\*|\/\/)/;
  const offenders = (lines: string[]) => lines.filter((l) => l && BODY_READER.test(l) && !COMMENT.test(l) && !l.startsWith('lib/utils/read-json-body.ts'));
  await test('R7 GUARD: no direct request body reader (json/text/formData/arrayBuffer/blob) in app/api or lib, ts or js', () => {
    const out = execSync(`grep -rnE "\\b(request|req|_req|r)\\.(json|text|formData|arrayBuffer|blob)\\(\\)" app/api lib --include=*.ts --include=*.js || true`,
      { cwd: join(__dirname, '..'), encoding: 'utf8' }).split('\n');
    const bad = offenders(out);
    ok(bad.length === 0, `direct body readers remain — use readJsonBody:\n   ${bad.join('\n   ')}`);
  });
  await test('R7b negative control: the guard flags each reader form and ignores comments', () => {
    const planted = ['app/api/x/route.ts:3:  const b = await request.json();', 'app/api/x/route.ts:4:  const t = await req.text();',
      'lib/y.js:9:  const f = await _req.formData();', 'app/api/z/route.ts:2:  const a = await r.arrayBuffer();', 'app/api/z/route.ts:5:  const c = await r.blob();'];
    ok(offenders(planted).length === planted.length, `flagged ${offenders(planted).length} of ${planted.length}`);
    ok(offenders(['app/api/x/route.ts:7: *     const body = await request.json();', 'app/api/x/route.ts:8:  // await req.json()']).length === 0, 'comments must not be flagged');
  });
  await test('R8 the MCP hub and the web API use ONE cap function', () => {
    const core = require('../lib/mcp/server/mcp-core');
    ok(core.exceedsArgumentNodeCap === shared, 'mcp-core must re-export lib/utils/json-node-cap');
  });
  await test('R9 summarizeZodIssues bounds what is logged and echoed', () => {
    const r = z.array(z.string()).safeParse(Array.from({ length: 500 }, () => 1));
    ok(!r.success, 'expected failure');
    const s = summarizeZodIssues((r as any).error);
    ok(s.issues.length === 20 && s.issueCount === 500 && /\(\+480 more\)$/.test(s.message), `${s.issues.length} ${s.issueCount} ${s.message.slice(-20)}`);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
