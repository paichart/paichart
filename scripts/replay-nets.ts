#!/usr/bin/env ts-node
/**
 * replay-nets.ts — run the SHIPPING registry against a REAL completed task and print what every
 * applicable net would stamp, plus how the lean card would render it. Read-only, seconds.
 *
 *   npx ts-node scripts/replay-nets.ts <taskId> [<taskId> ...]
 *   npx ts-node scripts/replay-nets.ts --net rollbackContainment <taskId>
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
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';
import { runNetsAtPoint, type StampPoint } from '../lib/agents/harness/net-registry';
import { buildNetContext } from '../lib/agents/harness/net-context';
import { isProgramHarnessTask } from '../lib/agents/harness/program-protocol';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

const prisma = new PrismaClient();

async function finalResponseOf(taskId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ fr: string | null }>>`
    SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts
    WHERE name IN ('result.json','pipeline-index.json') AND content LIKE '{%'
      AND (content::jsonb)->>'taskId' = ${taskId}
    ORDER BY "createdAt" DESC LIMIT 1`;
  return rows[0]?.fr ?? null;
}

async function replay(taskId: string, onlyNet: string | null) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, type: true, title: true, agentRole: true, metadata: true, inputContext: true },
  });
  if (!task) { console.log(`\n❌ ${taskId}: no such task`); return; }

  const programTier = task.type === 'PIPELINE' && isProgramHarnessTask(task as never);
  // A leaf is replayed at `leaf-persist`; a PIPELINE leg at `leg-synthesize`. The harness mode is
  // asserted rather than read, because a completed leg's mode is not on the row — replaying the
  // SYNTHESIZE view is the point.
  const point: StampPoint = task.type === 'PIPELINE' ? 'leg-synthesize' : 'leaf-persist';
  const finalResponse = await finalResponseOf(task.id);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${task.id}  [${task.type}] ${task.title}`);
  console.log(`role=${task.agentRole ?? '—'}  point=${point}  programTier=${programTier}  finalResponse=${finalResponse?.length ?? 0} chars`);
  console.log('='.repeat(78));

  const ctx = buildNetContext({
    prisma, task, agentRole: task.agentRole ?? null,
    harnessMode: point === 'leg-synthesize' ? 'SYNTHESIZE' : null,
    finalResponse, programTier,
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
  const ids = argv.filter((a, i) => !a.startsWith('--') && i !== netIdx + 1);
  if (!ids.length) {
    console.error('usage: replay-nets.ts [--net <name>] <taskId> [<taskId> ...]');
    console.error(`nets: ${[...new Set(MECHANICAL_NETS.map((n) => `${n.name}@${n.point}`))].join(', ')}`);
    process.exit(1);
  }
  // ALWAYS MORE THAN ONE SPECIMEN when validating a change: the reason string varies per run for the
  // same leg type, and a single green replay has repeatedly meant less than it looked like.
  for (const id of ids) await replay(id, onlyNet);
  await prisma.$disconnect();
})();
