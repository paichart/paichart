#!/usr/bin/env ts-node
/**
 * report-run-cost.ts — what a POV's agent runs cost, from stored token facts. READ-ONLY.
 *
 *   npm run report:run-cost -- <pov id>            # total + per model + per task (most expensive first)
 *   npm run report:run-cost -- <pov id> --tasks 50 # show more task rows (default 25)
 *
 * Cost is DERIVED here, never stored (Protocol 10): `costForExecution(tokens, model, date)` from the time-versioned pricing table
 * (lib/services/llm/model-pricing.ts), the same function the admin token-cost view uses. Two sources, never double-counted:
 *   • live `agent_executions` rows (per task — the breakdown below);
 *   • `TokenUsageDaily` for executions already pruned (PRUNE-ON-COMPLETE rolls a row up there BEFORE deleting it, so a row is in
 *     exactly one of the two). Pruned spend has no per-task breakdown: it is shown as one line per model.
 * Rows without token facts (before 2026-07-02, or no LLM call) and models with no pricing window are counted and shown as unpriced,
 * never guessed. A canary run in its own POV gives that run's cost exactly.
 *
 * Every query runs inside ONE transaction set READ ONLY. Point DATABASE_URL at production from the server (`cd current && source
 * .env.production`) or at a read-only connection.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { costForExecution } from '../lib/services/llm/model-pricing';

const povId = process.argv[2];
const taskRows = Number(process.argv[process.argv.indexOf('--tasks') + 1]) || 25;
if (!povId || povId.startsWith('-')) { console.error('usage: npm run report:run-cost -- <pov id> [--tasks N]'); process.exit(2); }

interface Exec { taskId: string; title: string; model: string | null; start: Date | null; created: Date; i: number | null; o: number | null; cr: number | null; cc: number | null }
interface Daily { model: string; day: Date; n: bigint; i: bigint; o: bigint; cr: bigint; cc: bigint }
const usd = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const prisma = new PrismaClient();
  try {
    const [pov, execs, daily] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const p = await tx.$queryRaw<Array<{ name: string }>>`SELECT title AS name FROM "POV" WHERE id = ${povId}`;
      const e = await tx.$queryRaw<Exec[]>`SELECT e."taskId", t.title, e."modelUsed" AS model, e."startTime" AS start, e."createdAt" AS created,
          e."inputTokens" AS i, e."outputTokens" AS o, e."cacheReadTokens" AS cr, e."cacheCreationTokens" AS cc
        FROM agent_executions e JOIN tasks t ON t.id = e."taskId" WHERE t.pov_id = ${povId}`;
      const d = await tx.$queryRaw<Daily[]>`SELECT "modelUsed" AS model, "bucketDate" AS day, executions AS n, "inputTokens" AS i, "outputTokens" AS o,
          "cacheReadTokens" AS cr, "cacheCreationTokens" AS cc FROM token_usage_daily WHERE "povId" = ${povId}`;
      return [p[0], e, d] as const;
    });
    if (!pov) { console.error(`no POV ${povId}`); process.exit(1); }

    let total = 0, unpriced = 0, noTokens = 0;
    const byModel = new Map<string, { n: number; usd: number }>(), byTask = new Map<string, { title: string; n: number; usd: number }>();
    const add = (model: string, n: number, c: number) => { const m = byModel.get(model) ?? { n: 0, usd: 0 }; m.n += n; m.usd += c; byModel.set(model, m); total += c; };
    for (const x of execs) {
      if (x.i == null && x.o == null) { noTokens++; continue; }
      const r = costForExecution({ inputTokens: x.i ?? 0, outputTokens: x.o ?? 0, cacheReadTokens: x.cr ?? 0, cacheCreationTokens: x.cc ?? 0 }, x.model, x.start ?? x.created);
      if (r.costUsd == null) { unpriced++; continue; }
      add(x.model ?? '__unknown__', 1, r.costUsd);
      const t = byTask.get(x.taskId) ?? { title: x.title, n: 0, usd: 0 }; t.n++; t.usd += r.costUsd; byTask.set(x.taskId, t);
    }
    let pruned = 0;
    for (const d of daily) {
      const r = costForExecution({ inputTokens: Number(d.i), outputTokens: Number(d.o), cacheReadTokens: Number(d.cr), cacheCreationTokens: Number(d.cc) }, d.model, d.day);
      if (r.costUsd == null) { unpriced += Number(d.n); continue; }
      add(`${d.model} (pruned)`, Number(d.n), r.costUsd); pruned += r.costUsd;
    }

    console.log(`POV ${povId} — ${pov.name}`);
    console.log(`  total ${usd(total)}  (${execs.length} live executions${pruned ? `, ${usd(pruned)} from pruned executions` : ''})`);
    if (noTokens) console.log(`  · ${noTokens} execution(s) carry no token facts (no LLM call, or recorded before token facts existed) — not counted`);
    if (unpriced) console.log(`  · ${unpriced} execution(s) on a model with no pricing window — not counted`);
    console.log('  by model:');
    [...byModel].sort((a, b) => b[1].usd - a[1].usd).forEach(([m, v]) => console.log(`    ${usd(v.usd).padStart(9)}  ${String(v.n).padStart(4)} exec  ${m}`));
    console.log(`  by task (top ${taskRows}):`);
    [...byTask].sort((a, b) => b[1].usd - a[1].usd).slice(0, taskRows).forEach(([id, v]) => console.log(`    ${usd(v.usd).padStart(9)}  ${String(v.n).padStart(3)} exec  ${id}  ${v.title.slice(0, 80)}`));
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
