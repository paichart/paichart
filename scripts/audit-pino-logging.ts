#!/usr/bin/env ts-node
/**
 * Pino Logging Audit & Regression Prevention
 *
 * Layer 1: Scans server-side TS files for active console.* calls (skip comments).
 *          Fails if any found outside the allowlist.
 *
 * Layer 2: Per-domain pino adoption scorecard.
 *          Thresholds: app/api >= 75%, lib (server) >= 40%
 *
 * Layer 3: JS file console.* audit (split enforcement).
 *   - Layer 3a: MCP servers (root) — ENFORCED (zero console.* after Wave 1).
 *   - Layer 3b: lib JS files — report-only (Phase 2 migration tracking).
 *
 * Excluded (client-side): lib/hooks, lib/{domain}/hooks, lib/contexts, lib/store
 * Allowlisted: lib/database/dev-query-logger.ts, lib/database/test-mappers.ts
 *
 * Created: 2026-02-22 (Pino Logging Regression Prevention)
 *
 * Usage:
 *   npm run validate:logging
 *   npx ts-node scripts/audit-pino-logging.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================
// Configuration
// ============================================================

const ROOT = path.join(__dirname, '..');

/** Files allowed to use console.* (dev/test utilities) */
const CONSOLE_ALLOWLIST = new Set([
  'lib/database/dev-query-logger.ts',
  'lib/database/test-mappers.ts',
]);

/** Glob patterns for client-side code (excluded from server audit) */
const CLIENT_SIDE_PATTERNS = [
  'lib/hooks/**',
  'lib/*/hooks/**',
  'lib/contexts/**',
  'lib/store/**',
];

/** Pino adoption thresholds by domain */
const ADOPTION_THRESHOLDS: Record<string, number> = {
  'app/api': 75,
  'lib': 40,
};

// ============================================================
// Layer 3 Configuration (JS — split enforcement)
// ============================================================

/** Layer 3a: MCP servers — ENFORCED (Wave 1 root servers + Wave 2 lib/mcp/server) */
const JS_ROOT_SERVER_PATTERNS = [
  'mcp-server-v5.js',
  'mcp-server-http-clean.js',
  'lib/mcp/server/**/*.js',
];

/** Layer 3b: lib JS files — report-only (Phase 2 tracking) */
const JS_LIB_PATTERNS = [
  'lib/**/*.js',
];

/** Combined for scanning */
const JS_SERVER_PATTERNS = [
  ...JS_ROOT_SERVER_PATTERNS,
  ...JS_LIB_PATTERNS,
];

/** JS files/directories excluded from Layer 3 scanning */
const JS_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  'prisma/generated/**',        // Auto-generated Prisma client
];

/** JS files allowed to use console (same rationale as TS allowlist) */
const JS_CONSOLE_ALLOWLIST = new Set([
  'lib/events/database/dev-query-logger.js',
]);

// ============================================================
// Types
// ============================================================

interface ConsoleViolation {
  file: string;
  line: number;
  code: string;
  method: string;
}

interface AdoptionResult {
  domain: string;
  total: number;
  withPino: number;
  percentage: number;
  threshold: number;
  passed: boolean;
}

// ============================================================
// Helpers
// ============================================================

function isClientSide(filePath: string): boolean {
  return CLIENT_SIDE_PATTERNS.some(pattern => {
    // Convert glob pattern to a path-matching check
    // lib/hooks/** -> matches lib/hooks/anything
    // lib/*/hooks/** -> matches lib/anything/hooks/anything
    const parts = pattern.split('**')[0]; // Get the directory prefix
    const regexStr = parts
      .replace(/\*/g, '[^/]+')
      .replace(/\//g, '\\/');
    return new RegExp(`^${regexStr}`).test(filePath);
  });
}

function isAllowlisted(filePath: string): boolean {
  return CONSOLE_ALLOWLIST.has(filePath);
}

// ============================================================
// Layer 1: Console.* Violation Scanner
// ============================================================

const CONSOLE_PATTERN = /\bconsole\.(log|error|warn|info|debug)\s*\(/;

function scanForConsoleViolations(filePath: string): ConsoleViolation[] {
  const content = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
  const lines = content.split('\n');
  const violations: ConsoleViolation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = CONSOLE_PATTERN.exec(line);
    if (!match) continue;

    // Skip comments
    const stripped = line.trim();
    if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) continue;

    // Skip string literals containing console.* (e.g., in documentation/examples)
    // Simple heuristic: if the console call appears inside a string quote before it, skip
    const beforeMatch = line.substring(0, match.index);
    const singleQuotes = (beforeMatch.match(/'/g) || []).length;
    const doubleQuotes = (beforeMatch.match(/"/g) || []).length;
    const backticks = (beforeMatch.match(/`/g) || []).length;
    if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) continue;

    violations.push({
      file: filePath,
      line: i + 1,
      code: stripped.substring(0, 120),
      method: match[1],
    });
  }

  return violations;
}

// ============================================================
// Layer 2: Pino Adoption Scanner
// ============================================================

const PINO_IMPORT_PATTERN = /(?:from\s+['"](?:@\/lib\/logger|\.\.?\/.*logger)['"]|import\s+.*logger)/;

function fileHasPinoImport(filePath: string): boolean {
  const content = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
  return PINO_IMPORT_PATTERN.test(content);
}

// ============================================================
// Main
// ============================================================

console.log('📋 Pino Logging Audit & Regression Prevention\n');

// Gather server-side TS files
const serverFilePatterns = [
  'app/api/**/*.ts',
  'lib/**/*.ts',
];

const allFiles = glob.sync(serverFilePatterns, {
  ignore: ['**/node_modules/**', '**/.next/**'],
  cwd: ROOT,
});

// Separate into domains and filter client-side
const apiFiles: string[] = [];
const libServerFiles: string[] = [];
const clientFiles: string[] = [];

for (const file of allFiles) {
  if (file.startsWith('app/api/')) {
    apiFiles.push(file);
  } else if (file.startsWith('lib/')) {
    if (isClientSide(file)) {
      clientFiles.push(file);
    } else {
      libServerFiles.push(file);
    }
  }
}

const serverFiles = [...apiFiles, ...libServerFiles];

// ============================================================
// Layer 1: Console Violation Check
// ============================================================

console.log('=====================================');
console.log('Layer 1: Console.* Violation Check');
console.log('=====================================\n');

let allViolations: ConsoleViolation[] = [];

for (const file of serverFiles) {
  if (isAllowlisted(file)) continue;
  const violations = scanForConsoleViolations(file);
  allViolations.push(...violations);
}

if (allViolations.length === 0) {
  console.log('✅ No active console.* calls in server-side TypeScript files');
  console.log(`   Scanned: ${serverFiles.length} files`);
  console.log(`   Excluded (client-side): ${clientFiles.length} files`);
  console.log(`   Allowlisted: ${CONSOLE_ALLOWLIST.size} files`);
} else {
  console.log(`❌ Found ${allViolations.length} active console.* call(s):\n`);

  // Group by directory
  const byDir: Record<string, ConsoleViolation[]> = {};
  for (const v of allViolations) {
    const dir = path.dirname(v.file);
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(v);
  }

  for (const [dir, violations] of Object.entries(byDir).sort()) {
    console.log(`  ${dir}/`);
    for (const v of violations.sort((a, b) => a.line - b.line)) {
      console.log(`    ${path.basename(v.file)}:${v.line}  console.${v.method}(...)`);
      console.log(`      ${v.code.substring(0, 100)}`);
    }
    console.log();
  }
}

console.log();

// ============================================================
// Layer 2: Pino Adoption Scorecard
// ============================================================

console.log('=====================================');
console.log('Layer 2: Pino Adoption Scorecard');
console.log('=====================================\n');

const adoptionResults: AdoptionResult[] = [];

// app/api domain
const apiWithPino = apiFiles.filter(f => fileHasPinoImport(f)).length;
const apiPct = apiFiles.length > 0 ? (apiWithPino / apiFiles.length) * 100 : 0;
adoptionResults.push({
  domain: 'app/api',
  total: apiFiles.length,
  withPino: apiWithPino,
  percentage: apiPct,
  threshold: ADOPTION_THRESHOLDS['app/api'],
  passed: apiPct >= ADOPTION_THRESHOLDS['app/api'],
});

// lib (server-side) domain
const libWithPino = libServerFiles.filter(f => fileHasPinoImport(f)).length;
const libPct = libServerFiles.length > 0 ? (libWithPino / libServerFiles.length) * 100 : 0;
adoptionResults.push({
  domain: 'lib (server)',
  total: libServerFiles.length,
  withPino: libWithPino,
  percentage: libPct,
  threshold: ADOPTION_THRESHOLDS['lib'],
  passed: libPct >= ADOPTION_THRESHOLDS['lib'],
});

for (const result of adoptionResults) {
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${result.domain}`);
  console.log(`   Files with pino: ${result.withPino}/${result.total} (${result.percentage.toFixed(1)}%)`);
  console.log(`   Threshold: ${result.threshold}%`);
  console.log();
}

// ============================================================
// Layer 3a: MCP Servers — ENFORCED (Wave 1 root + Wave 2 lib/mcp/server)
// ============================================================

console.log('=====================================');
console.log('Layer 3a: MCP Servers (enforced)');
console.log('=====================================\n');

const jsRootFiles = glob.sync(JS_ROOT_SERVER_PATTERNS, {
  ignore: JS_EXCLUDE_PATTERNS,
  cwd: ROOT,
});

let jsRootViolations: ConsoleViolation[] = [];
for (const file of jsRootFiles) {
  const violations = scanForConsoleViolations(file);
  jsRootViolations.push(...violations);
}

if (jsRootViolations.length === 0) {
  console.log(`✅ No console.* calls in MCP servers (${jsRootFiles.length} files)`);
} else {
  console.log(`❌ Found ${jsRootViolations.length} console.* call(s) in MCP servers:\n`);
  for (const v of jsRootViolations) {
    console.log(`   ${v.file}:${v.line}  console.${v.method}(...)`);
    console.log(`     ${v.code.substring(0, 100)}`);
  }
}
console.log();

// ============================================================
// Layer 3b: lib/**/*.js — report-only (Phase 2 tracking)
// ============================================================

console.log('=====================================');
console.log('Layer 3b: JS Lib Inventory (report-only)');
console.log('=====================================\n');

const jsLibFiles = glob.sync(JS_LIB_PATTERNS, {
  ignore: JS_EXCLUDE_PATTERNS,
  cwd: ROOT,
});

let jsLibViolations: ConsoleViolation[] = [];
const jsByCategory: Record<string, { files: number; calls: number }> = {
  'lib/mcp/server': { files: 0, calls: 0 },
  'lib/events': { files: 0, calls: 0 },
  'lib/auth': { files: 0, calls: 0 },
  'lib (other)': { files: 0, calls: 0 },
};

for (const file of jsLibFiles) {
  if (JS_CONSOLE_ALLOWLIST.has(file)) continue;
  const violations = scanForConsoleViolations(file);
  if (violations.length === 0) continue;

  jsLibViolations.push(...violations);

  // Categorize
  let category = 'lib (other)';
  if (file.startsWith('lib/mcp/server')) category = 'lib/mcp/server';
  else if (file.startsWith('lib/events')) category = 'lib/events';
  else if (file.startsWith('lib/auth')) category = 'lib/auth';

  jsByCategory[category].files++;
  jsByCategory[category].calls += violations.length;
}

const jsLibCleanFiles = jsLibFiles.length - Object.values(jsByCategory).reduce((sum, c) => sum + c.files, 0);
const jsLibCleanPct = jsLibFiles.length > 0 ? (jsLibCleanFiles / jsLibFiles.length) * 100 : 0;

console.log(`📊 JS lib files scanned: ${jsLibFiles.length}`);
console.log(`📊 Files with console.*: ${jsLibFiles.length - jsLibCleanFiles}`);
console.log(`📊 Total console.* calls: ${jsLibViolations.length}`);
console.log(`📊 Clean files: ${jsLibCleanFiles}/${jsLibFiles.length} (${jsLibCleanPct.toFixed(1)}%)`);
console.log();

for (const [category, stats] of Object.entries(jsByCategory)) {
  if (stats.calls === 0) continue;
  console.log(`   ${category}: ${stats.calls} calls in ${stats.files} files`);
}

console.log();
console.log('ℹ️  Layer 3b is report-only (Phase 2 migration tracking)');
console.log();

// ============================================================
// Result
// ============================================================

console.log('=====================================');
console.log('Validation Result');
console.log('=====================================\n');

const hasViolations = allViolations.length > 0;
const hasThresholdBreaches = adoptionResults.some(r => !r.passed);
const hasRootServerViolations = jsRootViolations.length > 0;

if (hasViolations) {
  console.log(`❌ Layer 1 FAILED: ${allViolations.length} console.* violation(s) found`);
  console.log('   Fix: Replace console.* with pino logger imports from @/lib/logger');
}

if (hasThresholdBreaches) {
  for (const r of adoptionResults.filter(r => !r.passed)) {
    console.log(`❌ Layer 2 FAILED: ${r.domain} adoption ${r.percentage.toFixed(1)}% < ${r.threshold}% threshold`);
  }
}

if (hasRootServerViolations) {
  console.log(`❌ Layer 3a FAILED: ${jsRootViolations.length} console.* call(s) in MCP servers`);
  console.log('   Fix: Replace console.* with pino loggers from lib/mcp/server/mcp-logger.js');
}

if (!hasViolations && !hasThresholdBreaches && !hasRootServerViolations) {
  console.log('✅ Layer 1: No console.* violations (TS)');
  console.log('✅ Layer 2: All adoption thresholds met');
  console.log('✅ Layer 3a: No console.* violations (MCP servers)');
  console.log('✅ Pino logging validation PASSED\n');
  process.exit(0);
} else {
  console.log('\n❌ Pino logging validation FAILED\n');
  process.exit(1);
}
