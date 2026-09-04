#!/usr/bin/env ts-node
/**
 * TEST: embedded-server result envelope (Finding E guard, 2026-07-08)
 *
 * Guards the LEANED enhanceWithStructuredOutput (cline_docs/reviews/services-envelope-bloat-2026-07-08/):
 * 1. The object→content NORMALIZATION is load-bearing — mcpService.callEmbeddedTool reads
 *    `response.content || []`, so a raw object result MUST surface at content[0].data or the
 *    payload silently drops to []. (The one real regression hazard of the de-bloat.)
 * 2. The decoration must STAY dead: no `annotations.schema` echo (≈ a second copy of the data),
 *    no duplicate summary text block, no per-line `structure.sections`, no outer `metadata`.
 * 3. Payload-FIRST ordering: content[0] is the payload, so Tier-1 truncation cuts decoration
 *    (if any ever returns), never data.
 *
 * CI-safe: stub DATABASE_URL before any import that reaches lib/prisma.
 * Run: npm run test:embedded-envelope
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import { EmbeddedMCPServer } from '../lib/mcp/embedded-server';

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log('\n📦 TEST — embedded-server result envelope (Finding E guard)\n');

const server = new EmbeddedMCPServer({ logLevel: 'error' });
const enhance = (result: any) => (server as any).enhanceWithStructuredOutput(result, 'services', { action: 'call' });

// ── 1. Raw object result (the services.call shape) — the load-bearing normalization ──
{
  const raw = { success: true, targetService: 'ceos-lab-readonly', result: { config: { running: 'hostname ceos1' } } };
  const out = enhance(raw);
  ok(Array.isArray(out.content) && out.content.length === 1, 'raw object → exactly ONE content block (no duplicate summary)');
  ok(out.content[0].type === 'data' && out.content[0].data === raw, 'content[0].data IS the raw payload (normalization intact, payload-first)');
  const ann = out.content[0].annotations || {};
  ok(ann.dataType === 'object' && ann.itemCount === 3, 'annotations carry only dataType/itemCount');
  ok(!('schema' in ann), 'NO annotations.schema echo (the Finding-E bloat term)');
  ok(!('metadata' in out), 'NO outer metadata wrapper (was computed-then-discarded dead output)');
  // The de-bloat claim itself: envelope overhead is now O(1), not O(payload)
  const overhead = JSON.stringify(out).length - JSON.stringify(raw).length;
  ok(overhead < 120, `envelope overhead is constant (~${overhead} chars), not proportional to payload`);
}

// ── 2. Content-array result passes through untouched ──
{
  const already = { content: [{ type: 'text', text: 'line one\nline two\nline three' }], isError: false };
  const out = enhance(already);
  ok(out === already, 'content-array result passes through by REFERENCE (no enrichment copy)');
  ok(!('structure' in out.content[0]) && !('annotations' in out.content[0]), 'no structure/sections line-echo added to text blocks');
  ok(out.isError === false, 'isError preserved');
}

// ── 3. String + primitive results ──
{
  const outS = enhance('plain text result');
  ok(outS.content.length === 1 && outS.content[0].type === 'text' && outS.content[0].text === 'plain text result', 'string → single text block, verbatim');
  ok(!('structure' in outS.content[0]), 'string result carries no structure echo');
  const outP = enhance(42);
  ok(outP.content.length === 1 && outP.content[0].text === '42', 'primitive → surfaced as text (formerly an EMPTY content array)');
}

// ── 4. Array result ──
{
  const arr = [{ id: 1 }, { id: 2 }];
  const out = enhance(arr);
  ok(out.content[0].data === arr && out.content[0].annotations.dataType === 'array' && out.content[0].annotations.itemCount === 2, 'array → data block with array dataType + count');
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ Envelope guard holds\n');
process.exit(0);
