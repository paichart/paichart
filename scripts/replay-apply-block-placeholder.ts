#!/usr/bin/env ts-node
/**
 * replay-apply-block-placeholder.ts — run the SHIPPING `applyBlockPlaceholder` net over EVERY stored
 * `config_change_author` result.json and every leg report.md built from one, read-only, and name every mover.
 *
 *   DATABASE_URL=<read-only URL> npx ts-node -r tsconfig-paths/register scripts/replay-apply-block-placeholder.ts
 *
 * WHAT IT ANSWERS (PLACEHOLDER-GUARD-BUILD.md §3): had the net been live, which stored Author leaves would carry
 * `count > 0`, and which LEG report.md would gain the platform-warnings section? Expected on 2026-10-13: exactly the two
 * 07-15 terraform packages (cmrmjpdt1…, cmrmnhxhm…) and their two legs; every other Author `count: 0`; no report.md
 * changed otherwise. It imports the shipping registry entry (MECHANICAL_NETS) and the shipping render — never a copy.
 *
 * The stored finalResponse is ALREADY R10-redacted; the net re-applies R10 (idempotent on a placeholder), so a stored
 * text replays to the same answer the persist-time stamp would have given — except where R10 itself has changed since
 * the row was written, which the run reports as a mover like any other (read each one).
 *
 * SAFETY: run with a read-only session (`options=-c default_transaction_read_only=on`); the script refuses to start
 * unless a write is refused. Nothing is written. Recipe (the prod URL stays in this shell's memory, never on disk):
 *   RAW=$(ssh <prod> 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"')
 *   ssh -N -o ExitOnForwardFailure=yes -L 15434:localhost:5432 <prod> & TP=$!; sleep 3
 *   URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port="15434"; const q=u.search?"&":"?";
 *     console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW"); unset RAW
 *   DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/replay-apply-block-placeholder.ts; kill $TP
 * (the same method as replay-nets-byte-identity.sh; the prod checkout does not carry this script).
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';
import { appendApplyBlockPlaceholderSection } from '../lib/services/report-warnings-section';

const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$executeRawUnsafe('CREATE TEMP TABLE _ro_probe(x int)');
    console.error('✗ ABORT: the session is not read-only');
    process.exit(2);
  } catch (e) {
    if (!/read-only transaction/.test(String(e))) { console.error(`✗ ABORT: probe failed oddly: ${e}`); process.exit(2); }
  }
  const net = MECHANICAL_NETS.find((n) => n.name === 'applyBlockPlaceholder' && n.point === 'leaf-persist')!;

  // Every Author result.json (one row per execution; the authoritative choice is not needed to answer "would it stamp").
  const authors = await prisma.$queryRawUnsafe<Array<{ task_id: string; exec_id: string; started: Date; fr: string | null }>>(`
    SELECT c.id task_id, e.id exec_id, e."startTime" started, (a.content::jsonb)->>'finalResponse' fr
    FROM tasks c JOIN agent_executions e ON e."taskId" = c.id
    JOIN agent_artifacts a ON a."executionId" = e.id AND a.name = 'result.json' AND a.content LIKE '{%'
    WHERE c."agentRole" = 'config_change_author' ORDER BY e."startTime"`);

  const movers: Array<{ task: string; exec: string; started: string; fact: Record<string, unknown> }> = [];
  const byReason: Record<string, number> = {};
  let bytesMax = 0;
  let persistedMax = 0;
  for (const r of authors) {
    const ctx = { task: { id: r.task_id, type: 'ACTION', metadata: null, inputContext: null }, agentRole: 'config_change_author',
      finalResponse: r.fr } as never;
    if (!net.appliesTo(ctx)) throw new Error('appliesTo refused a config_change_author leaf');
    const fact = await net.enrich(ctx) as Record<string, unknown>;
    const key = fact.checked === true ? (Number(fact.count) > 0 ? 'checked, count > 0' : 'checked, count 0') : `checked:false ${fact.reason}`;
    byReason[key] = (byReason[key] ?? 0) + 1;
    bytesMax = Math.max(bytesMax, JSON.stringify(fact).length);
    // As persisted: the terminal persist pretty-prints with indent 2, the fact one level under the root object.
    persistedMax = Math.max(persistedMax, JSON.stringify({ applyBlockPlaceholder: fact }, null, 2).length - 4);
    if (Number(fact.count) > 0) movers.push({ task: r.task_id, exec: r.exec_id, started: r.started.toISOString(), fact });
  }
  const total = Object.values(byReason).reduce((a, b) => a + b, 0);
  console.log(`Author result.json rows: ${authors.length} (bucketed ${total})`);
  for (const [k, v] of Object.entries(byReason)) console.log(`  ${k}: ${v}`);
  if (total !== authors.length) { console.error('✗ bucket total does not equal the population'); process.exit(1); }
  console.log(`  largest fact: ${bytesMax} B compact, ${persistedMax} B as persisted (pretty-printed, in the result.json tail)`);
  console.log(`\nAuthor movers (count > 0): ${movers.length}`);
  for (const m of movers) console.log(`  ${m.task} exec ${m.exec} ${m.started.slice(0, 10)} ${JSON.stringify(m.fact)}`);

  // Leg report.md: every PIPELINE leg whose deliverable source is a config_change_author. Would the render append?
  const legs = await prisma.$queryRawUnsafe<Array<{ leg: string; src: string }>>(`
    SELECT p.id leg, p.metadata->>'deliverableSourceTaskId' src FROM tasks p
    JOIN tasks c ON c.id = p.metadata->>'deliverableSourceTaskId'
    WHERE p.type = 'PIPELINE' AND c."agentRole" = 'config_change_author'`);
  const factBySource = new Map<string, Record<string, unknown>>();
  for (const m of movers) factBySource.set(m.task, m.fact); // a task with several executions: any hit is a hit here
  let appended = 0;
  console.log(`\nLegs sourcing report.md from an Author: ${legs.length}`);
  for (const l of legs) {
    const r = appendApplyBlockPlaceholderSection('# report\n', factBySource.get(l.src), l.src);
    if (r.appended > 0) { appended++; console.log(`  report.md gains the section: leg ${l.leg} (source ${l.src})`); }
  }
  console.log(`  legs whose report.md changes: ${appended}; unchanged: ${legs.length - appended}`);
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
