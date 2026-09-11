#!/usr/bin/env ts-node
/**
 * replay-rollback-containment.ts — run the REAL rollback-containment enrichment against a REAL
 * completed Author leaf, and print what it would stamp plus how the card would render it.
 * Read-only, seconds.
 *
 *   npx ts-node scripts/replay-rollback-containment.ts <authorTaskId> [<authorTaskId> ...]
 *   npx ts-node scripts/replay-rollback-containment.ts --leg <legTaskId>     # resolve the author for me
 *
 * WHY THIS EXISTS. Three containment defects shipped while the logic was reachable only by a full
 * program run (rig rebuild, ~30-50 min, human gates). At that cost it got "verified" by reading
 * source: a reason string nobody had read off a live artifact, a field never rendered on the card
 * the gate is told to read, and a lookup matching the wrong artifact name. All three were runtime
 * facts that static review passed.
 *
 * It imports the SHIPPING functions. Replaying a reimplementation would recreate exactly the
 * mistake it exists to prevent.
 *
 * KNOWN-GOOD SPECIMENS (use MORE THAN ONE, always — the shape varies by lane):
 *   R19 P4   author cmtfgancv00klyx7uy6cjx0ss  => 51/51, 0 missing, benign
 *   R3a-3    author cmtvdrtq20034yxu85g0dij3v  =>   2/2, 0 missing, benign (excerpt lane)
 *   R3b-2    author cmtvg40jy0078yxlp6poshjaj  => 26/26, 0 missing, benign (whole-file lane)
 *   FW-A3.3  author cmt2rviw70030yx7847zjwq6o  => no-restore-form-lines (inverse rollback)
 *   June k8s author cmqx7hhsd000wyxhiieqeh7zb  => no-restore-form-lines (procedural) — the (a)-lane
 *                                                 NON-SUPPRESSION specimen: it must stay at zero
 */

import { PrismaClient } from '@prisma/client';
import { computeRollbackContainmentFact } from '../lib/agents/harness/rollback-containment-enrichment';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

const prisma = new PrismaClient();

async function resolveAuthor(legTaskId: string): Promise<string | null> {
  const leg = await prisma.task.findUnique({ where: { id: legTaskId }, select: { metadata: true } });
  const stageId = (leg?.metadata as Record<string, unknown> | null)?.pipelineStageId;
  if (typeof stageId !== 'string') return null;
  const children = await prisma.task.findMany({
    where: { stageId }, select: { id: true, title: true, agentRole: true }, orderBy: { createdAt: 'asc' },
  });
  const author = children.find(c =>
    (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author'));
  return author?.id ?? null;
}

async function replay(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, type: true, status: true, agentRole: true, stageId: true },
  });
  console.log(`\n${'═'.repeat(78)}`);
  if (!task) { console.log(`❌ ${taskId} — task not found`); return; }
  console.log(`${task.title}`);
  console.log(`   ${task.id}  role=${task.agentRole}  type=${task.type}  status=${task.status}`);
  console.log(`   stageId: ${task.stageId ?? '(absent)'}`);

  const rows = await prisma.$queryRaw<Array<{ fr: string | null }>>`
    SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts
    WHERE name = 'result.json' AND content LIKE '{%'
      AND (content::jsonb)->>'taskId' = ${task.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  const deliverable = rows[0]?.fr ?? null;
  console.log(`   deliverable: ${deliverable ? `${deliverable.length} chars` : 'ABSENT'}`);

  // THE ACTUAL SHIPPING FUNCTION — not a copy.
  const fact = await computeRollbackContainmentFact(prisma, { taskId: task.id, deliverable });

  console.log(`\n   ── what the enrichment WOULD STAMP ──`);
  // `scope` is a long honest-limits paragraph; it is carried IN the fact on purpose but printing it
  // here buries everything else. Named as elided rather than dropped.
  const { scope, ...compact } = fact as Record<string, unknown>;
  console.log('   ' + JSON.stringify(compact, null, 2).split('\n').join('\n   '));
  console.log(`   scope: <${typeof scope === 'string' ? `${scope.length} chars, elided` : 'ABSENT'}>`);

  console.log(`\n   ── what a consumer would SEE on the lean card ──`);
  console.log(`   ${leanFactsLine({ rollbackContainment: fact }) ?? '(no facts line — consumer sees nothing)'}`);

  const disp = (fact as { rollbackDisposition?: { disposition?: string; reason?: string } }).rollbackDisposition;
  console.log(`\n   ── disposition ──`);
  console.log(`   ${disp?.disposition ?? 'ABSENT'} (${disp?.reason ?? 'n/a'})`);
  if (disp?.disposition === 'needs-node-c') {
    const missing = (fact as { missing?: Array<{ line: string }> }).missing ?? [];
    console.log(`   ⇒ ESCALATES with ${missing.length} named line(s) — never a mechanical block (Path 3).`);
    for (const m of missing.slice(0, 10)) console.log(`      • ${m.line}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const legMode = argv.includes('--leg');
  const ids = argv.filter(a => a !== '--leg');
  if (ids.length === 0) {
    console.error('usage: replay-rollback-containment.ts [--leg] <taskId> [<taskId> ...]');
    console.error('  --leg  the ids are LEG tasks; resolve each one\'s author child first');
    console.error('see the header for known-good specimens (use more than one)');
    process.exit(2);
  }
  for (const id of ids) {
    try {
      const target = legMode ? await resolveAuthor(id) : id;
      if (!target) { console.log(`\n❌ ${id} — no author child resolvable`); continue; }
      await replay(target);
    } catch (err) {
      console.error(`\n❌ ${id} threw: ${err instanceof Error ? err.message : String(err)}`);
      console.error('   (in production this degrades to reason:"enrichment-error", disposition blocking)');
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
