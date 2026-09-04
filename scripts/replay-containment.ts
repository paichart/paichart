#!/usr/bin/env ts-node
/**
 * replay-containment.ts — run the REAL derivation-containment enrichment against a REAL completed
 * leg, and print both what it would stamp and how the program gate would see it. Read-only.
 *
 *   npx ts-node scripts/replay-containment.ts <legTaskId> [<legTaskId> ...]
 *
 * WHY THIS EXISTS
 * ---------------
 * The enrichment used to be reachable only by executing a full program run: rig rebuild, ~30-50
 * minutes, human approval gates. At that cost it got "verified" by reading source instead, and three
 * defects shipped that way — each a different link of the stamp -> render -> gate chain, each one a
 * runtime fact that static review passed:
 *
 *   1. the taxonomy keyed on `no-derived-values-block`, a reason the Run-14 consuming leg never
 *      stamped (it stamped `harvest-block-missing-or-unparseable`). The wrong code had propagated
 *      through several design docs; nobody had read it off a live artifact.
 *   2. the new `upstreamContainment` field was never rendered on the lean card that SYNTHESIZE
 *      Step 2 is explicitly told to read — so the gate could not see it.
 *   3. the upstream lookup matched `name = 'result.json'`, but a PIPELINE predecessor writes
 *      `pipeline-index.json`. Zero rows, silently, forever.
 *
 * This script would have caught ALL THREE in seconds: (1) the printed reason would not have matched,
 * (2) the printed Facts line would have lacked the field, (3) upstreamContainment would have been
 * absent. It imports the SHIPPING functions — replaying a reimplementation would recreate exactly
 * the mistake it exists to prevent.
 *
 * KNOWN-GOOD SPECIMENS (two real legs, opposite author behaviour — use both, always):
 *   Run 14 P2  cms4ew1j3001zyxvmdow60r4s   consuming, derived block PRESENT
 *              => expect reason `harvest-block-missing-or-unparseable`
 *   Run 15 P2  cms5kypzr001iyxmc6njgvjod   consuming, derived block ABSENT
 *              => expect reason `no-derived-values-block`
 *   Run 15 P1  cms5ky6ds0015yxmcgemaxgad   deriving, clean
 *              => expect checked:true, 0 violations
 *   VT-11 P1  cmry9mkho007uyxrm6x9xvky3   DERIVING leg that REFUSED (collision detected)
 *              => expect reason `no-derived-values-block` WITH harvestedCount: 6
 *   Run-1 20260817 network leg  cmswo04iu003gyxro195tmlqz   deriving, MALFORMED /29
 *              => expect violations: misaligned-prefix{canonical:10.99.0.0/29} FIRST +
 *                 prefix-not-minimal{30} + covered-not-member .2/.3 (canonical span — .9/.10
 *                 must NOT appear; the two-narrative incident, misaligned-prefix-class-2026-08-19)
 * The reason string VARIES between runs for the same leg type, which is why a single specimen is
 * never enough evidence. The last two are the A7 pair and the most valuable specimens here: SAME
 * reason string, OPPOSITE verdicts, separated only by `harvestedCount` (VT-11 harvested 6 and emitted
 * nothing => refused => blocking; Run 15 P2 harvested no pool => nothing to derive => benign). Before
 * that field was stamped, those two were indistinguishable and the call fell to LLM judgement.
 *
 * CAVEAT ON HISTORICAL LEGS: `upstreamContainment` is computed from `chainedFrom[].derivationContainment`,
 * which the chainer only started carrying on 2026-07-30 (CC3). Legs chained BEFORE that have no such
 * field, so a replay of them reports `upstream: <none carried>` — that is the harness telling the
 * truth about old data, not a regression. Only legs chained after CC3 exercise the populated path.
 */

import { PrismaClient } from '@prisma/client';
import { computeDerivationContainmentFact } from '../lib/agents/harness/derivation-containment-enrichment';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

const prisma = new PrismaClient();

async function replay(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, type: true, status: true, metadata: true, inputContext: true },
  });

  console.log(`\n${'═'.repeat(78)}`);
  if (!task) {
    console.log(`❌ ${taskId} — task not found`);
    return;
  }
  console.log(`${task.title}`);
  console.log(`   ${task.id}  type=${task.type}  status=${task.status}`);

  const stageId = (task.metadata as Record<string, unknown> | null)?.pipelineStageId;
  const chainedFrom = (task.inputContext as { chainedFrom?: unknown } | null)?.chainedFrom;
  const entries = Array.isArray(chainedFrom) ? chainedFrom as Array<Record<string, unknown>> : [];

  console.log(`   pipelineStageId: ${typeof stageId === 'string' ? stageId : '(absent)'}`);
  console.log(`   chainedFrom: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  for (const e of entries) {
    const carried = e.derivationContainment;
    console.log(
      `     • ${String(e.taskId)}  source=${String(e.source)}  ` +
      `carriedContainment=${carried == null ? 'NONE (pre-CC3 chain or non-PIPELINE)' : JSON.stringify(carried)}`
    );
  }

  // THE ACTUAL SHIPPING FUNCTION — not a copy.
  const fact = await computeDerivationContainmentFact(prisma, { stageId, chainedFrom });

  console.log(`\n   ── what the enrichment WOULD STAMP ──`);
  console.log('   ' + JSON.stringify(fact, null, 2).split('\n').join('\n   '));

  // THE ACTUAL RENDERER the program gate reads (SYNTHESIZE Step 2 points at this line).
  const facts = leanFactsLine({ derivationContainment: fact });
  console.log(`\n   ── what the GATE would SEE on the lean card ──`);
  console.log(`   ${facts ?? '(no facts line — gate sees nothing)'}`);

  // The gate's decision inputs, spelled out so a human can check the taxonomy by eye.
  const reason = (fact as { reason?: string }).reason;
  const uc = (fact as { upstreamContainment?: { green?: boolean; legs?: unknown[]; lookupMisses?: number } }).upstreamContainment;
  console.log(`\n   ── taxonomy inputs ──`);
  console.log(`   checked:              ${(fact as { checked?: unknown }).checked}`);
  console.log(`   reason:               ${reason ?? '(n/a — checked)'}`);
  console.log(`   upstreamContainment:  ${uc ? `green=${uc.green} legs=${(uc.legs ?? []).length}${uc.lookupMisses ? ` lookupMisses=${uc.lookupMisses}` : ''}` : 'ABSENT'}`);
  if (reason === 'harvest-block-missing-or-unparseable') {
    console.log(`   ⇒ consuming-leg exception ${uc?.green ? 'APPLIES (non-blocking)' : 'does NOT apply — BLOCKING (fail-closed)'}`);
  } else if (reason === 'no-derived-values-block') {
    // A7 (closed 2026-07-31): this branch is a FACT, not a judgement. harvestedCount PRESENT => the leg
    // harvested a pool and emitted no derivation => refused/dropped => blocking, regardless of upstream.
    const hc = (fact as { harvestedCount?: unknown }).harvestedCount;
    console.log(`   harvestedCount:       ${typeof hc === 'number' ? hc : 'ABSENT'}`);
    console.log(typeof hc === 'number'
      ? `   ⇒ DERIVING leg that emitted no derivation (harvested ${hc}) — REFUSED or DROPPED ⇒ BLOCKING`
      : `   ⇒ harvested no pool ⇒ nothing to derive ⇒ benign (no judgement required)`);
  }
}

/**
 * --chain mode: run the REAL chainer against a real leg and report whether CC3's carried
 * `derivationContainment` populates. This is the only way to prove the NEW path without executing a
 * program: `chainDependencyContext` is READ-ONLY (it is `applyChainedContext` that writes), so it can
 * be replayed against live data safely. Historical `chainedFrom` rows predate CC3 and will always
 * read NONE, so replaying the stored value can never prove the carry — it must be recomputed.
 */
async function replayChain(taskId: string) {
  const { chainDependencyContext } = await import('../lib/agents/harness/context-chainer');
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`CHAIN REPLAY (read-only) — ${taskId}`);
  const chained = await chainDependencyContext(taskId);
  if (!chained) {
    console.log('   no dependencies — nothing to chain (benign)');
    return;
  }
  console.log(`   predecessors chained: ${chained.chainedFrom.length}`);
  for (const c of chained.chainedFrom) {
    const dc = (c as unknown as { derivationContainment?: unknown }).derivationContainment;
    console.log(`     • ${c.taskId}  source=${c.source}`);
    console.log(`       carried derivationContainment: ${dc == null ? '❌ NULL — CC3 NOT carrying' : '✅ ' + JSON.stringify(dc)}`);
  }
  console.log(`   pipelineMetadata: predecessors=${chained.pipelineMetadata.completedDependencies}` +
    ` chainCapable=${chained.pipelineMetadata.chainCapablePredecessors}` +
    ` degraded=${chained.pipelineMetadata.degradedPredecessors}` +
    ` notChained=${JSON.stringify(chained.pipelineMetadata.notChained)}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const chainMode = argv.includes('--chain');
  const ids = argv.filter(a => a !== '--chain');
  if (ids.length === 0) {
    console.error('usage: replay-containment.ts [--chain] <legTaskId> [<legTaskId> ...]');
    console.error('  --chain  also re-run the real (read-only) chainer to prove CC3 carries the fact');
    console.error('see the header for known-good specimens');
    process.exit(2);
  }
  if (chainMode) {
    for (const id of ids) {
      try {
        await replayChain(id);
      } catch (err) {
        console.error(`❌ chain replay ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const id of ids) {
    try {
      await replay(id);
    } catch (err) {
      console.error(`\n❌ ${id} threw: ${err instanceof Error ? err.message : String(err)}`);
      // In production this throw is caught and degrades to reason:'enrichment-error'. Surfacing it
      // here is the point — the live path would have hidden it behind that benign-looking reason.
      console.error('   (in production this degrades to reason:"enrichment-error")');
    }
  }
  console.log(`\n${'═'.repeat(78)}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
