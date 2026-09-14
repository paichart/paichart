#!/usr/bin/env ts-node
/**
 * A SKIP MUST NOT CLAIM A PASS.
 *
 * Guards the 2026-09-12 finding (cline_docs/follow-ups/skip-paths-that-claim-passes-2026-09-12.md):
 * six suites emitted a pass token on a path where nothing had been tested. The flagship printed
 *
 *     ⏭️  SKIPPED: MCP action security tests (DATABASE_URL not available in CI)
 *        ✅ Tests passing locally: 11/11
 *
 * — a hardcoded claim emitted exactly when nothing ran, and FALSE besides: run with DATABASE_URL,
 * that suite failed 8 of 11. CI printed a green line for a suite that had never run there, about a
 * state that did not hold, on the line a human scans for reassurance.
 *
 * This is the unrun-vs-passed distinction the project enforces everywhere else — `ARM NOT EXERCISED`,
 * `lane-not-supported`, "the && chain stops at the first failure so later suites are UNVERIFIED".
 *
 * TWO PREDICATES, both property-shaped. Deliberately NOT "a line containing SKIP and ✅": an honest
 * summary such as `✅ All tests passed (2 SKIPPED — not verified)` contains both tokens and is exactly
 * what we WANT. A check that cannot tell the correct artifact from the defective one is testing a
 * symptom (CHECK-DESIGN-DISCIPLINE rule 1a).
 *
 *   P1  assertTrue(true, '...SKIP...')  — a skip counted as a pass and printed with a green tick.
 *   P2  a ✅ line asserting tests "pass" ELSEWHERE (locally / in CI / in production) — an unverifiable
 *       claim about a state this process did not observe.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..');
const DIR = path.join(REPO, 'scripts');

// P1: a skipped assertion counted as a pass.
const ASSERT_TRUE_SKIP = /assert\w*\(\s*true\s*,?\s*\n?\s*['"`][^'"`]*\bSKIP/i;
// P2: a green tick claiming tests pass somewhere this process cannot see.
const CLAIMS_ELSEWHERE = /✅[^\n]*\b(?:passing|passed)\b[^\n]*\b(?:locally|in CI|in production|on prod)\b/i;

let violations: string[] = [];
let scanned = 0;

for (const f of fs.readdirSync(DIR)) {
  if (!/^test-.*\.(ts|js)$/.test(f)) continue;
  // The guard cannot scan itself: its regexes and its violation messages necessarily
  // CONTAIN the patterns it hunts, so it would always report itself. Same class as the
  // self-referential AppError sweep that matched the base class it mandates. Excluding
  // it is correct, not a loophole — nothing else in this file is a test suite.
  if (f.startsWith('test-skip-path-honesty.')) continue;
  const full = path.join(DIR, f);
  let raw: string;
  try { raw = fs.readFileSync(full, 'utf-8'); } catch { continue; }
  scanned++;

  // STRIP COMMENTS BEFORE MATCHING. Without this the check flags prose ABOUT the defect —
  // this file's own docblock quoting the bad output, and the explanatory comment each fixed
  // suite now carries. First run: 18 violations, ALL of them discussion rather than code.
  // Same failure as counting the word `BindsTo` in a comment that says why BindsTo is refused.
  // Line numbers are preserved: comments are blanked, not removed.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  src.split('\n').forEach((line, i) => {
    if (CLAIMS_ELSEWHERE.test(line)) {
      violations.push(`${f}:${i + 1}  claims tests pass somewhere this run cannot observe\n      ${line.trim().slice(0, 120)}`);
    }
  });

  // P1 needs a small window: the call is sometimes split across lines.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(i, i + 3).join('\n');
    if (ASSERT_TRUE_SKIP.test(window)) {
      violations.push(`${f}:${i + 1}  a SKIPPED test is counted as a PASS (assertTrue(true, '…SKIP…'))\n      ${lines[i].trim().slice(0, 120)}`);
    }
  }
}

console.log(`🧪 skip-path honesty — ${scanned} test files scanned\n`);

if (violations.length === 0) {
  console.log('✅ no skip path claims a pass');
  console.log('   (a skip may state only THAT it skipped and what would make it run)');
  process.exit(0);
}

console.error(`❌ ${violations.length} violation(s):\n`);
violations.forEach((v) => console.error('  • ' + v));
console.error(`
A skip must state no outcome. Print only that it skipped and what would make it run:

    console.log('⏭️  SKIPPED: <suite> — NOTHING WAS VERIFIED');
    console.log('   Reason:  <why>');
    console.log('   To run:  <command>');

If a skipped case must be counted, count it as SKIPPED — never via assertTrue(true, …),
which increments the pass counter and prints a green tick for a test that never ran.
`);
process.exit(1);
