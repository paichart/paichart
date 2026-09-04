#!/usr/bin/env ts-node
/**
 * Fixtures for `computeContractPropagationFact`.
 *
 * The property that matters: **every missing input yields a NAMED reason, never a clean pass.**
 * This whole net exists because a CONDITIONAL obligation silently evaluated false and no guard
 * recorded it — so an enrichment that returns "nothing to report" for a missing input would
 * reproduce the exact defect it measures.
 */
import { canonicalStanzaNeedles } from '../lib/agents/harness/dialect-lint';
import { computeContractPropagationFact } from '../lib/agents/harness/contract-propagation-enrichment';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const CONTRACT = {
  platformDialect: {
    canonicalStanza:
      'router isis <instance>\n   net <NET>\n   is-type level-2\n   !\n   address-family ipv4 unicast\n!\ninterface Loopback0\n   isis passive',
  },
};

function fakePrisma(children: Array<Record<string, unknown>>) {
  // Honours `take` — the cap is only testable if the fake applies the same bound
  // the real query does.
  return {
    task: {
      findMany: async (args?: { take?: number }) =>
        typeof args?.take === 'number' ? children.slice(0, args.take) : children,
    },
  } as never;
}
const kid = (over: Record<string, unknown> = {}) => ({
  id: 'k1', description: 'do the thing', agentRole: 'config_change_author',
  inputContext: null, _count: { executions: 1 }, ...over,
});

async function main() {
  console.log('\ncontract-propagation enrichment fixtures\n' + '━'.repeat(56));

  // ── every miss is a NAMED reason ──
  const a = await computeContractPropagationFact(fakePrisma([kid()]), { stageId: undefined, interfaceContract: CONTRACT });
  check('missing stage → named reason, not a pass', a.checked === false && a.reason === 'no-child-stage', JSON.stringify(a).slice(0, 80));

  const b = await computeContractPropagationFact(fakePrisma([kid()]), { stageId: 's1', interfaceContract: undefined });
  check('missing contract → named reason', b.checked === false && b.reason === 'no-contract-on-leg');

  const c = await computeContractPropagationFact(fakePrisma([kid()]), { stageId: 's1', interfaceContract: { note: 'no stanza here' } });
  check('contract without a canonical stanza → named reason', c.checked === false && c.reason === 'no-canonical-stanza');

  const d = await computeContractPropagationFact(fakePrisma([]), { stageId: 's1', interfaceContract: CONTRACT });
  check('no children → named reason', d.checked === false && d.reason === 'no-children');

  // ── the measured defect shape ──
  const starved = await computeContractPropagationFact(
    fakePrisma([kid({ description: 'Design IS-IS per the contract: NET given, is-type level-2.' })]),
    { stageId: 's1', interfaceContract: CONTRACT });
  const k0 = (starved.children as Array<Record<string, unknown>>)[0];
  check('child WITHOUT the contract is reported as such', k0.hasInterfaceContract === false);
  check('brief-fidelity loss is detected (the 7/7 shape)',
    (k0.canonicalLinesAbsentFromBrief as string[]).length > 0,
    `absent=${(k0.canonicalLinesAbsentFromBrief as string[]).length}`);
  check('address-family — the line that left IS-IS INACTIVE — is named as absent',
    (k0.canonicalLinesAbsentFromBrief as string[]).some((l) => l.includes('address-family ipv4 unicast')));

  // ── post-fix shape ──
  const healed = await computeContractPropagationFact(
    fakePrisma([kid({ inputContext: { interfaceContract: CONTRACT } })]),
    { stageId: 's1', interfaceContract: CONTRACT });
  check('child WITH the contract reads hasInterfaceContract:true (the post-fix signal)',
    (healed.children as Array<Record<string, unknown>>)[0].hasInterfaceContract === true);

  // ── a never-executed child must not read as a regression ──
  const pending = await computeContractPropagationFact(
    fakePrisma([kid({ _count: { executions: 0 } })]), { stageId: 's1', interfaceContract: CONTRACT });
  check('never-executed child is flagged executed:false (inheritance is prepare-time)',
    (pending.children as Array<Record<string, unknown>>)[0].executed === false);

  // ── derivation is SHARED with dialect-lint, not reimplemented ──
  const shared = canonicalStanzaNeedles(CONTRACT);
  check('derivation shared with dialect-lint (same needle count)',
    (starved.canonicalLinesConsidered as number) === shared.needles.length,
    `fact=${starved.canonicalLinesConsidered} shared=${shared.needles.length}`);
  check('trivial `!` separators are not counted as required lines',
    !shared.needles.some((n) => n.needle === '!'));

  // ── the child-scan cap is BOUNDED and its biting is STAMPED, never silent ──
  const many = (n: number) => Array.from({ length: n }, (_, i) => kid({ id: `k${i}` }));
  const atCap = await computeContractPropagationFact(fakePrisma(many(50)), { stageId: 's1', interfaceContract: CONTRACT });
  check('at the cap: all children scanned, no truncation stamp',
    (atCap.children as unknown[]).length === 50 && atCap.childrenTruncatedAtCap === undefined,
    `n=${(atCap.children as unknown[]).length} stamp=${String(atCap.childrenTruncatedAtCap)}`);
  const overCap = await computeContractPropagationFact(fakePrisma(many(51)), { stageId: 's1', interfaceContract: CONTRACT });
  check('over the cap: scan is bounded AND the cap biting is stamped (never a silent partial lint)',
    (overCap.children as unknown[]).length === 50 && overCap.childrenTruncatedAtCap === 50,
    `n=${(overCap.children as unknown[]).length} stamp=${String(overCap.childrenTruncatedAtCap)}`);

  console.log('━'.repeat(56));
  console.log(`Passed: ${passed}   Failed: ${failed}\n`);
  if (failed) { console.error('❌ contract-propagation fixtures FAILED'); process.exit(1); }
  console.log('✅ contract-propagation enrichment fixtures PASSED');
}
main().catch((e) => { console.error(e); process.exit(1); });
