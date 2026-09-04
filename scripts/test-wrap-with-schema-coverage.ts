#!/usr/bin/env ts-node
/**
 * #229 ARCH-METHODOLOGY-4: wrapWithSchema coverage CI test
 *
 * For every entry in tool-schemas.js (CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS),
 * verify there's at least one corresponding wrapWithSchema('toolName', ...)
 * call at the dispatch boundary (mcp-server-v5.js + embedded-server.ts).
 *
 * Catches the phantom-canonical-schema bug class — schema exists but isn't
 * wired into the dispatch boundary. Examples this test would have caught:
 *   - BUG-STANDALONE-005 (prompt_command bare at mcp-server-v5.js:1117)
 *   - Phase 1.5 perform bare at embedded-server.ts:1664 (sibling fix at b89078b5)
 *
 * Per Phase 3 cross-specialist recommendation (validation-engine + sec-ops
 * convergent in Standalone pilot).
 *
 * Run: npm run test:wrap-with-schema-coverage
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const TOOL_SCHEMAS_PATH = path.join(__dirname, '../lib/mcp/server/config/tool-schemas.js');
const HTTP_TRANSPORT_PATH = path.join(__dirname, '../mcp-server-v5.js');
const EMBEDDED_TRANSPORT_PATH = path.join(__dirname, '../lib/mcp/embedded-server.ts');

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

/**
 * Extract tool names declared in tool-schemas.js.
 *
 * Finds entries inside CONSOLIDATED_SCHEMAS = { ... } and TOOL_SCHEMAS = { ... }
 * matching `^  toolname: {`.
 */
function extractSchemaToolNames(source: string): Set<string> {
  const names = new Set<string>();

  // Split into the two outer object blocks
  const consolidatedMatch = source.match(/const CONSOLIDATED_SCHEMAS\s*=\s*\{([\s\S]*?)\n\};/);
  const toolSchemasMatch = source.match(/const TOOL_SCHEMAS\s*=\s*\{([\s\S]*?)\n\};/);

  for (const block of [consolidatedMatch?.[1], toolSchemasMatch?.[1]]) {
    if (!block) continue;
    // Match top-level entries: `^  toolname: {` (2-space indent, no nested objects)
    const re = /^  ([a-z_]+):\s*\{$/gm;
    let m;
    while ((m = re.exec(block)) !== null) {
      names.add(m[1]);
    }
  }

  return names;
}

/**
 * Find every wrapWithSchema('toolName' usage in a source file.
 *
 * Handles two patterns:
 *   1. Literal: `wrapWithSchema('toolname', handler)`
 *   2. Indirect via for-loop: `const arr = ['a', 'b']; for (const t of arr) { ... wrapWithSchema(t, ...) }`
 *      — when the loop variable is wrapped, ALL tool names in the array
 *      literal are considered wrapped.
 *
 * Pattern (2) is how search/fetch/list_prompts get registered at
 * mcp-server-v5.js:1083-1115 (chatgptTools + standaloneHubTools loops).
 */
function findWrappedTools(source: string): Set<string> {
  const wrapped = new Set<string>();

  // Pattern 1: literal name
  const literalRe = /wrapWithSchema\(['"]([a-z_]+)['"]/g;
  let m;
  while ((m = literalRe.exec(source)) !== null) {
    wrapped.add(m[1]);
  }

  // Pattern 2: indirect via for-loop over named array
  // Match: `const ARRNAME = ['a', 'b'];` ... `for (const VARNAME of ARRNAME)` ... `wrapWithSchema(VARNAME,`
  const arrayDefRe = /const\s+(\w+)\s*=\s*\[([^\]]+)\]\s*;/g;
  let arrM;
  while ((arrM = arrayDefRe.exec(source)) !== null) {
    const arrName = arrM[1];
    const arrContent = arrM[2];

    // Extract string literals from the array
    const items = (arrContent.match(/'([a-z_]+)'/g) || []).map(s => s.slice(1, -1));
    if (items.length === 0) continue;

    // Look for a for-loop over this array; capture loop variable name
    const forLoopRe = new RegExp(`for\\s*\\(\\s*const\\s+(\\w+)\\s+of\\s+${arrName}\\s*\\)`);
    const forM = source.match(forLoopRe);
    if (!forM) continue;

    const loopVar = forM[1];
    const loopStart = source.indexOf(forM[0]);
    // Look in the next 2000 chars (loop body window) for wrapWithSchema(loopVar
    const loopWindow = source.substring(loopStart, loopStart + 2000);
    const wrapInLoopRe = new RegExp(`wrapWithSchema\\(\\s*${loopVar}\\s*,`);
    if (wrapInLoopRe.test(loopWindow)) {
      for (const item of items) {
        wrapped.add(item);
      }
    }
  }

  return wrapped;
}

/**
 * Find every toolHandlers.set('toolName', ... usage and check if the value
 * (next arg) starts with wrapWithSchema or is a bare handler.
 */
function findBareRegistrations(source: string, kind: 'toolHandlers' | 'allTools'): string[] {
  const bare: string[] = [];

  if (kind === 'toolHandlers') {
    // mcp-server-v5.js pattern: this.toolHandlers.set('NAME', VALUE)
    // We need to look at the start of VALUE to check if it's wrapWithSchema.
    const re = /this\.toolHandlers\.set\(['"]([a-z_]+)['"],\s*([^)]+(?:\([^)]*\))*)/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      const toolName = m[1];
      const value = m[2];
      if (!value.trim().startsWith('wrapWithSchema(')) {
        bare.push(toolName);
      }
    }
  } else {
    // embedded-server.ts pattern: NAME: wrapWithSchema(...) OR NAME: handler.method
    // Look for entries inside the allTools = { ... } block
    const allToolsMatch = source.match(/const allTools[^=]*=\s*\{([\s\S]*?)\n\s*\};/);
    if (!allToolsMatch) return bare;
    const block = allToolsMatch[1];
    const re = /^\s*([a-z_]+):\s*(.+),\s*$/gm;
    let m;
    while ((m = re.exec(block)) !== null) {
      const toolName = m[1];
      const value = m[2];
      if (!value.trim().startsWith('wrapWithSchema(')) {
        bare.push(toolName);
      }
    }
  }

  return bare;
}

// ──────────────────────────────────────────────────────────────────────
console.log('\n🛡️ ARCH-METHODOLOGY-4 — wrapWithSchema Coverage CI\n');

const schemasSrc = fs.readFileSync(TOOL_SCHEMAS_PATH, 'utf-8');
const httpSrc = fs.readFileSync(HTTP_TRANSPORT_PATH, 'utf-8');
const embeddedSrc = fs.readFileSync(EMBEDDED_TRANSPORT_PATH, 'utf-8');

const schemaTools = extractSchemaToolNames(schemasSrc);
const httpWrapped = findWrappedTools(httpSrc);
const embeddedWrapped = findWrappedTools(embeddedSrc);

console.log(`Schema declares ${schemaTools.size} tools: ${[...schemaTools].sort().join(', ')}`);
console.log(`mcp-server-v5.js wraps ${httpWrapped.size}: ${[...httpWrapped].sort().join(', ')}`);
console.log(`embedded-server.ts wraps ${embeddedWrapped.size}: ${[...embeddedWrapped].sort().join(', ')}\n`);

// ──────────────────────────────────────────────────────────────────────
// Part A: Every schema must be wrapped at SOMEWHERE
// ──────────────────────────────────────────────────────────────────────
console.log('── Part A: schema-to-wrap parity ──\n');

for (const tool of [...schemaTools].sort()) {
  const inHttp = httpWrapped.has(tool);
  const inEmbedded = embeddedWrapped.has(tool);

  if (!inHttp && !inEmbedded) {
    fail(
      `A1: Schema '${tool}' has ZERO wrapWithSchema calls at any registration site`,
      `Phantom-canonical schema — declared in tool-schemas.js but never wired to dispatch boundary. ` +
      `This is the BUG-STANDALONE-005 class. Add wrapWithSchema('${tool}', ...) at mcp-server-v5.js ` +
      `and/or embedded-server.ts.`
    );
  } else {
    const sites = [inHttp ? 'http' : null, inEmbedded ? 'embedded' : null].filter(Boolean).join(' + ');
    pass(`A1: ${tool} wrapped at ${sites}`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Part B: No BARE registrations at the dispatch boundaries
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part B: bare-registration sweep ──\n');

const httpBare = findBareRegistrations(httpSrc, 'toolHandlers');
const embeddedBare = findBareRegistrations(embeddedSrc, 'allTools');

if (httpBare.length === 0) {
  pass('B1: mcp-server-v5.js has no bare toolHandlers.set registrations');
} else {
  fail(
    `B1: mcp-server-v5.js has ${httpBare.length} BARE registration(s)`,
    `Tools registered without wrapWithSchema: ${httpBare.join(', ')}. ` +
    `Schema validation is bypassed for these tools at the HTTP transport.`
  );
}

if (embeddedBare.length === 0) {
  pass('B2: embedded-server.ts has no bare allTools entries');
} else {
  fail(
    `B2: embedded-server.ts has ${embeddedBare.length} BARE registration(s)`,
    `Tools registered without wrapWithSchema: ${embeddedBare.join(', ')}. ` +
    `Schema validation is bypassed for these tools at the embedded transport.`
  );
}

// ──────────────────────────────────────────────────────────────────────
// Part C: regression guards for previously-shipped fixes
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part C: regression guards ──\n');

// BUG-STANDALONE-005: prompt_command was bare at mcp-server-v5.js
if (httpWrapped.has('prompt_command')) {
  pass(`C1: prompt_command wrapped at mcp-server-v5.js (BUG-STANDALONE-005 fix)`);
} else {
  fail(`C1: BUG-STANDALONE-005 REGRESSION — prompt_command no longer wrapped at HTTP transport`);
}

// BUG-STANDALONE-005 sibling: perform was bare at embedded-server.ts
if (embeddedWrapped.has('perform')) {
  pass(`C2: perform wrapped at embedded-server.ts (BUG-STANDALONE-005 sibling fix)`);
} else {
  fail(`C2: BUG-STANDALONE-005 sibling REGRESSION — perform no longer wrapped at embedded-server`);
}

// All 6 consolidated tools wrapped on both transports
const consolidated = ['project', 'perform', 'analytics', 'template', 'services', 'registry'];
for (const tool of consolidated) {
  if (httpWrapped.has(tool) && embeddedWrapped.has(tool)) {
    pass(`C3.${tool}: consolidated tool wrapped on BOTH transports`);
  } else {
    fail(
      `C3.${tool}: consolidated tool NOT on both transports`,
      `http=${httpWrapped.has(tool)} embedded=${embeddedWrapped.has(tool)}`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n❌ FAILURES:\n');
  failures.forEach((f) => console.log(`  - ${f}\n`));
  console.log('\n💡 Fix shape:');
  console.log('  - Schema declared but no wrap: add wrapWithSchema at the right registration site');
  console.log('  - Bare registration: wrap the existing handler with wrapWithSchema(toolName, handler)');
  console.log('  - See BUG-STANDALONE-005 commit (b89078b5) for the canonical fix pattern');
  process.exit(1);
}
console.log('✅ All wrapWithSchema coverage checks passed');
process.exit(0);
