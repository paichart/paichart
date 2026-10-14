#!/usr/bin/env ts-node
/**
 * replay-nets.ts — run the SHIPPING registry against a REAL completed task and print what every
 * applicable net would stamp, plus how the lean card would render it. Read-only, seconds.
 *
 *   npx ts-node scripts/replay-nets.ts <taskId> [<taskId> ...]
 *   npx ts-node scripts/replay-nets.ts --net rollbackContainment <taskId>
 *   npx ts-node scripts/replay-nets.ts --contract-from-plan <legTaskId> [...]
 *
 * --contract-from-plan (C2-a counterfactual, 2026-10-04, plan v2 §4.4 EF-F4/AR-M2b): for a program LEG, replace
 * `inputContext.interfaceContract` with what the SHIPPING plan resolver (`resolvePlanContract`) returns for its
 * program stage BEFORE `buildNetContext` — i.e. what the leg's contract-reading nets would have stamped had C2-a
 * stored the plan. The Author's text is held fixed, so this is an UPPER BOUND, not a forecast. A notice goes to
 * STDERR (so a with/without stdout diff shows only fact changes); a leg with no program parent or an unresolved
 * plan is replayed unchanged. Diff two runs (with / without the flag) per task: the exit rule lists and
 * dispositions every changed fact before push.
 *
 * WHY. Three containment defects shipped while this logic was reachable only by a full program run
 * (rig rebuild, ~30-50 min, human gates). At that price it got "verified" by reading source, and
 * all three were runtime facts that static review passed: a reason string nobody had read off a
 * live artifact, a field never rendered on the card the gate is told to read, and a lookup matching
 * the wrong artifact name.
 *
 * It imports the SHIPPING registry — the same `MECHANICAL_NETS`, `buildNetContext` and
 * `runNetsAtPoint` the engine calls. Replaying a reimplementation would recreate exactly the
 * mistake it exists to prevent.
 *
 * THE THREE PER-NET RUNNERS REMAIN, and are not redundant: each prints net-specific detail this one
 * cannot (`replay-containment --chain` re-runs the real CHAINER, which is not a net concern at all).
 * This one answers the question they cannot — *what does the WHOLE set of nets say about this task,
 * and does any of them apply that I was not thinking about?*
 *
 * TIER IS RESOLVED THE WAY THE ENGINE RESOLVES IT and then decided INSIDE each enrichment, which is
 * the half this runner can exercise. Three nets used to decide it in a call-site ternary, so a
 * program parent's stamp was observable only by running a live program.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
// The R9 sanitiser (raw-tool-witness → sanitize-chained-output) imports '@/…'; the nets now reach it (2026-10-13).
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('tsconfig-paths/register');
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';
import { runNetsAtPoint, type StampPoint } from '../lib/agents/harness/net-registry';
import { buildNetContext } from '../lib/agents/harness/net-context';
import { isProgramHarnessTask } from '../lib/agents/harness/program-protocol';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../lib/services/execution-selection';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

const prisma = new PrismaClient();

/**
 * The task's own deliverable, from its AUTHORITATIVE execution (RWF Wave B, 2026-09-26) — the same selection
 * the chainer and the nets use, so a replay sees what production would. Read by executionId and parsed in JS:
 * the old form cast every result/pipeline-index row in the table to jsonb, so ONE malformed artifact anywhere
 * (a lone UTF-16 surrogate, found on a 2026-09-25 pipeline-index.json) made every replay throw.
 */
async function finalResponseOf(taskId: string): Promise<{ finalResponse: string | null; toolCalls: unknown }> {
  const { execution } = await selectAuthoritativeExecution(prisma, taskId, CHAIN_SELECTION_OPTIONS);
  if (!execution) return { finalResponse: null, toolCalls: [] };
  const art = await prisma.agentArtifact.findFirst({
    where: { executionId: execution.id, name: { in: ['result.json', 'pipeline-index.json'] } },
    orderBy: { createdAt: 'desc' }, select: { content: true },
  });
  try {
    const parsed = art?.content ? JSON.parse(art.content) : null;
    const fr = parsed?.finalResponse;
    // VERBATIM-QUOTE-OMISSION (2026-10-13): the STORED toolCalls are what stampExecutionNets hands ctx at persist
    // (built resultJson, persist-truncated) — post-R10 here, pre-R10 at persist; quoteFidelity treats the R10
    // placeholder as a wildcard on both sides.
    return { finalResponse: typeof fr === 'string' ? fr : null, toolCalls: parsed?.toolCalls ?? [] };
  } catch { return { finalResponse: null, toolCalls: [] }; }
}

/** C2-a counterfactual: the plan resolver, loaded only when the flag is given (it reaches '@/…' aliased modules,
 *  which the default `replay:nets` invocation does not register). */
async function substitutePlanContract(task: { id: string; type: string; inputContext: unknown }, stageId: string | null) {
  if (task.type !== 'PIPELINE' || !stageId) { console.error(`  [plan] ${task.id}: not a leg — unchanged`); return; }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('tsconfig-paths/register');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolvePlanContract } = require('../lib/agents/harness/plan-spawn-carry');
  const { findProgramParentForStage } = await import('../lib/agents/harness/program-protocol');
  if (!(await findProgramParentForStage(prisma, stageId))) { console.error(`  [plan] ${task.id}: no program parent — unchanged`); return; }
  const plan = await resolvePlanContract(prisma, stageId);
  if (plan.status !== 'resolved') { console.error(`  [plan] ${task.id}: plan ${plan.status} — unchanged`); return; }
  // ROUND-TRIP THROUGH jsonb (read-only SELECT): production STORES the plan, and every net reads the stored
  // jsonb, whose object keys come back in jsonb order (length, then bytes) — not the Architect's text order.
  // Substituting the in-memory parse instead moved the ORDER of stanza traversal on 8 of 189 legs with no content
  // change (2026-10-04 build), i.e. it measured the replay, not C2-a.
  const [{ c }] = await prisma.$queryRaw<Array<{ c: unknown }>>`SELECT ${JSON.stringify(plan.contract)}::jsonb AS c`;
  task.inputContext = { ...((task.inputContext as Record<string, unknown> | null) ?? {}), interfaceContract: c };
  console.error(`  [plan] ${task.id}: interfaceContract := plan (architect ${plan.architectTaskId}/${plan.architectExecutionId})`);
}

async function replay(taskId: string, onlyNet: string | null, contractFromPlan = false) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, type: true, title: true, agentRole: true, metadata: true, inputContext: true, stageId: true },
  });
  if (!task) { console.log(`\n❌ ${taskId}: no such task`); return; }
  if (contractFromPlan) await substitutePlanContract(task, task.stageId);

  const programTier = task.type === 'PIPELINE' && isProgramHarnessTask(task as never);
  // A leaf is replayed at `leaf-persist`; a PIPELINE leg at `leg-synthesize`. The harness mode is
  // asserted rather than read, because a completed leg's mode is not on the row — replaying the
  // SYNTHESIZE view is the point.
  const point: StampPoint = task.type === 'PIPELINE' ? 'leg-synthesize' : 'leaf-persist';
  const { finalResponse, toolCalls } = await finalResponseOf(task.id);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${task.id}  [${task.type}] ${task.title}`);
  console.log(`role=${task.agentRole ?? '—'}  point=${point}  programTier=${programTier}  finalResponse=${finalResponse?.length ?? 0} chars`);
  console.log('='.repeat(78));

  const ctx = buildNetContext({
    prisma, task, agentRole: task.agentRole ?? null,
    harnessMode: point === 'leg-synthesize' ? 'SYNTHESIZE' : null,
    finalResponse, programTier, toolCalls,
    onContractApplicabilityError: (e) => console.log(`  ⚠️  contractApplicability lookup failed: ${e}`),
  });

  const nets = onlyNet ? MECHANICAL_NETS.filter((n) => n.name === onlyNet) : MECHANICAL_NETS;
  // Report what DOES NOT apply as well. A net silently skipped is the state this whole domain is
  // built to make impossible, and a runner that prints only the hits reproduces it at the tool layer.
  for (const net of nets) {
    if (net.point !== point) continue;
    if (!net.appliesTo(ctx)) console.log(`  ·  ${net.name}: does not apply at ${point} on this task`);
  }

  const stamped: Record<string, unknown> = {};
  await runNetsAtPoint(point, ctx, nets, (n, f) => { stamped[n] = f; },
    (n, e) => console.log(`  ❌ ${n}: enrich THREW — ${e instanceof Error ? e.message : String(e)}`));

  for (const [name, fact] of Object.entries(stamped)) {
    console.log(`\n  ▶ ${name}`);
    console.log(`    ${JSON.stringify(fact, null, 2).split('\n').join('\n    ')}`);
  }

  const line = leanFactsLine(stamped);
  console.log(`\n  CARD: ${line ?? '(nothing renders — every applicable net is silent on the card)'}`);
}

(async () => {
  const argv = process.argv.slice(2);
  const netIdx = argv.indexOf('--net');
  const onlyNet = netIdx >= 0 ? argv[netIdx + 1] : null;
  // `netIdx < 0 ||` — without it, `i !== netIdx + 1` is `i !== 0` when no --net is given, silently dropping
  // the FIRST task id (a single-id call printed usage and exited 1). Found running the Wave B replay, 2026-09-26.
  const ids = argv.filter((a, i) => !a.startsWith('--') && (netIdx < 0 || i !== netIdx + 1));
  const contractFromPlan = argv.includes('--contract-from-plan');
  if (!ids.length) {
    console.error('usage: replay-nets.ts [--net <name>] [--contract-from-plan] <taskId> [<taskId> ...]');
    console.error(`nets: ${[...new Set(MECHANICAL_NETS.map((n) => `${n.name}@${n.point}`))].join(', ')}`);
    process.exit(1);
  }
  // ALWAYS MORE THAN ONE SPECIMEN when validating a change: the reason string varies per run for the
  // same leg type, and a single green replay has repeatedly meant less than it looked like.
  for (const id of ids) await replay(id, onlyNet, contractFromPlan);
  await prisma.$disconnect();
})();
