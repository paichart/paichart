#!/usr/bin/env ts-node
/**
 * TEST-V1: agent.results verbose ceiling (2026-06-09)
 *
 * verbose=true previously bypassed the size cap ENTIRELY → unbounded inline output (prod artifacts ~270K
 * chars ≈ 67K tokens). V1 hard-caps verbose at VERBOSE_MAX_CHARS via the shared capText() helper and emits an
 * honest {returnedChars,totalChars} truncation fact in _meta. This locks in: (A) capText behavior, (B) both
 * agent.results guards (STDIO + HTTP) wire the ceiling + the fact, (C) the connector delegates to the same
 * helper (no drift). CI-safe (capText is pure; handlers checked by source-grep — no prisma import).
 *
 * Run: npm run test:agent-results-verbose-cap
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('\n🧪 TEST-V1 — agent.results verbose ceiling\n');

console.log('── A: capText helper behavior ──\n');
{
  const { capText } = require('../lib/mcp/server/tools/cap-text');
  const under = capText('short body', 1000);
  if (under.text === 'short body' && under.truncation === null) pass('A1 under-cap → text unchanged, truncation null');
  else fail('A1 under-cap wrong', JSON.stringify(under.truncation));

  const big = 'x'.repeat(60000);
  const over = capText(big, 50000);
  const t = over.truncation;
  if (t && t.truncated === true && t.returnedChars === 50000 && t.totalChars === 60000) pass('A2 over-cap → {truncated,returnedChars:50000,totalChars:60000}');
  else fail('A2 over-cap fact wrong', JSON.stringify(t));
  if (/returned 50000 of 60000 characters/.test(over.text) && !/byte/i.test(over.text)) pass('A3 marker says "characters" (not bytes), no tool name');
  else fail('A3 marker wrong');

  // non-string / nullish must not throw
  const n = capText(null as unknown as string, 100);
  if (n.truncation === null) pass('A4 nullish input → truncation null (no throw)');
  else fail('A4 nullish input mishandled');
}

console.log('\n── B: both agent.results guards wire the ceiling + fact ──\n');
for (const f of [
  'lib/mcp/server/tools/advanced/agent-results-handler.js',
  'lib/mcp/server/tools/advanced/task-action-handler.js',
]) {
  const src = read(f);
  const okRequire = /require\(['"]\.\.\/cap-text['"]\)/.test(src);
  const okCeiling = /VERBOSE_MAX_CHARS\s*=\s*100000/.test(src) && /capText\(/.test(src);
  const okFact = /truncation/.test(src) && /_meta/.test(src);
  if (okRequire && okCeiling && okFact) pass(`B ${path.basename(f)} — requires capText, VERBOSE_MAX_CHARS=100000, emits truncation`);
  else fail(`B ${path.basename(f)} — missing ceiling wiring`, `require:${okRequire} ceiling:${okCeiling} fact:${okFact}`);
}

console.log('\n── C: connector delegates to the shared helper (no drift) ──\n');
{
  const src = read('lib/mcp/server/tools/chatgpt-connector-handler.js');
  if (/require\(['"]\.\/cap-text['"]\)/.test(src) && /_capContent\([^)]*\)\s*{[\s\S]{0,200}return capText\(/.test(src)) pass('C connector _capContent delegates to capText');
  else fail('C connector not delegating to capText');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ V1 verbose-ceiling guard passed\n');
