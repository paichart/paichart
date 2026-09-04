#!/usr/bin/env ts-node
/**
 * Reviewer terminal-verdict parser tests.
 *
 * Guards the three-surface coupling introduced 2026-07-14 (verdict-misread fix):
 *   1. GRAMMAR  — change_reviewer entry in ROLE_GUIDANCE_LIBRARY (canonical definition)
 *   2. PROTOCOL — seed-protocol-prompts.ts SYNTHESIZE rules (references only)
 *   3. PARSER   — lib/agents/harness/parse-verdict.ts (derived from the grammar)
 * The coupling tests lift their fixtures from the ACTUAL seeded role guidance (not hand-authored
 * copies), so a later guidance edit that moves/renames the marker fails HERE instead of silently
 * baking a non-matching parser. See cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/.
 *
 * Key behavior fixture: the raise→retract→APPROVED shape (run cmrk5nzw50003yxin4q50cz5h) MUST parse
 * {approved: true, blocking: []}.
 *
 * Created: 2026-07-14
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseReviewerVerdict, REVIEWER_ROLES, VERDICT_MARKER } from '../lib/agents/harness/parse-verdict';
import { parseConfidenceScore } from '../lib/agents/harness/parse-confidence';
import { ROLE_GUIDANCE_LIBRARY } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

console.log('🧪 Reviewer Terminal-Verdict Parser\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toBeNull() {
      if (value !== null) throw new Error(`Expected null, got ${JSON.stringify(value)}`);
    },
    toBeTruthy() {
      if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
    },
  };
}

// ── Coupling: grammar ↔ parser ↔ protocol pin the same literal marker ──────────────────────────

const reviewerGuidance = ROLE_GUIDANCE_LIBRARY['change_reviewer'];

test('Coupling: change_reviewer role guidance exists and defines the terminal block marker', () => {
  expect(typeof reviewerGuidance).toBe('string');
  expect(reviewerGuidance.includes(VERDICT_MARKER)).toBe(true);
  expect(reviewerGuidance.includes('Blocking issues:')).toBe(true);
});

test('Coupling: every REVIEWER_ROLE has a guidance entry containing the marker', () => {
  for (const role of REVIEWER_ROLES) {
    expect(typeof ROLE_GUIDANCE_LIBRARY[role]).toBe('string');
    expect(ROLE_GUIDANCE_LIBRARY[role].includes(VERDICT_MARKER)).toBe(true);
  }
});

test('Coupling: seed-protocol-prompts references the marker but does NOT redefine the grammar', () => {
  const seedSource = fs.readFileSync(path.join(__dirname, 'seed-protocol-prompts.ts'), 'utf-8');
  expect(seedSource.includes(VERDICT_MARKER)).toBe(true);
  // GS8 single-source: the alternation line is the grammar DEFINITION and must live only in the
  // role guidance, never in a protocol.
  expect(seedSource.includes('VERDICT: APPROVED | NEEDS-REVISION')).toBe(false);
});

test('Coupling: a well-formed block built from the guidance grammar parses', () => {
  // Lift the grammar line from the actual guidance to prove parser ↔ grammar agreement.
  expect(reviewerGuidance.includes('## VERDICT: APPROVED | NEEDS-REVISION')).toBe(true);
  const block = '## VERDICT: APPROVED\nBlocking issues: none\nConfidence: 86';
  expect(parseReviewerVerdict(`analysis text\n\n${block}`)).toEqual({
    approved: true, blocking: [], raw: block,
  });
});

// ── The incident fixture: raise → retract → APPROVED ───────────────────────────────────────────

const raiseRetractApprove = `## Review

I found 3 blocking validation-format issues:
1. Set 4: output format undefined for multicast boundary
2. Set 6: storm-control expected output not specified
3. Set 8: BGP multicast route validation is prose

On re-reading the package, I must retract all three: every validation set DOES specify exact
expected output. My three "blocking issues" were not actually blocking. No blocking issues.

## VERDICT: APPROVED
Blocking issues: none
Confidence: 86`;

test('Incident: raise→retract→APPROVED parses {approved: true, blocking: []}', () => {
  const v = parseReviewerVerdict(raiseRetractApprove);
  expect(v?.approved).toBe(true);
  expect(v?.blocking).toEqual([]);
});

test('Incident: confidence in the terminal block still resolves via parseConfidenceScore (last-match-wins)', () => {
  expect(parseConfidenceScore(raiseRetractApprove)).toBe(86);
});

// ── Verdict token transcription ─────────────────────────────────────────────────────────────────

test('NEEDS-REVISION with itemized blocking issues transcribes both', () => {
  const v = parseReviewerVerdict(
    'body\n\n## VERDICT: NEEDS-REVISION\nBlocking issues:\n- Set 3: rollback missing for Ethernet1\n- Set 5: no expected output\nConfidence: 40',
  );
  expect(v?.approved).toBe(false);
  expect(v?.blocking).toEqual(['Set 3: rollback missing for Ethernet1', 'Set 5: no expected output']);
});

test('Inconsistent block (NEEDS-REVISION + none) is transcribed AS-IS, not normalized', () => {
  const v = parseReviewerVerdict('## VERDICT: NEEDS-REVISION\nBlocking issues: none\nConfidence: 70');
  expect(v?.approved).toBe(false);
  expect(v?.blocking).toEqual([]); // the inconsistency stays visible to the consumer
});

test('Case-insensitive token + bold markers tolerated', () => {
  expect(parseReviewerVerdict('## Verdict: **approved**\nBlocking issues: none')?.approved).toBe(true);
  expect(parseReviewerVerdict('## VERDICT: needs_revision\nBlocking issues: x')?.approved).toBe(false);
});

test('Last-match-wins: an early quoted block loses to the terminal one', () => {
  const v = parseReviewerVerdict('## VERDICT: NEEDS-REVISION\nBlocking issues: draft\n\nrevised…\n\n## VERDICT: APPROVED\nBlocking issues: none');
  expect(v?.approved).toBe(true);
  expect(v?.blocking).toEqual([]);
});

// ── Fact-framing honesty: null, never fabrication ───────────────────────────────────────────────

test('No block → null (field absent, never {approved:false})', () => {
  expect(parseReviewerVerdict('The package looks fine. Confidence: 90')).toBeNull();
  expect(parseReviewerVerdict('')).toBeNull();
  expect(parseReviewerVerdict(null)).toBeNull();
  expect(parseReviewerVerdict(undefined)).toBeNull();
});

test('Unrecognized token → null (token set locked)', () => {
  expect(parseReviewerVerdict('## VERDICT: LGTM\nBlocking issues: none')).toBeNull();
  expect(parseReviewerVerdict('## VERDICT: APPROVED WITH COMMENTS')).toBeNull();
});

test('The grammar\'s own alternation echoed verbatim → null (not a verdict)', () => {
  expect(parseReviewerVerdict('## VERDICT: APPROVED | NEEDS-REVISION\nBlocking issues: none | <itemized>')).toBeNull();
});

test('Bare "VERDICT:" prose (no heading marker) → null', () => {
  expect(parseReviewerVerdict('VERDICT: APPROVED\nBlocking issues: none')).toBeNull();
});

test('Missing Blocking issues line → blocking [] with verdict still transcribed', () => {
  const v = parseReviewerVerdict('## VERDICT: APPROVED\nConfidence: 91');
  expect(v?.approved).toBe(true);
  expect(v?.blocking).toEqual([]);
});

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) {
  console.error(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log('✅ All verdict-parser tests passed!');
