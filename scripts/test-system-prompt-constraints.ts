/**
 * Axis-5 durable-constraints gate (2026-07-06).
 *
 * Locks `renderConstraintsBlock` — the object-aware `## Constraints` block appended to the shared
 * system-prompt injection tail (durable, system-authority guardrail reinforcement; kept ALSO in USER
 * §8 — double). NO test asserted these lines before Axis 5 (grep empty) — this gate is built from
 * scratch. The absent-constraints BYTE-STABILITY of the 13 injection goldens is proven separately by
 * `test:system-prompt-injections` (its fixtures never set constraints → renderer returns '' → unchanged).
 */
import { renderConstraintsBlock } from '../lib/services/execution-system-prompt';

let passed = 0, failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n🛡️  Axis-5 renderConstraintsBlock — durable system-prompt constraints\n');

// ── Object-shaped (the real fleet: key→description) ──
const objBlock = renderConstraintsBlock({
  'No Direct Work': 'The harness NEVER does the work itself',
  'Confidence Threshold': '>= 70 to proceed',
});
ok('object: has ## Constraints header', objBlock.includes('## Constraints'));
ok('object: renders `• **key:** value` lines', objBlock.includes('• **No Direct Work:** The harness NEVER does the work itself'));
ok('object: separator prefix (tail block)', objBlock.startsWith('\n\n---\n\n## Constraints'));

// ── Array-shaped (latent — §8 handles it too; renderer must not choke) ──
const arrBlock = renderConstraintsBlock(['Stay in Phase', 'No State Mutation']);
ok('array: renders `• value` lines', arrBlock.includes('• Stay in Phase') && arrBlock.includes('• No State Mutation'));
ok('array: no `**` key formatting', !arrBlock.includes('**'));

// ── BC61 sanitize: strip <>, cap 500 ──
const xss = renderConstraintsBlock({ 'X': '<script>alert(1)</script>' });
ok('sanitize: angle-brackets stripped', !xss.includes('<') && !xss.includes('>') && xss.includes('scriptalert(1)/script'));
const longVal = 'a'.repeat(900);
const capped = renderConstraintsBlock({ 'Long': longVal });
ok('sanitize: value capped at 500', capped.includes('a'.repeat(500)) && !capped.includes('a'.repeat(501)));

// ── Empty guards → '' (LOAD-BEARING — keeps the 13 injection goldens byte-stable) ──
ok('empty: undefined → ""', renderConstraintsBlock(undefined) === '');
ok('empty: null → ""', renderConstraintsBlock(null) === '');
ok('empty: {} → "" (suppressed header, unlike §8)', renderConstraintsBlock({}) === '');
ok('empty: [] → ""', renderConstraintsBlock([]) === '');

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
