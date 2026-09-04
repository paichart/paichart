#!/usr/bin/env ts-node
/**
 * Per-role Deliverable Contract audit for ROLE_GUIDANCE_LIBRARY.
 *
 * Detects drift that file-level greps miss: a role-guidance entry can have
 * stale "Output to the path..." / "Report results via task.comment" framing
 * even when the universal base template (and other entries in the same file)
 * already carry the contract. The artifact_harvester + editorial_writer
 * regression discovered 2026-04-26 was exactly this shape.
 *
 * For every key in ROLE_GUIDANCE_LIBRARY this script asserts:
 *   1. The guidance contains a `**Deliverable**:` subsection marker
 *   2. The guidance contains a `**Coordination**:` subsection marker
 *   3. The guidance does NOT contain anti-patterns that frame
 *      file-paths or task.comment as the delivery channel
 *
 * Usage:
 *   npx ts-node scripts/audit-role-guidance-contract.ts
 *   npm run validate:role-guidance        (if wired into package.json)
 *
 * Exit code 1 if any role fails.
 */

import { ROLE_GUIDANCE_LIBRARY } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

// Required subsection markers — the exact prose written into each role
// guidance entry by the 2026-04-26 contract refactor.
const REQUIRED_MARKERS = [
  /\*\*Deliverable\*\*:/,
  /\*\*Coordination\*\*:/,
];

// Anti-patterns: phrasings that signal pre-2026-04-26 framing where the
// deliverable channel was a file path or split-across-comments. Conservative
// list — targets the specific wordings observed in the regression, not
// generic mentions of task.comment.
const ANTI_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /Output to the path/i,                      reason: 'file-path-as-delivery (legacy framing)' },
  { pattern: /markdown file at the path/i,               reason: 'file-path-as-delivery (legacy framing)' },
  { pattern: /Output format:\s*markdown file/i,          reason: 'file-output-as-delivery (legacy framing)' },
  { pattern: /Report results via task\.comment/i,        reason: 'comment-as-delivery (legacy framing)' },
  { pattern: /Post a summary first, then follow-up comments/i, reason: 'split-across-comments (legacy framing)' },
  { pattern: /task\.comment\s+accepts\s+a\s+maximum/i,   reason: '2000-char limit framed as delivery cap' },
];

interface RoleResult {
  role: string;
  passes: boolean;
  missingMarkers: string[];
  antiPatternHits: string[];
}

function audit(): RoleResult[] {
  const results: RoleResult[] = [];
  for (const [role, guidance] of Object.entries(ROLE_GUIDANCE_LIBRARY)) {
    const missingMarkers = REQUIRED_MARKERS
      .filter(rx => !rx.test(guidance))
      .map(rx => rx.source);
    const antiPatternHits = ANTI_PATTERNS
      .filter(({ pattern }) => pattern.test(guidance))
      .map(({ reason }) => reason);
    results.push({
      role,
      passes: missingMarkers.length === 0 && antiPatternHits.length === 0,
      missingMarkers,
      antiPatternHits,
    });
  }
  return results;
}

function main(): void {
  const results = audit();
  const failed = results.filter(r => !r.passes);
  const passed = results.filter(r => r.passes);

  console.log('Role-Guidance Deliverable Contract Audit');
  console.log('========================================\n');
  console.log(`Roles audited: ${results.length}`);
  console.log(`✅ Passing:    ${passed.length}`);
  console.log(`❌ Failing:    ${failed.length}\n`);

  for (const r of passed) {
    console.log(`✅ ${r.role}`);
  }
  if (failed.length > 0) {
    console.log('\n--- Failures ---\n');
    for (const r of failed) {
      console.log(`❌ ${r.role}`);
      if (r.missingMarkers.length > 0) {
        console.log(`   Missing markers: ${r.missingMarkers.join(', ')}`);
      }
      if (r.antiPatternHits.length > 0) {
        console.log(`   Anti-patterns:   ${r.antiPatternHits.join('; ')}`);
      }
    }
    console.log('\nFix: add **Deliverable**: and **Coordination**: subsections per Pattern #44 GS6, and remove legacy file-path or comment-as-delivery framing.');
    process.exit(1);
  }

  console.log('\n✓ All role-guidance entries carry the Deliverable Contract.');
}

main();
