#!/usr/bin/env ts-node
/**
 * TEST-SVC-ARGS-1: services(action:"call").arguments transport-coercion regression
 *
 * Locks in the 2026-06-06 fix for the nested-arguments transport-coercion bug.
 *
 * THE BUG (confirmed via prod forensic artifact):
 *   An LLM-as-caller (agent pipeline) emits the nested `arguments` object as a
 *   JSON *string*, e.g. arguments: '{"state":"TX","period":"latest"}'. The L1
 *   union (tool-schemas.js services.arguments) PREVIOUSLY had a bare `z.string()`
 *   branch that forwarded the string verbatim. Downstream,
 *   service-call-handler.js:validateToolArguments ran `Object.keys(string)` →
 *   ['0','1',...,'34'] → "missing required param" rejection on EVERY agent call.
 *   Real MCP clients (Claude Desktop) send an object, so only the agent path bit.
 *
 * THE FIX:
 *   The string branch now `.transform()`s: JSON.parse → object-guard →
 *   argsShapeRefine (depth/leaf cap) → deepStripDangerousKeys. This (a) ends the
 *   shatter and (b) closes the deep-strip PARITY gap — a stringified payload with
 *   a nested __proto__ at depth >=1 is forwarded cross-trust to external services
 *   unless deep-stripped (the F1/Q4 residual that ensureObject's SHALLOW strip
 *   would have left open).
 *
 * Coverage:
 *   A. Behavioral — reconstruct the EXACT union using the REAL strip/cap utils
 *      (sanitize-keys.deepStripDangerousKeys + args-shape.makeArgsShapeRefine,
 *      both prisma-free) and parse representative payloads. Reconstruction (not
 *      direct import) mirrors test-registry-schema-regression.ts — tool-schemas.js
 *      transitively reaches prisma and cannot be imported under CI.
 *   B. Static guard — read tool-schemas.js as text and assert the shipped
 *      services.call.arguments string branch is hardened (not a bare z.string()).
 *
 * Run: npm run test:service-call-args-coercion
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { z } from 'zod';
import { deepStripDangerousKeys } from '../lib/utils/sanitize-keys';
const { makeArgsShapeRefine } = require('../lib/validation/args-shape');
const fs = require('fs');
const path = require('path');

const ARGS_SHAPE_MAX_DEPTH = 8;
const ARGS_SHAPE_MAX_LEAVES = 100;
const argsShapeRefine = makeArgsShapeRefine({ maxDepth: ARGS_SHAPE_MAX_DEPTH, maxLeaves: ARGS_SHAPE_MAX_LEAVES });

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(msg: string): void {
  passed++;
  console.log(`  ✅ ${msg}`);
}
function fail(msg: string, detail?: string): void {
  failed++;
  failures.push(detail ? `${msg}\n     ${detail}` : msg);
  console.log(`  ❌ ${msg}`);
  if (detail) console.log(`     ${detail}`);
}

// ──────────────────────────────────────────────────────────────────────
// Reconstruct the EXACT services.call.arguments union (tool-schemas.js:804+)
// ──────────────────────────────────────────────────────────────────────
const argumentsSchema = z.union([
  z.record(z.any())
    .superRefine((args, ctx) => argsShapeRefine(args, ctx))
    .transform(deepStripDangerousKeys as any),
  z.string().transform((str, ctx) => {
    let parsed: any;
    try {
      parsed = JSON.parse(str);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON string for arguments' });
      return z.NEVER;
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Arguments JSON string must encode an object' });
      return z.NEVER;
    }
    argsShapeRefine(parsed, ctx);
    return deepStripDangerousKeys(parsed);
  }),
])
  .refine((args: any) => {
    if (args === undefined) return true;
    try { return JSON.stringify(args).length <= 25_000; } catch { return false; }
  }, 'Arguments object too large (>25KB stringified) or too deeply nested')
  .optional();

console.log('\n🛡️ TEST-SVC-ARGS-1 — services.call.arguments coercion regression\n');
console.log('── Part A: behavioral ──\n');

// A1 — THE bug: a JSON-string argument must parse to the real object, NOT shatter.
{
  const r = argumentsSchema.safeParse('{"state":"TX","period":"latest"}');
  if (r.success && r.data && typeof r.data === 'object') {
    const keys = Object.keys(r.data as object);
    if (keys.includes('state') && keys.includes('period') && !keys.includes('0')) {
      pass(`A1 JSON-string arg parses to object {${keys.join(',')}} (no char-shatter)`);
    } else {
      fail('A1 JSON-string arg produced wrong keys', JSON.stringify(keys));
    }
  } else {
    fail('A1 JSON-string arg rejected/garbled', JSON.stringify(r));
  }
}

// A2 — PARITY must-fix: nested __proto__ at depth>=1 in a STRING payload is deep-stripped.
{
  const r = argumentsSchema.safeParse('{"filters":{"__proto__":{"polluted":true},"ok":1}}');
  if (r.success) {
    const filters = (r.data as any)?.filters;
    // Correct assertions: __proto__ must not be an OWN key (it is always present
    // via the prototype chain), the legit sibling survives, and NO prototype
    // pollution occurred (a fresh object must not have inherited `polluted`).
    const ownKeys = filters ? Object.keys(filters) : [];
    const noProtoOwnKey = !ownKeys.includes('__proto__');
    const siblingKept = filters && filters.ok === 1;
    const noPollution = ({} as any).polluted === undefined;
    if (noProtoOwnKey && siblingKept && noPollution) {
      pass('A2 nested __proto__ (depth-1) in string payload DEEP-stripped, no pollution (parity gap closed)');
    } else {
      fail('A2 nested __proto__ not safely stripped',
        `ownKeys=${JSON.stringify(ownKeys)} sibling=${siblingKept} noPollution=${noPollution}`);
    }
  } else {
    fail('A2 valid nested payload was rejected', JSON.stringify(r.error?.issues));
  }
}

// A3 — top-level __proto__ in string payload stripped too.
{
  const r = argumentsSchema.safeParse('{"__proto__":{"x":1},"state":"CA"}');
  if (r.success && !Object.keys(r.data as object).includes('__proto__') && (r.data as any).state === 'CA') {
    pass('A3 top-level __proto__ in string payload stripped');
  } else {
    fail('A3 top-level __proto__ not stripped', JSON.stringify(r.success ? r.data : r.error?.issues));
  }
}

// A4 — malformed JSON string → CLEAN rejection (an honest error, not a shatter).
{
  const r = argumentsSchema.safeParse('not json at all');
  if (!r.success) {
    pass('A4 malformed JSON string rejected with validation error (not shattered)');
  } else {
    fail('A4 malformed JSON string was accepted', JSON.stringify(r.data));
  }
}

// A5 — a JSON string that encodes a NON-object (array / scalar) → rejected.
{
  const rArr = argumentsSchema.safeParse('[1,2,3]');
  const rNum = argumentsSchema.safeParse('42');
  if (!rArr.success && !rNum.success) {
    pass('A5 JSON string encoding a non-object (array/scalar) rejected');
  } else {
    fail('A5 non-object JSON string accepted', `arr=${rArr.success} num=${rNum.success}`);
  }
}

// A6 — object branch unchanged: a normal object still parses AND deep-strips.
{
  const r = argumentsSchema.safeParse({ state: 'NY', nested: { __proto__: { p: 1 }, keep: 2 } });
  if (r.success && (r.data as any).state === 'NY' && !Object.keys((r.data as any).nested).includes('__proto__')) {
    pass('A6 object branch still parses + deep-strips (no regression)');
  } else {
    fail('A6 object branch regressed', JSON.stringify(r.success ? r.data : r.error?.issues));
  }
}

// A7 — depth-cap still fires on a string payload (parity with object branch DoS guard).
{
  let deep = '1';
  for (let i = 0; i < ARGS_SHAPE_MAX_DEPTH + 3; i++) deep = `{"a":${deep}}`;
  const r = argumentsSchema.safeParse(deep);
  if (!r.success) {
    pass('A7 over-depth string payload rejected by shape cap (DoS parity)');
  } else {
    fail('A7 over-depth string payload accepted', JSON.stringify(r.data));
  }
}

console.log('\n── Part B: static guard on shipped schema ──\n');

// B1 — the REAL tool-schemas.js string branch must be hardened, not bare z.string().
{
  const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/config/tool-schemas.js'), 'utf8');
  // Find the services.call.arguments union region (between the `arguments: z.union([`
  // that is followed by the cross-trust comment block, and its closing `.optional()`).
  const idx = src.indexOf('arguments: z.union([');
  const region = idx >= 0 ? src.slice(idx, idx + 2500) : '';
  const hasStringTransform = /z\.string\(\)\.transform\(/.test(region);
  const hasJsonParse = /JSON\.parse\(str\)/.test(region);
  const hasDeepStrip = /return deepStripDangerousKeys\(parsed\)/.test(region);
  // Regression tripwire: a bare `z.string()` immediately closing the union arm.
  const hasBareString = /z\.string\(\)\s*\n\s*\]\)/.test(region);
  if (hasStringTransform && hasJsonParse && hasDeepStrip && !hasBareString) {
    pass('B1 shipped services.call.arguments string branch is hardened (transform → JSON.parse → deepStrip)');
  } else {
    fail('B1 shipped string branch regressed toward bare z.string()',
      `transform=${hasStringTransform} jsonParse=${hasJsonParse} deepStrip=${hasDeepStrip} bareString=${hasBareString}`);
  }
}

// B2 — the single-point handler guard must remain (defense-in-depth).
{
  const h = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/tools/hub/service-call-handler.js'), 'utf8');
  const hasHoistedGuard = /validatedArgs\.arguments = ensureObject\(validatedArgs\.arguments/.test(h);
  if (hasHoistedGuard) {
    pass('B2 handler single-point ensureObject normalization present (defense-in-depth)');
  } else {
    fail('B2 handler single-point normalization missing — Fix A regressed');
  }
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log('✅ services.call.arguments coercion regression suite passed\n');
