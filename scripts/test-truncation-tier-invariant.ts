#!/usr/bin/env ts-node
/**
 * TEST: 4-tier truncation nesting invariant (Finding D, 2026-07-08)
 *
 * The tiered truncation model (harvest-truncation-safety.md §1) is coherent BY NESTING:
 *   Tier-1 LLM view (8K) < Tier-2 forensic store (50K) < Tier-3 chained context (128K/512K) < Tier-4 artifact (5MB)
 * plus the load-bearing guarantee: Tier-2 PREVIEW >= Tier-1 LLM view — the forensic record must
 * always cover at least what the LLM acted on. That guarantee was coherent by CONVENTION ONLY and
 * inverted once (preview 2000 < LLM view 8000, pre-2026-07-04: chars 2000-8000 of what the LLM
 * reasoned over were unrecoverable for >50KB results). This test makes the ordering enforced.
 *
 * The tiers are INTENTIONALLY independent constants (runtime-limits sweep §5 "document-as-distinct,
 * do NOT unify") — this test asserts their RELATIVE ORDER, never couples their values.
 *
 * UNIT CAVEAT (deliberate, documented): Tier-1 is a CHARACTER cap (.slice); Tiers 2/4 are BYTE
 * caps. For pure-ASCII content they coincide; for multibyte content 8000 chars > 8000 bytes, so
 * the preview>=view guarantee is exact in chars-vs-bytes terms only for ASCII. The constant-level
 * ordering asserted here is the intended design contract (see harvest-truncation-safety.md §2).
 *
 * CI-safe: stub DATABASE_URL before any import that reaches lib/prisma.
 * Run: npm run test:truncation-tiers
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import { MAX_TOOL_RESULT_LENGTH } from '../lib/agents/harness/agentic-tool-loop';
import { MAX_STORED_TOOL_RESULT_BYTES, TOOL_RESULT_PREVIEW_BYTES } from '../lib/services/execution-artifacts';
import { PER_PREDECESSOR_SOFT_CAP, TOTAL_CONTEXT_CEILING } from '../lib/agents/harness/context-chainer';
import { MAX_ARTIFACT_SIZE } from '../lib/services/execution-terminal-persist';

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log('\n🪜 TEST — 4-tier truncation nesting invariant (Finding D)\n');

// The historically-inverted guarantee — the reason this test exists.
ok(TOOL_RESULT_PREVIEW_BYTES >= MAX_TOOL_RESULT_LENGTH,
  `Tier-2 preview (${TOOL_RESULT_PREVIEW_BYTES}) >= Tier-1 LLM view (${MAX_TOOL_RESULT_LENGTH}) — forensic record covers what the LLM acted on`);

// Tier ordering, tightest first.
ok(MAX_TOOL_RESULT_LENGTH <= MAX_STORED_TOOL_RESULT_BYTES,
  `Tier-1 LLM view (${MAX_TOOL_RESULT_LENGTH}) <= Tier-2 store (${MAX_STORED_TOOL_RESULT_BYTES})`);
ok(TOOL_RESULT_PREVIEW_BYTES <= MAX_STORED_TOOL_RESULT_BYTES,
  `Tier-2 preview (${TOOL_RESULT_PREVIEW_BYTES}) <= Tier-2 store (${MAX_STORED_TOOL_RESULT_BYTES})`);
ok(MAX_STORED_TOOL_RESULT_BYTES <= PER_PREDECESSOR_SOFT_CAP,
  `Tier-2 store (${MAX_STORED_TOOL_RESULT_BYTES}) <= Tier-3 per-predecessor (${PER_PREDECESSOR_SOFT_CAP})`);
ok(PER_PREDECESSOR_SOFT_CAP <= TOTAL_CONTEXT_CEILING,
  `Tier-3 per-predecessor (${PER_PREDECESSOR_SOFT_CAP}) <= Tier-3 ceiling (${TOTAL_CONTEXT_CEILING})`);
ok(TOTAL_CONTEXT_CEILING <= MAX_ARTIFACT_SIZE,
  `Tier-3 ceiling (${TOTAL_CONTEXT_CEILING}) <= Tier-4 artifact (${MAX_ARTIFACT_SIZE})`);

console.log(`\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.log('\n  ❌ TIER INVARIANT VIOLATED — a truncation cap edit re-inverted the nesting.');
  console.log('     See .claude/knowledge/domain/harness/harvest-truncation-safety.md §1 before changing any cap.');
  process.exit(1);
}
console.log('  ✅ Tier nesting invariant holds\n');
// Explicit exit: the imported modules reach lib/prisma, whose pool rejects against the fake-cred
// stub AFTER our sync assertions finish — without this, that unrelated rejection flips the exit
// code to 1. All assertions above are synchronous; nothing is in flight to cut short.
process.exit(0);
