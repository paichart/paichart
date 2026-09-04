#!/usr/bin/env ts-node
/**
 * BUG-BASIC-XSS-1 Phase 2.10 — Tests for response-sanitizer.js
 *
 * 8 unit tests for sanitizeForResponse() + URL allowlist + source-grep
 * regression guards for the 11 sub-phase files.
 *
 * Run: npm run test:response-sanitizer
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { sanitizeForResponse, sanitizeMetadataForAudit, MAX_RESPONSE_FIELD_LEN } = require('../lib/mcp/server/tools/response-sanitizer');
import * as fs from 'fs';
import * as nodePath from 'path';

// Repo-relative root. These source-grep assertions previously hardcoded
// `/home/steve/copov15/...`, which resolves on exactly one machine and fails on
// any CI runner or second checkout. `__dirname` is scripts/, so the root is one
// level up.
const REPO_ROOT = nodePath.resolve(__dirname, '..');
const repoPath = (rel: string) => nodePath.join(REPO_ROOT, rel);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(`${msg}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
    console.log(`  ❌ ${msg}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

console.log('\n🧪 BUG-BASIC-XSS-1 Phase 2.10 — response sanitizer + source-grep tests\n');

// ──────────────────────────────────────────────────────────────────────
// PART A: sanitizeForResponse() unit tests (8 cases)
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part A: sanitizeForResponse unit tests ──\n');

console.log('T1: XSS script tag escape');
assertEqual(
  sanitizeForResponse('<script>alert(1)</script>'),
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  'T1: <script> tags HTML-escaped'
);

console.log('\nT2: Plain text unchanged');
assertEqual(
  sanitizeForResponse('Normal POV name'),
  'Normal POV name',
  'T2: plain text round-trips'
);

console.log('\nT3: Length cap');
{
  const long = 'A'.repeat(500);
  const result = sanitizeForResponse(long);
  assertEqual(result.length, 200, `T3: length capped to ${MAX_RESPONSE_FIELD_LEN} (got ${result.length})`);
  assertTrue(result.endsWith('...'), 'T3: cap ends with ellipsis');
}

console.log('\nT4: Control chars stripped');
assertEqual(
  sanitizeForResponse('test\x00\x01\x7Ffoo'),
  'testfoo',
  'T4: ASCII control chars 0x00-0x1F + 0x7F stripped'
);

console.log('\nT5: Null/undefined defensive');
assertEqual(sanitizeForResponse(null), '', 'T5a: null → empty string');
assertEqual(sanitizeForResponse(undefined), '', 'T5b: undefined → empty string');

console.log('\nT6: Type coercion');
assertEqual(sanitizeForResponse(42), '42', 'T6a: number → String() coercion');
assertEqual(sanitizeForResponse(true), 'true', 'T6b: boolean → String() coercion');

console.log('\nT7: 5-char OWASP escape set (& < > " \')');
assertEqual(
  sanitizeForResponse('A & B < C > D " E \' F'),
  'A &amp; B &lt; C &gt; D &quot; E &#039; F',
  'T7: all 5 OWASP chars escaped in correct order (& FIRST to avoid double-escape)'
);

console.log('\nT8: Idempotency caveat (single-pass safe; double-call double-escapes)');
{
  const once = sanitizeForResponse('<test>');
  const twice = sanitizeForResponse(once);
  assertEqual(once, '&lt;test&gt;', 'T8a: single sanitize → &lt;test&gt;');
  assertEqual(twice, '&amp;lt;test&amp;gt;', 'T8b: double sanitize re-escapes & (documented behavior — call once)');
}

// ──────────────────────────────────────────────────────────────────────
// PART B: Source-grep regression guards (one per affected file)
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part B: Source-grep regression guards (15 files) ──\n');

const filesRequiringSanitizer = [
  // Phase 2.2 — error-helpers (3 files)
  'lib/mcp/server/tools/basic/error-helpers.js',
  'lib/mcp/server/tools/advanced/error-helpers.js',
  'lib/mcp/server/tools/hub/error-helpers.js',
  // Phase 2.3 — ChatGPT connector
  'lib/mcp/server/tools/chatgpt-connector-handler.js',
  // Phase 2.4 — workflow handler
  'lib/mcp/server/tools/hub/workflow-tools-handler.js',
  // Phase 2.5 — internal service router
  'lib/mcp/server/tools/internal/InternalServiceRouter.js',
  // Phase 2.6 — sdk-native + service-call + task-action
  'lib/mcp/server/tools/sdk-native-basic-tools.js',
  'lib/mcp/server/tools/hub/service-call-handler.js',
  'lib/mcp/server/tools/advanced/task-action-handler.js',
  // Phase 2.7 — task-context + agent-results + elicitation
  'lib/mcp/server/tools/advanced/task-context-handler.js',
  'lib/mcp/server/tools/advanced/agent-results-handler.js',
  'lib/mcp/server/tools/advanced/analytics/elicitation-prompts-generator.js',
  // Phase 2.8 — dispatchers (just one representative) + hub-utilities + prompt-command
  'lib/mcp/server/tools/dispatchers/project-dispatcher.js',
  'lib/mcp/server/tools/hub/hub-utilities.js',
  'lib/mcp/server/tools/prompt-command-handler.js',
  // Phase 2.9 — URL allowlist
  'lib/mcp/server/tools/advanced/analytics/analytics-formatters.js',
];

console.log('Regression: every affected file must import sanitizeForResponse');
for (const file of filesRequiringSanitizer) {
  const path = repoPath(file);
  const exists = fs.existsSync(path);
  if (!exists) {
    assertTrue(false, `B-${file}: file does not exist`);
    continue;
  }
  const src = fs.readFileSync(path, 'utf-8');
  const hasImport = src.includes("require('../response-sanitizer')") ||
                    src.includes("require('./response-sanitizer')") ||
                    src.includes("require('../../response-sanitizer')");
  assertTrue(hasImport, `B-${file}: imports response-sanitizer`);
}

// ──────────────────────────────────────────────────────────────────────
// PART C: URL scheme allowlist (Phase 2.9)
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part C: Phase 2.9 URL scheme allowlist (source-grep) ──\n');

{
  const formattersPath = repoPath('lib/mcp/server/tools/advanced/analytics/analytics-formatters.js');
  const src = fs.readFileSync(formattersPath, 'utf-8');
  assertTrue(
    src.includes('sanitizeLinkUri'),
    'C1: analytics-formatters.js defines sanitizeLinkUri function'
  );
  assertTrue(
    src.includes('ALLOWED_LINK_SCHEMES'),
    'C2: analytics-formatters.js defines ALLOWED_LINK_SCHEMES allowlist'
  );
  assertTrue(
    /sanitizeLinkUri\(link\.uri\)/.test(src),
    'C3: link.uri wrapped with sanitizeLinkUri at the markdown link site'
  );
}

// ──────────────────────────────────────────────────────────────────────
// PART D: BC71 phantom-canonical regression guard
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part D: BC71 phantom-canonical guard ──\n');

{
  // Ensure the sanitizer source IS the canonical 5-char OWASP set (matches
  // lib/utils/sanitize.ts:escapeHtml). Per the sec-ops C1 finding: divergent
  // escape sets are a P0 audit risk.
  const sanitizerPath = repoPath('lib/mcp/server/tools/response-sanitizer.js');
  const src = fs.readFileSync(sanitizerPath, 'utf-8');
  for (const char of ['&amp;', '&lt;', '&gt;', '&quot;', '&#039;']) {
    assertTrue(src.includes(char), `D: sanitizer encodes ${char}`);
  }
  // KEEP IN SYNC comment must exist (catches future divergence)
  assertTrue(
    src.includes('KEEP IN SYNC') && src.includes('lib/utils/sanitize.ts:escapeHtml'),
    'D: sanitizer has KEEP IN SYNC comment referencing canonical escapeHtml'
  );
}

// ──────────────────────────────────────────────────────────────────────
// PART E: sanitizeMetadataForAudit (NEW 2026-05-23, BUG-AUDIT-XSS-2 sweep)
// ──────────────────────────────────────────────────────────────────────
console.log('\n── Part E: sanitizeMetadataForAudit (audit/persistence write-time walker) ──\n');

console.log('E1: string fields escaped recursively');
assertEqual(
  sanitizeMetadataForAudit({
    targetService: 'pAIchart KPI Service',
    tool: "<script>alert('xss')</script>",
    bypassedHubAccessCheck: true,
  }),
  {
    targetService: 'pAIchart KPI Service',
    tool: '&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;',
    bypassedHubAccessCheck: true,
  },
  'E1: top-level string with HTML escaped; boolean passes through'
);

console.log('\nE2: primitives pass through unchanged');
assertEqual(
  sanitizeMetadataForAudit({
    serviceId: 'paichart-kpi-service',
    count: 42,
    enabled: false,
    skipped: null,
  }),
  {
    serviceId: 'paichart-kpi-service',
    count: 42,
    enabled: false,
    skipped: null,
  },
  'E2: number/boolean/null/safe-string all unchanged'
);

console.log('\nE3: nested objects walked recursively');
assertEqual(
  sanitizeMetadataForAudit({
    outer: {
      inner: {
        deep: '<img src=x onerror=alert(1)>',
      },
    },
  }),
  {
    outer: {
      inner: {
        deep: '&lt;img src=x onerror=alert(1)&gt;',
      },
    },
  },
  'E3: 3-level nested string sanitized'
);

console.log('\nE4: arrays mapped recursively');
assertEqual(
  sanitizeMetadataForAudit({
    services: ['safe-name', '<script>x</script>', 'paichart-kpi-service'],
    steps: [
      { service: '<svg onload=alert(1)>', tool: 'kpi' },
    ],
  }),
  {
    services: ['safe-name', '&lt;script&gt;x&lt;/script&gt;', 'paichart-kpi-service'],
    steps: [
      { service: '&lt;svg onload=alert(1)&gt;', tool: 'kpi' },
    ],
  },
  'E4: array of strings + array of objects both sanitized'
);

console.log('\nE5: prototype-pollution keys stripped');
{
  const input: any = {
    safe: 'value',
  };
  // Use defineProperty so the test exercises a real polluted-key path
  // (object literal { __proto__: x } would just set the prototype, not the key)
  Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true });
  input.constructor = { prototype: { evil: true } };
  input.prototype = { also_evil: true };
  const result = sanitizeMetadataForAudit(input);
  assertTrue(
    !('__proto__' in result) || result.__proto__ === Object.prototype,
    'E5a: __proto__ key stripped from walker output'
  );
  assertTrue(
    !('constructor' in result) || result.constructor === Object,
    'E5b: constructor key stripped'
  );
  assertTrue(!('prototype' in result), 'E5c: prototype key stripped');
  assertEqual((result as any).safe, 'value', 'E5d: safe siblings preserved');
}

console.log('\nE6: depth ceiling — deeply nested returns untouched past maxDepth');
{
  // Build a 6-level deep object; default maxDepth is 4
  const deep = { l1: { l2: { l3: { l4: { l5: { l6: '<unsanitized>' } } } } } };
  const result = sanitizeMetadataForAudit(deep);
  // l1..l4 walked; l5+ returns the value untouched
  assertEqual(
    result.l1.l2.l3.l4.l5.l6,
    '<unsanitized>',
    'E6: past maxDepth ceiling, value returned untouched (DoS guard)'
  );
}

console.log('\nE7: null/undefined passes through');
assertEqual(sanitizeMetadataForAudit(null), null, 'E7a: top-level null');
assertEqual(sanitizeMetadataForAudit(undefined), undefined, 'E7b: top-level undefined');
assertEqual(
  sanitizeMetadataForAudit({ field: null, other: undefined }),
  { field: null, other: undefined },
  'E7c: null/undefined field values preserved'
);

console.log('\nE8: callers — every Activity.create site uses the wrap');
{
  // Source-grep regression guard. If a site stops wrapping, this fails
  // loud so future BUG-AUDIT-XSS-2 regressions can't ship silently.
  const auditWriteSites = [
    'lib/mcp/server/tools/hub/workflow-tools-handler.js',     // 4 sites (auditOrch, auditSec, execCreate, onStepComplete + final update)
    'lib/mcp/server/tools/hub/hub-audit-service.js',          // 2 sites (permissions + config change)
    'lib/mcp/server/security/compliance-monitor.js',          // 1 site (recordEvent)
    'lib/services/workflow/security/trust-level.js',          // 1 site (TRUST_DENIAL)
    'lib/mcp/server/tools/hub/service-call-handler.js',       // 3 sites (INTERNAL/UNAUTHORIZED/SERVICE_CALL)
  ];
  for (const file of auditWriteSites) {
    const path = repoPath(file);
    const src = fs.readFileSync(path, 'utf-8');
    assertTrue(
      src.includes('sanitizeMetadataForAudit'),
      `E8-${file}: imports + uses sanitizeMetadataForAudit (BUG-AUDIT-XSS-2 regression guard)`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n❌ FAILURES:\n');
  failures.forEach((f) => console.log(`  - ${f}\n`));
  process.exit(1);
}
console.log('✅ All BUG-BASIC-XSS-1 Phase 2.10 tests passed');
process.exit(0);
