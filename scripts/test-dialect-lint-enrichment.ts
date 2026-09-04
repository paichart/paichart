#!/usr/bin/env ts-node
/**
 * Enrichment-path fixtures for `computeDialectLintFact`.
 *
 * The 31 fixtures in `test-dialect-lint.ts` cover the PURE FUNCTION. They cannot cover what this
 * module adds: finding the Author child, reading its artifact, and — the property that matters —
 * NEVER returning a silent clean pass when an input is missing. Every miss must be a NAMED reason.
 *
 * That is the defect class this whole campaign kept re-learning: an absent check reads as a pass.
 */
import { runDialectLint } from '../lib/agents/harness/dialect-lint';
import { computeDialectLintFact } from '../lib/agents/harness/dialect-lint-enrichment';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** Minimal prisma double: only the two calls the enrichment makes. */
function fakePrisma(children: Array<{ id: string; title: string; agentRole: string | null }>, finalResponse: string | null) {
  return {
    task: { findMany: async () => children },
    $queryRaw: async () => (finalResponse === null ? [] : [{ fr: finalResponse }]),
  } as never;
}

const CONTRACT = { platformDialect: { forbiddenTokens: ['metric-style', 'level-2-only'] } };
const AUTHOR = [{ id: 'a1', title: 'Author config change-package', agentRole: 'config_change_author' }];

async function main() {
  console.log('\ndialect-lint ENRICHMENT fixtures\n' + '━'.repeat(52));

  // --- every missing input is a NAMED reason, never a clean pass ---
  const noStage = await computeDialectLintFact(fakePrisma(AUTHOR, 'x'), { stageId: undefined, interfaceContract: CONTRACT });
  check('missing stage → named reason, not a pass',
    noStage.checked === false && noStage.reason === 'no-child-stage', JSON.stringify(noStage).slice(0, 90));

  const noAuthor = await computeDialectLintFact(
    fakePrisma([{ id: 'h1', title: 'Harvest state', agentRole: 'infra_state_harvester' }], 'x'),
    { stageId: 's1', interfaceContract: CONTRACT });
  check('no author child → named reason, not a pass',
    noAuthor.checked === false && noAuthor.reason === 'no-author-child', JSON.stringify(noAuthor).slice(0, 90));

  const noText = await computeDialectLintFact(fakePrisma(AUTHOR, null), { stageId: 's1', interfaceContract: CONTRACT });
  check('author present but no artifact text → named reason, not a pass',
    noText.checked === false && noText.reason === 'no-author-text', JSON.stringify(noText).slice(0, 90));

  // --- the author child is found by ROLE or by TITLE (protocols vary) ---
  const byTitle = await computeDialectLintFact(
    fakePrisma([{ id: 'a2', title: 'Author configs + validation + rollback', agentRole: null }], '```\nrouter isis 1\n```'),
    { stageId: 's1', interfaceContract: CONTRACT });
  check('author found by TITLE when agentRole is null', byTitle.reason !== 'no-author-child', String(byTitle.reason));

  // --- the enrichment must not alter the pure function's verdict ---
  const pkg = '```\n! candidate\nrouter isis 1\n   metric-style wide\n```';
  const direct = runDialectLint(pkg, CONTRACT);
  const viaEnrich = await computeDialectLintFact(fakePrisma(AUTHOR, pkg), { stageId: 's1', interfaceContract: CONTRACT });
  check('enrichment result === pure-function result (no transformation in transit)',
    JSON.stringify(viaEnrich) === JSON.stringify(direct));
  check('a real banned token in candidate config IS caught end-to-end',
    Array.isArray(viaEnrich.violations) && (viaEnrich.violations as unknown[]).length === 1,
    `violations=${JSON.stringify(viaEnrich.violations).slice(0, 80)}`);

  // --- absent contract is a named reason too, never "clean" ---
  const noContract = await computeDialectLintFact(fakePrisma(AUTHOR, pkg), { stageId: 's1', interfaceContract: undefined });
  check('absent contract → named reason, not a clean pass',
    noContract.checked === false && typeof noContract.reason === 'string', JSON.stringify(noContract).slice(0, 90));

  console.log('━'.repeat(52));
  console.log(`Passed: ${passed}   Failed: ${failed}\n`);
  if (failed) { console.error('❌ enrichment fixtures FAILED'); process.exit(1); }
  console.log('✅ dialect-lint enrichment fixtures PASSED');
}
main().catch(e => { console.error(e); process.exit(1); });
