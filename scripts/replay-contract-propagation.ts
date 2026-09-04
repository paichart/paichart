#!/usr/bin/env ts-node
/**
 * replay-contract-propagation.ts — run the REAL enrichment against REAL archived legs. Read-only.
 *
 *   npx ts-node scripts/replay-contract-propagation.ts <legTaskId> [...]
 *   npx ts-node scripts/replay-contract-propagation.ts --all [N]   # newest N contract-bearing legs
 *
 * This is the PHASE-1 GATE (plan item 1.6): the instrument must reproduce the hand-measured 7/7
 * before it is trusted as the post-fix regression tripwire. An expect-zero guard nobody ever watched
 * fire is this platform's least-tested kind of artifact.
 */
import { PrismaClient } from '@prisma/client';
import { computeContractPropagationFact } from '../lib/agents/harness/contract-propagation-enrichment';

const prisma = new PrismaClient();

async function replay(legTaskId: string, quiet = false) {
  const leg = await prisma.task.findUnique({
    where: { id: legTaskId },
    select: { id: true, title: true, metadata: true, inputContext: true },
  });
  if (!leg) { console.log(`❌ ${legTaskId} — no such task`); return null; }

  const fact = await computeContractPropagationFact(prisma, {
    stageId: (leg.metadata as Record<string, unknown> | null)?.pipelineStageId,
    interfaceContract: (leg.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract,
  });

  const checked = fact.checked as boolean;
  const kids = (fact.children ?? []) as Array<Record<string, unknown>>;
  const considered = fact.canonicalLinesConsidered as number;
  const worst = kids.reduce((m, k) => Math.max(m, (k.canonicalLinesAbsentFromBrief as string[])?.length ?? 0), 0);
  const withContract = kids.filter((k) => k.hasInterfaceContract).length;

  if (!quiet) {
    console.log(`\n${'─'.repeat(74)}`);
    console.log(`LEG  ${leg.title.slice(0, 66)}`);
    console.log(`  checked=${checked}${fact.reason ? ` reason=${fact.reason}` : ''}  canonical lines=${considered}`);
    for (const k of kids) {
      const absent = (k.canonicalLinesAbsentFromBrief as string[]) ?? [];
      const flag = k.hasInterfaceContract ? '✅' : '🛑';
      console.log(`    ${flag} ${String(k.role ?? '(no role)').padEnd(24)} contract=${k.hasInterfaceContract} ` +
                  `executed=${k.executed}  brief missing ${absent.length}/${considered}`);
    }
  }
  return { title: leg.title, checked, considered, worst, withContract, kids: kids.length };
}

async function main() {
  // ts-node swallows leading --flags; accept an env var too.
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (process.env.REPLAY_ALL) args.unshift('--all', process.env.REPLAY_ALL);
  let ids: string[];
  if (args[0] === '--all') {
    const n = parseInt(args[1] ?? '20', 10);
    const legs = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tasks WHERE type = 'PIPELINE'
        AND "inputContext" ? 'interfaceContract'
        AND metadata->>'pipelineStageId' IS NOT NULL
      ORDER BY created_at DESC LIMIT ${n}`;
    ids = legs.map((l) => l.id);
  } else {
    ids = args.filter((a) => !a.startsWith('-'));
  }
  if (!ids.length) {
    // Distinguish "you gave me nothing" from "this DB holds no contract-bearing legs" — the local
    // dev DB has ZERO, so a bare usage message here reads as a CLI error when it is a data fact.
    if (args[0] === '--all') {
      console.error('no contract-bearing legs with a child stage in THIS database.');
      console.error('The gate must run against PROD data — local dev carries none.');
      process.exit(2);
    }
    console.error('usage: replay-contract-propagation.ts <legTaskId>... | --all [N]   (or REPLAY_ALL=N)');
    process.exit(1);
  }

  const rows = [];
  for (const id of ids) { const r = await replay(id); if (r) rows.push(r); }

  const measurable = rows.filter((r) => r.checked);
  const lossy = measurable.filter((r) => r.worst > 0);
  const anyContract = measurable.filter((r) => r.withContract > 0);
  console.log(`\n${'═'.repeat(74)}`);
  console.log(`legs measured        : ${measurable.length}`);
  console.log(`briefs LOST lines    : ${lossy.length}   (clean: ${measurable.length - lossy.length})`);
  console.log(`legs w/ any child holding the contract: ${anyContract.length}`);
  // The verdict is EXPECTATION-RELATIVE, and the expectation flipped when the fix shipped.
  // Until 2026-08-26 this printed a single pre-fix expectation, so once contract inheritance
  // worked it announced "DIVERGES — investigate before trusting the instrument" precisely when
  // the instrument was RIGHT and the fix was WORKING. A checker that cries wolf on success gets
  // ignored on failure, which is the whole failure mode this file exists to prevent.
  // `--pre-fix` reproduces the original 2026-08-26 gate for archived legs; the default is now
  // the POST-fix expectation, because that is the world every future caller lives in.
  const preFix = process.argv.includes('--pre-fix');
  if (preFix) {
    console.log(`\nGATE (plan 1.6, --pre-fix): the instrument must reproduce the hand measurement —`);
    console.log(`  expected pre-fix: EVERY measurable leg lossy, ZERO children holding the contract.`);
    const pass = measurable.length > 0 && lossy.length === measurable.length && anyContract.length === 0;
    console.log(pass ? '  ✅ REPRODUCED' : '  ⚠️  DIVERGES from the pre-fix hand measurement');
  } else {
    console.log(`\nGATE (post-fix, default since 2026-08-26): every child of a contract-bearing leg`);
    console.log(`  should HOLD the contract. Brief losses are expected and benign — the no-restate`);
    console.log(`  rule means a brief is not meant to carry the stanza; the structured channel is.`);
    const pass = measurable.length > 0 && anyContract.length === measurable.length;
    console.log(pass
      ? `  ✅ ALL ${measurable.length} measurable leg(s) have children holding the contract`
      : `  ⚠️  ${measurable.length - anyContract.length} of ${measurable.length} leg(s) have NO child holding the contract`);
    if (!preFix && lossy.length > 0) {
      console.log(`  (note: ${lossy.length} leg(s) have lossy briefs — informational post-fix, not a failure)`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('replay failed:', e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
