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
import { computeEvidenceGrading, VERIFIED_TOKEN, ACCEPTED_TOKEN } from '../lib/agents/harness/evidence-grading';
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

// Assert EVERY token the parser reads, for EVERY reviewer role — not just the marker.
//
// Widened 2026-09-22. This loop checked the marker alone, i.e. 1 of the 4 tokens
// `parse-verdict.ts` keys on, while the fuller check (`Blocking issues:`) was asserted for
// `change_reviewer` only. That was invisible while `change_reviewer` was the sole reviewer; adding
// `requirements_reviewer` to REVIEWER_ROLES made a second copy of the grammar, and the parser
// returns null on a miss — so a role whose guidance carried the marker but dropped a later token
// would have produced a silent null verdict on every review, with the harness seeing no reviewer
// judgement at all rather than an error. Found by the documented-grep audit flagging that the
// grammar now appears twice in the library, which is correct, and unpinned, which was not.
test('Coupling: every REVIEWER_ROLE guidance carries ALL FOUR tokens the parser reads', () => {
  for (const role of REVIEWER_ROLES) {
    const g = ROLE_GUIDANCE_LIBRARY[role];
    expect(typeof g).toBe('string');
    for (const token of [VERDICT_MARKER, 'APPROVED', 'NEEDS-REVISION', 'Blocking issues:', 'Confidence:']) {
      if (!g.includes(token)) {
        throw new Error(`REVIEWER_ROLE '${role}' guidance is missing the parsed token '${token}' — ` +
          `parse-verdict returns null on a miss, so this role's verdicts would vanish silently`);
      }
    }
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

// ── Numbered blocking lists (2026-10-01, Phase 0 item 2c) ───────────────────────────────────────
// Before this fix only `-`/`*` bullets were captured, so these three PROD shapes (trimmed from real
// stamped verdicts) were transcribed `approved:false, blocking: []` — 15 rejected verdicts all-time.

test('Numbered list, consecutive lines (prod requirements_reviewer cmuke82rb…) transcribes every item', () => {
  const v = parseReviewerVerdict(
    '## VERDICT: NEEDS-REVISION\nBlocking issues:\n1. Live placeholder `{{declared bucket}}` outside a fenced code example (check 1).\n2. Unhedged absence claim in Open Questions (Absence-claims rule).\nConfidence: 88',
  );
  expect(v?.approved).toBe(false);
  expect(v?.blocking).toEqual([
    'Live placeholder `{{declared bucket}}` outside a fenced code example (check 1).',
    'Unhedged absence claim in Open Questions (Absence-claims rule).',
  ]);
});

test('Numbered list with blank lines between items under a bold heading (prod change_reviewer cmrplnzvc…)', () => {
  const v = parseReviewerVerdict(
    '## VERDICT: NEEDS-REVISION\n\n**Blocking issues:** \n\n1. **No change package to review** — Phase 2 escalated as BLOCKED.\n\n2. **Phase 0 infrastructure failure** — both devices unreachable.\n\nConfidence: 30',
  );
  expect(v?.approved).toBe(false);
  expect(v?.blocking).toEqual([
    '**No change package to review** — Phase 2 escalated as BLOCKED.',
    '**Phase 0 infrastructure failure** — both devices unreachable.',
  ]);
});

test('Numbered list ends at the first prose line (prod change_reviewer cmrmnmix2…)', () => {
  const v = parseReviewerVerdict(
    '## VERDICT: NEEDS-REVISION\n\n**Blocking issues**: \n1. Terraform-iac validation step 4 — policy baseline incomplete.\n\n**Network-provisioning pipeline is APPROVED** (92/100).\n\nConfidence: 72',
  );
  expect(v?.blocking).toEqual(['Terraform-iac validation step 4 — policy baseline incomplete.']);
});

test('`1)` numbering is captured; a number with no following text is not an item', () => {
  const v = parseReviewerVerdict('## VERDICT: NEEDS-REVISION\nBlocking issues:\n1) first\n2) second\n3.\nConfidence: 50');
  expect(v?.blocking).toEqual(['first', 'second']);
});

test('Prose that starts with a year or version number is NOT read as a list item', () => {
  // "2026" is four digits — the item pattern caps at three, so a dated sentence never becomes a finding.
  const v = parseReviewerVerdict('## VERDICT: NEEDS-REVISION\nBlocking issues:\n- one item\n2026. a dated note\nConfidence: 50');
  expect(v?.blocking).toEqual(['one item']);
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

// ── Evidence grading (2026-09-20) ───────────────────────────────────────────────────────────────
//
// The reviewer's declared epistemic mode per finding. THREE states, not two — see the module header.
// Each pin below is written so a mutation flips it: a two-state fact, a verdict-block-only scan, a
// both-token exclusion, or a sum-the-three-fields reading each fail HERE.

test('EG1 — graded:false is DISTINGUISHABLE from verified:0 (three states, not two)', () => {
  const none = computeEvidenceGrading('The package looks fine to me.\n## VERDICT: APPROVED');
  expect(none.graded).toBe(false);
  expect(none.verifiedLines).toBe(0);
  expect(none.acceptedLines).toBe(0);

  // Graded, but the reviewer verified NOTHING itself — same zero, different meaning.
  const trusted = computeEvidenceGrading('| Blast radius | PASS | ACCEPTED-FROM-CLAIMS |\n## VERDICT: APPROVED');
  expect(trusted.graded).toBe(true);
  expect(trusted.verifiedLines).toBe(0);
  if (none.graded === trusted.graded) throw new Error('the two states collapsed — a two-state fact would bin 26% of the live corpus into one of them');
});

test('EG2 — gradings BEFORE the terminal verdict block are counted (scan is finalResponse, not raw)', () => {
  // The live shape: findings carry the grade, the verdict block carries none. Scanning from the
  // `## VERDICT:` line onward — the obvious mistake — would read zero on a correct reviewer.
  const text = [
    '| Derived-value containment | VERIFIED-AGAINST-EVIDENCE — constructed myself |',
    '| Harvest fidelity | ACCEPTED-FROM-CLAIMS |',
    '',
    '## VERDICT: APPROVED',
    'Blocking issues: none',
  ].join('\n');
  const g = computeEvidenceGrading(text);
  expect(g.verifiedLines).toBe(1);
  expect(g.acceptedLines).toBe(1);
  const afterVerdictOnly = computeEvidenceGrading(text.slice(text.indexOf('## VERDICT:')));
  expect(afterVerdictOnly.graded).toBe(false); // proves the scan scope is load-bearing
});

test('EG3 — a compound grade is counted in BOTH, and reported in bothTokenLines', () => {
  // The dominant live both-token shape (9 of 46 lines are this explicit form; ~34 more are prose).
  // A rule excluding both-token lines would discard it — measured cost > the false positive it fixes.
  const g = computeEvidenceGrading('| Evidence-block integrity | PASS | VERIFIED-AGAINST-EVIDENCE (naming) / ACCEPTED-FROM-CLAIMS (harvest fidelity) |');
  expect(g.graded).toBe(true);
  expect(g.verifiedLines).toBe(1);
  expect(g.acceptedLines).toBe(1);
  expect(g.bothTokenLines).toBe(1);
});

test('EG4 — bothTokenLines is a SUBSET, not a third bucket (the fields do not sum)', () => {
  const g = computeEvidenceGrading([
    'Finding 1 — VERIFIED-AGAINST-EVIDENCE',
    'Finding 2 — VERIFIED-AGAINST-EVIDENCE (shape) / ACCEPTED-FROM-CLAIMS (facts)',
  ].join('\n'));
  expect(g.verifiedLines).toBe(2);
  expect(g.acceptedLines).toBe(1);
  expect(g.bothTokenLines).toBe(1);
  // A consumer adding the three would get 4 for 2 graded lines. Pinned so the shape is not "fixed".
  if (g.verifiedLines + g.acceptedLines + g.bothTokenLines === 2) throw new Error('fields became disjoint — re-read the header before changing the contract');
});

test('EG5 — the scheme restatement IS counted, deliberately and documented', () => {
  // MEASURED 2026-09-20: excluding this shape moves the live corpus 111 -> 109 both-token legs
  // (0.8pp). The honest caveat beat the clever regex; this pin stops a later "cleanup" from
  // reintroducing a filter whose cost was measured to exceed its benefit.
  const g = computeEvidenceGrading('4. State findings as VERIFIED-AGAINST-EVIDENCE or ACCEPTED-FROM-CLAIMS');
  expect(g.graded).toBe(true);
  expect(g.bothTokenLines).toBe(1);
});

test('EG6 — token-locked: no synonyms, no case-folding, no inference', () => {
  expect(computeEvidenceGrading('verified-against-evidence').graded).toBe(false);
  expect(computeEvidenceGrading('VERIFIED AGAINST EVIDENCE').graded).toBe(false);
  expect(computeEvidenceGrading('I verified this against the evidence myself').graded).toBe(false);
});

test('EG7 — null/empty input is graded:false, never a throw', () => {
  expect(computeEvidenceGrading(null).graded).toBe(false);
  expect(computeEvidenceGrading(undefined).verifiedLines).toBe(0);
  expect(computeEvidenceGrading('').parser).toBe('line-token-scan');
});

test('EG8 — the two literals this parser pins are the ones the protocols mandate', () => {
  expect(VERIFIED_TOKEN).toBe('VERIFIED-AGAINST-EVIDENCE');
  expect(ACCEPTED_TOKEN).toBe('ACCEPTED-FROM-CLAIMS');
});

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) {
  console.error(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log('✅ All verdict-parser tests passed!');
